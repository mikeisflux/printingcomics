from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 2063, 3150  # 6.875 x 10.5 inches at 300 DPI
TRIM = (38, 38, 2025, 3112)  # 6.625 x 10.25 inches
SAFE = (113, 113, 1950, 3037)  # 6.125 x 9.75 inches

GOLD = (198, 161, 91)
GOLD_DARK = (115, 79, 31)
BLACK = (13, 13, 14)
INK = (32, 31, 29)
PAPER = (249, 246, 239)
BLEED_TINT = (117, 31, 26)
SAFE_GREEN = (65, 111, 72)

FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_CONDENSED = "/System/Library/Fonts/Avenir Next Condensed.ttc"


def font(path, size, index=0):
    return ImageFont.truetype(path, size=size, index=index)


def centered(draw, text, y, selected_font, fill, spacing=4):
    box = draw.multiline_textbbox((0, 0), text, font=selected_font, spacing=spacing, align="center")
    width = box[2] - box[0]
    draw.multiline_text(((WIDTH - width) / 2, y), text, font=selected_font, fill=fill, spacing=spacing, align="center")


def dashed_rectangle(draw, box, fill, width=5, dash=24, gap=15):
    left, top, right, bottom = box
    for start in range(left, right, dash + gap):
        draw.line((start, top, min(start + dash, right), top), fill=fill, width=width)
        draw.line((start, bottom, min(start + dash, right), bottom), fill=fill, width=width)
    for start in range(top, bottom, dash + gap):
        draw.line((left, start, left, min(start + dash, bottom)), fill=fill, width=width)
        draw.line((right, start, right, min(start + dash, bottom)), fill=fill, width=width)


def contain(image, max_width, max_height):
    copy = image.copy()
    copy.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
    return copy


def write_exact_size_pdf(image, destination):
    """Embed the 300 DPI guide on an exact 6.875 x 10.5 inch PDF page."""
    jpeg = BytesIO()
    image.save(jpeg, "JPEG", quality=96, subsampling=0, dpi=(300, 300))
    jpeg_bytes = jpeg.getvalue()
    page_width, page_height = 495, 756  # PDF points: 6.875 x 10.5 inches
    content = f"q\n{page_width} 0 0 {page_height} 0 0 cm\n/Im0 Do\nQ\n".encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width} {page_height}] "
            "/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>"
        ).encode("ascii"),
        b"<< /Length " + str(len(content)).encode("ascii") + b" >>\nstream\n" + content + b"endstream",
        (
            b"<< /Type /XObject /Subtype /Image /Width " + str(WIDTH).encode("ascii")
            + b" /Height " + str(HEIGHT).encode("ascii")
            + b" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "
            + str(len(jpeg_bytes)).encode("ascii") + b" >>\nstream\n" + jpeg_bytes + b"\nendstream"
        ),
        b"<< /Title (Philbo POD Standard Comic Template) /Creator (Powers Creative Solutions) >>",
    ]
    pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{number} 0 obj\n".encode("ascii"))
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")
    xref = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("ascii")
    )
    destination.write_bytes(pdf)


def main():
    image = Image.new("RGB", (WIDTH, HEIGHT), BLEED_TINT)
    draw = ImageDraw.Draw(image)

    # Trimmed page and safe live area.
    draw.rectangle(TRIM, fill=PAPER, outline=GOLD, width=8)
    dashed_rectangle(draw, SAFE, SAFE_GREEN, width=5)

    dragon_path = ROOT / "public/assets/brand/philbo-dragon-3d.png"
    wordmark_path = ROOT / "public/assets/brand/philbo-3d-logo.png"

    # Subtle real-brand watermark, kept away from the guide lines.
    dragon = contain(Image.open(dragon_path).convert("RGBA"), 1280, 1280)
    dragon.putalpha(dragon.getchannel("A").point(lambda value: int(value * 0.075)))
    image.paste(dragon, ((WIDTH - dragon.width) // 2, 1050), dragon)

    # Black branded header inside the safe area.
    header = (SAFE[0] + 16, SAFE[1] + 16, SAFE[2] - 16, 580)
    draw.rounded_rectangle(header, radius=26, fill=BLACK, outline=GOLD, width=5)
    wordmark = contain(Image.open(wordmark_path).convert("RGBA"), 1040, 250)
    image.paste(wordmark, ((WIDTH - wordmark.width) // 2, 165), wordmark)
    centered(draw, "STANDARD COMIC - SINGLE-PAGE TEMPLATE", 430, font(FONT_BOLD, 57), GOLD)
    centered(draw, "GUIDE ONLY - REMOVE OR HIDE THIS LAYER BEFORE EXPORT", 510, font(FONT_BOLD, 28), (238, 224, 194))

    # Technical legend.
    legend_y = 680
    badge_font = font(FONT_BOLD, 34)
    detail_font = font(FONT_REGULAR, 28)
    legends = [
        (BLEED_TINT, "FULL BLEED", '6.875" x 10.5"'),
        (GOLD_DARK, "TRIM SIZE", '6.625" x 10.25"'),
        (SAFE_GREEN, "SAFE AREA", '6.125" x 9.75"'),
    ]
    card_width = 550
    total = card_width * 3 + 36 * 2
    x = (WIDTH - total) // 2
    for color, title, detail in legends:
        draw.rounded_rectangle((x, legend_y, x + card_width, legend_y + 165), radius=20, fill=(255, 255, 255), outline=color, width=5)
        draw.rectangle((x, legend_y, x + 18, legend_y + 165), fill=color)
        draw.text((x + 46, legend_y + 30), title, font=badge_font, fill=INK)
        draw.text((x + 46, legend_y + 91), detail, font=detail_font, fill=(83, 80, 74))
        x += card_width + 36

    centered(draw, "KEEP ALL IMPORTANT TEXT, LOGOS, AND FACES INSIDE THE GREEN SAFE-AREA LINE.", 930, font(FONT_BOLD, 31), INK)

    # Bottom production instructions.
    panel = (SAFE[0] + 45, 2420, SAFE[2] - 45, SAFE[3] - 45)
    draw.rounded_rectangle(panel, radius=28, fill=(255, 255, 255), outline=GOLD, width=5)
    draw.text((panel[0] + 56, panel[1] + 45), "FILE REQUIREMENTS", font=font(FONT_BOLD, 48), fill=INK)
    requirements = [
        "300 DPI artwork",
        "Submit one multi-page PDF in reading order",
        "Every PDF page must be a separate page - no printer spreads",
        "Split two-page artwork across its two consecutive single pages",
        "Page count includes the four cover pages",
    ]
    y = panel[1] + 130
    body_font = font(FONT_REGULAR, 34)
    for line in requirements:
        draw.ellipse((panel[0] + 58, y + 10, panel[0] + 74, y + 26), fill=GOLD_DARK)
        draw.text((panel[0] + 98, y), line, font=body_font, fill=INK)
        y += 72

    centered(draw, "BLEED EXTENDS TO THE RED EDGE  |  GOLD LINE = FINAL TRIM  |  GREEN DASH = SAFE AREA", 3062, font(FONT_BOLD, 25), INK)

    public_dir = ROOT / "public/downloads"
    output_dir = ROOT / "output/pdf"
    public_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    png_name = "Philbo-POD-standard-comic-template-300dpi.png"
    pdf_name = "Philbo-POD-standard-comic-template.pdf"
    for directory in (public_dir, output_dir):
        image.save(directory / png_name, "PNG", dpi=(300, 300), optimize=True)
        write_exact_size_pdf(image, directory / pdf_name)


if __name__ == "__main__":
    main()
