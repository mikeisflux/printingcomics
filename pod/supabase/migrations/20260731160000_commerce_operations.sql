-- Philbo shared commerce and operational backend.
-- Replaces browser-local ordering, returns, credits, inventory, and PO records.

begin;

create type public.sales_order_status as enum ('draft', 'submitted', 'paid', 'processing', 'partially_fulfilled', 'fulfilled', 'cancelled');
create type public.payment_status as enum ('pending', 'authorized', 'paid', 'failed', 'partially_refunded', 'refunded', 'void');
create type public.purchase_order_status as enum ('draft', 'official', 'acknowledged', 'in_production', 'shipped', 'closed', 'cancelled');
create type public.return_status as enum ('requested', 'approved', 'denied', 'received', 'credited', 'closed');
create type public.credit_status as enum ('available', 'partially_applied', 'applied', 'expired', 'void');
create type public.fulfillment_status as enum ('pending', 'picking', 'packed', 'shipped', 'delivered', 'cancelled');
create type public.invoice_status as enum ('draft', 'open', 'paid', 'past_due', 'void', 'refunded');

create sequence public.sales_order_number_seq start 1001;
create sequence public.purchase_order_number_seq start 1001;
create sequence public.return_number_seq start 1001;
create sequence public.invoice_number_seq start 1001;

create table public.retailer_profiles (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  tier text not null default 'Tier I',
  discount_rate numeric(5,4) not null default 0 check (discount_rate between 0 and 1),
  credit_limit_cents integer not null default 0 check (credit_limit_cents >= 0),
  resale_certificate_object_path text,
  resale_certificate_status text not null default 'not_submitted' check (resale_certificate_status in ('not_submitted','pending','approved','rejected','expired')),
  resale_certificate_expires_on date,
  tax_exempt boolean not null default false,
  sales_channels text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.publisher_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  publisher_organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, publisher_organization_id)
);

create table public.saved_titles (
  user_id uuid not null references auth.users(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  desired_quantity integer not null default 1 check (desired_quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

create table public.standing_order_lines (
  id uuid primary key default gen_random_uuid(),
  retailer_organization_id uuid not null references public.organizations(id) on delete restrict,
  title_id uuid not null references public.titles(id) on delete restrict,
  regular_quantity integer not null check (regular_quantity > 0),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (retailer_organization_id, title_id)
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code))),
  description text,
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value integer not null check (discount_value > 0),
  minimum_subtotal_cents integer not null default 0 check (minimum_subtotal_cents >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  maximum_redemptions integer check (maximum_redemptions is null or maximum_redemptions > 0),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value <= 10000),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('SO-' || lpad(nextval('public.sales_order_number_seq')::text, 6, '0')),
  retailer_organization_id uuid not null references public.organizations(id) on delete restrict,
  catalog_cycle_id uuid references public.catalog_cycles(id) on delete restrict,
  placed_by uuid not null references auth.users(id) on delete restrict,
  placed_at timestamptz,
  status public.sales_order_status not null default 'draft',
  payment_status public.payment_status not null default 'pending',
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  msrp_total_cents integer not null default 0 check (msrp_total_cents >= 0),
  discount_total_cents integer not null default 0 check (discount_total_cents >= 0),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  credit_applied_cents integer not null default 0 check (credit_applied_cents >= 0),
  amount_due_cents integer not null default 0 check (amount_due_cents >= 0),
  coupon_id uuid references public.coupons(id) on delete restrict,
  customer_notes text,
  internal_notes text,
  submitted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'draft' or placed_at is not null)
);

create table public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete restrict,
  publisher_organization_id uuid not null references public.organizations(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_msrp_cents integer not null check (unit_msrp_cents >= 0),
  discount_rate numeric(5,4) not null default 0 check (discount_rate between 0 and 1),
  unit_wholesale_cents integer not null check (unit_wholesale_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  incentive_ratio integer check (incentive_ratio is null or incentive_ratio > 0),
  qualifies_for_incentive boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sales_order_id, title_id)
);

