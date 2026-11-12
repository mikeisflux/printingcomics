import assert from 'node:assert/strict';
import {
  capIncentiveQuantities,
  getIncentiveEligibility,
  parseIncentiveRatio,
  validateIncentiveQuantities
} from '../src/lib/incentive-variants.js';

const regular = { titleId: 'regular', title: 'Example #1 Cover A', seriesName: 'Example', issueNumber: '1', publisherName: 'Test Press', cycleId: 'cycle' };
const special = { titleId: 'special', title: 'Example #1 Special Cover', seriesName: 'Example', issueNumber: '1', publisherName: 'Test Press', cycleId: 'cycle', incentiveRatio: '1:5' };
const unrelated = { titleId: 'other', title: 'Other #1', seriesName: 'Other', issueNumber: '1', publisherName: 'Test Press', cycleId: 'cycle' };
const titles = [regular, special, unrelated];

assert.deepEqual(parseIncentiveRatio(special), { awardQuantity: 1, qualifyingQuantity: 5, label: '1:5' });
assert.equal(getIncentiveEligibility(special, titles, { regular: 4 }).maximumQuantity, 0);
assert.equal(getIncentiveEligibility(special, titles, { regular: 5 }).maximumQuantity, 1);
assert.equal(getIncentiveEligibility(special, titles, { regular: 10 }).maximumQuantity, 2);
assert.equal(getIncentiveEligibility(special, titles, { regular: 4, other: 99 }).maximumQuantity, 0, 'unrelated copies never qualify');
assert.deepEqual(capIncentiveQuantities({ regular: 5, special: 2 }, titles), { regular: 5, special: 1 });
assert.deepEqual(capIncentiveQuantities({ regular: 4, special: 1 }, titles), { regular: 4 });
assert.equal(validateIncentiveQuantities({ regular: 5, special: 1 }, titles).length, 0);
assert.equal(validateIncentiveQuantities({ regular: 5, special: 2 }, titles).length, 1);

console.log('Incentive variant tests passed.');
