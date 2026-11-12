/*
 * render.js — the sky. Canvas 2D, everything that glows drawn additively
 * ('lighter') from a handful of soft discs baked once at start-up.
 *
 * Back to front: the night and its nebula (one baked picture per zone
 * colour, cross-faded when the zone changes), two layers of far stars that
 * slide at different speeds, the field's edges, dust, the stars, the beam,
 * the comet's tail, the comet, sparks and rings, the glow of the bottom
 * edge when it is close, and the HUD: points top left, clear of the three
 * corner plates top right.
 *
 * `shape()` picks the sim's field for this screen (sim.js header); a run
 * keeps the field it started with, so turning the device mid-run letterboxes
 * the same sky rather than changing the game under the player.
 *
 * TOGETHER (sim.js header). With more than one comet in the sky each wears
 * its seat's colour (PC), in its glow, beam, tail and sparks; alone, the
 * comet wears the zone's colour as it always did. On one shared screen
 * (`o.strips`) each player's strip of the glass carries a bar of their colour
 * along the bottom, and "Hold here" while their comet is parked.
 *
 * RACE (sim.js header). `g.race` holds the clock and every seat's height, and
 * the comet that is not `o.mine` is a ghost: faint, no beam, no target, the
 * same stars underneath it because every racer's sky grows from one seed. The
 * HUD is the height, the clock, and, online, where everybody else is. On one
 * screen main.js runs one renderer per player, each drawing its own column
 * (`o.box`); the baked pictures are shared between them.
 *
 * `g` may be the sim's own game or a frame decoded off the wire
 * (js/net/protocol.js unpackFrame): draw() reads only what both carry.
 *
 * Nothing is allocated in draw(): sparks, rings and the tail live in typed
 * arrays written round-robin (hub §10). devicePixelRatio capped at 2.
 */

import { ZONE, RACE, score, metres, target } from './sim.js';
import { t } from './i18n.js';

// One accent per zone, cycling: ice, violet, rose, amber, aurora.
const ZONES = [[90, 200, 255], [170, 130, 255], [255, 110, 190], [255, 190, 90], [110, 255, 170]];
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const ACCENT = ZONES.map((c) => css(c));
// A seat's colour, as an index into ZONES: blue, pink, yellow, green.
export const PC = [0, 2, 3, 4];
export const SEAT_CSS = PC.map((i) => ACCENT[i]);
const GOLD = [255, 214, 120];
const RED = [255, 70, 90];
const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function disc(c, core = 0.12, rays = false) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(core, css(c, 0.75));
  g.addColorStop(0.45, css(c, 0.2));
  g.addColorStop(1, css(c, 0));
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  if (rays) {
    // A four-point sparkle: two thin beams that fade to nothing at the rim.
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) {
      const b = i ? x.createLinearGradient(64, 0, 64, 128) : x.createLinearGradient(0, 64, 128, 64);
      b.addColorStop(0, css(c, 0));
      b.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      b.addColorStop(1, css(c, 0));
      x.fillStyle = b;
      if (i) x.fillRect(63, 0, 2, 128);
      else x.fillRect(0, 63, 128, 2);
    }
  }
  return cv;
}

/* A zone's nebula: big soft clouds of its colour on the night. Baked at half
   the screen's size, on resize: baked small and stretched far, the 8-bit
   steps of so faint a gradient show as a grid of facets. `blobs` are fixed
   per zone, so a resize redraws the same clouds. */
