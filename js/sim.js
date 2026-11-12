/*
 * sim.js — the whole game, with no DOM in it: a comet, a sky of stars, and
 * one button.
 *
 * HOLD and the comet is tied to a star and swings round it at the end of a
 * beam of light. LET GO and it flies off along the tangent, and gravity
 * takes it. Hold again near another star to catch that one. The sky scrolls
 * up and never down, and slowly creeps on its own, so the only way to stay
 * in it is to keep climbing. Falling out of the bottom, or touching a dark
 * star, ends the run.
 *
 * WORLD UNITS. x runs 0..w, y is HEIGHT and grows upward; 10 units are one
 * metre on the HUD. The field's w and the visible height `view` are chosen
 * once per run from the screen's shape (js/render.js `shape`), so a sideways
 * phone gets a wide sky instead of a narrow one drawn small.
 *
 * WHICH STAR A HOLD CATCHES (`target`). The nearest star in REACH, but never
 * the one just left while the comet is still rising: a child holds early,
 * and catching the old star again the instant they do would look like the
 * button did nothing. Once the comet is falling the old star is a rescue.
 *
 * PARKED. A run begins, and resumes from the menu, with the comet circling
 * a star and nothing at stake: no creep, no release. The first press makes
 * it live; letting go of THAT press is the first fling. It is what stops a
 * resume from flinging a comet whose button was let go while paused.
 *
 * TOGETHER. A sky holds up to SEATS comets, one per player, and they share
 * it: one camera on whoever is highest, one score. A comet that is lost while
 * a friend is still up is not out of the run: a second later it is back,
 * circling the star a survivor is holding (or the next one they catch),
 * PARKED until its own player presses. The run ends when nobody is left. A
 * seat taken mid-run (online, `seat`) comes in the same way, and so does the
 * laggard the camera leaves behind, which is what keeps everyone in one
 * picture. With one comet every rule here is the solo game it was.
 *
 * RACE (createRace, stepRace). Up to SEATS players against each other and a
 * clock: a COUNT-second countdown, then RACE seconds, and the highest climb
 * wins. Each player flies a game of their own, with its own camera, creep and
 * dust, but every one of those skies is grown from ONE SEED, so the stars are
 * the same for everyone and the race is fair. Lives never run out: a comet
 * that is lost goes back to the star it fell off, parked, while the camera
 * walks back down to it, and the RESPAWN seconds that takes are what a fall
 * costs. `views[i]` is game i seen with everyone's comets in it, the others
 * as ghosts (js/render.js), which is also exactly what goes on the wire.
 *
 * g.status is 'parked' while no comet is in play (no creep), 'play', 'over'.
 * A comet's own status is 'none' (empty seat), 'parked', 'play' or 'out'.
 *
 * Math.random, except a race's sky, which is seeded because every player
 * must get the same one (hub §10).
 *
 * Checked by tools/sim-smoke.mjs, which flies `autopilot` — the same bot
 * that plays behind the start screen.
 */

export const TICK = 1 / 60;
export const REACH = 240; // how far a hold can catch a star from
export const SEATS = 4;
export const ZONE = 2500; // units per zone: 250 m, a new colour and a harder sky
export const RACE = 90; // seconds on a race's clock
const COUNT = 3; // the countdown before it
const RESPAWN = 2; // seconds a lost comet waits in a race: the price of a fall
const G = 520; // gravity in free flight
const SWING = 460; // the speed a swing settles at
const RMIN = 46; // the tightest orbit
const WALL = 16;

const rand = (g, a, b) => a + g.rnd() * (b - a);

/* mulberry32: one seed, the same sky on every device and in every column. */
function seeded(s) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const alive = (c) => c.status === 'parked' || c.status === 'play';

/* `seats`: which seats hold a comet, e.g. [true] solo, [true, true] for two.
 * `seed` grows the sky from a seed, `respawn` brings a lost comet back on its
 * own star instead of a friend's: both are a race's (see the header). */
