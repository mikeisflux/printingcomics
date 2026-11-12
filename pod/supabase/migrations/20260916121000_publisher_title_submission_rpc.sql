begin;

create or replace function public.submit_my_title_for_review(requested_title_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.publisher_can_edit_title(requested_title_id) then
    raise exception 'This title is not editable by the current Publisher account.';
  end if;

  update public.titles
  set status = 'submitted_for_review',
      submitted_at = now(),
      updated_at = now()
  where id = requested_title_id;

  if not found then raise exception 'Title not found.'; end if;
end;
$$;

revoke all on function public.submit_my_title_for_review(uuid) from public;
grant execute on function public.submit_my_title_for_review(uuid) to authenticated;

commit;
