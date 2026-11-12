# Starswing

A one-button climb through a glowing night sky. Hold, and the comet is tied
to the nearest star and swings round it on a beam of light. Let go, and it
flies off along the tangent until gravity takes it. Hold again near another
star to catch that one. The sky only scrolls up, and slowly creeps on its
own, so the way to stay in it is to keep climbing. Falling out of the bottom,
or touching a dark star, ends the run.

Every 250 m the sky changes colour and gets a little harder: hops grow
longer, dark stars appear beside the path, and some stars drift. Stardust on
the way is worth five points a piece; a metre is worth one.

Hold is a finger or the mouse anywhere on the sky, or Space / ↑.

## Together

Up to four comets share one sky, one camera and one score. A comet that is
lost while a friend is still up comes back a second later, circling the star
a survivor is holding (or the next one they catch), and waits there until its
own player presses. The run ends when nobody is left. Whoever falls behind
the camera comes back the same way, so everyone stays in one picture.

- **One screen**: pick 2, 3 or 4 on the start card's Players row. The glass
  is cut into one upright strip per player, left to right, and a finger in a
  strip is that player's button. On a keyboard: Q and P for two, Q B P for
  three, Q C M P for four.
- **Online**: one comet per device, over WebRTC with no server of ours
  (`docs/P2P.md`). The host makes a room and reads out three pictures; guests
  tap them on a keypad. A guest that arrives after Play drops into the run.

The best score is the solo game's alone.

## Racing

Pick **Race** on the start card's Mode row (or, online, in the room) and the
same one to four players race instead: a 3‑2‑1 countdown, then 90 seconds,
and the highest climb wins. Everyone flies their own copy of one sky, grown
from one seed so the stars are the same for all, and sees the others as
faint ghost comets in it. Lives never run out: a lost comet goes back to the
star it fell off while the camera walks down to it, and the two seconds that
takes are what the fall cost.

- **One screen**: the glass is cut into one column per player, each with its
  own camera, height and clock. The buttons are the same strips and keys as
  together.
- **Online**: each device draws its own sky, with everyone's height listed
  under its own. Someone who joins mid-race starts at the bottom with what is
  left of the clock.

## Running it

Serve the hub directory and open `/starswing/`:

```sh
cd ~/projects/games && python3 -m http.server 7777
```

ES modules over HTTP; `file://` is not supported. Served on its own, the
arcade's `../arcade/exit.js` 404s and the "Back to arcade" button stays
hidden, which is expected.

## Layout

| file | owns |
| --- | --- |
| `js/sim.js` | the whole game, no DOM: physics, the sky's generation, the race, the bot |
| `js/render.js` | the canvas: sky, glow, sparks, HUD, a race's ghosts and columns; picks the field for the screen |
| `js/main.js` | the loop, the buttons (one, or one per strip), the states, Escape, the best score |
| `js/lobby.js` | the Online card: create or join a room, the picture keypad, the seats |
| `js/net/` | protocol (the frame on the wire), host and its worker, guest; `codes`, `rendezvous` and `webrtc` are geometry_pong's unchanged |
| `js/ui.js` | cards, the corner's menu and mute, the way back to the arcade |
| `js/audio.js` | two buses, mute, the composed cues and the loop |
| `js/i18n.js` | bokmål and English |
| `js/intro.js` | the opening sting |
| `js/screen.js`, `js/update.js`, `js/touch-guard.js` | self-contained: fullscreen, the update button, no text selection |

The menus, sound engine, language switch and service worker are
geometry_pong's, cut to what this game has.

## Checks

```sh
node tools/sim-smoke.mjs     # the bot climbs; a lost comet rejoins a friend; a race is fair and timed; a frame survives the wire
python3 tools/make-icons.py  # after changing the motif
```

`tools/net-check.html`, opened through the hub's server, puts a host and a
guest side by side and drives them through a room and a run (`?race` for a
race). It is something to look at, not an assertion.

## Sound

The pieces in `tools/audio/*.rb` are the source of truth; `audio/*.m4a` are
outputs. The header of `tools/audio/encode.mjs` says how to re-render.

## Storage

`starswing.best.v1` (a number), `starswing.vol.music.v1`,
`starswing.vol.sfx.v1`, `starswing.mute.v1`, and the hub's `arcade.lang.v1`.