export function createGame({ w = 600, view = 900, seats = [true], seed = 0, respawn = false } = {}) {
  const first = { x: w / 2, y: view * 0.36, bx: w / 2, amp: 0, ph: 0, dark: false, lit: true };
  const n = seats.filter(Boolean).length || 1;
  let k = 0;
  const g = {
    w, view,
    t: 0,
    rnd: seed ? seeded(seed) : Math.random,
    respawn,
    status: 'parked', // parked | play | over
    // Everyone starts on the first star, spread evenly round its orbit.
    comets: seats.map((on) => {
      const ang = -Math.PI / 2 + (on ? (k++ * 2 * Math.PI) / n : 0);
      return {
        status: on ? 'parked' : 'none',
        x: first.x + 90 * Math.cos(ang), y: first.y + 90 * Math.sin(ang), vx: 0, vy: 0,
        tether: on ? first : null, last: null,
        r: 90, rT: 90, ang, dir: 1, speed: SWING, chain: 0, wait: 0,
      };
    }),
    stars: [first], // bright and dark together, in rising order
    dust: [],
    genY: first.y,
    // Both lanes start from the first star and fan out to their own halves.
    lanes: w > 850 ? [{ x: first.x, lo: 70, hi: w / 2 - 40 }, { x: first.x, lo: w / 2 + 40, hi: w - 70 }] : [{ x: first.x, lo: 70, hi: w - 70 }],
    camY: 0, // the height at the bottom of the screen
    base: first.y + 90, top: 0, zone: 0,
    dustN: 0, grabs: 0, combo: 0, dustT: -9,
    events: [], // drained by main.js every frame
  };
  grow(g);
  // No dust inside the first swing: circling the first star scores nothing.
  g.dust = g.dust.filter((d) => d.y > g.base + 35); // 30 is the reach of a pick-up
  return g;
}

/* Metres climbed above the top of the first swing, and the points they make. */
export const metres = (g) => Math.max(0, Math.floor((g.top - g.base) / 10));
export const score = (g) => metres(g) + g.dustN * 5;

/*
 * The sky ahead, a row at a time. Each LANE is a chain of bright stars of its
 * own, every hop of it within reach, with dust on the way: one lane in an
 * upright sky, two side by side in a wide one, so a wide sky has two ways up
 * and neither is a dead end. Further up come dark stars, set clear of every
 * hop in the row, and stars that drift.
 */
function grow(g) {
  while (g.genY < g.camY + g.view + 500) {
    const z = Math.max(0, Math.floor((g.genY - g.base) / ZONE));
    const dy = 140 + 12 * Math.min(z, 4) + rand(g, 0, 50);
    const hx = rand(g, 50, g.w - 50);
    let clear = z >= 1 && g.rnd() < Math.min(0.5, 0.18 * z);
    const row = [];
    for (const lane of g.lanes) {
      const x = clamp(lane.x + rand(g, -260, 260), lane.lo, lane.hi);
      if (Math.abs(hx - x) < 130 || Math.abs(hx - lane.x) < 130 || Math.abs(hx - (x + lane.x) / 2) < 150) clear = false;
      const drift = z >= 2 && g.rnd() < Math.min(0.5, 0.2 * (z - 1));
      row.push({ x, y: g.genY + dy, bx: x, amp: drift ? rand(g, 40, 90) : 0, ph: rand(g, 0, 6.28), dark: false, lit: false });
      // Dust, bowed a little off the straight line between the two stars.
      const bow = rand(g, -50, 50);
      for (let i = 1; i <= 3; i++) {
        const f = i / 4;
        g.dust.push({ x: lane.x + (x - lane.x) * f + bow * Math.sin(f * Math.PI), y: g.genY + dy * f, taken: false });
      }
      lane.x = x;
    }
    if (clear) g.stars.push({ x: hx, y: g.genY + dy / 2, bx: hx, amp: 0, ph: 0, dark: true, lit: false });
    for (const st of row) g.stars.push(st);
    g.genY += dy;
  }
}

/* The star a hold would catch for comet `c` right now, or null. See the header. */
export function target(g, c = g.comets[0]) {
  let best = null, bd = REACH * REACH;
  let old = false;
  for (const s of g.stars) {
    if (s.dark) continue;
    const d = (s.x - c.x) * (s.x - c.x) + (s.y - c.y) * (s.y - c.y);
    if (d > REACH * REACH) continue;
    if (s === c.last) { old = true; continue; }
    if (d < bd) { bd = d; best = s; }
  }
  if (!best && old && c.vy <= 0) best = c.last;
  return best;
}

/* Comet `who` is lost: out for a moment if a friend is still up (or, racing,
 * always), else the end. Racing, `last` becomes the star it comes back on. */
function die(g, c, who) {
  c.status = 'out';
  if (g.respawn) c.last = c.tether || c.last;
  c.tether = null;
  c.wait = g.respawn ? RESPAWN : 1;
  settle(g, { who, x: c.x, y: c.y });
}

function settle(g, e) {
  if (g.status === 'over') return;
  const left = g.respawn || g.comets.some(alive);
  if (!left) g.status = 'over';
  g.events.push({ type: left ? 'out' : 'over', ...e });
}

/* An out comet comes back on the highest star a friend is holding, parked. */
function rejoin(g, c, who) {
  let host = null;
  for (const o of g.comets) {
    if (alive(o) && o.tether && (!host || o.tether.y > host.tether.y)) host = o;
  }
  if (!host) return;
  const j = g.comets.indexOf(host);
  c.dir = host.dir;
  // A quarter turn per seat apart, so two that come back together do not overlap.
  c.ang = host.ang + ((who - j + SEATS) % SEATS) * (Math.PI / 2);
  land(g, c, who, host.tether);
}

