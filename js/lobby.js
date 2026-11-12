/*
 * lobby.js — the Online card: where a room is made or found.
 *
 * geometry_pong's lobby (its js/lobby.js), without rules: this game has none
 * to agree on. The code is three pictures tapped on a keypad of twelve (hub
 * §8, "Room codes are pictures"). Three steps of one card (index.html
 * #online), one showing at a time:
 *
 *   choose   Create room / Join
 *   code     the keypad: three slots that fill as pictures are tapped, the
 *            pictures' names under them, Clear and Join
 *   room     where a host and a guest end up in the same place: the code as
 *            three big pictures with their names, and the four seats, each
 *            in its comet's colour, and the Mode row: Together or Race,
 *            the host's to choose (it starts as the start screen's), shown
 *            to a guest with its buttons off. Play for the host; a guest is
 *            told it waits. Nobody has to wait for anybody: a guest that
 *            arrives after Play drops into the run (js/net/host.js).
 *
 * BACK IS ONE STEP (hub §2): code -> choose, room -> leave the room ->
 * choose, choose -> the start screen. Escape is the same button (main.js).
 *
 * TWO LANGUAGES, LIVE. Every line this file writes is kept as a key and its
 * arguments and said again on `arcade:lang`; what the net code reports
 * arrives as keys too (js/i18n.js said()), never a sentence off the wire.
 */

import { t } from './i18n.js';
import { SEAT_CSS, shape } from './render.js';
import { hostSession } from './net/host.js';
import { joinSession } from './net/guest.js';
import { SYMBOLS, CODE_LENGTH, codeIcons } from './net/codes.js';

const $ = (id) => document.getElementById(id);

