#!/usr/bin/env python3
"""
Rebuild every image asset from the master artwork.

    python design/build-assets.py          (run from the project root)

Needs Pillow:  pip install Pillow

The master (design/logo-master.png) is 6000x6000 black ink on white. This script
cuts it into the pieces the site uses, converts white to transparency so each
piece sits on any background, and writes PNG + WebP pairs plus the favicons and
the Open Graph card. Everything it writes is greyscale.

If the logo is ever redrawn, update the REGIONS below to match the new artwork
and run this again. Nothing else in the project needs to change: the filenames
and pixel sizes stay the same.
"""

import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MASTER = os.path.join(HERE, "logo-master.png")
OUT_IMG = os.path.join(ROOT, "assets", "images")
OUT_ICO = os.path.join(ROOT, "assets", "favicon")

INK = 13          # matches --color-ink (#0d0d0d) in css/variables.css
BG = (242, 242, 242)   # matches --color-bg (#f2f2f2)

# Crop boxes in master pixels: (left, top, right, bottom). Generous — each piece
# is trimmed to its own ink afterwards.
REGIONS = {
    "mark":     (0,    1100, 2320, 1430),   # the three ellipses
    "wordmark": (2950, 1080, 6000, 1510),   # "Dev Community"
    "chevron":  (30,   2780, 2200, 4680),   # the drawn chevron
    "hand":     (3600, 1600, 6000, 4688),   # the reaching hand, without the ground bar
    "full":     (0,    1080, 6000, 5210),   # the whole lockup
}

# Fonts for the Open Graph card. These are the closest faces available locally
# to the two the site loads from Google Fonts: Garamond stands in for
# EB Garamond, Courier New for Courier Prime.
SERIF = r"C:\Windows\Fonts\GARABD.TTF"
MONO = r"C:\Windows\Fonts\cour.ttf"


def load_alpha():
    """Master as an alpha channel: white becomes transparent, ink opaque."""
    grey = Image.open(MASTER).convert("L")
    return Image.fromarray((255 - np.asarray(grey).astype(np.int16)).clip(0, 255).astype(np.uint8))


def piece(alpha, box):
    part = alpha.crop(box)
    bounds = part.point(lambda v: 255 if v > 18 else 0).getbbox()
    return part.crop(bounds) if bounds else part


def write(part, path, target, axis="w", tone=INK):
    width, height = part.size
    if axis == "w":
        size = (target, max(1, round(height * target / width)))
    else:
        size = (max(1, round(width * target / height)), target)
    part = part.resize(size, Image.LANCZOS)
    image = Image.merge("LA", (Image.new("L", part.size, tone), part))
    image.save(path, optimize=True)
    image.convert("RGBA").save(os.path.splitext(path)[0] + ".webp", quality=88, method=6)


def favicon(chevron, size, pad, background=None, boost=1.0):
    inner = round(size * (1 - 2 * pad))
    width, height = chevron.size
    scale = inner / max(width, height)
    part = chevron.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.LANCZOS)
    # Small sizes need the thin strokes darkened or they disappear.
    part = Image.fromarray((np.power(np.asarray(part).astype(np.float32) / 255.0, boost) * 255).astype(np.uint8))
    canvas = Image.new("RGBA", (size, size), background or (0, 0, 0, 0))
    ink = Image.merge("RGBA", (Image.new("L", part.size, INK),) * 3 + (part,))
    canvas.alpha_composite(ink, ((size - part.size[0]) // 2, (size - part.size[1]) // 2))
    return canvas


def draw_tracked(draw, xy, text, font, fill, tracking):
    """Draw text with letter-spacing, and return the width it occupied."""
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=font, fill=fill)
        x += draw.textlength(char, font=font) + tracking
    return int(x - tracking - xy[0])


def main():
    alpha = load_alpha()
    parts = {name: piece(alpha, box) for name, box in REGIONS.items()}
    for name, part in parts.items():
        print(f"  {name:9s} {part.size}")

    write(parts["mark"], os.path.join(OUT_IMG, "logo-mark.png"), 320)
    write(parts["wordmark"], os.path.join(OUT_IMG, "wordmark.png"), 1100)
    write(parts["chevron"], os.path.join(OUT_IMG, "chevron.png"), 560)
    write(parts["hand"], os.path.join(OUT_IMG, "hand.png"), 1200, axis="h")
    write(parts["full"], os.path.join(OUT_IMG, "logo-full.png"), 1600)

    # White versions for the ink footer and bands.
    write(parts["mark"], os.path.join(OUT_IMG, "logo-mark-inverse.png"), 320, tone=255)
    write(parts["wordmark"], os.path.join(OUT_IMG, "wordmark-inverse.png"), 1100, tone=255)
    write(parts["chevron"], os.path.join(OUT_IMG, "chevron-inverse.png"), 560, tone=255)

    chevron = parts["chevron"]
    favicon(chevron, 16, 0.03, boost=0.42).save(os.path.join(OUT_ICO, "favicon-16.png"), optimize=True)
    favicon(chevron, 32, 0.04, boost=0.48).save(os.path.join(OUT_ICO, "favicon-32.png"), optimize=True)
    favicon(chevron, 48, 0.04, boost=0.52).save(os.path.join(OUT_ICO, "favicon-48.png"), optimize=True)
    favicon(chevron, 180, 0.16, background=BG + (255,)).save(os.path.join(OUT_ICO, "apple-touch-icon.png"), optimize=True)
    favicon(chevron, 192, 0.14, background=BG + (255,)).save(os.path.join(OUT_ICO, "icon-192.png"), optimize=True)
    favicon(chevron, 512, 0.16, background=BG + (255,)).save(os.path.join(OUT_ICO, "icon-512.png"), optimize=True)
    Image.open(os.path.join(OUT_ICO, "favicon-48.png")).save(
        os.path.join(OUT_ICO, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])

    # Open Graph card: the hero composition at 1200x630.
    card = Image.new("RGB", (1200, 630), BG)
    draw = ImageDraw.Draw(card)
    bar = (INK, INK, INK)
    draw.rectangle([0, 556, 1200, 630], fill=bar)
    draw.rectangle([0, 548, 1200, 552], fill=bar)

    hand = parts["hand"]
    scale = 470 / hand.size[1]
    hand = hand.resize((round(hand.size[0] * scale), 470), Image.LANCZOS)
    card.paste(Image.new("RGB", hand.size, bar), (838, 92), hand)

    mark = parts["mark"]
    mark = mark.resize((210, max(1, round(mark.size[1] * 210 / mark.size[0]))), Image.LANCZOS)
    card.paste(Image.new("RGB", mark.size, bar), (76, 84), mark)

    draw.text((72, 156), "KDU Developer", font=ImageFont.truetype(SERIF, 104), fill=bar)
    draw.text((72, 268), "Community", font=ImageFont.truetype(SERIF, 104), fill=bar)

    # The caption is letter-spaced by hand: PIL has no tracking, and it has to
    # stay clear of the hand on the right, so its width is measured and checked.
    caption = "KYUNGDONG UNIVERSITY · SOUTH KOREA"
    width = draw_tracked(draw, (74, 414), caption, ImageFont.truetype(MONO, 21), (90, 90, 90), 3)
    assert 74 + width < 800, f"OG caption is {width}px wide and would run under the hand"

    # Rule sits below the descenders of "Community", not through them.
    draw.line([72, 396, 74 + width, 396], fill=(170, 170, 170), width=2)
    card.save(os.path.join(OUT_IMG, "og-image.png"), optimize=True)

    print("done")


if __name__ == "__main__":
    main()
