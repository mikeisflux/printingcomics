#!/usr/bin/env python3
"""
Generate the trading-card print template.

Written as raw PDF so it needs no libraries: the repo ships templates as
static assets, and a build step nobody can run is worse than a little
plumbing here. Re-run after editing:

    python3 scripts/make-trading-card-template.py

Geometry (standard trading card):
    trim   2.5  x 3.5  in   (180 x 252 pt)
    bleed  +0.125 in per side -> 2.75 x 3.75 in (198 x 270 pt)
    safe   0.25 in inside trim -> 2.0 x 3.0 in (144 x 216 pt)

The page box IS the bleed size, with TrimBox/BleedBox set so a prepress RIP
reads the real trim rather than guessing from the artwork.
"""
from pathlib import Path

PT = 72.0
def inch(v): return v * PT

BLEED_W, BLEED_H = inch(2.75), inch(3.75)
TRIM_INSET = inch(0.125)             # bleed margin
SAFE_INSET = TRIM_INSET + inch(0.25)  # safe area sits 0.25" inside the trim
CORNER_R = inch(0.125)               # typical die-cut corner radius

RED   = "0.776 0.102 0.133"
BLUE  = "0.118 0.455 0.988"
BLACK = "0.1 0.1 0.1"
GREY  = "0.45 0.45 0.45"
PINK  = "0.984 0.918 0.925"


def rounded_rect(x, y, w, h, r):
    """Rounded rectangle path (bezier corners)."""
    k = 0.5523 * r
    return " ".join([
        f"{x + r:.2f} {y:.2f} m",
        f"{x + w - r:.2f} {y:.2f} l",
        f"{x + w - r + k:.2f} {y:.2f} {x + w:.2f} {y + r - k:.2f} {x + w:.2f} {y + r:.2f} c",
        f"{x + w:.2f} {y + h - r:.2f} l",
        f"{x + w:.2f} {y + h - r + k:.2f} {x + w - r + k:.2f} {y + h:.2f} {x + w - r:.2f} {y + h:.2f} c",
        f"{x + r:.2f} {y + h:.2f} l",
        f"{x + r - k:.2f} {y + h:.2f} {x:.2f} {y + h - r + k:.2f} {x:.2f} {y + h - r:.2f} c",
        f"{x:.2f} {y + r:.2f} l",
        f"{x:.2f} {y + r - k:.2f} {x + r - k:.2f} {y:.2f} {x + r:.2f} {y:.2f} c",
        "h",
    ])


# Helvetica advance widths (/1000 em) for the characters these labels use, so
# centring is exact instead of an average-width guess that drifts on caps.
_W = {**{c: 556 for c in "0123456789"},
      **dict(zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                 [667,667,722,722,667,611,778,722,278,500,667,556,833,722,
                  778,667,778,722,667,611,722,667,944,667,667,611])),
      **dict(zip("abcdefghijklmnopqrstuvwxyz",
                 [556,556,500,556,556,278,556,556,222,222,500,222,833,556,
                  556,556,556,333,500,278,556,500,722,500,500,500])),
      " ": 278, ".": 278, ",": 278, "-": 333, ":": 278, "/": 278,
      "(": 333, ")": 333, "'": 191, "\"": 355, "x": 500, "+": 584}


def width_of(s: str, size: float) -> float:
    return sum(_W.get(ch, 556) for ch in s) * size / 1000.0


def text(x, y, size, color, s, align="l", max_w=None):
    """Draw text; shrink to fit max_w so a label can never overrun the guides."""
    if max_w:
        while size > 3.5 and width_of(s, size) > max_w:
            size -= 0.25
    esc = s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    if align == "c":
        x -= width_of(s, size) / 2
    return f"BT /F1 {size:.2f} Tf {color} rg {x:.2f} {y:.2f} Td ({esc}) Tj ET\n"


