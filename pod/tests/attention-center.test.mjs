import assert from 'node:assert/strict';
import { buildAdminAttentionQueue, summarizeAttentionBySection } from '../src/lib/attention-center.js';

const queue = buildAdminAttentionQueue({
  users: [
    { role: 'publisher', approved: false },
    { role: 'retailer', approved: false },
    { role: 'publisher', approved: false, isPodClient: true }
  ],
  titles: [{ status: 'submitted_for_review' }],
  returns: [{ status: 'pending' }],
  orders: [{ status: 'processing' }],
  podOrders: [{ status: 'Quote Requested' }],
  inventory: [{ available: 2, reorderLevel: 3 }],
  productionOrders: [{ coverFileStatus: 'Changes Required', interiorFileStatus: 'Approved for Production' }],
  cycles: [{ reopenRequested: true }],
  unmatchedTitles: [{ titleId: 'missing-cycle' }]
});

const byKey = Object.fromEntries(queue.map(item => [item.key, item.count]));
assert.equal(byKey['publisher-applications'], 1);
assert.equal(byKey['retailer-applications'], 1);
assert.equal(byKey['pod-applications'], 1);
assert.equal(byKey['catalog-reviews'], 1);
assert.equal(byKey['catalog-cycle-exceptions'], 2);
assert.equal(byKey['production-files'], 1);
assert.equal(byKey['return-requests'], 1);
assert.equal(byKey['sales-orders'], 1);
assert.equal(byKey['pod-orders'], 1);
assert.equal(byKey['inventory-alerts'], 1);

const summary = summarizeAttentionBySection(queue);
assert.equal(summary.total, 11);
assert.equal(summary.bySection.publishers, 1);
assert.equal(summary.bySection.retailers, 1);
assert.equal(summary.bySection['pod-accounts'], 3);
assert.equal(summary.bySection.cycles, 2);

console.log('Attention center tests passed.');
