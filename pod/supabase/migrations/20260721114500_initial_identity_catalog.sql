-- Philbo production foundation: identity, organizations, catalog, and audit.
-- Business rules are defined in PHILBO_MASTER_BRIEF.md.
-- Initial deployment target: the Philbo staging Supabase project.

begin;

create schema if not exists private;
revoke all on schema private from public;

create type public.organization_type as enum ('philbo', 'publisher', 'retailer');
create type public.account_status as enum ('pending', 'active', 'suspended', 'locked', 'revoked', 'archived');
create type public.app_role as enum ('moos', 'admin', 'preflight', 'publisher', 'retailer');
create type public.catalog_cycle_status as enum (
  'upcoming',
  'publisher_submission_open',
  'retailer_ordering_open',
  'foc_locked',
  'released',
  'archived'
);
create type public.title_status as enum (
  'draft',
  'submitted_for_review',
  'changes_requested',
  'approved',
  'scheduled',
  'live',
  'archived'
);
create type public.fulfillment_method as enum ('publisher_fulfilled', 'philbo_pod');
create type public.title_file_type as enum (
  'downloadable_cover',
  'cover_print_pdf',
  'interior_print_pdf',
  'marketing_image',
  'additional_asset'
);
create type public.file_review_status as enum (
  'uploaded',
  'under_review',
  'changes_required',
  'approved',
  'superseded'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  organization_type public.organization_type not null,
  name text not null check (length(trim(name)) > 0),
  slug text unique,
  website text,
  account_status public.account_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  first_name text,
  last_name text,
  display_name text,
  account_status public.account_status not null default 'pending',
  invitation_accepted_at timestamptz,
  sessions_revoked_after timestamptz,
  notification_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_title text,
  is_primary_contact boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  is_active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.permission_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_code text not null check (length(trim(permission_code)) > 0),
  enabled boolean not null,
  reason text not null check (length(trim(reason)) > 0),
  granted_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, permission_code)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_type text not null check (contact_type in (
    'owner', 'primary', 'editorial', 'production', 'accounting',
    'fulfillment', 'marketing', 'legal', 'printer', 'other'
  )),
  first_name text,
  last_name text,
  title text,
  email text,
  mobile_phone text,
  office_phone text,
  preferred_contact_method text,
  preferred_contact_time text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  address_type text not null check (address_type in ('mailing', 'shipping', 'printer', 'billing', 'other')),
  contact_name text,
  company_name text,
  line_1 text not null,
  line_2 text,
  city text not null,
  state_province text not null,
  postal_code text not null,
  country text not null default 'US',
  phone text,
  instructions text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.publisher_profiles (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  legal_business_name text,
  tax_identifier_ciphertext text,
  commission_rate numeric(5, 4) check (commission_rate is null or commission_rate in (0.05, 0.10)),
  preferred_payment_method text,
  payable_to_name text,
  payment_notes text,
  publisher_logo_object_path text,
  default_fulfillment_method public.fulfillment_method,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalog_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  catalog_date date not null,
  foc_date date not null,
  in_store_date date not null,
  status public.catalog_cycle_status not null default 'upcoming',
  publisher_submissions_open boolean not null default false,
  retailer_ordering_open boolean not null default false,
  retailer_download_enabled boolean not null default false,
  admin_notes text,
  locked_at timestamptz,
  locked_by uuid references auth.users(id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (catalog_date <= foc_date),
  check (foc_date <= in_store_date)
);

create table public.titles (
  id uuid primary key default gen_random_uuid(),
  publisher_organization_id uuid not null references public.organizations(id) on delete restrict,
  catalog_cycle_id uuid references public.catalog_cycles(id) on delete restrict,
  philbo_id text unique,
  barcode text,
  title text not null check (length(trim(title)) > 0),
  series_name text,
  issue_number text,
  variant_number text,
  cover_description text,
  language text not null default 'English',
  book_format text,
  series_type text,
  series_code text,
  series_frequency text,
  age_rating text,
  msrp_cents integer check (msrp_cents is null or msrp_cents >= 0),
  brief_synopsis text,
  full_description text,
  writer text,
  artist text,
  cover_artist text,
  bisac_1 text,
  bisac_2 text,
  bisac_3 text,
  page_count integer check (page_count is null or page_count > 0),
  color_mode text,
  width_inches numeric(7, 3) check (width_inches is null or width_inches > 0),
  height_inches numeric(7, 3) check (height_inches is null or height_inches > 0),
  weight_ounces numeric(9, 3) check (weight_ounces is null or weight_ounces >= 0),
  is_reprint boolean not null default false,
  printing_number integer check (printing_number is null or printing_number > 0),
  available_for_reorder boolean not null default false,
  trailer_url text,
  status public.title_status not null default 'draft',
  fulfillment_method public.fulfillment_method,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  scheduled_at timestamptz,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (barcode is null or (barcode ~ '^[0-9]+$' and length(barcode) >= 5)),
  check (series_code is null or series_code = upper(replace(series_code, ' ', ''))),
  check (philbo_id is null or philbo_id ~ '^[^[:space:]]+-[0-9]{5}$'),
  check (status = 'draft' or catalog_cycle_id is not null),
  check (status = 'draft' or (series_code is not null and barcode is not null and philbo_id is not null)),
  check (status not in ('approved', 'scheduled', 'live') or fulfillment_method is not null),
  check (status not in ('approved', 'scheduled', 'live') or approved_at is not null),
  check (status <> 'live' or (approved_at is not null and published_at is not null))
);

create table public.title_files (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.titles(id) on delete restrict,
  file_type public.title_file_type not null,
  storage_provider text not null default 'supabase' check (storage_provider in ('supabase', 'google_drive')),
  object_path text not null,
  provider_file_id text,
  original_filename text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  checksum_sha256 text,
  version integer not null default 1 check (version > 0),
  review_status public.file_review_status not null default 'uploaded',
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  supersedes_file_id uuid references public.title_files(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title_id, file_type, version),
  unique (storage_provider, object_path)
);

create table public.title_status_history (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.titles(id) on delete restrict,
  from_status public.title_status,
  to_status public.title_status not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role public.app_role,
  action text not null check (length(trim(action)) > 0),
  record_type text not null check (length(trim(record_type)) > 0),
  record_id text not null,
  previous_value jsonb,
  new_value jsonb,
  notes text,
  session_id text,
  ip_address inet
);

create index organization_memberships_user_id_idx on public.organization_memberships(user_id) where is_active;
create index organization_memberships_organization_id_idx on public.organization_memberships(organization_id) where is_active;
create index user_roles_user_id_idx on public.user_roles(user_id) where is_active;
create index contacts_organization_id_idx on public.contacts(organization_id);
create index addresses_organization_id_idx on public.addresses(organization_id);
create index catalog_cycles_dates_idx on public.catalog_cycles(catalog_date, foc_date, in_store_date);
create index titles_publisher_idx on public.titles(publisher_organization_id);
create index titles_cycle_idx on public.titles(catalog_cycle_id);
create index titles_live_idx on public.titles(catalog_cycle_id, published_at) where status = 'live';
create index title_files_title_idx on public.title_files(title_id);
create index title_status_history_title_idx on public.title_status_history(title_id, created_at desc);
create index audit_events_record_idx on public.audit_events(record_type, record_id, occurred_at desc);
create index audit_events_actor_idx on public.audit_events(actor_user_id, occurred_at desc);

create function private.current_user_has_role(requested_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = requested_role
      and is_active
  );
$$;

create function private.current_user_has_any_role(requested_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = any(requested_roles)
      and is_active
  );
$$;

create function private.current_user_is_member(requested_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships
    where user_id = (select auth.uid())
      and organization_id = requested_organization_id
      and is_active
  );
$$;

create function private.publisher_can_edit_title(requested_title_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.titles t
    left join public.catalog_cycles c on c.id = t.catalog_cycle_id
    where t.id = requested_title_id
      and private.current_user_is_member(t.publisher_organization_id)
      and t.status in ('draft', 'changes_requested')
      and (t.catalog_cycle_id is null or (c.publisher_submissions_open and c.status <> 'foc_locked'))
  );
$$;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function private.set_philbo_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.series_code is not null then
    new.series_code = upper(regexp_replace(new.series_code, '\s+', '', 'g'));
  end if;

  if new.series_code is not null and new.barcode is not null then
    if length(new.barcode) < 5 or new.barcode !~ '^[0-9]+$' then
      raise exception 'UPC / barcode must contain at least five digits.';
    end if;
    new.philbo_id = new.series_code || '-' || right(new.barcode, 5);
  elsif new.status <> 'draft' then
    raise exception 'Series Code and UPC / barcode are required before title submission.';
  else
    new.philbo_id = null;
  end if;

  return new;
end;
$$;

create function private.record_title_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.title_status_history (
      title_id,
      from_status,
      to_status,
      actor_user_id
    ) values (
      new.id,
      null,
      new.status,
      auth.uid()
    );
  elsif old.status is distinct from new.status then
    insert into public.title_status_history (
      title_id,
      from_status,
      to_status,
      actor_user_id
    ) values (
      new.id,
      old.status,
      new.status,
      auth.uid()
    );
  end if;
  return new;
end;
$$;

create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, first_name, last_name, display_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), nullif(new.email, ''))
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create function private.protect_final_moos_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  removing_active_moos boolean := false;
begin
  if old.role = 'moos' and old.is_active then
    if tg_op = 'DELETE' then
      removing_active_moos := true;
    elsif new.role <> 'moos' or not new.is_active then
      removing_active_moos := true;
    end if;

    if removing_active_moos then
      if not exists (
        select 1
        from public.user_roles ur
        join public.profiles p on p.user_id = ur.user_id
        where ur.role = 'moos'
          and ur.is_active
          and p.account_status = 'active'
          and ur.id <> old.id
      ) then
        raise exception 'Philbo must retain at least one active MO.OS account.';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create function private.protect_final_moos_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.account_status = 'active' and new.account_status <> 'active'
    and exists (
      select 1 from public.user_roles
      where user_id = old.user_id and role = 'moos' and is_active
    )
    and not exists (
      select 1
      from public.user_roles ur
      join public.profiles p on p.user_id = ur.user_id
      where ur.role = 'moos'
        and ur.is_active
        and p.account_status = 'active'
        and ur.user_id <> old.user_id
    )
  then
    raise exception 'Philbo must retain at least one active MO.OS account.';
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create trigger protect_final_moos_role_trigger
before update or delete on public.user_roles
for each row execute function private.protect_final_moos_role();

