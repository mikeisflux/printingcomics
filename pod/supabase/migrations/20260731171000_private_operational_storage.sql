-- Private operational storage. Every object path begins with the owning
-- organization UUID or production-job UUID so RLS can validate ownership.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('title-files', 'title-files', false, 1073741824, array['application/pdf','image/jpeg','image/png','image/tiff','application/zip']),
  ('production-files', 'production-files', false, 2147483648, array['application/pdf','image/jpeg','image/png','image/tiff','application/zip']),
  ('resale-certificates', 'resale-certificates', false, 20971520, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy title_files_scoped_read on storage.objects for select to authenticated
using (
  bucket_id = 'title-files'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and (
    private.current_user_is_member(((storage.foldername(name))[1])::uuid)
    or private.current_user_has_any_role(array['moos','admin']::public.app_role[])
    or exists (
      select 1 from public.title_files tf
      join public.production_files pf on pf.object_path = tf.object_path
      where tf.object_path = name and private.current_user_is_assigned_to_job(pf.production_job_id)
    )
  )
);
create policy title_files_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'title-files'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and (private.current_user_is_member(((storage.foldername(name))[1])::uuid) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]))
);
create policy title_files_owner_update on storage.objects for update to authenticated
using (bucket_id = 'title-files' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and (private.current_user_is_member(((storage.foldername(name))[1])::uuid) or private.current_user_has_any_role(array['moos','admin']::public.app_role[])))
with check (bucket_id = 'title-files' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and (private.current_user_is_member(((storage.foldername(name))[1])::uuid) or private.current_user_has_any_role(array['moos','admin']::public.app_role[])));
create policy title_files_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'title-files' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and (private.current_user_is_member(((storage.foldername(name))[1])::uuid) or private.current_user_has_any_role(array['moos','admin']::public.app_role[])));

create policy production_files_scoped_read on storage.objects for select to authenticated
using (
  bucket_id = 'production-files'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and exists (
    select 1 from public.production_jobs j
    where j.id = ((storage.foldername(name))[1])::uuid
      and (private.current_user_is_member(j.customer_organization_id) or private.current_user_is_assigned_to_job(j.id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]))
  )
);
create policy production_files_customer_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'production-files'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and exists (
    select 1 from public.production_jobs j
    where j.id = ((storage.foldername(name))[1])::uuid
      and (private.current_user_is_member(j.customer_organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]))
  )
);
create policy production_files_staff_update on storage.objects for update to authenticated
using (bucket_id = 'production-files' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and (private.current_user_is_assigned_to_job(((storage.foldername(name))[1])::uuid) or private.current_user_has_any_role(array['moos','admin']::public.app_role[])))
with check (bucket_id = 'production-files' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and (private.current_user_is_assigned_to_job(((storage.foldername(name))[1])::uuid) or private.current_user_has_any_role(array['moos','admin']::public.app_role[])));
create policy production_files_admin_delete on storage.objects for delete to authenticated
using (bucket_id = 'production-files' and private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

create policy resale_certificates_scoped_read on storage.objects for select to authenticated
using (
  bucket_id = 'resale-certificates'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and (private.current_user_is_member(((storage.foldername(name))[1])::uuid) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]))
);
create policy resale_certificates_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'resale-certificates' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and private.current_user_is_member(((storage.foldername(name))[1])::uuid));
create policy resale_certificates_owner_update on storage.objects for update to authenticated
using (bucket_id = 'resale-certificates' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and private.current_user_is_member(((storage.foldername(name))[1])::uuid))
with check (bucket_id = 'resale-certificates' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and private.current_user_is_member(((storage.foldername(name))[1])::uuid));
create policy resale_certificates_admin_delete on storage.objects for delete to authenticated
using (bucket_id = 'resale-certificates' and private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

commit;

