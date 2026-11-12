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

const retailer = db.loginLocalDemo('retailer', 'Demo-retail26!');
const titles = JSON.parse(localStorage.getItem('philbo_titles'));
assert.ok(titles.length >= 2, 'return tests require at least two catalog titles');
const [firstTitle, secondTitle] = titles;

const users = JSON.parse(localStorage.getItem('philbo_users'));
const retailerIndex = users.findIndex(user => user.uid === retailer.uid);
users[retailerIndex].returnsUsed = 0;
users[retailerIndex].returnCreditBalance = 0;
localStorage.setItem('philbo_users', JSON.stringify(users));
sessionStorage.setItem('philbo_current_user', JSON.stringify({ ...retailer, returnsUsed: 0, returnCreditBalance: 0 }));
localStorage.setItem('philbo_returns', '[]');
localStorage.setItem('philbo_orders', JSON.stringify([{
  orderId: 'SO-RETURN-TEST',
  retailerId: retailer.uid,
  retailerName: retailer.companyName,
  paymentStatus: 'paid',
  status: 'processed',
  date: '2026-09-10T12:00:00.000Z',
  items: [
    { titleId: firstTitle.titleId, titleName: firstTitle.title, qty: 3, wholesalePrice: 3.25, msrp: 5.99, publisherId: firstTitle.publisherId },
    { titleId: secondTitle.titleId, titleName: secondTitle.title, qty: 5, wholesalePrice: 2.75, msrp: 4.99, publisherId: secondTitle.publisherId }
  ]
}]));

firstTitle.focLocked = true;
localStorage.setItem('philbo_titles', JSON.stringify(titles));

const eligible = db.getEligibleReturnItems(retailer.uid);
assert.equal(eligible.length, 2, 'paid order lines are return eligible');
assert.equal(eligible[0].availableQty + eligible[1].availableQty, 8, 'eligible quantity matches purchased quantity');

assert.throws(
  () => db.requestReturn(retailer.uid, retailer.companyName, 'SO-RETURN-TEST', 'not-purchased', 1, 'Not actually purchased'),
  /not eligible/i,
  'an unpurchased book cannot be returned'
);

const firstRequest = db.requestReturn(retailer.uid, retailer.companyName, 'SO-RETURN-TEST', firstTitle.titleId, '2', 'Damaged copies');
assert.equal(firstRequest.qty, 2, 'string form quantities are normalized to numbers');
assert.equal(firstRequest.requestedCredit, 6.5, 'credit uses the original order wholesale price');
assert.equal(db.getReturnAllowanceSummary(retailer.uid).pending, 2, 'pending quantities reserve return allowance');
assert.equal(db.getEligibleReturnItems(retailer.uid).find(item => item.titleId === firstTitle.titleId).availableQty, 1, 'pending requests reserve purchased copies');

assert.throws(
  () => db.requestReturn(retailer.uid, retailer.companyName, 'SO-RETURN-TEST', secondTitle.titleId, 3, 'Over allowance'),
  /return limit exceeded/i,
  'pending requests are included in allowance enforcement'
);

const rejectedRequest = db.requestReturn(retailer.uid, retailer.companyName, 'SO-RETURN-TEST', firstTitle.titleId, 1, 'Customer damage');
assert.equal(db.getReturnAllowanceSummary(retailer.uid).pending, 3, 'multiple pending requests reserve allowance together');

const otherRetailer = JSON.parse(localStorage.getItem('philbo_users')).find(user => user.uid === 'ret2');
sessionStorage.setItem('philbo_current_user', JSON.stringify(otherRetailer));
assert.throws(() => db.getEligibleReturnItems(retailer.uid), /only for their own account/i, 'retailers cannot inspect another account eligibility');
assert.deepEqual(db.getReturns(), [], 'retailers cannot retrieve another retailer return history');

const admin = db.loginLocalDemo('admin', 'Mo-2026!');
const approved = db.approveReturn(firstRequest.returnId);
assert.equal(approved.status, 'approved', 'admin can approve a pending request');
assert.equal(approved.approvedCredit, 6.5, 'approved credit matches the captured request amount');
let updatedRetailer = JSON.parse(localStorage.getItem('philbo_users')).find(user => user.uid === retailer.uid);
assert.equal(updatedRetailer.returnsUsed, 2, 'approval consumes allowance exactly once');
assert.equal(updatedRetailer.returnCreditBalance, 6.5, 'approval adds the exact original-order credit');
assert.throws(() => db.approveReturn(firstRequest.returnId), /already approved/i, 'duplicate approval is rejected');
updatedRetailer = JSON.parse(localStorage.getItem('philbo_users')).find(user => user.uid === retailer.uid);
assert.equal(updatedRetailer.returnCreditBalance, 6.5, 'duplicate approval cannot issue duplicate credit');

const rejected = db.rejectReturn(rejectedRequest.returnId);
assert.equal(rejected.status, 'rejected', 'admin can reject a pending request');
assert.throws(() => db.rejectReturn(rejectedRequest.returnId), /already rejected/i, 'duplicate rejection is rejected');

sessionStorage.setItem('philbo_current_user', JSON.stringify(updatedRetailer));
const postReviewAllowance = db.getReturnAllowanceSummary(retailer.uid);
assert.deepEqual(postReviewAllowance, { tier: 'Tier II', maximum: 4, approved: 2, pending: 0, remaining: 2 }, 'approval and rejection release the correct final allowance');
assert.equal(db.getEligibleReturnItems(retailer.uid).find(item => item.titleId === firstTitle.titleId).availableQty, 1, 'rejected copies become eligible again while approved copies remain consumed');
assert.equal(db.getReturns().length, 2, 'retailer sees its approved and rejected return history');
assert.equal(admin.role, 'admin', 'admin review was performed through an authorized admin session');

console.log('Returns workflow tests passed.');