create trigger protect_final_moos_profile_trigger
before update of account_status on public.profiles
for each row execute function private.protect_final_moos_profile();

create trigger organizations_set_updated_at before update on public.organizations
for each row execute function private.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger organization_memberships_set_updated_at before update on public.organization_memberships
for each row execute function private.set_updated_at();
create trigger user_roles_set_updated_at before update on public.user_roles
for each row execute function private.set_updated_at();
create trigger permission_overrides_set_updated_at before update on public.permission_overrides
for each row execute function private.set_updated_at();
create trigger contacts_set_updated_at before update on public.contacts
for each row execute function private.set_updated_at();
create trigger addresses_set_updated_at before update on public.addresses
for each row execute function private.set_updated_at();
create trigger publisher_profiles_set_updated_at before update on public.publisher_profiles
for each row execute function private.set_updated_at();
create trigger catalog_cycles_set_updated_at before update on public.catalog_cycles
for each row execute function private.set_updated_at();
create trigger titles_set_updated_at before update on public.titles
for each row execute function private.set_updated_at();
create trigger title_files_set_updated_at before update on public.title_files
for each row execute function private.set_updated_at();
create trigger titles_set_philbo_id before insert or update of series_code, barcode, status on public.titles
for each row execute function private.set_philbo_id();
create trigger titles_record_status_change after insert or update of status on public.titles
for each row execute function private.record_title_status_change();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.user_roles enable row level security;
alter table public.permission_overrides enable row level security;
alter table public.contacts enable row level security;
alter table public.addresses enable row level security;
alter table public.publisher_profiles enable row level security;
alter table public.catalog_cycles enable row level security;
alter table public.titles enable row level security;
alter table public.title_files enable row level security;
alter table public.title_status_history enable row level security;
alter table public.audit_events enable row level security;

