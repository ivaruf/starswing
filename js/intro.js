/*
 * intro.js — the two-and-a-half-second sting that plays when the game opens.
 *
 * The game's whole idea in one move. A star glows alone in the night; a
 * comet rises from the bottom edge, a beam of light snaps between them, and
 * the comet swings once round the star, its tail drawing the ring. Then it
 * lets go and is flung up and off the top, and the ring it drew becomes a
 * window: it opens past the edges of the screen and the start screen is
 * behind it, with the bot already swinging. Nothing in it is text, so it has
 * nothing to translate.
 *
 * WHAT IT MAY NOT DO (hub CLAUDE.md §2, the sting's contract)
 *   - Cost anyone a run. It only ever plays at page load, over the start
 *     screen, and any tap or key skips straight to the hand-off.
 *   - Let the skipping press through. A key is swallowed in the capture
 *     phase on window - this script runs async from the top of <body>, long
 *     before the module graph, so its listener is registered first - because
 *     the press that skips must not also be the start screen's Escape (the
 *     way out to the arcade) or Enter. A tap lands on the curtain itself,
 *     which covers every button.
 *   - Delay the game. It is a curtain, not a gate: the module graph and the
 *     attract sky boot underneath while it plays.
 *   - Play for someone who has asked for less motion: prefers-reduced-motion
 *     means the script does nothing at all.
 *
 * A classic script, self-contained, importing nothing: if anything in the
 * module graph fails, the curtain must still lift. Every frame runs inside a
 * try, a hard timeout removes the curtain whatever happens, and a failure
 * here leaves the game exactly as it was without it. The shape is
 * geometry_pong's js/intro.js.
 *
 * Canvas 2D, devicePixelRatio capped at 2. Everything on screen is a pure
 * function of the clock, so nothing is allocated or kept in the frame loop.
 */
(function () {
  'use strict';

  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch (e) {
    /* No matchMedia: play it. */
  }

  var NIGHT = '#05060f';
  var ICE = 'rgb(90,200,255)';

  // THE TIMELINE, in ms.
  var RISE = 500; // the comet comes up from the bottom edge to the orbit
  var SWING = 1150; // once round the star
  var FLY = 380; // flung up and off the top
  var LAND = RISE + SWING + 260; // the hand-off: the ring opens into a window
  var LAND_MS = 620;
  var SKIP_MS = 320;

  var canvas = document.createElement('canvas');
  canvas.id = 'intro';
  canvas.setAttribute('aria-hidden', 'true');
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var W = 0;
  var H = 0;
  var dpr = 1;

  // One soft disc, baked once, for the star and the comet.
  var glow = document.createElement('canvas');
  glow.width = glow.height = 128;
  var gctx = glow.getContext('2d');
  if (gctx) {
    var gg = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gg.addColorStop(0, 'rgba(255,255,255,0.95)');
    gg.addColorStop(0.14, 'rgba(120,205,255,0.7)');
    gg.addColorStop(0.45, 'rgba(90,200,255,0.2)');
    gg.addColorStop(1, 'rgba(90,200,255,0)');
    gctx.fillStyle = gg;
    gctx.fillRect(0, 0, 128, 128);
  }

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }
  function easeOut(x) {
    return 1 - Math.pow(1 - x, 3);
  }
  function easeIn(x) {
    return x * x * x;
  }

  var t0 = 0;
  var landAt = LAND;
  var landMs = LAND_MS;
  var done = false;
  var raf = 0;

  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', size);
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  function skip() {
    var now = t0 ? performance.now() - t0 : 0;
    if (now >= landAt) return;
    landAt = now;
    landMs = SKIP_MS;
  }

  function onKey(e) {
    // Skip, and let the press go no further: see the header.
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) skip();
  }

  function disc(x, y, r) {
    ctx.drawImage(glow, x - r, y - r, 2 * r, 2 * r);
  }

  function frame(now) {
    if (done) return;
    try {
      if (!t0) t0 = now;
      var t = now - t0;
      var land = clamp01((t - landAt) / landMs);
      if (land >= 1) {
        finish();
        return;
      }
      var tt = Math.min(t, landAt); // the story stops where a skip cut it
      var cx = W / 2;
      var cy = H / 2;
      var R = Math.min(W, H) * 0.2; // the orbit

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // The curtain; in the hand-off the ring is a window through it.
      ctx.fillStyle = NIGHT;
      ctx.fillRect(0, 0, W, H);
      var hole = R * (1 + easeIn(land) * (Math.hypot(W, H) / R));
      if (land > 0) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = clamp01(land * 2.5);
        ctx.beginPath();
        ctx.arc(cx, cy, hole, 0, 6.3);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      var fade = 1 - clamp01(land * 1.6);
      ctx.globalCompositeOperation = 'lighter';

      // The star, pulsing; brighter while it holds the comet.
      var swing = clamp01((tt - RISE) / SWING);
      var held = tt > RISE - 120 && swing < 1;
      ctx.globalAlpha = clamp01(tt / 250) * fade;
      disc(cx, cy, R * (held ? 0.6 : 0.42) * (1 + 0.06 * Math.sin(tt / 90)));

      // The ring the tail has drawn so far (and keeps, once drawn).
      var a0 = Math.PI / 2; // straight below the star, canvas angles
      var a1 = a0 - swing * 2 * Math.PI; // counter-clockwise on screen
      if (swing > 0) {
        ctx.strokeStyle = ICE;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.25 * fade;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(cx, cy, land > 0 ? hole : R, a0, a1, true);
        ctx.stroke();
        ctx.globalAlpha = 0.9 * fade;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // The comet: up from the bottom edge, round once, then off the top.
      var x, y;
      var fly = (tt - RISE - SWING) / FLY;
      if (tt < RISE) {
        x = cx;
        y = cy + R + (1 - easeOut(tt / RISE)) * (H / 2);
      } else if (swing < 1) {
        x = cx + R * Math.cos(a1);
        y = cy + R * Math.sin(a1);
      } else {
        // Leaves at the bottom of the ring, tangent, curving up the right side.
        x = cx + R * 2.2 * fly;
        y = cy + R - easeIn(clamp01(fly)) * (H / 2 + R * 2);
      }
      if (fly < 1.2) {
        if (held && tt > RISE) {
          ctx.globalAlpha = 0.8 * fade;
          ctx.strokeStyle = ICE;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        ctx.globalAlpha = fade;
        disc(x, y, R * 0.3);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    } catch (err) {
      finish();
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    size();
    window.addEventListener('resize', size);
    window.addEventListener('keydown', onKey, true);
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      skip();
    });
    document.body.appendChild(canvas);
    raf = requestAnimationFrame(frame);
    // Whatever happens to the frame loop, the curtain does not outstay this.
    setTimeout(finish, 6000);
  }

  // Loaded from the top of <body>, so the body exists even though the rest
  // of the page may not have been parsed yet.
  try {
    start();
  } catch (e) {
    finish();
  }
})();