function nebula(c, blobs, w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const x = cv.getContext('2d');
  x.fillStyle = '#05060f';
  x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'lighter';
  const m = Math.max(w, h);
  blobs.forEach(([fx, fy, fr], i) => {
    const col = i % 3 === 2 ? [c[2], c[0], c[1]] : c; // a third of them in a cousin colour
    const g = x.createRadialGradient(fx * w, fy * h, 0, fx * w, fy * h, fr * m);
    g.addColorStop(0, css(col, 0.16));
    g.addColorStop(1, css(col, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  });
  return cv;
}

function farStars() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const x = cv.getContext('2d');
  for (let i = 0; i < 70; i++) {
    x.globalAlpha = 0.25 + Math.random() * 0.6;
    x.fillStyle = Math.random() < 0.2 ? '#ffe9c4' : '#dfe8ff';
    const r = Math.random() < 0.1 ? 1.3 : 0.7;
    x.beginPath();
    x.arc(Math.random() * 256, Math.random() * 256, r, 0, 6.3);
    x.fill();
  }
  return cv;
}

/* The field for this screen (or one column of it): 600 wide and as tall as
   it makes it when upright, 720 tall and as wide as it makes it sideways. */
export function shape(w = innerWidth, h = innerHeight) {
  const a = w / Math.max(1, h);
  if (a < 1) return { w: 600, view: Math.min(1300, Math.max(760, 600 / a)) };
  return { w: Math.min(1300, Math.max(600, 720 * a)), view: 720 };
}

/* The baked pictures, once for every renderer: a race on one screen runs one
   per column, and four sets of half-screen nebulae would be tens of MB. */
let art = null;
function bake() {
  if (!art) {
    art = {
      glow: ZONES.map((c) => disc(c)),
      glowWhite: disc([190, 215, 255]),
      star: disc([190, 215, 255], 0.12, true), // a star nobody has caught yet
      starLit: ZONES.map((c) => disc(c, 0.12, true)), // ... and one somebody has
      glowGold: disc(GOLD, 0.2),
      glowRed: disc(RED, 0.05),
      blobs: ZONES.map(() => Array.from({ length: 9 }, () => [Math.random(), Math.random(), 0.25 + Math.random() * 0.35])),
      far: farStars(),
      clouds: [],
      cw: 0,
      ch: 0,
    };
  }
  return art;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const A = bake();
  const { glow, glowWhite, star, starLit, glowGold, glowRed, far } = A;
  let CW = 0, CH = 0, dpr = 1; // the canvas, in CSS px
  let danger = null;

  const N = 320; // sparks: x, y, vx, vy, life, span, colour (-1 gold, -2 white, else zone)
  const sp = new Float32Array(N * 7);
  let spI = 0;
  const RN = 10; // rings: x, y, age, span, colour
  const rg = new Float32Array(RN * 5).fill(9);
  let rgI = 0;
  const TN = 44; // the tails, in world units: one per seat
  const tail = new Float32Array(4 * TN * 2);
  const tailI = new Uint8Array(4), tailN = new Uint8Array(4);
  const tgt = [null, null, null, null]; // the star each comet's hold would catch
  let shake = 0, banner = 0, bannerN = 0, zoneFade = 1, zonePrev = 0, zoneNow = 0;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    CW = innerWidth;
    CH = innerHeight;
    canvas.width = Math.round(CW * dpr);
    canvas.height = Math.round(CH * dpr);
    if (A.cw !== CW || A.ch !== CH) {
      A.clouds = ZONES.map((c, i) => nebula(c, A.blobs[i], Math.ceil(CW / 2), Math.ceil(CH / 2)));
      A.cw = CW;
      A.ch = CH;
    }
    // Columns are always full height, so one gradient serves every one.
    danger = ctx.createLinearGradient(0, CH - 150, 0, CH);
    danger.addColorStop(0, 'rgba(255,60,90,0)');
    danger.addColorStop(1, 'rgba(255,60,90,0.55)');
  }
  resize();

  function spark(x, y, speed, n, colour, span = 0.7) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, v = speed * (0.3 + Math.random() * 0.7), o = spI * 7;
      sp[o] = x; sp[o + 1] = y; sp[o + 2] = Math.cos(a) * v; sp[o + 3] = Math.sin(a) * v;
      sp[o + 4] = sp[o + 5] = span * (0.5 + Math.random() * 0.5); sp[o + 6] = colour;
      spI = (spI + 1) % N;
    }
  }
  function ring(x, y, span, colour) {
    const o = rgI * 5;
    rg[o] = x; rg[o + 1] = y; rg[o + 2] = 0; rg[o + 3] = span; rg[o + 4] = colour;
    rgI = (rgI + 1) % RN;
  }

  function reset() {
    sp.fill(0);
    rg.fill(9);
    tailN.fill(0);
    shake = banner = 0;
    zoneFade = 1;
    zonePrev = zoneNow = 0;
  }

  /* One sim event, as light. */
  function event(e, g) {
    // Sparks in the comet's own colour when there are several, else the zone's.
    const z = g.comets.length > 1 && e.who != null ? PC[e.who] : g.zone % ZONES.length;
    if (e.type === 'grab') {
      ring(e.x, e.y, 0.5, z);
      spark(e.x, e.y, e.fresh ? 220 : 90, e.fresh ? 16 : 5, z);
    } else if (e.type === 'release') spark(e.x, e.y, 120, 5, -2, 0.4);
    else if (e.type === 'dust') spark(e.x, e.y, 150, 7, -1, 0.5);
    else if (e.type === 'wall') spark(e.x, e.y, 160, 6, z, 0.4);
    else if (e.type === 'zone') {
      banner = 2.4;
      bannerN = e.n * (ZONE / 10);
      ring(e.x, e.y, 1.4, z);
      spark(e.x, e.y, 420, 40, z, 1.1);
    } else if (e.type === 'join') {
      ring(e.x, e.y, 0.7, z);
      spark(e.x, e.y, 200, 14, z, 0.6);
    } else if (e.type === 'out') {
      shake = 0.2;
      ring(e.x, e.y, 0.6, -2);
      spark(e.x, e.y, 380, 40, z, 1);
    } else if (e.type === 'over') {
      shake = 0.5;
      ring(e.x, e.y, 0.9, -2);
      spark(e.x, e.y, 480, 70, z, 1.2);
      spark(e.x, e.y, 300, 30, -2, 0.9);
    }
  }

  function sprite(img, x, y, r) {
    ctx.drawImage(img, x - r, y - r, 2 * r, 2 * r);
  }

  /* One view of the sky: the whole canvas, or one column of it when `o.box`
     is [x, width] in CSS px. */
  function draw(g, time, dt, o) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!o.box) return paint(g, time, dt, o, 0, CW, CH);
    const x = o.box[0], w = o.box[1];
    ctx.save();
    ctx.translate(x, 0);
    ctx.beginPath();
    ctx.rect(0, 0, w, CH);
    ctx.clip();
    paint(g, time, dt, o, x, w, CH);
    ctx.restore();
    if (x > 0) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(150,190,255,0.3)';
      ctx.fillRect(x - 0.5, 0, 1, CH);
    }
  }

  function paint(g, time, dt, o, bx, W, H) {
    const s = Math.min(W / g.w, H / g.view); // world units to CSS px
    const ox = (W - g.w * s) / 2;
    const oy = H - (H - g.view * s) / 2;
    const X = (x) => ox + x * s;
    const Y = (y) => oy - (y - g.camY) * s;
    const alive = g.status !== 'over';
    const multi = g.comets.length > 1;
    // The sky's colour follows the game's zone, not the event: a guest that
    // joins at 800 m never heard the three zone events before it.
    if (g.zone % ZONES.length !== zoneNow) {
      zonePrev = zoneNow;
      zoneNow = g.zone % ZONES.length;
      zoneFade = 0;
    }

    if (shake > 0) {
      shake -= dt;
      ctx.translate((Math.random() - 0.5) * 24 * shake, (Math.random() - 0.5) * 24 * shake);
    }

    // The night and its nebula.
    zoneFade = Math.min(1, zoneFade + dt * 0.6);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // A column shows its own part of the one nebula behind the whole screen.
    ctx.drawImage(A.clouds[zonePrev], bx / 2, 0, W / 2, H / 2, -20, -20, W + 40, H + 40);
    if (zoneFade > 0) {
      ctx.globalAlpha = zoneFade;
      ctx.drawImage(A.clouds[zoneNow], bx / 2, 0, W / 2, H / 2, -20, -20, W + 40, H + 40);
    }
    // Far stars, two depths.
    for (let layer = 0; layer < 2; layer++) {
      const T = layer ? 420 : 256;
      const off = (g.camY * s * (layer ? 0.22 : 0.1)) % T;
      ctx.globalAlpha = layer ? 0.9 : 0.6;
      for (let y = off - T; y < H; y += T) for (let x = 0; x < W; x += T) ctx.drawImage(far, x, y, T, T);
    }

    ctx.globalCompositeOperation = 'lighter';
    // The field's edges, where the comet bounces.
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = ACCENT[zoneNow];
    ctx.fillRect(X(0) - 2, 0, 2, H);
    ctx.fillRect(X(g.w), 0, 2, H);

    // Dust.
    for (const d of g.dust) {
      if (d.taken) continue;
      const y = Y(d.y);
      if (y < -20 || y > H + 20) continue;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 5 + d.x);
      sprite(glowGold, X(d.x), y, 11 * s);
    }

    // Stars.
    for (let i = 0; i < 4; i++) {
      const c = g.comets[i];
      tgt[i] = c && alive && c.status === 'play' && !c.tether && !o.attract && (o.mine < 0 || o.mine === i) ? target(g, c) : null;
    }
    for (const st of g.stars) {
      const x = X(st.x), y = Y(st.y);
      if (y < -80 || y > H + 80) continue;
      const pulse = 1 + 0.08 * Math.sin(time * 3 + st.y);
      if (st.dark) {
        ctx.globalAlpha = 0.9;
        sprite(glowRed, x, y, 44 * s * pulse);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#05060f';
        ctx.beginPath();
        ctx.arc(x, y, 15 * s, 0, 6.3);
        ctx.fill();
        ctx.strokeStyle = 'rgb(255,70,90)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        continue;
      }
      let held = false;
      for (const c of g.comets) if (c.tether === st) held = true;
      ctx.globalAlpha = held ? 1 : st.lit ? 0.55 : 0.85;
      sprite(st.lit ? starLit[zoneNow] : star, x, y, (held ? 74 : 52) * s * pulse);
      for (let i = 0; i < 4; i++) {
        if (st !== tgt[i]) continue;
        const c = g.comets[i];
        // The star a hold would catch: a turning dashed ring and a faint line.
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = multi ? ACCENT[PC[i]] : '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 7]);
        ctx.lineDashOffset = -time * 30;
        ctx.beginPath();
        ctx.arc(x, y, 24 * s, 0, 6.3);
        ctx.stroke();
        ctx.globalAlpha = 0.22;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(X(c.x), Y(c.y));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Each comet: its beam, its tail (the last TN places it was, widest and
    // brightest at the head), then itself.
    for (let i = 0; i < g.comets.length; i++) {
      const c = g.comets[i];
      if (!alive || (c.status !== 'parked' && c.status !== 'play')) {
        tailN[i] = 0;
        continue;
      }
      const k = multi ? PC[i] : zoneNow;
      // Racing, everybody else is a ghost in this sky (see the header).
      const fade = g.race && i !== o.mine ? 0.3 : 1;
      ctx.strokeStyle = ACCENT[k];
      if (c.tether && fade === 1) {
        ctx.lineCap = 'round';
        for (let pass = 0; pass < 2; pass++) {
          ctx.globalAlpha = pass ? 0.9 : 0.25;
          ctx.lineWidth = pass ? 2 : 8;
          ctx.beginPath();
          ctx.moveTo(X(c.tether.x), Y(c.tether.y));
          ctx.lineTo(X(c.x), Y(c.y));
          ctx.stroke();
        }
      }
      const T = i * TN * 2;
      tail[T + tailI[i] * 2] = c.x;
      tail[T + tailI[i] * 2 + 1] = c.y;
      tailI[i] = (tailI[i] + 1) % TN;
      if (tailN[i] < TN) tailN[i]++;
      ctx.lineCap = 'butt'; // round caps overlap additively and bead the tail
      for (let j = 1; j < tailN[i]; j++) {
        const a = (tailI[i] - j + TN) % TN, b = (tailI[i] - j - 1 + TN) % TN;
        const f = 1 - j / tailN[i];
        ctx.globalAlpha = f * 0.8 * fade;
        ctx.lineWidth = (1 + 9 * f) * s;
        ctx.beginPath();
        ctx.moveTo(X(tail[T + a * 2]), Y(tail[T + a * 2 + 1]));
        ctx.lineTo(X(tail[T + b * 2]), Y(tail[T + b * 2 + 1]));
        ctx.stroke();
      }
      ctx.globalAlpha = fade;
      sprite(glow[k], X(c.x), Y(c.y), 34 * s);
      sprite(glowWhite, X(c.x), Y(c.y), 16 * s);
      // Online, several comets may circle one star: a ring says which is yours.
      if (i === o.mine && c.status === 'parked') {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(X(c.x), Y(c.y), 20 * s, 0, 6.3);
        ctx.stroke();
      }
    }

    // Sparks and rings.
    for (let i = 0; i < N; i++) {
      const p = i * 7;
      if (sp[p + 4] <= 0) continue;
      sp[p + 4] -= dt;
      sp[p] += sp[p + 2] * dt;
      sp[p + 1] += sp[p + 3] * dt;
      sp[p + 3] -= 260 * dt;
      const f = Math.max(0, sp[p + 4] / sp[p + 5]);
      ctx.globalAlpha = f;
      const k = sp[p + 6];
      sprite(k === -1 ? glowGold : k === -2 ? glowWhite : glow[k], X(sp[p]), Y(sp[p + 1]), (3 + 6 * f) * s);
    }
    for (let i = 0; i < RN; i++) {
      const p = i * 5;
      if (rg[p + 2] >= rg[p + 3]) continue;
      rg[p + 2] += dt;
      const f = rg[p + 2] / rg[p + 3];
      ctx.globalAlpha = (1 - f) * 0.8;
      ctx.strokeStyle = rg[p + 4] < 0 ? '#ffffff' : ACCENT[rg[p + 4]];
      ctx.lineWidth = 1 + 5 * (1 - f);
      ctx.beginPath();
      ctx.arc(X(rg[p]), Y(rg[p + 1]), (20 + 260 * rg[p + 3] * (1 - (1 - f) * (1 - f))) * s, 0, 6.3);
      ctx.stroke();
    }

    // The bottom edge glows as it closes on a comet in free flight.
    if (alive && !o.attract) {
      let near = 0;
      for (let i = 0; i < g.comets.length; i++) {
        const c = g.comets[i];
        if (c.status === 'play' && (o.mine < 0 || o.mine === i)) near = Math.max(near, 1 - (c.y - g.camY) / 260);
      }
      if (near > 0) {
        ctx.globalAlpha = Math.min(1, near);
        ctx.fillStyle = danger;
        ctx.fillRect(0, H - 150, W, 150);
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (o.attract) return;

    // HUD: points, then the best, top left.
    const pad = 16;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#eef2ff';
    ctx.font = `800 34px ${FONT}`;
    const r = g.race;
    if (r) {
      // Racing: the height is the score, then the clock, red for the last ten.
      ctx.fillText(`${metres(g)} m`, pad, pad);
      const secs = Math.ceil(Math.min(r.left, RACE));
      ctx.font = `700 20px ${FONT}`;
      ctx.fillStyle = secs <= 10 ? 'rgb(255,120,140)' : 'rgba(200,210,240,0.85)';
      ctx.fillText(`${Math.floor(secs / 60)}:${secs % 60 < 10 ? '0' : ''}${secs % 60}`, pad, pad + 40);
      // Online there is no other column to glance at: everyone's height.
      let racers = 0;
      for (const c of g.comets) if (c.status !== 'none') racers++;
      if (!o.box && racers > 1) {
        ctx.font = `700 14px ${FONT}`;
        let y = pad + 70;
        for (let i = 0; i < g.comets.length; i++) {
          if (g.comets[i].status === 'none') continue;
          ctx.fillStyle = ACCENT[PC[i]];
          ctx.fillText(`● ${r.metres[i]} m`, pad, y);
          y += 19;
        }
      }
    } else {
      ctx.fillText(String(score(g)), pad, pad);
      ctx.font = `600 13px ${FONT}`;
      ctx.fillStyle = 'rgba(200,210,240,0.7)';
      ctx.fillText(t('hud.line', metres(g), o.best), pad, pad + 40);
    }

    ctx.textAlign = 'center';
    // The countdown, in the middle of every racer's sky, then "Go!" fading.
    const count = r ? r.left - RACE : -1;
    if (count > -0.8 && alive) {
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = count > 0 ? 1 - (Math.ceil(count) - count) * 0.6 : 1 + count / 0.8;
      ctx.font = `800 ${Math.min(110, W / 3)}px ${FONT}`;
      ctx.fillStyle = ACCENT[multi && o.mine >= 0 ? PC[o.mine] : zoneNow];
      ctx.fillText(count > 0 ? String(Math.ceil(count)) : t('race.go'), W / 2, H * 0.42);
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'top';
    }
    // The zone banner: the height just passed, in the new colour.
    if (banner > 0) {
      banner -= dt;
      ctx.globalAlpha = Math.min(1, banner, (2.4 - banner) * 4);
      ctx.font = `800 ${Math.min(64, W / 6)}px ${FONT}`;
      ctx.fillStyle = ACCENT[zoneNow];
      ctx.fillText(`${bannerN} m`, W / 2, H * 0.24);
      ctx.globalAlpha = 1;
    }
    const bob = (0.5 + 0.5 * Math.sin(time * 3)) * 5;
    if (o.strips) {
      // One shared screen: each strip of the glass is one player's button.
      const sw = W / o.strips;
      for (let i = 0; i < o.strips; i++) {
        const c = g.comets[i];
        ctx.fillStyle = ACCENT[PC[i]];
        ctx.globalAlpha = 0.7;
        ctx.fillRect(i * sw + 6, H - 5, sw - 12, 3);
        if (!alive || c.status !== 'parked') continue;
        ctx.globalAlpha = 1;
        ctx.font = `700 ${sw < 130 ? 14 : 18}px ${FONT}`;
        ctx.fillText(t('hint.strip'), (i + 0.5) * sw, H - 64 - bob);
        if (o.keys) {
          ctx.font = `600 13px ${FONT}`;
          ctx.fillText(o.keys[i], (i + 0.5) * sw, H - 40 - bob);
        }
      }
      ctx.globalAlpha = 1;
      return;
    }
    // What the one button does, until two stars have been caught; and, with
    // friends, whenever this comet is waiting or gone.
    const c = g.comets[o.mine < 0 ? 0 : o.mine];
    let key = null;
    if (!alive || !c) key = null;
    else if (c.status === 'out') key = r ? 'hint.back' : 'hint.out';
    else if (g.grabs < 2 || ((multi || r) && c.status === 'parked')) key = c.status === 'parked' ? 'hint.hold' : c.tether ? 'hint.release' : 'hint.grab';
    if (key) {
      ctx.font = `700 ${W < 360 ? 14 : W < 500 ? 17 : 20}px ${FONT}`;
      ctx.fillStyle = 'rgba(238,242,255,0.92)';
      ctx.fillText(t(key), W / 2, H - 64 - bob);
      // A column's key, on a keyboard (main.js KEYS).
      if (o.key && c.status === 'parked') {
        ctx.font = `600 13px ${FONT}`;
        ctx.fillText(o.key, W / 2, H - 40 - bob);
      }
    }
    // Racing with others: a bar of this player's colour along the bottom.
    if (r && multi && c) {
      ctx.fillStyle = ACCENT[PC[o.mine]];
      ctx.globalAlpha = 0.7;
      ctx.fillRect(6, H - 5, W - 12, 3);
      ctx.globalAlpha = 1;
    }
  }

  return { resize, reset, event, draw };
}
