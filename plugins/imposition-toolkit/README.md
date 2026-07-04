# Imposition Toolkit

A self-contained, **100% client-side** PDF imposition & pre-press toolkit — **79
print-production tools + 156 ready-made industry templates + 6 chained
workflows** plus 5 planning calculators, extracted from the Printing Comics
storefront so it can be dropped into any other website.

Everything runs in the browser using [`pdf-lib`](https://pdflib.js.org). **Files
never leave the user's machine** — nothing is uploaded, there is no server
component, and there are no network calls during processing.

- **`src/impose.ts`** — the framework-agnostic engine (**35 functions**). No
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
| **Large & specialty** | Tiled Poster · Banner · Feather Flags · Roller Banner · Packaging Dieline · Box/Carton |
| **Tickets & data** | Variable Data (CSV+QR) · Raffle Tickets · Coupons · Name Badges |
| **Marks & prepress** | Bleed & Crop Marks · Cutter Marks · Color Bar & Header · Page Numbering & Bates · Registration · Collating · **Gathering** · **OMR** · **Folding** · **Lay Marks** · Preflight Inspector |
| **Page & PDF tools** | Merge · Split · Rotate · Flip/Mirror · Overlay/Watermark · Shuffle · Crop |

Highlights new in 1.1: a **real dieline generator** (box net with cut/crease/glue
from W×H×D), **CSV data-merge** with a **scannable QR** per record, plus bleed,
header/footer, watermark, job-slug, collating-mark and preflight operations. Plus
pre-press **calculators** (saddle-stitch, perfect-bind spine, n-up fit, cost, bleed).

See **[`docs/TOOLS.md`](docs/TOOLS.md)** and **[`CHANGELOG.md`](CHANGELOG.md)**.

---

## Quick start

### Option A — React drop-in (full UI)

```bash
npm install pdf-lib
# copy plugins/imposition-toolkit/src/* into your project
```

```tsx
import { AdminImpose } from './imposition-toolkit/Impose';
import './imposition-toolkit/impose.css'; // provides tokens + .btn/.admin-card/.admin-table

export default function ImposePage() {
  return <AdminImpose />;
}
```

Requires React 19 (uses `React.ReactElement`). Works with Vite, Next.js
(client component — add `'use client'`), CRA, etc. `pdf-lib` is dynamically
imported the first time a tool runs, so it stays out of your initial bundle.

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

---

## Documentation

| Doc | Contents |
|---|---|
| **[docs/API.md](docs/API.md)** | Every engine function — signatures, options, return types, gotchas. |
| **[docs/TOOLS.md](docs/TOOLS.md)** | The tool catalog: category, engine, preset dimensions, input expected. |
| **[docs/INTEGRATION.md](docs/INTEGRATION.md)** | Embedding into React, Next.js, Vue/vanilla; theming; bundler notes. |
| **[docs/VERSIONS.md](docs/VERSIONS.md)** | **Exact versions to use** on the target site — Node, pdf-lib, qrcode-generator, React, TypeScript, Vite, browser targets. |
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
