-- Server-authoritative Stripe Checkout support.
-- Retailers never supply prices; the database rebuilds every line from the
-- published catalog and the retailer's assigned wholesale tier.

begin;

alter table public.sales_orders
  add column if not exists stripe_checkout_session_id text unique;

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from public, anon, authenticated;

create or replace function public.create_retailer_checkout_draft(requested_items jsonb)
returns table (order_id uuid, order_number text, invoice_id uuid, amount_due_cents integer, currency text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_user uuid := auth.uid();
  retailer_org uuid;
  retailer_discount numeric(5,4);
  created_order public.sales_orders%rowtype;
  created_invoice public.invoices%rowtype;
  item jsonb;
  requested_title uuid;
  requested_quantity integer;
  catalog_title record;
  wholesale_cents integer;
  msrp_total integer := 0;
  subtotal_total integer := 0;
begin
  if requested_user is null then raise exception 'Authentication required.'; end if;
  if jsonb_typeof(requested_items) <> 'array' or jsonb_array_length(requested_items) = 0 then
    raise exception 'Add at least one title before checkout.';
  end if;
  if jsonb_array_length(requested_items) > 250 then raise exception 'An order may contain at most 250 titles.'; end if;

  select membership.organization_id, profile.discount_rate
    into retailer_org, retailer_discount
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id
  join public.retailer_profiles profile on profile.organization_id = membership.organization_id
  where membership.user_id = requested_user
    and membership.is_active
    and organization.organization_type = 'retailer'
    and organization.account_status = 'active'
  order by membership.is_primary_contact desc
  limit 1;

  if retailer_org is null then raise exception 'An active retailer account is required.'; end if;

  insert into public.sales_orders (retailer_organization_id, placed_by, status, payment_status)
  values (retailer_org, requested_user, 'draft', 'pending')
  returning * into created_order;

  for item in select value from jsonb_array_elements(requested_items)
  loop
    begin
      requested_title := (item->>'titleId')::uuid;
      requested_quantity := (item->>'quantity')::integer;
    exception when others then
      raise exception 'Every order line requires a valid title and quantity.';
    end;
    if requested_quantity < 1 or requested_quantity > 10000 then
      raise exception 'Each quantity must be between 1 and 10,000.';
    end if;
    if exists (select 1 from public.sales_order_items where sales_order_id = created_order.id and title_id = requested_title) then
      raise exception 'Duplicate titles are not allowed in one checkout.';
    end if;

    select t.id, t.publisher_organization_id, t.catalog_cycle_id, t.msrp_cents
      into catalog_title
    from public.titles t
    join public.catalog_publication_items publication on publication.title_id = t.id and publication.catalog_cycle_id = t.catalog_cycle_id
    join public.catalog_cycles cycle on cycle.id = t.catalog_cycle_id
    where t.id = requested_title
      and t.status in ('approved', 'scheduled', 'live')
      and t.msrp_cents is not null
      and t.msrp_cents > 0
      and (
        (cycle.retailer_ordering_open and cycle.status <> 'foc_locked')
        or (t.available_for_reorder and cycle.status in ('released', 'archived'))
      );
    if not found then raise exception 'A selected title is not currently orderable.'; end if;

    wholesale_cents := round(catalog_title.msrp_cents * (1 - retailer_discount))::integer;
    insert into public.sales_order_items (
      sales_order_id, title_id, publisher_organization_id, quantity,
      unit_msrp_cents, discount_rate, unit_wholesale_cents, line_total_cents
    ) values (
      created_order.id, catalog_title.id, catalog_title.publisher_organization_id, requested_quantity,
      catalog_title.msrp_cents, retailer_discount, wholesale_cents, wholesale_cents * requested_quantity
    );
    msrp_total := msrp_total + (catalog_title.msrp_cents * requested_quantity);
    subtotal_total := subtotal_total + (wholesale_cents * requested_quantity);
  end loop;

  update public.sales_orders set
    catalog_cycle_id = case when (
      select count(distinct t.catalog_cycle_id)
      from public.sales_order_items line join public.titles t on t.id = line.title_id
      where line.sales_order_id = created_order.id
    ) = 1 then (
      select t.catalog_cycle_id
      from public.sales_order_items line join public.titles t on t.id = line.title_id
      where line.sales_order_id = created_order.id
      limit 1
    ) else null end,
    msrp_total_cents = msrp_total,
    discount_total_cents = msrp_total - subtotal_total,
    subtotal_cents = subtotal_total,
    amount_due_cents = subtotal_total
  where id = created_order.id
  returning * into created_order;

  insert into public.invoices (organization_id, sales_order_id, status, currency, subtotal_cents, total_cents)
  values (retailer_org, created_order.id, 'open', created_order.currency, subtotal_total, subtotal_total)
  returning * into created_invoice;

  return query select created_order.id, created_order.order_number, created_invoice.id, created_order.amount_due_cents, created_order.currency;
end;
$$;

revoke all on function public.create_retailer_checkout_draft(jsonb) from public;
grant execute on function public.create_retailer_checkout_draft(jsonb) to authenticated;

create or replace function public.finalize_stripe_checkout(
  requested_event_id text,
  requested_event_type text,
  requested_session_id text,
  requested_payment_intent text,
  requested_amount_cents integer,
  requested_currency text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_order public.sales_orders%rowtype;
  matched_invoice public.invoices%rowtype;
begin
  insert into public.stripe_webhook_events (event_id, event_type)
  values (requested_event_id, requested_event_type)
  on conflict (event_id) do nothing;
  if not found then return false; end if;

  select * into matched_order from public.sales_orders
  where stripe_checkout_session_id = requested_session_id for update;
  if matched_order.id is null then raise exception 'Stripe checkout order was not found.'; end if;
  if matched_order.amount_due_cents <> requested_amount_cents or lower(matched_order.currency) <> lower(requested_currency) then
    raise exception 'Stripe payment total does not match the order.';
  end if;
  select * into matched_invoice from public.invoices where sales_order_id = matched_order.id for update;

  update public.sales_orders set
    status = 'paid', payment_status = 'paid', placed_at = coalesce(placed_at, now()), submitted_at = coalesce(submitted_at, now())
  where id = matched_order.id;
  update public.invoices set status = 'paid', paid_at = coalesce(paid_at, now()) where id = matched_invoice.id;
  insert into public.payment_transactions (
    invoice_id, provider, provider_transaction_id, transaction_type, status,
    amount_cents, currency, processed_at, provider_payload
  ) values (
    matched_invoice.id, 'stripe', requested_payment_intent, 'charge', 'paid',
    requested_amount_cents, upper(requested_currency), now(),
    jsonb_build_object('checkout_session_id', requested_session_id, 'stripe_event_id', requested_event_id)
  ) on conflict (provider, provider_transaction_id) do nothing;
  return true;
end;
$$;

revoke all on function public.finalize_stripe_checkout(text,text,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.finalize_stripe_checkout(text,text,text,text,integer,text) to service_role;

commit;
