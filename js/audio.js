/*
 * audio.js — the two buses, the mute, the composed cues and the play loop.
 *
 * Every sound is recorded instruments played by raea: tools/audio/cues.tsx
 * and music-sky.tsx, rendered and cut into audio/*.m4a by tools/audio/build.sh
 * (whose header says how; the owner chose raea over hub §9's Sonic Pi for
 * this game). This file only loads and plays them:
 *
 *   grab        a star is caught: a harp string on C4, played at the
 *               playbackRate of the next note of a melody (TUNES) with every
 *               NEW star in a row, so a streak plays a tune over the loop
 *               (which is in C); which tune, the streak's first star decides.
 *               One file and a rate, not eighty files (hub §9). From
 *               its last note on, while the streak holds, the bell doubles
 *               it an octave up: that, with render.js's gold tail, is what
 *               flow sounds and looks like. An old star breaks the streak
 *               with a low G, which leads back into the tune's first C.
 *   release     letting go: a brush of an ocean drum's beads.
 *   dust        stardust: a glockenspiel bell, climbing the same scale
 *               while the pieces keep coming.
 *   wall        the comet glances off the edge of the field: a slit drum.
 *   zone        250 m more: a mark tree and a harp sweep up onto chimes.
 *               The music ducks under it.
 *   over        the comet is lost: a gentle falling harp line, not a buzzer.
 *   best        ... or, when the run was a new record, a small fanfare.
 *   music-sky   a 32 s loop on the MUSIC bus while a run is on: harp,
 *               vibraphone, glockenspiel and a wine glass.
 *
 * The graph is   source → per-cue gain → sfxBus ┐
 *                source → track gain → duck → musicBus ┴→ master → out
 * Everything but the BufferSource is built once, so a cue allocates only the
 * one node WebAudio insists on per playback (a source cannot be restarted).
 *
 * Levels and mute persist under the hub's names (§2 "Two volumes", §6):
 * `starswing.vol.music.v1`, `starswing.vol.sfx.v1`, `starswing.mute.v1`, every access
 * in try/catch, anything but a finite number in 0–1 ignored. The slider sets
 * the bus gain itself; mute is master gain, so unmuting gives the mix back.
 *
 * The AudioContext is created lazily on the first gesture and resumed then
 * (iOS will not start one otherwise). Files load at that moment; a cue asked
 * for before its file has decoded, or whose file failed, is simply silent —
 * failures are a console.warn, never a rejection the crash bar would see.
 *
 * Copied from geometry_pong/js/audio.js, whose engine this is unchanged; the
 * cues, the trims and the event mapping are Starswing's own.
 */

const SLUG = 'starswing'; // these keys can never be renamed once shipped (hub §6)
const KEYS = { music: `${SLUG}.vol.music.v1`, sfx: `${SLUG}.vol.sfx.v1` };
const MUTE_KEY = `${SLUG}.mute.v1`;
// Resolved against this module, so the files are found wherever the page is.
const BASE = new URL('../audio/', import.meta.url);

// C major pentatonic in semitones above the cue's own note, two octaves up.
const NOTES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const RATES = NOTES.map((n) => Math.pow(2, n / 12));
const rate = (i) => RATES[Math.min(i, RATES.length - 1)];
// The streaks' melodies, in the same semitones. Each is four phrases of four
// and comes home to C5, so its last note is the arrival render.js blooms on;
// the player's catches are the rhythm, so each must be known by its shape
// alone, and no two start alike. Every note is in the pentatonic, so any of
// them fits any bar of the loop (the assert below holds them to both).
export const TUNE_LENGTH = 16;
const TUNES = [
  [0, 2, 4, 7, 9, 7, 4, 7, 9, 12, 14, 16, 19, 16, 14, 12], // climb: up, a sway, a peak, home down the opening turned over
  [0, 4, 2, 7, 4, 9, 7, 12, 9, 14, 12, 16, 14, 9, 7, 12], // wave: zigzags up a step at a time
  [4, 4, 7, 7, 9, 9, 7, 4, 12, 12, 14, 14, 16, 14, 12, 12], // echo: every note twice
  [12, 9, 7, 4, 7, 4, 2, 0, 2, 4, 7, 9, 12, 16, 14, 12], // fall: from high to low, and back up
  [0, 12, 7, 9, 4, 16, 12, 14, 7, 19, 16, 14, 12, 9, 7, 12], // leap: an octave up and a step, at three heights
];
console.assert(
  TUNES.every((t) => t.length === TUNE_LENGTH && t.at(-1) === 12 && t.every((n) => [0, 2, 4, 7, 9].includes(((n % 12) + 12) % 12))),
  'a tune is not 16 notes of C pentatonic ending on C5',
);
const TUNE_RATES = TUNES.map((t) => t.map((n) => Math.pow(2, n / 12)));
const AUDITION = TUNE_RATES.flat();
// The tune each seat's streak is playing. A streak's first star picks it by
// where that star is: nobody can see which it will be, and online every
// screen picks the same one, since an event's numbers cross the wire exact.
const tuneOf = [0, 0, 0, 0];
const pick = (e) => Math.floor(Math.abs(e.x * 31 + e.y * 17)) % TUNES.length;
const BROKEN = Math.pow(2, -5 / 12); // G3, a step that leads home to the tune's C

