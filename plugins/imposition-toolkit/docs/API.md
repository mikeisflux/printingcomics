# API Reference — `impose.ts`

The engine is a single ES module exporting 35 functions. Every processing
function is `async` and returns a `Uint8Array` of PDF bytes (or an array of
them), except the two download helpers. `pdf-lib` is imported dynamically inside
each function, so importing the module costs nothing until you actually call a
tool.

All dimensions are in **inches** unless a name ends in `Pt` (PDF points, 1 in =
72 pt). PDFs opened with `{ ignoreEncryption: true }`, so most password-free-but-
flagged files still work.

```ts
import {
  getPdfInfo, imposeBooklet, computeNUpGrid, imposeNUp, imposeTickets,
  addCropMarksOnly, mergePdfs, rotatePdf, flipPdf, splitPdf, overlayPdf,
  shufflePages, cropPdf, resizePdf, addPageNumbers, addColorBar, imposeTiledPoster,
  generateBleed, addHeaderFooter, addTextWatermark, addJobSlug, addCollatingMarks,
  preflight, makeDieline, imposeDataMerge,
  addRegistrationMarks, insertPages, mixPdfs, nudgePdf, repairPdf,
  addBackdrop, addQrStamp, addDimensions,
  downloadPdf, downloadMultiple,
} from './impose';
```

---

## Inspection

### `getPdfInfo(bytes): Promise<PdfPageInfo>`

Read basic geometry of a PDF (from its first page).

```ts
interface PdfPageInfo {
  count: number;      // page count
  widthPt: number;    // first-page width in points
  heightPt: number;   // first-page height in points
  widthIn: number;    // width in inches (3-decimal rounded)
  heightIn: number;   // height in inches
}
```

Throws `"PDF has no pages"` for an empty document.

---

## Booklets

### `imposeBooklet(bytes, opts): Promise<Uint8Array>`

2-up saddle-stitch imposition. Pads the page count up to a multiple of 4, then
lays out reader spreads in printing order with optional creep compensation and
crop marks. Output pages are press spreads (`2 × page width + margins` wide),
ordered Side A / Side B for each sheet — print duplex, short-edge (tumble).

```ts
interface BookletOptions {
  rtl: boolean;       // right-to-left binding (manga)
  marginIn: number;   // blank margin around the spread (room for marks)
  gutterIn: number;   // extra gap at the spine (usually 0)
  creepIn: number;    // total outward shift across all sheets (shingling)
  addMarks: boolean;  // draw crop marks at each page corner
  markLenIn: number;  // crop-mark length
  markOffIn: number;  // gap between trim edge and where the mark starts
}
```

