/*
 * main.js — the glue: the fixed-timestep loop, the buttons, and which state
 * the game is in.
 *
 *   attract  the start screen (and the Online lobby). The sim's bot swings
 *            up the sky behind it.
 *   play     a run.
 *   paused   the menu panel is open over a run. Alone or on one shared
 *            screen that stops it, and resuming re-parks every comet that is
 *            on a star (sim.js), so nothing is flung by a resume. Online it
 *            does not stop (hub §2): the panel shows its live face and the
 *            sky and your button carry on behind it.
 *   over     nobody is left; the sky keeps moving and the card follows.
 *
 * THREE WAYS TO PLAY (`mode`), one sim (sim.js, TOGETHER):
 *   solo   one comet. Hold = a finger or the mouse anywhere, or Space / ↑.
 *   local  2 to 4 comets on this screen. The glass is cut into one upright
 *          strip per player, left to right, and a finger in a strip is that
 *          player's button; on a keyboard each has a key (KEYS), in the same
 *          left-to-right order.
 *   net    one comet per device (js/net/, docs/P2P.md). Nothing here steps a
 *          sim: the sky is the session's newest frame from the host, this
 *          device's button goes up each screen frame, and sounds and sparks
 *          come from the host's relayed events.
 *
 * TOGETHER OR A RACE, whichever the start screen's Mode row says (the room's,
 * online). A race on this device (`race`, sim.js RACE) is one sim per player
 * and one renderer per player, each drawing a column of the glass, which is
 * the same strip that player's finger already owns. Online a race is the
 * host's: this device draws its own seat's sky, as ever.
 *
 * THE LOOP. sim.js's 60 Hz TICK with an accumulator, frame dt clamped to
 * 0.1 s and at most 8 steps a frame (hub §10).
 *
 * ESCAPE, in one place (hub §2), auto-repeat ignored:
 *   play                         open the menu (and pause, unless online)
 *   Pause face open              close it, the run carries on
 *   Settings face open           its Back
 *   over                         the card's secondary button: Main menu, or
 *                                online Back, to the room
 *   the Online card              its Back: one step (js/lobby.js)
 *   start screen, nothing open   the Back to arcade button, when shown
 *
 * The best score is `starswing.best.v1`, a number (hub §6), and is the solo
 * game's alone: a height climbed together is not compared with it.
 */

import { createGame, createRace, step, stepRace, autopilot, park, score, metres, TICK } from './sim.js';
import { createRenderer, shape } from './render.js';
import { createUI } from './ui.js';
import { createLobby } from './lobby.js';
import { audio } from './audio.js';

const BEST_KEY = 'starswing.best.v1';
const canvas = document.getElementById('view');
const renderers = [createRenderer(canvas)]; // one per column in a race on this screen
const renderer = renderers[0];

let best = 0;
try {
  const v = Number(localStorage.getItem(BEST_KEY));
  if (Number.isFinite(v) && v > 0) best = Math.floor(v);
} catch {
  /* no storage: the best is this visit's */
}

let state = 'attract';
let mode = 'solo';
let players = 1;
let racing = false; // the start screen's Mode row
let net = null; // the online session whose run is in the sky
let race = null; // a race on this device; `game` is unused while there is one
let game = createGame(shape());
let acc = 0;
let rest = 0;
let overTimer = 0;

// The buttons, one per seat. Pointers are counted, so a second finger in the
// same strip does not let go; each remembers the seat it went down in.
const KEYS = { 2: ['KeyQ', 'KeyP'], 3: ['KeyQ', 'KeyB', 'KeyP'], 4: ['KeyQ', 'KeyC', 'KeyM', 'KeyP'] };
const KEY_NAMES = { 2: ['Q', 'P'], 3: ['Q', 'B', 'P'], 4: ['Q', 'C', 'M', 'P'] }; // as drawn in each strip
const touch = matchMedia('(pointer: coarse)').matches; // no key names on a tablet
const pointers = new Map();
const fingers = [0, 0, 0, 0];
const keys = [false, false, false, false];
const holds = [false, false, false, false];
const NONE = [false, false, false, false];
const bot = [false];

