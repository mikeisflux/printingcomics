import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
globalThis.CustomEvent = class CustomEvent { constructor(type) { this.type = type; } };
globalThis.window = { location: { hostname: 'localhost', protocol: 'http:' }, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };

// Reproduce a browser that ran the earlier title-only activation but did not
// yet receive the corrected authoritative catalog snapshot.
localStorage.setItem('philbo_activate_foc_2026_09_01_catalog_v1', JSON.stringify({ activatedAt: '2026-08-29T00:00:00.000Z' }));

const RealDate = Date;
const fixedNow = new RealDate('2026-09-01T09:30:00-04:00');
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [fixedNow.getTime()])); }
  static now() { return fixedNow.getTime(); }
};

const { db } = await import('../src/firebase-mock.js');
const owner = db.bootstrapLocalMoos('mauramariepowers@gmail.com', 'savage-test-password');
const savage = db.getTitles(owner).find(title => title.philboId === 'PHIL101426-1201');

assert.ok(savage, 'the bundled SAVAGE The War record exists');
assert.equal(savage.cycleId, 'cycle_13', 'Savage is assigned to the July 1, 2026 catalog cycle');
assert.equal(savage.status, 'Archived', 'the later ORCA / 10 Ton transition keeps Savage historical and unavailable');
assert.equal(savage.historicalOnly, true, 'the historical record is retained rather than deleted');
assert.equal(savage.availableForReorder, 'No', 'the archived legacy title cannot be reordered');

const septemberFocTitles = db.getTitles(owner).filter(title => title.focDate === '2026-09-01');
assert.ok(septemberFocTitles.length > 1, 'the September 1 FOC catalog contains the bundled legacy title set');
assert.ok(septemberFocTitles.some(title => title.status === 'Live'), 'the September 1 FOC catalog retains its active non-ORCA titles');

const septemberCycle = db.getCatalogCycles().find(cycle => cycle.cycleId === 'cycle_13');
assert.equal(septemberCycle.retailerOpen, true, 'the September catalog is open for retailer ordering');
const liveSeptemberTitles = septemberFocTitles.filter(title => title.status === 'Live');
assert.deepEqual(
  [...septemberCycle.catalogPublishedTitleIds].sort(),
  liveSeptemberTitles.map(title => title.titleId).sort(),
  'the catalog snapshot contains only the live September 1 FOC records'
);
const septemberExport = db.getCatalogExportHistory(owner).find(item => item.cycleId === 'cycle_13' && item.legacyCatalogReconciliation);
assert.ok(septemberExport, 'the reconciled catalog creates its canonical downloadable CSV record');
assert.equal(septemberExport.titleCount, septemberFocTitles.length, 'the legacy export remains an immutable audit record of the pre-archive snapshot');

assert.throws(
  () => db.approveTitle(savage.titleId),
  /Historical titles must be reviewed/i,
  'an archived historical ORCA / 10 Ton title cannot be republished through the legacy approval shortcut'
);

const retailer = db.login('comics@metropolisbooks.com', '');
const retailerSavage = db.getTitles(retailer).find(title => title.philboId === 'PHIL101426-1201');
assert.equal(retailerSavage, undefined, 'Savage remains hidden from retailer ordering');

console.log('Savage publication test passed.');
