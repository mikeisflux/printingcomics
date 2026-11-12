-- Rejected solicitations remain in the authoritative title workflow for audit,
-- but never become public or orderable.
alter type public.title_status add value if not exists 'rejected';
