# Imposition Toolkit

A self-contained, **100% client-side** PDF imposition & pre-press toolkit — **90
print-production tools + 156 ready-made industry templates + 69 production-recipe
workflows** (in 9 categories) plus 5 planning calculators, extracted from the
Printing Comics storefront so it can be dropped into any other website.

Everything runs in the browser using [`pdf-lib`](https://pdflib.js.org). **Files
never leave the user's machine** — nothing is uploaded, there is no server
component, and there are no network calls during processing.

- **`src/impose.ts`** — the framework-agnostic engine (**74 functions**). No
  React, no app dependencies. This is the reusable core.
- **`src/Impose.tsx`** — a complete React 19 UI (`<AdminImpose />`): a single-page
  gallery with a hero, a "how to make this" strip, filter chips, and stacked
  sections; per-tool settings, live previews, chained-workflow pipelines, and a
  **dark theme** (light/dark toggle).
- **`dist/impose.mjs`** — a pre-compiled browser ESM build of the engine for
  plain-JavaScript sites (no bundler/TypeScript required).

---

## What's inside

| Category | Tools |
|---|---|
| **Chained workflows** | Newsletter+numbers · Branded client proof · Business cards with bleed · Magazine production · Perfect-bound with color bar · Gang run — plus a custom pipeline builder |
| **Imposition & layout** | Standard Sizes · Cut & Stack · Expert Grid · Optimal Fit · Gang Sheet · Index Print · Photo Prints · Flyers |
| **Booklets & books** | N-up Book · Booklet · Saddle-Stitch Magazine · Perfect-Bound Book · Zine · Event Program · Catalog · Comic/Manga · Notebook · Flip Book |
| **Cards & labels** | Business Cards · **Trading Cards** · Stickers · **Nesting (true-shape)** · Step & Repeat · Calendar · Postcards · Labels · Bookmarks · Hang Tags · Coasters · Letterhead · Compliment Slips · NCR Pads · Envelopes |
| **Folding** | Trifold · Folded (Z-fold) · Greeting Card · Menu · Wedding Invitation · Presentation Folder (dieline) |
| **Large & specialty** | Tiled Poster · Banner · Feather Flags · Roller Banner · Packaging Dieline · Box/Carton · **Color Management (ICC/CMYK)** · **JDF / CIP4 Export** |
| **Tickets & data** | Variable Data (CSV+QR) · Raffle Tickets · Coupons · Name Badges |
| **Marks & prepress** | Bleed & Crop Marks · Cutter Marks · Color Bar & Header · Page Numbering & Bates · Registration · Collating · Gathering · OMR · Folding · Lay Marks · **Die Lines (Cut Contour)** · **White/Varnish** · **Braille** · Preflight Inspector |
| **Page & PDF tools** | Merge · Split · Rotate · Flip/Mirror · Overlay/Watermark · Shuffle · Crop · PDF Repair · PDF Tools (optimize/decrypt) · **Edit PDF** · **Layers (OCG)** · Custom Impose · **Color Effects** · Backdrop / Background Fill · **Barcode / QR (QR·Code128·DataMatrix·EAN-13)** |

Highlights new in 1.1: a **real dieline generator** (box net with cut/crease/glue
from W×H×D), **CSV data-merge** with a **scannable QR** per record, plus bleed,
header/footer, watermark, job-slug, collating-mark and preflight operations. Plus
pre-press **calculators** (saddle-stitch, perfect-bind spine, n-up fit, cost, bleed).

See **[`docs/TOOLS.md`](docs/TOOLS.md)** and **[`CHANGELOG.md`](CHANGELOG.md)**.

---

## Quick start

### Option A — React drop-in (full UI: all tools + templates + workflows)

```bash
# 1) install the runtime peer + optional peers (see below)
npm install pdf-lib
npm install pdfjs-dist qrcode-generator   # optional: rasterizing tools + QR

# 2) copy the whole src/ folder into your project (keep the files together —
#    Impose.tsx imports impose.ts and catalog.ts as siblings)
cp -r node_modules/imposition-toolkit/src  ./src/imposition-toolkit
#    …or, if you vendored the zip, copy plugins/imposition-toolkit/src/* in.
```

```tsx
import { AdminImpose } from './imposition-toolkit/Impose';
import './imposition-toolkit/impose.css'; // tokens + .btn/.admin-card/.admin-table

export default function ImposePage() {
  return <AdminImpose />;   // the whole workspace: 90 tools, 156 templates, 75 workflows
}
```

Requires **React 19** (uses `React.ReactElement`). Works with Vite, Next.js
(client component — add `'use client'`), CRA, etc. `pdf-lib`, `pdfjs-dist` and
`qrcode-generator` are **dynamically imported** the first time a tool that needs
them runs, so they stay out of your initial bundle. `pdfjs-dist` is only pulled
in by the rasterizing tools (Color Effects, Color Management, true-shape
Nesting); `qrcode-generator` only by QR output. Everything else needs just
`pdf-lib`.

### Option B — Engine only, plain JavaScript (no React, no bundler)

```html
<script type="importmap">
{ "imports": { "pdf-lib": "https://esm.sh/pdf-lib@1.17.1" } }
</script>
<script type="module">
  import { imposeNUp, downloadPdf } from './imposition-toolkit/dist/impose.mjs';

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sheet = await imposeNUp(bytes, {
    cols: 3, rows: 3, sheetWIn: 8.5, sheetHIn: 11,
    marginIn: 0.25, gutterIn: 0.125, repeatFirst: false,
    addMarks: true, markLenIn: 0.25, markOffIn: 0.125,
  });
  downloadPdf(sheet, 'imposed.pdf');
</script>
```

A complete, runnable single-file demo is in
**[`examples/vanilla.html`](examples/vanilla.html)**.

> The Option A component **already includes** all 156 templates and 75 workflows
> (they live in `src/Impose.tsx`). Options B and C are for headless use.

### Option C — Catalog data (templates & workflows, no React)

The **156 templates** and **69 production-recipe workflows** ship as pure data so
the engine-only path can drive them too — as ESM, as JSON, or as TypeScript source:

```js
// ESM (typed)
import { TEMPLATES, RECIPES, TEMPLATE_INDUSTRIES } from './imposition-toolkit/dist/catalog.mjs';
// …or plain JSON (no bundler)
import templates from './imposition-toolkit/dist/templates.json' assert { type: 'json' };
import recipes   from './imposition-toolkit/dist/recipes.json'   assert { type: 'json' };
```

Each **template** is `{ id, name, industry, toolId, specs, preset? }` — `toolId`
names the tool it opens and `preset` is the option overrides to apply (e.g.
`{ nup: { cellWIn: 3.5, cellHIn: 2, sheetWIn: 8.5, sheetHIn: 11, bleedIn: 0.125, addMarks: true } }`).
Each **recipe** is `{ id, name, cat, desc, input, tip, tags, steps }` where each
step is `{ kind, label, opts? }` and `kind` maps to an engine function — run them
in order to reproduce the workflow. See **[docs/CATALOG.md](docs/CATALOG.md)**.

```js
// Drive the engine from a recipe (kind → engine function)
import * as E from './imposition-toolkit/dist/impose.mjs';
const STEP = { preflight: null, booklet: E.imposeBooklet, nup: E.imposeNUp,
  bleed: E.generateBleed, cropmarks: E.addCropMarksOnly, colorbar: E.addColorBar,
  collating: E.addCollatingMarks, /* …see docs/CATALOG.md for the full map */ };
let pdf = bytes;
for (const step of recipes.recipes[0].steps) {
  const fn = STEP[step.kind];
  if (fn) pdf = await fn(pdf, step.opts ?? {});
}
```

---

## Documentation

| Doc | Contents |
|---|---|
| **[docs/API.md](docs/API.md)** | Every engine function — signatures, options, return types, gotchas. |
| **[docs/TOOLS.md](docs/TOOLS.md)** | The tool catalog: 90 tools by category, engine, preset dimensions, input expected. |
| **[docs/CATALOG.md](docs/CATALOG.md)** | The 156 templates + 69 workflow recipes as data — shapes, the step-kind→engine map, and how to drive tools from them. |
| **[docs/CATALOG-INDEX.md](docs/CATALOG-INDEX.md)** | Plain-English index: every template + workflow tile by name and the tool(s) it ties into. |
| **[docs/INTEGRATION.md](docs/INTEGRATION.md)** | Embedding into React, Next.js, Vue/vanilla; theming; catalog data; bundler notes. |
| **[docs/VERSIONS.md](docs/VERSIONS.md)** | **Exact versions to use** on the target site — Node, pdf-lib, pdfjs-dist, qrcode-generator, React, TypeScript, Vite, browser targets. |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | How imposition works: coordinate math, saddle-stitch/creep, n-up, cut-&-stack, card packing, poster tiling, crop marks. |
| **[CHANGELOG.md](CHANGELOG.md)** | Version history. |

---

## Requirements

- **`pdf-lib` ^1.17.1** — the core runtime dependency (peer). Dynamically
  imported, so it stays out of your initial bundle until a tool runs.
- **`qrcode-generator` ^1.4.4 || ^2.0.0** — *optional* peer, only loaded when a
  data-merge uses QR codes. Omit it if you never generate QR.
- **React ^19** — only for the `<AdminImpose />` component (Option A). The
  engine (Option B) needs no framework.
- A modern browser (ES2020, dynamic `import()`, `Blob`, `URL.createObjectURL`).

## Privacy & security

All processing is local. The tools read the dropped file with the `File` API,
manipulate it in memory with `pdf-lib`, and hand it back via a `Blob` download.
No `fetch`/`XHR`/`WebSocket` is used anywhere in the engine. This makes it safe
for confidential print jobs and requires no privacy policy changes.

## License

Extracted from the Printing Comics project. You own this code — add the license
of your choice. See [LICENSE](LICENSE).
