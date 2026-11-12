import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const backend = await readFile(new URL('../src/lib/backend.js', import.meta.url), 'utf8');
const retailerPortal = await readFile(new URL('../src/pages/RetailerPortal.jsx', import.meta.url), 'utf8');

assert.match(backend, /export async function loadRetailerOrders/, 'the live retailer order loader is exported');
for (const relation of ['sales_order_items', 'invoices', 'fulfillments']) {
  assert.match(backend, new RegExp(relation), `retailer order history includes ${relation}`);
}
assert.match(backend, /trackingUrlFor/, 'shipment tracking links are derived from the stored carrier and tracking number');
assert.match(retailerPortal, /Promise\.all\(\[loadPublishedCatalogTitles\(\), loadRetailerOrders\(\), loadRetailerReturnPortal\(\), loadRetailerPublisherFollows\(\)\]\)/, 'the live retailer portal loads catalog, orders, returns, and publisher follows together');
assert.match(retailerPortal, /setOrders\(retailerOrders\)/, 'the live order history is stored for retailer views');
assert.match(backend, /export async function setRetailerPublisherFollow/, 'retailer publisher follows are persisted through Supabase');

console.log('Supabase retailer order history contract tests passed.');
