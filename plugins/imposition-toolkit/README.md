# Imposition Toolkit

A self-contained, **100% client-side** PDF imposition & pre-press toolkit — 38
real print-production tools plus 5 planning calculators, extracted from the
Printing Comics storefront so it can be dropped into any other website.

Everything runs in the browser using [`pdf-lib`](https://pdflib.js.org). **Files
never leave the user's machine** — nothing is uploaded, there is no server
component, and there are no network calls during processing.

- **`src/impose.ts`** — the framework-agnostic engine (18 functions). No React,
  no app dependencies. This is the reusable core.
- **`src/Impose.tsx`** — a complete React 19 UI (`<AdminImpose />`): searchable
  tool gallery, per-tool settings, live previews, download.
- **`dist/impose.mjs`** — a pre-compiled browser ESM build of the engine for
  plain-JavaScript sites (no bundler/TypeScript required).

---

## What's inside

| Category | Tools |
|---|---|
| **Booklets & Books** | Comic Book · Booklet · Saddle-Stitch Magazine · Perfect-Bound Book · Zine · Event Program · Catalog · Greeting Card |
| **Imposition & Layout** | N-Up Grid · Step & Repeat · Cut & Stack · Index / Contact Sheet · Optimal Fit · Tiled Poster |
| **Cards & Labels** | Business Cards · **Trading Cards** · Postcards · Labels (Avery 5160) · Bookmarks · Hang Tags · Photo Prints · Flyers · Name Badges · Envelopes |
| **Folding** | Trifold Brochure · Wedding Invitation · Menu / Bi-fold |
| **Tickets & Data** | Numbered Tickets |
| **Marks & Prepress** | Crop Marks · Color Bar · Page Numbering |
| **Page & PDF Tools** | Merge · Split · Rotate · Flip / Mirror · Overlay / Watermark · Shuffle · Crop |

Plus pre-press **calculators**: Saddle-Stitch planner, Perfect-Bind spine width,
N-Up fit, Cost/margin estimator, and a Bleed & Specs reference.

See **[`docs/TOOLS.md`](docs/TOOLS.md)** for every tool's engine, preset sizes,
and expected input.

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
| **[docs/TOOLS.md](docs/TOOLS.md)** | The 38-tool catalog: category, engine, preset dimensions, input expected. |
| **[docs/INTEGRATION.md](docs/INTEGRATION.md)** | Embedding into React, Next.js, Vue/vanilla; theming; bundler notes. |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | How imposition works: coordinate math, saddle-stitch/creep, n-up, cut-&-stack, card packing, poster tiling, crop marks. |
| **[CHANGELOG.md](CHANGELOG.md)** | Version history. |

---

## Requirements

- **`pdf-lib` ^1.17.1** — the only runtime dependency (peer dependency).
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
