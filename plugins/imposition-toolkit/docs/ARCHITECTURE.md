# Architecture & Algorithms

How the engine turns a source PDF into press-ready sheets. This is the reference
for anyone extending or auditing the imposition math.

## Design principles

1. **Client-side only.** Every function reads bytes, manipulates them with
   `pdf-lib` in memory, and returns bytes. No network, no filesystem (except the
   optional Node use of the raw functions).
2. **Lazy dependency.** `pdf-lib` is loaded via dynamic `import('pdf-lib')`
   *inside* each function, so importing the module is free until a tool runs.
3. **Embed, don't copy.** Imposition tools build a fresh output document and
   `embedPages()` the source pages as reusable XObjects, then `drawPage()` them at
   computed positions/sizes. Page-level tools (merge, split, rotate, shuffle,
   crop) use `copyPages()` / page mutation instead.

## Coordinate system

PDF user space has its **origin at the bottom-left**, Y increasing upward, in
**points** (1 inch = 72 pt; the constant `PT = 72`). All public options are in
inches and multiplied by `PT` internally. This bottom-left origin is why row
placement subtracts from the sheet height:

```
y = sheetHeight − topGap − cellHeight − row · (cellHeight + gutterY)
```

## <a name="saddle-stitch"></a>Saddle-stitch booklets (`imposeBooklet`)

Pages are padded up to a multiple of 4 (`paddedN = ceil(N/4)·4`), giving
`numSheets = paddedN/4`. Each physical sheet carries two spreads (Side A front,
Side B back). For sheet `s` (0-based), LTR:

```
Side A:  [ paddedN − 2s | 2s + 1 ]
Side B:  [ 2s + 2 | paddedN − 2s − 1 ]
```

RTL (manga) swaps left/right. Missing pages (padding beyond `N`) are simply not
drawn, leaving blanks.

**Creep / shingling.** Folded signatures push inner pages outward. Each sheet's
content shifts by

```
creepPt = (s / (numSheets − 1)) · creepIn · PT
```

— the outermost sheet 0, the innermost by the full `creepIn`. The left page
moves left, the right page right, so trim stays aligned after folding.

Output spread size: `width = 2·pageW + 2·margin + gutter`,
`height = pageH + 2·margin`. Print duplex, **short-edge flip (tumble)**.

## <a name="n-up"></a>N-Up grids & cards (`imposeNUp`, `computeNUpGrid`)

`computeNUpGrid()` resolves the layout; `imposeNUp()` renders it. Two modes:

**Grid mode** — you give `cols × rows`; the cell is derived by dividing the
usable sheet:

```
cellW = (sheetW − 2·margin − gutterX·(cols−1)) / cols
cellH = (sheetH − 2·margin − gutterY·(rows−1)) / rows
gridOrigin = margin (from each edge)
```

**Fixed-cell mode** — you give `cellWIn × cellHIn` (cards, labels); `cols`/`rows`
are computed to fit and the block is **centered**:

```
cols = ⌊ (sheetW − 2·margin + gutterX) / (cellW + gutterX) ⌋
rows = ⌊ (sheetH − 2·margin + gutterY) / (cellH + gutterY) ⌋
leftGap = (sheetW − blockW) / 2
topGap  = (sheetH − blockH) / 2
```

A `+1e-6` epsilon is added before the floor so an *exact* fit (e.g. three 3.5″
cards in 11.0″) isn't lost to floating-point error — this is what makes 9-up
trading cards and 30-up labels land on the intended count. `gutterYIn` lets the
vertical gap differ from the horizontal one (Avery 5160 uses a horizontal gutter
with **zero** vertical gap).

**Page ordering** for cell index `k = row·cols + col` on sheet `s`:

| Mode | Formula | Use |
|---|---|---|
| `repeatFirst` | `0` | Step & repeat — one design everywhere |
| `cutStack` | `k · numSheets + s` | Cut piles by position, stack → sequential |
| sequential | `s · perSheet + k` | Normal reading-order fill |

Cut-and-stack is the non-obvious one: after printing, you guillotine the whole
stack into `perSheet` piles, then set pile 0 on pile 1 on … — because page
`k·numSheets + s` sits at position `k` on sheet `s`, the combined stack falls into
`1, 2, 3, …` order with far less collation than sequential.

## Numbered tickets (`imposeTickets`)

A grid-mode N-Up that always draws page 1, plus a Helvetica number stamped per
cell. It walks `count` tickets across `ceil(count / perSheet)` sheets; each
ticket's label is `prefix + String(startNumber + i).padStart(pad, '0')`,
positioned by the `position` option with a 4 pt inset.

## Tiled posters (`imposeTiledPoster`)

Page 1 is scaled so the whole image, minus overlap, fills the tile grid:

```
tileContentW = (contentW + (tilesAcross−1)·overlap) / tilesAcross
scale        = min(sheetW / tileContentW, sheetH / tileContentH)
```

Each tile draws the *entire* scaled page at a negative offset
(`x = −col·stepW`, `y = −(tilesDown−1−row)·stepH`); the PDF media box clips it to
the sheet, so each sheet shows only its slice. Overlap gives glue margin.

## Crop marks

`drawCropMarks()` emits 8 short line segments — two per corner (one horizontal,
one vertical) — offset `markOff` outside the trim box and `markLen` long, drawn
with `drawLine()` in registration black. N-Up and booklet tools mark every cell;
`addCropMarksOnly` grows the page by a margin and marks the trim inset by
`bleedIn`.

## Flip / mirror (`flipPdf`)

True content mirroring uses a transformation matrix pushed before drawing the
embedded page:

```
horizontal: concatTransformationMatrix(−1, 0, 0,  1, width, 0)
vertical:   concatTransformationMatrix( 1, 0, 0, −1, 0, height)
```

wrapped in `pushGraphicsState()` / `popGraphicsState()`. This mirrors the actual
marks (needed for iron-on transfers, window clings), unlike `rotatePdf` which
only changes the page's `/Rotate`.

## Color bar (`addColorBar`)

Each page grows by `heightIn`; the original is drawn offset by the bar height,
and a strip of swatches (CMYK primaries, RGB, and 25/50/75% grays as RGB
approximations of CMYK densities) is tiled along the chosen edge with
`drawRectangle()`.

## Page-level tools

`mergePdfs`, `splitPdf`, and `shufflePages` use `copyPages()` between documents.
`rotatePdf` adds to each page's rotation. `cropPdf` sets `CropBox` + `TrimBox`
inward per edge (non-destructive — the content stays, the visible box shrinks).
`addPageNumbers` embeds Helvetica and stamps text per page.

## Extending it

To add a tool: add an engine function to `impose.ts` (follow the embed → compute
→ draw pattern), export it, then add a `ToolDef` entry to the `TOOLS` array in
`Impose.tsx` with an `engine` tag and preset, plus a settings panel + a `case` in
`ToolWorkspace.process()`. Keep the client-side, no-network invariant. If you add
a card/label preset, verify the auto-fit count with a quick harness like the one
described in the toolkit's test notes — off-by-one row/column errors from
margins are the most common bug.
