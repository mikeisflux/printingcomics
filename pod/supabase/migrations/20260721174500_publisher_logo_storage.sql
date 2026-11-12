-- Private publisher-logo storage. Object paths must begin with the publisher
-- organization UUID so Row Level Security can scope each company's files.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'publisher-logos',
  'publisher-logos',
  false,
  5242880,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists publisher_logo_member_read on storage.objects;
create policy publisher_logo_member_read on storage.objects
for select to authenticated
using (
  bucket_id = 'publisher-logos'
  and (
    private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
    or private.current_user_is_member(((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists publisher_logo_member_insert on storage.objects;
create policy publisher_logo_member_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'publisher-logos'
  and (
    private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
    or private.current_user_is_member(((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists publisher_logo_member_update on storage.objects;
create policy publisher_logo_member_update on storage.objects
for update to authenticated
using (
  bucket_id = 'publisher-logos'
  and (
    private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
    or private.current_user_is_member(((storage.foldername(name))[1])::uuid)
  )
)
with check (
  bucket_id = 'publisher-logos'
  and (
    private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
    or private.current_user_is_member(((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists publisher_logo_member_delete on storage.objects;
create policy publisher_logo_member_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'publisher-logos'
  and (
    private.current_user_has_any_role(array['moos', 'admin']::public.app_role[])
    or private.current_user_is_member(((storage.foldername(name))[1])::uuid)
  )
);

commit;
