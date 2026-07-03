# Tool Catalog

All 38 tools in `<AdminImpose />`, grouped as they appear in the gallery. Each
maps to an engine function from [API.md](API.md) with a preset. Presets are just
starting points — every value is editable in the UI. Auto-fit layouts recompute
`cols × rows` from the sheet + item size, so the counts below assume the default
sheet.

Legend: **Sheet** = press-sheet preset · **Item** = fixed cell size (auto-fit) ·
**Layout** = resulting up-count · **Input** = what to drop in.

## Booklets & Books — `imposeBooklet`

2-up saddle-stitch. Drop the reader's-order pages; the tool pads to a multiple of
4 and prints spreads for duplex short-edge (tumble) printing.

| Tool | Preset (margin / creep) | Input |
|---|---|---|
| Comic Book | 0.5″ / 0.125″ | Interior pages, US comic 6.625×10.25″ |
| Booklet | 0.5″ / 0.125″ | Any single-page-size PDF |
| Saddle-Stitch Magazine | 0.6″ / 0.09″ | Magazine interior |
| Perfect-Bound Book | 0.5″ / 0 | Folios; stack signatures, glue spine |
| Zine | 0.35″ / 0.06″ | 8–16 page mini-comic |
| Event Program | 0.5″ / — | Folded program pages |
| Catalog | 0.5″ / 0.15″ | Thicker product catalog |
| Greeting Card | 0.25″ / 0 | 4-page half-fold card |

## Imposition & Layout

| Tool | Engine | Sheet | Layout | Notes |
|---|---|---|---|---|
| N-Up Grid | `imposeNUp` | 11×17″ | 2×2, sequential | Any rows × cols |
| Step & Repeat | `imposeNUp` | 11×17″ | 3×3, page 1 repeated | Covers, stickers |
| Cut & Stack | `imposeNUp` | 11×17″ | 2×2, cut-&-stack order | Fast collation |
| Index / Contact Sheet | `imposeNUp` | 8.5×11″ | 4×5, no marks | Thumbnail proof |
| Optimal Fit | `imposeNUp` | 13×19″ | auto, native size | Cell = your page size |
| Tiled Poster | `imposeTiledPoster` | 8.5×11″ | 2×2 tiles, 0.5″ overlap | Enlarge one page |

## Cards & Labels — `imposeNUp` (fixed-cell auto-fit)

| Tool | Item | Sheet | Layout | Notes |
|---|---|---|---|---|
| Business Cards | 3.5×2″ | 8.5×11″ | 10-up (2×5) | Standard US card |
| **Trading Cards** ★ | 2.5×3.5″ | 8.5×11″ | 9-up (3×3) | Switch to 12×18″ for full-bleed art |
| Postcards | 6×4″ | 13×19″ | 8-up | Mailer |
| Labels (Avery 5160) | 2.625×1″ | 8.5×11″ | 30-up (3×10), no marks, row-gap 0 | Matches the 5160 die |
| Bookmarks | 2×6″ | 8.5×11″ | 3-up | Tall |
| Hang Tags | 2×3.5″ | 8.5×11″ | 6-up | Retail tags |
| Photo Prints | 6×4″ | 8.5×11″ | 2-up | Set any size |
| Flyers | 5.5×8.5″ | 12×18″ | 4-up | Half-page |
| Name Badges | 3.375×2.33″ | 8.5×11″ | 8-up, row-gap 0.1″ | Clip-holder inserts |
| Envelopes | 9.5×4.125″ | 11×17″ | 3-up | #10 |

> **Card input:** design each card at its final trim size. For full-bleed art add
> ⅛″ bleed and use a sheet large enough for the bleed to have room. Drop a
> multi-page PDF (one card per page) for a mixed sheet, or choose **"Same design
> repeated"** in the tool's settings.

## Folding

| Tool | Engine | Sheet | Layout | Input |
|---|---|---|---|---|
| Trifold Brochure | `imposeNUp` | 11×8.5″ | 3×1, gutter 0 | 6 panels in panel order |
| Wedding Invitation | `imposeNUp` | 8.5×11″ | 2×2, gutter 0 | 4 panels, quarter-fold |
| Menu / Bi-fold | `imposeBooklet` | auto | 4-page fold | Front / inside×2 / back |

> Folding tools place panels in the order supplied and show an on-screen panel
> guide — they do not guess a fold convention. Supply pages already in
> imposition (panel) order, or use N-Up for full control.

## Tickets & Data

| Tool | Engine | Preset | Input |
|---|---|---|---|
| Numbered Tickets | `imposeTickets` | 2×5 on 8.5×11″, count 100, `No. 0001` | One ticket design (page 1) |

## Marks & Prepress

| Tool | Engine | Purpose |
|---|---|---|
| Crop Marks | `addCropMarksOnly` | Add trim marks + bleed offset, no reorder |
| Color Bar | `addColorBar` | Append CMYK/registration density strip |
| Page Numbering | `addPageNumbers` | Stamp folios with prefix/suffix, any corner |

## Page & PDF Tools

| Tool | Engine | Purpose |
|---|---|---|
| Merge PDFs | `mergePdfs` | Combine multiple files (multi-file UI) |
| Split PDF | `splitPdf` | Break into files by ranges (multi-output) |
| Rotate | `rotatePdf` | 90 / 180 / 270° |
| Flip / Mirror | `flipPdf` | Horizontal / vertical mirror |
| Overlay / Watermark | `overlayPdf` | Stamp a second PDF (center/fill/tile, opacity) |
| Shuffle Pages | `shufflePages` | Reorder / duplicate / drop |
| Crop | `cropPdf` | Trim margins via crop box |

## Calculators (reference, no file needed)

Saddle-Stitch planner · Perfect-Bind spine width · N-Up fit · Cost/margin
estimator · Bleed & Specs. These are informational and self-contained in the
component; the cost model uses placeholder click/paper rates you can edit in
`Impose.tsx` (`PAPER_STOCKS`, `CLICK_RATE`).
