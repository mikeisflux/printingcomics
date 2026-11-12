import assert from 'node:assert/strict';
import { getTitleCatalogAvailability, selectCurrentRetailerCatalogCycle } from '../src/lib/catalog-workflow.js';

const cycles = [
  {
    cycleId: 'stale_2025', catalogDate: '2025-07-01', focDate: '2025-09-01',
    status: 'Open for Retailer Ordering', retailerOpen: true, catalogPublishedAt: '2025-07-01T12:00:00Z'
  },
  {
    cycleId: 'current_2026', catalogDate: '2026-09-01', focDate: '2026-11-01',
    status: 'Open for Retailer Ordering', retailerOpen: true, catalogPublishedAt: '2026-09-01T12:00:00Z'
  }
];

const current = selectCurrentRetailerCatalogCycle(
  cycles,
  [{ titleId: 'approved_title', cycleId: 'current_2026', status: 'Approved' }],
  new Date('2026-09-01T10:00:00')
);

assert.equal(current?.cycleId, 'current_2026', 'stale historical test cycles cannot replace the active retailer catalog');
assert.equal(selectCurrentRetailerCatalogCycle([], [], new Date('2026-09-01T10:00:00')), null);

const reopenedCycle = {
  cycleId: 'reopened_2026', catalogDate: '2026-07-01', focDate: '2026-09-01', releaseDate: '2026-10-14',
  status: 'Open for Retailer Ordering', retailerOpen: true, focOverrideOpen: true
};
const reopenedTitle = {
  titleId: 'reopened_title', status: 'Live', focDate: '2026-09-01', releaseDate: '2026-10-14',
  focLocked: true, focOverrideOpen: true
};
const reopenedAvailability = getTitleCatalogAvailability(reopenedTitle, reopenedCycle, new Date('2026-09-13T12:00:00'));
assert.equal(reopenedAvailability.orderable, true, 'an explicit FOC override keeps the title orderable after its original cutoff');
assert.equal(reopenedAvailability.focLocked, false, 'an explicit FOC override removes the locked state');

console.log('Catalog workflow tests passed.');
