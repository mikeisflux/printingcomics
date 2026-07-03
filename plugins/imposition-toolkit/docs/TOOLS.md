# Tool Catalog

60 tools across 8 categories, plus 6 chained workflows and a custom pipeline
builder. Each tool maps to an engine from [API.md](API.md) with a preset; every
value is editable in the UI. Auto-fit layouts recompute `cols × rows` from the
sheet + item size.

## Chained workflows (pipelines)

Multi-step recipes that run operations in sequence (each feeds the next):
Newsletter + page numbers · Branded client proof · Business cards with bleed ·
Magazine production · Perfect-bound with color bar · Gang run, full marks.
Plus **Workflow → build your own** to chain any operations in any order.

## Imposition & layout — `imposeNUp` / `imposeTiledPoster`

| Tool | Layout |
|---|---|
| Standard Sizes | grid n-up, 19 sheet presets |
| Cut & Stack | cut-and-stack page ordering |
| Expert Grid | full manual rows/gutters/margins |
| Optimal Fit | auto-pack at native size |
| Gang Sheet | many pages ganged on one sheet |
| Index Print | contact sheet (thumbnail grid) |
| Photo Prints | 4×6 gang-up |
| Flyers | half-page 4-up |

## Booklets & books — `imposeBooklet` (+ `imposeNUp` for Flip Book)

N-up Book · Booklet · Saddle-Stitch Magazine · Perfect-Bound Book · Zine ·
Event Program · Catalog · Comic / Manga · Notebook · Flip Book.

## Cards & labels — `imposeNUp` (fixed-cell auto-fit)

Business Cards (10-up) · **Trading Cards** (9-up 2.5×3.5") · Stickers ·
Step & Repeat · Calendar · Postcards · Labels (Avery 5160, 30-up) · Bookmarks ·
Hang Tags · Coasters · Letterhead · Compliment Slips · NCR Pads · Envelopes.

## Folding — `imposeNUp` / `imposeBooklet` / `makeDieline`

Trifold Brochure · Folded (Z-fold) Brochure · Greeting Card · Menu ·
Wedding Invitation · **Presentation Folder** (real dieline).

## Large & specialty — `imposeTiledPoster` / `imposeNUp` / `makeDieline`

Tiled Poster · Banner · Feather Flags · Roller Banner ·
**Packaging Dieline** · **Box / Carton** (real straight-tuck carton dielines).

## Tickets & data — `imposeDataMerge` / `imposeTickets`

| Tool | Engine | Notes |
|---|---|---|
| Variable Data Printing | `imposeDataMerge` | CSV → cell per row, numbering, **QR** |
| Coupons | `imposeDataMerge` | CSV codes + QR |
| Name Badges | `imposeDataMerge` | name/company from CSV |
| Raffle Tickets | `imposeTickets` | pure sequential numbering |

## Marks & prepress

| Tool | Engine |
|---|---|
| Bleed & Crop Marks | `generateBleed` |
| Cutter Marks | `addCropMarksOnly` |
| Color Bar & Header | `addColorBar` (+ `addHeaderFooter` via workflow) |
| Page Numbering & Bates | `addPageNumbers` |
| Preflight Inspector | `preflight` (inspection only) |

## Page & PDF tools

Merge · Split · Rotate · Flip / Mirror · Overlay / Watermark · Shuffle · Crop.

## Generators (no source file)

- **Dielines** (`makeDieline`) — Packaging Dieline, Box/Carton (straight-tuck
  carton), Presentation Folder. Enter Width × Height × Depth → a box net with
  solid-red cut lines, dashed-blue creases, tuck/dust flaps and a glue seam.
- **CSV data-merge** (`imposeDataMerge`) — paste/drop a CSV, pick the grid, add
  a running number and/or a scannable QR from any column.

## Calculators (reference, no file)

Saddle-Stitch planner · Perfect-Bind spine width · N-Up fit · Cost/margin
estimator · Bleed & Specs.
