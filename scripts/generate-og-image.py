#!/usr/bin/env python3
"""Generates web/public/og-image.png — the 1200x630 social-share card.
Run: python3 scripts/generate-og-image.py  (needs Pillow)."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
INK = (15, 23, 42)        # deep navy background
INK_LT = (30, 41, 59)     # lighter navy for panels
BRAND = (198, 26, 34)     # #c61a22 brand red
BLUE = (30, 116, 252)     # #1e74fc accent blue
WHITE = (255, 255, 255)
MUTED = (148, 163, 184)   # slate-400

SANS_B = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
SANS_R = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

img = Image.new("RGB", (W, H), INK)
d = ImageDraw.Draw(img)

# --- decorative comic panels, top-right, subtle ---
for px, py, pw, ph in [
    (905, 70, 95, 130),
    (1015, 70, 115, 130),
    (905, 215, 225, 90),
]:
    d.rectangle([px, py, px + pw, py + ph], outline=INK_LT, width=4)

# --- left accent spine ---
d.rectangle([0, 0, 20, H], fill=BRAND)

def font(path, size):
    return ImageFont.truetype(path, size)

def text_w(s, f):
    return d.textbbox((0, 0), s, font=f)[2]

def centered(s, f, y, fill):
    d.text(((W - text_w(s, f)) // 2, y), s, font=f, fill=fill)

def tracked(s, f, y, fill, spacing):
    """Draw letter-spaced text, horizontally centered."""
    widths = [text_w(c, f) for c in s]
    total = sum(widths) + spacing * (len(s) - 1)
    x = (W - total) // 2
    for c, cw in zip(s, widths):
        d.text((x, y), c, font=f, fill=fill)
        x += cw + spacing

# --- eyebrow ---
tracked("PRINTINGCOMICS.COM", font(SANS_B, 30), 118, BRAND, 8)

# --- title ---
centered("Printing Comics", font(SANS_B, 132), 175, WHITE)

# --- tagline ---
centered("Custom Comic & Graphic Novel Printing", font(SANS_R, 44), 350, MUTED)

# --- divider ---
d.rectangle([(W // 2) - 70, 432, (W // 2) + 70, 438], fill=BRAND)

# --- feature chips ---
chips = ["Short Runs", "Bulk Orders", "Collectible-Grade Quality"]
cf = font(SANS_B, 30)
pad_x, gap, ch = 30, 22, 64
widths = [text_w(c, cf) + pad_x * 2 for c in chips]
total = sum(widths) + gap * (len(chips) - 1)
x = (W - total) // 2
y = 478
for c, cw in zip(chips, widths):
    d.rounded_rectangle([x, y, x + cw, y + ch], radius=ch // 2,
                        fill=INK_LT, outline=BLUE, width=3)
    tb = d.textbbox((0, 0), c, font=cf)
    d.text((x + (cw - tb[2]) // 2, y + (ch - tb[3]) // 2 - 4), c, font=cf, fill=WHITE)
    x += cw + gap

img.save("/home/user/printingcomics/web/public/og-image.png", "PNG")
print(f"wrote web/public/og-image.png ({W}x{H})")
