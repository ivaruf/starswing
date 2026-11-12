/*
 * host.js — the authoritative peer.
 *
 * geometry_pong's host (its js/net/host.js), cut to this game. One player
 * runs the simulation, in a Web Worker, and everybody else sends their one
 * button and draws what comes back: a host-authoritative star, never a mesh
 * (hub CLAUDE.md §8). Snapshots and not lockstep, for NeonFox's measured
 * reason: Math.cos and Math.sin differ in the last bit between Chrome and
 * Safari, and a swing is nothing but cos and sin.
 *
 * SEATS. Four, the host on seat 0. A seat nobody has taken has no comet. A
 * guest may join while a run is up: its comet arrives the way a lost one
 * comes back, on a star a friend is holding (sim.js `seat`). A guest that
 * leaves takes its comet with it.
 *
 * A RACE (sim.js RACE) is the host's choice, made in the room and carried in
 * every roster message so a guest's room card shows it. The worker then runs
 * one sky per seat, and each peer is sent its own seat's frame and events.
 *
 * THE SKY IS THE HOST'S SHAPE: tall on a phone held upright, wide on a
 * laptop. A guest on the other kind of screen sees it letterboxed.
 *
 * shortcut: a guest's press reaches the sim half a round trip late and is
 * seen another half later; upgrade to simulating the guest's own comet
 * locally (as geometry_pong does its paddle) if playtests say releases feel
 * late.
 *
 * WHAT THIS FILE DOES NOT KNOW. WebRTC: it talks to "channels" (send(value,
 * fast), onMessage, onClose), which is what makes the two-tab
 * BroadcastChannel path a real test of this code.
 */

import { MSG, NET_VERSION, KIND_HOLD, unpackHold, unpackFrame, newer } from './protocol.js';
import { hostRendezvous } from './rendezvous.js';
import { newCode } from './codes.js';
import { SEATS } from '../sim.js';

