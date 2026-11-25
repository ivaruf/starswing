/*
 * kit.ts — Starswing's instruments, for raea (cues.tsx and music-sky.tsx).
 *
 * Every sound in the game is a recorded instrument from the Versilian
 * Community Sample Library (CC0, no credit needed), fetched by build.sh with
 * `raea sounds get` into media/sounds/ (ignored by git). The sky is glass and
 * light, so the band is too: a concert harp, a glockenspiel, a vibraphone,
 * hand chimes and a mark tree, with a slit drum for the edge of the field and
 * an ocean drum's beads for the air a comet leaves behind.
 *
 * Call kit() once, at the top level of a composition, where raea builds the
 * audio graph. Each instrument gets its own short room rather than one long
 * wash over the bus (raea's music guide: a long reverb on everything is how a
 * score turns into a drone).
 */
import { staticFile } from "raea";
import * as Tone from "raea/tone";

// VCSL names a sharp with an s (Gs3.wav is G#3).
const notes = (dir: string, names: string[]) =>
  Object.fromEntries(names.map((n) => [n.replace("s", "#"), staticFile(`sounds/${dir}/${n}.wav`)]));
export const take = (dir: string, file: string) => staticFile(`sounds/${dir}/${file}.wav`);

export function kit(bus = Tone.buses.music) {
  const hall = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 0.3 }).connect(bus);
  const room = new Tone.Reverb({ decay: 1.4, wet: 0.18 }).connect(bus);
  // the glockenspiel's sparkle: a dotted-eighth echo at 120 bpm, into the hall
  const echo = new Tone.FeedbackDelay({ delayTime: 0.375, feedback: 0.28, wet: 0.22 }).connect(hall);

  const harp = new Tone.Sampler({
    urls: notes("vcsl-concert-harp", ["E1", "G1", "B1", "D2", "F2", "A2", "C3", "E3", "G3", "B3", "D4", "F4", "A4", "C5", "E5", "G5", "B5", "D6", "F6", "A6"]),
    release: 1.2,
  }).connect(hall);
  const glock = new Tone.Sampler({
    urls: notes("vcsl-glockenspiel", ["G4", "C5", "G5", "C6", "G6", "C7"]),
    release: 0.8,
  }).connect(echo);
  const vibes = new Tone.Sampler({
    urls: notes("vcsl-vibraphone", ["F2", "A2", "C3", "E3", "G3", "B3", "D4", "F4", "A4", "C5", "E5"]),
    release: 1.6,
  }).connect(hall);
  const chimes = new Tone.Sampler({
    urls: notes("vcsl-hand-chimes", ["C3", "E3", "Gs3", "C4", "E4", "Gs4", "C5", "E5", "Gs5", "C6"]),
    release: 2,
  }).connect(hall);
  // takes rather than notes: a Player each, at its own level, so a cue can set it
  const player = (dir: string, file: string, volume: number, out: Tone.ToneAudioNode = hall, o = {}) =>
    new Tone.Player({ url: take(dir, file), volume, ...o }).connect(out);
  // the beads of an ocean drum, kept above the rumble: a brush of air, not a wave
  const airy = new Tone.Filter({ type: "highpass", frequency: 500 }).connect(room);

  return { harp, glock, vibes, chimes, player, hall, room, airy };
}
