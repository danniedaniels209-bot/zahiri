"""
Generates the Zahiri app icon set.

The mark is a shield with a check inside it, in the brand green on the deep ink
ground, matching the design tokens in theme/tokens.ts.

    python scripts/make-icons.py
"""

from PIL import Image, ImageDraw
import os

INK = (11, 15, 20, 255)          # #0B0F14
INK_DEEP = (7, 10, 14, 255)      # #070A0E
GREEN = (0, 214, 143, 255)       # #00D68F
GREEN_GLOW = (77, 255, 195, 255) # #4DFFC3

OUT = os.path.join(os.path.dirname(__file__), "..", "assets")


def shield_points(cx, cy, w, h):
    """A rounded shield outline centred on (cx, cy)."""
    hw, hh = w / 2, h / 2
    top = cy - hh
    bottom = cy + hh
    return [
        (cx - hw, top + hh * 0.10),
        (cx - hw, cy + hh * 0.10),
        (cx - hw * 0.72, cy + hh * 0.58),
        (cx, bottom),
        (cx + hw * 0.72, cy + hh * 0.58),
        (cx + hw, cy + hh * 0.10),
        (cx + hw, top + hh * 0.10),
        (cx, top),
    ]


def draw_mark(size, scale=0.56, bg=None, supersample=4):
    """Draw the shield + check at `size`, optionally on a background colour."""
    s = size * supersample
    img = Image.new("RGBA", (s, s), bg if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    cx = cy = s / 2
    w = s * scale
    h = w * 1.16

    # Shield body, with a slightly brighter rim for depth.
    d.polygon(shield_points(cx, cy, w, h), fill=GREEN)
    d.line(
        shield_points(cx, cy, w, h) + [shield_points(cx, cy, w, h)[0]],
        fill=GREEN_GLOW,
        width=max(2, int(s * 0.006)),
        joint="curve",
    )

    # Check mark, punched out in the ground colour.
    stroke = max(3, int(w * 0.13))
    knee = (cx - w * 0.05, cy + h * 0.16)
    d.line(
        [(cx - w * 0.26, cy + h * 0.01), knee],
        fill=INK_DEEP,
        width=stroke,
        joint="curve",
    )
    d.line(
        [knee, (cx + w * 0.29, cy - h * 0.22)],
        fill=INK_DEEP,
        width=stroke,
        joint="curve",
    )
    # Round the joint and the two ends so the check does not look cut off.
    r = stroke / 2
    for px, py in [knee, (cx - w * 0.26, cy + h * 0.01), (cx + w * 0.29, cy - h * 0.22)]:
        d.ellipse([px - r, py - r, px + r, py + r], fill=INK_DEEP)

    return img.resize((size, size), Image.LANCZOS)


def solid(size, colour):
    return Image.new("RGBA", (size, size), colour)


def monochrome(size, supersample=4):
    """Themed-icon layer: the silhouette only, white on transparent."""
    s = size * supersample
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = s / 2
    w = s * 0.56
    h = w * 1.16
    d.polygon(shield_points(cx, cy, w, h), fill=(255, 255, 255, 255))
    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)

    files = {
        # Main launcher icon: mark on the ink ground.
        "icon.png": draw_mark(1024, scale=0.54, bg=INK),
        # Adaptive icon layers. The foreground must sit inside the safe zone,
        # so the mark is drawn smaller than on the flat icon.
        "android-icon-foreground.png": draw_mark(1024, scale=0.40),
        "android-icon-background.png": solid(1024, INK),
        "android-icon-monochrome.png": monochrome(1024),
        # Splash: transparent so the plugin's backgroundColor shows through.
        "splash-icon.png": draw_mark(1024, scale=0.46),
        "favicon.png": draw_mark(96, scale=0.60, bg=INK),
    }

    for name, img in files.items():
        path = os.path.join(OUT, name)
        img.save(path, "PNG")
        print(f"  {name:34} {img.size[0]}x{img.size[1]}")

    print(f"\nWrote {len(files)} icons to assets/")


if __name__ == "__main__":
    main()
