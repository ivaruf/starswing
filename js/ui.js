/*
 * ui.js — the cards over the sky, the corner's menu and sound plates, and
 * the way back to the arcade. Decides what is showing and what the words
 * say; main.js decides when.
 *
 *   start  the wordmark, Play, the update button, and the way back to the
 *          arcade last
 *   menu   the one panel behind the three-bar plate. In a run it is the
 *          Pause face (Resume, Restart, Main menu); anywhere else it is the
 *          Settings face (no Resume, a Back). Both carry MUSIC and EFFECTS,
 *          the language row and the way back to the arcade, last.
 *   over   the points, what they were made of, then Play again / Main menu
 *
 * Menu words are the hub's shared glossary (§2).
 *
 * THE ARCADE DOOR is wired by wireExit(), which main.js retries because
 * exit.js is a deferred classic script from another repo that may be late or
 * missing. Shown only when there is somewhere to go, worded through verb().
 *
 * Copied from geometry_pong/js/ui.js and cut to what this game has.
 */

import { audio } from './audio.js';
import { t, setLang, paintStatic } from './i18n.js';

const $ = (id) => document.getElementById(id);

export function createUI({ onPlay, onResume, onRestart, onMainMenu, onMenu }) {
  const cards = { start: $('start'), menu: $('menu'), over: $('over') };
  let face = 'pause';
  let settingsFrom = 'start'; // the card the Settings face's Back returns to

  function show(name) {
    for (const [k, el] of Object.entries(cards)) el.hidden = k !== name;
    // Focus the card's main action, so Enter does the obvious thing.
    const el = name && cards[name];
    const first = el && (el.querySelector('.go:not([hidden]):not([disabled])') || el.querySelector('button:not([hidden])'));
    if (first) first.focus({ preventScroll: true });
  }

  function current() {
    for (const [k, el] of Object.entries(cards)) if (!el.hidden) return k;
    return null;
  }

  $('play').addEventListener('click', onPlay);
  $('menu-resume').addEventListener('click', onResume);
  $('menu-restart').addEventListener('click', onRestart);
  $('menu-main').addEventListener('click', onMainMenu);
  $('menu-back').addEventListener('click', () => show(settingsFrom));
  $('over-again').addEventListener('click', onRestart);
  $('over-main').addEventListener('click', onMainMenu);
  $('menu-btn').addEventListener('click', onMenu);

  // face: 'pause' (a stopped run) or 'settings' (outside a run).
  function setFace(next) {
    face = next;
    const inGame = face !== 'settings';
    const title = $('menu-title');
    title.dataset.i18n = inGame ? 'paused' : 'settings';
    title.textContent = t(title.dataset.i18n);
    $('menu-tag').hidden = !inGame;
    $('menu-resume').hidden = !inGame;
    $('menu-restart').hidden = !inGame;
    $('menu-main').hidden = !inGame;
    $('menu-back').hidden = inGame;
  }

  // ---- sound: the corner's live mute and the panel's two levels ----
  const soundBtn = $('sound-btn');
  function paintMute() {
    const m = audio.isMuted();
    const label = t(m ? 'unmute' : 'mute');
    soundBtn.setAttribute('aria-pressed', String(m));
    soundBtn.setAttribute('aria-label', label);
    soundBtn.title = label;
  }
  soundBtn.addEventListener('click', () => {
    audio.setMuted(!audio.isMuted());
    paintMute();
  });
  for (const bus of ['music', 'sfx']) {
    const input = $(`vol-${bus}`);
    const out = $(`vol-${bus}-out`);
    const v = Math.round(audio.level(bus) * 100);
    input.value = String(v);
    out.value = String(v);
    input.addEventListener('input', () => {
      out.value = input.value;
      audio.setLevel(bus, Number(input.value) / 100);
      paintMute();
    });
  }
  paintMute();

  // ---- the end of a run ----
  let over = null;
  function paintOver() {
    if (!over) return;
    cards.over.classList.toggle('record', over.record);
    $('over-title').textContent = t('over.points', over.points);
    $('over-record').hidden = !over.record;
    $('over-score').textContent = t('over.detail', over.metres, over.dust, over.best);
  }

  // ---- language ----
  for (const b of document.querySelectorAll('[data-lang]')) {
    b.addEventListener('click', () => setLang(b.dataset.lang));
  }
  document.addEventListener('arcade:lang', () => {
    paintMute();
    paintOver();
    paintExit();
  });
  paintStatic();

  // ---- the way back to the arcade ----
  const exitBtns = [$('start-exit'), $('menu-exit')];
  let exitApi = null;
  let exitRefused = false;

  function paintExit() {
    if (!exitApi) return;
    let label;
    try {
      label = exitRefused ? t('exit.refused') : exitApi.verb({ arcade: t('exit.arcade'), app: t('exit.close') });
    } catch {
      label = t('exit.arcade');
    }
    for (const b of exitBtns) b.querySelector('.exit-label').textContent = label;
  }

  function quit() {
    if (!exitApi || exitRefused) return;
    Promise.resolve(exitApi.quit())
      .then((how) => {
        if (how !== 'refused') return;
        exitRefused = true;
        for (const b of exitBtns) b.disabled = true;
        paintExit();
      })
      .catch(() => {});
  }
  for (const b of exitBtns) b.addEventListener('click', quit);

  let exitWired = false;
  function wireExit() {
    if (exitWired) return true;
    const exit = window.ArcadeExit;
    if (!exit) return false;
    exitWired = true;
    let shown = false;
    try {
      shown = exit.framed() || exit.standalone();
    } catch {
      shown = false;
    }
    if (!shown) return true;
    exitApi = exit;
    for (const b of exitBtns) b.hidden = false;
    paintExit();
    return true;
  }

  return {
    wireExit,
    current,
    quit,
    exitShown: () => exitApi != null && !exitRefused,
    showStart: () => show('start'),
    hideCards: () => show(null),
    showPause() {
      setFace('pause');
      show('menu');
    },
    showSettings() {
      settingsFrom = current(); // may be null: over a sky with no card
      setFace('settings');
      show('menu');
    },
    inSettings: () => !cards.menu.hidden && face === 'settings',
    settingsBack: () => show(settingsFrom),
    /* { points, metres, dust, best, record } */
    showOver(result) {
      over = result;
      paintOver();
      show('over');
    },
  };
}
