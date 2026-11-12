import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260916211500_incentive_variant_enforcement.sql', import.meta.url), 'utf8');
const backend = await readFile(new URL('../src/lib/backend.js', import.meta.url), 'utf8');

assert.match(migration, /create constraint trigger sales_order_items_validate_incentives/i, 'incentive enforcement runs as a deferred order constraint');
assert.match(migration, /deferrable initially deferred/i, 'the complete cart is checked rather than line insertion order');
assert.match(migration, /floor\(qualifying_quantity::numeric \/ required_quantity\).*award_quantity/is, 'allowed incentive quantity follows the configured ratio');
assert.match(migration, /raise exception '% is a %:% incentive cover/i, 'invalid incentive orders are rejected server-side');
assert.match(migration, /t\.incentive_ratio[\s\S]*t\.incentive_rules/i, 'the retailer catalog exposes the incentive configuration');
assert.match(backend, /incentiveRatio: row\.incentive_ratio/i, 'the frontend receives the live incentive ratio');

console.log('Supabase incentive enforcement contract tests passed.');
