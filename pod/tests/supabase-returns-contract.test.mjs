import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260916170000_retailer_returns_workflow.sql', import.meta.url), 'utf8');
const backend = await readFile(new URL('../src/lib/backend.js', import.meta.url), 'utf8');
const retailerPortal = await readFile(new URL('../src/pages/RetailerPortal.jsx', import.meta.url), 'utf8');
const adminPortal = await readFile(new URL('../src/pages/AdminPortal.jsx', import.meta.url), 'utf8');

for (const functionName of ['get_my_return_portal', 'request_my_return', 'get_admin_returns_dashboard', 'review_return_request']) {
  assert.match(migration, new RegExp(`create or replace function public\\.${functionName}\\(`, 'i'), `${functionName} is defined in the migration`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}\\(`, 'i'), `${functionName} is granted only through an explicit function grant`);
}

assert.match(migration, /account_credits_one_per_return_idx/i, 'one database credit is allowed per return');
assert.match(migration, /if matched_return\.status <> 'requested'/i, 'review is restricted to pending requests');
assert.match(migration, /sales_order\.payment_status = 'paid'/i, 'eligibility only includes paid orders');
assert.match(migration, /request\.status <> 'denied'/i, 'pending and approved quantities reserve purchased copies');
assert.match(migration, /private\.current_user_has_any_role\(array\['moos','admin'/i, 'admin review is role protected');

assert.match(backend, /export async function loadRetailerReturnPortal/, 'retailer return loader is exported');
assert.match(backend, /export async function submitRetailerReturn/, 'retailer return submission is exported');
assert.match(backend, /export async function loadAdminReturns/, 'admin return loader is exported');
assert.match(backend, /export async function reviewAdminReturn/, 'admin review operation is exported');
assert.match(retailerPortal, /user\.authProvider === 'supabase'[\s\S]*submitRetailerReturn/, 'real retailer accounts use the Supabase return operation');
assert.match(adminPortal, /user\.authProvider === 'supabase'[\s\S]*reviewAdminReturn/, 'real admin accounts use the Supabase review operation');

console.log('Supabase returns contract tests passed.');