export async function hostSession({ w, view, race = false }) {
  const code = newCode();
  const seats = Array.from({ length: SEATS }, (_, i) => (i === 0 ? 'host' : 'open'));

  const session = {
    kind: 'host',
    code,
    seat: 0,
    roster: [],
    mode: '',
    why: null,
    watch: null,
    started: false,
    race,
    game: null, // the latest frame, decoded: what this device draws
    /* main.js and js/lobby.js set these. */
    onRoster: null,
    onStatus: null, // (key, ...args): said on this device, in its language
    onBegin: null,
    onEvents: null,
    onClosed: null,
  };

  const peers = new Map(); // transport id -> { channel, hello, seat, lastSeq, hold }
  let worker = null;
  let rendezvous = null;
  let lastLocal = false;

  const say = (key, ...args) => session.onStatus?.(key, ...args);
  const rosterList = () => seats.map((who, i) => ({ seat: i, who }));
  const rosterMessage = (t, peer) => ({ t, you: peer.seat, roster: session.roster, started: session.started, race: session.race });

  function publishRoster() {
    session.roster = rosterList();
    for (const peer of peers.values()) if (peer.hello) peer.channel.send(rosterMessage(MSG.ROSTER, peer));
    session.onRoster?.(session.roster);
  }

  function onPeer(key, channel) {
    const peer = { key, channel, hello: false, seat: -1, lastSeq: null, hold: false };
    peers.set(key, peer);
    channel.onClose = () => dropPeer(key);
    channel.onMessage = (value) => receive(peer, value);
  }

  function dropPeer(key) {
    const peer = peers.get(key);
    if (!peer) return;
    peers.delete(key);
    if (peer.seat < 0) return;
    seats[peer.seat] = 'open';
    worker?.postMessage({ type: 'SEAT', seat: peer.seat, on: false });
    publishRoster();
    say('status.left', peer.seat);
  }

  /* `why` is a reason CODE, never a sentence: the guest says it in its own
   * language (js/net/guest.js). */
  function refuse(peer, why) {
    peer.channel.send({ t: MSG.REFUSED, why });
    setTimeout(() => peer.channel.close(), 250); // let the message actually go
  }

  /*
   * Every byte a guest sends arrives here. A guest can say three things — its
   * build, whether its button is down, and goodbye. The seat a
   * button moves is the one this peer was given, looked up here, not one it
   * names.
   */
  function receive(peer, value) {
    if (value instanceof Uint8Array) {
      if (value[0] !== KIND_HOLD || peer.seat < 0) return;
      const p = unpackHold(value);
      if (!p) return;
      if (peer.lastSeq !== null && !newer(p.seq, peer.lastSeq)) return;
      peer.lastSeq = p.seq;
      if (p.hold === peer.hold) return;
      peer.hold = p.hold;
      worker?.postMessage({ type: 'HOLD', seat: peer.seat, hold: p.hold });
      return;
    }
    if (!value || typeof value !== 'object') return;
    switch (value.t) {
      case MSG.HELLO: {
        if (peer.hello) return; // one hello per peer; the rest is noise
        if (value.v !== NET_VERSION) return refuse(peer, 'version');
        const seat = seats.indexOf('open');
        if (seat < 0) return refuse(peer, 'full');
        peer.hello = true;
        peer.seat = seat;
        seats[seat] = 'guest';
        session.roster = rosterList();
        peer.channel.send(rosterMessage(MSG.WELCOME, peer));
        // Mid-run, straight in: the next frame is the whole sky.
        if (session.started) {
          worker?.postMessage({ type: 'SEAT', seat, on: true });
          peer.channel.send(rosterMessage(MSG.BEGIN, peer));
        }
        publishRoster();
        say('status.joined', seat);
        return;
      }
      case MSG.BYE:
        dropPeer(peer.key);
        return;
      default:
        return;
    }
  }

  function broadcast(value, fast) {
    for (const peer of peers.values()) if (peer.hello) peer.channel.send(value, fast);
  }

  function bootWorker() {
    worker = new Worker(new URL('./host-worker.js', import.meta.url), { type: 'module' });
    // One frame and one list of events per seat (host-worker.js).
    worker.onmessage = ({ data }) => {
      if (data.type !== 'FRAME' || !session.started) return;
      for (const peer of peers.values()) {
        if (!peer.hello) continue;
        // Reliable first: a guest that hears a grab a frame early has lost nothing.
        if (data.events[peer.seat].length) peer.channel.send({ t: MSG.EVENTS, e: data.events[peer.seat] }, false);
        peer.channel.send(data.bytes[peer.seat], true);
      }
      session.game = unpackFrame(data.bytes[0]) || session.game;
      if (data.events[0].length) session.onEvents?.(data.events[0]);
    };
  }

  /* This device's own button. */
  session.setHold = (hold) => {
    if (!worker || !session.started || hold === lastLocal) return;
    lastLocal = hold;
    worker.postMessage({ type: 'HOLD', seat: 0, hold });
  };

  /* Together or a race, for the next run: the room card's Mode row. */
  session.setRace = (on) => {
    session.race = !!on;
    publishRoster();
  };

  /* A run, first or again: a new game in the worker is the whole of it. The
   * roster, the connections and the code all survive. */
  session.startMatch = () => {
    session.started = true;
    session.game = null;
    lastLocal = false;
    for (const peer of peers.values()) peer.hold = false;
    if (!worker) bootWorker();
    worker.postMessage({ type: 'SETUP', w, view, race: session.race, seats: seats.map((who) => who !== 'open') });
    for (const peer of peers.values()) if (peer.hello) peer.channel.send(rosterMessage(MSG.BEGIN, peer));
    session.onBegin?.();
  };

  /* Back to the room with everyone still in it. */
  session.toLobby = () => {
    if (!session.started) return;
    session.started = false;
    session.game = null;
    worker?.postMessage({ type: 'STOP' });
    broadcast({ t: MSG.LOBBY }, false);
  };

  session.leave = (why = 'hostLeft') => {
    broadcast({ t: MSG.BYE, why }, false);
    for (const peer of peers.values()) {
      peer.channel.onClose = null;
      peer.channel.close();
    }
    peers.clear();
    worker?.postMessage({ type: 'STOP' });
    worker?.terminate();
    worker = null;
    rendezvous?.close();
    rendezvous = null;
    session.started = false;
    session.game = null;
  };

  session.roster = rosterList();
  rendezvous = await hostRendezvous(code, onPeer);
  session.mode = rendezvous.mode;
  session.why = rendezvous.why ?? null;
  session.watch = rendezvous.watch ?? null;
  return session;
}
