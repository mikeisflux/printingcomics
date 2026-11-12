import assert from 'node:assert/strict';
import { buildLiveRetailerCatalogCycles, generateLiveRetailerCatalogCsv } from '../src/lib/retailer-csv.js';

const titles = [
  { titleId: 'one', cycleId: 'cycle-live', catalogCycleName: 'PHILVIEWS #15', catalogCycleStatus: 'retailer_ordering_open', catalogDate: '2026-09-01', focDate: '2026-11-01', releaseDate: '2026-12-16', catalogPublicationVersion: 2, catalogPublishedAt: '2026-09-01T12:00:00Z', philboId: 'PHI-1', barcode: '123', title: 'Book, One', publisherName: 'Press', msrp: 5, focLocked: false },
  { titleId: 'two', cycleId: 'cycle-live', catalogCycleName: 'PHILVIEWS #15', catalogCycleStatus: 'retailer_ordering_open', catalogDate: '2026-09-01', focDate: '2026-11-01', releaseDate: '2026-12-16', philboId: 'PHI-2', barcode: '456', title: 'Book Two', publisherName: 'Press', msrp: 10, focLocked: false }
];

const cycles = buildLiveRetailerCatalogCycles(titles);
assert.equal(cycles.length, 1);
assert.equal(cycles[0].titleCount, 2);
assert.equal(cycles[0].cycleName, 'PHILVIEWS #15');
assert.equal(cycles[0].retailerOpen, true);

const result = generateLiveRetailerCatalogCsv({ cycleId: 'cycle-live', titles, tier: 'Tier II', discount: 0.45 });
assert.equal(result.titleCount, 2);
assert.match(result.filename, /Philbo_Order_Ready_Catalog_2026-12_FOC_2026-11-01\.csv/);
assert.match(result.csv, /"Book, One"/);
assert.match(result.csv, /5\.50,Tier II/);
assert.match(result.csv, /^Quantity,PHILBO ID,Publisher/);

console.log('Live retailer catalog CSV tests passed.');
