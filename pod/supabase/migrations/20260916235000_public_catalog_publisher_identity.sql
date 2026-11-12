begin;

-- Retailer follow controls need the stable publisher organization identifier;
-- the display name alone is not a safe relational key.
create or replace view public.public_catalog
with (security_invoker = true)
as
select
  t.id, t.philbo_id, t.barcode, t.title, o.name as publisher_name,
  t.series_name, t.issue_number, t.variant_number, t.cover_description,
  t.language, t.book_format, t.series_type, t.series_frequency, t.age_rating,
  t.msrp_cents, t.brief_synopsis, t.full_description, t.writer, t.artist,
  t.cover_artist, t.bisac_1, t.bisac_2, t.bisac_3, t.page_count,
  t.color_mode, t.width_inches, t.height_inches, t.weight_ounces,
  t.is_reprint, t.printing_number, t.available_for_reorder, t.trailer_url,
  t.genre, t.cover_url, t.publisher_logo_url, t.interior_image_url,
  c.id as catalog_cycle_id, c.name as catalog_cycle_name, c.catalog_date,
  c.foc_date, c.in_store_date, c.status as catalog_cycle_status,
  c.publication_version, c.published_at as catalog_published_at,
  c.catalog_pdf_url, t.published_at, t.incentive_ratio, t.incentive_rules,
  t.publisher_organization_id
from public.catalog_publication_items item
join public.titles t on t.id = item.title_id
join public.organizations o on o.id = t.publisher_organization_id
join public.catalog_cycles c on c.id = item.catalog_cycle_id
where t.status in ('approved', 'scheduled', 'live');

revoke all on public.public_catalog from public;
grant select on public.public_catalog to anon, authenticated;

commit;
