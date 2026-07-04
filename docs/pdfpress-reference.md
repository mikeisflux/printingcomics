# pdfpress.app — Tool Guide Reference (for parity work)

Internal reference captured from the pdfpress.app tool guide, condensed and
organized. Use it to bring our `/admin/impose` tools to feature parity. The
**Parity Map** at the bottom maps every pdfpress tool to ours with a status.

Their headline numbers: **43–48 tools**, **68 production recipes**, **195
templates**, plus a prepress glossary. Everything is client-side (files never
leave the browser) — same privacy model as ours.

---

## Quick Start (their 6-step flow)

1. **Upload** — drag/drop PDF, PNG, or JPEG (images auto-convert to PDF). Multiple files for merge/mix/gang.
2. **Pick a Tool** — 4 category tabs (Layout, Transform, Enhance, Advanced) + search.
3. **Configure Options** — per-tool settings panel, paper presets, unit selector (in/mm/pt), tooltips, live preview in a background worker.
4. **Chain Multiple Tools** — "Add Step" builds a pipeline; drag to reorder; save a chain as a custom tool ("My Tools").
5. **Preview & Navigate** — zoom (√2 steps), X-ray overlay (page boxes/trim/bleed), checkerboard (transparency), page stepper.
6. **Download & Print** — export PDF, generate a **JDF/CIP4** job ticket, or send to printer.
7. **Templates** — 195 ready-made chains across 6–7 categories; load and customize.

---

## Common option groups (repeated across most Layout tools)

Factored out here; individual tools below only list *distinctive* options.

- **Paper Size** — presets (Letter 8.5×11, Legal 8.5×14, Tabloid 11×17, A4, A3…), landscape swap, aspect lock, custom in in/mm/pt (1in = 72pt = 25.4mm).
- **White Space** — left/top margins, horizontal/vertical gutters, **Center output on page** (distribute leftover space vs anchor top-left).
- **Printer's Marks** — **crop marks** (corner trim lines), **center marks** (edge-midpoint crosshairs for duplex), line **length** (def 0.43in/31pt), **thickness** (def 0.014in/1pt), **distance** (gap to artwork, def 0.139in/10pt), **four-color black** (marks in C+M+Y+K), **knockout** (white halo for dark stock).
- **Bleeds** — 3 modes: **None** (trim at page box), **Pull from document** (use TrimBox/BleedBox), **Fixed** (manual per-side, ~3mm/0.125in commercial).
- **Layout** — fill pattern **Z-pattern** (L→R, T→B) / **S-pattern (snake)**, columns×rows (auto or manual), **step-and-repeat**, **double-sided** (duplex pairing).

---

## Layout Tools (8)

- **Cards** — tile *identical* copies (step-and-repeat) onto larger sheets. Distinctive: **Autoscale** (fill cell vs original size), **Double-sided** (pg1 front/pg2 back, odd docs get trailing blank), **Preserve aspect ratio**. Best for business cards, postcards, labels, tickets, hang tags.
- **Booklet** — printer spreads for fold+bind. Distinctive: **Saddle size** (empty = saddle-stitch; N = perfect-binding signatures of N sheets), **Fill last saddle** (pad final signature), **Page creep** (auto per-sheet shingling), **Center gutter** (spine), **Rotate pages** (portrait output). Saddle ≤ ~64pp; page count multiple of 4.
- **Zine** — fold a single sheet into a mini booklet, no stapling (8- or 16-page fold-and-cut).
- **Shuffle** — reorder pages via expression language: ranges `1-5,8`, `odd`/`even`, `last-1` (reverse), rotation suffixes `>`(90) `^`(180) `<`(270), repeats `5*(1)`, groups `group 3: 3 2 1`, blanks `X`. Quick actions: Reverse All, Odd/Even Split, Interleave. Used for cut-and-stack numbering.
- **Grid** — *different* source page per cell (vs Cards). Distinctive: columns, rows, **Double-sided** (back auto-mirrored), page order LTR/RTL, fill **Sequential / Stack (cut-and-stack) / Step-and-repeat**. For N-up, proofing, contact sheets.
- **N-up Book** — multi-page-per-sheet + signature imposition. **N-up**: 2 folio / 4 quarto / 8 octavo / 16 / 32; **Binding** nested vs perfect; **Creep direction** inward/outward; **Direction** LTR/RTL; binding gutter (def 2.835pt/1mm).
- **Cut and Stack** — pages ordered so cut strips stack into reading order. Double-sided auto-arranges backs. Good for flyers/coupons/high volume.
- **Variable Data** — personalize each copy from a spreadsheet of text, images, and codes.

