-- Shared, read-only source for Admin dashboard queues and navigation badges.
-- Applying this migration does not resolve, approve, archive, or otherwise
-- mutate any operational record.

begin;

create view public.admin_attention_queue
with (security_invoker = true)
as
select
  case application.applicant_type
    when 'publisher' then 'publisher-applications'
    when 'retailer' then 'retailer-applications'
    else 'pod-applications'
  end::text as attention_key,
  case application.applicant_type
    when 'publisher' then 'publishers'
    when 'retailer' then 'retailers'
    else 'pod-accounts'
  end::text as section,
  case application.applicant_type
    when 'publisher' then 'Publisher Applications'
    when 'retailer' then 'Retailer Applications'
    else 'POD Quote Requests'
  end::text as label,
  'portal_application'::text as record_type,
  application.id as record_id,
  application.company_name as record_label,
  replace(application.status::text, '_', ' ') as detail,
  'normal'::text as severity,
  application.created_at
from public.portal_applications application
where application.status in ('submitted', 'under_review')
  and private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])

union all

select
  case organization.organization_type
    when 'publisher' then 'publisher-applications'
    when 'retailer' then 'retailer-applications'
    else 'pod-applications'
  end,
  case organization.organization_type
    when 'publisher' then 'publishers'
    when 'retailer' then 'retailers'
    else 'pod-accounts'
  end,
  case organization.organization_type
    when 'publisher' then 'Publisher Accounts'
    when 'retailer' then 'Retailer Accounts'
    else 'POD Accounts'
  end,
  'organization',
  organization.id,
  organization.name,
  'pending account setup',
  'normal',
  organization.created_at
from public.organizations organization
where organization.organization_type in ('publisher', 'retailer', 'pod_customer')
  and organization.account_status = 'pending'
  and not exists (
    select 1
    from public.portal_applications application
    where application.approved_organization_id = organization.id
      and application.status in ('submitted', 'under_review')
  )
  and private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])

union all

select
  'catalog-reviews',
  'catalog',
  'New Solicitations Requiring Review',
  'title',
  title.id,
  title.title,
  'submitted for review',
  'normal',
  coalesce(title.submitted_at, title.created_at)
from public.titles title
where title.status = 'submitted_for_review'
  and private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])

union all

select
  'catalog-cycle-exceptions',
  'cycles',
  'Catalog / FOC Exceptions',
  'catalog_cycle',
  cycle.id,
  cycle.name,
  'FOC cycle reopened: ' || coalesce(nullif(trim(cycle.reopen_reason), ''), 'reason not recorded'),
  'critical',
  cycle.reopened_at
from public.catalog_cycles cycle
where cycle.status = 'retailer_ordering_open'
  and cycle.reopened_at is not null
  and cycle.reopened_at > coalesce(cycle.locked_at, '-infinity'::timestamptz)
  and private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])

union all

select
  'production-files',
  'pod-accounts',
  'Production & File Review',
  'production_job',
  job.id,
  job.job_number || ' · ' || job.project_title,
  replace(job.status::text, '_', ' '),
  case when job.status in ('awaiting_files', 'changes_required') then 'critical' else 'pod' end,
  job.created_at
from public.production_jobs job
where job.status in ('awaiting_files', 'ready_for_review', 'in_review', 'changes_required')
  and private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])

union all

select
  'pod-orders',
  'pod-accounts',
  'POD Orders & Quotes',
  'pod_order',
  pod_order.id,
  pod_order.order_number || ' · ' || pod_order.project_title,
  replace(pod_order.status::text, '_', ' '),
  'pod',
  pod_order.created_at
from public.pod_orders pod_order
where pod_order.status in ('quote_requested', 'awaiting_files', 'preflight')
  and private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])

union all

select
  'return-requests',
  'returns',
  'Return Requests',
  'return_request',
  return_request.id,
  return_request.return_number,
  'awaiting approval or denial',
  'normal',
  return_request.requested_at
from public.return_requests return_request
where return_request.status = 'requested'
  and private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])

union all

select
  'sales-orders',
  'orders',
  'Retailer Sales Orders',
  'sales_order',
  sales_order.id,
  sales_order.order_number,
  replace(sales_order.status::text, '_', ' '),
  'normal',
  sales_order.created_at
from public.sales_orders sales_order
where sales_order.status in ('submitted', 'paid', 'processing', 'partially_fulfilled')
  and private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])

union all

select
  'inventory-alerts',
  'inventory',
  'Inventory Alerts',
  'inventory',
  inventory.title_id,
  coalesce(title.philbo_id || ' · ', '') || title.title,
  (inventory.on_hand_quantity - inventory.reserved_quantity)::text || ' available; reorder point ' || inventory.reorder_point::text,
  'critical',
  inventory.updated_at
from public.inventory inventory
join public.titles title on title.id = inventory.title_id
where inventory.on_hand_quantity - inventory.reserved_quantity <= inventory.reorder_point
  and private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]);

revoke all on public.admin_attention_queue from public, anon;
grant select on public.admin_attention_queue to authenticated;

comment on view public.admin_attention_queue is
  'Admin-only unresolved operational records used by Dashboard queues and navigation attention badges. Rows disappear when the underlying record is resolved.';

commit;
