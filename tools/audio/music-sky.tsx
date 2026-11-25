// music-sky.tsx — Starswing's loop, "Night climb", in raea.
//
//   raea render music-sky.tsx -o out/music-sky.wav     (build.sh does; encode.mjs keeps the second pass)
//
// 120 bpm, sixteen bars (32 s), played twice. encode.mjs keeps exactly the second pass: it starts with the first
// pass's harp strings and reverb still ringing, so when the game loops it back to its own start the tails are
// there and the seam does not gap. raea's time 0 is the first sample, so no marker is needed to find it.
//
// C major, every chord diatonic, and none that a note of C major pentatonic would fight (no B7, no G7 with its F
// held against an E), because the melody is not here: it is the player's. Each catch plays the next note of a tune in that scale on the harp (js/audio.js TUNES), so
// the loop is the sky the tune is played in. The harp's eighths are the pulse to swing against; there are no
// drums.
//
//   bars 1-8   the low harp walks, the arpeggio turns in the middle register, the vibraphone comps the chords, and
//              now and then a glockenspiel star.
//   bars 9-16  the arpeggio climbs an octave, the mark tree turns over, and a wine glass sings a slow line that
//              comes back up to D, so the loop wants to go round to C again.
import { AbsoluteFill, Composition, Mix, registerRoot, staticFile } from "raea";
import * as Tone from "raea/tone";
import { kit } from "./kit.ts";

const BAR = 2; // seconds, at 120 bpm
const LOOP = 16 * BAR;
// Below 45 Hz the harp's lowest strings are rumble no tablet can play and every headphone can; and harp and
// vibraphone are warm instruments, so the bus leans a little toward the air above 2.5 kHz, where the sky's glow is.
const tilt = new Tone.EQ3({ low: -2, mid: 0, high: 3, lowFrequency: 200, highFrequency: 2500 }).connect(Tone.buses.music);
const { harp, vibes, glock, player, hall } = kit(new Tone.Filter({ type: "highpass", frequency: 45 }).connect(tilt));
const glass = new Tone.Sampler({
  urls: Object.fromEntries(["Ds4", "Fs4", "As4", "D5"].map((n) => [n.replace("s", "#"), staticFile(`sounds/vcsl-wine-glasses/${n}.wav`)])),
  attack: 0.12,
  release: 1.4,
  volume: -9,
}).connect(hall);