## Transform Tools (9)

- **Edit PDF** — edit text, add content, sign, redact, manage pages.
- **Resize** — percentage (50/71/100/141/200) or fit-to-paper; **Stretch to fit** (distort) vs preserve aspect; page range.
- **Rotate** — 90/180/270 or custom degrees (about center; non-90 grows the box); page range.
- **Crop** — remove per-edge amounts (value = amount removed, not remaining); page range. Crop to TrimBox to strip marks/bleed.
- **Split** — chunk mode (fixed page count) or visual (click between thumbnails); outputs a zip. Also poster/tile splitting with 10mm overlap.
- **Flip** — horizontal mirror (iron-on transfers, screen films, plate emulsion); page range. H = work-and-tumble backup, V = work-and-turn.
- **Merge PDFs** — combine files in order; mixed page sizes preserved.
- **Overlay** — composite a 2nd PDF *on top*: blend (Normal/Multiply), opacity, 9-point anchor + padding, **Repeat** to cycle overlay pages. Watermarks, letterheads, die-line templates.
- **Distortion Comp.** — pre-shrink for flexo/gravure cylinder stretch. Modes: cylinder (diameter + plate thickness), gear teeth, custom %. Direction: print/cross-web/both. Typical 96–99%.

## Enhance Tools (25)

- **BleedMaker** — synthesize bleed: **Scale** (enlarge content into bleed) or **Solid Color** (flat fill) or **Mirror** (mirror edge pixels). Amount presets (3mm commercial, 5mm packaging).
- **Nudge** — per-page translate/rotate by tiny deltas for registration/plate drift; apply last in pipeline.
- **Header or Footer** — text with variable tokens `[page-number]` `[page-count]` `[sheet-number]` `[file-name]` `[timestamp:%Y-%m-%d]`, padding `[page-number:0001]`, 8-position grid, rotation, **alternate sides** (book running heads), font/size.
- **Color Bar** — CMYK/registration density strip along an edge; spot patches, shapes (square/circle/rect), repeat.
- **Stickers** — true-shape **nesting** (transparency detection) onto sheet or roll; rotations (4/8), pixel density, item padding, fill-sheet/copy-count.
- **Calendar** — front/back page pairing (full-sheet or half-sheet), **rotate back cover** for hanging; needs 13-page source (cover + 12).
- **Insert Pages** — insert pages from another PDF at a position or every N pages (dividers, duplex blanks, slip sheets).
- **Mix** — interleave two PDFs (ABAB) — reassemble duplex scans from separate fronts/backs.
- **Slugline** — job-ID text in the slug (outside trim): job#, plate, date, operator; variable tokens; presets (press/bindery/proof); 6–8pt.
- **Folding Marks** — fold guide lines; types half/tri/Z/gate/roll/custom positions; dashed vs solid; top/bottom/both.
- **Registration Marks** — target/crosshair/bullseye at edges + midpoints; prints on all separations; 5–10mm, 0.25–0.5pt.
- **Collating Marks** — stepped **spine** staircase per signature; signature count, mark offset, wrap color. (We have this.)
- **OMR Marks** — machine-readable bars for automated finishing (fold/collate/cut/divert); manufacturer encodings (Hunkeler, Müller Martini, Horizon, Duplo); edge + program.
- **Gathering Marks** — staircase at the **gripper** edge (vs spine) for pre-bind sequence QC; section wrap.
- **Lay Marks** — press-sheet feed/orientation guides: front lay, side lay, center, orientation arrows.
- **Die Lines** — vector cut/crease/perf paths on spot-color layers (**CutContour/KissCut/Crease/Perf/ThruCut/DieCut**); shape rect/rounded/ellipse; target box; thickness/corner-radius/dash; offset; overshoot.
- **Dimensions** — label exact trim/bleed sizes in the margins.
- **White / Varnish** — add a white-ink or spot-varnish layer as a named spot color.
- **Braille** — raised Grade-1 Braille dots.
- **Barcode / QR** — QR / Code 128 / DataMatrix / EAN-13; **Static** or **CSV/Excel** (one unique page per row); column or template `{event}-{row}{seat}`; symbology auto-detect; scale, bar height, position grid + offsets, colors; quiet zone, 100% K.
- **Watermark** — diagonal text overlay; presets (DRAFT/CONFIDENTIAL/PROOF/COPY/SAMPLE); size/color/opacity/angle; page range.
- **Backdrop** — place a PDF/image *behind* content (opposite of Overlay); offset/scale/opacity/repeat.
- **Color Effects** — brightness/contrast/saturation, grayscale, warm/sepia, invert, hue-rotate; rasterizes at chosen DPI.
- **PDF Repair** — re-serialize (fix xref/streams/objects), strip metadata, remove annotations/JS.
- **Color Management** — ICC convert (source→destination profile), rendering intents (Perceptual/Relative/Saturation/Absolute), soft-proof + paper-white sim, **gamut warning**; upload .icc/.icm; rasterize DPI.

