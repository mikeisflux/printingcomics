import assert from 'node:assert/strict';
import {
  addRetailerOrderLines,
  countRetailerOrderItems,
  getRetailerOrderMsrpSubtotal,
  getRetailerTierProgress,
  normalizeQuantityMap
} from '../src/lib/retailer-order.js';

assert.deepEqual(normalizeQuantityMap({ a: 2, b: 0, c: '3' }), { a: 2, c: 3 });

const merged = addRetailerOrderLines({ title_a: 2 }, [
  { title: { titleId: 'title_a' }, quantity: 3 },
  { title: { titleId: 'title_b' }, quantity: 1 }
]);
assert.deepEqual(merged, { title_a: 5, title_b: 1 });
assert.equal(countRetailerOrderItems(merged), 6);

assert.equal(getRetailerOrderMsrpSubtotal(
  { title_a: 2, title_b: 1, missing: 9 },
  [{ titleId: 'title_a', msrp: 4.99 }, { titleId: 'title_b', msrp: 7 }]
), 16.98);

assert.equal(getRetailerTierProgress(100).activeTier, 'Tier I');
assert.equal(getRetailerTierProgress(101).activeTier, 'Tier II');
assert.equal(getRetailerTierProgress(251).activeTier, 'Tier III');

console.log('Retailer ordering tests passed.');
