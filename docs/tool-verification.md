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

## Closed option gaps (v1.2.5)

These documented options are now implemented and verified:

- **Page range** — `all` / `1-5` / `odd` / `even` / `last` / `last-2` on **Flip,
  Rotate, Crop, Resize** (shared `parsePageRange`).
- **Rotate** — arbitrary custom angle (grows the page box to fit), plus 90/180/270.
- **Split** — fixed **chunk mode** + single **.zip** download (dependency-free zip).
- **Grid / Cards** — **S-pattern (snake)** fill + RTL column order.
- **Cut and Stack** — RTL strip order.
- **N-up Book** — 2-up folio + verified 4-up **quarto**.
- **BleedMaker** — **scale / solid-colour / mirror-edge** methods.
- **Header/Footer & Slugline** — variable tokens `[page-number]`,
  `[page-number:0001]`, `[page-count]`, `[file-name]`, `[timestamp:%Y-%m-%d]`,
  plus alternate-sides for running heads.
- **Overlay** — 9-point anchor + padding + **Multiply blend mode**.
- **Cutter Marks** — cut type (thru/kiss/crease/perf), knockout halo, overshoot,
  orientation key mark.
- **Barcode/QR** — **Code 128** and **EAN-13** (with check digit) alongside QR, on
  both the standalone stamp tool and the data-merge (one code per CSV row).
- **Distortion Comp.** — flexo/gravure cylinder pre-shrink: factor from cylinder
  geometry (D/(D+2t)) or a custom %, applied circumferential / cross-web / both.
- **Nesting / Stickers** — mixed-size gang packing: skyline bottom-left
  bin-packing (fast rectangular) plus optional **true-shape** mode that
  rasterises each artwork's alpha outline (pdf.js occupancy grid) and drops
  items into each other's negative space. Sheet or continuous-roll media,
  90° auto-rotate, fill-sheet or fixed copy count. Verified: 20 cards → 2
  sheets, mixed 5 items on one sheet, roll grows to fit, fill-sheet packs 15;
  true-shape gracefully falls back to skyline when the rasteriser is
  unavailable (headless Node).

## Remaining option gaps (bigger builds)

- **N-up Book** — 8-up octavo / 16 / 32 fall back to folio saddle/perfect.
- **Barcode** — DataMatrix (needs Reed-Solomon + matrix placement).
- **Gang Sheet** — the *classic* Gang Sheet tool still lays out a uniform grid;
  mixed-size bin-packing now lives in the dedicated **Nesting / Stickers** tool.
- **Preflight** — size/uniformity only (no fonts / DPI / ink-coverage).
- **Die Lines** — carton + folder presets (no arbitrary spot-colour layers).

## Not implemented (deep specialty)

Edit PDF, Folding/OMR/Gathering/Lay marks,
White/Varnish, Braille, Color Effects, Color Management (ICC), Layers (OCG),
PDF Optimizer (linearize/encrypt), JDF/CIP4 export.
