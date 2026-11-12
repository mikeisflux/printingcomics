-- Emergency rollback for the authorized PHILVIEWS #14/#15 import only.
-- This intentionally fails if commerce records already reference imported titles.
begin;
delete from public.catalog_publication_items where catalog_cycle_id in ('14000000-0000-4000-8000-000000000014', '15000000-0000-4000-8000-000000000015');
delete from public.titles where import_batch_id in ('14000000-0000-4000-8000-000000000114', '15000000-0000-4000-8000-000000000115');
delete from public.catalog_cycles where id in ('14000000-0000-4000-8000-000000000014', '15000000-0000-4000-8000-000000000015');
delete from public.catalog_import_batches where id in ('14000000-0000-4000-8000-000000000114', '15000000-0000-4000-8000-000000000115');
delete from public.publisher_profiles where organization_id in ('f14321f4-f7a0-4a43-8432-88ef70e78d78', '379d3438-378e-46df-8cfb-eb6350bf4dc7', '7b0bca08-d480-4448-af85-34a1adb1a94e', '1000f66e-0575-4818-9c8e-693f908f9639', '5ecd8c39-9cd6-4d71-a1a0-18576c23bb26', '80d3e472-ba06-4287-8bff-8d379f137901', '2482be29-b596-4348-81e6-c9f0fa87d280', '45a29f27-da1e-4e43-83ec-c13bdc9dd038', '316e3958-124c-4e7c-940d-4676e311597f');
delete from public.organizations where id in ('f14321f4-f7a0-4a43-8432-88ef70e78d78', '379d3438-378e-46df-8cfb-eb6350bf4dc7', '7b0bca08-d480-4448-af85-34a1adb1a94e', '1000f66e-0575-4818-9c8e-693f908f9639', '5ecd8c39-9cd6-4d71-a1a0-18576c23bb26', '80d3e472-ba06-4287-8bff-8d379f137901', '2482be29-b596-4348-81e6-c9f0fa87d280', '45a29f27-da1e-4e43-83ec-c13bdc9dd038', '316e3958-124c-4e7c-940d-4676e311597f');
commit;
