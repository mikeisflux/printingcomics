// Emit the catalog as standalone JSON so the engine-only path (no React) can
// read the 156 templates + 69 production-recipe workflows. Run after the
// catalog is built to dist/catalog.mjs.
import { writeFileSync } from 'node:fs';
import { TEMPLATES, TEMPLATE_INDUSTRIES, RECIPES } from '../dist/catalog.mjs';

const here = (rel) => new URL(rel, import.meta.url);
writeFileSync(here('../dist/templates.json'), JSON.stringify({ industries: TEMPLATE_INDUSTRIES, templates: TEMPLATES }, null, 2));
writeFileSync(here('../dist/recipes.json'), JSON.stringify({ recipes: RECIPES }, null, 2));
console.log(`catalog JSON: ${TEMPLATES.length} templates + ${RECIPES.length} recipes → dist/`);
