// node tools/sim-smoke.mjs — the sim's self-check. Flies the start screen's
// bot in a tall and a wide sky and asserts the game is climbable, that every
// number stays finite, that a parked comet is safe, and that a comet nobody
// catches falls out of the sky.
import assert from 'node:assert/strict';
import { packFrame, unpackFrame, packHold, unpackHold, cleanEvent } from '../js/net/protocol.js';
import { createGame, step, seat, autopilot, score, metres, park, TICK } from '../js/sim.js';

const finite = (g) => [g.camY, g.top, ...g.comets.flatMap((c) => [c.x, c.y, c.vx, c.vy])].every(Number.isFinite);

for (const shape of [{ w: 600, view: 1100 }, { w: 1300, view: 720 }]) {
  const tops = [];
  for (let run = 0; run < 30; run++) {
    const g = createGame(shape);
    for (let i = 0; i < 60 * 120 && g.status !== 'over'; i++) {
      step(g, TICK, [autopilot(g)]);
      assert.ok(finite(g), 'a number went non-finite');
      assert.ok(g.stars.length < 200 && g.dust.length < 400, 'the sky is not being forgotten');
    }
    tops.push(metres(g));
  }
  tops.sort((a, b) => a - b);
  console.log(`w ${shape.w}: bot heights (m) min ${tops[0]} median ${tops[15]} max ${tops[29]}`);
  assert.ok(tops[15] > 150, 'the bot should usually climb past 150 m');
}

// Parked: nobody presses, nothing happens, for a minute.
let g = createGame();
for (let i = 0; i < 3600; i++) step(g, TICK, [false]);
assert.equal(g.status, 'parked');
assert.equal(score(g), 0, 'circling the first star scores nothing');

// One press and release, then hands off: the comet is lost and the run ends.
step(g, TICK, [true]);
for (let i = 0; i < 3600 && g.status !== 'over'; i++) step(g, TICK, [false]);
assert.equal(g.status, 'over');
assert.ok(g.events.some((e) => e.type === 'over'));

// A resume re-parks a tethered comet, so an unheld button does not fling it.
g = createGame();
step(g, TICK, [true]);
park(g);
step(g, TICK, [false]);
assert.ok(g.comets[0].tether && g.status === 'parked');
assert.ok(score(g) >= 0);

// Together: comet 0 flies with the bot, comet 1 never presses. When 0 is lost
// it comes back on 1's star instead of ending the run, and 1 is carried by
// nothing: once the sky creeps past its star, both are gone and the run ends.
g = createGame({ seats: [true, true] });
let outs = 0, joins = 0;
for (let i = 0; i < 60 * 600 && g.status !== 'over'; i++) {
  step(g, TICK, [autopilot(g), false]);
  for (const e of g.events) {
    if (e.type === 'out') outs++;
    if (e.type === 'join') joins++;
  }
  g.events.length = 0;
  assert.ok(finite(g), 'a number went non-finite, together');
}
assert.equal(g.status, 'over', 'a run with one idle comet still ends');
assert.ok(outs > 0 && joins > 0, 'a lost comet rejoins a friend');
assert.equal(g.comets[1].status, 'out');

// A seat taken mid-run arrives on the holder's star; leaving alone ends it.
g = createGame({ seats: [true, false, false, false] });
seat(g, 2, true);
for (let i = 0; i < 60; i++) step(g, TICK, [false, false, false, false]);
assert.equal(g.comets[2].status, 'parked');
assert.equal(g.comets[2].tether, g.comets[0].tether);
seat(g, 0, false);
assert.equal(g.status, 'parked', 'the other comet is still up');
seat(g, 2, false);
assert.equal(g.status, 'over');

// The wire: a sky mid-run survives the trip to a guest, to a sixteenth of a
// unit, with every tether pointing at the same star; rubbish is refused.
let big = 0;
for (const shape of [{ w: 600, view: 1300 }, { w: 1300, view: 720 }]) {
  g = createGame({ ...shape, seats: [true, true, false, true] });
  for (let i = 0; i < 60 * 40; i++) {
    step(g, TICK, [autopilot(g), i % 90 < 60, false, false]);
    g.events.length = 0;
    if (i % 20) continue;
    const bytes = packFrame(g, i + 1);
    big = Math.max(big, bytes.length);
    const f = unpackFrame(bytes);
    assert.ok(f, 'a packed frame unpacks');
    assert.equal(f.status, g.status);
    assert.equal(score(f), score(g));
    assert.ok(Math.abs(f.camY - g.camY) < 0.01);
    g.comets.forEach((c, k) => {
      const d = f.comets[k];
      assert.equal(d.status, c.status);
      assert.ok(Math.abs(d.x - c.x) < 0.01 && Math.abs(d.y - c.y) < 0.01);
      assert.equal(!!d.tether, !!c.tether);
      if (c.tether) assert.ok(Math.abs(d.tether.x - c.tether.x) < 0.1 && Math.abs(d.tether.y - c.tether.y) < 0.1 && d.tether.lit);
    });
  }
}
console.log(`largest frame ${big} bytes`);
assert.ok(big < 1150, 'a frame fits one packet');
assert.equal(unpackFrame(new Uint8Array(40)), null);
assert.equal(unpackFrame(packFrame(g, 1).slice(0, -1)), null);
assert.deepEqual(unpackHold(packHold(40000, true)), { seq: 40000, hold: true });
assert.equal(unpackHold(new Uint8Array([2, 0, 0])), null);
assert.equal(cleanEvent({ type: 'explode' }), null);
assert.equal(cleanEvent({ type: 'grab', who: 9, x: NaN }).who, null);
console.log('ok');