## Advanced Tools (6)

- **Preflight Inspector** — report: page boxes, fonts (embedding), color spaces + ink coverage, image DPI, hairlines; issue rail + marked-proof export. (We have a lite version.)
- **Gang Sheet** — strip/shelf bin-packing of many different-sized designs (DTF/DTG, stickers, gang runs); per-job quantity; **work style** (sheetwise/W&T/W&Tumble/perfecting); makeready + spoilage → total sheet count.
- **Cutter Marks** — optical registration marks for digital cutters (Zünd/Kongsberg/Esko/Graphtec); shape (circle/square/L), **knockout**, **key mark** (orientation), **overshoot**, cut type (thru/kiss/crease/perf), target box. (This is their generic "add marks" used in ~53 recipes.)
- **Layers** — toggle OCG layers (Off/Default/On) created by upstream Color Bar / Cutter Marks / Header-Footer steps.
- **Custom Impose (Expert Grid)** — full manual per-cell page assignment, per-cell rotation + creep, independent gutters, multi-sheet, double-sided; page-fill strategies (Sequential/Repeat/Saddle/Cut-and-Stack/Work-and-Turn/Work-and-Tumble/Reverse/Column-First/Manual).
- **PDF Tools (Optimizer)** — optimize (recompress/remove-unused/normalize), linearize (fast web view), encrypt (128/256 AES + permissions), decrypt, repair.

---

## Production Recipes (68) — categories & members

