import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { inspectInteriorPdf } from '../src/lib/pdf-preflight.js';

const pt = inches => inches * 72;
const asUpload = (name, bytes) => ({
  name,
  size: bytes.length,
  type: 'application/pdf',
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
});

async function makePdf({ pageCount = 24, width = 6.625, height = 10.25, bleed = 0.125, spreadPage = 0 }) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const isSpread = index + 1 === spreadPage;
    const trimWidth = isSpread ? width * 2 : width;
    const page = pdf.addPage([pt(trimWidth + bleed * 2), pt(height + bleed * 2)]);
    page.setTrimBox(pt(bleed), pt(bleed), pt(trimWidth), pt(height));
    page.setBleedBox(0, 0, pt(trimWidth + bleed * 2), pt(height + bleed * 2));
  }
  return pdf.save();
}

const good = await inspectInteriorPdf(
  asUpload('ready.pdf', await makePdf({})),
  { pageCount: 24, width: 6.625, height: 10.25 }
);
assert.equal(good.status, 'ready-for-review');
assert.equal(good.failed, 0);
assert.equal(good.checks.find(check => check.id === 'bleed').status, 'pass');

const badCount = await inspectInteriorPdf(
  asUpload('wrong-count.pdf', await makePdf({ pageCount: 22 })),
  { pageCount: 24, width: 6.625, height: 10.25 }
);
assert.equal(badCount.status, 'changes-required');
assert.equal(badCount.checks.find(check => check.id === 'page-count-four').status, 'fail');
assert.equal(badCount.checks.find(check => check.id === 'declared-page-count').status, 'fail');

const spread = await inspectInteriorPdf(
  asUpload('spread.pdf', await makePdf({ spreadPage: 8 })),
  { pageCount: 24, width: 6.625, height: 10.25 }
);
assert.equal(spread.status, 'changes-required');
assert.equal(spread.checks.find(check => check.id === 'single-pages').status, 'fail');

console.log('PDF preflight tests passed.');
