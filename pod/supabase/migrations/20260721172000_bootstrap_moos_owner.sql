-- Bootstrap the first protected Philbo owner account after its Supabase Auth
-- invitation has been created. Future owner changes must go through audited
-- administrative workflows; this migration is intentionally email-specific.

begin;

do $$
declare
  owner_email constant text := 'mauramariepowers@gmail.com';
  owner_user_id uuid;
  philbo_organization_id uuid;
begin
  select id
    into owner_user_id
  from auth.users
  where lower(email) = owner_email
  order by created_at
  limit 1;

  if owner_user_id is null then
    raise exception 'Cannot bootstrap MO.OS owner: Auth user % does not exist.', owner_email;
  end if;

  insert into public.profiles (
    user_id,
    email,
    display_name,
    account_status,
    invitation_accepted_at
  ) values (
    owner_user_id,
    owner_email,
    'Maura Powers',
    'active',
    now()
  )
  on conflict (user_id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      account_status = 'active',
      invitation_accepted_at = coalesce(
        public.profiles.invitation_accepted_at,
        excluded.invitation_accepted_at
      );

  insert into public.organizations (
    organization_type,
    name,
    slug,
    account_status
  ) values (
    'philbo',
    'Philbo Distribution LLC',
    'philbo-distribution',
    'active'
  )
  on conflict (slug) do update
  set organization_type = 'philbo',
      name = excluded.name,
      account_status = 'active'
  returning id into philbo_organization_id;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    job_title,
    is_primary_contact,
    is_active
  ) values (
    philbo_organization_id,
    owner_user_id,
    'Owner',
    true,
    true
  )
  on conflict (organization_id, user_id) do update
  set job_title = 'Owner',
      is_primary_contact = true,
      is_active = true;

  insert into public.user_roles (
    user_id,
    role,
    is_active,
    granted_by
  ) values (
    owner_user_id,
    'moos',
    true,
    owner_user_id
  )
  on conflict (user_id, role) do update
  set is_active = true,
      granted_by = excluded.granted_by,
      granted_at = now(),
      revoked_at = null;

  insert into public.audit_events (
    actor_user_id,
    actor_role,
    action,
    record_type,
    record_id,
    new_value,
    notes
  ) values (
    owner_user_id,
    'moos',
    'Bootstrap first MO.OS owner',
    'profile',
    owner_user_id::text,
    jsonb_build_object(
      'email', owner_email,
      'role', 'moos',
      'organization', 'Philbo Distribution LLC'
    ),
    'Created by version-controlled migration after Supabase Auth invitation.'
  );
end;
$$;

commit;