// Per-cue trims over the authored balance. encode-oneshots keeps the relative
// loudness set by `amp:` in the pieces, so these stay near 1 on purpose.
const CUES = { grab: 0.9, release: 1, dust: 0.55, wall: 0.5, zone: 0.9, over: 0.9, best: 1 };
const MUSIC = { file: 'music-sky', loop: 32 };
// The loop is normalised on its own to -1 dBFS; this sits it under the cues
// so the notes of the climb are the melody and the music is the sky.
const MUSIC_TRIM = 0.45;
const DUCK = 0.45; // the music under a zone or the fanfare, as a fraction
const FADE_IN = 1.2;
const FADE_OUT = 0.8;

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const v = raw == null ? NaN : Number(raw);
    if (Number.isFinite(v) && v >= 0 && v <= 1) return v;
  } catch {
    /* the default stands */
  }
  return fallback;
}

function save(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* not kept; this visit still has it */
  }
}

const levels = { music: load(KEYS.music, 0.7), sfx: load(KEYS.sfx, 0.8) };
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === 'true';
} catch {
  /* audible */
}

let ctx = null, master = null, sfxBus = null, musicBus = null, duck = null;
const cueGain = {}; // name → GainNode, built once
const buffers = {}; // name → AudioBuffer once decoded, null if it failed
const loading = {}; // name → Promise<AudioBuffer|null>, never rejects

let wanted = false; // the game asked for music
let previewing = false; // a MUSIC slider drag is auditioning it
let previewTimer = 0;
let track = null; // { source, gain } of the loop that is playing, if any
let lastAudition = 0;
let auditionNote = 0;

/* Callback and promise forms both, for older Safari's decodeAudioData. */
function decode(data) {
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(data, resolve, reject);
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

function fetchBuffer(name) {
  if (!loading[name]) {
    loading[name] = fetch(new URL(`${name}.m4a`, BASE))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then(decode)
      .then((b) => (buffers[name] = b))
      .catch((err) => {
        // Missing sound is a quieter game, not a broken one.
        console.warn(`audio: "${name}" unavailable`, err);
        return (buffers[name] = null);
      });
  }
  return loading[name];
}

function ensure() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  try {
    ctx = new AC();
    master = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    duck = ctx.createGain();
    duck.connect(musicBus);
    sfxBus.connect(master);
    musicBus.connect(master);
    master.connect(ctx.destination);
    for (const name in CUES) {
      cueGain[name] = ctx.createGain();
      cueGain[name].gain.value = CUES[name];
      cueGain[name].connect(sfxBus);
    }
    apply();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    ctx = null;
    return false;
  }
  for (const name in CUES) fetchBuffer(name);
  fetchBuffer(MUSIC.file);
  if (wanted) startMusic();
  return true;
}

function apply() {
  if (!ctx) return;
  master.gain.value = muted ? 0 : 1;
  sfxBus.gain.value = levels.sfx;
  musicBus.gain.value = levels.music;
}

/* Glide a param rather than jump it, so a drag or a mute never clicks. */
function glide(param, value) {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.setTargetAtTime(value, now, 0.03);
}

// The first touch, click or key anywhere unlocks audio. touchend and click
// are there for older iOS, which only unlocks inside those.
for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) {
  addEventListener(type, () => ensure(), { capture: true, passive: true });
}

function play(name, rate = 1) {
  if (!ctx || muted) return;
  const buffer = buffers[name];
  if (!buffer) return; // not decoded yet, or failed: silence
  try {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    src.connect(cueGain[name]);
    src.start();
  } catch {
    /* a cue that cannot play is skipped */
  }
}

