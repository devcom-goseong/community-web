#!/usr/bin/env python3
"""
Rebuild every image asset from the master artwork.

    python design/build-assets.py          (run from the project root)

Needs Pillow:  pip install Pillow

There are three masters:

  design/logo-colour.jpeg   the circular mark - dots, </> and the hand
  design/banner.jpeg        the wide lockup, used for the social card
  design/logo-master.png    the original ink drawing, still the source of the
                            standalone hand on the home page

The mark carries its own cream disc, so it sits on any background and needs no
inverted variant. The hand is cut from the ink drawing and tinted navy so it
matches the rest of the identity.

If the artwork is redrawn, replace the masters and run this again. Filenames
and pixel sizes stay the same, so nothing else has to change.
"""

import os

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_IMG = os.path.join(ROOT, "assets", "images")
OUT_ICO = os.path.join(ROOT, "assets", "favicon")

# Sampled from the artwork, not chosen by eye. These are the same values as the
# brand tokens in css/variables.css.
NAVY = (6, 35, 80)
PAPER = (247, 243, 234)


def trim(image, tolerance=246):
    """Drop the near-white surround a JPEG export leaves behind."""
    a = np.asarray(image.convert("RGB"))
    mask = (a.max(2) < tolerance) | (a.min(2) < tolerance - 11)
    ys, xs = np.where(mask)
    if not len(xs):
        return image
    return image.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def cut_out_surround(image, tolerance=40):
    """Make everything outside the disc transparent.

    The JPEG has a white surround and the disc has a cream interior, so a
    simple "white becomes transparent" rule would punch a hole through the
    middle of the mark. Flooding inwards from the corners only clears what is
    actually outside, because the navy ring encloses the interior.
    """
    rgb = image.convert("RGB")
    marker = (255, 0, 255)
    probe = rgb.copy()
    draw = ImageDraw.floodfill
    for corner in ((0, 0), (probe.width - 1, 0), (0, probe.height - 1),
                   (probe.width - 1, probe.height - 1)):
        draw(probe, corner, marker, thresh=tolerance)
    outside = (np.asarray(probe) == np.array(marker)).all(axis=2)
    alpha = np.where(outside, 0, 255).astype(np.uint8)
    out = rgb.convert("RGBA")
    out.putalpha(Image.fromarray(alpha))
    return out


def save(image, path, width=None, height=None, background=PAPER, colours=96):
    """Write a PNG and a WebP.

    The artwork is flat colour on a cream ground but arrives as a JPEG, so it
    carries compression noise that makes a straight PNG enormous. Quantising to
    a small palette removes the noise rather than storing it, and takes the
    files from hundreds of kilobytes to tens.
    """
    if width:
        height = max(1, round(image.height * width / image.width))
    elif height:
        width = max(1, round(image.width * height / image.height))
    out = image.resize((width, height), Image.LANCZOS)
    flat = Image.new("RGB", out.size, background)
    flat.paste(out, (0, 0), out if out.mode == "RGBA" else None)
    quantised = flat.quantize(colors=colours, method=Image.MEDIANCUT,
                              dither=Image.NONE)
    quantised.save(path, optimize=True)
    flat.save(os.path.splitext(path)[0] + ".webp", quality=86, method=6)


def hand_from_ink(master_path):
    """Cut the hand out of the original drawing and tint it navy.

    White becomes transparent so it sits on the cream page the way the ink
    version did, but in the identity's own colour rather than black.
    """
    grey = Image.open(master_path).convert("L")
    alpha = Image.fromarray((255 - np.asarray(grey).astype(np.int16)).clip(0, 255).astype(np.uint8))
    part = alpha.crop((3600, 1600, 6000, 4688))
    bounds = part.point(lambda v: 255 if v > 18 else 0).getbbox()
    if bounds:
        part = part.crop(bounds)
    return part


def write_rgba(alpha, path, height, tone):
    width = max(1, round(alpha.width * height / alpha.height))
    a = alpha.resize((width, height), Image.LANCZOS)
    image = Image.merge("RGBA", tuple(Image.new("L", a.size, c) for c in tone) + (a,))
    image.save(path, optimize=True)
    image.convert("RGBA").save(os.path.splitext(path)[0] + ".webp", quality=88, method=6)


def favicon(mark, size, pad=0.0):
    inner = round(size * (1 - 2 * pad))
    scaled = mark.resize((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), PAPER)
    canvas.paste(scaled, ((size - inner) // 2, (size - inner) // 2),
                 scaled if scaled.mode == "RGBA" else None)
    return canvas


def main():
    mark = trim(Image.open(os.path.join(HERE, "logo-colour.jpeg")))
    banner = trim(Image.open(os.path.join(HERE, "banner.jpeg")))
    print(f"  mark   {mark.size}")
    print(f"  banner {banner.size}")

    # The mark: the surround is cut away so the disc sits on any ground.
    mark = cut_out_surround(mark)
    for name, width in (("logo-mark.png", 320), ("logo-mark-large.png", 720)):
        scaled = mark.resize((width, max(1, round(mark.height * width / mark.width))),
                             Image.LANCZOS)
        # FASTOCTREE rather than MEDIANCUT: it is the only method Pillow will
        # quantise an RGBA image with, and the alpha is the whole point here.
        scaled.quantize(colors=96, method=Image.FASTOCTREE).save(
            os.path.join(OUT_IMG, name), optimize=True)
        scaled.save(os.path.join(OUT_IMG, os.path.splitext(name)[0] + ".webp"),
                    quality=86, method=6)

    # The wide lockup, for anywhere the full name is wanted as artwork.
    save(banner, os.path.join(OUT_IMG, "banner.png"), width=1600)

    # The hand keeps its place on the home page, now in navy rather than black.
    ink = os.path.join(HERE, "logo-master.png")
    if os.path.exists(ink):
        write_rgba(hand_from_ink(ink), os.path.join(OUT_IMG, "hand.png"), 1200, NAVY)

    # Favicons come from the mark, which is legible small because the disc
    # gives it a solid silhouette.
    for size in (16, 32, 48, 180, 192, 512):
        name = {180: "apple-touch-icon.png", 192: "icon-192.png",
                512: "icon-512.png"}.get(size, f"favicon-{size}.png")
        icon = favicon(mark, size).quantize(colors=96, method=Image.MEDIANCUT)
        icon.save(os.path.join(OUT_ICO, name), optimize=True)
    Image.open(os.path.join(OUT_ICO, "favicon-48.png")).save(
        os.path.join(OUT_ICO, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])

    # Social card: the banner centred on the cream ground at 1200x630.
    card = Image.new("RGB", (1200, 630), PAPER)
    scaled = banner.resize((1120, max(1, round(banner.height * 1120 / banner.width))), Image.LANCZOS)
    card.paste(scaled.convert("RGB"), (40, (630 - scaled.height) // 2))
    card.quantize(colors=128, method=Image.MEDIANCUT, dither=Image.NONE).save(
        os.path.join(OUT_IMG, "og-image.png"), optimize=True)

    print("done")


if __name__ == "__main__":
    main()
