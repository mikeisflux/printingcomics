import Stripe from 'npm:stripe@^22';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '');
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const service = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed.', { status: 405 });
  const signature = request.headers.get('stripe-signature') ?? '';
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
      undefined,
      cryptoProvider
    );
  } catch (error) {
    console.error('Stripe signature verification failed', error);
    return new Response('Bad signature.', { status: 400 });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== 'paid') return Response.json({ received: true });
    const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!paymentIntent || !session.amount_total || !session.currency) return new Response('Incomplete payment event.', { status: 400 });
    const { error } = await service.rpc('finalize_stripe_checkout', {
      requested_event_id: event.id,
      requested_event_type: event.type,
      requested_session_id: session.id,
      requested_payment_intent: paymentIntent,
      requested_amount_cents: session.amount_total,
      requested_currency: session.currency
    });
    if (error) {
      console.error('Stripe checkout finalization failed', error);
      return new Response('Payment finalization failed.', { status: 500 });
    }
  }
  return Response.json({ received: true });
});
