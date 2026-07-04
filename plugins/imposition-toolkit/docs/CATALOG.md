# Catalog — templates & workflows as data

The toolkit ships its **156 industry templates** and **69 production-recipe
workflows** as pure, framework-free data so any site — React or not — can drive
the engine from them. Three equivalent forms, all in the package:

| Form | Path | Use when |
|---|---|---|
| Typed ESM | `dist/catalog.mjs` (+ `dist/catalog.d.ts`) | you have a bundler / want types |
| JSON | `dist/templates.json`, `dist/recipes.json` | plain JS, no bundler, or another language |
| TS source | `src/catalog.ts` | you vendor the source (Option A) |

```js
import { TEMPLATES, RECIPES, TEMPLATE_INDUSTRIES } from 'imposition-toolkit/catalog';
// or: import t from 'imposition-toolkit/templates.json' assert { type: 'json' };
```

`templates.json` is `{ industries: string[], templates: TemplateDef[] }`;
`recipes.json` is `{ recipes: RecipeDef[] }`. The ESM module exports the arrays
directly (`TEMPLATES`, `RECIPES`, `TEMPLATE_INDUSTRIES`).

---

## Templates

A template is a **preset for one tool** — it says which tool to open and what
option overrides to apply.

```ts
interface TemplateDef {
  id: string;          // stable id, e.g. "t000-10-up-business-cards"
  name: string;        // "10-Up Business Cards"
  industry: string;    // one of TEMPLATE_INDUSTRIES
  toolId: string;      // the tool this template opens (see docs/TOOLS.md)
  specs: string;       // one-line size/finish summary (human text)
  preset?: {           // option overrides, keyed by engine family
    nup?: Partial<NUpOptions>;
    booklet?: Partial<BookletOptions>;
    poster?: Partial<PosterOptions>;
    ticket?: Partial<TicketOptions>;
    resize?: Partial<ResizeOptions>;
  };
}
```

To apply a template headlessly: pick the engine by the preset family and spread
the preset over that engine's defaults.

```js
import * as E from 'imposition-toolkit';        // dist/impose.mjs
const tpl = TEMPLATES.find(t => t.id === 't000-10-up-business-cards');
const sheet = await E.imposeNUp(pdfBytes, {
  cols: 0, rows: 0, marginIn: 0.25, gutterIn: 0.125, repeatFirst: false,
  markLenIn: 0.25, markOffIn: 0.125,               // engine defaults
  ...tpl.preset.nup,                               // template overrides
});
```

The 7 industries: **Commercial Print, Packaging, Publishing, Large Format,
Office, Variable Data, Real Estate.**

---

## Workflows (production recipes)

A recipe is an **ordered pipeline**. Each step names an engine operation (`kind`)
and optional overrides (`opts`).

```ts
interface RecipeDef {
  id: string; name: string; desc: string;
  cat: string;         // one of the 9 categories below
  input: string;       // what to feed it (human text)
  tip: string;         // prepress tip
  tags: string[];
  steps: { kind: string; label: string; opts?: Record<string, unknown> }[];
}
```

9 categories: **Booklets & Books, Cards & Flat, Labels & Stickers, Packaging,
Large Format, Production Marks, Calendars & Specialty, Ganging & Optimization,
Transform & Prep.**

### Running a recipe

Map each `kind` to an engine function and fold the steps over the PDF bytes:

```js
import * as E from 'imposition-toolkit';
import { RECIPES } from 'imposition-toolkit/catalog';

const STEP = {
  preflight:    null,                 // inspection only — no transform
  booklet:      E.imposeBooklet,
  nup:          E.imposeNUp,
  bleed:        E.generateBleed,
  colorbar:     E.addColorBar,
  cropmarks:    E.addCropMarksOnly,
  pagenumbers:  E.addPageNumbers,
  headerfooter: E.addHeaderFooter,
  watermark:    E.addTextWatermark,
  jobslug:      E.addJobSlug,
  collating:    E.addCollatingMarks,
  gathering:    E.addGatheringMarks,
  foldmarks:    E.addFoldMarks,
  registration: E.addRegistrationMarks,
  cutcontour:   (b, o) => E.addCutContour(b, { spotName: 'CutContour', shape: 'rectangle', target: 'trim', ...o }),
  nest:         E.nestPdf,
  resize:       E.resizePdf,
  rotate:       (b, o) => E.rotatePdf(b, o.angleDeg ?? 90),
  shuffle:      (b, o) => E.shufflePages(b, o.order ?? 'all'),
  flip:         (b, o) => E.flipPdf(b, o.direction ?? 'h'),
  dimensions:   (b) => E.addDimensions(b),
  barcode:      E.addBarcodeStamp,
  qrstamp:      E.addQrStamp,
  optimize:     E.optimizePdf,
  repair:       E.repairPdf,
  colormanage:  E.applyColorManagement,   // browser only (needs a canvas)
  distort:      null,                      // needs cylinder params — configure per job
  passthrough:  null,                      // prep step needing a 2nd file / server pass
};

async function runRecipe(recipeId, pdfBytes) {
  const r = RECIPES.find(x => x.id === recipeId);
  let pdf = pdfBytes;
  for (const step of r.steps) {
    const fn = STEP[step.kind];
    if (fn) pdf = await fn(pdf, step.opts ?? {});   // null kinds are skipped (inspection / prep)
  }
  return pdf;
}
```

Notes:
- **`passthrough`** steps (merge, interleave, tiling, die templates, OMR/lay
  marks) need a second file or a server-side pass — wire them to your own
  handler; they're marked so you can see them in the recipe.
- **`colormanage`** / rasterizing steps require a browser `<canvas>` +
  `pdfjs-dist`; skip or replace them in a pure-Node pipeline.
- Every step's `opts` are **overrides** — merge them over the engine's option
  defaults (see [API.md](API.md) for each function's options).

The exact same `kind → engine` mapping is what the React UI's pipeline runner
uses, so a recipe behaves identically headless or in the app.
