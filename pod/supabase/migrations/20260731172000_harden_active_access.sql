-- Existing access tokens must stop working as soon as an account or its
-- organization is suspended. Also constrain preflight edits to review fields.

begin;

create or replace function private.current_user_has_role(requested_role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.user_id = ur.user_id
    where ur.user_id = (select auth.uid())
      and ur.role = requested_role
      and ur.is_active
      and p.account_status = 'active'
  );
$$;

create or replace function private.current_user_has_any_role(requested_roles public.app_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.user_id = ur.user_id
    where ur.user_id = (select auth.uid())
      and ur.role = any(requested_roles)
      and ur.is_active
      and p.account_status = 'active'
  );
$$;

create or replace function private.current_user_is_member(requested_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_memberships om
    join public.profiles p on p.user_id = om.user_id
    join public.organizations o on o.id = om.organization_id
    where om.user_id = (select auth.uid())
      and om.organization_id = requested_organization_id
      and om.is_active
      and p.account_status = 'active'
      and o.account_status = 'active'
  );
$$;

create function private.protect_preflight_job_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.current_user_has_role('preflight')
    and not private.current_user_has_any_role(array['moos','admin']::public.app_role[])
    and (
      old.id is distinct from new.id
      or old.job_number is distinct from new.job_number
      or old.customer_organization_id is distinct from new.customer_organization_id
      or old.title_id is distinct from new.title_id
      or old.source_type is distinct from new.source_type
      or old.project_title is distinct from new.project_title
      or old.philbo_id is distinct from new.philbo_id
      or old.order_placed_at is distinct from new.order_placed_at
      or old.production_deadline is distinct from new.production_deadline
      or old.customer_company_name is distinct from new.customer_company_name
      or old.customer_contact_name is distinct from new.customer_contact_name
      or old.customer_contact_email is distinct from new.customer_contact_email
      or old.customer_contact_phone is distinct from new.customer_contact_phone
      or old.created_at is distinct from new.created_at
    )
  then
    raise exception 'Preflight may only update review and production status fields.';
  end if;
  return new;
end;
$$;

create function private.protect_preflight_file_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.current_user_has_role('preflight')
    and not private.current_user_has_any_role(array['moos','admin']::public.app_role[])
    and (
      old.id is distinct from new.id
      or old.production_job_id is distinct from new.production_job_id
      or old.file_type is distinct from new.file_type
      or old.object_path is distinct from new.object_path
      or old.original_filename is distinct from new.original_filename
      or old.mime_type is distinct from new.mime_type
      or old.size_bytes is distinct from new.size_bytes
      or old.version is distinct from new.version
      or old.uploaded_by is distinct from new.uploaded_by
      or old.created_at is distinct from new.created_at
    )
  then
    raise exception 'Preflight may only update file review fields.';
  end if;
  return new;
end;
$$;

create trigger production_jobs_protect_preflight_fields before update on public.production_jobs
for each row execute function private.protect_preflight_job_fields();
create trigger production_files_protect_preflight_fields before update on public.production_files
for each row execute function private.protect_preflight_file_fields();

-- Replace the broad legacy preflight catalog/file access. Preflight now reads
-- only production_jobs and production_files for an explicit active assignment.
drop policy if exists titles_authenticated_read on public.titles;
create policy titles_authenticated_read on public.titles for select to authenticated
using (
  status = 'live'
  or private.current_user_is_member(publisher_organization_id)
  or private.current_user_has_any_role(array['moos','admin']::public.app_role[])
);
drop policy if exists title_files_preflight_read on public.title_files;
drop policy if exists title_files_preflight_update on public.title_files;
drop policy if exists title_history_scoped_read on public.title_status_history;
create policy title_history_scoped_read on public.title_status_history for select to authenticated
using (
  exists (select 1 from public.titles where id = title_id and private.current_user_is_member(publisher_organization_id))
  or private.current_user_has_any_role(array['moos','admin']::public.app_role[])
);

-- Admins may inspect the internal team roster; only MO.OS policies continue to
-- permit direct role/override management.
drop policy if exists roles_own_or_moos_read on public.user_roles;
create policy roles_own_or_staff_read on public.user_roles for select to authenticated
using (user_id = (select auth.uid()) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

drop policy if exists production_files_staff_update on storage.objects;
create policy production_files_admin_update on storage.objects for update to authenticated
using (bucket_id = 'production-files' and private.current_user_has_any_role(array['moos','admin']::public.app_role[]))
with check (bucket_id = 'production-files' and private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

revoke all on function private.protect_preflight_job_fields() from public;
revoke all on function private.protect_preflight_file_fields() from public;

commit;