function clearInput() {
  pointers.clear();
  fingers.fill(0);
  keys.fill(false);
}
canvas.addEventListener('pointerdown', (e) => {
  const seat = mode === 'local' ? Math.min(players - 1, Math.max(0, Math.floor((e.clientX / innerWidth) * players))) : 0;
  if (!pointers.has(e.pointerId)) fingers[seat]++;
  pointers.set(e.pointerId, seat);
  e.preventDefault();
});
for (const type of ['pointerup', 'pointercancel']) {
  addEventListener(type, (e) => {
    const seat = pointers.get(e.pointerId);
    if (seat === undefined) return;
    pointers.delete(e.pointerId);
    fingers[seat]--;
  });
}
addEventListener('blur', clearInput);
const seatOfKey = (e) => (mode === 'local' ? KEYS[players].indexOf(e.code) : e.code === 'Space' || e.code === 'ArrowUp' ? 0 : -1);
// Online the button works behind the open menu too: that run has not stopped.
const live = () => state === 'play' || (state === 'paused' && net);
addEventListener('keydown', (e) => {
  const seat = seatOfKey(e);
  if (seat < 0 || !live()) return;
  // The key is the game's now: not also a click on whichever plate has focus.
  e.preventDefault();
  if (state === 'play' && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  keys[seat] = true;
});
addEventListener('keyup', (e) => {
  const seat = seatOfKey(e);
  if (seat >= 0) keys[seat] = false;
});

function startAttract() {
  state = 'attract';
  mode = 'solo';
  net = null;
  race = null;
  clearTimeout(overTimer);
  audio.music(false);
  game = createGame(shape());
  renderer.reset();
  rest = 0;
}

function begin() {
  clearTimeout(overTimer);
  for (const r of renderers) r.reset();
  clearInput();
  state = 'play';
  acc = 0;
  ui.hideCards();
  audio.music(true);
}

/* A run on this device: alone, or `players` comets sharing the screen,
 * together or racing in a column each. */
function startGame() {
  net = null;
  mode = players > 1 ? 'local' : 'solo';
  const seats = new Array(players).fill(true);
  race = racing ? createRace({ ...shape(innerWidth / players, innerHeight), seats }) : null;
  if (!race) game = createGame({ ...shape(), seats });
  while (renderers.length < players) renderers.push(createRenderer(canvas));
  begin();
}

/* A run in the room: the sky is whatever the host's next frame says. */
function startOnline(session) {
  net = session;
  mode = 'net';
  race = null;
  begin();
}

function pause() {
  if (state !== 'play') return;
  state = 'paused';
  if (net) {
    // The room's run carries on; only the panel opens (hub §2).
    ui.showPause({ live: true, canRestart: !!net.startMatch });
    return;
  }
  audio.music(false);
  ui.showPause();
}

function resume() {
  if (state !== 'paused') return;
  if (race) race.games.forEach(park);
  else if (!net) park(game);
  state = 'play';
  acc = 0;
  ui.hideCards();
  audio.music(true);
}

function mainMenu() {
  if (net) lobby.leave();
  startAttract();
  ui.showStart();
}

/* Online, the over card's way back: to the room, with everyone still in it.
 * A host takes the room with it; a guest goes alone and is pulled back in
 * when the host starts again. */
function backToRoom() {
  const s = net;
  if (s && s.toLobby) s.toLobby();
  startAttract();
  lobby.showRoom();
}

/* A race's seats that raced, highest first. */
function standings(g) {
  const list = [];
  g.comets.forEach((c, seat) => c.status !== 'none' && list.push({ seat, m: g.race.metres[seat] }));
  return list.sort((a, b) => b.m - a.m);
}

function gameOver() {
  state = 'over';
  const run = race || game;
  const g = race ? race.views[0] : game; // online, the host's frame of our seat
  const session = net;
  const points = score(g);
  const record = mode === 'solo' && !g.race && points > best;
  if (record) {
    best = points;
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch {
      /* not kept */
    }
  }
  audio.end(record);
  const result = {
    points, metres: metres(g), dust: g.dustN, best, record, team: mode !== 'solo', online: !!session, canAgain: !session || !!session.startMatch,
    race: g.race ? standings(g) : null, mine: session ? session.seat : -1,
  };
  const show = () => {
    if (state !== 'over' || net !== session || (!session && (race || game) !== run)) return;
    if (ui.inSettings()) {
      overTimer = setTimeout(show, 400);
      return;
    }
    ui.showOver(result);
  };
  overTimer = setTimeout(show, 1300);
}

/* The sim's events, the host's or our own, as light and sound; in a race on
 * this screen, column i's. */
function drain(events, i = 0) {
  const g = race ? race.views[i] : game;
  let ended = false;
  for (const e of events) {
    renderers[i].event(e, g);
    if (state !== 'attract') audio.event(e);
    if (e.type === 'over') ended = true;
  }
  if (ended && (state === 'play' || state === 'paused')) gameOver();
}

const ui = createUI({
  onPlay(n, r) {
    players = n;
    racing = r;
    startGame();
  },
  onOnline: (r) => lobby.open(r),
  onResume: resume,
  onRestart() {
    if (!net) startGame();
    else if (net.startMatch) net.startMatch(); // the host's alone; BEGIN does the rest
  },
  onMainMenu() {
    if (net && state === 'over') backToRoom();
    else mainMenu();
  },
  onMenu() {
    if (state === 'play') pause();
    else if (state === 'paused') resume();
    else if (ui.inSettings()) ui.settingsBack();
    else ui.showSettings();
  },
});

const lobby = createLobby({
  ui,
  onBegin: startOnline,
  // The host went back to the room (only a guest hears this).
  onLobby(session) {
    if (net === session) {
      startAttract();
      lobby.showRoom();
    }
  },
  onEvents(events) {
    if (!net || !net.game) return;
    game = net.game;
    drain(events);
  },
  // The room closed under us; the lobby says why.
  onClosed() {
    if (net) startAttract();
  },
});

// exit.js is deferred and from another repo: ask until it answers, briefly.
if (!ui.wireExit()) {
  let tries = 0;
  const timer = setInterval(() => {
    if (ui.wireExit() || ++tries > 40) clearInterval(timer);
  }, 150);
}

addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.repeat) return;
  e.preventDefault();
  if (state === 'play') pause();
  else if (state === 'paused') resume();
  else if (ui.inSettings()) ui.settingsBack();
  else if (state === 'over') {
    if (net) backToRoom();
    else mainMenu();
  } else if (ui.current() === 'online') lobby.back();
  else if (ui.current() === 'start' && ui.exitShown()) ui.quit();
});

