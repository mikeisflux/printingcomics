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

## Results — 52/52 verified

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
| Collating Marks | per-signature staircase, wrap colour, half-height, range | ✓ |
| OMR Marks | program bits → bars, sync, bar-height, repeats, per-edge geometry | ✓ |
| Gathering Marks | per-section horizontal staircase, gripper edge, wrap colour | ✓ |
| Folding Marks | fold fractions per scheme, dash styles, roll-fold tuck, custom | ✓ |
| Lay Marks | arrow/line/cross glyph counts, gripper + side-lay geometry | ✓ |
| Die Lines / Cut Contour | /Separation spot CS + spot stroke, shape/dash/offset | ✓ |
| White / Varnish | spot fill, under-base prepend vs varnish append | ✓ |
| Braille (Grade-1) | text→cell dot counts, number sign, spot channel | ✓ |
| Die Lines | red cut + blue crease strokes present | ✓ |
| Dimensions | trim width + height labels + bleed size | ✓ |
| Barcode / QR | QR + Code128 + **DataMatrix (ECC200)** + EAN-13; RS syndromes vanish, 9-pt position, rotation, colours | ✓ |
| Watermark | diagonal text, colour + page range | ✓ |
| Backdrop (fill) | full-page solid fill *before* content | ✓ |
| Backdrop (file) | composites uploaded PDF/image behind content; repeat / range / opacity | ✓ |
| PDF Repair | rebuilt; strip metadata / annotations / JS + range | ✓ |
| Color Effects | CSS-filter stack builder + rasterise (browser) | ✓ |
| Color Management | RGB→CMYK gamut (Neugebauer) + out-of-gamut + ICC OutputIntent | ✓ |
| Preflight (deep) | fonts/colour-spaces/images/annots/JS/layers report + clean | ✓ |
| Gang Sheet plan | items/sheet, makeready + spoilage → total sheets | ✓ |
| Layers (OCG) | read named layers, force on/off/default | ✓ |
| Custom Impose | per-cell page placement + rotation + fill strategies | ✓ |
| PDF Tools | optimize (object streams) · decrypt (strip encryption) | ✓ |
| Page Numbering | number on every page | ✓ |
| Cutter Marks | margin added + corner marks | ✓ |
| Tiled Poster | 2×2 → 4 tiles | ✓ |
| Numbered Tickets | 8 tickets → 2 sheets + numbers | ✓ |
| Preflight | reports pages / uniform size | ✓ |

## Production recipes (workflows)

The Workflows tab ships **69 named production recipes** across 9 categories
(Booklets & Books, Cards & Flat, Labels & Stickers, Packaging, Large Format,
Production Marks, Calendars & Specialty, Ganging & Optimization, Transform &
Prep) plus 6 starter chains. Each recipe is an ordered pipeline whose steps map
to the verified engines above; "Make this" loads the chain into the pipeline
builder. Verified that representative multi-step chains (bleed→n-up→marks;
nest→cut-contour→registration; rotate→flip→resize→shuffle→dims→barcode→qr→
optimize→repair; booklet→gathering→collating→colour-bar) run end-to-end without
error. Steps that need a second file or a server pass (merge, interleave, die
templates, tiling, OMR/lay marks) are marked as prep/pass-through steps.

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
- **Barcode** — ~~DataMatrix~~ now implemented (ECC200: GF(256)/0x12d Reed-Solomon
  with FCR α¹, ISO 16022 Annex F placement, ASCII encodation, sizes 10–26).
- **Gang Sheet** — the *classic* Gang Sheet tool still lays out a uniform grid;
  mixed-size bin-packing now lives in the dedicated **Nesting / Stickers** tool.
- **Preflight** — size/uniformity only (no fonts / DPI / ink-coverage).
- **Die Lines** — carton + folder presets (no arbitrary spot-colour layers).

## Not implemented (deep specialty)

Edit PDF, JDF/CIP4 export, and — of the PDF Optimizer — **linearization and
encryption writing** (pdf-lib can't author those client-side; optimize, decrypt
and repair are implemented). Layers (OCG) is now implemented and verified.

(OMR, Folding, Gathering and Lay marks, Cut Contour die lines, White/Varnish,
Braille, DataMatrix, Color Effects and Color Management — previously listed
here — are now implemented and verified above. Color Effects / Color Management
rasterise in the browser via pdf.js; their pure cores — the CSS-filter builder,
the RGB↔CMYK Neugebauer gamut model, and the ICC OutputIntent embed — are
unit-verified in Node.)
