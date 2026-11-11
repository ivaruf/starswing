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
| `js/sim.js` | the whole game, no DOM: physics, the sky's generation, the bot |
| `js/render.js` | the canvas: sky, glow, sparks, HUD; picks the field for the screen |
| `js/main.js` | the loop, the one button, the states, Escape, the best score |
| `js/ui.js` | cards, the corner's menu and mute, the way back to the arcade |
| `js/audio.js` | two buses, mute, the composed cues and the loop |
| `js/i18n.js` | bokmål and English |
| `js/intro.js` | the opening sting |
| `js/screen.js`, `js/update.js`, `js/touch-guard.js` | self-contained: fullscreen, the update button, no text selection |

The menus, sound engine, language switch and service worker are
geometry_pong's, cut to what this game has.

## Checks

```sh
node tools/sim-smoke.mjs     # the bot climbs a tall sky and a wide one; invariants hold
python3 tools/make-icons.py  # after changing the motif
```

## Sound

The pieces in `tools/audio/*.rb` are the source of truth; `audio/*.m4a` are
outputs. The header of `tools/audio/encode.mjs` says how to re-render.

## Storage

`starswing.best.v1` (a number), `starswing.vol.music.v1`,
`starswing.vol.sfx.v1`, `starswing.mute.v1`, and the hub's `arcade.lang.v1`.
