begin;

-- The public_catalog view is security-invoker. Keep authenticated catalog
-- readers scoped to the explicitly published snapshot while preserving
-- publisher ownership and Admin access to non-public records.
drop policy if exists titles_authenticated_read on public.titles;
create policy titles_authenticated_read on public.titles
for select to authenticated
using (
  (
    status in ('approved', 'scheduled', 'live')
    and exists (
      select 1
      from public.catalog_publication_items publication
      where publication.title_id = titles.id
    )
  )
  or private.current_user_is_member(publisher_organization_id)
  or private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
);

-- These public-safe columns were added to public_catalog after the original
-- column-level anonymous grant was created.
grant select (incentive_ratio, incentive_rules) on public.titles to anon;

commit;
