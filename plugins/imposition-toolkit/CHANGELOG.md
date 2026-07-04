# Changelog

## 1.2.13

- **Production Recipes** — the Workflows tab now ships **69 named, step-by-step
  workflows** across 9 categories (Booklets & Books, Cards & Flat, Labels &
  Stickers, Packaging, Large Format, Production Marks, Calendars & Specialty,
  Ganging & Optimization, Transform & Prep), each with an ordered step list,
  input note, prepress tip and tags. "Make this" loads the chain into the
  pipeline builder.
- New engine tools wired: **Layers** (OCG show/hide), **Custom Impose** (Expert
  Grid per-cell placement), **PDF Tools** (optimize / decrypt / repair), deep
  **Preflight** report + cleanup, and the **Gang Sheet** production plan.
- New engine functions: `readLayers` / `setLayers`, `imposeCustomGrid`,
  `optimizePdf` / `decryptPdf`, `preflightClean`, `computeGangPlan`, and an
  expanded `preflight` report.

## 1.2.12

- **Color Effects** — rasterise targeted pages (pdf.js) and apply a CSS-filter
  stack: brightness / contrast / saturation + grayscale / warm (sepia) / invert
  / hue-rotate, at 150/300/600 DPI, page range. Browser-only.
- **Color Management** — (1) embed an uploaded ICC profile as a PDF/X
  `/OutputIntent` (`assignOutputIntent`; lossless, vectors intact, `/N` read
  from the ICC header), and (2) convert pages to the CMYK-reproducible gamut via
  an 8-primary Neugebauer ink model (`applyColorManagement`) with rendering
  intents and an out-of-gamut warning overlay. A device-exact ICC transform
  still needs a full CMM; the pixel path is a standard CMYK model.
- **PDF Repair** gains strip-metadata / remove-annotations / remove-JavaScript /
  page-range options.
- New `applyColorEffects`, `applyColorManagement`, `assignOutputIntent` engine
  functions; `repairPdf` takes an options object.

## 1.2.11

- **DataMatrix (ECC200)** barcode encoder — GF(256) with 0x12d, Reed-Solomon
  (first consecutive root α¹), ASCII encodation, ISO 16022 Annex F module
  placement, square sizes 10×10…26×26. Verified by RS-syndrome vanishing.
- **Barcode / QR** is now a full stamp tool (`addBarcodeStamp`): QR / Code 128 /
  DataMatrix / EAN-13 with scale, quiet zone, bar height, 9-point position,
  X/Y offset, 0/90/180/270 rotation, bar + background colour, transparent
  background and human-readable text. (Replaces the QR-only stamp.)
- **Backdrop** is now file-based (`addBackdropFile`): composites an uploaded PDF
  or image behind the page content, with scale / offset / opacity / repeat /
  range. The old solid-colour fill remains as **Background Fill**.
- **Watermark** gains a colour picker, one-click presets and a page range.

## 1.2.10

- Real **Separation (spot-colour)** support, and three tools built on it:
  - **Die Lines / Cut Contour** — a die-line path (rectangle / rounded /
    ellipse) around the trim / bleed / media / custom box on a named spot
    channel (CutContour, KissCut, Crease, Perf, ThruCut, DieCut) that RIPs and
    digital cutters read as a toolpath. Thickness, dashed (len/gap), corner
    radius, X/Y offset, preview colour, page range.
  - **White / Varnish** — a named spot fill laid as a white under-base (behind
    the artwork) or a spot varnish / gloss (on top), with flood / trim / bleed
    / custom coverage and tint.
  - **Braille** — Grade-1 (uncontracted) dots at ADA metrics with an automatic
    number sign for digits, optionally on an emboss / varnish spot channel.
  - New `addCutContour`, `addWhiteVarnish`, `addBraille` engine functions.
- **Dimensions** now also labels the bleed size when it differs from the trim.

## 1.2.9

- Three new finishing / prepress mark tools:
  - **Folding Marks** — dashed fold-tick guides in the trim margin for half /
    letter / Z / gate / double-parallel / roll / accordion / custom schemes,
    vertical or horizontal fold axis, dashed/solid/dotted, length / weight /
    offset, optional full guide line. Roll fold shrinks each panel by a tuck
    allowance so it nests inside the previous.
  - **Gathering Marks** — the gripper-edge cousin of collating marks: one mark
    per section, stepped horizontally along the leading edge (clear of the
    gripper zone), with a sections-per-set reset + contrasting wrap colour.
  - **Lay Marks** — press-sheet alignment: front lay (gripper edge) + side lay
    (guide side) as arrow / line / crosshair glyphs, with size, thickness and
    corner offset.
  - New `addFoldMarks`, `addGatheringMarks`, `addLayMarks` engine functions.

## 1.2.8

- **Collating Marks** rewritten to model real signature gathering: one mark per
  *signature* (page ÷ pages-per-signature), stepped down the spine; the
  staircase resets after *signatures-per-set* and switches to a contrasting
  wrap colour so the two passes stay distinct. Adds start offset, mark W/H,
  half-height marks, opacity and page range.
- New **OMR Marks** tool: a row of black bars along a chosen sheet edge that
  automated bindery equipment reads to trigger fold / collate / cut / stack.
  Encodes a program number (0…2^bits-1, MSB first) as present/absent (binary)
  or long/short (bar-height) bars, with a leading sync bar, 4/8/12/16-bit
  widths, repeats, configurable bar length/width/pitch and start + edge
  offsets. New `addOmrMarks` engine function.

## 1.2.7

- New **Nesting / Stickers** tool: packs mixed-size die-cut artwork onto a
  sheet or continuous roll with the least waste. Skyline bottom-left
  bin-packing (fast rectangular) plus an optional **true-shape** mode that
  rasterises each artwork's alpha outline (pdf.js occupancy grid) and drops
  items into each other's negative space. 90° auto-rotate, fill-sheet or
  fixed copy count. New `nestPdf` engine function; true-shape falls back to
  skyline when a rasteriser isn't available (e.g. non-DOM hosts).

## 1.2.6

- New **Distortion Comp.** tool (flexo/gravure cylinder pre-shrink) and an
  Overlay **Multiply** blend mode.

## 1.2.5

- Closed the documented option gaps: page-range on Flip/Rotate/Crop/Resize;
  Rotate custom angle; Split chunk mode + .zip; Grid S-pattern + RTL; BleedMaker
  solid/mirror; Header/Footer/Slug variable tokens; Overlay 9-point anchor;
  Cutter-mark cut-type/knockout/overshoot/key; Code 128 + EAN-13 barcodes.

## 1.2.4

- **N-up Book** now does real signature imposition: 2-up folio (saddle/perfect)
  and 4-up quarto (8-page signature, 2×2 per side, top row rotated 180° — the
  canonical scheme, verified). New `imposeNUpBook` engine function.
- Templates now tie to their correct tools (Folding templates open Trifold/Folded
  Brochure; Variable-Data templates open a data-merge tool).

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
