begin;

alter table public.catalog_cycles
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references auth.users(id) on delete set null,
  add column if not exists publication_version integer not null default 0 check (publication_version >= 0),
  add column if not exists catalog_pdf_url text;

create table if not exists public.catalog_publication_items (
  catalog_cycle_id uuid not null references public.catalog_cycles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete restrict,
  publication_version integer not null check (publication_version > 0),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  primary key (catalog_cycle_id, title_id)
);

create index if not exists catalog_publication_items_title_idx
  on public.catalog_publication_items(title_id);

alter table public.catalog_publication_items enable row level security;

drop policy if exists catalog_publication_items_public_read on public.catalog_publication_items;
create policy catalog_publication_items_public_read on public.catalog_publication_items
for select to anon, authenticated
using (true);

drop policy if exists catalog_publication_items_admin_manage on public.catalog_publication_items;
create policy catalog_publication_items_admin_manage on public.catalog_publication_items
for all to authenticated
using (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]))
with check (private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]));

create or replace function public.publish_catalog_cycle(requested_cycle_id uuid)
returns table(catalog_cycle_id uuid, publication_version integer, title_count integer, published_at timestamptz)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  next_version integer;
  approved_count integer;
  publication_time timestamptz := now();
begin
  if not private.current_user_has_any_role(array['moos', 'admin']::public.app_role[]) then
    raise exception 'Administrator access required.';
  end if;

  perform 1 from public.catalog_cycles where id = requested_cycle_id for update;
  if not found then raise exception 'Catalog Cycle not found.'; end if;

  select count(*)::integer into approved_count
  from public.titles
  where catalog_cycle_id = requested_cycle_id
    and status in ('approved', 'scheduled', 'live');

  if approved_count = 0 then
    raise exception 'Approve at least one title before publishing this catalog.';
  end if;

  select coalesce(c.publication_version, 0) + 1 into next_version
  from public.catalog_cycles c where c.id = requested_cycle_id;

  delete from public.catalog_publication_items where catalog_cycle_id = requested_cycle_id;

  insert into public.catalog_publication_items (
    catalog_cycle_id, title_id, publication_version, published_at, published_by
  )
  select requested_cycle_id, t.id, next_version, publication_time, (select auth.uid())
  from public.titles t
  where t.catalog_cycle_id = requested_cycle_id
    and t.status in ('approved', 'scheduled', 'live');

  update public.catalog_cycles
  set status = 'retailer_ordering_open',
      publisher_submissions_open = false,
      retailer_ordering_open = true,
      retailer_download_enabled = true,
      published_at = publication_time,
      published_by = (select auth.uid()),
      publication_version = next_version,
      updated_at = publication_time
  where id = requested_cycle_id;

  return query select requested_cycle_id, next_version, approved_count, publication_time;
end;
$$;

revoke all on function public.publish_catalog_cycle(uuid) from public;
grant execute on function public.publish_catalog_cycle(uuid) to authenticated;

drop policy if exists titles_public_live_read on public.titles;
drop policy if exists titles_public_published_read on public.titles;
drop policy if exists titles_public_catalog_read on public.titles;
create policy titles_public_catalog_read on public.titles
for select to anon
using (
  status in ('approved', 'scheduled', 'live')
  and exists (
    select 1 from public.catalog_publication_items item
    where item.title_id = titles.id
  )
);

drop view if exists public.public_catalog;
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
  c.id as catalog_cycle_id,
  c.name as catalog_cycle_name,
  c.catalog_date,
  c.foc_date,
  c.in_store_date,
  c.status as catalog_cycle_status,
  c.publication_version,
  c.published_at as catalog_published_at,
  c.catalog_pdf_url,
  t.published_at
from public.catalog_publication_items item
join public.titles t on t.id = item.title_id
join public.organizations o on o.id = t.publisher_organization_id
join public.catalog_cycles c on c.id = item.catalog_cycle_id
where t.status in ('approved', 'scheduled', 'live');

revoke all on public.public_catalog from public;
grant select on public.public_catalog to anon, authenticated;

comment on table public.catalog_publication_items is
  'The single authoritative SKU snapshot for each published catalog cycle. Public pages, retailer ordering, and CSV exports must use these same rows.';
comment on function public.publish_catalog_cycle(uuid) is
  'Atomically replaces the one current title snapshot for a catalog cycle and opens that same catalog for retailer ordering and downloads.';
comment on view public.public_catalog is
  'Public-safe projection of the authoritative published catalog snapshot; it never exposes merely approved but unpublished titles.';

commit;
