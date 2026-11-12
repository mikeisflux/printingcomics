begin;

-- public_catalog is a security-invoker view. Its readers therefore need
-- SELECT on the publication snapshot table in addition to the view grant.
grant select on public.catalog_publication_items to anon, authenticated;
grant select (published_at, publication_version, catalog_pdf_url)
  on public.catalog_cycles to anon, authenticated;

commit;
