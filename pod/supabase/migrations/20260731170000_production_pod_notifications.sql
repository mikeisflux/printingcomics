-- POD projects, tightly scoped preflight work, portal applications, and notifications.

begin;

create type public.application_status as enum ('submitted', 'under_review', 'approved', 'declined', 'withdrawn');
create type public.pod_order_status as enum ('draft', 'quote_requested', 'quoted', 'awaiting_files', 'preflight', 'approved_for_print', 'in_production', 'shipped', 'completed', 'cancelled');
create type public.production_job_status as enum ('awaiting_files', 'ready_for_review', 'in_review', 'changes_required', 'approved', 'ready_to_print', 'closed');
create type public.notification_status as enum ('unread', 'read', 'archived');

create sequence public.pod_order_number_seq start 1001;
create sequence public.production_job_number_seq start 1001;

create table public.portal_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_type public.organization_type not null check (applicant_type in ('publisher', 'retailer', 'pod_customer')),
  applicant_user_id uuid references auth.users(id) on delete set null,
  email text not null,
  company_name text not null check (length(trim(company_name)) > 0),
  contact_first_name text,
  contact_last_name text,
  phone text,
  website text,
  application_data jsonb not null default '{}'::jsonb,
  status public.application_status not null default 'submitted',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  approved_organization_id uuid references public.organizations(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pod_customer_profiles (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  customer_type text,
  expected_quantity_range text,
  resale_certificate_object_path text,
  resale_certificate_status text not null default 'not_submitted' check (resale_certificate_status in ('not_submitted','pending','approved','rejected','expired')),
  tax_exempt boolean not null default false,
  default_shipping_address_id uuid references public.addresses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pod_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('POD-' || lpad(nextval('public.pod_order_number_seq')::text, 6, '0')),
  customer_organization_id uuid not null references public.organizations(id) on delete restrict,
  placed_by uuid not null references auth.users(id) on delete restrict,
  project_title text not null check (length(trim(project_title)) > 0),
  product_type text not null check (product_type in ('self_cover_comic','heavy_cover_comic','art_print')),
  quantity integer not null check (quantity > 0),
  specifications jsonb not null default '{}'::jsonb,
  philbo_pod_logo_discount boolean not null default false,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  status public.pod_order_status not null default 'draft',
  requested_deadline date,
  quoted_at timestamptz,
  placed_at timestamptz,
  customer_notes text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not philbo_pod_logo_discount or discount_cents >= round(subtotal_cents * 0.05)),
  check (status = 'draft' or placed_at is not null)
);

-- This table intentionally contains no quantity, prices, retailer identity,
-- payment data, or internal order notes. It is the only job table preflight sees.
create table public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique default ('PF-' || lpad(nextval('public.production_job_number_seq')::text, 6, '0')),
  customer_organization_id uuid not null references public.organizations(id) on delete restrict,
  title_id uuid references public.titles(id) on delete restrict,
  source_type text not null check (source_type in ('catalog_order', 'pod_order')),
  project_title text not null,
  philbo_id text,
  order_placed_at timestamptz not null,
  production_deadline date not null,
  customer_company_name text not null,
  customer_contact_name text,
  customer_contact_email text,
  customer_contact_phone text,
  status public.production_job_status not null default 'awaiting_files',
  cover_file_status public.file_review_status not null default 'uploaded',
  interior_file_status public.file_review_status not null default 'uploaded',
  review_notes text,
  approved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sensitive source/order information is physically separated from the
