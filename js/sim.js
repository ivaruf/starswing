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
 * Math.random throughout: no run needs to replay (hub §10).
 *
 * Checked by tools/sim-smoke.mjs, which flies `autopilot` — the same bot
 * that plays behind the start screen.
 */

export const TICK = 1 / 60;
export const REACH = 240; // how far a hold can catch a star from
export const ZONE = 2500; // units per zone: 250 m, a new colour and a harder sky
const G = 520; // gravity in free flight
const SWING = 460; // the speed a swing settles at
const RMIN = 46; // the tightest orbit
const WALL = 16;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createGame({ w = 600, view = 900 } = {}) {
  const first = { x: w / 2, y: view * 0.36, bx: w / 2, amp: 0, ph: 0, dark: false, lit: true };
  const g = {
    w, view,
    t: 0,
    status: 'parked', // parked | play | over
    comet: { x: first.x, y: first.y - 90, vx: SWING, vy: 0 },
    tether: first, last: null,
    r: 90, rT: 90, ang: -Math.PI / 2, dir: 1, speed: SWING,
    stars: [first], // bright and dark together, in rising order
    dust: [],
    genY: first.y,
    // Both lanes start from the first star and fan out to their own halves.
    lanes: w > 850 ? [{ x: first.x, lo: 70, hi: w / 2 - 40 }, { x: first.x, lo: w / 2 + 40, hi: w - 70 }] : [{ x: first.x, lo: 70, hi: w - 70 }],
    camY: 0, // the height at the bottom of the screen
    base: first.y + 90, top: 0, zone: 0,
    dustN: 0, grabs: 0, chain: 0, combo: 0, dustT: -9,
    events: [], // drained by main.js every frame
  };
  grow(g);
  // No dust inside the first swing: circling the first star scores nothing.
  g.dust = g.dust.filter((d) => d.y > g.base + 20);
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
    const dy = 140 + 12 * Math.min(z, 4) + rand(0, 50);
    const hx = rand(50, g.w - 50);
    let clear = z >= 1 && Math.random() < Math.min(0.5, 0.18 * z);
    const row = [];
    for (const lane of g.lanes) {
      const x = clamp(lane.x + rand(-260, 260), lane.lo, lane.hi);
      if (Math.abs(hx - x) < 130 || Math.abs(hx - lane.x) < 130 || Math.abs(hx - (x + lane.x) / 2) < 150) clear = false;
      const drift = z >= 2 && Math.random() < Math.min(0.5, 0.2 * (z - 1));
      row.push({ x, y: g.genY + dy, bx: x, amp: drift ? rand(40, 90) : 0, ph: rand(0, 6.28), dark: false, lit: false });
      // Dust, bowed a little off the straight line between the two stars.
      const bow = rand(-50, 50);
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

/* The star a hold would catch right now, or null. See the header. */
export function target(g) {
  const c = g.comet;
  let best = null, bd = REACH * REACH;
  let old = false;
  for (const s of g.stars) {
    if (s.dark) continue;
    const d = (s.x - c.x) * (s.x - c.x) + (s.y - c.y) * (s.y - c.y);
    if (d > REACH * REACH) continue;
    if (s === g.last) { old = true; continue; }
    if (d < bd) { bd = d; best = s; }
  }
  if (!best && old && c.vy <= 0) best = g.last;
  return best;
}

function die(g) {
  g.status = 'over';
  g.tether = null;
  g.events.push({ type: 'over', x: g.comet.x, y: g.comet.y });
}

/* Back to circling with nothing at stake, for a resume from the menu. */
export function park(g) {
  if (g.status === 'play' && g.tether) g.status = 'parked';
}

export function step(g, dt, hold) {
  g.t += dt;
  for (const s of g.stars) if (s.amp) s.x = s.bx + s.amp * Math.sin(g.t * 0.8 + s.ph);
  if (g.status === 'over') return;
  if (g.status === 'parked' && hold) g.status = 'play';
  const c = g.comet;

  if (g.tether && g.status === 'play' && !hold) {
    g.last = g.tether;
    g.tether = null;
    g.events.push({ type: 'release', x: c.x, y: c.y });
  } else if (!g.tether && hold) {
    const s = target(g);
    if (s) {
      const dx = c.x - s.x, dy = c.y - s.y;
      g.r = Math.hypot(dx, dy) || 1;
      g.rT = Math.max(g.r, RMIN);
      g.ang = Math.atan2(dy, dx);
      g.dir = dx * c.vy - dy * c.vx >= 0 ? 1 : -1; // keep turning the way it was going
      g.speed = Math.max(Math.hypot(c.vx, c.vy), 300);
      const fresh = !s.lit;
      g.chain = fresh ? g.chain + 1 : 0;
      if (fresh) g.grabs++;
      s.lit = true;
      g.tether = s;
      g.events.push({ type: 'grab', x: s.x, y: s.y, fresh, chain: g.chain });
    }
  }

  if (g.tether) {
    const s = g.tether;
    g.speed += clamp(SWING - g.speed, -500 * dt, 500 * dt);
    g.r += clamp(g.rT - g.r, -200 * dt, 200 * dt);
    g.ang += (g.dir * g.speed * dt) / g.r;
    const cs = Math.cos(g.ang), sn = Math.sin(g.ang);
    c.x = s.x + g.r * cs;
    c.y = s.y + g.r * sn;
    c.vx = -sn * g.dir * g.speed;
    c.vy = cs * g.dir * g.speed;
  } else {
    c.vy -= G * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    if (c.x < WALL) { c.x = WALL; c.vx = Math.abs(c.vx) * 0.8; g.events.push({ type: 'wall', x: c.x, y: c.y }); }
    else if (c.x > g.w - WALL) { c.x = g.w - WALL; c.vx = -Math.abs(c.vx) * 0.8; g.events.push({ type: 'wall', x: c.x, y: c.y }); }
  }

  for (const d of g.dust) {
    if (d.taken || Math.abs(d.y - c.y) > 30 || Math.abs(d.x - c.x) > 30) continue;
    d.taken = true;
    g.dustN++;
    g.combo = g.t - g.dustT < 1.2 ? g.combo + 1 : 0;
    g.dustT = g.t;
    g.events.push({ type: 'dust', x: d.x, y: d.y, combo: g.combo });
  }
  if (g.status === 'play') {
    for (const s of g.stars) {
      if (s.dark && Math.hypot(s.x - c.x, s.y - c.y) < 30) return die(g);
    }
  }

  if (c.y > g.top) {
    g.top = c.y;
    const z = Math.floor((g.top - g.base) / ZONE);
    if (z > g.zone) {
      g.zone = z;
      g.events.push({ type: 'zone', n: z, x: c.x, y: c.y });
    }
  }
  // The comet rides this far above the bottom edge: room to fall and be caught.
  const want = c.y - Math.min(g.view * 0.45, 420);
  if (want > g.camY) g.camY += (want - g.camY) * Math.min(1, 6 * dt);
  if (g.status === 'play') {
    g.camY += (10 + 5 * Math.min(g.zone, 6)) * dt; // the sky creeps: climb, or be left behind
    // Lost: out of the bottom in free flight, or holding a star that has
    // itself gone under. A swing that only dips below the edge is safe.
    if (g.tether ? g.tether.y < g.camY - 20 : c.y < g.camY - 30) return die(g);
  }

  // Forget what has scrolled away. A tethered star is never that far down.
  while (g.stars.length && g.stars[0].y < g.camY - 320 && g.stars[0] !== g.tether) g.stars.shift();
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
  const c = g.comet;
  if (g.status === 'parked') return true;
  if (!g.tether) return target(g) !== null;
  if (c.vy <= 0) return true;
  let aim = null, ad = Infinity;
  for (const s of g.stars) {
    if (s.dark || s === g.tether || s.y < g.tether.y + 30) continue;
    const d = Math.hypot(s.x - g.tether.x, s.y - g.tether.y);
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
