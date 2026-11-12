import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { CURRENT_PHILVIEWS_CATALOG, PHILVIEWS_CATALOGS } from '../src/data/philviews-catalogs.js';

test('Philviews catalog issues use the approved covers and PDF links', () => {
  assert.deepEqual(PHILVIEWS_CATALOGS.map(catalog => catalog.issue), [15, 14, 13]);
  assert.equal(CURRENT_PHILVIEWS_CATALOG.issue, 15);
  assert.equal(CURRENT_PHILVIEWS_CATALOG.catalogDate, '2026-09-01');
  assert.equal(CURRENT_PHILVIEWS_CATALOG.focDate, '2026-11-01');
  assert.equal(CURRENT_PHILVIEWS_CATALOG.releaseDate, '2026-12-16');

  PHILVIEWS_CATALOGS.forEach(catalog => {
    assert.match(catalog.pdfUrl, /^https:\/\/philbodistribution\.com\/s\/.+\.pdf$/);
    assert.ok(fs.existsSync(`public/assets/${catalog.coverPath}`), `Missing cover for Philviews #${catalog.issue}`);
    assert.ok(catalog.catalogDate && catalog.focDate && catalog.releaseDate, `Philviews #${catalog.issue} exposes catalog, FOC, and in-store dates`);
    assert.ok(catalog.accentColor && catalog.complementColor, `Philviews #${catalog.issue} has a cover-derived card palette`);
  });
});
