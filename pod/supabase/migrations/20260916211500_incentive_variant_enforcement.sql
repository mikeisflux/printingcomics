-- Enforce retailer incentive-cover ratios in the database as well as the UI.
-- A 1:5 cover allows one incentive copy for every five non-incentive copies
-- of the same publisher, catalog cycle, series, and issue in the order.

begin;

create or replace function private.validate_sales_order_incentives()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order_id uuid := coalesce(new.sales_order_id, old.sales_order_id);
  incentive record;
  ratio_parts text[];
  award_quantity integer;
  required_quantity integer;
  qualifying_quantity integer;
  allowed_quantity integer;
begin
  for incentive in
    select
      line.quantity,
      title.id,
      title.title,
      title.publisher_organization_id,
      title.catalog_cycle_id,
      title.series_name,
      title.issue_number,
      concat_ws(' ', title.incentive_ratio, title.cover_description, title.title) as incentive_text
    from public.sales_order_items line
    join public.titles title on title.id = line.title_id
    where line.sales_order_id = target_order_id
      and concat_ws(' ', title.incentive_ratio, title.cover_description, title.title) ~ '[0-9]+[[:space:]]*[:/][[:space:]]*[0-9]+'
  loop
    ratio_parts := regexp_match(incentive.incentive_text, '([0-9]+)[[:space:]]*[:/][[:space:]]*([0-9]+)');
    award_quantity := ratio_parts[1]::integer;
    required_quantity := ratio_parts[2]::integer;

    select coalesce(sum(line.quantity), 0)::integer
      into qualifying_quantity
    from public.sales_order_items line
    join public.titles title on title.id = line.title_id
    where line.sales_order_id = target_order_id
      and title.id <> incentive.id
      and title.publisher_organization_id = incentive.publisher_organization_id
      and title.catalog_cycle_id = incentive.catalog_cycle_id
      and title.series_name is not distinct from incentive.series_name
      and title.issue_number is not distinct from incentive.issue_number
      and concat_ws(' ', title.incentive_ratio, title.cover_description, title.title) !~ '[0-9]+[[:space:]]*[:/][[:space:]]*[0-9]+';

    allowed_quantity := floor(qualifying_quantity::numeric / required_quantity)::integer * award_quantity;
    if incentive.quantity > allowed_quantity then
      raise exception '% is a %:% incentive cover. % qualifying regular copies allow at most % incentive copies.',
        incentive.title, award_quantity, required_quantity, qualifying_quantity, allowed_quantity;
    end if;
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists sales_order_items_validate_incentives on public.sales_order_items;
create constraint trigger sales_order_items_validate_incentives
after insert or update or delete on public.sales_order_items
deferrable initially deferred
for each row execute function private.validate_sales_order_incentives();

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
  t.published_at,
  t.incentive_ratio,
  t.incentive_rules
from public.catalog_publication_items item
join public.titles t on t.id = item.title_id
join public.organizations o on o.id = t.publisher_organization_id
join public.catalog_cycles c on c.id = item.catalog_cycle_id
where t.status in ('approved', 'scheduled', 'live');

revoke all on public.public_catalog from public;
grant select on public.public_catalog to anon, authenticated;

comment on function private.validate_sales_order_incentives() is
  'Server-authoritative enforcement for retailer incentive-cover ratios such as 1:5.';

commit;