// A tab put away mid-run pauses rather than dropping the comets unseen.
// Online the room plays on, and so does the worker if we host.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && !net) pause();
});

addEventListener('resize', () => {
  for (const r of renderers) r.resize();
  // The start screen's sky follows the screen; a run keeps the field it has.
  if (state === 'attract') game = createGame(shape());
});

let last = performance.now();
let time = 0;
const opts = { attract: true, best: 0, mine: -1, strips: 0, keys: null, box: null, key: null };
const boxes = [[0, 0], [0, 0], [0, 0], [0, 0]];

function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  time += dt;
  for (let i = 0; i < 4; i++) holds[i] = keys[i] || fingers[i] > 0;

  if (net) {
    // Online: nothing to step. Say whether our button is down, draw the
    // newest sky; the events arrive on their own (drain, from the lobby).
    if (net.game) game = net.game;
    net.setHold(live() && holds[0]);
  } else if (state !== 'paused') {
    acc += dt;
    let steps = 0;
    while (acc >= TICK && steps < 8) {
      if (state === 'attract') {
        bot[0] = autopilot(game);
        step(game, TICK, bot);
      } else if (race) stepRace(race, TICK, state === 'play' ? holds : NONE);
      else step(game, TICK, state === 'play' ? holds : NONE);
      acc -= TICK;
      steps++;
    }
    if (steps === 8) acc = 0;
    if (race) {
      for (let i = 0; i < race.games.length; i++) {
        drain(race.games[i].events, i);
        race.games[i].events.length = 0;
      }
    } else {
      drain(game.events);
      game.events.length = 0;
    }
    // The start screen's bot rests a moment where it fell, then goes again.
    if (state === 'attract' && game.status === 'over' && (rest += dt) > 2) {
      game = createGame(shape());
      renderer.reset();
      rest = 0;
    }
  }

  opts.attract = state === 'attract';
  opts.best = mode === 'solo' && !race ? best : 0;
  opts.mine = net ? net.seat : -1;
  opts.strips = mode === 'local' && !race ? players : 0;
  opts.keys = mode === 'local' && !touch ? KEY_NAMES[players] : null;
  const rdt = state === 'paused' && !net ? 0 : dt;
  if (race) {
    // A column each, left to right in seat order, as the strips and keys are.
    const n = race.views.length, cw = innerWidth / n;
    for (let i = 0; i < n; i++) {
      boxes[i][0] = i * cw;
      boxes[i][1] = cw;
      opts.box = boxes[i];
      opts.mine = i;
      opts.key = opts.keys ? opts.keys[i] : null;
      renderers[i].draw(race.views[i], time, rdt, opts);
    }
    opts.box = opts.key = null;
  } else renderer.draw(game, time, rdt, opts);
  requestAnimationFrame(frame);
}

ui.showStart();
requestAnimationFrame(frame);