create table public.coupon_redemptions (
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  retailer_organization_id uuid not null references public.organizations(id) on delete restrict,
  redeemed_by uuid not null references auth.users(id) on delete restrict,
  discount_cents integer not null check (discount_cents >= 0),
  redeemed_at timestamptz not null default now(),
  primary key (coupon_id, sales_order_id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default ('INV-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sales_order_id uuid unique references public.sales_orders(id) on delete restrict,
  status public.invoice_status not null default 'draft',
  currency text not null default 'USD',
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  credit_cents integer not null default 0 check (credit_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  provider text not null,
  provider_transaction_id text,
  transaction_type text not null check (transaction_type in ('authorization','charge','refund','void')),
  status public.payment_status not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'USD',
  processed_at timestamptz,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_transaction_id)
);

create table public.publisher_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique default ('PO-' || lpad(nextval('public.purchase_order_number_seq')::text, 6, '0')),
  publisher_organization_id uuid not null references public.organizations(id) on delete restrict,
  catalog_cycle_id uuid not null references public.catalog_cycles(id) on delete restrict,
  status public.purchase_order_status not null default 'draft',
  total_units integer not null default 0 check (total_units >= 0),
  total_cost_cents integer not null default 0 check (total_cost_cents >= 0),
  generated_by uuid not null references auth.users(id) on delete restrict,
  generated_at timestamptz not null default now(),
  official_at timestamptz,
  acknowledged_at timestamptz,
  publisher_notes text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (publisher_organization_id, catalog_cycle_id)
);

create table public.publisher_purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.publisher_purchase_orders(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost_cents integer not null check (unit_cost_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  created_at timestamptz not null default now(),
  unique (purchase_order_id, title_id)
);

create table public.return_requests (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique default ('RET-' || lpad(nextval('public.return_number_seq')::text, 6, '0')),
  retailer_organization_id uuid not null references public.organizations(id) on delete restrict,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  status public.return_status not null default 'requested',
  reason text not null,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  approved_credit_cents integer not null default 0 check (approved_credit_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.return_items (
  id uuid primary key default gen_random_uuid(),
  return_request_id uuid not null references public.return_requests(id) on delete cascade,
  sales_order_item_id uuid not null references public.sales_order_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  condition text,
  reason text,
  approved_quantity integer check (approved_quantity is null or approved_quantity >= 0),
  credit_cents integer not null default 0 check (credit_cents >= 0),
  created_at timestamptz not null default now(),
  unique (return_request_id, sales_order_item_id)
);

create table public.account_credits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  return_request_id uuid references public.return_requests(id) on delete restrict,
  status public.credit_status not null default 'available',
  original_amount_cents integer not null check (original_amount_cents > 0),
  remaining_amount_cents integer not null check (remaining_amount_cents >= 0),
  issued_by uuid not null references auth.users(id) on delete restrict,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (remaining_amount_cents <= original_amount_cents)
);

create table public.credit_applications (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.account_credits(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  applied_by uuid not null references auth.users(id) on delete restrict,
  applied_at timestamptz not null default now(),
  unique (credit_id, invoice_id)
);

create table public.inventory (
  title_id uuid primary key references public.titles(id) on delete restrict,
  on_hand_quantity integer not null default 0 check (on_hand_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  reorder_point integer not null default 0 check (reorder_point >= 0),
  location_code text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reserved_quantity <= on_hand_quantity)
);

create table public.fulfillments (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  status public.fulfillment_status not null default 'pending',
  carrier text,
  service_level text,
  tracking_number text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fulfillment_items (
  fulfillment_id uuid not null references public.fulfillments(id) on delete cascade,
  sales_order_item_id uuid not null references public.sales_order_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  primary key (fulfillment_id, sales_order_item_id)
);

create index sales_orders_retailer_idx on public.sales_orders(retailer_organization_id, created_at desc);
create index sales_orders_cycle_idx on public.sales_orders(catalog_cycle_id, status);
create index sales_order_items_order_idx on public.sales_order_items(sales_order_id);
create index sales_order_items_publisher_idx on public.sales_order_items(publisher_organization_id, title_id);
create index publisher_pos_publisher_idx on public.publisher_purchase_orders(publisher_organization_id, created_at desc);
create index returns_retailer_idx on public.return_requests(retailer_organization_id, requested_at desc);
create index credits_organization_idx on public.account_credits(organization_id, status);
create index fulfillments_order_idx on public.fulfillments(sales_order_id);

create function private.validate_sales_order_item()
returns trigger language plpgsql set search_path = '' as $$
declare expected_publisher uuid;
begin
  select publisher_organization_id into expected_publisher from public.titles where id = new.title_id;
  if expected_publisher is null or expected_publisher <> new.publisher_organization_id then
    raise exception 'Sales order item publisher must match the title publisher.';
  end if;
  new.line_total_cents = new.unit_wholesale_cents * new.quantity;
  return new;
end;
$$;

create function private.protect_submitted_sales_order()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status <> 'draft' and not private.current_user_has_any_role(array['moos','admin']::public.app_role[]) then
    raise exception 'Submitted orders may only be changed by Philbo staff.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger sales_order_items_validate before insert or update on public.sales_order_items
for each row execute function private.validate_sales_order_item();
create trigger sales_orders_protect_submitted before update or delete on public.sales_orders
for each row execute function private.protect_submitted_sales_order();

create trigger retailer_profiles_set_updated_at before update on public.retailer_profiles for each row execute function private.set_updated_at();
create trigger saved_titles_set_updated_at before update on public.saved_titles for each row execute function private.set_updated_at();
create trigger standing_order_lines_set_updated_at before update on public.standing_order_lines for each row execute function private.set_updated_at();
create trigger coupons_set_updated_at before update on public.coupons for each row execute function private.set_updated_at();
create trigger sales_orders_set_updated_at before update on public.sales_orders for each row execute function private.set_updated_at();
create trigger sales_order_items_set_updated_at before update on public.sales_order_items for each row execute function private.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices for each row execute function private.set_updated_at();
create trigger publisher_pos_set_updated_at before update on public.publisher_purchase_orders for each row execute function private.set_updated_at();
create trigger return_requests_set_updated_at before update on public.return_requests for each row execute function private.set_updated_at();
create trigger account_credits_set_updated_at before update on public.account_credits for each row execute function private.set_updated_at();
create trigger inventory_set_updated_at before update on public.inventory for each row execute function private.set_updated_at();
create trigger fulfillments_set_updated_at before update on public.fulfillments for each row execute function private.set_updated_at();

alter table public.retailer_profiles enable row level security;
alter table public.publisher_follows enable row level security;
alter table public.saved_titles enable row level security;
alter table public.standing_order_lines enable row level security;
alter table public.coupons enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.invoices enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.publisher_purchase_orders enable row level security;
alter table public.publisher_purchase_order_items enable row level security;
alter table public.return_requests enable row level security;
alter table public.return_items enable row level security;
alter table public.account_credits enable row level security;
alter table public.credit_applications enable row level security;
alter table public.inventory enable row level security;
alter table public.fulfillments enable row level security;
alter table public.fulfillment_items enable row level security;

create policy retailer_profiles_scoped on public.retailer_profiles for select to authenticated
using (private.current_user_is_member(organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy retailer_profiles_admin_manage on public.retailer_profiles for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

create policy publisher_follows_own on public.publisher_follows for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid() and private.current_user_has_role('retailer'));
create policy saved_titles_own on public.saved_titles for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid() and private.current_user_has_role('retailer'));
create policy standing_orders_scoped on public.standing_order_lines for all to authenticated
using (private.current_user_is_member(retailer_organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]))
with check ((private.current_user_is_member(retailer_organization_id) and created_by = auth.uid()) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

create policy coupons_authenticated_read on public.coupons for select to authenticated using (is_active or private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy coupons_admin_manage on public.coupons for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

create policy sales_orders_scoped_read on public.sales_orders for select to authenticated
using (private.current_user_is_member(retailer_organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy sales_orders_retailer_insert on public.sales_orders for insert to authenticated
with check (private.current_user_is_member(retailer_organization_id) and placed_by = auth.uid() and status = 'draft');
create policy sales_orders_retailer_update on public.sales_orders for update to authenticated
using (private.current_user_is_member(retailer_organization_id) and status = 'draft')
with check (private.current_user_is_member(retailer_organization_id) and placed_by = auth.uid() and status in ('draft','submitted'));
create policy sales_orders_admin_manage on public.sales_orders for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

create policy sales_order_items_scoped on public.sales_order_items for all to authenticated
using (exists (select 1 from public.sales_orders so where so.id = sales_order_id and (private.current_user_is_member(so.retailer_organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]))))
with check (exists (select 1 from public.sales_orders so where so.id = sales_order_id and ((private.current_user_is_member(so.retailer_organization_id) and so.status = 'draft') or private.current_user_has_any_role(array['moos','admin']::public.app_role[]))));

create policy coupon_redemptions_scoped_read on public.coupon_redemptions for select to authenticated
using (private.current_user_is_member(retailer_organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy coupon_redemptions_admin_manage on public.coupon_redemptions for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

create policy invoices_scoped_read on public.invoices for select to authenticated
using (private.current_user_is_member(organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy invoices_admin_manage on public.invoices for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy payments_admin_only on public.payment_transactions for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

create policy publisher_pos_scoped_read on public.publisher_purchase_orders for select to authenticated
using (private.current_user_is_member(publisher_organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy publisher_pos_admin_manage on public.publisher_purchase_orders for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy publisher_po_items_scoped_read on public.publisher_purchase_order_items for select to authenticated
using (exists (select 1 from public.publisher_purchase_orders po where po.id = purchase_order_id and (private.current_user_is_member(po.publisher_organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]))));
create policy publisher_po_items_admin_manage on public.publisher_purchase_order_items for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

create policy returns_scoped_read on public.return_requests for select to authenticated
using (private.current_user_is_member(retailer_organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy returns_retailer_insert on public.return_requests for insert to authenticated
with check (private.current_user_is_member(retailer_organization_id) and requested_by = auth.uid() and status = 'requested');
create policy returns_admin_manage on public.return_requests for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy return_items_scoped on public.return_items for all to authenticated
using (exists (select 1 from public.return_requests rr where rr.id = return_request_id and (private.current_user_is_member(rr.retailer_organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]))))
with check (exists (select 1 from public.return_requests rr where rr.id = return_request_id and ((private.current_user_is_member(rr.retailer_organization_id) and rr.status = 'requested') or private.current_user_has_any_role(array['moos','admin']::public.app_role[]))));

create policy credits_scoped_read on public.account_credits for select to authenticated
using (private.current_user_is_member(organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy credits_admin_manage on public.account_credits for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy credit_applications_scoped_read on public.credit_applications for select to authenticated
using (exists (select 1 from public.account_credits c where c.id = credit_id and (private.current_user_is_member(c.organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]))));
create policy credit_applications_admin_manage on public.credit_applications for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

create policy inventory_admin_manage on public.inventory for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy fulfillments_scoped_read on public.fulfillments for select to authenticated
using (exists (select 1 from public.sales_orders so where so.id = sales_order_id and (private.current_user_is_member(so.retailer_organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]))));
create policy fulfillments_admin_manage on public.fulfillments for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));
create policy fulfillment_items_scoped_read on public.fulfillment_items for select to authenticated
using (exists (select 1 from public.fulfillments f join public.sales_orders so on so.id = f.sales_order_id where f.id = fulfillment_id and (private.current_user_is_member(so.retailer_organization_id) or private.current_user_has_any_role(array['moos','admin']::public.app_role[]))));
create policy fulfillment_items_admin_manage on public.fulfillment_items for all to authenticated
using (private.current_user_has_any_role(array['moos','admin']::public.app_role[])) with check (private.current_user_has_any_role(array['moos','admin']::public.app_role[]));

revoke all on public.retailer_profiles, public.publisher_follows, public.saved_titles, public.standing_order_lines, public.coupons,
  public.sales_orders, public.sales_order_items, public.coupon_redemptions, public.invoices, public.payment_transactions,
  public.publisher_purchase_orders, public.publisher_purchase_order_items, public.return_requests, public.return_items,
  public.account_credits, public.credit_applications, public.inventory, public.fulfillments, public.fulfillment_items from anon, authenticated;
grant select, insert, update, delete on public.publisher_follows, public.saved_titles, public.standing_order_lines to authenticated;
grant select on public.retailer_profiles, public.coupons, public.invoices, public.publisher_purchase_orders, public.publisher_purchase_order_items,
  public.account_credits, public.credit_applications, public.inventory, public.fulfillments, public.fulfillment_items to authenticated;
grant select, insert, update, delete on public.sales_orders, public.sales_order_items, public.return_requests, public.return_items to authenticated;
grant insert, update, delete on public.retailer_profiles, public.coupons, public.invoices, public.publisher_purchase_orders,
  public.publisher_purchase_order_items, public.account_credits, public.credit_applications, public.inventory, public.fulfillments,
  public.fulfillment_items to authenticated;
grant select, insert, update, delete on public.payment_transactions, public.coupon_redemptions to authenticated;
grant usage, select on sequence public.sales_order_number_seq, public.purchase_order_number_seq, public.return_number_seq, public.invoice_number_seq to authenticated;

commit;