- **Booklets & Books**: Saddle-Stitch Booklet, Saddle-Stitch with Bleeds, A5 Saddle-Stitch 2-Up on SRA3, Perfect-Bound Book, Perfect-Bound with Color Bar, Case-Bound (Hardcover), Zine/Mini, Comic Book Signatures, Children's Book, Photo Book, Magazine Production, Catalog Signatures, Annual Report.
- **Cards & Flat**: Business Cards, Business Cards (No-Bleed Rescue), Postcards, Greeting Cards, Playing Cards, Door Hangers, Rack Cards, Numbered Tickets, Variable Data Tickets, Wedding Invitations.
- **Labels & Stickers**: Sticker Sheets, Die-Cut Stickers, Product Labels, Shipping Labels, Address Labels, Vinyl Stickers, QR Code Labels, Coasters.
- **Packaging**: Box Layout, Label Wrap, Corrugated Packaging, Bag Layout, Sleeve/Band, Envelope Layout.
- **Large Format**: Poster Tiling, Banner Printing, Signage Repeat, Trade Show Panels, Floor Graphics, Vehicle Wrap.
- **Production Marks**: Full Press Marks, Digital Press Ready, Offset Press Ready, Saddle-Stitch Finishing Marks, Perfect Bind Finishing Marks, Die-Cut Production Marks, Watermarked Proof, Branded Proof.
- **Calendars & Specialty**: Wall Calendar, Desk Calendar, Planner/Diary, Restaurant Menu, Newsletter, Envelope Production.
- **Ganging & Optimization**: Mixed Gang Run, Gang Run with Full Marks, Expert Custom Imposition, Expert Grid with Finishing, Cut-and-Stack Numbering.
- **Transform & Prep**: Print-Ready Preparation, Preflight and Fix, Multi-File Merge, Duplex Interleave, Work and Tumble, Landscape Rotation, Flexo Distortion.

## Templates (195) — categories

Commercial Print · Packaging · Publishing · Large Format · Office · Variable Data · Real Estate. Each is a named, pre-configured tool chain (e.g. "10-Up Business Cards", "Saddle-Stitch A4 Magazine", "Folding Carton — Straight Tuck End", "Feather Flag", "Event Tickets (QR Code)", "Mailing Labels (Avery 5160)").

## Glossary (key terms)

Backing Up · Bleed · CIP4/JDF · Collating Marks · Color Separation · Creep · Crop Marks · Die Line · Dot Gain · Duplex · Flexographic Distortion · Gang Run · Gripper Edge · Gutter · Imposition · Kiss Cut · Knockout · Linearized PDF · N-up · OMR Marks · Overprint · PDF/X · Perfecting · Quiet Zone · Registration Marks · Rich Black · Saddle Stitch · Score · Sheetwise · Signature · Slug Area · Thru-Cut · Total Ink Coverage · Trapping · TrimBox · Work-and-Tumble · Work-and-Turn.

---

## PARITY MAP — pdfpress tool → ours (status + gap)

Legend: ✅ have · 🟡 partial (missing options) · ⛔ missing/specialty.

