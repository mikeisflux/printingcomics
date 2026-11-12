begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

select has_table('public', 'retailer_profiles', 'retailer profiles exist');
select has_table('public', 'sales_orders', 'sales orders exist');
select has_table('public', 'sales_order_items', 'sales order items exist');
select has_table('public', 'invoices', 'invoices exist');
select has_table('public', 'payment_transactions', 'payment transactions exist');
select has_table('public', 'publisher_purchase_orders', 'publisher purchase orders exist');
select has_table('public', 'return_requests', 'return requests exist');
select has_table('public', 'account_credits', 'account credits exist');
select has_table('public', 'inventory', 'inventory exists');
select has_table('public', 'fulfillments', 'fulfillments exist');
select has_table('public', 'portal_applications', 'portal applications exist');
select has_table('public', 'pod_customer_profiles', 'POD customer profiles exist');
select has_table('public', 'pod_orders', 'POD orders exist');
select has_table('public', 'production_jobs', 'production jobs exist');
select has_table('public', 'production_job_private', 'private production details exist');
select has_table('public', 'production_job_assignments', 'production assignments exist');
select has_table('public', 'production_files', 'production files exist');
select has_table('public', 'notifications', 'notifications exist');
select has_table('public', 'email_outbox', 'email outbox exists');

select ok((select relrowsecurity from pg_class where oid = 'public.sales_orders'::regclass), 'sales order RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.payment_transactions'::regclass), 'payment RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.return_requests'::regclass), 'return RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.pod_orders'::regclass), 'POD order RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.production_jobs'::regclass), 'production job RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.production_job_private'::regclass), 'private production RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.notifications'::regclass), 'notification RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.email_outbox'::regclass), 'email outbox RLS enabled');

select hasnt_column('public', 'production_jobs', 'quantity', 'preflight-visible jobs do not contain quantity');
select hasnt_column('public', 'production_jobs', 'sales_order_id', 'preflight-visible jobs do not contain retailer orders');
select hasnt_column('public', 'production_jobs', 'total_cents', 'preflight-visible jobs do not contain money');
select has_column('public', 'production_jobs', 'order_placed_at', 'preflight sees order date');
select has_column('public', 'production_jobs', 'production_deadline', 'preflight sees deadline');
select has_column('public', 'production_jobs', 'customer_contact_email', 'preflight sees job contact');
select has_column('public', 'production_job_private', 'quantity', 'quantity is kept in admin-only table');

select ok(not has_table_privilege('authenticated', 'public.email_outbox', 'SELECT'), 'browser users cannot read queued emails');
select ok(not has_table_privilege('authenticated', 'public.email_outbox', 'INSERT'), 'browser users cannot queue arbitrary email');
select ok(not has_table_privilege('anon', 'public.sales_orders', 'SELECT'), 'anonymous users cannot read orders');
select ok(not has_table_privilege('anon', 'public.production_jobs', 'SELECT'), 'anonymous users cannot read production jobs');
select ok(has_table_privilege('anon', 'public.portal_applications', 'INSERT'), 'anonymous visitors can submit an application');

select function_returns('private', 'current_user_is_assigned_to_job', array['uuid'], 'boolean', 'assignment helper exists');
select function_returns('private', 'protect_preflight_job_fields', array[]::text[], 'trigger', 'preflight field guard exists');

select * from finish();
rollback;

