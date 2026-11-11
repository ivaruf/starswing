/*
 * guest.js — the peer that does not simulate.
 *
 * geometry_pong's guest (its js/net/guest.js), cut to this game. A guest
 * holds exactly one connection, to the host. What goes up is one bit, whether
 * the button is down, on the lossy lane about sixty times a second, changed
 * or not: four bytes, and a lost packet heals itself on the next. What comes
 * down is the whole sky (protocol.js), and `session.game` is always the
 * newest frame, decoded, which js/render.js draws as it is.
 *
 * shortcut: the newest frame is drawn with no interpolation, so a late packet
 * is a visible stutter; upgrade to drawing one frame behind and blending if
 * playtests on a poor network say so. See also the shortcut in host.js.
 */

import { MSG, NET_VERSION, KIND_FRAME, packHold, unpackFrame, cleanEvent } from './protocol.js';
import { joinRendezvous } from './rendezvous.js';
import { parseCode } from './codes.js';
import { said } from '../i18n.js';
import { SEATS } from '../sim.js';

/* The refusal codes a host sends (js/net/host.js refuse()), and the key each
 * is said with here. Language never travels; reasons do. */
const REFUSALS = { version: 'why.version', full: 'why.full' };
const SEND_EVERY = 15; // ms

export async function joinSession({ code }) {
  const parsed = parseCode(code);
  if (!parsed) throw said('err.notCode');

  const session = {
    kind: 'guest',
    code: parsed,
    seat: -1,
    roster: [],
    mode: '',
    why: null,
    started: false,
    game: null,
    onRoster: null,
    onStatus: null,
    onBegin: null,
    onLobby: null,
    onEvents: null,
    onClosed: null,
  };

  let seq = 0;
  let lastSent = 0;
  let closed = false;

  const joined = await joinRendezvous(parsed);
  session.mode = joined.mode;
  session.why = joined.why ?? null;
  const channel = joined.channel;

  const close = (why) => {
    if (closed) return;
    closed = true;
    session.started = false;
    session.onClosed?.(why);
  };

  /* WELCOME, ROSTER and BEGIN carry the same fields. */
  function takeRoster(value) {
    if (Number.isInteger(value.you) && value.you >= 0 && value.you < SEATS) session.seat = value.you;
    session.roster = Array.isArray(value.roster)
      ? value.roster
          .filter((r) => r && Number.isInteger(r.seat) && r.seat >= 0 && r.seat < SEATS)
          .map((r) => ({ seat: r.seat, who: ['host', 'guest'].includes(r.who) ? r.who : 'open' }))
      : [];
    session.onRoster?.(session.roster);
  }

  channel.onClose = () => close('why.hostLeft');

  channel.onMessage = (value) => {
    if (value instanceof Uint8Array) {
      if (value[0] !== KIND_FRAME || !session.started) return;
      const g = unpackFrame(value);
      // The lossy lane is unordered: an older sky must not replace a newer one.
      if (g && (!session.game || g.frameNo > session.game.frameNo)) session.game = g;
      return;
    }
    if (!value || typeof value !== 'object') return;
    switch (value.t) {
      case MSG.WELCOME:
        takeRoster(value);
        session.onStatus?.('status.in');
        break;
      case MSG.ROSTER:
        takeRoster(value);
        break;
      case MSG.BEGIN:
        takeRoster(value);
        session.started = true;
        session.onBegin?.();
        break;
      case MSG.LOBBY:
        session.started = false;
        session.game = null;
        session.onLobby?.();
        break;
      case MSG.EVENTS:
        if (Array.isArray(value.e)) {
          const events = value.e.slice(0, 64).map(cleanEvent).filter(Boolean);
          if (events.length) session.onEvents?.(events);
        }
        break;
      case MSG.REFUSED:
        close(REFUSALS[value.why] ?? 'why.refused');
        break;
      case MSG.BYE:
        close('why.hostLeft');
        break;
      default:
        break;
    }
  };

  /* This device's own button. */
  session.setHold = (hold) => {
    if (!session.started || !channel.open) return;
    const now = performance.now();
    if (now - lastSent < SEND_EVERY) return;
    lastSent = now;
    seq = (seq + 1) & 0xffff;
    channel.send(packHold(seq, hold), true);
  };

  // Starting and restarting are the host's alone. main.js reads these being
  // absent as "this device does not get that button" (hub §2, canRestart).
  session.startMatch = null;
  session.toLobby = null;
  session.leave = () => {
    closed = true;
    try {
      channel.send({ t: MSG.BYE, why: 'left' });
    } catch {
      /* Already gone. */
    }
    // Give the goodbye a moment to leave before the connection does, so the
    // host frees the seat at once rather than at its timeout.
    setTimeout(() => {
      channel.onClose = null;
      channel.close();
      joined.close?.();
    }, 150);
  };

  channel.send({ t: MSG.HELLO, v: NET_VERSION });
  return session;
}