function land(g, c, who, s) {
  c.status = 'parked';
  c.tether = s;
  c.last = null;
  c.r = c.rT = 90;
  c.speed = SWING;
  c.chain = 0;
  g.events.push({ type: 'join', who, x: s.x, y: s.y });
}

/* A seat taken or left mid-run (online). A new comet arrives like a lost one. */
export function seat(g, who, on) {
  const c = g.comets[who];
  if (!c || on === (c.status !== 'none')) return;
  c.tether = null;
  if (on) {
    c.status = 'out';
    c.wait = 0.5;
  } else {
    const was = alive(c);
    c.status = 'none';
    if (was) settle(g, { who, x: c.x, y: c.y });
  }
}

/* Back to circling with nothing at stake, for a resume from the menu. */
export function park(g) {
  for (const c of g.comets) if (c.status === 'play' && c.tether) c.status = 'parked';
}

/* One tick. `holds[i]` is whether comet i's button is down. */
export function step(g, dt, holds) {
  g.t += dt;
  for (const s of g.stars) if (s.amp) s.x = s.bx + s.amp * Math.sin(g.t * 0.8 + s.ph);
  if (g.status === 'over') return;

  for (let who = 0; who < g.comets.length; who++) {
    const c = g.comets[who];
    const hold = !!holds[who];
    if (c.status === 'none') continue;
    if (c.status === 'out') {
      if (g.respawn) {
        // Racing: the camera walks back down to the star it fell off (a seat
        // that never flew has none, and starts on the first star).
        const s = c.last || g.stars[0];
        g.camY += (s.y - Math.min(g.view * 0.45, 420) - g.camY) * Math.min(1, 4 * dt);
        if ((c.wait -= dt) <= 0) land(g, c, who, s);
      } else if ((c.wait -= dt) <= 0) rejoin(g, c, who);
      continue;
    }
    if (c.status === 'parked' && hold) c.status = 'play';

    if (c.tether && c.status === 'play' && !hold) {
      c.last = c.tether;
      c.tether = null;
      g.events.push({ type: 'release', who, x: c.x, y: c.y });
    } else if (!c.tether && hold) {
      const s = target(g, c);
      if (s) {
        const dx = c.x - s.x, dy = c.y - s.y;
        c.r = Math.hypot(dx, dy) || 1;
        c.rT = Math.max(c.r, RMIN);
        c.ang = Math.atan2(dy, dx);
        c.dir = dx * c.vy - dy * c.vx >= 0 ? 1 : -1; // keep turning the way it was going
        c.speed = Math.max(Math.hypot(c.vx, c.vy), 300);
        const fresh = !s.lit;
        c.chain = fresh ? c.chain + 1 : 0;
        if (fresh) g.grabs++;
        s.lit = true;
        c.tether = s;
        g.events.push({ type: 'grab', who, x: s.x, y: s.y, fresh, chain: c.chain });
      }
    }

    if (c.tether) {
      const s = c.tether;
      c.speed += clamp(SWING - c.speed, -500 * dt, 500 * dt);
      c.r += clamp(c.rT - c.r, -200 * dt, 200 * dt);
      c.ang += (c.dir * c.speed * dt) / c.r;
      const cs = Math.cos(c.ang), sn = Math.sin(c.ang);
      c.x = s.x + c.r * cs;
      c.y = s.y + c.r * sn;
      c.vx = -sn * c.dir * c.speed;
      c.vy = cs * c.dir * c.speed;
    } else {
      c.vy -= G * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.x < WALL) { c.x = WALL; c.vx = Math.abs(c.vx) * 0.8; g.events.push({ type: 'wall', who, x: c.x, y: c.y }); }
      else if (c.x > g.w - WALL) { c.x = g.w - WALL; c.vx = -Math.abs(c.vx) * 0.8; g.events.push({ type: 'wall', who, x: c.x, y: c.y }); }
    }

    for (const d of g.dust) {
      if (d.taken || Math.abs(d.y - c.y) > 30 || Math.abs(d.x - c.x) > 30) continue;
      d.taken = true;
      g.dustN++;
      g.combo = g.t - g.dustT < 1.2 ? g.combo + 1 : 0;
      g.dustT = g.t;
      g.events.push({ type: 'dust', who, x: d.x, y: d.y, combo: g.combo });
    }
    if (c.status === 'play') {
      let hit = false;
      for (const s of g.stars) if (s.dark && Math.hypot(s.x - c.x, s.y - c.y) < 30) hit = true;
      if (hit) {
        die(g, c, who);
        if (g.status === 'over') return;
      }
    }
  }

  // The camera and the height belong to whoever is highest.
  let lead = null;
  for (const c of g.comets) if (alive(c) && (!lead || c.y > lead.y)) lead = c;
  g.status = g.comets.some((c) => c.status === 'play') ? 'play' : 'parked';
  if (lead) {
    if (lead.y > g.top) {
      g.top = lead.y;
      const z = Math.floor((g.top - g.base) / ZONE);
      if (z > g.zone) {
        g.zone = z;
        g.events.push({ type: 'zone', n: z, x: lead.x, y: lead.y });
      }
    }
    // The comet rides this far above the bottom edge: room to fall and be caught.
    const want = lead.y - Math.min(g.view * 0.45, 420);
    if (want > g.camY) g.camY += (want - g.camY) * Math.min(1, 6 * dt);
  }
  if (g.status === 'play') g.camY += (10 + 5 * Math.min(g.zone, 6)) * dt; // the sky creeps: climb, or be left behind
  // Lost: out of the bottom in free flight, or holding a star that has
  // itself gone under. A swing that only dips below the edge is safe. With
  // nobody in play the camera is still, so a parked comet is never lost alone.
  for (let who = 0; who < g.comets.length; who++) {
    const c = g.comets[who];
    if (!alive(c)) continue;
    if (c.tether ? c.tether.y < g.camY - 20 : c.y < g.camY - 30) {
      die(g, c, who);
      if (g.status === 'over') return;
    }
  }

  // Forget what has scrolled away, but never a star a comet holds or last
  // left: a racer comes back on that one.
  while (g.stars.length && g.stars[0].y < g.camY - 320 && !g.comets.some((c) => c.tether === g.stars[0] || c.last === g.stars[0])) g.stars.shift();
  while (g.dust.length && g.dust[0].y < g.camY - 60) g.dust.shift();
  grow(g);
}

