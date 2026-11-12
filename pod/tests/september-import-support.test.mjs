import assert from 'node:assert/strict';
import fs from 'node:fs';

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

const { db, INVENTORY_COMMISSION_RATE } = await import('../src/firebase-mock.js');
const { validatePageCountForFormat } = await import('../src/lib/title-validation.js');

const publisher = db.loginLocalDemo('publisher', 'Demo-pub26!');
const acknowledged = db.applyInventoryFulfillmentCommission(publisher.uid, publisher.companyName);
assert.equal(INVENTORY_COMMISSION_RATE, 0.15, 'Inventory has one canonical 15% rate');
assert.equal(acknowledged.commissionRate, 0.15, 'Inventory acknowledgement applies 15% to the Publisher account');
assert.equal(acknowledged.commissionHistory.at(-1).newRate, 0.15, 'commission history records the actual 15% rate');
assert.match(acknowledged.commissionHistory.at(-1).reason, /acknowledged.*15%/i, 'history records the acknowledgement and rate');
assert.equal(validatePageCountForFormat('Standard Floppy Comic', 26), 'Standard Floppy page count must be divisible by 4.', 'invalid Standard Floppy pages are blocked');
assert.equal(validatePageCountForFormat('Standard Floppy Comic', 28), '', '28-page Standard Floppy is valid');
assert.equal(validatePageCountForFormat('Single Issue', 32), '', 'Single Issue uses the same divisible-by-four floppy rule');
assert.equal(validatePageCountForFormat('Hardcover (HC)', 26), '', 'non-floppy formats are not silently forced to a floppy rule');

const enumMigration = fs.readFileSync('supabase/migrations/20260827090000_add_legacy_tbd_fulfillment.sql', 'utf8');
const supportMigration = fs.readFileSync('supabase/migrations/20260827091000_september_legacy_import_support.sql', 'utf8');
const publisherDryRun = fs.readFileSync('docs/import-previews/PHILBO_SEPT1_PUBLISHER_CREATION_DRY_RUN.sql', 'utf8');

assert.match(enumMigration, /add value if not exists 'tbd'/i, 'TBD enum support is isolated in its own migration');
assert.match(supportMigration, /import_batch_id is not null and philbo_id ~ '\^PHI121626-\[0-9\]\{3\}\$'/, 'three-digit Stock Numbers are allowed only for an import batch');
assert.match(supportMigration, /legacy_series_code_exception/, 'Series Code exception is explicitly marked as legacy');
assert.match(supportMigration, /legacy_original_barcode/, 'original barcode provenance is preserved');
assert.match(supportMigration, /page_count % 4 = 0/, 'Standard Floppy page validation remains divisible by four');
assert.match(supportMigration, /commission_rate = 0\.15/, 'production Inventory acknowledgement stores 15%');
assert.match(supportMigration, /calculate_publisher_payout/, 'production payout calculation uses the stored Publisher rate');

const proposedPublisherRows = [...publisherDryRun.matchAll(/^\s*\('[0-9a-f-]{36}', 'publisher',/gim)];
assert.equal(proposedPublisherRows.length, 17, 'dry run proposes exactly 17 Publisher organizations');
assert.match(publisherDryRun, /rollback;[\s\S]*PASSED — ROLLED BACK/i, 'Publisher creation dry run rolls back before reporting its result');
assert.match(publisherDryRun, /persisted_proposed_publisher_count/i, 'dry run verifies that no proposed Publisher rows persisted');
assert.doesNotMatch(publisherDryRun, /\bcommit\s*;/i, 'Publisher creation preview cannot commit');

console.log('September import support tests passed.');