create policy organizations_public_publisher_read on public.organizations
for select to anon
using (
  organization_type = 'publisher'
  and account_status = 'active'
  and exists (
    select 1 from public.titles
    where publisher_organization_id = organizations.id and status = 'live'
  )
);

create policy organizations_authenticated_read on public.organizations
for select to authenticated
using (
  private.current_user_is_member(id)
  or private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
  or (organization_type = 'publisher' and account_status = 'active' and exists (
    select 1 from public.titles where publisher_organization_id = organizations.id and status = 'live'
  ))
);

create policy organizations_admin_manage on public.organizations
for all to authenticated
using (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]))
with check (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]));

create policy profiles_own_or_admin_read on public.profiles
for select to authenticated
using (
  user_id = (select auth.uid())
  or private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
);

create policy profiles_own_update on public.profiles
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy profiles_admin_manage on public.profiles
for all to authenticated
using (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]))
with check (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]));

create policy memberships_own_or_admin_read on public.organization_memberships
for select to authenticated
using (
  user_id = (select auth.uid())
  or private.current_user_is_member(organization_id)
  or private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
);

create policy memberships_admin_manage on public.organization_memberships
for all to authenticated
using (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]))
with check (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]));

create policy roles_own_or_moos_read on public.user_roles
for select to authenticated
using (user_id = (select auth.uid()) or private.current_user_has_role('moos'));

