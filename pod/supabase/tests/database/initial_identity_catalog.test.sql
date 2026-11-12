begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

select has_table('public', 'organizations', 'organizations table exists');
select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'organization_memberships', 'organization memberships table exists');
select has_table('public', 'user_roles', 'user roles table exists');
select has_table('public', 'permission_overrides', 'permission overrides table exists');
select has_table('public', 'publisher_profiles', 'publisher profiles table exists');
select has_table('public', 'catalog_cycles', 'catalog cycles table exists');
select has_table('public', 'titles', 'titles table exists');
select has_table('public', 'title_files', 'title files table exists');
select has_table('public', 'title_status_history', 'title status history table exists');
select has_table('public', 'audit_events', 'audit events table exists');
select has_view('public', 'public_catalog', 'public catalog view exists');

select col_is_pk('public', 'profiles', 'user_id', 'profile user_id is the primary key');
select col_is_unique('public', 'titles', 'philbo_id', 'PHILBO ID is unique');
select has_column('public', 'titles', 'fulfillment_method', 'titles have a fulfillment method');
select has_column('public', 'title_files', 'storage_provider', 'file metadata supports multiple storage providers');

select ok((select relrowsecurity from pg_class where oid = 'public.organizations'::regclass), 'organizations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.user_roles'::regclass), 'user roles RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.publisher_profiles'::regclass), 'publisher profiles RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.catalog_cycles'::regclass), 'catalog cycles RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.titles'::regclass), 'titles RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.title_files'::regclass), 'title files RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_events'::regclass), 'audit events RLS enabled');

select function_returns(
  'private',
  'current_user_has_role',
  array['public.app_role'],
  'boolean',
  'role helper returns boolean'
);

select function_returns(
  'private',
  'set_philbo_id',
  array[]::text[],
  'trigger',
  'PHILBO ID trigger function exists'
);

select ok(
  not has_function_privilege('anon', 'private.current_user_has_role(public.app_role)', 'EXECUTE'),
  'anonymous role cannot execute private RLS helpers'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'account_status', 'UPDATE'),
  'browser users cannot update protected account status directly'
);

select ok(
  not has_column_privilege('authenticated', 'public.titles', 'philbo_id', 'UPDATE'),
  'browser users cannot update the generated PHILBO ID directly'
);

select ok(
  not has_table_privilege('anon', 'public.audit_events', 'SELECT'),
  'anonymous users cannot read audit history'
);

select * from finish();
rollback;