/*
 * The bot: hold or not, for one step. It lets go when a free flight from
 * here would pass close to the next star up, and holds whenever there is a
 * star to catch. It does not see dark stars, so it dies now and then, which
 * is what the start screen wants to show.
 */
export function autopilot(g) {
  const c = g.comets[0];
  if (c.status === 'parked') return true;
  if (!c.tether) return target(g, c) !== null;
  if (c.vy <= 0) return true;
  let aim = null, ad = Infinity;
  for (const s of g.stars) {
    if (s.dark || s === c.tether || s.y < c.tether.y + 30) continue;
    const d = Math.hypot(s.x - c.tether.x, s.y - c.tether.y);
    if (d < ad) { ad = d; aim = s; }
  }
  if (!aim) return true;
  let x = c.x, y = c.y, vy = c.vy;
  for (let i = 0; i < 45; i++) {
    vy -= G * 0.03;
    x += c.vx * 0.03;
    y += vy * 0.03;
    if (x < WALL || x > g.w - WALL) break;
    if (Math.hypot(aim.x - x, aim.y - y) < 110) return false;
  }
  return true;
}

/*
 * A race (see the header): one game per seat, all from one seed. `seats` as
 * createGame's: locally one per player, online always SEATS so that a guest
 * who arrives mid-race has a sky waiting, in step with everyone else's.
 */
export function createRace({ w, view, seats }) {
  const seed = 1 + Math.floor(Math.random() * 0x7ffffffe);
  const games = seats.map((on) => createGame({ w, view, seats: [on], seed, respawn: true }));
  const comets = games.map((g) => g.comets[0]);
  // Shared and updated in place by stepRace, so every view reads it live.
  const info = { left: RACE + COUNT, metres: games.map(() => 0) };
  // Game i with everyone's comets in it: prototype reads keep it live.
  const views = games.map((g) => Object.create(g, { comets: { value: comets }, race: { value: info } }));
  return { games, views, info, t: -COUNT, status: 'play' };
}

const one = [false];

/* One tick of every game. Events keep to their own game, with `who` set to
 * the seat. The clock running out ends every game with an 'over'. */
export function stepRace(r, dt, holds) {
  r.t += dt;
  const end = r.status === 'play' && r.t >= RACE;
  for (let i = 0; i < r.games.length; i++) {
    const g = r.games[i];
    one[0] = r.t > 0 && !!holds[i]; // nobody leaves before the countdown does
    step(g, dt, one);
    if (end && g.status !== 'over') {
      g.status = 'over';
      g.events.push({ type: 'over', x: g.comets[0].x, y: g.comets[0].y });
    }
    for (const e of g.events) e.who = i;
    r.info.metres[i] = metres(g);
  }
  if (end) r.status = 'over';
  r.info.left = Math.max(0, RACE - r.t);
}
