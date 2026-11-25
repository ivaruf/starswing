// Turns raea's two takes into starswing's shipped audio/*.m4a. cues.tsx and music-sky.tsx beside this file are the
// source of truth; the .m4a files are outputs, so re-render rather than edit them. build.sh runs the whole thing:
//
//   sh tools/audio/build.sh
//
// which renders out/cues.wav and out/music-sky.wav with raea and then runs `node encode.mjs out`.
//
// WHY TWO PATHS
//   Cues layer — a catch, a wall knock and a zone can land in one second — so their relative loudness is a design
//   decision, made here in LEVEL. They go through the hub's tools/audio/encode-oneshots.mjs, which trims, applies
//   ONE gain to the whole set and encodes mono. Music is the opposite: it is levelled on its own and kept stereo,
//   and its level against the cues is set at runtime (MUSIC_TRIM in js/audio.js), not baked in here.
//
// THE CUES
//   raea masters a render to one loudness, so the seven cues are one render (cues.tsx), cue i starting at i × SLOT
//   seconds in the order of CUES. Each is cut out here at its LEVEL: the dB that gives the set the balance the Sonic
//   Pi cues had (each cue's loudest 400 ms against zone's, measured 2026-11-25), which js/audio.js's per-cue trims
//   were tuned against. Single sampled notes need far more lift than chords: the library records them well under
//   full scale. The takes are 32-bit float, so the lift costs nothing.
//
// THE LOOP
//   music-sky.tsx plays its LOOP-second loop twice from time 0. We keep exactly the second pass: it already carries
//   the first pass's harp strings and reverb, so when it wraps back to its own start the tails are there and the
//   seam does not gap. It is levelled to LUFS (what the Sonic Pi loop measured, so MUSIC_TRIM still holds), unless
//   that would put a peak over PEAK_DB.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, statSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(here, "../..");
const HUB_ONESHOTS = path.resolve(GAME, "../tools/audio/encode-oneshots.mjs");

// The same order and slot as cues.tsx's ORDER and SLOT.
const CUES = ["grab", "release", "dust", "wall", "zone", "over", "best"];
const SLOT = 6;
const LEVEL = { grab: 8, release: 24, dust: 7, wall: 23, zone: 0, over: 2.5, best: -2 };
// 16 bars at 120 bpm.
const MUSIC = { "music-sky": { loop: 32, bitrate: "128k", lufs: -15, peakDb: -1 } };

const [wavDir, outDir = path.join(GAME, "audio")] = process.argv.slice(2);
if (!wavDir) {
  console.error("Usage: node tools/audio/encode.mjs WAV_DIR [OUT_DIR]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

function ffmpeg(args) {
  const run = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...args], { encoding: "utf8" });
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr}`);
  return run.stderr;
}

// --- cues: cut each out of the one take at its level, then hand the set to the hub tool ---
const cueTake = path.resolve(wavDir, "cues.wav");
statSync(cueTake); // fail loudly on a missing take rather than ship a short set
const cueDir = mkdtempSync(path.join(tmpdir(), "starswing-cues-"));
CUES.forEach((name, i) => {
  ffmpeg([
    "-ss", String(i * SLOT), "-t", String(SLOT), "-i", cueTake,
    // the hub tool finds a take's start as the end of the silence it opens with (Sonic Pi's lead-in), so give
    // every cue one: a cue that starts on its first sample would otherwise be cut at its first gap
    "-af", `adelay=100:all=1,volume=${LEVEL[name]}dB`, "-c:a", "pcm_f32le", path.join(cueDir, `${name}.wav`),
  ]);
});
const cues = spawnSync("node", [HUB_ONESHOTS, cueDir, outDir], { encoding: "utf8", stdio: "inherit" });
rmSync(cueDir, { recursive: true, force: true });
if (cues.status !== 0) process.exit(cues.status ?? 1);

// --- music: cut the second pass and level it on its own ---
for (const [name, spec] of Object.entries(MUSIC)) {
  const input = path.join(wavDir, `${name}.wav`);
  const cut = `atrim=start=${spec.loop}:end=${2 * spec.loop},asetpts=PTS-STARTPTS`;
  const log = ffmpeg(["-i", input, "-af", `${cut},astats=measure_overall=Peak_level:measure_perchannel=none,ebur128`, "-f", "null", "-"]);
  const peak = +(log.match(/Peak level dB:\s*(-?[\d.]+)/)?.[1] ?? 0);
  const lufs = +(log.match(/I:\s+(-?[\d.]+) LUFS/g)?.pop()?.match(/-?[\d.]+/)?.[0] ?? NaN);
  if (!Number.isFinite(lufs)) throw new Error(`${name}: no loudness measured (take too short for two loops?)`);
  const gain = Math.min(spec.lufs - lufs, spec.peakDb - peak).toFixed(2);
  const output = path.join(outDir, `${name}.m4a`);
  ffmpeg([
    "-i", input,
    "-af", `${cut},afade=t=in:st=0:d=0.006,afade=t=out:st=${spec.loop - 0.006}:d=0.006,volume=${gain}dB`,
    "-ac", "2", "-ar", "48000", "-c:a", "aac", "-b:a", spec.bitrate, "-movflags", "+faststart",
    output,
  ]);
  console.log(`${name.padEnd(12)} loop ${spec.loop}s, ${lufs} LUFS, peak ${peak} dB, ${gain} dB gain`);
}

let total = 0;
for (const f of readdirSync(outDir)) if (f.endsWith(".m4a")) total += statSync(path.join(outDir, f)).size;
console.log(`\nshipped audio: ${(total / 1024).toFixed(0)} KB in ${outDir}`);