create policy roles_moos_manage on public.user_roles
for all to authenticated
using (private.current_user_has_role('moos'))
with check (private.current_user_has_role('moos'));

create policy permission_overrides_own_or_moos_read on public.permission_overrides
for select to authenticated
using (user_id = (select auth.uid()) or private.current_user_has_role('moos'));

create policy permission_overrides_moos_manage on public.permission_overrides
for all to authenticated
using (private.current_user_has_role('moos'))
with check (private.current_user_has_role('moos'));

create policy contacts_scoped_read on public.contacts
for select to authenticated
using (
  private.current_user_is_member(organization_id)
  or private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
);

create policy contacts_member_insert on public.contacts
for insert to authenticated
with check (
  private.current_user_is_member(organization_id)
  or private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
);

create policy contacts_member_update on public.contacts
for update to authenticated
using (
  private.current_user_is_member(organization_id)
  or private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
)
with check (
  private.current_user_is_member(organization_id)
  or private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
);

create policy addresses_scoped_read on public.addresses
for select to authenticated
using (
  private.current_user_is_member(organization_id)
  or private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
);

create policy addresses_member_insert on public.addresses
for insert to authenticated
with check (
  private.current_user_is_member(organization_id)
  or private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
);

create policy addresses_member_update on public.addresses
for update to authenticated
using (
  private.current_user_is_member(organization_id)
  or private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
)
with check (
  private.current_user_is_member(organization_id)
  or private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
);

create policy publisher_profiles_scoped_read on public.publisher_profiles
for select to authenticated
using (
  private.current_user_is_member(organization_id)
  or private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
);

create policy publisher_profiles_admin_manage on public.publisher_profiles
for all to authenticated
using (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]))
with check (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]));

create policy catalog_cycles_public_read on public.catalog_cycles
for select to anon, authenticated
using (true);

