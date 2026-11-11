/*
 * main.js — the glue: the fixed-timestep loop, the one button, and which
 * state the game is in.
 *
 *   attract  the start screen. The sim's bot swings up the sky behind it.
 *   play     a run. Hold = pointer down anywhere on the sky, or Space / ↑.
 *   paused   the menu panel is open over a run. One player, one device, so
 *            the menu always stops it (hub §2). Resuming re-parks a comet
 *            that is on a star (sim.js), so nothing is flung by a resume.
 *   over     the comet is gone; the sky keeps moving and the card follows.
 *
 * THE LOOP. sim.js's 60 Hz TICK with an accumulator, frame dt clamped to
 * 0.1 s and at most 8 steps a frame (hub §10). Events are drained once a
 * frame into light (render.js) and sound (audio.js).
 *
 * ESCAPE, in one place (hub §2), auto-repeat ignored:
 *   play                         open the menu (and pause)
 *   Pause face open              close it, the run carries on
 *   Settings face open           its Back
 *   over                         the card's secondary button: Main menu
 *   start screen, nothing open   the Back to arcade button, when shown
 *
 * The best score is `starswing.best.v1`, a number (hub §6).
 */

import { createGame, step, autopilot, park, score, metres, TICK } from './sim.js';
import { createRenderer, shape } from './render.js';
import { createUI } from './ui.js';
import { audio } from './audio.js';

const BEST_KEY = 'starswing.best.v1';
const canvas = document.getElementById('view');
const renderer = createRenderer(canvas);

let best = 0;
try {
  const v = Number(localStorage.getItem(BEST_KEY));
  if (Number.isFinite(v) && v > 0) best = Math.floor(v);
} catch {
  /* no storage: the best is this visit's */
}

let state = 'attract';
let game = createGame(shape());
let acc = 0;
let rest = 0;
let overTimer = 0;

// The one button. Pointers are counted, so a second finger does not let go.
const fingers = new Set();
let key = false;
canvas.addEventListener('pointerdown', (e) => {
  fingers.add(e.pointerId);
  e.preventDefault();
});
for (const type of ['pointerup', 'pointercancel']) addEventListener(type, (e) => fingers.delete(e.pointerId));
addEventListener('blur', () => {
  fingers.clear();
  key = false;
});
const isHold = (e) => e.code === 'Space' || e.code === 'ArrowUp';
addEventListener('keydown', (e) => {
  if (!isHold(e) || state !== 'play') return;
  // The key is the game's now: not also a click on whichever plate has focus.
  e.preventDefault();
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  key = true;
});
addEventListener('keyup', (e) => {
  if (isHold(e)) key = false;
});

function startAttract() {
  state = 'attract';
  clearTimeout(overTimer);
  audio.music(false);
  game = createGame(shape());
  renderer.reset();
  rest = 0;
}

function startGame() {
  clearTimeout(overTimer);
  game = createGame(shape());
  renderer.reset();
  fingers.clear();
  key = false;
  state = 'play';
  acc = 0;
  ui.hideCards();
  audio.music(true);
}

function pause() {
  if (state !== 'play') return;
  state = 'paused';
  audio.music(false);
  ui.showPause();
}

function resume() {
  if (state !== 'paused') return;
  park(game);
  state = 'play';
  acc = 0;
  ui.hideCards();
  audio.music(true);
}

function mainMenu() {
  startAttract();
  ui.showStart();
}

function gameOver() {
  state = 'over';
  const g = game;
  const points = score(g);
  const record = points > best;
  if (record) {
    best = points;
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch {
      /* not kept */
    }
  }
  audio.end(record);
  const show = () => {
    if (state !== 'over' || game !== g) return;
    if (ui.inSettings()) {
      overTimer = setTimeout(show, 400);
      return;
    }
    ui.showOver({ points, metres: metres(g), dust: g.dustN, best, record });
  };
  overTimer = setTimeout(show, 1300);
}

const ui = createUI({
  onPlay: startGame,
  onResume: resume,
  onRestart: startGame,
  onMainMenu: mainMenu,
  onMenu() {
    if (state === 'play') pause();
    else if (state === 'paused') resume();
    else if (ui.inSettings()) ui.settingsBack();
    else ui.showSettings();
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
  else if (state === 'paused' && !ui.inSettings()) resume();
  else if (ui.inSettings()) ui.settingsBack();
  else if (state === 'over') mainMenu();
  else if (ui.current() === 'start' && ui.exitShown()) ui.quit();
});

// A tab put away mid-run pauses rather than dropping the comet unseen.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') pause();
});

addEventListener('resize', () => {
  renderer.resize();
  // The start screen's sky follows the screen; a run keeps the field it has.
  if (state === 'attract') game = createGame(shape());
});

let last = performance.now();
let time = 0;
const opts = { attract: true, best: 0 };

function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  time += dt;

  if (state !== 'paused') {
    acc += dt;
    let steps = 0;
    while (acc >= TICK && steps < 8) {
      step(game, TICK, state === 'attract' ? autopilot(game) : state === 'play' && (key || fingers.size > 0));
      acc -= TICK;
      steps++;
    }
    if (steps === 8) acc = 0;
    let ended = false;
    for (const e of game.events) {
      renderer.event(e, game);
      if (state !== 'attract') audio.event(e);
      if (e.type === 'over') ended = true;
    }
    game.events.length = 0;
    if (state === 'play' && ended) gameOver();
    // The start screen's bot rests a moment where it fell, then goes again.
    if (state === 'attract' && game.status === 'over' && (rest += dt) > 2) {
      game = createGame(shape());
      renderer.reset();
      rest = 0;
    }
  }

  opts.attract = state === 'attract';
  opts.best = best;
  renderer.draw(game, time, state === 'paused' ? 0 : dt, opts);
  requestAnimationFrame(frame);
}

ui.showStart();
requestAnimationFrame(frame);
