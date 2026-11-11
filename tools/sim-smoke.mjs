// node tools/sim-smoke.mjs — the sim's self-check. Flies the start screen's
// bot in a tall and a wide sky and asserts the game is climbable, that every
// number stays finite, that a parked comet is safe, and that a comet nobody
// catches falls out of the sky.
import assert from 'node:assert/strict';
import { createGame, step, autopilot, score, metres, park, TICK } from '../js/sim.js';

const finite = (g) => [g.comet.x, g.comet.y, g.comet.vx, g.comet.vy, g.camY, g.top].every(Number.isFinite);

for (const shape of [{ w: 600, view: 1100 }, { w: 1300, view: 720 }]) {
  const tops = [];
  for (let run = 0; run < 30; run++) {
    const g = createGame(shape);
    for (let i = 0; i < 60 * 120 && g.status !== 'over'; i++) {
      step(g, TICK, autopilot(g));
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
for (let i = 0; i < 3600; i++) step(g, TICK, false);
assert.equal(g.status, 'parked');
assert.equal(score(g), 0, 'circling the first star scores nothing');

// One press and release, then hands off: the comet is lost and the run ends.
step(g, TICK, true);
for (let i = 0; i < 3600 && g.status !== 'over'; i++) step(g, TICK, false);
assert.equal(g.status, 'over');
assert.ok(g.events.some((e) => e.type === 'over'));

// A resume re-parks a tethered comet, so an unheld button does not fling it.
g = createGame();
step(g, TICK, true);
park(g);
step(g, TICK, false);
assert.ok(g.tether && g.status === 'parked');
assert.ok(score(g) >= 0);
console.log('ok');
