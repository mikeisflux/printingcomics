-- Server-authoritative retailer returns and one-time account credits.

begin;

create unique index if not exists account_credits_one_per_return_idx
  on public.account_credits(return_request_id)
  where return_request_id is not null;

create or replace function public.get_my_return_portal()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_user uuid := auth.uid();
  retailer_org uuid;
  retailer_tier text;
  maximum_returns integer;
  approved_returns integer;
  pending_returns integer;
begin
  if requested_user is null then raise exception 'Authentication required.'; end if;

  select membership.organization_id, profile.tier
    into retailer_org, retailer_tier
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
  maximum_returns := case retailer_tier when 'Tier III' then 8 when 'Tier II' then 4 else 2 end;

  select
    coalesce(sum(item.quantity) filter (where request.status in ('approved','received','credited','closed')), 0),
    coalesce(sum(item.quantity) filter (where request.status = 'requested'), 0)
    into approved_returns, pending_returns
  from public.return_requests request
  join public.return_items item on item.return_request_id = request.id
  where request.retailer_organization_id = retailer_org;

  return jsonb_build_object(
    'allowance', jsonb_build_object(
      'tier', retailer_tier,
      'maximum', maximum_returns,
      'approved', approved_returns,
      'pending', pending_returns,
      'remaining', greatest(0, maximum_returns - approved_returns - pending_returns)
    ),
    'creditBalanceCents', coalesce((
      select sum(credit.remaining_amount_cents)
      from public.account_credits credit
      where credit.organization_id = retailer_org
        and credit.status in ('available','partially_applied')
        and (credit.expires_at is null or credit.expires_at > now())
    ), 0),
    'returns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'returnId', request.id,
        'returnNumber', request.return_number,
        'orderId', sales_order.id,
        'orderNumber', sales_order.order_number,
        'titleId', title.id,
        'titleName', title.title,
        'qty', item.quantity,
        'reason', request.reason,
        'status', request.status,
        'requestedCreditCents', sales_item.unit_wholesale_cents * item.quantity,
        'approvedCreditCents', request.approved_credit_cents,
        'date', request.requested_at,
        'reviewedAt', request.reviewed_at
      ) order by request.requested_at desc)
      from public.return_requests request
      join public.sales_orders sales_order on sales_order.id = request.sales_order_id
      join public.return_items item on item.return_request_id = request.id
      join public.sales_order_items sales_item on sales_item.id = item.sales_order_item_id
      join public.titles title on title.id = sales_item.title_id
      where request.retailer_organization_id = retailer_org
    ), '[]'::jsonb),
    'eligibleItems', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', sales_item.id,
        'salesOrderItemId', sales_item.id,
        'orderId', sales_order.id,
        'orderNumber', sales_order.order_number,
        'orderDate', sales_order.placed_at,
        'titleId', title.id,
        'titleName', title.title,
        'purchasedQty', sales_item.quantity,
        'alreadyRequested', used.used_quantity,
        'availableQty', sales_item.quantity - used.used_quantity,
        'unitCreditCents', sales_item.unit_wholesale_cents
      ) order by sales_order.placed_at desc, title.title)
      from public.sales_orders sales_order
      join public.sales_order_items sales_item on sales_item.sales_order_id = sales_order.id
      join public.titles title on title.id = sales_item.title_id
      cross join lateral (
        select coalesce(sum(return_item.quantity), 0)::integer as used_quantity
        from public.return_items return_item
        join public.return_requests request on request.id = return_item.return_request_id
        where return_item.sales_order_item_id = sales_item.id
          and request.status <> 'denied'
      ) used
      where sales_order.retailer_organization_id = retailer_org
        and sales_order.payment_status = 'paid'
        and sales_order.status <> 'cancelled'
        and sales_item.quantity > used.used_quantity
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.request_my_return(
  requested_sales_order_item_id uuid,
  requested_quantity integer,
  requested_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_user uuid := auth.uid();
  retailer_org uuid;
  retailer_tier text;
  matched_order public.sales_orders%rowtype;
  matched_item public.sales_order_items%rowtype;
  existing_quantity integer;
  maximum_returns integer;
  allowance_used integer;
  created_return public.return_requests%rowtype;
begin
  if requested_user is null then raise exception 'Authentication required.'; end if;
  if requested_quantity is null or requested_quantity < 1 then raise exception 'Return quantity must be a whole number of at least 1.'; end if;
  if length(trim(coalesce(requested_reason, ''))) = 0 then raise exception 'Please provide a reason for the return.'; end if;

  select membership.organization_id, profile.tier
    into retailer_org, retailer_tier
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

  select item.* into matched_item
  from public.sales_order_items item
  where item.id = requested_sales_order_item_id
  for update;
  if matched_item.id is null then raise exception 'That purchased book was not found.'; end if;

  select * into matched_order
  from public.sales_orders sales_order
  where sales_order.id = matched_item.sales_order_id
  for update;
  if matched_order.retailer_organization_id <> retailer_org then raise exception 'That purchase belongs to another retailer.'; end if;
  if matched_order.payment_status <> 'paid' or matched_order.status = 'cancelled' then raise exception 'Only paid, active orders are eligible for return.'; end if;

  select coalesce(sum(item.quantity), 0)::integer into existing_quantity
  from public.return_items item
  join public.return_requests request on request.id = item.return_request_id
  where item.sales_order_item_id = matched_item.id
    and request.status <> 'denied';
  if requested_quantity > matched_item.quantity - existing_quantity then
    raise exception 'Only % purchased copies are still eligible for return.', greatest(0, matched_item.quantity - existing_quantity);
  end if;

  maximum_returns := case retailer_tier when 'Tier III' then 8 when 'Tier II' then 4 else 2 end;
  select coalesce(sum(item.quantity), 0)::integer into allowance_used
  from public.return_items item
  join public.return_requests request on request.id = item.return_request_id
  where request.retailer_organization_id = retailer_org
    and request.status <> 'denied';
  if requested_quantity > maximum_returns - allowance_used then
    raise exception 'Return limit exceeded. % allows % copies and % remain.', retailer_tier, maximum_returns, greatest(0, maximum_returns - allowance_used);
  end if;

  insert into public.return_requests (retailer_organization_id, sales_order_id, requested_by, reason)
  values (retailer_org, matched_order.id, requested_user, trim(requested_reason))
  returning * into created_return;
  insert into public.return_items (return_request_id, sales_order_item_id, quantity, reason)
  values (created_return.id, matched_item.id, requested_quantity, trim(requested_reason));

  return jsonb_build_object('returnId', created_return.id, 'returnNumber', created_return.return_number);
end;
$$;

create or replace function public.get_admin_returns_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.current_user_has_any_role(array['moos','admin']::public.app_role[]) then
    raise exception 'Return administration access denied.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'returnId', request.id,
      'returnNumber', request.return_number,
      'retailerId', request.retailer_organization_id,
      'retailerName', organization.name,
      'orderId', sales_order.id,
      'orderNumber', sales_order.order_number,
      'titleId', title.id,
      'titleName', title.title,
      'qty', item.quantity,
      'reason', request.reason,
      'status', request.status,
      'requestedCreditCents', sales_item.unit_wholesale_cents * item.quantity,
      'approvedCreditCents', request.approved_credit_cents,
      'date', request.requested_at,
      'reviewedAt', request.reviewed_at,
      'reviewNotes', request.review_notes
    ) order by request.requested_at desc)
    from public.return_requests request
    join public.organizations organization on organization.id = request.retailer_organization_id
    join public.sales_orders sales_order on sales_order.id = request.sales_order_id
    join public.return_items item on item.return_request_id = request.id
    join public.sales_order_items sales_item on sales_item.id = item.sales_order_item_id
    join public.titles title on title.id = sales_item.title_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.review_return_request(
  requested_return_id uuid,
  requested_decision text,
  requested_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewer uuid := auth.uid();
  matched_return public.return_requests%rowtype;
  credit_total integer;
begin
  if reviewer is null or not private.current_user_has_any_role(array['moos','admin']::public.app_role[]) then
    raise exception 'Return administration access denied.';
  end if;
  if requested_decision not in ('approved','denied') then raise exception 'Decision must be approved or denied.'; end if;

  select * into matched_return
  from public.return_requests request
  where request.id = requested_return_id
  for update;
  if matched_return.id is null then raise exception 'Return request not found.'; end if;
  if matched_return.status <> 'requested' then raise exception 'This return was already reviewed.'; end if;

  if requested_decision = 'denied' then
    update public.return_requests set
      status = 'denied', reviewed_by = reviewer, reviewed_at = now(), review_notes = nullif(trim(coalesce(requested_notes, '')), '')
    where id = matched_return.id;
    return jsonb_build_object('returnId', matched_return.id, 'status', 'denied', 'creditCents', 0);
  end if;

  select coalesce(sum(sales_item.unit_wholesale_cents * item.quantity), 0)::integer into credit_total
  from public.return_items item
  join public.sales_order_items sales_item on sales_item.id = item.sales_order_item_id
  where item.return_request_id = matched_return.id;

  update public.return_items item set
    approved_quantity = item.quantity,
    credit_cents = sales_item.unit_wholesale_cents * item.quantity
  from public.sales_order_items sales_item
  where item.return_request_id = matched_return.id and sales_item.id = item.sales_order_item_id;

  update public.return_requests set
    status = 'approved', reviewed_by = reviewer, reviewed_at = now(),
    review_notes = nullif(trim(coalesce(requested_notes, '')), ''), approved_credit_cents = credit_total
  where id = matched_return.id;

  if credit_total > 0 then
    insert into public.account_credits (
      organization_id, return_request_id, original_amount_cents, remaining_amount_cents, issued_by, notes
    ) values (
      matched_return.retailer_organization_id, matched_return.id, credit_total, credit_total, reviewer,
      'Credit issued for approved return ' || matched_return.return_number
    );
  end if;

  return jsonb_build_object('returnId', matched_return.id, 'status', 'approved', 'creditCents', credit_total);
end;
$$;

revoke all on function public.get_my_return_portal() from public;
revoke all on function public.request_my_return(uuid, integer, text) from public;
revoke all on function public.get_admin_returns_dashboard() from public;
revoke all on function public.review_return_request(uuid, text, text) from public;
grant execute on function public.get_my_return_portal() to authenticated;
grant execute on function public.request_my_return(uuid, integer, text) to authenticated;
grant execute on function public.get_admin_returns_dashboard() to authenticated;
grant execute on function public.review_return_request(uuid, text, text) to authenticated;

commit;