create policy catalog_cycles_admin_manage on public.catalog_cycles
for all to authenticated
using (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]))
with check (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]));

create policy titles_public_live_read on public.titles
for select to anon
using (status = 'live');

create policy titles_authenticated_read on public.titles
for select to authenticated
using (
  status = 'live'
  or private.current_user_is_member(publisher_organization_id)
  or private.current_user_has_any_role(array['moos', 'admin', 'preflight']::public.app_role[])
);

create policy titles_publisher_insert on public.titles
for insert to authenticated
with check (
  private.current_user_is_member(publisher_organization_id)
  and created_by = (select auth.uid())
  and status = 'draft'
  and (
    catalog_cycle_id is null
    or exists (
      select 1 from public.catalog_cycles
      where id = catalog_cycle_id
        and publisher_submissions_open
        and status <> 'foc_locked'
    )
  )
);

create policy titles_publisher_update on public.titles
for update to authenticated
using (private.publisher_can_edit_title(id))
with check (
  private.current_user_is_member(publisher_organization_id)
  and status in ('draft', 'submitted_for_review', 'changes_requested')
  and (
    catalog_cycle_id is null
    or exists (
      select 1 from public.catalog_cycles
      where id = catalog_cycle_id
        and publisher_submissions_open
        and status <> 'foc_locked'
    )
  )
);

create policy titles_admin_manage on public.titles
for all to authenticated
using (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]))
with check (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]));

create policy title_files_scoped_read on public.title_files
for select to authenticated
using (
  exists (
    select 1 from public.titles
    where id = title_id and private.current_user_is_member(publisher_organization_id)
  )
  or private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
);

create policy title_files_preflight_read on public.title_files
for select to authenticated
using (
  private.current_user_has_role('preflight')
  and file_type in ('cover_print_pdf', 'interior_print_pdf')
);

create policy title_files_publisher_insert on public.title_files
for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and private.publisher_can_edit_title(title_id)
  and review_status = 'uploaded'
);

create policy title_files_admin_manage on public.title_files
for all to authenticated
using (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]))
with check (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]));

create policy title_files_preflight_update on public.title_files
for update to authenticated
using (
  private.current_user_has_role('preflight')
  and file_type in ('cover_print_pdf', 'interior_print_pdf')
)
with check (
  private.current_user_has_role('preflight')
  and file_type in ('cover_print_pdf', 'interior_print_pdf')
  and (reviewed_by is null or reviewed_by = (select auth.uid()))
);

create policy title_history_scoped_read on public.title_status_history
for select to authenticated
using (
  exists (
    select 1 from public.titles
    where id = title_id and private.current_user_is_member(publisher_organization_id)
  )
  or private.current_user_has_any_role(array['moos', 'admin', 'preflight']::public.app_role[])
);

create policy title_history_staff_insert on public.title_status_history
for insert to authenticated
with check (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]));

create policy audit_events_admin_read on public.audit_events
for select to authenticated
using (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]));

revoke all on all tables in schema public from anon, authenticated;
grant select (id, organization_type, name, slug, website) on public.organizations to anon;
grant select (
  id, name, catalog_date, foc_date, in_store_date, status,
  publisher_submissions_open, retailer_ordering_open,
  retailer_download_enabled
) on public.catalog_cycles to anon;
grant select (
  id, publisher_organization_id, catalog_cycle_id, philbo_id, barcode, title,
  series_name, issue_number, variant_number, cover_description, language,
  book_format, series_type, series_frequency, age_rating, msrp_cents,
  brief_synopsis, full_description, writer, artist, cover_artist, bisac_1,
  bisac_2, bisac_3, page_count, color_mode, width_inches, height_inches,
  weight_ounces, is_reprint, printing_number, available_for_reorder,
  trailer_url, status, published_at
) on public.titles to anon;