| pdfpress tool | Our tool / engine | Status | Key gaps to close |
|---|---|---|---|
| Cards | Business/Trading/etc. (`imposeNUp` fixed-cell) | 🟡 | double-sided, bleed modes, center marks, mark weight, S-pattern |
| Booklet | Booklet (`imposeBooklet`) | 🟡 | perfect-binding signature size, fill-last-saddle, rotate output, mark config |
| Zine | Zine (booklet preset) | 🟡 | true one-sheet 8-page fold (we approximate as booklet) |
| Shuffle | Shuffle Pages (`shufflePages`) | 🟡 | expression language (odd/even, rotation `>^<`, repeats, groups, `X` blanks) |
| Grid | N-Up Grid (`imposeNUp`) | 🟡 | double-sided (mirrored back), RTL order, center-on-page |
| N-up Book | N-up Book (`imposeBooklet`) | 🟡 | true N-up signature folds (2/4/8/16/32), creep direction |
| Cut and Stack | Cut & Stack (`imposeNUp` cutStack) | 🟡 | double-sided arrangement |
| Variable Data | Variable Data (`imposeDataMerge` + QR) | ✅ | images from CSV; more symbologies |
| Resize | (calculator only) | ⛔ | build a `resizePdf` (percentage / fit-to-paper) |
| Rotate | Rotate (`rotatePdf`) | 🟡 | custom (non-90) angles, page range |
| Crop | Crop (`cropPdf`) | ✅ | (per-edge; matches) |
| Split | Split PDF (`splitPdf`) | 🟡 | chunk-size mode, zip output, visual split |
| Flip | Flip/Mirror (`flipPdf`) | ✅ | (H/V; matches) |
| Merge PDFs | Merge (`mergePdfs`) | ✅ | (matches) |
| Overlay | Overlay/Watermark (`overlayPdf`) | 🟡 | blend modes, 9-pt anchor + padding |
| Distortion Comp. | — | ⛔ | flexo cylinder pre-distort (new engine) |
| BleedMaker | Bleed & Crop Marks (`generateBleed`) | 🟡 | mirror + solid-color methods (we do scale) |
| Nudge | — | ⛔ | per-page translate/rotate |
| Header/Footer | (pipeline `addHeaderFooter`) | 🟡 | variable tokens, alternate sides |
| Color Bar | Color Bar (`addColorBar`) | 🟡 | edge choice, spot patches, shapes |
| Stickers | Stickers (`imposeNUp` step-repeat) | ⛔ | true-shape nesting, roll media |
| Calendar | Calendar (booklet preset) | 🟡 | front/back pairing, rotate back cover |
| Insert Pages | — | ⛔ | insert-at / every-N |
| Mix | — | ⛔ | ABAB interleave (Shuffle covers some) |
| Slugline | (pipeline `addJobSlug`) | 🟡 | variable tokens, presets |
| Folding Marks | Folding tools (panel guide only) | ⛔ | actual fold guide lines by scheme |
| Registration Marks | (inside marks) | ⛔ | standalone target/crosshair/bullseye |
| Collating Marks | (pipeline `addCollatingMarks`) | ✅ | (matches) |
| OMR / Gathering / Lay Marks | — | ⛔ | specialty finishing marks |
| Die Lines | Dieline generator (`makeDieline`) | 🟡 | spot-color layers, kiss/perf/crease, arbitrary contour |
| Barcode / QR | (in data-merge, QR only) | 🟡 | Code128/DataMatrix/EAN-13, static mode |
| Watermark | (pipeline `addTextWatermark`) | 🟡 | presets, standalone tool |
| Backdrop / Dimensions / White-Varnish / Braille / Color Effects / Color Mgmt | — | ⛔ | specialty (spot colors, ICC, rasterize) |
| Preflight Inspector | Preflight Inspector (`preflight`) | 🟡 | fonts, DPI, ink coverage, marked proof |
| Gang Sheet | Gang Sheet (`imposeNUp`) | 🟡 | true bin-packing of mixed sizes, quantities |
| Cutter Marks | Cutter Marks (`addCropMarksOnly`) | 🟡 | key mark, knockout, overshoot, cut types |
| Layers | — | ⛔ | OCG toggling |
| Custom Impose (Expert Grid) | Expert Grid (`imposeNUp`) | 🟡 | per-cell manual assignment + rotation + creep |
| PDF Tools (Optimizer) | Merge/Split/Rotate/etc. | 🟡 | optimize/linearize/encrypt/decrypt |
| JDF/CIP4 export | — | ⛔ | job-ticket export |
| Templates (195) | Chained workflows (6) + tools | 🟡 | more ready-made template chains |

### Highest-leverage gaps to close first (shared across many tools)
1. **Double-sided (duplex)** on the n-up engine → Cards, Grid, Cut-and-Stack, Gang, Calendar.
2. **Configurable printer's marks**: center marks, line weight, distance, knockout, four-color-black → every layout + mark tool.
3. **Bleed modes** (none / pull-from-document / fixed) → every layout tool.
4. **Perfect-binding signatures + rotate output** on Booklet; true **N-up Book** folds.
5. **Resize** tool (percentage / fit-to-paper) — currently only a calculator.
6. **Shuffle expression language** (odd/even, rotation, repeats, groups, blanks).

### Bigger specialty builds (each its own project)
Distortion compensation, true-shape sticker nesting, ICC color management, OMR/gathering/lay marks, die-line spot-color layers with kiss/perf/crease, barcode symbologies beyond QR, Backdrop/Dimensions/White-Varnish/Braille/Color-Effects, Layers (OCG), Expert-Grid per-cell editor, JDF export.
