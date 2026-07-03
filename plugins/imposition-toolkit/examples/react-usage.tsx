/*
 * Minimal React integration.
 *
 * 1. npm install pdf-lib
 * 2. Copy ../src/{impose.ts,Impose.tsx,impose.css} into your project.
 * 3. Render <AdminImpose /> anywhere. That's it — it's the whole gallery.
 *
 * Next.js App Router: keep the 'use client' directive below (the component
 * uses useState, Blob and document).
 */
'use client';

import { AdminImpose } from '../src/Impose';
import '../src/impose.css';

export default function ImposePage() {
  return <AdminImpose />;
}

/* ------------------------------------------------------------------ *
 * Prefer to build your own UI around a single tool? Skip the component
 * and call the engine directly:
 *
 *   import { imposeBooklet, downloadPdf } from '../src/impose';
 *
 *   async function makeBooklet(file: File) {
 *     const bytes = new Uint8Array(await file.arrayBuffer());
 *     const out = await imposeBooklet(bytes, {
 *       rtl: false, marginIn: 0.5, gutterIn: 0, creepIn: 0.125,
 *       addMarks: true, markLenIn: 0.25, markOffIn: 0.125,
 *     });
 *     downloadPdf(out, 'booklet.pdf');
 *   }
 * ------------------------------------------------------------------ */