grant select, insert, update on public.organizations to authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, last_name, display_name, notification_preferences) on public.profiles to authenticated;
grant select, insert, update, delete on public.organization_memberships to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;
grant select, insert, update, delete on public.permission_overrides to authenticated;
grant select, insert, update on public.contacts to authenticated;
grant select, insert, update on public.addresses to authenticated;
grant select, insert, update on public.publisher_profiles to authenticated;
grant select (
  id, name, catalog_date, foc_date, in_store_date, status,
  publisher_submissions_open, retailer_ordering_open,
  retailer_download_enabled, created_at, updated_at
) on public.catalog_cycles to authenticated;
grant insert, update on public.catalog_cycles to authenticated;
grant select on public.titles to authenticated;
grant insert (
  publisher_organization_id, catalog_cycle_id, barcode, title, series_name,
  issue_number, variant_number, cover_description, language, book_format,
  series_type, series_code, series_frequency, age_rating, msrp_cents,
  brief_synopsis, full_description, writer, artist, cover_artist, bisac_1,
  bisac_2, bisac_3, page_count, color_mode, width_inches, height_inches,
  weight_ounces, is_reprint, printing_number, available_for_reorder,
  trailer_url, status, created_by
) on public.titles to authenticated;
grant update (
  catalog_cycle_id, barcode, title, series_name, issue_number, variant_number,
  cover_description, language, book_format, series_type, series_code,
  series_frequency, age_rating, msrp_cents, brief_synopsis, full_description,
  writer, artist, cover_artist, bisac_1, bisac_2, bisac_3, page_count,
  color_mode, width_inches, height_inches, weight_ounces, is_reprint,
  printing_number, available_for_reorder, trailer_url
) on public.titles to authenticated;
grant select on public.title_files to authenticated;
grant insert (
  title_id, file_type, storage_provider, object_path, provider_file_id,
  original_filename, mime_type, size_bytes, checksum_sha256, version,
  review_status, uploaded_by
) on public.title_files to authenticated;
grant update (review_status, reviewed_by, reviewed_at, review_notes) on public.title_files to authenticated;
grant select, insert on public.title_status_history to authenticated;
grant select on public.audit_events to authenticated;

grant usage on schema private to authenticated;
revoke all on all functions in schema private from public;
grant execute on function private.current_user_has_role(public.app_role) to authenticated;
grant execute on function private.current_user_has_any_role(public.app_role[]) to authenticated;
grant execute on function private.current_user_is_member(uuid) to authenticated;
grant execute on function private.publisher_can_edit_title(uuid) to authenticated;

create view public.public_catalog
with (security_invoker = true)
as
select
  t.id,
  t.philbo_id,
  t.barcode,
  t.title,
  o.name as publisher_name,
  t.series_name,
  t.issue_number,
  t.variant_number,
  t.cover_description,
  t.language,
  t.book_format,
  t.series_type,
  t.series_frequency,
  t.age_rating,
  t.msrp_cents,
  t.brief_synopsis,
  t.full_description,
  t.writer,
  t.artist,
  t.cover_artist,
  t.bisac_1,
  t.bisac_2,
  t.bisac_3,
  t.page_count,
  t.color_mode,
  t.width_inches,
  t.height_inches,
  t.weight_ounces,
  t.is_reprint,
  t.printing_number,
  t.available_for_reorder,
  t.trailer_url,
  c.catalog_date,
  c.foc_date,
  c.in_store_date,
  c.status as catalog_cycle_status,
  t.published_at
from public.titles t
join public.organizations o on o.id = t.publisher_organization_id
join public.catalog_cycles c on c.id = t.catalog_cycle_id
where t.status = 'live';

revoke all on public.public_catalog from public;
grant select on public.public_catalog to anon, authenticated;

comment on schema private is 'Non-exposed security helpers used by Philbo Row Level Security policies.';
comment on table public.audit_events is 'Append-only audit history. Application roles have no update or delete grant.';
comment on view public.public_catalog is 'Public-safe Live title projection; excludes wholesale, commission, payout, and internal fields.';

commit;
