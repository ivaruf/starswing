#!/usr/bin/env python3
"""Generate the Starswing icon set.

    python3 tools/make-icons.py

Writes icons/icon-192.png, icon-512.png, icon-180.png and
icon-maskable-512.png. Requires Pillow; no network, no fonts, no external
assets. The script is the source of truth, not the PNGs (hub CLAUDE.md §4).

THE MOTIF: one swing. A white star glowing in the middle of a night sky, and
a comet three quarters of the way round it, its ice-blue tail drawn as the
arc it has travelled: thin and faint where it began, wide and bright at the
head, with the beam of light from star to comet. At 24 px what survives is a
bright dot inside a blue hook, which is the game.

Opaque to its corners (iOS paints transparent pixels black and a maskable
icon must fill its frame). The maskable copy draws the same picture inside
its safe zone. Rendered 4x and downsampled with LANCZOS; glow is a blurred
copy added under the sharp shapes.
"""

import math
import os
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")
NIGHT = (5, 6, 15)
ICE = (90, 200, 255)
VIOLET = (170, 130, 255)
SS = 4


def motif(size, safe):
    S = size * SS
    c = S / 2
    R = S * safe * 0.3  # the orbit
    img = Image.new("RGB", (S, S), (0, 0, 0))
    d = ImageDraw.Draw(img)

    def dot(x, y, r, col):
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)

    # The tail: 270 degrees of arc ending at the comet, upper right.
    a_end = -math.pi / 4
    steps = 140
    for i in range(steps + 1):
        f = i / steps
        a = a_end - (1 - f) * 1.5 * math.pi
        col = tuple(int((VIOLET[k] * (1 - f) + ICE[k] * f) * (0.15 + 0.85 * f)) for k in range(3))
        dot(c + R * math.cos(a), c + R * math.sin(a), S * safe * (0.008 + 0.04 * f), col)
    hx, hy = c + R * math.cos(a_end), c + R * math.sin(a_end)
    d.line([c, c, hx, hy], fill=tuple(v // 2 for v in ICE), width=max(2, int(S * 0.008)))
    dot(c, c, S * safe * 0.075, (235, 242, 255))
    dot(hx, hy, S * safe * 0.062, (255, 255, 255))

    glow = img.filter(ImageFilter.GaussianBlur(S * 0.045))
    wide = img.filter(ImageFilter.GaussianBlur(S * 0.12))
    base = Image.new("RGB", (S, S), NIGHT)
    # A few far stars, fixed places so the icon never changes between runs.
    b = ImageDraw.Draw(base)
    for i in range(26):
        x = (i * 7919 % 97) / 97 * S
        y = (i * 104729 % 89) / 89 * S
        r = S * (0.003 if i % 4 else 0.005)
        b.ellipse([x - r, y - r, x + r, y + r], fill=(120, 135, 180))
    base = ImageChops.add(base, wide.point(lambda v: int(v * 0.7)))
    base = ImageChops.add(base, glow)
    base = ImageChops.add(base, img)
    return base.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    for size, name, safe in [
        (192, "icon-192.png", 1.0),
        (512, "icon-512.png", 1.0),
        (180, "icon-180.png", 1.0),
        (512, "icon-maskable-512.png", 0.74),
    ]:
        motif(size, safe).save(os.path.join(OUT, name), optimize=True)
        print("wrote", name)


if __name__ == "__main__":
    main()
