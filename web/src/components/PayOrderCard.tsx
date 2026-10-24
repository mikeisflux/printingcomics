/**
 * Paying for an order staff set up: PayPal buttons and card fields on the
 * order's own page, reached from the emailed pay link. The server creates
 * the PayPal order for the stored total and captures it the same way the
 * storefront checkout does.
 */
import { useEffect, useState } from 'react';
import {
  PayPalButtons,
  PayPalCardFieldsForm,
  PayPalCardFieldsProvider,
  PayPalScriptProvider,
} from '@paypal/react-paypal-js';
import { api, ApiError, formatMoney } from '../api/client';
import { SubmitCardButton, describeError } from '../pages/PaypalCheckout';

interface PaypalConfig { clientId: string | null; environment: 'sandbox' | 'live'; enableCard: boolean; enableButton: boolean }

export function PayOrderCard({ number, viewToken, totalCents, onPaid }: {
  number: string;
  viewToken: string | null;
  totalCents: number;
  onPaid: (status: 'paid' | 'pending') => void;
}) {
  const [cfg, setCfg] = useState<PaypalConfig | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<'paid' | 'pending' | null>(null);

  useEffect(() => {
    void fetch('/api/config/paypal', { credentials: 'include' })
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(`API ${r.status}`))))
      .then((j) => setCfg({ clientId: j.clientId || null, environment: j.environment === 'live' ? 'live' : 'sandbox', enableCard: j.enableCard !== false, enableButton: j.enableButton !== false }))
      .catch((e) => setCfgError(String(e?.message ?? e)));
  }, []);

  const q = viewToken ? `?t=${encodeURIComponent(viewToken)}` : '';
  const createOrder = async (): Promise<string> => {
    setError(null);
    try {
      const r = await api.post<{ paypalOrderId: string }>(`/orders/${encodeURIComponent(number)}/pay/paypal/create${q}`);
      return r.paypalOrderId;
    } catch (e) {
      // The SDK swallows this into a generic onError; show the server's reason first.
      setError(describeError(e));
      throw e;
    }
  };
  const onApprove = async (data: { orderID: string }, actions?: { restart?: () => unknown }) => {
    setError(null);
    try {
      const r = await api.post<{ status: string }>(`/orders/${encodeURIComponent(number)}/pay/paypal/capture/${encodeURIComponent(data.orderID)}${q}`);
      const status = r.status === 'COMPLETED' ? 'paid' : 'pending';
      setResult(status);
      onPaid(status);
    } catch (e: any) {
      setError(describeError(e));
      // A declined instrument: let the buyer pick another card or funding source.
      if (e instanceof ApiError && (e.details as any)?.issue === 'INSTRUMENT_DECLINED' && actions?.restart) void actions.restart();
    }
  };

  const unavailable = !!cfgError || (!!cfg && !cfg.clientId);
  return (
    <section id="pay" className="admin-card pay-order" data-testid="pay-order" aria-label="Pay for this order">
      <div className="spread" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: '.5rem' }}>
        <h3 style={{ margin: 0 }}>Pay {formatMoney(totalCents)}</h3>
        <span className="muted" style={{ fontSize: '.85rem' }}>🔒 Secure payment · PayPal or any card · no account needed</span>
      </div>
      {result === 'paid' ? (
        <p style={{ margin: '.75rem 0 0', fontWeight: 600, color: '#166534' }}>Paid — thank you! Your confirmation is on its way by email.</p>
      ) : result === 'pending' ? (
        <div style={{ background: '#fff3cd', border: '1px solid #f0d58c', borderRadius: 8, padding: '.75rem 1rem', marginTop: '.75rem', fontSize: '.92rem' }}>
          <strong>PayPal accepted your payment and is still clearing it.</strong> We’ll email you the moment it does. Please don’t pay again.
        </div>
      ) : (
        <>
          {error && <div className="error" role="alert">{error}</div>}
          {unavailable ? (
            <p className="muted" style={{ margin: '.75rem 0 0' }}>Online payment isn’t available right now. Reply to the email you received and we’ll sort it out another way.</p>
          ) : !cfg ? (
            <p className="muted" style={{ margin: '.75rem 0 0' }}>Loading payment options…</p>
          ) : (
            <div style={{ marginTop: '1rem', maxWidth: 480 }}>
              <PayPalScriptProvider
                options={{
                  clientId: cfg.clientId!,
                  currency: 'USD',
                  intent: 'capture',
                  components: `buttons${cfg.enableCard ? ',card-fields' : ''}`,
                  environment: cfg.environment === 'live' ? 'production' : 'sandbox',
                }}
              >
                {cfg.enableButton && (
                  <div style={{ marginBottom: '1rem' }}>
                    <PayPalButtons
                      style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' }}
                      createOrder={createOrder}
                      onApprove={onApprove}
                      onError={(err) => setError((prev) => prev ?? describeError(err))}
                    />
                  </div>
                )}
                {cfg.enableCard && (
                  <div className="admin-card" style={{ margin: 0 }}>
                    <h4 style={{ marginTop: 0 }}>Pay with card</h4>
                    <PayPalCardFieldsProvider createOrder={createOrder} onApprove={onApprove} onError={(err) => setError((prev) => prev ?? describeError(err))}>
                      <PayPalCardFieldsForm />
                      <SubmitCardButton onError={(msg) => setError(msg)} />
                    </PayPalCardFieldsProvider>
                  </div>
                )}
              </PayPalScriptProvider>
            </div>
          )}
        </>
      )}
    </section>
  );
}
