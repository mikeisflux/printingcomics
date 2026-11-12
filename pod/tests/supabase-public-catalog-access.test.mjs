import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260916220000_public_catalog_authenticated_access.sql', import.meta.url), 'utf8');

assert.match(migration, /status in \('approved', 'scheduled', 'live'\)[\s\S]*catalog_publication_items/i, 'authenticated catalog reads require an explicitly published title');
assert.match(migration, /current_user_is_member\(publisher_organization_id\)/i, 'publishers retain access to their own non-public titles');
assert.match(migration, /current_user_has_any_role\(array\['moos', 'admin'\]/i, 'operations staff retain managed catalog access');
assert.match(migration, /grant select \(incentive_ratio, incentive_rules\) on public\.titles to anon/i, 'the public catalog may read the new public-safe incentive fields');
assert.doesNotMatch(migration, /grant select on public\.titles to anon/i, 'anonymous users never receive unrestricted title-table access');

console.log('Supabase public catalog access contract tests passed.');
