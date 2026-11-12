-- September 1, 2026 legacy catalog import support.
-- This migration adds audit/provenance fields and narrow exceptions without
-- weakening permanent Publisher Solicitation validation.

begin;

create table if not exists public.catalog_import_batches (
  id uuid primary key default gen_random_uuid(),
  import_code text not null unique check (import_code = upper(trim(import_code))),
  source_filename text not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_row_count integer not null check (source_row_count > 0),
  status text not null default 'previewed' check (status in ('previewed', 'authorized', 'imported', 'cancelled')),
  previewed_at timestamptz not null default now(),
  authorized_at timestamptz,
  authorized_by uuid references auth.users(id) on delete restrict,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('authorized', 'imported') or (authorized_at is not null and authorized_by is not null)),
  check (status <> 'imported' or imported_at is not null)
);

alter table public.catalog_import_batches enable row level security;

drop policy if exists catalog_import_batches_staff_manage on public.catalog_import_batches;
create policy catalog_import_batches_staff_manage on public.catalog_import_batches
for all to authenticated
using (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]))
with check (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]));

grant select, insert, update on public.catalog_import_batches to authenticated;

drop trigger if exists catalog_import_batches_set_updated_at on public.catalog_import_batches;
create trigger catalog_import_batches_set_updated_at
before update on public.catalog_import_batches
for each row execute function private.set_updated_at();

alter table public.titles
  add column if not exists import_batch_id uuid references public.catalog_import_batches(id) on delete restrict,
  add column if not exists legacy_source text,
  add column if not exists legacy_submitted_at timestamptz,
  add column if not exists legacy_original_barcode text,
  add column if not exists legacy_metadata jsonb not null default '{}'::jsonb,
  add column if not exists legacy_series_code_exception boolean not null default false,
  add column if not exists legacy_page_count_corrected boolean not null default false;

create index if not exists titles_import_batch_idx on public.titles(import_batch_id);

-- Remove only the original checks that must be replaced by scoped legacy rules.
do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname, pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'public.titles'::regclass
      and contype = 'c'
  loop
    if constraint_record.definition like '%barcode ~ ''^[0-9]+$''%'
       or constraint_record.definition like '%philbo_id ~%[0-9]{5}%'
       or (
         constraint_record.definition like '%series_code IS NOT NULL%'
         and constraint_record.definition like '%barcode IS NOT NULL%'
         and constraint_record.definition like '%philbo_id IS NOT NULL%'
       ) then
      execute format('alter table public.titles drop constraint %I', constraint_record.conname);
    end if;
  end loop;
end
$$;

alter table public.titles
  add constraint titles_barcode_permanent_or_legacy_check check (
    barcode is null
    or (barcode ~ '^[0-9]+$' and length(barcode) >= 5)
    or (
      import_batch_id is not null
      and legacy_original_barcode ~ '^[0-9]+$'
      and length(legacy_original_barcode) >= 5
      and barcode in (legacy_original_barcode || 'A', legacy_original_barcode || 'B')
    )
  ),
  add constraint titles_philbo_id_permanent_or_september_check check (
    philbo_id is null
    or philbo_id ~ '^[^[:space:]]+-[0-9]{5}$'
    or (import_batch_id is not null and philbo_id ~ '^PHI121626-[0-9]{3}$')
  ),
  add constraint titles_submission_identity_or_legacy_check check (
    status = 'draft'
    or (
      (series_code is not null or (import_batch_id is not null and legacy_series_code_exception))
      and barcode is not null
      and philbo_id is not null
    )
  ),
  add constraint titles_legacy_flags_require_batch_check check (
    not legacy_series_code_exception
    and not legacy_page_count_corrected
    or import_batch_id is not null
  ),
  add constraint titles_tbd_is_legacy_only_check check (
    fulfillment_method is distinct from 'tbd'::public.fulfillment_method
    or import_batch_id is not null
  ),
  add constraint titles_standard_floppy_page_count_check check (
    book_format is null
    or book_format !~* '^(standard floppy comic|single issue)$'
    or (page_count is not null and page_count > 0 and page_count % 4 = 0)
  );

create or replace function private.set_philbo_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.series_code is not null then
    new.series_code = upper(regexp_replace(new.series_code, '\s+', '', 'g'));
  end if;

  -- A reviewed legacy batch supplies its fixed Stock Number explicitly.
  if new.import_batch_id is not null and new.philbo_id is not null then
    return new;
  end if;

  -- Permanent Publisher Solicitation behavior remains unchanged.
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

