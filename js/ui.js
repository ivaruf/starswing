/*
 * ui.js — the cards over the sky, the corner's menu and sound plates, and
 * the way back to the arcade. Decides what is showing and what the words
 * say; main.js decides when.
 *
 *   start  the wordmark, the Players row (1 to 4 on this screen), the Mode
 *          row (Together or Race, which Online takes into the room too),
 *          Play, Online, the update button, and the way back to the arcade
 *          last
 *   menu   the one panel behind the three-bar plate. In a run it is the
 *          Pause face (Resume, Restart, Main menu); anywhere else it is the
 *          Settings face (no Resume, a Back). Both carry MUSIC and EFFECTS,
 *          the language row and the way back to the arcade, last.
 *   over   the points, what they were made of, then Play again / Main menu;
 *          after a race, who won and everyone's height instead
 *   online the lobby card; js/lobby.js fills it, this file only shows it
 *
 * ONLINE THE MENU DOES NOT PAUSE (hub §2): the run belongs to the whole
 * room. showPause({ live: true }) gives the panel its live face — "Menu", a
 * line saying the sky carries on — and the button stays live behind it.
 * `canRestart` is false for a guest, whose Restart would do nothing; the
 * over card's Play again likewise, and online its way back is "Back", to
 * the room.
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
import { RACE } from './sim.js';
import { SEAT_CSS } from './render.js';

const $ = (id) => document.getElementById(id);

export function createUI({ onPlay, onOnline, onResume, onRestart, onMainMenu, onMenu }) {
  const cards = { start: $('start'), menu: $('menu'), over: $('over'), online: $('online') };
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

  // Players on this screen: alternatives, one size each, for the visit only.
  let players = 1;
  for (const n of [1, 2, 3, 4]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.id = `players-${n}`;
    b.textContent = String(n);
    b.setAttribute('aria-pressed', String(n === players));
    b.addEventListener('click', () => {
      players = n;
      for (const x of $('players').children) x.setAttribute('aria-pressed', String(x === b));
    });
    $('players').appendChild(b);
  }

  // Together or a race: two alternatives, for the visit only.
  let race = false;
  for (const b of $('mode').children) {
    b.addEventListener('click', () => {
      race = b.dataset.race === '1';
      for (const x of $('mode').children) x.setAttribute('aria-pressed', String(x === b));
    });
  }

  $('play').addEventListener('click', () => onPlay(players, race));
  $('online-btn').addEventListener('click', () => onOnline(race));
  $('menu-resume').addEventListener('click', onResume);
  $('menu-restart').addEventListener('click', onRestart);
  $('menu-main').addEventListener('click', onMainMenu);
  $('menu-back').addEventListener('click', () => show(settingsFrom));
  $('over-again').addEventListener('click', onRestart);
  $('over-main').addEventListener('click', onMainMenu);
  $('menu-btn').addEventListener('click', onMenu);

  // face: 'pause' (a stopped run), 'live' (an online run that carries on)
  // or 'settings' (outside a run).
  function setFace(next, canRestart = true) {
    face = next;
    const inGame = face !== 'settings';
    const title = $('menu-title');
    title.dataset.i18n = face === 'live' ? 'live' : inGame ? 'paused' : 'settings';
    title.textContent = t(title.dataset.i18n);
    const tag = $('menu-tag');
    tag.dataset.i18n = face === 'live' ? 'live.tag' : 'pause.tag';
    tag.textContent = t(tag.dataset.i18n);
    tag.hidden = !inGame;
    $('menu-resume').hidden = !inGame;
    $('menu-restart').hidden = !inGame || !canRestart;
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
    const title = $('over-title');
    title.textContent = t('over.points', over.points);
    title.style.color = '';
    $('over-record').hidden = !over.record;
    $('over-score').textContent = over.team ? t('over.team', over.metres, over.dust) : t('over.detail', over.metres, over.dust, over.best);
    const r = over.race;
    if (r && r.length < 2) {
      title.textContent = `${r[0] ? r[0].m : over.metres} m`;
      $('over-score').textContent = t('over.inTime', RACE);
    } else if (r) {
      // The winner in their own colour; a tie at the top is nobody's.
      const tie = r[0].m === r[1].m;
      title.textContent = tie ? t('over.draw') : r[0].seat === over.mine ? t('over.youWin') : t('over.wins', r[0].seat);
      if (!tie) title.style.color = SEAT_CSS[r[0].seat];
      $('over-score').textContent = r.map((x) => `${t(`colour.${x.seat}`)} ${x.m} m`).join(' · ');
    }
    $('over-again').hidden = !over.canAgain;
    const main = $('over-main');
    main.dataset.i18n = over.online ? 'back' : 'mainMenu';
    main.textContent = t(main.dataset.i18n);
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
    showPause({ live = false, canRestart = true } = {}) {
      setFace(live ? 'live' : 'pause', canRestart);
      show('menu');
    },
    showOnline: () => show('online'),
    showSettings() {
      settingsFrom = current(); // may be null: over a sky with no card
      setFace('settings');
      show('menu');
    },
    inSettings: () => !cards.menu.hidden && face === 'settings',
    settingsBack: () => show(settingsFrom),
    /* { points, metres, dust, best, record, team, online, canAgain } */
    showOver(result) {
      over = result;
      paintOver();
      show('over');
    },
  };
}