/* Dip the music under a moment that matters, then let it come back. */
function duckMusic(hold) {
  if (!track) return;
  const g = duck.gain, now = ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(DUCK, now + 0.04);
  g.setValueAtTime(DUCK, now + hold);
  g.linearRampToValueAtTime(1, now + hold + 0.6);
}

// Some decoders keep the AAC encoder's priming silence at the front of the
// buffer; loop from the first real sample so the seam does not gap (hub §9).
function firstSound(buffer) {
  const data = buffer.getChannelData(0);
  const limit = Math.min(data.length, buffer.sampleRate * 0.2);
  for (let i = 0; i < limit; i++) if (Math.abs(data[i]) > 1e-4) return i / buffer.sampleRate;
  return 0;
}

function startMusic() {
  if (!ctx || track) return;
  const buffer = buffers[MUSIC.file];
  if (buffer === undefined) {
    // Still loading: try again once it lands, if it is still wanted then.
    fetchBuffer(MUSIC.file).then(() => {
      if ((wanted || previewing) && buffers[MUSIC.file]) startMusic();
    });
    return;
  }
  if (!buffer) return;
  try {
    const start = firstSound(buffer);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = start;
    source.loopEnd = Math.min(buffer.duration, start + MUSIC.loop);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(MUSIC_TRIM, now + FADE_IN);
    source.connect(gain);
    gain.connect(duck);
    source.start(now, start);
    track = { source, gain };
  } catch {
    track = null;
  }
}

function stopMusic(seconds = FADE_OUT) {
  if (!track) return;
  const { source, gain } = track;
  track = null;
  try {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + seconds);
    source.stop(now + seconds + 0.05);
  } catch {
    /* already stopped */
  }
}

export const audio = {
  isMuted: () => muted,
  setMuted(m) {
    muted = !!m;
    save(MUTE_KEY, muted);
    if (ctx) glide(master.gain, muted ? 0 : 1);
  },
  level: (bus) => levels[bus],
  /* A slider moved: store it, lift the mute, and let it be heard. */
  setLevel(bus, v) {
    if (!(bus in levels) || !Number.isFinite(v)) return;
    levels[bus] = Math.min(1, Math.max(0, v));
    save(KEYS[bus], levels[bus]);
    if (muted) this.setMuted(false);
    if (!ensure()) return;
    glide(bus === 'sfx' ? sfxBus.gain : musicBus.gain, levels[bus]);
    if (bus === 'sfx') {
      // Throttled on the audio clock, not the sim's, which is held while the
      // menu is open (hub §2). Each audition is the next note of the tunes, so
      // a long drag plays every melody a streak can.
      if (ctx.currentTime - lastAudition > 0.12) {
        lastAudition = ctx.currentTime;
        play('grab', AUDITION[auditionNote++ % AUDITION.length]);
      }
    } else {
      // MUSIC: the loop is stopped while the menu is open, so a drag brings
      // it in and lets it fade a moment after the drag ends.
      previewing = true;
      startMusic();
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => {
        previewing = false;
        if (!wanted) stopMusic();
      }, 1500);
    }
  },
  /* The play loop: true when a game starts or resumes, false otherwise. */
  music(on) {
    wanted = !!on;
    if (wanted) startMusic();
    else if (!previewing) stopMusic();
  },
  /* The end of a run: the fanfare for a record, else the gentle fall. */
  end(record) {
    wanted = false;
    if (!previewing) stopMusic(0.4);
    play(record ? 'best' : 'over');
  },
  /* The sim's events, as sound. The end is end()'s, not an event's. */
  event(e) {
    // Picked even in silence, so a streak unmuted halfway keeps its tune.
    if (e.type === 'grab' && e.fresh && e.chain === 1) tuneOf[e.who | 0] = pick(e);
    if (!ctx || muted) return;
    if (e.type === 'grab') {
      if (!e.fresh) return play('grab', BROKEN);
      const r = TUNE_RATES[tuneOf[e.who | 0]][(e.chain - 1) % TUNE_LENGTH];
      play('grab', r);
      if (e.chain >= TUNE_LENGTH) play('dust', r); // the bell, an octave up: flow
    } else if (e.type === 'dust') play('dust', rate(e.combo));
    else if (e.type === 'release') play('release');
    else if (e.type === 'wall') play('wall');
    // With friends: a comet lost falls like the end does, one back is a catch.
    else if (e.type === 'out') play('over');
    else if (e.type === 'join') play('grab');
    else if (e.type === 'zone') {
      play('zone');
      duckMusic(1.2);
    }
  },
};