Used by: Comic Book, Booklet, Magazine, Perfect-Bound, Zine, Program, Catalog,
Greeting Card, Menu/Bi-fold. See [ARCHITECTURE.md](ARCHITECTURE.md#saddle-stitch)
for the page-ordering formula.

---

## N-Up / grids / cards

### `computeNUpGrid(opts): NUpGrid`

Pure helper (no PDF I/O) that resolves an `NUpOptions` into a concrete grid.
Use it to drive a live preview so the UI and the engine agree exactly.

```ts
interface NUpGrid {
  cols: number; rows: number;
  cellWPt: number; cellHPt: number;   // cell size in points
  leftGapPt: number; topGapPt: number; // offset of the grid block from sheet edge
  gxPt: number; gyPt: number;          // horizontal / vertical gutter in points
}
```

### `imposeNUp(bytes, opts): Promise<Uint8Array>`

Place pages onto press sheets in a grid. Two modes:

- **Grid mode** (default): you specify `cols` × `rows`; each cell is
  `(sheet − margins − gutters) / count`, filled edge-to-edge.
- **Fixed-cell mode** (set `cellWIn` + `cellHIn`): each item is placed at a fixed
  physical size (business cards, trading cards, labels). `cols`/`rows` are
  **auto-computed** to fit the sheet and the block is **centered**.

```ts
interface NUpOptions {
  cols: number;
  rows: number;
  sheetWIn: number;
  sheetHIn: number;
  marginIn: number;
  gutterIn: number;      // horizontal gutter (and vertical, unless gutterYIn set)
  repeatFirst: boolean;  // true = step & repeat (page 1 in every cell)
  addMarks: boolean;
  markLenIn: number;
  markOffIn: number;
  cellWIn?: number;      // fixed-cell mode: item width  (enables auto grid)
  cellHIn?: number;      // fixed-cell mode: item height
  gutterYIn?: number;    // vertical gutter override (e.g. 0 for Avery 5160)
  cutStack?: boolean;    // cut-and-stack page ordering (see below)
}
```

**Page ordering** for cell index `k` (row-major) on sheet `s` of `numSheets`:

| Mode | Source page |
|---|---|
| `repeatFirst` | always page 1 |
| `cutStack` | `k · numSheets + s` |
| sequential (default) | `s · perSheet + k` |

Used by: N-Up Grid, Step & Repeat, Cut & Stack, Contact Sheet, Optimal Fit, and
every Cards & Labels / Folding tool. See
[ARCHITECTURE.md](ARCHITECTURE.md#n-up) for the geometry.

---

## Tickets & data

### `imposeTickets(bytes, opts): Promise<Uint8Array>`

Repeats page 1 of the source across a grid and stamps a **sequential number** on
each copy — raffle tickets, numbered stubs, wristbands.

```ts
interface TicketOptions {
  cols: number; rows: number;
  sheetWIn: number; sheetHIn: number;
  marginIn: number; gutterIn: number;
  startNumber: number;   // first ticket number
  count: number;         // total tickets (spills onto as many sheets as needed)
  prefix: string;        // e.g. "No. "
  pad: number;           // zero-pad width, e.g. 4 → "0001"
  position: 'bottom-right'|'bottom-left'|'top-right'|'top-left'|'bottom-center'|'top-center';
  fontSizePt: number;
  addMarks: boolean; markLenIn: number; markOffIn: number;
}
```

---

## Marks & prepress

### `addCropMarksOnly(bytes, opts): Promise<Uint8Array>`

Adds a blank margin around each page and draws trim marks — without rearranging
pages. `bleedIn` tells it how far inside the page edge the trim line sits.

```ts
interface CropMarksOptions {
  bleedIn: number; marginIn: number; markLenIn: number; markOffIn: number;
}
```

### `addColorBar(bytes, opts): Promise<Uint8Array>`

Appends a CMYK / registration color strip along one edge; grows each page by
`heightIn`.

```ts
addColorBar(bytes, { position: 'bottom' | 'top', heightIn: number })
```

### `addPageNumbers(bytes, opts): Promise<Uint8Array>`

Stamps folio numbers using the built-in Helvetica font.

```ts
interface PageNumberOptions {
  position: 'bottom-center'|'bottom-right'|'bottom-left'|'top-center'|'top-right'|'top-left';
  startAt: number;  // number printed on page 1
  prefix: string; suffix: string;
  fontSizePt: number; marginPt: number;
}
```

---

## Large format

### `imposeTiledPoster(bytes, opts): Promise<Uint8Array>`

Scales page 1 up and slices it across a grid of sheets with glue overlap.

```ts
imposeTiledPoster(bytes, {
  tilesAcross: number; tilesDown: number;
  sheetWIn: number; sheetHIn: number;
  overlapIn: number;                        // shared glue margin between tiles
  addMarks: boolean; markLenIn: number; markOffIn: number;
})
```

---

## Page & PDF utilities

### `mergePdfs(files: Uint8Array[]): Promise<Uint8Array>`
Concatenate several PDFs into one, in array order.

### `rotatePdf(bytes, angleDeg: 90 | 180 | 270): Promise<Uint8Array>`
Rotate every page (adds to any existing rotation).

### `flipPdf(bytes, direction: 'h' | 'v'): Promise<Uint8Array>`
Mirror every page horizontally or vertically (true content mirror, not rotation).

### `splitPdf(bytes, ranges: string): Promise<Uint8Array[]>`
Split into multiple files by 1-based ranges. `ranges` is comma-separated, each
part `"a-b"` or `"n"`, e.g. `"1-3, 4-6, 7"`. Returns one `Uint8Array` per range.

### `shufflePages(bytes, orderStr: string): Promise<Uint8Array>`
Reorder / duplicate / drop pages. `orderStr` is a comma list of 1-based page
numbers, e.g. `"3,1,2,2"` (page 2 duplicated, others dropped if omitted). Throws
if no valid numbers.

### `cropPdf(bytes, { top, right, bottom, left }): Promise<Uint8Array>`
Set each page's CropBox and TrimBox inward by the given inches per edge.

### `overlayPdf(base, stamp, opts): Promise<Uint8Array>`
Stamp `stamp` (page `i % stampPages` for each base page `i`) over `base`.

```ts
interface OverlayOptions {
  opacity: number;                   // 0–1
  mode: 'center' | 'fill' | 'tile';
  tileRows?: number; tileCols?: number; // for mode:'tile' (default 2×2)
}
```

---

## New in 1.1 — pipeline ops, dielines & data-merge

### `generateBleed(bytes, { bleedIn }): Promise<Uint8Array>`
Fabricate a bleed margin by scaling content to overflow the trim; records the
original trim in the TrimBox.

### `addHeaderFooter(bytes, opts): Promise<Uint8Array>`
Running header/footer text bands. `{ header, footer, fontSizePt, marginPt, align: 'left'|'center'|'right' }`.

### `addTextWatermark(bytes, opts): Promise<Uint8Array>`
Diagonal proof/draft stamp. `{ text, opacity, angleDeg, fontSizePt }`.

### `addJobSlug(bytes, opts): Promise<Uint8Array>`
A thin job-info strip along an edge. `{ text, position: 'top'|'bottom', fontSizePt }`.

### `addCollatingMarks(bytes, opts: CollatingOptions): Promise<Uint8Array>`
Per-**signature** spine marks forming a descending staircase so mis-gathered
signatures are obvious. `{ edge, startOffsetPt?, markWpt?, markHpt?, smallMarks?,
pagesPerSig?, sigsPerSet?, stepPt?, color?, color2?, opacity?, pages? }` — one
mark per `pagesPerSig` pages, stepped by `stepPt`; the staircase resets after
`sigsPerSet` signatures and draws the next pass in `color2` (contrasting).

### `preflight(bytes): Promise<PreflightReport>`
Non-destructive inspection → `{ pages, uniformSize, widthIn, heightIn, warnings[] }`.

### `makeDieline(opts): Promise<Uint8Array>`
Generate a real box net — cut (solid) / crease (dashed) / glue lines — from
dimensions. No source PDF.
```ts
interface DielineOptions { kind: 'ste' | 'folder'; widthIn; heightIn; depthIn; glueIn; marginIn; }
```
`'ste'` = straight-tuck-end folding carton; `'folder'` = presentation folder
(panels + fold-up pockets).

### `imposeDataMerge(csvText, opts): Promise<DataMergeResult>`
Parse a CSV (quoted fields OK) and impose one personalized cell per record —
first column bold, optional running number, and an optional **scannable QR** per
row (needs the optional `qrcode-generator` peer). Returns `{ pdf, records, columns }`.
```ts
interface DataMergeOptions {
  cols; rows; sheetWIn; sheetHIn; marginIn; gutterIn; fontSizePt;
  showBorder; autoNumber; startNumber; numberPrefix; numberPad;
  addMarks; markLenIn; markOffIn;
  qrColumn: string;   // header name to encode as QR ('' = none)
  qrSizePt: number;
}
```

---

## Download helpers (browser only)

These touch `Blob`, `URL`, and `document` — call them only in the browser.

### `downloadPdf(bytes, filename): void`
Trigger a browser download of one PDF.

### `downloadMultiple(files, baseName): void`
Download each file as `${baseName}-part${n}.pdf` (used by Split).

---

## v1.2 additions

### `resizePdf(bytes, { mode, scalePct, targetWIn, targetHIn }): Promise<Uint8Array>`
`mode`: `'scale'` (× `scalePct`%), `'fit'` (onto `targetWIn×targetHIn`, aspect
preserved + centred), or `'stretch'` (fill the target exactly).

### `addRegistrationMarks(bytes, { marginIn, sizeIn, style }): Promise<Uint8Array>`
Press registration targets at the four corners + edge midpoints. `style`:
`'target'` (bullseye + crosshair) or `'crosshair'`.

### `insertPages(bytes, { mode, position, everyN, count }): Promise<Uint8Array>`
Insert `count` blank pages (page-1 size). `mode:'at'` → before 1-indexed
`position`; `mode:'everyN'` → after every `everyN` pages.

### `mixPdfs(aBytes, bBytes, reverseB?): Promise<Uint8Array>`
Interleave two documents `A1,B1,A2,B2…`. `reverseB` flips the B stack (backs
scanned in reverse). Great for merging single-sided front/back scans.

### `nudgePdf(bytes, { dxIn, dyIn, rotateDeg }): Promise<Uint8Array>`
Shift every page's content by `dx/dy` and/or rotate it about the page centre.

### `repairPdf(bytes): Promise<Uint8Array>`
Rebuild the document from scratch — drops broken incremental-update cruft and
dead objects, writes a clean xref.

### `addBackdrop(bytes, { r, g, b }): Promise<Uint8Array>`
Paint a solid colour (`0..1` channels) behind every page's content.

### `addQrStamp(bytes, { text, sizePt, position, marginPt }): Promise<Uint8Array>`
Stamp a scannable QR (`position`: `br|bl|tr|tl|center`) on every page. Requires
the optional `qrcode-generator` peer.

### `addDimensions(bytes): Promise<Uint8Array>`
Annotate each page with its trim size (inches + points) on the bottom + left.

## Enhanced options (v1.2)

- **`MarkStyle`** — `drawCropMarks` callers accept `centerMarks?: boolean` and
  `markWeightPt?: number` (booklet, n-up, tickets, crop-marks, poster, data-merge).
- **`NUpOptions`** — `duplex?` + `duplexFlip?: 'long'|'short'` (double-sided,
  mirrored backs) and `bleedIn?` (art fills the cell, marks drawn at the trim).
- **`BookletOptions`** — `signatureSheets?: number` folds the book into N-sheet
  signatures (perfect binding) instead of a single saddle.
- **`shufflePages(bytes, expr)`** — `expr` is now an expression language: ranges
  (`1-5` / `5-1`), rotation suffixes (`>` `<` `^`), and blank tokens (`B`/`X`/`_`).

## v1.2.7 — nesting

### `nestPdf(bytes, opts: NestOptions): Promise<Uint8Array>`
Gang mixed-size die-cut artwork (each source page is one shape) onto a sheet or
continuous roll with the least waste.

```ts
interface NestOptions {
  sheetWIn: number; sheetHIn: number;   // media size (sheet); on a roll only width is fixed
  roll?: boolean;                        // continuous roll → height grows to fit
  paddingIn: number;                     // gap between items
  marginIn: number;                      // sheet edge margin
  allowRotate?: boolean;                 // permit 90° rotation for a tighter pack
  copies?: number;                       // fixed copy count per design…
  fillSheet?: boolean;                   // …or pack as many as fit
  trueShape?: boolean;                   // pack into each other's negative space
  dpi?: number;                          // true-shape raster resolution (default 36)
}
```

Default packing is a **skyline bottom-left** bin-pack over each item's bounding
box (fast, rectangular). With `trueShape: true` the engine rasterises each
artwork's alpha outline (via `pdfjs-dist`, an optional peer) into an occupancy
grid and nests items into each other's concave negative space — best for
irregular contours. If a rasteriser isn't available (e.g. a non-DOM host), it
transparently falls back to the skyline pack.

### `addOmrMarks(bytes, opts: OmrOptions): Promise<Uint8Array>`
Add optical machine-readable (OMR) bars along a sheet edge for automated
bindery equipment (fold / collate / cut / stack).

```ts
interface OmrOptions {
  edge: 'top' | 'bottom' | 'left' | 'right';
  encoding: 'binary' | 'barheight';   // present/absent, or long/short bars
  program: number;                      // 0 … 2^bitCount − 1 (MSB first)
  bitCount: number;                     // 4 | 8 | 12 | 16
  repeats?: number;                     // repeat the pattern down the track
  widthPt?: number;                     // readable bar length ⟂ to feed (5 mm)
  heightPt?: number;                    // thin dimension along feed (1 mm)
  spacingPt?: number;                   // pitch between bars
  startOffsetPt?: number;               // offset along the track
  edgeOffsetPt?: number;                // inward offset from the paper edge
  sync?: boolean;                       // leading always-on sync/clock bar
  color?: { r: number; g: number; b: number };
  opacity?: number; pages?: string;
}
```

Marks must be solid black at 100% density and the edge must match the
machine's sensor position — patterns are manufacturer-specific, so confirm the
spec with your finishing vendor.

### `addGatheringMarks(bytes, opts: GatheringOptions): Promise<Uint8Array>`
The gripper-edge cousin of collating marks. `{ edge:'top'|'bottom',
startOffsetPt?, edgeOffsetPt?, markWpt?, markHpt?, pagesPerSection?,
sectionsPerSet?, stepPt?, color?, color2?, opacity?, pages? }` — one mark per
`pagesPerSection` pages, stepped **horizontally** along the leading edge (kept
`edgeOffsetPt` clear of the gripper zone); the staircase resets after
`sectionsPerSet` sections and switches to `color2`.

### `addFoldMarks(bytes, opts: FoldMarksOptions): Promise<Uint8Array>`
Dashed fold-tick guides in the trim margin at each fold.

```ts
interface FoldMarksOptions {
  scheme: 'half' | 'letter' | 'zfold' | 'gate' | 'doubleparallel'
        | 'roll' | 'accordion' | 'custom';
  orientation: 'vertical' | 'horizontal';   // vertical folds divide the width
  panels?: number;            // accordion / roll panel count
  positions?: string;         // custom: "33,66" (%) · "0.33,0.66" · "1/3,2/3"
  edge: 'top' | 'bottom' | 'both';           // which end(s) of the fold line
  markLenPt?: number; offsetPt?: number; weightPt?: number;
  style: 'dashed' | 'solid' | 'dotted';
  fullLine?: boolean;         // guide line across the whole sheet
  color?: { r: number; g: number; b: number }; pages?: string;
}
```

Roll fold shrinks each panel by a 1/16″ tuck allowance so it nests inside the
previous; every other scheme uses exact fold fractions.

### `addLayMarks(bytes, opts: LayMarksOptions): Promise<Uint8Array>`
Press-sheet alignment guides. `{ markType:'arrow'|'line'|'cross',
edges:'gripper'|'sideguide'|'both', gripperEdge?:'top'|'bottom',
sideGuideSide:'left'|'right', sizePt?, thicknessPt?, offsetPt?, color?, pages? }`
— front lay marks the gripper (leading) edge feed direction; side lay marks the
guide side for lateral registration. Best applied to the **imposed press
sheet** (where the gripper margin already exists).

### `addCutContour(bytes, opts: CutContourOptions): Promise<Uint8Array>`
Adds a die-line path on a real `/Separation` **spot-colour** channel (with a
DeviceRGB alternate for preview) that a RIP or digital cutter reads as a
toolpath. `{ shape:'rectangle'|'rounded'|'ellipse', target:'trim'|'bleed'|
'media'|'custom', customWpt?, customHpt?, spotName, thicknessPt?, dashed?,
dashLenPt?, dashGapPt?, cornerRadiusPt?, xOffsetPt?, yOffsetPt?, previewColor?,
pages? }`. Common `spotName`s: `CutContour`, `KissCut`, `Crease`, `Perf`,
`ThruCut`, `DieCut`.

### `addWhiteVarnish(bytes, opts: WhiteVarnishOptions): Promise<Uint8Array>`
Lays a named Separation spot fill — white ink or spot varnish. `{ spotName,
coverage:'flood'|'trim'|'bleed'|'custom', customWpt?, customHpt?, tint?, under?,
xOffsetPt?, yOffsetPt?, previewColor?, pages? }`. `under:true` prints the fill
**behind** the artwork (white under-base); `under:false` overprints it on top
(varnish / gloss).

### `addBraille(bytes, opts: BrailleOptions): Promise<Uint8Array>`
Adds Grade-1 (uncontracted) Braille as raised dots at ADA metrics. `{ text,
xPt?, yPt?, dotDiaPt?, dotPitchPt?, cellSpacePt?, lineSpacePt?, spotName?,
tint?, previewColor?, pages? }`. Digits get an automatic number sign; set
`spotName` to place the dots on an emboss / varnish spot channel, or leave it
off to draw visible ink.

### `addBarcodeStamp(bytes, opts: BarcodeStampOptions): Promise<Uint8Array>`
Stamp a barcode on every page (or a range). `{ text, symbology:'qr'|'code128'|
'datamatrix'|'ean13', scale?, quietZone?, barHeightMm?, position (9-point:
tl…br), marginPt?, xOffsetPt?, yOffsetPt?, rotationDeg?:0|90|180|270,
barColor?, bgColor?, transparent?, showText?, pages? }`. **DataMatrix** is a
real ECC200 encode (`encodeDataMatrix` — GF(256)/0x12d Reed-Solomon with first
consecutive root α¹, ISO 16022 Annex F placement, sizes 10–26). QR needs the
optional `qrcode-generator` peer.

### `addBackdropFile(baseBytes, backdropBytes, opts: BackdropFileOptions): Promise<Uint8Array>`
Composite an uploaded PDF or image **behind** the page content (the opposite of
overlay). `{ offsetXPt?, offsetYPt?, scalePct?, opacity? (0–1), repeat?, pages? }`.
`repeat:false` places the backdrop on page 1 only. `backdropBytes` may be a PDF
(page 1 used), PNG or JPEG.

`addTextWatermark` also accepts `color?` and `pages?` for coloured, ranged
watermarks.

### `repairPdf(bytes, opts?: RepairOptions): Promise<Uint8Array>`
Rebuild the PDF from scratch. `{ stripMetadata?, removeAnnotations?,
removeJavaScript?, pages? }` — the rebuild alone already drops dead objects,
document-level JavaScript and source metadata; the flags additionally clear the
Info/XMP, page `/Annots` and page `/AA` actions.

### `applyColorEffects(bytes, opts: ColorEffectsOptions): Promise<Uint8Array>` *(browser)*
Rasterise targeted pages and apply a CSS-filter stack. `{ brightness?,
contrast?, saturation? (all 0–200, 100 = unchanged), grayscale?, warmTone?,
invert? (0–100), hueRotate? (0–360), dpi?, pages? }`. Needs a canvas + the
optional `pdfjs-dist` peer. `colorEffectsFilter(opts)` is the pure,
unit-testable filter-string builder.

### `assignOutputIntent(baseBytes, iccBytes, conditionName): Promise<Uint8Array>`
Embed a destination ICC profile as a PDF/X `/OutputIntent` (lossless — no
rasterisation, vectors intact). `/N` is read from the ICC header's colour-space
signature.

### `applyColorManagement(bytes, opts: ColorManageOptions): Promise<Uint8Array>` *(browser)*
Rasterise and map RGB → CMYK → RGB through an 8-primary Neugebauer ink model
(a genuinely smaller-than-sRGB gamut), with rendering intents and an optional
out-of-gamut warning overlay. `{ intent, dpi?, convert?, gamutWarning?,
warningColor?, pages? }`. Pure helpers `rgbToCmyk` / `cmykToRgb` /
`isOutOfCmykGamut` are unit-testable. *Not a device-exact ICC transform* — for
that, pair a full CMM; use `assignOutputIntent` to embed the profile.

### `editPdf(bytes, ops: EditOp[]): Promise<Uint8Array>`
Apply page-level edits. Each `EditOp` is one of: `{type:'text', page, xPt, yPt,
text, sizePt?, color?, font?}`, `{type:'redact', page, xPt, yPt, wPt, hPt}`
(opaque black box), `{type:'box', …, fill?}`, `{type:'line', page, x1,y1,x2,y2,
thicknessPt?}`, `{type:'rotate', page, angleDeg}`, or `{type:'delete', pages}`.
Draw/rotate ops run before deletes so page numbers stay stable; coordinates are
points from the bottom-left.

### `exportJdf(opts: JdfOptions): Uint8Array`
Generate a CIP4 **JDF 1.4** Product-intent job ticket (XML, returned as bytes).
`{ jobName, jobId?, productType?, quantity, widthPt, heightPt, pages?, sides?,
mediaWidthPt?, mediaHeightPt?, mediaType?, binding? }`. Download it with
`downloadFile(bytes, 'job.jdf', 'application/vnd.cip4-jdf+xml')`.

### `downloadFile(bytes, filename, mime?)` *(browser)*
Generic Blob download (any MIME). `downloadPdf` delegates to it.

## Error handling

Functions throw on invalid input (empty PDF, no valid ranges, unreadable file).
Wrap calls in `try/catch` and surface `err.message`. Encrypted-but-openable PDFs
are tolerated; truly password-protected ones will throw on load.
