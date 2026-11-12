begin;

-- The checkout Edge Function uses the service role only to attach the Stripe
-- session and to cancel/void a draft when Stripe setup fails. These are the
-- narrow table privileges required for those operations.
grant select, update on public.sales_orders, public.invoices to service_role;

-- A draft that fails before Stripe checkout was never placed, so cancellation
-- must not require a fabricated placed_at timestamp.
alter table public.sales_orders drop constraint sales_orders_check;
alter table public.sales_orders
  add constraint sales_orders_placed_status_check
  check (status in ('draft', 'cancelled') or placed_at is not null);

-- Clean up only the three failed sandbox drafts created while diagnosing this
-- permission gap for the authorized retailer test account.
update public.invoices invoice
set status = 'void'
from public.sales_orders sales_order
join public.profiles profile on profile.user_id = sales_order.placed_by
where invoice.sales_order_id = sales_order.id
  and profile.email = 'mauramariepowers+retailer@gmail.com'
  and sales_order.order_number in ('SO-001001', 'SO-001002', 'SO-001003')
  and sales_order.status = 'draft'
  and sales_order.stripe_checkout_session_id is null
  and invoice.status = 'open';

update public.sales_orders sales_order
set status = 'cancelled', cancelled_at = now()
from public.profiles profile
where profile.user_id = sales_order.placed_by
  and profile.email = 'mauramariepowers+retailer@gmail.com'
  and sales_order.order_number in ('SO-001001', 'SO-001002', 'SO-001003')
  and sales_order.status = 'draft'
  and sales_order.stripe_checkout_session_id is null;

commit;
