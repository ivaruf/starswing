# Peer to peer

Online Starswing: one comet per device, one host running the sky, everybody
else connected straight to it. A static site with no game server.

The shape is geometry_pong's (its `docs/P2P.md`), which is NeonFox's, which is
hub `CLAUDE.md` §8: host-authoritative star, two data channels, the simulation
in a Web Worker, three tiers of signalling, picture codes on a keypad.
`js/net/codes.js`, `rendezvous.js` and `webrtc.js` are geometry_pong's files
with only the room namespace changed (`starswing-v1-<code>`); read its
document for signalling, the PeerJS broker and what that third party sees.

## What is this game's own

- **The frame is the whole sky** (`js/net/protocol.js`): camera, score, four
  comets, every star on screen, every speck of dust not yet taken. About 300
  bytes, 60 a second, on the lossy lane. No deltas and no roster version, so a
  guest that joins at 800 m is whole on the first frame it decodes, and what
  it decodes is drawn by the same `render.js` that draws a local game.
- **A guest sends one bit**: whether its button is down, with a sequence
  number, 60 times a second. It cannot claim a position, a star or a score.
- **Joining late is the game's own rule.** A seat taken mid-run gets a comet
  that arrives the way a lost one comes back: on a star a friend is holding
  (`sim.js` `seat`). A guest that leaves takes its comet with it.
- **The sky is the host's shape**: tall if the host holds a phone upright,
  wide on a laptop. A guest on the other kind of screen sees it letterboxed.

## Honest limits

- **A guest's release is late by its round trip.** The press travels to the
  host, the result travels back, and nothing is predicted or interpolated on
  the guest. On home Wi-Fi that is a few hundredths of a second; on a poor
  link a swing will feel heavy and frames may stutter. The fix, if playtests
  ask for it, is geometry_pong's: simulate the guest's own comet locally.
  Not measured.
- No host migration: the host closing the tab ends the room. The host is
  authoritative, so the host could cheat at a co-operative game.
- The menu does not pause an online run (hub §2), and only the host can
  restart.

## The relay

`webrtc.js` `iceConfig()` fetches Cloudflare TURN credentials from the hub's
Worker only when a player hosts or joins, falls back to STUN alone, and
`?relay` forces the relay for testing (hub §8). Cloudflare sees relayed
players' IP addresses and traffic volume, never game data.

## Checking it

`tools/net-check.html` (see its header) drives a host and a guest in two
frames of one page through a room and a run. `tools/sim-smoke.mjs` round-trips
frames through the codec.