-- preflight-visible job record. Only MO.OS/Admin can read this table.
create table public.production_job_private (
  production_job_id uuid primary key references public.production_jobs(id) on delete cascade,
  sales_order_id uuid references public.sales_orders(id) on delete restrict,
  pod_order_id uuid references public.pod_orders(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  internal_notes text,
  created_at timestamptz not null default now(),
  check ((sales_order_id is not null)::integer + (pod_order_id is not null)::integer = 1)
);

create table public.production_job_assignments (
  production_job_id uuid not null references public.production_jobs(id) on delete cascade,
  assigned_user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  is_active boolean not null default true,
  primary key (production_job_id, assigned_user_id)
);

create table public.production_files (
  id uuid primary key default gen_random_uuid(),
  production_job_id uuid not null references public.production_jobs(id) on delete cascade,
  file_type text not null check (file_type in ('cover','interior','proof','reference','other')),
  object_path text not null unique,
  original_filename text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  version integer not null default 1 check (version > 0),
  review_status public.file_review_status not null default 'uploaded',
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (production_job_id, file_type, version)
);

create table public.production_job_events (
  id uuid primary key default gen_random_uuid(),
  production_job_id uuid not null references public.production_jobs(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  destination text,
  record_type text,
  record_id text,
  status public.notification_status not null default 'unread',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  archived_at timestamptz
);

-- Durable queue for a server-side email worker. Browser users cannot read or
-- write it; a Supabase Edge Function uses the service role to deliver messages.
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  recipient_email text not null,
  template_data jsonb not null default '{}'::jsonb,
  related_record_type text,
  related_record_id text,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index portal_applications_status_idx on public.portal_applications(status, created_at);
create index pod_orders_customer_idx on public.pod_orders(customer_organization_id, created_at desc);
create index production_jobs_status_idx on public.production_jobs(status, production_deadline);
create index production_assignments_user_idx on public.production_job_assignments(assigned_user_id) where is_active;
create index production_files_job_idx on public.production_files(production_job_id, file_type);
create index notifications_recipient_idx on public.notifications(recipient_user_id, status, created_at desc);
create index email_outbox_delivery_idx on public.email_outbox(status, next_attempt_at) where status in ('queued','failed');

create function private.current_user_is_assigned_to_job(requested_job_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.production_job_assignments
    where production_job_id = requested_job_id
      and assigned_user_id = (select auth.uid())
      and is_active
  );
$$;

create function private.queue_application_review_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status and new.status in ('approved','declined') then
    insert into public.email_outbox (template_key, recipient_email, template_data, related_record_type, related_record_id)
    values ('application_' || new.status::text, new.email, jsonb_build_object('company_name', new.company_name), 'portal_application', new.id::text);
  end if;
  return new;
end;
$$;

create function private.queue_return_review_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient text;
begin
  if old.status is distinct from new.status and new.status in ('approved','denied','credited') then
    select p.email into recipient from public.profiles p where p.user_id = new.requested_by;
    if recipient is not null then
      insert into public.email_outbox (template_key, recipient_email, template_data, related_record_type, related_record_id)
      values ('return_' || new.status::text, recipient, jsonb_build_object('return_number', new.return_number, 'credit_cents', new.approved_credit_cents), 'return_request', new.id::text);
    end if;
  end if;
  return new;
end;
$$;

create trigger portal_applications_set_updated_at before update on public.portal_applications for each row execute function private.set_updated_at();
create trigger pod_customer_profiles_set_updated_at before update on public.pod_customer_profiles for each row execute function private.set_updated_at();
create trigger pod_orders_set_updated_at before update on public.pod_orders for each row execute function private.set_updated_at();
create trigger production_jobs_set_updated_at before update on public.production_jobs for each row execute function private.set_updated_at();
create trigger production_files_set_updated_at before update on public.production_files for each row execute function private.set_updated_at();
create trigger email_outbox_set_updated_at before update on public.email_outbox for each row execute function private.set_updated_at();
create trigger portal_application_reviewed after update of status on public.portal_applications for each row execute function private.queue_application_review_notification();
create trigger return_request_reviewed after update of status on public.return_requests for each row execute function private.queue_return_review_notification();

alter table public.portal_applications enable row level security;
alter table public.pod_customer_profiles enable row level security;
alter table public.pod_orders enable row level security;
alter table public.production_jobs enable row level security;
alter table public.production_job_private enable row level security;
alter table public.production_job_assignments enable row level security;
alter table public.production_files enable row level security;
alter table public.production_job_events enable row level security;
alter table public.notifications enable row level security;
alter table public.email_outbox enable row level security;

create policy applications_public_submit on public.portal_applications for insert to anon, authenticated
with check (status = 'submitted' and reviewed_by is null and approved_organization_id is null and (applicant_user_id is null or applicant_user_id = (select auth.uid())));
create policy applications_own_read on public.portal_applications for select to authenticated
using (applicant_user_id = (select auth.uid()));
create policy applications_admin_manage on public.portal_applications for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

create policy pod_profiles_scoped_read on public.pod_customer_profiles for select to authenticated
using (private.current_user_is_member(organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy pod_profiles_admin_manage on public.pod_customer_profiles for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

create policy pod_orders_scoped_read on public.pod_orders for select to authenticated
using (private.current_user_is_member(customer_organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy pod_orders_customer_insert on public.pod_orders for insert to authenticated
with check (private.current_user_is_member(customer_organization_id) and placed_by = (select auth.uid()) and status = 'draft');
create policy pod_orders_customer_update on public.pod_orders for update to authenticated
using (private.current_user_is_member(customer_organization_id) and status = 'draft')
with check (private.current_user_is_member(customer_organization_id) and placed_by = (select auth.uid()) and status in ('draft','quote_requested'));
create policy pod_orders_admin_manage on public.pod_orders for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

create policy production_jobs_scoped_read on public.production_jobs for select to authenticated
using (private.current_user_is_member(customer_organization_id) or private.current_user_is_assigned_to_job(id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy production_jobs_preflight_update on public.production_jobs for update to authenticated
using (private.current_user_is_assigned_to_job(id) and private.current_user_has_role('preflight'))
with check (private.current_user_is_assigned_to_job(id) and private.current_user_has_role('preflight'));
create policy production_jobs_admin_manage on public.production_jobs for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy production_job_private_admin_only on public.production_job_private for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy production_assignments_assignee_read on public.production_job_assignments for select to authenticated
using (assigned_user_id = (select auth.uid()) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy production_assignments_admin_manage on public.production_job_assignments for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy production_files_scoped_read on public.production_files for select to authenticated
using (exists (select 1 from public.production_jobs j where j.id = production_job_id and (private.current_user_is_member(j.customer_organization_id) or private.current_user_is_assigned_to_job(j.id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]))));
create policy production_files_customer_insert on public.production_files for insert to authenticated
with check (uploaded_by = (select auth.uid()) and exists (select 1 from public.production_jobs j where j.id = production_job_id and private.current_user_is_member(j.customer_organization_id)));
create policy production_files_preflight_update on public.production_files for update to authenticated
using (private.current_user_is_assigned_to_job(production_job_id) and private.current_user_has_role('preflight'))
with check (private.current_user_is_assigned_to_job(production_job_id) and private.current_user_has_role('preflight'));
create policy production_files_admin_manage on public.production_files for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy production_events_scoped_read on public.production_job_events for select to authenticated
using (exists (select 1 from public.production_jobs j where j.id = production_job_id and (private.current_user_is_member(j.customer_organization_id) or private.current_user_is_assigned_to_job(j.id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]))));
create policy production_events_staff_insert on public.production_job_events for insert to authenticated
with check (actor_user_id = (select auth.uid()) and (private.current_user_is_assigned_to_job(production_job_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[])));

create policy notifications_own_read on public.notifications for select to authenticated using (recipient_user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated using (recipient_user_id = (select auth.uid())) with check (recipient_user_id = (select auth.uid()));
create policy notifications_admin_manage on public.notifications for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

revoke all on public.portal_applications, public.pod_customer_profiles, public.pod_orders, public.production_jobs,
  public.production_job_private, public.production_job_assignments, public.production_files, public.production_job_events,
  public.notifications, public.email_outbox from anon, authenticated;
grant insert on public.portal_applications to anon;
grant select, insert on public.portal_applications to authenticated;
grant update, delete on public.portal_applications to authenticated;
grant select, insert, update, delete on public.pod_customer_profiles, public.pod_orders, public.production_jobs,
  public.production_job_private, public.production_job_assignments, public.production_files, public.production_job_events,
  public.notifications to authenticated;
grant usage, select on sequence public.pod_order_number_seq, public.production_job_number_seq to authenticated;

revoke all on function private.current_user_is_assigned_to_job(uuid) from public;
grant execute on function private.current_user_is_assigned_to_job(uuid) to authenticated;
revoke all on function private.queue_application_review_notification() from public;
revoke all on function private.queue_return_review_notification() from public;

commit;
