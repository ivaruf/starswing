// cues.tsx — Starswing's seven cues in raea, one take holding all of them.
//
//   raea render cues.tsx -o out/cues.wav     (build.sh does; encode.mjs then cuts it every SLOT seconds)
//
// They are rendered together on purpose. raea masters a render to one loudness, so seven renders would come out
// equally loud and lose the balance written here; one render has one master gain, and the hub's encode-oneshots.mjs
// keeps it (one gain for the whole set). Cue i starts at i × SLOT, in the order of ORDER; encode.mjs cuts at the same.
//
// Every cue is in C, because js/audio.js plays grab and dust at playback rates up C major pentatonic (two octaves)
// over a loop in C: grab's root is C4 and dust's C5, so a good climb plays a rising tune on the harp and the bells.
import { AbsoluteFill, Composition, Mix, registerRoot } from "raea";
import * as Tone from "raea/tone";
import { kit } from "./kit.ts";

const ORDER = ["grab", "release", "dust", "wall", "zone", "over", "best"] as const;
const SLOT = 6;
const at = (name: (typeof ORDER)[number]) => ORDER.indexOf(name) * SLOT;

// One kit for all seven: raea allows 31 instruments and buses in a graph, so a kit per cue does not fit. Each cue's
// level is therefore set where encode.mjs cuts the take (its LEVEL), not here.
const { harp, glock, vibes, chimes, player, room, airy } = kit(Tone.buses.sfx);

// grab — a star is caught: a harp string with the vibraphone's octave under it and a glint of glockenspiel on top.
{
  const t = at("grab");
  harp.triggerAttackRelease("C4", 1.1, t, 0.9);
  vibes.triggerAttackRelease("C5", 0.5, t + 0.004, 0.3);
  glock.triggerAttackRelease("C6", 0.2, t + 0.008, 0.12);
}

// release — letting go: a short brush of beads, the air the comet leaves behind. It happens every few seconds.
{
  const t = at("release");
  player("vcsl-ocean-drum", "OceanDrum_Sus_2_Mid", -6, airy, { fadeIn: 0.06, fadeOut: 0.2 }).start(t, 3.1, 0.42);
}

// dust — stardust: one glockenspiel bell on C5, its echo trailing.
{
  const t = at("dust");
  glock.triggerAttackRelease("C5", 0.25, t, 0.55);
}

// wall — the comet glances off the edge of the field: a low wooden knock with a soft skin under it.
{
  const t = at("wall");
  player("vcsl-slit-drum", "LogDrumLo_MedM_v1_rr1_Sum", -4, room).start(t);
  player("vcsl-frame-drum", "HDrumS_HitMuted_v2_rr1_Sum", -10, room).start(t);
}

// zone — 250 m more and the sky changes colour: the mark tree runs up, the harp sweeps C major pentatonic, and an
// open chord of chimes and vibraphone is where it lands.
{
  const t = at("zone");
  player("vcsl-mark-trees", "windchimes_fastAsc1", -8, undefined, { fadeOut: 0.9 }).start(t, 0, 2.6);
  ["C4", "D4", "E4", "G4", "A4", "C5", "D5", "E5", "G5", "A5", "C6"].forEach((n, i) =>
    harp.triggerAttackRelease(n, 1.4, t + i * 0.055, 0.45 + i * 0.03));
  const land = t + 11 * 0.055;
  chimes.triggerAttackRelease(["C5", "G5"], 2.2, land, 0.55);
  vibes.triggerAttackRelease(["C3", "G3", "D4"], 2, land, 0.4);
}

// over — the comet is lost: a gentle falling line on the harp that settles home on C. "Again?", not a buzzer.
{
  let t = at("over");
  for (const [n, d] of [["A4", 0.22], ["G4", 0.22], ["E4", 0.22], ["D4", 0.3], ["C4", 0.9]] as const) {
    harp.triggerAttackRelease(n, d + 0.8, t, 0.75);
    vibes.triggerAttackRelease(Tone.Frequency(n).transpose(-12).toNote(), d + 0.4, t + 0.006, 0.22);
    t += d;
  }
  chimes.triggerAttackRelease("C4", 2.2, t - 0.9, 0.4);
  vibes.triggerAttackRelease(["C3", "G3"], 1.8, t - 0.9, 0.3);
}

// best — a new record: the harp runs up C major, the chimes ring the chord, glockenspiel stars on top, and the mark
// tree spills down over the end.
{
  const t = at("best");
  ["C4", "E4", "G4", "C5", "E5", "G5"].forEach((n, i) => harp.triggerAttackRelease(n, 1.6, t + i * 0.09, 0.6 + i * 0.05));
  const top = t + 6 * 0.09;
  harp.triggerAttackRelease(["C3", "G3", "C6"], 2.4, top, 0.85);
  chimes.triggerAttackRelease(["C4", "E4", "C5"], 3, top, 0.6);
  vibes.triggerAttackRelease(["C3", "G3", "E4", "B4"], 2.6, top, 0.35);
  ["G5", "C6", "E6", "G6", "C7"].forEach((n, i) => glock.triggerAttackRelease(n, 0.3, top + 0.25 + i * 0.08, 0.3));
  player("vcsl-mark-trees", "windchimes_desc1", -10, undefined, { fadeIn: 0.1, fadeOut: 1.2 }).start(top + 0.5, 0, 3);
}

function Silent() {
  // no picture: the render is only its sound. Quiet enough that the master's ceiling never has to limit a cue.
  return <AbsoluteFill style={{ background: "#000" }}><Mix lufs={-20} ceiling={-1} /></AbsoluteFill>;
}

registerRoot(() => <Composition id="cues" component={Silent} width={64} height={64} fps={30} durationInFrames={ORDER.length * SLOT * 30} />);
