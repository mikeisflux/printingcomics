begin;

alter table public.titles
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references auth.users(id) on delete set null,
  add column if not exists review_notes text,
  add column if not exists genre text,
  add column if not exists incentive_ratio text,
  add column if not exists incentive_rules text;

create or replace function private.stamp_title_workflow_decision()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, (select auth.uid()));
    -- Approval is the downstream publication trigger. Scheduled/live remain
    -- available for later lifecycle automation, not a second manual copy step.
    new.published_at := coalesce(new.published_at, now());
    new.published_by := coalesce(new.published_by, (select auth.uid()));
  elsif new.status = 'rejected' and old.status is distinct from new.status then
    new.rejected_at := coalesce(new.rejected_at, now());
    new.rejected_by := coalesce(new.rejected_by, (select auth.uid()));
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_title_workflow_decision on public.titles;
create trigger stamp_title_workflow_decision
before update of status on public.titles
for each row execute function private.stamp_title_workflow_decision();

drop policy if exists titles_public_live_read on public.titles;
create policy titles_public_published_read on public.titles
for select to anon
using (status in ('approved', 'scheduled', 'live'));

drop policy if exists titles_authenticated_read on public.titles;
create policy titles_authenticated_read on public.titles
for select to authenticated
using (
  status in ('approved', 'scheduled', 'live')
  or private.current_user_is_member(publisher_organization_id)
  or private.current_user_has_any_role(array['moos', 'admin', 'preflight']::public.app_role[])
);

commit;