export function createLobby({ ui, onBegin, onLobby, onEvents, onClosed }) {
  const card = $('online');
  const steps = { choose: $('online-choose'), code: $('online-code'), room: $('online-room') };
  let entered = []; // symbol names tapped so far on the keypad
  let step = 'choose';
  let session = null;
  let pending = 0; // bumped on every Back, so a late-arriving session is let go
  let status = null; // { key, args, warn }
  let unwatch = null;
  let race = false; // the start screen's Mode, which a new room starts with

  function setStatus(key, args = [], warn = false) {
    status = key ? { key, args, warn } : null;
    paintStatus();
  }
  function paintStatus() {
    const el = $('online-status');
    el.textContent = status ? t(status.key, ...status.args) : '';
    el.classList.toggle('warn', !!(status && status.warn));
  }
  const sayError = (e) => setStatus(e && e.key ? e.key : 'status.openFail', e && e.args ? e.args : [], true);

  function paint() {
    for (const [k, el] of Object.entries(steps)) el.hidden = k !== step;
    const tag = $('online-tag');
    tag.textContent = t(step === 'code' ? 'online.joinTag' : step === 'room' ? 'online.roomTag' : 'online.tag');
    if (step === 'room' && session) {
      paintSlots($('room-code'), codeIcons(session.code));
      $('room-code').setAttribute('aria-label', codeWords(session.code));
      $('room-words').textContent = codeWords(session.code);
      $('room-wait').hidden = session.kind === 'host';
      $('room-start').hidden = session.kind !== 'host';
      for (const b of $('room-mode').children) {
        b.setAttribute('aria-pressed', String((b.dataset.race === '1') === !!session.race));
        b.disabled = !session.setRace;
      }
      paintSeats();
    }
    if (step === 'code') paintPad();
    paintStatus();
  }

  // ---- the picture code ----

  const byName = new Map(SYMBOLS.map((sym) => [sym.name, sym]));
  /* A code's pictures as words in this language: "rev · stjerne · nøkkel". */
  const codeWords = (code) => (code ? code.split('-').map((n) => t(`sym.${n}`)).join(' · ') : '');

  function paintSlots(row, icons) {
    row.textContent = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      const slot = document.createElement('span');
      slot.className = icons[i] ? 'code-slot' : 'code-slot empty';
      slot.textContent = icons[i] || '?';
      row.appendChild(slot);
    }
  }

  function paintPad() {
    paintSlots($('pad-slots'), entered.map((n) => byName.get(n).icon));
    $('pad-words').textContent = entered.length ? entered.map((n) => t(`sym.${n}`)).join(' · ') : '';
    $('code-go').disabled = entered.length !== CODE_LENGTH;
    for (const b of $('pad-keys').children) b.setAttribute('aria-label', t(`sym.${b.dataset.sym}`));
  }

  // The twelve keys, built once from codes.js so the pictures live in one place.
  for (const sym of SYMBOLS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pad-key';
    b.textContent = sym.icon;
    b.dataset.sym = sym.name;
    b.addEventListener('click', () => {
      // A fourth tap starts a new code rather than doing nothing.
      if (entered.length >= CODE_LENGTH) entered = [];
      entered.push(sym.name);
      setStatus(null);
      paintPad();
      if (entered.length === CODE_LENGTH) $('code-go').focus({ preventScroll: true });
    });
    $('pad-keys').appendChild(b);
  }
  $('pad-clear').addEventListener('click', () => {
    entered = [];
    setStatus(null);
    paintPad();
  });

  function paintSeats() {
    const list = $('room-seats');
    list.textContent = '';
    if (!session) return;
    for (const r of session.roster) {
      const li = document.createElement('li');
      li.className = 'seat';
      const me = r.seat === session.seat;
      if (r.who === 'open') li.classList.add('bot');
      if (me) li.classList.add('me');
      li.style.setProperty('--c', SEAT_CSS[r.seat] || '#ffffff');
      const who = me ? t('seat.you') : t(`seat.${r.who}`);
      li.textContent = `${t(`colour.${r.seat}`)} · ${who}`;
      list.appendChild(li);
    }
  }

  function go(next) {
    step = next;
    ui.showOnline();
    paint();
    if (step === 'code') $('pad-keys').firstElementChild?.focus({ preventScroll: true });
  }

  /* Wire a fresh session (host or guest) to this card and to main.js. */
  function adopt(s) {
    session = s;
    s.onRoster = () => step === 'room' && paint();
    s.onStatus = (key, ...args) => setStatus(key, args);
    s.onBegin = () => onBegin(s);
    s.onLobby = () => onLobby(s);
    s.onEvents = (events) => onEvents(events);
    s.onClosed = (why) => {
      if (session !== s) return;
      dropSession();
      onClosed();
      go('choose');
      setStatus(why || 'why.hostLeft', [], true);
    };
  }

  function dropSession() {
    unwatch?.();
    unwatch = null;
    session = null;
  }

  async function host() {
    const token = ++pending;
    setStatus('status.opening');
    for (const b of [$('online-host'), $('online-join')]) b.disabled = true;
    try {
      const s = await hostSession({ ...shape(), race });
      if (token !== pending) return s.leave();
      adopt(s);
      go('room');
      if (s.mode === 'tabs') setStatus('status.tabs', [], true);
      else if (s.mode === 'relay') setStatus('status.relay');
      else setStatus('status.broker');
      // The broker can drop a sleeping host's code; say so while it does.
      if (s.watch) {
        unwatch = s.watch((health) => {
          if (session !== s) return;
          if (health.reachable) setStatus('status.broker');
          else setStatus(health.note, health.args || [], true);
        });
      }
    } catch (e) {
      if (token === pending) sayError(e);
    } finally {
      for (const b of [$('online-host'), $('online-join')]) b.disabled = false;
    }
  }

  async function join() {
    const token = ++pending;
    setStatus('status.looking');
    $('code-go').disabled = true;
    try {
      const s = await joinSession({ code: entered.join('-') });
      if (token !== pending) return s.leave();
      adopt(s);
      go('room');
      setStatus(s.mode === 'tabs' ? 'status.tabs' : 'status.in', [], s.mode === 'tabs');
    } catch (e) {
      if (token === pending) sayError(e);
    } finally {
      $('code-go').disabled = false;
    }
  }

  function leave() {
    pending++;
    if (session) {
      const s = session;
      dropSession();
      s.leave();
    }
  }

  $('online-host').addEventListener('click', host);
  $('online-join').addEventListener('click', () => {
    entered = [];
    setStatus(null);
    go('code');
  });
  $('code-go').addEventListener('click', join);
  $('room-start').addEventListener('click', () => session && session.startMatch && session.startMatch());
  for (const b of $('room-mode').children) b.addEventListener('click', () => session?.setRace?.(b.dataset.race === '1'));
  $('online-back').addEventListener('click', back);

  /* One step back; from the first step, the start screen. */
  function back() {
    if (step === 'code') {
      pending++;
      setStatus(null);
      go('choose');
    } else if (step === 'room') {
      leave();
      setStatus(null);
      go('choose');
    } else {
      leave();
      setStatus(null);
      ui.showStart();
    }
  }

  document.addEventListener('arcade:lang', () => {
    if (!card.hidden) paint();
  });

  return {
    open(r = false) {
      race = r;
      setStatus(null);
      go('choose');
    },
    /* After a match, back to the room with everyone still in it. */
    showRoom() {
      if (!session) return go('choose');
      go('room');
    },
    back,
    leave,
    isOpen: () => !card.hidden,
    session: () => session,
  };
}
