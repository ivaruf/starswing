#!/bin/sh
# Build Starswing's sound with raea: the seven cues and the loop, from cues.tsx and music-sky.tsx, into audio/*.m4a.
#
#   sh tools/audio/build.sh        (any working directory; a few seconds once the samples are here)
#
# 1. fetches the instruments with `raea sounds get` into media/sounds/ (ignored by git; only once), and evens each
#    pitched one (below);
# 2. renders the cues and the loop with raea into out/ (48 kHz float; raea renders offline, so no sound device);
# 3. hands both to encode.mjs, which cuts the cues apart, keeps the loop's second pass, and writes audio/*.m4a.
#
# EVENING. The Versilian library recorded each note at whatever level it came out at: the harp's roots span 18 dB
# and the vibraphone's 31, and its C5 is almost all in the left channel. A Sampler plays a note from its nearest root,
# so an uneven library makes an uneven instrument and a chord leans left. So each root of a pitched instrument is
# folded to mono and set to one loudness (its loudest 400 ms at EVEN LUFS); the music's own dynamics are then the
# velocities written in the score. Takes (mark tree, drums) keep their stereo and their level, set where they play.
#
# Needs raea (curl -fsSL https://raea.io/install | sh), node 22 and ffmpeg.
set -e
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:$PATH"
command -v raea > /dev/null || { echo "raea is not on PATH: curl -fsSL https://raea.io/install | sh"; exit 1; }
EVEN=-20

mmax() { # the loudest 400 ms of a file's first 1.5 s, in LUFS
  ffmpeg -hide_banner -nostdin -t 1.5 -i "$1" -af "apad=pad_dur=0.5,ebur128" -f null - 2>&1 |
    awk '/ M: *-?[0-9]/ { for (i = 1; i <= NF; i++) if ($i == "M:") { v = $(i + 1) + 0; if (m == "" || v > m) m = v } } END { print m }'
}

for s in concert-harp glockenspiel vibraphone hand-chimes wine-glasses mark-trees slit-drum ocean-drum frame-drum; do
  dir="media/sounds/vcsl-$s"
  [ -d "$dir" ] || raea sounds get "vcsl/$s" -o "$dir" | head -1
done
for s in concert-harp glockenspiel vibraphone hand-chimes wine-glasses; do
  dir="media/sounds/vcsl-$s"
  [ -f "$dir/.even" ] && continue
  for f in "$dir"/*.wav; do
    gain=$(awk "BEGIN { print $EVEN - ($(mmax "$f")) }")
    ffmpeg -hide_banner -nostdin -loglevel error -y -i "$f" -af "pan=mono|c0=0.5*c0+0.5*c1,volume=${gain}dB" -c:a pcm_f32le "$f.tmp.wav"
    mv "$f.tmp.wav" "$f"
  done
  touch "$dir/.even"
  echo "evened $dir"
done

mkdir -p out
raea render cues.tsx -o out/cues.wav | grep -E "raea render:|out/"
raea render music-sky.tsx -o out/music-sky.wav | grep -E "raea render:|out/"
node encode.mjs out
