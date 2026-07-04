# Integration Guide

Three ways to use the toolkit: the **full React UI**, the **engine on its own**,
or the **catalog data** (templates + workflows, no React). Pick based on whether
your site runs React and whether you want the ready-made presets.

---

## 1. React (full UI — all 90 tools + 156 templates + 75 workflows)

### File setup

Copy the **whole `src/` folder** (keep the files together — `Impose.tsx` imports
`impose.ts` and `catalog.ts` as siblings and needs `impose.css`):

```bash
cp -r imposition-toolkit/src  ./src/imposition-toolkit
npm install pdf-lib                       # required
npm install pdfjs-dist qrcode-generator   # optional: rasterizing tools + QR
```

### Render it

```tsx
import { AdminImpose } from './imposition-toolkit/Impose';
import './imposition-toolkit/impose.css';

export default function ToolsPage() {
  return <AdminImpose />;
}
```

That's the whole integration — `<AdminImpose />` is self-contained (gallery,
search, per-tool settings, previews, downloads). It renders into whatever
container you place it in and uses inline styles + the three utility classes from
`impose.css`.

### Requirements

- **React 19.** The component types thumbnails as `React.ReactElement`. On React
  18 you'd need to adjust those signatures.
- The component is **client-side only**. In **Next.js App Router**, add
  `'use client'` at the top of a wrapper (or of `Impose.tsx`), because it uses
  `useState`, `Blob`, and `document`.

### Next.js example

```tsx
// app/tools/impose/page.tsx
'use client';
import { AdminImpose } from '@/lib/imposition-toolkit/Impose';
import '@/lib/imposition-toolkit/impose.css';
export default function Page() { return <AdminImpose />; }
```

### Mounting just one tool

`AdminImpose` is the whole gallery. To expose a single tool, import the engine
function directly (see §2) and build your own minimal form, or fork the
`ToolWorkspace` component out of `Impose.tsx`.

---

## 2. Engine only (no React)

The engine (`src/impose.ts` / compiled `dist/impose.mjs`) is framework-agnostic.
Use it from vanilla JS, Vue, Svelte, Angular, a Web Worker, or Node.

### With a bundler (Vite / webpack / esbuild / Rollup)

```ts
import { imposeBooklet, downloadPdf } from './imposition-toolkit/src/impose';
// pdf-lib resolves from node_modules; it is code-split automatically.
```

### Without a bundler (plain `<script type="module">`)

Use the pre-compiled `dist/impose.mjs` and an import map so its dynamic
`import('pdf-lib')` resolves to a CDN:

```html
<script type="importmap">
{ "imports": { "pdf-lib": "https://esm.sh/pdf-lib@1.17.1" } }
</script>
<script type="module">
  import { imposeNUp, downloadPdf } from './dist/impose.mjs';
  // ... wire up a file <input> and a button
</script>
```

See [`examples/vanilla.html`](../examples/vanilla.html) for a complete page.
(ES modules require the file to be **served over http(s)**, not opened via
`file://`.)

### In a Web Worker (keep the UI responsive on big files)

The engine has no DOM dependencies except the two `downloadPdf`/`downloadMultiple`
helpers — do the imposition in a worker and post the resulting `Uint8Array` back
to the main thread to download.

### In Node.js

Everything except the download helpers works server-side (e.g. batch imposition):

```js
import { imposeNUp } from './dist/impose.mjs';
import { writeFile } from 'node:fs/promises';
const out = await imposeNUp(new Uint8Array(buf), opts);
await writeFile('out.pdf', out);
```

---

## Reading a file into `Uint8Array`

Every engine function takes raw PDF bytes:

```ts
const bytes = new Uint8Array(await file.arrayBuffer()); // File from an <input>
```

---

## Theming

`impose.css` defines a brand-neutral palette via CSS custom properties. Override
them anywhere above the component — no need to edit the file:

```css
:root {
  --brand:      #c61a22;  /* buttons, active tabs */
  --brand-dark: #a21419;  /* button hover */
  --bg:         #ffffff;
  --bg-alt:     #f7f5f2;
  --ink:        #1a1a1a;
  --muted:      #5a5a5a;
  --border:     #e6e3df;
  --radius:     6px;
}
```

If your app already defines `--brand` / `--bg` / `--border` / `--ink` /
`--muted` and `.btn` / `.admin-card` / `.admin-table`, you can **skip importing
`impose.css`** entirely and the component adopts your styling.

Dark mode: redefine the tokens under `@media (prefers-color-scheme: dark)` (a
commented template is at the bottom of `impose.css`). A few accent colors
(warning banners, page badges) are intentionally light-fixed.

---

## Bundle size

`pdf-lib` (~180 kB gzip) is loaded via dynamic `import()` **only when a tool
runs**, so it never touches your initial bundle. The engine module itself is
tiny (~17 kB). In the original app it compiled to a separate lazy chunk; your
bundler will do the same as long as you don't statically re-export pdf-lib.

## Dependency pinning

Pin `pdf-lib@^1.17.1`. The engine relies on stable `pdf-lib` APIs
(`embedPages`, `drawPage`, `pushOperators` + `concatTransformationMatrix`,
`setCropBox`/`setTrimBox`, `embedFont`). Major-version bumps of pdf-lib should be
smoke-tested against [API.md](API.md).

## Common pitfalls

- **Blank output / `file://`** — ES modules and workers need an http server.
- **`pdf-lib` fails to resolve in vanilla mode** — the import map is missing or
  the path is wrong.
- **Password-protected PDF throws** — the engine tolerates *flagged* encryption
  (`ignoreEncryption`) but cannot open truly password-locked files.
- **Distorted cards** — in fixed-cell mode the source page is scaled to the cell;
  design the card at the target aspect ratio (or matching size + bleed).

---

## 3. Catalog data (templates & workflows — no React)

The 156 templates and 69 workflow recipes ship as data you can consume without
the UI — typed ESM, JSON, or TS source:

```js
import { TEMPLATES, RECIPES, TEMPLATE_INDUSTRIES } from 'imposition-toolkit/catalog'; // dist/catalog.mjs
import templates from 'imposition-toolkit/templates.json' assert { type: 'json' };    // dist/templates.json
import recipes   from 'imposition-toolkit/recipes.json'   assert { type: 'json' };     // dist/recipes.json
```

- A **template** (`{ id, name, industry, toolId, specs, preset? }`) is a preset
  for one tool — spread `preset.<family>` over that engine's option defaults.
- A **recipe** (`{ id, name, cat, desc, input, tip, tags, steps }`) is an ordered
  pipeline; map each `step.kind` to an engine function and fold the steps over
  the PDF bytes.

The full data shapes, the **`kind → engine` map**, and a runnable
`runRecipe()` helper are in **[CATALOG.md](CATALOG.md)**. These JSON/ESM files
are generated from `src/catalog.ts` by `npm run build`.
