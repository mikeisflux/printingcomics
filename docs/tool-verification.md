# Tool functional verification

Every tool in `pdfpress-reference.md` was exercised against the engine
(`web/src/lib/impose.ts`) and its **output PDF inspected** — page counts, page
sizes, page boxes, rotation, and the actual **content-stream operators** (which
source page landed in which cell, which marks/text/fills were drawn). This is a
functional check of real output, not just "a PDF came back."

Method: build a numbered/uniquely-sized source PDF, run the tool, then decode
each output page's content stream (`decodePDFRawStream`) and assert the
documented behavior. Imposition **order** is proven by mapping each embedded
XObject's BBox back to its source page and reading the `cm … Do` placements.

## Results — 36/36 verified

| Tool | Assertion | ✓ |
|---|---|---|
| Cards (step & repeat) | 1 sheet, all 4 cells = page 1 | ✓ |
| Booklet (saddle) | 8pg → spreads `[8\|1][2\|7][6\|3][4\|5]` | ✓ |
| Booklet (RTL) | spread 0 mirrored `1\|8` | ✓ |
| Booklet (perfect-bind sig) | 32pg, 8-per-sig → 16 spreads | ✓ |
| Grid (sequential) | 4 distinct pages, one per cell | ✓ |
| Cut & Stack | sheet0 `1,3,5` / sheet1 `2,4,6` → cut+stack reads `1-6` | ✓ |
| Shuffle | `1,2>,B,4-1` → 7 pages, p2 rotated 90° | ✓ |
| Variable Data | 3 CSV records + QR modules drawn | ✓ |
| Resize (scale) | 50% → half dimensions | ✓ |
| Resize (fit) | fit Letter → 612×792 | ✓ |
| Rotate | 90° applied | ✓ |
| Crop | per-edge inset shrinks CropBox | ✓ |
| Split | `1-3,4-6,7-8` → 3 files (3/3/2) | ✓ |
| Flip (H / V) | mirror matrix `-1 0 0 1` / `1 0 0 -1` | ✓ |
| Merge | 4 + 8 → 12 pages | ✓ |
| Overlay | stamp XObject composited | ✓ |
| BleedMaker | page grows by 2×bleed, TrimBox = original | ✓ |
| Nudge | content matrix applied | ✓ |
| Header / Footer | text drawn | ✓ |
| Color Bar | page grows, 11 swatch fills | ✓ |
| Insert Pages | 4 + 2 blanks → 6 | ✓ |
| Mix / Interleave | widths `A1,B1,A2,B2…` order | ✓ |
| Slugline | strip added + text | ✓ |
| Registration Marks | crosshair + bullseye strokes | ✓ |
| Collating Marks | filled tick per page | ✓ |
| Die Lines | red cut + blue crease strokes present | ✓ |
| Dimensions | width + height labels | ✓ |
| Barcode / QR | QR module fills drawn | ✓ |
| Watermark | diagonal text | ✓ |
| Backdrop | full-page fill *before* content | ✓ |
| PDF Repair | rebuilt, page count preserved | ✓ |
| Page Numbering | number on every page | ✓ |
| Cutter Marks | margin added + corner marks | ✓ |
| Tiled Poster | 2×2 → 4 tiles | ✓ |
| Numbered Tickets | 8 tickets → 2 sheets + numbers | ✓ |
| Preflight | reports pages / uniform size | ✓ |

## Known option gaps (work, but missing documented options)

These tools produce correct output but do **not** yet implement every option the
guide lists:

- **N-up Book** — currently **approximated** with the 2-up saddle/perfect
  booklet engine. True N-up signature imposition (4 quarto / 8 octavo / 16 / 32
  pages per sheet side with the correct fold rotations — e.g. the top row flipped
  180°) and creep-direction inward/outward are **not** implemented.
- **Shuffle** — has ranges, rotation (`>` `^` `<`) and blanks (`X`); missing
  `all`, `odd`/`even`, `first`/`last`, `last-1` reverse, `N*(…)` repeats,
  `[a,b]` interleave, `group N:` groups, and the one-click quick actions.
- **Grid / Cards** — Z-pattern only (no S-pattern / snake fill).
- **Rotate** — 90/180/270 only (no custom angle).
- **Split** — range mode only (no fixed-chunk mode or zip output).
- **Overlay** — center/fill/tile + opacity (no blend modes / 9-point anchor).
- **BleedMaker** — scale mode only (no solid-colour / mirror-edge).
- **Header/Footer & Slugline** — plain text (no `[page-number]` / `[timestamp]`
  variable tokens or alternate sides).
- **Barcode/QR** — QR only (no Code 128 / DataMatrix / EAN-13; no CSV-per-row on
  the standalone tool — the data-merge tool does QR-per-row).
- **Cutter Marks** — corner marks (no knockout / key mark / overshoot / cut type).
- **Gang Sheet** — uniform gang (no true mixed-size bin-packing).
- **Preflight** — size/uniformity only (no fonts / DPI / ink-coverage).
- **Die Lines** — carton + folder presets (no arbitrary spot-colour
  Kiss/Perf/Thru layers).

## Not implemented (deep specialty)

Edit PDF, Distortion Compensation, Folding/OMR/Gathering/Lay marks,
White/Varnish, Braille, Color Effects, Color Management (ICC), Layers (OCG),
PDF Optimizer (linearize/encrypt), JDF/CIP4 export.
