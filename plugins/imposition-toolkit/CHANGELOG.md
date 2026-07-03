# Changelog

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
