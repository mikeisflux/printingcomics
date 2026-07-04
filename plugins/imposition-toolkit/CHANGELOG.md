# Changelog

## 1.2.3

- **Shuffle** now implements the full expression language: `all`, `odd`, `even`,
  `first`, `last`, `reverse`/`last-1`, `N*(...)` repeats, `[a,b]` interleave, and
  `group N:` per-group reorder (plus the existing ranges/rotation/blanks).

## 1.2.2

- **Persistent tool rail + full-width layout** — the studio is now a three-column
  desktop workspace: a searchable left tool rail (Layout/Transform/Enhance/
  Advanced) that switches tools without losing the loaded file, the options
  sidebar, and the live preview canvas.

## 1.2.1

- **Studio workspace** — the React UI's tool view is now a two-zone pdfpress-style
  workspace: an options sidebar plus a live SVG imposition **preview canvas**
  (white sheet, colour-numbered cells, crop/center marks), a toolbar with an
  in/mm/pt unit selector, √2 zoom, sheet navigation, and Print + Download.


## 1.2.0

Feature-parity pass against the full pdfpress tool guide + template library.

**Engine — 9 new functions (35 total)**
- `resizePdf` — scale by % / fit-to-paper / stretch
- `addRegistrationMarks` — press registration targets (bullseye / crosshair)
- `insertPages` — insert blank pages before a page or after every N
- `mixPdfs` — interleave two PDFs (A1,B1,A2,B2…), optional reversed back stack
- `nudgePdf` — shift/rotate page content about its centre (mis-registration fudge)
- `repairPdf` — rebuild the document, dropping broken xref / dead objects
- `addBackdrop` — paint a solid colour behind every page
- `addQrStamp` — stamp a scannable QR (URL/vCard/code) on every page
- `addDimensions` — annotate each page with its trim size (in + pt)

**Engine — enhancements**
- `imposeNUp`: **double-sided (duplex)** output with mirrored backs (long/short
  edge) and **bleed-aware marks** (art fills the cell, marks drawn at the trim).
- `imposeBooklet`: **perfect-binding signatures** (`signatureSheets`) alongside
  the single saddle.
- Configurable **printer's marks** everywhere — center marks + stroke weight
  (`MarkStyle`) threaded through booklet / n-up / tickets / crop-marks / poster /
  data-merge.
- `shufflePages`: **expression language** — ranges (`1-5`/`5-1`), rotation
  suffixes (`>` `<` `^`) and blank tokens (`B`/`X`/`_`).

**UI (`Impose.tsx`)**
- **73 tools** across 8 categories (adds Resize, Insert Pages, Mix/Interleave,
  Nudge, PDF Repair, Registration Marks, Watermark, Header/Footer, Slugline,
  Collating Marks, QR/Barcode, Backdrop, Dimensions).
- New **Templates gallery — 156 ready-made, industry-grouped presets** (Commercial
  Print, Packaging, Publishing, Large Format, Office, Variable Data, Real Estate).
  Each template opens its tool with a complete working preset (sheet, item size,
  exact n-up, cut-and-stack, duplex, bleed, RTL/manga, signatures).

## 1.1.0

Major expansion to match a full pdfpress-style gallery.

**Engine — 8 new functions (26 total)**
- `generateBleed` — fabricate bleed by overflowing the trim (records TrimBox)
- `addHeaderFooter` — running header/footer text bands
- `addTextWatermark` — diagonal proof/draft stamp
- `addJobSlug` — job-info strip along an edge
- `addCollatingMarks` — stepped spine staircase for signature gathering
- `preflight` — non-destructive size/uniformity report
- `makeDieline` — real box-net generator (straight-tuck carton + presentation
  folder): cut (solid) / crease (dashed) / glue lines from W×H×D
- `imposeDataMerge` — CSV → one imposed cell per record, optional running
  number and a **scannable QR** per row (via `qrcode-generator`)

**UI (`Impose.tsx`)**
- Rebuilt as a single-page gallery: hero, "how to make this" strip, filter
  chips, and stacked sections — **60 tools across 8 categories + 6 chained
  workflows + a custom-pipeline builder**.
- Every card in the "READY TO USE / HOW TO MAKE THIS" format.
- **Dark theme by default** (light/dark toggle) via CSS custom properties.
- Richer white "paper-sheet" thumbnails.
- New tool workspaces: dieline generator (no source file) and CSV data-merge.

**Dependencies**
- `qrcode-generator` added as an **optional** peer (only loaded when a
  data-merge uses QR).

## 1.0.0

Initial extraction from the Printing Comics storefront as a standalone,
reusable package.

**Engine (`impose.ts`) — 18 functions**
- Inspection: `getPdfInfo`
- Imposition: `imposeBooklet`, `imposeNUp` (+ `computeNUpGrid`), `imposeTickets`,
  `imposeTiledPoster`
- Marks: `addCropMarksOnly`, `addColorBar`, `addPageNumbers`
- Page tools: `mergePdfs`, `splitPdf`, `rotatePdf`, `flipPdf`, `shufflePages`,
  `cropPdf`, `overlayPdf`
- Helpers: `downloadPdf`, `downloadMultiple`

**Fixed-cell N-Up** with auto-computed, centered grids for cards/labels;
**cut-and-stack** page ordering; **asymmetric gutters** (`gutterYIn`) for die-cut
label sheets; exact-fit floating-point guard so trading cards land 9-up and
Avery 5160 labels land 30-up.

**React UI (`Impose.tsx`)** — searchable 38-tool gallery in 7 categories, live
booklet press-order and n-up previews, per-tool settings, and 5 pre-press
calculators.

**Distribution**
- Pre-compiled browser ESM build `dist/impose.mjs` + type declarations
  `dist/impose.d.ts` for bundler-free use.
- Standalone `impose.css` with a brand-neutral, overridable palette.
- Docs: API reference, tool catalog, integration guide, architecture notes.
- Runnable `examples/vanilla.html` (no build step) and `examples/react-usage.tsx`.
