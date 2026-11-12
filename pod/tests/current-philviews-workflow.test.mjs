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
globalThis.window = {
  location: { hostname: 'localhost', protocol: 'http:' },
  dispatchEvent() {}, addEventListener() {}, removeEventListener() {}
};

const { db } = await import('../src/firebase-mock.js');
const { findCatalogTitleByProductId, getCatalogProductPath } = await import('../src/lib/catalog-routes.js');

const publicTitles = db.getPublicTitles();
const issue14 = publicTitles.filter(title => title.cycleId === 'cycle_14');
const issue15 = publicTitles.filter(title => title.cycleId === 'cycle_15');

assert.equal(issue14.length, 85, 'PHILVIEWS #14 publishes all 85 valid sellable CSV rows');
assert.equal(issue15.length, 61, 'PHILVIEWS #15 publishes all 61 approved source submissions');

const solicitationTemplateTitle = issue15.find(title => title.coverUrl && title.publisherLogoUrl && title.interiorImageUrl && title.description);
assert.ok(solicitationTemplateTitle, 'the master solicitation proof has a representative #15 title with cover, publisher logo, interior art, and issue copy');
assert.equal(solicitationTemplateTitle.philboId, 'PHI121626-207', 'the master solicitation proof uses the correct unique stock number');

for (const title of [...issue14, ...issue15]) {
  assert.ok(title.titleId, `${title.title} has a stable title id`);
  assert.ok(title.philboId, `${title.title} has a PHILBO id`);
  assert.ok(title.coverUrl, `${title.title} has a cover image`);
  assert.ok(Number(title.msrp) > 0, `${title.title} has an orderable price`);
  assert.equal(title.status, 'Live', `${title.title} is visible to public and retailer readers`);
  assert.ok(getCatalogProductPath(title).startsWith('/philbo-catalog/p/'), `${title.title} has a website listing route`);
}

const firstIssue14 = issue14[0];
assert.equal(getCatalogProductPath(firstIssue14), '/philbo-catalog/p/phi111126201', 'the established catalog product URL is preserved');
assert.equal(findCatalogTitleByProductId(publicTitles, 'phi111126201')?.titleId, firstIssue14.titleId, 'the established compact product URL opens the correct listing');
assert.equal(findCatalogTitleByProductId(publicTitles, firstIssue14.philboId)?.titleId, firstIssue14.titleId, 'the printed PHILBO id also opens the correct listing');

const retailer = db.login('comics@metropolisbooks.com', '');
const retailerTitles = db.getTitles(retailer);
assert.equal(retailerTitles.filter(title => title.cycleId === 'cycle_14').length, 85, 'retailer ordering reads the same #14 snapshot');
assert.equal(retailerTitles.filter(title => title.cycleId === 'cycle_15').length, 61, 'retailer ordering reads the same #15 snapshot');

const order = db.placeOrder(retailer.uid, retailer.companyName, [
  { ...retailerTitles.find(title => title.titleId === issue14[0].titleId), qty: 1 },
  { ...retailerTitles.find(title => title.titleId === issue15[0].titleId), qty: 2 }
], retailer.tier || 'Tier I');

assert.equal(order.items.length, 2, 'a retailer can place one cart containing #14 and #15 catalog items');
assert.deepEqual(order.items.map(item => item.quantity || item.qty), [1, 2], 'cart quantities survive order creation');

console.log('Current PHILVIEWS #14/#15 workflow tests passed.');
