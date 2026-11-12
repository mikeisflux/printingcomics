-- Retailers may update their own store identity and tax-document metadata
-- without receiving permission to change tier, discount, credit, or approval fields.

begin;

alter table public.retailer_profiles
  add column if not exists tax_identifier text,
  add column if not exists resale_certificate_number text,
  add column if not exists resale_certificate_state text;

create or replace function public.update_my_retailer_profile(
  p_company_name text,
  p_website text,
  p_tax_identifier text,
  p_certificate_number text,
  p_certificate_state text,
  p_certificate_expires_on date,
  p_certificate_object_path text default null
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  target_organization_id uuid;
begin
  select organization_id
    into target_organization_id
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id
  where membership.user_id = auth.uid()
    and membership.is_active
    and organization.organization_type = 'retailer'
  order by membership.is_primary_contact desc
  limit 1;

  if target_organization_id is null then
    raise exception 'An active retailer organization membership is required.';
  end if;

  if nullif(trim(p_company_name), '') is null then
    raise exception 'Store name is required.';
  end if;

  update public.organizations
  set name = trim(p_company_name),
      website = nullif(trim(p_website), ''),
      updated_at = now()
  where id = target_organization_id;

  update public.retailer_profiles
  set tax_identifier = nullif(trim(p_tax_identifier), ''),
      resale_certificate_number = nullif(trim(p_certificate_number), ''),
      resale_certificate_state = upper(nullif(trim(p_certificate_state), '')),
      resale_certificate_expires_on = p_certificate_expires_on,
      resale_certificate_object_path = coalesce(p_certificate_object_path, resale_certificate_object_path),
      resale_certificate_status = case when p_certificate_object_path is not null then 'pending' else resale_certificate_status end,
      tax_exempt = case when p_certificate_object_path is not null then false else tax_exempt end,
      updated_at = now()
  where organization_id = target_organization_id;
end;
$$;

revoke all on function public.update_my_retailer_profile(text, text, text, text, text, date, text) from public;
grant execute on function public.update_my_retailer_profile(text, text, text, text, text, date, text) to authenticated;

commit;
