"""Generate Chronik app icons and the Open Graph card with Pillow."""

from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "public" / "icons"
ICONS.mkdir(parents=True, exist_ok=True)

BG = (30, 43, 34, 255)
CREAM = (243, 232, 206, 255)
GOLD = (201, 162, 78, 255)
RUST = (168, 74, 43, 255)
MUTED = (169, 176, 156, 255)


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts" / name,
        Path("/usr/share/fonts/truetype/dejavu") / name,
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def star_points(cx: float, cy: float, rgba: int) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for index in range(16):
        angle = math.radians(index * 22.5 - 90)
        radius = rgba if index % 4 == 0 else (rgba * 0.66 if index % 2 == 0 else rgba * 0.24)
        points.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    return points


def rounded_icon(size: int, maskable: bool = False) -> Image.Image:
    scale = 4
    canvas = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    box = (0, 0, size * scale, size * scale)
    radius = 0 if maskable else int(size * scale * 0.23)
    draw.rounded_rectangle(box, radius=radius, fill=BG)

    # Fine gold ring for a signet-like feel.
    inset = int(size * scale * (0.09 if not maskable else 0.12))
    draw.ellipse(
        (inset, inset, size * scale - inset, size * scale - inset),
        outline=(201, 162, 78, 95),
        width=max(2, int(size * scale * 0.004)),
    )

    cx = cy = size * scale / 2
    star_scale = 0.33 if not maskable else 0.27
    draw.polygon(star_points(cx, cy, size * scale * star_scale), fill=CREAM)
    inner = size * scale * 0.068
    draw.ellipse((cx - inner, cy - inner, cx + inner, cy + inner), fill=BG)
    dot = size * scale * 0.022
    draw.ellipse((cx - dot, cy - dot, cx + dot, cy + dot), fill=RUST)

    return canvas.resize((size, size), Image.LANCZOS)


def write_png(image: Image.Image, path: Path) -> None:
    image.save(path, "PNG", optimize=True)
    print(f"{path.name:28} {path.stat().st_size / 1024:6.1f} kB")


icon_512 = rounded_icon(512)
write_png(icon_512, ICONS / "icon-512.png")
write_png(rounded_icon(192), ICONS / "icon-192.png")
write_png(rounded_icon(180), ICONS / "apple-touch-icon.png")
write_png(rounded_icon(512, maskable=True), ICONS / "maskable-512.png")
write_png(rounded_icon(32), ICONS / "favicon-32.png")

# Favicon SVG mirrors the PNG mark.
(ICONS / "favicon.svg").write_text(
    """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="15" fill="#1e2b22"/>
  <circle cx="32" cy="32" r="26" fill="none" stroke="#c9a24e" stroke-opacity=".55" stroke-width=".8"/>
  <path d="M32 7 L35.3 26.2 L52 32 L35.3 37.8 L32 57 L28.7 37.8 L12 32 L28.7 26.2 Z" fill="#f3e8ce"/>
  <circle cx="32" cy="32" r="4.3" fill="#1e2b22"/>
  <circle cx="32" cy="32" r="1.6" fill="#a84a2b"/>
</svg>
""",
    encoding="utf-8",
)
print("favicon.svg")

# ── Open Graph card ────────────────────────────────────────────────────────
W, H = 1200, 630
og = Image.new("RGB", (W, H), (30, 43, 34))
od = ImageDraw.Draw(og)

# Soft radial glows.
for radius, alpha in ((520, 16), (380, 18), (250, 22)):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.ellipse((W - 420 - radius, -radius + 120, W - 420 + radius, radius + 120), fill=(201, 162, 78, alpha))
    og = Image.alpha_composite(og.convert("RGBA"), layer).convert("RGB")
od = ImageDraw.Draw(og)

# Signet star on the right.
sx, sy = 945, 292
od.polygon(star_points(sx, sy, 188), fill=(243, 232, 206))
od.ellipse((sx - 52, sy - 52, sx + 52, sy + 52), fill=(30, 43, 34))
od.ellipse((sx - 15, sy - 15, sx + 15, sy + 15), fill=(168, 74, 43))

# Left copy.
od.text((76, 78), "C H R O N I K", font=font("georgia.ttf", 24), fill=(201, 162, 78))
od.text((72, 150), "Mittelalter", font=font("georgiab.ttf", 92), fill=(243, 232, 206))
od.text((72, 250), "vor der Haustür.", font=font("georgiai.ttf", 92), fill=(226, 208, 174))
od.text(
    (78, 392),
    "Märkte, Turniere, LARP und Reenactment\nin Deutschland — automatisch gesammelt.",
    font=font("arial.ttf", 27),
    fill=(190, 196, 176),
    spacing=12,
)

# Category dots.
labels = [("Märkte", (168, 74, 43)), ("Reenactment", (64, 98, 74)), ("LARP", (104, 87, 143)), ("Turniere", (153, 112, 42)), ("Cosplay", (168, 74, 104))]
x = 78
for label, color in labels:
    od.ellipse((x, 524, x + 12, 536), fill=color)
    od.text((x + 20, 520), label, font=font("arial.ttf", 18), fill=(190, 196, 176))
    x += 20 + int(od.textlength(label, font=font("arial.ttf", 18))) + 34

od.line((76, 572, 1124, 572), fill=(64, 78, 66), width=1)
od.text((78, 586), "chronik.events", font=font("arial.ttf", 18), fill=(150, 158, 140))
od.text((1000, 586), "DACH · 2027", font=font("arial.ttf", 18), fill=(150, 158, 140))

write_png(og.convert("RGBA"), ICONS / "og-image.png")
print("Done.")
