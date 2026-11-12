/*
 * host-worker.js — the host's simulation, off the page.
 *
 * geometry_pong's shape (its js/net/host-worker.js). A browser throttles
 * setInterval hard in a backgrounded tab — fishtank measured 3 snapshots
 * against 62 over the same fifteen seconds — so a host who looks at another
 * tab would freeze the sky for everybody. Worker timers are not throttled
 * the same way.
 *
 * js/sim.js has no DOM in it, so the worker owns one game and nothing else.
 * It never sees a data channel or a peer: the page tells it which seats are
 * taken and whose button is down, and takes back one packed frame per seat
 * per tick (60 a second) with that seat's events: the same frame for every
 * seat together, each seat its own sky in a race (sim.js RACE).
 */

import { createGame, createRace, step, stepRace, seat, TICK, SEATS } from '../sim.js';
import { packFrame } from './protocol.js';

let game = null;
let race = null;
let ticker = null;
let last = 0;
let acc = 0;
/* Monotonic for the whole session, never reset by a new run: the guest drops
 * anything not newer, and a counter that resets would stall it there. */
let frameNo = 0;
const holds = new Array(SEATS).fill(false);

function tick() {
  frameNo++;
  if (race) {
    stepRace(race, TICK, holds);
    const bytes = race.views.map((v) => packFrame(v, frameNo));
    const events = race.games.map((g) => g.events.splice(0));
    postMessage({ type: 'FRAME', bytes, events }, bytes.map((b) => b.buffer));
    return;
  }
  step(game, TICK, holds);
  const events = game.events;
  game.events = [];
  const bytes = packFrame(game, frameNo);
  // One frame for everyone; the clone keeps the four references one buffer.
  postMessage({ type: 'FRAME', bytes: new Array(SEATS).fill(bytes), events: new Array(SEATS).fill(events) }, [bytes.buffer]);
}

/* Real elapsed time, not a count of intervals, and at most eight ticks a
 * wake-up: a worker descheduled for a moment catches up, one gone for a
 * second does not burst a second of play into one frame. */
function pump() {
  if (!game && !race) return;
  const now = performance.now();
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  let steps = 0;
  while (acc >= TICK && steps < 8) {
    tick();
    acc -= TICK;
    steps++;
  }
  if (steps === 8) acc = 0;
}

onmessage = ({ data }) => {
  switch (data.type) {
    // A run: new, or again, with whoever is seated now.
    case 'SETUP':
      race = data.race ? createRace({ w: data.w, view: data.view, seats: data.seats }) : null;
      game = race ? null : createGame({ w: data.w, view: data.view, seats: data.seats });
      holds.fill(false);
      last = performance.now();
      acc = 0;
      if (!ticker) ticker = setInterval(pump, 1000 / 120);
      break;
    case 'SEAT':
      if (race) seat(race.games[data.seat], 0, !!data.on);
      else if (game) seat(game, data.seat, !!data.on);
      holds[data.seat] = false;
      break;
    case 'HOLD':
      if (data.seat >= 0 && data.seat < SEATS) holds[data.seat] = data.hold === true;
      break;
    case 'STOP':
      if (ticker) clearInterval(ticker);
      ticker = null;
      game = race = null;
      break;
    default:
      break;
  }
};
