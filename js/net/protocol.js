/*
 * protocol.js — what goes on the wire, and what is allowed in off it.
 *
 * geometry_pong's (its js/net/protocol.js), cut to this game. Two lanes, and
 * the split is the whole design (hub CLAUDE.md §8):
 *
 *   reliable + ordered   joins, the roster, BEGIN, the sim's events (grabs,
 *                        dust, a comet lost: sounds and sparks).
 *   unreliable, 0 retx   the host's state frame and the guest's button. Both
 *                        are superseded sixty times a second, so a late one
 *                        is worthless.
 *
 * THE STATE FRAME IS THE WHOLE SKY, every time: the camera, the score, four
 * comets, every star on screen and every speck of dust not yet taken. About
 * 300 bytes (tools/sim-smoke.mjs prints the largest), one small packet. So
 * there is no delta, no roster version and no catch-up message: a guest that
 * joins at 800 m is whole on the first frame it decodes, and unpackFrame
 * hands back an object js/render.js draws exactly as it draws the sim's own.
 *
 * A RACE (sim.js RACE) sends each seat its own sky: the frame of game i, with
 * everyone else's comet in the comet slots as a ghost (no tether: their stars
 * are not in this list), the clock, and every seat's height for the standings.
 * The same 42-byte head says "no race" with a clock of 0xffff.
 *
 * A GUEST SENDS ONE BIT: whether its button is down. There is no field in
 * which it could claim a position, a star or a score.
 *
 * LANGUAGE NEVER TRAVELS (hub §2): refusals are reason codes, events are a
 * type and numbers.
 */

import { SEATS } from '../sim.js';

// 1 since 2026-11-11, the first online build. 2: the race (a longer head).
export const NET_VERSION = 2;

export const MSG = Object.freeze({
  HELLO: 'hello',
  WELCOME: 'welcome',
  ROSTER: 'roster',
  BEGIN: 'begin',
  LOBBY: 'lobby',
  EVENTS: 'events',
  REFUSED: 'refused',
  BYE: 'bye',
});

export const KIND_FRAME = 1;
export const KIND_HOLD = 2;

const STATUS = ['none', 'parked', 'play', 'out'];
const GAME = ['parked', 'play', 'over'];
const HEAD = 42;
const NO_RACE = 0xffff;
const COMET = 19;
const NONE = 255;
// Stars and dust: x and (y - camY + 400) in sixteenths of a unit, as u16.
const Q = 16;
const LOW = 400;

export function packFrame(g, frameNo) {
  const stars = [];
  for (const s of g.stars) if (s.y < g.camY + g.view + 120 && stars.length < NONE) stars.push(s);
  const dust = [];
  for (const d of g.dust) if (!d.taken && d.y > g.camY - 40 && d.y < g.camY + g.view + 40 && dust.length < 255) dust.push(d);
  const bytes = new Uint8Array(HEAD + SEATS * COMET + stars.length * 5 + dust.length * 4);
  const v = new DataView(bytes.buffer);
  v.setUint8(0, KIND_FRAME);
  v.setUint8(1, GAME.indexOf(g.status));
  v.setUint32(2, frameNo);
  v.setUint16(6, g.w);
  v.setUint16(8, g.view);
  v.setFloat32(10, g.t);
  v.setFloat32(14, g.camY);
  v.setFloat32(18, g.top);
  v.setFloat32(22, g.base);
  v.setUint16(26, Math.min(g.dustN, 65535));
  v.setUint8(28, Math.min(g.grabs, 255));
  v.setUint8(29, Math.min(g.zone, 255));
  v.setUint8(30, stars.length);
  v.setUint8(31, dust.length);
  const r = g.race;
  v.setUint16(32, r ? Math.min(NO_RACE - 1, Math.round(r.left * 10)) : NO_RACE);
  for (let i = 0; r && i < SEATS; i++) v.setUint16(34 + 2 * i, Math.min(65535, r.metres[i] || 0));
  let o = HEAD;
  for (let i = 0; i < SEATS; i++, o += COMET) {
    const c = g.comets[i];
    if (!c) continue; // status 0: none
    v.setUint8(o, STATUS.indexOf(c.status));
    v.setFloat32(o + 1, c.x);
    v.setFloat32(o + 5, c.y);
    v.setFloat32(o + 9, c.vx);
    v.setFloat32(o + 13, c.vy);
    const ti = stars.indexOf(c.tether), li = stars.indexOf(c.last);
    v.setUint8(o + 17, ti < 0 ? NONE : ti);
    v.setUint8(o + 18, li < 0 ? NONE : li);
  }
  for (const s of stars) {
    v.setUint16(o, s.x * Q);
    v.setUint16(o + 2, Math.max(0, (s.y - g.camY + LOW) * Q));
    v.setUint8(o + 4, (s.dark ? 1 : 0) | (s.lit ? 2 : 0));
    o += 5;
  }
  for (const d of dust) {
    v.setUint16(o, Math.max(0, d.x * Q));
    v.setUint16(o + 2, (d.y - g.camY + LOW) * Q);
    o += 4;
  }
  return bytes;
}

