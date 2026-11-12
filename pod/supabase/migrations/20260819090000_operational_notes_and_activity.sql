-- Durable launch-readiness notes for Admin follow-up queues and assigned Prepress jobs.
create table public.operational_notes (
  id uuid primary key default gen_random_uuid(),
  context_type text not null check (context_type in ('admin_queue', 'production_job')),
  context_key text not null,
  context_label text not null,
  production_job_id uuid references public.production_jobs(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'waiting', 'complete')),
  note text not null check (length(trim(note)) > 0),
  author_user_id uuid not null references auth.users(id) on delete restrict default auth.uid(),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_notes_context_job_check check (
    (context_type = 'production_job' and production_job_id is not null)
    or (context_type = 'admin_queue' and production_job_id is null)
  )
);

create index operational_notes_context_idx on public.operational_notes (context_type, context_key, updated_at desc);
create index operational_notes_production_job_idx on public.operational_notes (production_job_id, created_at desc) where production_job_id is not null;

create trigger operational_notes_set_updated_at
before update on public.operational_notes
for each row execute function private.set_updated_at();

alter table public.operational_notes enable row level security;

create policy operational_notes_admin_manage
on public.operational_notes for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[]))
with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

create policy operational_notes_preflight_read
on public.operational_notes for select to authenticated
using (
  context_type = 'production_job'
  and private.current_user_has_role('preflight')
  and private.current_user_is_assigned_to_job(production_job_id)
);

create policy operational_notes_preflight_insert
on public.operational_notes for insert to authenticated
with check (
  context_type = 'production_job'
  and author_user_id = auth.uid()
  and private.current_user_has_role('preflight')
  and private.current_user_is_assigned_to_job(production_job_id)
);

grant select, insert, update on public.operational_notes to authenticated;

comment on table public.operational_notes is 'Attributed Admin follow-up notes and Prepress production-job notes. Status changes remain separately recorded in audit_events.';