// [bass, vibraphone chord, eight harp eighths] a bar
type Bar = [string, string[], string[]];
const SONG: Bar[] = [
  ["C2", ["G3", "B3", "E4"], ["C3", "G3", "D4", "E4", "G4", "E4", "D4", "G3"]], // Cmaj9
  ["E1", ["G3", "B3", "D4"], ["E3", "B3", "D4", "G4", "B4", "G4", "D4", "B3"]], // Em7
  ["A1", ["G3", "C4", "E4"], ["A2", "E3", "B3", "C4", "E4", "C4", "B3", "E3"]], // Am9
  ["G1", ["G3", "C4", "E4"], ["G2", "E3", "A3", "C4", "E4", "C4", "A3", "E3"]], // Am7/G
  ["F1", ["A3", "C4", "E4"], ["F2", "C3", "G3", "A3", "C4", "A3", "G3", "C3"]], // Fmaj9
  ["E1", ["G3", "C4", "D4"], ["E2", "C3", "G3", "D4", "E4", "D4", "G3", "C3"]], // C/E
  ["D2", ["F3", "A3", "C4"], ["D3", "A3", "C4", "E4", "F4", "E4", "C4", "A3"]], // Dm9
  ["G1", ["G3", "C4", "D4"], ["G2", "D3", "G3", "C4", "D4", "C4", "G3", "D3"]], // Gsus4
  ["F1", ["A3", "C4", "E4"], ["F3", "C4", "E4", "G4", "A4", "G4", "E4", "C4"]], // Fmaj9, an octave up
  ["G1", ["B3", "D4", "E4"], ["G3", "D4", "E4", "G4", "B4", "G4", "E4", "D4"]], // G6
  ["E2", ["G3", "B3", "D4"], ["E3", "B3", "D4", "E4", "G4", "E4", "D4", "B3"]], // Em7
  ["A1", ["G3", "C4", "E4"], ["A3", "C4", "E4", "G4", "A4", "G4", "E4", "C4"]], // Am7
  ["D2", ["F3", "A3", "E4"], ["D3", "A3", "C4", "E4", "F4", "E4", "C4", "A3"]], // Dm9
  ["F1", ["A3", "E4", "G4"], ["F3", "C4", "G4", "A4", "C5", "A4", "G4", "C4"]], // Fmaj9
  ["G1", ["G3", "C4", "D4"], ["G3", "C4", "D4", "G4", "C5", "G4", "D4", "C4"]], // Gsus4
  ["G1", ["G3", "B3", "D4"], ["G3", "B3", "D4", "G4", "B4", "G4", "D4", "B3"]], // G, home to C
];
// the wine glass, bars 9-16: [bar, beat, note, beats]
const LINE: [number, number, string, number][] = [
  [8, 0, "A4", 2], [8, 2, "C5", 2], [9, 0, "D5", 4],
  [10, 0, "E5", 2], [10, 2, "D5", 2], [11, 0, "C5", 4],
  [12, 0, "D5", 2], [12, 2, "C5", 1], [12, 3, "A4", 1], [13, 0, "G4", 4],
  [14, 0, "A4", 2], [14, 2, "C5", 2], [15, 0, "D5", 4],
];
// the glockenspiel's stars: one or two soft notes off the beat, every other bar. VCSL names the glockenspiel an octave
// under where it sounds, so G5 here rings at G6. [bar, beat, note]
const STARS: [number, number, string][] = [
  [1, 3.5, "G5"], [3, 3.5, "E5"], [5, 3.5, "A5"], [7, 2.5, "D5"], [7, 3.5, "G5"],
  [9, 3.5, "E5"], [11, 3.5, "C6"], [13, 1.5, "A5"], [13, 3.5, "G5"], [15, 3.5, "D5"],
];
// a played part sits a few ms off the grid, the same few every pass
const late = (i: number) => (((i * 7) % 5) - 2) * 0.004;
// the arpeggio's shape: leaning on one and three, lighter between
const LEAN = [0.55, 0.3, 0.4, 0.32, 0.48, 0.3, 0.38, 0.28];

function pass(o: number) {
  SONG.forEach(([bass, chord, arp], b) => {
    const t = o + b * BAR;
    harp.triggerAttackRelease(bass, 1.8, t, 0.6);
    harp.triggerAttackRelease(Tone.Frequency(bass).transpose(7).toNote(), 0.9, t + 1 + late(b), 0.3);
    arp.forEach((n, i) => harp.triggerAttackRelease(n, 0.6, t + i * 0.25 + late(b * 8 + i), LEAN[i] * (b < 8 ? 0.9 : 1)));
    vibes.triggerAttackRelease(chord, 1.2, t + 0.01, 0.2);
    vibes.triggerAttackRelease(chord, 0.6, t + 0.75 + late(b + 3), 0.12);
  });
  STARS.forEach(([bar, beat, note], i) => glock.triggerAttackRelease(note, 0.3, o + bar * BAR + beat * 0.5 + late(i), 0.24));
  for (const [bar, beat, note, beats] of LINE) glass.triggerAttackRelease(note, beats * 0.5 - 0.05, o + bar * BAR + beat * 0.5, 0.5);
  player("vcsl-mark-trees", "windchimes_slowAsc1", -16, hall, { fadeIn: 0.3, fadeOut: 1.5 }).start(o + 8 * BAR - 0.6, 0, 4);
}
pass(0);
pass(LOOP);

function Silent() {
  return <AbsoluteFill style={{ background: "#000" }}><Mix lufs={-15} ceiling={-1} /></AbsoluteFill>;
}

registerRoot(() => <Composition id="music-sky" component={Silent} width={64} height={64} fps={30} durationInFrames={2 * LOOP * 30} />);