/* A frame as a game js/render.js can draw, or null if it is not one. Every
 * number is checked: a frame is the host's, but it still came off a wire. */
export function unpackFrame(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < HEAD + SEATS * COMET || bytes[0] !== KIND_FRAME) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nStars = v.getUint8(30), nDust = v.getUint8(31);
  if (bytes.length !== HEAD + SEATS * COMET + nStars * 5 + nDust * 4) return null;
  const g = {
    status: GAME[v.getUint8(1)] || 'parked',
    frameNo: v.getUint32(2),
    w: v.getUint16(6),
    view: v.getUint16(8),
    t: v.getFloat32(10),
    camY: v.getFloat32(14),
    top: v.getFloat32(18),
    base: v.getFloat32(22),
    dustN: v.getUint16(26),
    grabs: v.getUint8(28),
    zone: v.getUint8(29),
    comets: [],
    stars: [],
    dust: [],
    race: null,
  };
  if (v.getUint16(32) !== NO_RACE) g.race = { left: v.getUint16(32) / 10, metres: [0, 1, 2, 3].map((i) => v.getUint16(34 + 2 * i)) };
  if (![g.t, g.camY, g.top, g.base].every(Number.isFinite) || g.w < 100 || g.view < 100) return null;
  let o = HEAD + SEATS * COMET;
  for (let i = 0; i < nStars; i++, o += 5) {
    const f = v.getUint8(o + 4);
    g.stars.push({ x: v.getUint16(o) / Q, y: v.getUint16(o + 2) / Q + g.camY - LOW, dark: !!(f & 1), lit: !!(f & 2) });
  }
  for (let i = 0; i < nDust; i++, o += 4) {
    g.dust.push({ x: v.getUint16(o) / Q, y: v.getUint16(o + 2) / Q + g.camY - LOW, taken: false });
  }
  o = HEAD;
  for (let i = 0; i < SEATS; i++, o += COMET) {
    const c = {
      status: STATUS[v.getUint8(o)] || 'none',
      x: v.getFloat32(o + 1),
      y: v.getFloat32(o + 5),
      vx: v.getFloat32(o + 9),
      vy: v.getFloat32(o + 13),
      tether: g.stars[v.getUint8(o + 17)] || null,
      last: g.stars[v.getUint8(o + 18)] || null,
    };
    if (![c.x, c.y, c.vx, c.vy].every(Number.isFinite)) return null;
    g.comets.push(c);
  }
  return g;
}

/* The guest's button: a sequence number, because the lossy lane is unordered
 * too and an old press must not undo a newer release. */
export function packHold(seq, hold) {
  return new Uint8Array([KIND_HOLD, seq & 0xff, (seq >> 8) & 0xff, hold ? 1 : 0]);
}
export function unpackHold(bytes) {
  if (bytes.length !== 4 || bytes[0] !== KIND_HOLD) return null;
  return { seq: bytes[1] | (bytes[2] << 8), hold: bytes[3] === 1 };
}
export const newer = (a, b) => ((a - b) & 0xffff) !== 0 && ((a - b) & 0xffff) < 0x8000;

/* One of the sim's events off the wire: a known type and finite numbers, or
 * nothing. They only ever become a sound and some sparks. */
const TYPES = ['grab', 'release', 'dust', 'wall', 'zone', 'join', 'out', 'over'];
export function cleanEvent(e) {
  if (!e || !TYPES.includes(e.type)) return null;
  const n = (x) => (Number.isFinite(x) ? x : 0);
  const who = Number.isInteger(e.who) && e.who >= 0 && e.who < SEATS ? e.who : null;
  return { type: e.type, who, x: n(e.x), y: n(e.y), fresh: e.fresh === true, chain: n(e.chain), combo: n(e.combo), n: n(e.n) };
}