-- Inventory is the acknowledged 15% account-wide distribution rate.
alter table public.publisher_profiles
  add column if not exists inventory_commission_acknowledged_at timestamptz,
  add column if not exists inventory_commission_acknowledged_by uuid references auth.users(id) on delete set null;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname, pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'public.publisher_profiles'::regclass
      and contype = 'c'
  loop
    if constraint_record.definition like '%commission_rate%0.05%0.10%' then
      execute format('alter table public.publisher_profiles drop constraint %I', constraint_record.conname);
    end if;
  end loop;
end
$$;

alter table public.publisher_profiles
  add constraint publisher_profiles_commission_rate_check
  check (commission_rate is null or commission_rate in (0.05, 0.10, 0.15));

create or replace function public.acknowledge_inventory_fulfillment(
  requested_organization_id uuid
)
returns public.publisher_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_profile public.publisher_profiles;
  updated_profile public.publisher_profiles;
  actor_role public.app_role;
begin
  if not (
    private.current_user_is_member(requested_organization_id)
    or private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
  ) then
    raise exception 'You are not authorized to change fulfillment for this Publisher.';
  end if;

  select * into previous_profile
  from public.publisher_profiles
  where organization_id = requested_organization_id
  for update;

  if previous_profile.organization_id is null then
    raise exception 'Publisher profile not found.';
  end if;

  update public.publisher_profiles
  set default_fulfillment_method = 'publisher_fulfilled',
      commission_rate = 0.15,
      inventory_commission_acknowledged_at = now(),
      inventory_commission_acknowledged_by = (select auth.uid())
  where organization_id = requested_organization_id
  returning * into updated_profile;

  select role into actor_role
  from public.user_roles
  where user_id = (select auth.uid()) and is_active
  order by case role when 'moos' then 1 when 'admin' then 2 when 'publisher' then 3 else 4 end
  limit 1;

  insert into public.audit_events (
    actor_user_id, actor_role, action, record_type, record_id,
    previous_value, new_value, notes
  ) values (
    (select auth.uid()), actor_role, 'Inventory fulfillment acknowledged',
    'publisher_profile', requested_organization_id::text,
    jsonb_build_object(
      'fulfillment_method', previous_profile.default_fulfillment_method,
      'commission_rate', previous_profile.commission_rate
    ),
    jsonb_build_object(
      'fulfillment_method', updated_profile.default_fulfillment_method,
      'commission_rate', updated_profile.commission_rate,
      'acknowledged_at', updated_profile.inventory_commission_acknowledged_at
    ),
    'Inventory fulfillment sets the account-wide Philbo distribution rate to 15%.'
  );

  return updated_profile;
end;
$$;

create or replace function public.calculate_publisher_payout(
  requested_organization_id uuid,
  msrp_total_cents integer,
  wholesale_total_cents integer
)
returns table (
  commission_rate numeric,
  commission_cents integer,
  publisher_payout_cents integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  effective_rate numeric(5,4);
begin
  if msrp_total_cents < 0 or wholesale_total_cents < 0 then
    raise exception 'Payout inputs cannot be negative.';
  end if;

  if not (
    private.current_user_is_member(requested_organization_id)
    or private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
  ) then
    raise exception 'You are not authorized to calculate this Publisher payout.';
  end if;

  select coalesce(pp.commission_rate, 0.10)
  into effective_rate
  from public.publisher_profiles pp
  where pp.organization_id = requested_organization_id;

  if effective_rate is null then
    raise exception 'Publisher profile not found.';
  end if;

  return query
  select
    effective_rate,
    round(msrp_total_cents * effective_rate)::integer,
    wholesale_total_cents - round(msrp_total_cents * effective_rate)::integer;
end;
$$;

revoke all on function public.acknowledge_inventory_fulfillment(uuid) from public;
revoke all on function public.calculate_publisher_payout(uuid, integer, integer) from public;
grant execute on function public.acknowledge_inventory_fulfillment(uuid) to authenticated;
grant execute on function public.calculate_publisher_payout(uuid, integer, integer) to authenticated;

comment on table public.catalog_import_batches is 'Auditable import authorization boundary. Previewing a batch never authorizes or executes it.';
comment on column public.titles.legacy_series_code_exception is 'September legacy exception only; permanent Publisher submissions still require Series Code.';
comment on column public.titles.legacy_page_count_corrected is 'Explicit reviewed correction marker; never an automatic page-count normalization rule.';
comment on column public.titles.legacy_original_barcode is 'Preserves the numeric source barcode when an approved legacy import suffix is used.';
comment on column public.publisher_profiles.inventory_commission_acknowledged_at is 'Timestamp of explicit acknowledgement that Inventory fulfillment sets the account distribution rate to 15%.';
comment on function public.calculate_publisher_payout(uuid, integer, integer) is 'Calculates Philbo commission from full MSRP and Publisher payout from wholesale proceeds using the stored account rate; Inventory acknowledgement stores 15%.';

commit;
