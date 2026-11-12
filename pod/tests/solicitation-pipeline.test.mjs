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

const { db } = await import('../src/firebase-mock.js');
const { csvRowsToOrderLines } = await import('../src/lib/csv-order.js');

const ownerEmail = 'mauramariepowers@gmail.com';
const ownerPassword = 'solicitation-owner-password';
const owner = db.bootstrapLocalMoos(ownerEmail, ownerPassword);
const publisher = db.login('creator@indycomics.com', '');

const cycles = JSON.parse(localStorage.getItem('philbo_catalog_cycles'));
cycles.push({
  cycleId: 'cycle_pipeline_test', cycleName: 'Pipeline Test Cycle', catalogDate: '2099-01-01',
  focDate: '2099-02-01', releaseDate: '2099-03-01', status: 'Open for Retailer Ordering',
  publisherOpen: true, retailerOpen: true, retailerDownloadEnabled: true, history: []
});
localStorage.setItem('philbo_catalog_cycles', JSON.stringify(cycles));

const solicitation = db.submitTitle({
  title: 'TEST BOOK - DO NOT PUBLISH', description: 'Pipeline test solicitation copy.', msrp: 4.99,
  coverUrl: 'https://example.com/test-cover.jpg', coverArtFileName: 'test-cover.png',
  cycleId: 'cycle_pipeline_test', status: 'Submitted for Review', pageCount: 32,
  seriesCode: 'PIPELINE', barcode: '9999900000001', seriesName: 'Pipeline Test', issueNumber: '1',
  variantNumber: 'A', bookFormat: 'Single Issue', seriesType: 'One-shot', seriesFrequency: 'One-shot',
  ageRange: 'Teen', colorProfile: 'Color', writer: 'Test Writer', artist: 'Test Artist',
  coverArtist: 'Test Cover Artist', fulfillmentMethod: 'Philbo POD', availableForReorder: 'Yes'
}, publisher.uid, publisher.companyName);

assert.equal(solicitation.status, 'Submitted for Review', 'publisher submission enters review instead of publishing');
assert.ok(!db.getPublicTitles().some(title => title.titleId === solicitation.titleId), 'pending submission is not public');

db.login(ownerEmail, ownerPassword, 'staff');
db.editTitle(solicitation.titleId, { ...solicitation, title: 'TEST BOOK - ADMIN CORRECTED', cycleId: 'cycle_pipeline_test' }, solicitation.status, owner.email);
const approval = db.updateTitleStatus(solicitation.titleId, 'Approved', owner.email, 'Metadata verified.');
const publication = approval.catalogSynchronization;
assert.equal(publication.published, true, 'approval synchronizes the one authoritative snapshot when retailer ordering is already open');
assert.equal(publication.titleCount, 1, 'publishing the cycle snapshots its approved title set');
assert.equal(publication.version, 1, 'the first retailer catalog publication is versioned');
assert.equal(publication.cycle.retailerOpen, true, 'publishing opens retailer ordering');
assert.deepEqual(publication.cycle.catalogPublishedTitleIds, [solicitation.titleId], 'catalog snapshot records the authoritative SKU ids');

const publicRecord = db.getPublicTitles().find(title => title.titleId === solicitation.titleId);
assert.equal(publicRecord.title, 'TEST BOOK - ADMIN CORRECTED', 'admin correction feeds the public record');
assert.equal(publicRecord.status, 'Approved', 'approval remains the authoritative workflow status');
assert.ok(publicRecord.publishedAt, 'approval stamps downstream publication time');

const retailer = db.login('comics@metropolisbooks.com', '');
const retailerRecord = db.getTitles().find(title => title.titleId === solicitation.titleId);
assert.equal(retailerRecord.orderable, true, 'approved record is retailer-orderable during the open FOC window');
const csv = db.generateCatalogCsv('cycle_pipeline_test', retailer, { recordHistory: false });
assert.match(csv.csv, /TEST BOOK - ADMIN CORRECTED/, 'the same approved record appears in CSV export');
assert.equal(csv.titleCount, 1, 'one sellable cover produces one CSV row');
assert.match(csv.csv, /^Quantity,PHILBO ID,Publisher/, 'retailer catalog CSV starts with a blank order quantity column');
assert.match(csv.csv, /\r?\n,PIPELINE/, 'catalog title rows leave the retailer-entered quantity field blank');
assert.match(csv.filename, /^Philbo_Order_Ready_Catalog_/, 'retailer receives an explicitly order-ready catalog filename');
const [catalogHeader, catalogTitleRow] = csv.csv.split(/\r?\n/);
assert.deepEqual(csvRowsToOrderLines(`${catalogHeader}\r\n2${catalogTitleRow}`), [
  { line: 2, rawCode: retailerRecord.philboId, qty: '2' }
], 'the downloaded catalog can be completed and uploaded back as an order');
const orderForm = db.generateRetailerOrderFormCsv('cycle_pipeline_test', retailer);
assert.match(orderForm.csv, /Product Code,UPC \/ ISBN \/ EAN,Title/, 'retailer order form has stable upload columns');
assert.match(orderForm.csv, /TEST BOOK - ADMIN CORRECTED/, 'retailer order form uses the approved authoritative record');
assert.match(orderForm.csv, /,Qty\r?\n/, 'retailer order form includes a quantity column for entry');
assert.equal(orderForm.titleCount, 1, 'order form includes each orderable SKU once');
const order = db.placeOrder(retailer.uid, retailer.companyName, [{ ...retailerRecord, qty: 2 }], retailer.tier || 'Tier I');
assert.equal(order.items[0].titleId, solicitation.titleId, 'retailer order uses the approved authoritative product id');

db.login(ownerEmail, ownerPassword, 'staff');
db.editTitle(solicitation.titleId, { ...db.getTitles().find(title => title.titleId === solicitation.titleId), title: 'TEST BOOK - PROPAGATED EDIT', cycleId: 'cycle_pipeline_test' }, 'Approved', owner.email);
assert.equal(db.getPublicTitles().find(title => title.titleId === solicitation.titleId).title, 'TEST BOOK - PROPAGATED EDIT', 'approved admin edits propagate without creating a copy');

db.login('creator@indycomics.com', '');
assert.throws(
  () => db.editTitle(solicitation.titleId, { ...solicitation, title: 'Silent publisher edit' }, 'Approved', publisher.companyName),
  /cannot be changed silently/i,
  'publisher cannot silently modify the live authoritative record'
);

db.login(ownerEmail, ownerPassword, 'staff');
db.updateTitleStatus(solicitation.titleId, 'Changes Requested', owner.email, 'Please correct the cover credit.');
assert.ok(!db.getPublicTitles().some(title => title.titleId === solicitation.titleId), 'needs-revision records are not public');
db.updateTitleStatus(solicitation.titleId, 'Rejected', owner.email, 'Rejected test record.');
assert.ok(!db.getPublicTitles().some(title => title.titleId === solicitation.titleId), 'rejected records are not public');

console.log('Solicitation pipeline tests passed.');
