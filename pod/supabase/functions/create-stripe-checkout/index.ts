import Stripe from 'npm:stripe@^22';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const siteUrl = (Deno.env.get('PHILBO_SITE_URL') ?? '').replace(/\/$/, '');
const allowedOrigins = (Deno.env.get('PHILBO_ALLOWED_ORIGINS') ?? siteUrl)
  .split(',').map(value => value.trim()).filter(Boolean);
const stripe = new Stripe(stripeSecretKey);

function responseHeaders(origin: string | null) {
  const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin'
  };
}

Deno.serve(async request => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: responseHeaders(origin) });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: responseHeaders(origin) });
  if (!stripeSecretKey || !siteUrl) return Response.json({ error: 'Payments are not configured.' }, { status: 503, headers: responseHeaders(origin) });

  let orderId: string | null = null;
  try {
    const authorization = request.headers.get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) throw new Error('Sign in before checking out.');
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) throw new Error('Sign in before checking out.');

    const payload = await request.json();
    if (payload.applyCredit || String(payload.couponCode ?? '').trim()) {
      throw new Error('Credits and coupon codes require staff review during the first live payment release.');
    }
    const items = Array.isArray(payload.items) ? payload.items.map(item => ({
      titleId: String(item.titleId ?? ''), quantity: Number(item.quantity)
    })) : [];
    const { data: rows, error: draftError } = await userClient.rpc('create_retailer_checkout_draft', { requested_items: items });
    if (draftError || !rows?.[0]) throw new Error(draftError?.message || 'The order could not be prepared.');
    const draft = rows[0];
    orderId = draft.order_id;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: draft.order_id,
      customer_email: authData.user.email ?? undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: String(draft.currency).toLowerCase(),
          unit_amount: draft.amount_due_cents,
          product_data: { name: `Philbo Distribution order ${draft.order_number}` }
        }
      }],
      metadata: { sales_order_id: draft.order_id, order_number: draft.order_number },
      success_url: `${siteUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}#retailer`,
      cancel_url: `${siteUrl}/?checkout=cancelled#retailer`
    }, { idempotencyKey: `philbo-${draft.order_id}` });

    const { error: updateError } = await admin.from('sales_orders')
      .update({ stripe_checkout_session_id: session.id }).eq('id', draft.order_id);
    if (updateError) throw new Error(updateError.message);
    return Response.json({ url: session.url }, { headers: responseHeaders(origin) });
  } catch (error) {
    if (orderId && serviceRoleKey) {
      const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      await admin.from('sales_orders').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', orderId).eq('status', 'draft');
      await admin.from('invoices').update({ status: 'void' }).eq('sales_order_id', orderId).eq('status', 'open');
    }
    const message = error instanceof Error ? error.message : 'Checkout could not be started.';
    return Response.json({ error: message }, { status: 400, headers: responseHeaders(origin) });
  }
});
