# Versions — what to use on the target website

The stack the toolkit is built and verified against. Pin to these on the site
you drop it into. Everything is client-side, so there is **no server runtime** to
match — the "runtime" below is only your **build/CI** environment.

## Recommended stack

| What | Use | Minimum | Notes |
|---|---|---|---|
| **Node.js** (build/CI only) | **22 LTS** (`22.x`) | `>=22` | The toolkit ships as browser code; Node only builds it. 22 is the current LTS. |
| **npm** | `10.x`+ | `>=10` | Or pnpm/yarn — any workspace-aware manager. |
| **pdf-lib** | `1.17.1` | `^1.17.1` | The one required runtime dep. Dynamically imported → lazy-loaded, out of your initial bundle. |
| **qrcode-generator** | `2.0.4` | `^1.4.4 \|\| ^2.0.0` | **Optional** — only loaded when a data-merge uses QR. Omit if you never generate QR. |
| **react** / **react-dom** | `19.x` | `^19` | Only for the `<AdminImpose />` component. The engine (`impose.ts` / `dist/impose.mjs`) needs no framework. |
| **TypeScript** | `6.x` | `^5.6` | Only if you consume the `.ts`/`.tsx` sources directly. The `dist/` build + `.d.ts` are plain JS. |
| **Vite** | `8.x` | `^6` | Any modern bundler works (webpack 5, Rollup 4, esbuild ≥0.28). Vite 8 uses the Rolldown bundler. |
| **@vitejs/plugin-react** | `6.x` | `^4` | Or your bundler's React/JSX transform. |
| **esbuild** | `0.28.x` | `^0.28` | Only if you rebuild `dist/impose.mjs` yourself (`npm run build`). |

### Type packages (dev only)

| Package | Use |
|---|---|
| `@types/react` | `^19` |
| `@types/react-dom` | `^19` |
| `@types/qrcode-generator` | `^0.0.16` (only if you use QR from TypeScript) |

## Browser targets

The engine emits **ES2020** and relies on: dynamic `import()`, `Blob`,
`URL.createObjectURL`, `Uint8Array`, and SVG. That's every evergreen browser
(Chrome/Edge/Firefox/Safari, last ~4 years). No polyfills needed for those.

## Install lines

```bash
# React UI + QR:
npm install pdf-lib qrcode-generator
npm install -D typescript@^6 @types/react@^19 @types/react-dom@^19 @types/qrcode-generator

# Engine only, no React, no QR:
npm install pdf-lib
```

## Vanilla (no bundler) — CDN pins

The `examples/vanilla.html` import map pins the exact CDN versions:

```html
<script type="importmap">
{ "imports": {
  "pdf-lib": "https://esm.sh/pdf-lib@1.17.1",
  "qrcode-generator": "https://esm.sh/qrcode-generator@1.4.4"
} }
</script>
```

## Why these

- **Node 22 LTS** — current LTS; some modern tool-chain packages now require it,
  and building on it avoids `EBADENGINE` warnings. (The toolkit itself runs on
  anything; this is purely about the build box.)
- **pdf-lib 1.17.1** — the last stable line; the engine uses only its stable
  APIs (`embedPages`, `drawPage`, `pushOperators` + `concatTransformationMatrix`,
  `setCropBox`/`setTrimBox`, `embedFont`). Smoke-test against [API.md](API.md)
  before adopting a new major.
- **qrcode-generator** — a tiny, dependency-free, battle-tested QR encoder;
  optional so non-QR sites carry zero extra weight.
- **React 19** — the component types thumbnails as `React.ReactElement`; on React
  18 you'd adjust those signatures.
