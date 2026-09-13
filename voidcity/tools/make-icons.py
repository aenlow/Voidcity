#!/usr/bin/env python3
"""
make-icons.py — Draws every app icon and the iOS splash screen from code.

Run it after changing the palette:   python3 tools/make-icons.py
Requires Pillow (pip install pillow). Output goes to assets/icons/.

Keeping the icons generated rather than hand-drawn means the whole project
stays text: nothing binary needs to be re-edited when the colours change.
"""

import os
import math
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "icons")
os.makedirs(OUT, exist_ok=True)

INK = (7, 7, 12)
SURFACE = (23, 26, 44)
VOID = (143, 123, 255)
VOID_DIM = (91, 75, 176)
LAMP = (255, 180, 84)


def radial_bg(size, inner, outer, center=(0.5, 0.42), spread=0.85):
    """Soft radial gradient, used for the icon background."""
    grad = Image.radial_gradient("L").resize((size, size), Image.LANCZOS)
    # Shift the highlight up a little so the icon has a light source.
    grad = grad.transform(
        (size, size),
        Image.AFFINE,
        (1, 0, (0.5 - center[0]) * size, 0, 1, (0.5 - center[1]) * size),
        resample=Image.BILINEAR,
        fillcolor=255,
    )
    grad = grad.point(lambda v: min(255, int(v / spread)))
    base = Image.new("RGB", (size, size), outer)
    top = Image.new("RGB", (size, size), inner)
    return Image.composite(base, top, grad)


def draw_icon(size, padding=0.0):
    """padding is the fraction of the canvas kept clear (for maskable icons)."""
    S = 1024
    img = radial_bg(S, SURFACE, INK)
    art = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(art)

    cx = cy = S / 2
    safe = 1 - padding * 2
    R = S * 0.33 * safe

    # A city block grid seen from above, everywhere the hole hasn't reached.
    step = S * 0.088
    y = step * 0.6
    row = 0
    while y < S:
        x = step * 0.6 + (step * 0.5 if row % 2 else 0)
        col = 0
        while x < S:
            jitter = math.sin(row * 3.1 + col * 1.7) * step * 0.12
            bx, by = x + jitter, y - jitter
            w = step * (0.34 if (row + col) % 4 else 0.46)
            if math.hypot(bx - cx, by - cy) > R * 1.22:
                lit = (row * 3 + col) % 4 == 0
                d.rectangle(
                    [bx - w, by - w, bx + w, by + w],
                    fill=(LAMP + (200,)) if lit else ((124, 134, 168) + (150,)),
                )
            x += step
            col += 1
        y += step
        row += 1

    # Outer glow
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse(
        [cx - R * 1.18, cy - R * 1.18, cx + R * 1.18, cy + R * 1.18], fill=VOID + (90,)
    )
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.055))
    art.alpha_composite(glow)

    # Rim
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=VOID_DIM + (255,))
    d.ellipse(
        [cx - R * 0.93, cy - R * 0.93, cx + R * 0.93, cy + R * 0.93],
        fill=(4, 3, 9, 255),
    )

    # Vortex arcs
    for i in range(3):
        rr = R * (0.42 + i * 0.19)
        start = 40 + i * 110
        d.arc(
            [cx - rr, cy - rr, cx + rr, cy + rr],
            start,
            start + 150,
            fill=VOID + (255 - i * 45,),
            width=int(R * 0.075),
        )

    img = img.convert("RGBA")
    img.alpha_composite(art)
    return img.convert("RGB").resize((size, size), Image.LANCZOS)


def splash(w, h):
    img = radial_bg(max(w, h), SURFACE, INK).resize((w, h), Image.LANCZOS)
    icon = draw_icon(int(min(w, h) * 0.52)).convert("RGBA")
    img = img.convert("RGBA")
    img.alpha_composite(icon, (int((w - icon.width) / 2), int(h * 0.3)))
    return img.convert("RGB")


def main():
    for size in (48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512):
        draw_icon(size).save(os.path.join(OUT, f"icon-{size}.png"))
    # Maskable icons keep 20% clear on every side so Android can crop to a
    # circle, squircle or rounded square without eating the artwork.
    for size in (192, 512):
        draw_icon(size, padding=0.2).save(os.path.join(OUT, f"maskable-{size}.png"))
    draw_icon(32).save(os.path.join(OUT, "favicon.png"))
    splash(1290, 2796).save(os.path.join(OUT, "splash-1290x2796.png"))
    splash(1170, 2532).save(os.path.join(OUT, "splash-1170x2532.png"))
    splash(1536, 2048).save(os.path.join(OUT, "splash-1536x2048.png"))
    print("icons written to", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
