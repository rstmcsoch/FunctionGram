#!/usr/bin/env python3
"""Rasterize the website mark for the native launcher.

Source geometry is public/favicon.svg (and assets/logo.svg, which is the same
file): a 64px tile, 16px corner radius, fill #ef476f, white "R" at
font-size 47 with baseline y=48, and a white dot at (50, 47) r=4.

Android adaptive icons cannot draw SVG <text>, and this environment renders
the glyph with Liberation Sans Bold, the metric-compatible stand-in for the
SVG's Arial. Re-run from the repo root after changing the SVG:

  python3 native-android/scripts/render_brand_icon.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
PINK = (0xEF, 0x47, 0x6F, 255)
WHITE = (255, 255, 255, 255)
ROOT = Path(__file__).resolve().parents[1] / "app" / "src" / "main" / "res"


def logo(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    scale = size / 64.0
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=16 * scale, fill=PINK)
    font = ImageFont.truetype(FONT, size=max(1, int(round(47 * scale))))
    draw.text((12 * scale, 48 * scale), "R", font=font, fill=WHITE, anchor="ls")
    radius = 4 * scale
    center_x, center_y = 50 * scale, 47 * scale
    draw.ellipse(
        (center_x - radius, center_y - radius, center_x + radius, center_y + radius),
        fill=WHITE,
    )
    return image


def foreground(size: int) -> Image.Image:
    """White glyph only, fitted to the 72dp safe zone of a 108dp adaptive layer."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    scale = (size * (72 / 108)) / 64.0
    origin = (size - 64 * scale) / 2.0
    font = ImageFont.truetype(FONT, size=max(1, int(round(47 * scale))))
    draw.text((origin + 12 * scale, origin + 48 * scale), "R", font=font, fill=WHITE, anchor="ls")
    radius = 4 * scale
    center_x = origin + 50 * scale
    center_y = origin + 47 * scale
    draw.ellipse(
        (center_x - radius, center_y - radius, center_x + radius, center_y + radius),
        fill=WHITE,
    )
    return image


def circled(source: Image.Image) -> Image.Image:
    size = source.size[0]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    output = source.copy()
    output.putalpha(mask)
    return output


def main() -> None:
    legacy = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    adaptive = {
        "mipmap-mdpi": 108,
        "mipmap-hdpi": 162,
        "mipmap-xhdpi": 216,
        "mipmap-xxhdpi": 324,
        "mipmap-xxxhdpi": 432,
    }
    for folder, size in legacy.items():
        mark = logo(size)
        mark.save(ROOT / folder / "ic_launcher.png")
        circled(mark).save(ROOT / folder / "ic_launcher_round.png")
    for folder, size in adaptive.items():
        foreground(size).save(ROOT / folder / "ic_launcher_foreground.png")
    nodpi = ROOT / "drawable-nodpi"
    nodpi.mkdir(parents=True, exist_ok=True)
    logo(256).save(nodpi / "fg_mark.png")


if __name__ == "__main__":
    main()