def page_stream(face: str) -> str:
    tx, ty = TRIM_INSET, TRIM_INSET
    tw, th = BLEED_W - 2 * TRIM_INSET, BLEED_H - 2 * TRIM_INSET
    sx, sy = SAFE_INSET, SAFE_INSET
    sw, sh = BLEED_W - 2 * SAFE_INSET, BLEED_H - 2 * SAFE_INSET

    o = []
    # Bleed zone tinted, so "art must reach here" is obvious at a glance.
    o.append(f"{PINK} rg 0 0 {BLEED_W:.2f} {BLEED_H:.2f} re f\n")
    o.append(f"1 1 1 rg {tx:.2f} {ty:.2f} {tw:.2f} {th:.2f} re f\n")

    # Bleed edge (dashed red), inset half a line width so it renders on-page.
    o.append("0.75 w [3 2] 0 d\n")
    o.append(f"{RED} RG 0.38 0.38 {BLEED_W - 0.75:.2f} {BLEED_H - 0.75:.2f} re S\n")

    # Trim (solid black) + the die-cut corner radius as a guide.
    o.append("[] 0 d 1 w\n")
    o.append(f"{BLACK} RG {tx:.2f} {ty:.2f} {tw:.2f} {th:.2f} re S\n")
    o.append("0.5 w [2 2] 0 d 0.6 0.6 0.6 RG\n")
    o.append(rounded_rect(tx, ty, tw, th, CORNER_R) + " S\n")

    # Safe area (dashed blue).
    o.append("0.75 w [3 2] 0 d\n")
    o.append(f"{BLUE} RG {sx:.2f} {sy:.2f} {sw:.2f} {sh:.2f} re S\n")
    o.append("[] 0 d\n")

    # Labels — kept inside the safe area so nothing collides with the guides.
    cx = BLEED_W / 2
    safe_top, safe_bot = sy + sh, sy
    o.append(text(cx, safe_top - 11, 7.5, BLACK, f"TRADING CARD - {face}", "c", sw - 6))
    o.append(text(cx, safe_top - 21, 6, GREY, "Trim 2.5 x 3.5 in", "c", sw - 6))
    o.append(text(cx, safe_bot + 24, 5.5, RED, "Art must fill to the red bleed edge", "c", sw - 6))
    o.append(text(cx, safe_bot + 15, 5.5, BLUE, "Keep text inside the blue safe area", "c", sw - 6))
    o.append(text(cx, safe_bot + 6, 5, GREY, "Bleed 2.75 x 3.75 in - 300 DPI - CMYK", "c", sw - 6))
    return "".join(o)


def build() -> bytes:
    objs = {}
    tx, ty = TRIM_INSET, TRIM_INSET
    trim_box = f"[{tx:.2f} {ty:.2f} {BLEED_W - tx:.2f} {BLEED_H - ty:.2f}]"
    media = f"[0 0 {BLEED_W:.2f} {BLEED_H:.2f}]"

    objs[1] = "<< /Type /Catalog /Pages 2 0 R >>"
    objs[2] = "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>"
    for n, (pobj, cobj, face) in enumerate([(3, 4, "FRONT"), (5, 6, "BACK")]):
        objs[pobj] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox {media} "
            f"/BleedBox {media} /TrimBox {trim_box} /ArtBox {trim_box} "
            f"/Resources << /Font << /F1 7 0 R >> >> /Contents {cobj} 0 R >>"
        )
        stream = page_stream(face)
        objs[cobj] = f"<< /Length {len(stream)} >>\nstream\n{stream}endstream"
    objs[7] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"

    out = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offsets = {}
    for num in sorted(objs):
        offsets[num] = len(out)
        out += f"{num} 0 obj\n{objs[num]}\nendobj\n".encode("latin-1")

    xref_at = len(out)
    n = max(objs) + 1
    out += f"xref\n0 {n}\n".encode()
    out += b"0000000000 65535 f \n"
    for num in range(1, n):
        out += f"{offsets[num]:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {n} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode()
    return bytes(out)


if __name__ == "__main__":
    dest = Path("web/public/templates/template-trading-card.pdf")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(build())
    print(f"wrote {dest} ({dest.stat().st_size} bytes)")
