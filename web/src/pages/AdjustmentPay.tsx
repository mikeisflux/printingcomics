import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PayPalScriptProvider, PayPalButtons, PayPalCardFieldsProvider, PayPalCardFieldsForm, usePayPalCardFields } from '@paypal/react-paypal-js';
import { api, ApiError, formatMoney } from '../api/client';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/**
 * /pay/:token — the customer side of a staff-made change to a paid order.
 * Shows exactly what changed and the difference, then takes the balance
 * through PayPal. The change is applied to the order the moment the capture
 * completes; nothing moves until then.
 */

interface Diff { label: string; from: string; to: string }
interface Change { itemName: string; quantity: number; diff: Diff[]; beforeTotalCents: number; afterTotalCents: number }
interface Totals { subtotalCents: number; discountCents: number; taxCents: number; shippingCents: number; totalCents: number }
interface Adjustment {
  status: 'pending' | 'paid' | 'applied' | 'cancelled' | 'expired';
  amountCents: number;
  note: string | null;
  changes: Change[];
  totals: { before: Totals; after: Totals };
  orderNumber: string;
  paidAt: string | null;
  expiresAt: string;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message || 'Payment failed. Please try again.';
  const m = (err as any)?.message;
  return typeof m === 'string' && m ? m : 'Payment failed. Please try again.';
}

function SubmitCardButton({ onError }: { onError: (m: string) => void }) {
  const { cardFieldsForm } = usePayPalCardFields();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn"
      style={{ marginTop: '1rem', width: '100%' }}
      disabled={busy || !cardFieldsForm}
      onClick={async () => {
        if (!cardFieldsForm) return;
        setBusy(true);
        try {
          const state = await cardFieldsForm.getState();
          if (!state.isFormValid) { onError('Please check the card number, expiry and security code.'); return; }
          await cardFieldsForm.submit();
        } catch (e) { onError(describeError(e)); } finally { setBusy(false); }
      }}
    >
      {busy ? 'Processing…' : 'Pay with card'}
    </button>
  );
}

export function AdjustmentPay() {
  const { token } = useParams();
  useDocumentTitle('Pay balance');

  const [adj, setAdj] = useState<Adjustment | null>(null);
  const [storeName, setStoreName] = useState('Printing Comics');
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const [paypal, setPaypal] = useState<{ clientId: string | null; environment: string; enableCard: boolean; enableButton: boolean } | null>(null);

  useEffect(() => {
    if (!token) { setNotFound(true); return; }
    api.get<{ adjustment: Adjustment; storeName: string }>(`/adjustments/${token}`)
      .then((r) => { setAdj(r.adjustment); setStoreName(r.storeName); })
      .catch((e) => { if (e instanceof ApiError && e.status === 404) setNotFound(true); else setError(describeError(e)); });
    api.get<{ clientId: string | null; environment: string; enableCard: boolean; enableButton: boolean }>('/config/paypal')
      .then(setPaypal)
      .catch(() => setPaypal({ clientId: null, environment: 'sandbox', enableCard: false, enableButton: false }));
  }, [token]);

  const createOrder = async (): Promise<string> => {
    setError(null);
    try {
      const r = await api.post<{ paypalOrderId: string }>(`/adjustments/${token}/paypal/create`);
      return r.paypalOrderId;
    } catch (e) { setError(describeError(e)); throw e; }
  };
  const onApprove = async (data: { orderID: string }, actions?: { restart?: () => unknown }) => {
    setError(null);
    try {
      await api.post(`/adjustments/${token}/paypal/capture/${data.orderID}`);
      setPaid(true);
    } catch (e) {
      setError(describeError(e));
      if (e instanceof ApiError && (e.details as any)?.issue === 'INSTRUMENT_DECLINED' && actions?.restart) void actions.restart();
    }
  };

  const PAGE = { padding: '2.5rem 0', maxWidth: 680 } as const;

  if (notFound) {
    return (
      <div className="container" style={PAGE}>
        <h1>We couldn't find that payment link</h1>
        <p className="muted">It may have been replaced by a newer one. Reply to our email and we'll send a fresh link.</p>
        <Link to="/" className="btn secondary">Back to home</Link>
      </div>
    );
  }
  if (!adj) return <div className="container" style={PAGE}>{error ? <div className="error">{error}</div> : 'Loading…'}</div>;

  const done = paid || adj.status === 'paid' || adj.status === 'applied';

  return (
    <div className="container" style={PAGE}>
      <h1 style={{ marginBottom: '.25rem' }}>{done ? 'Payment received' : 'A change to your order'}</h1>
      <p className="muted" style={{ marginTop: 0 }}>Order {adj.orderNumber}</p>

      {adj.note && !done && (
        <div className="admin-card" style={{ background: 'var(--bg-alt)' }}>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{adj.note}</p>
        </div>
      )}

      <div className="admin-card">
        <h3 style={{ marginTop: 0 }}>What changed</h3>
        {adj.changes.map((c, i) => (
          <div key={i} style={{ padding: '.75rem 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontWeight: 700 }}>{c.itemName} <span className="muted">× {c.quantity}</span></div>
            <ul style={{ margin: '.35rem 0 0', paddingLeft: '1.1rem' }}>
              {c.diff.map((d, j) => (
                <li key={j}>{d.label}: <span className="muted" style={{ textDecoration: 'line-through' }}>{d.from}</span> → <strong>{d.to}</strong></li>
              ))}
            </ul>
            <div className="muted" style={{ fontSize: '.85rem', marginTop: '.3rem' }}>
              Line: {formatMoney(c.beforeTotalCents)} → {formatMoney(c.afterTotalCents)}
            </div>
          </div>
        ))}
        <table style={{ width: '100%', marginTop: '1rem', fontSize: '.95rem' }}>
          <tbody>
            <tr><td>Order total before</td><td style={{ textAlign: 'right' }}>{formatMoney(adj.totals.before.totalCents)}</td></tr>
            <tr><td>Order total after</td><td style={{ textAlign: 'right' }}>{formatMoney(adj.totals.after.totalCents)}</td></tr>
            <tr style={{ fontWeight: 800, fontSize: '1.15rem' }}>
              <td style={{ paddingTop: '.5rem' }}>{done ? 'Paid' : 'Difference due'}</td>
              <td style={{ paddingTop: '.5rem', textAlign: 'right' }}>{formatMoney(adj.amountCents)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {done ? (
        <div className="admin-card" style={{ background: '#d4f5dc', border: '1px solid #166534' }}>
          <p style={{ margin: 0 }}>Thanks — your order has been updated and a receipt is on its way to your inbox.</p>
        </div>
      ) : adj.status === 'cancelled' ? (
        <div className="admin-card"><p style={{ margin: 0 }}>This request was cancelled — your order is unchanged. Nothing to do.</p></div>
      ) : adj.status === 'expired' ? (
        <div className="admin-card"><p style={{ margin: 0 }}>This link has expired. Reply to our email and we'll send a new one.</p></div>
      ) : (
        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>Pay {formatMoney(adj.amountCents)}</h3>
          <p className="muted" style={{ fontSize: '.9rem' }}>The change is applied to your order as soon as the payment goes through.</p>
          {error && <div className="error">{error}</div>}
          {!paypal ? (
            <p className="muted">Loading payment options…</p>
          ) : !paypal.clientId ? (
            <div className="error">Payments aren't configured right now — please reply to our email.</div>
          ) : (
            <PayPalScriptProvider
              options={{
                clientId: paypal.clientId,
                currency: 'USD',
                intent: 'capture',
                components: `buttons${paypal.enableCard ? ',card-fields' : ''}`,
                environment: paypal.environment === 'live' ? 'production' : 'sandbox',
              }}
            >
              {paypal.enableButton && (
                <div style={{ marginBottom: '1rem' }}>
                  <PayPalButtons
                    style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' }}
                    createOrder={createOrder}
                    onApprove={onApprove}
                    onError={(err) => setError((prev) => prev ?? describeError(err))}
                  />
                </div>
              )}
              {paypal.enableCard && (
                <div>
                  <h4>Pay with card</h4>
                  <PayPalCardFieldsProvider createOrder={createOrder} onApprove={onApprove} onError={(err) => setError((prev) => prev ?? describeError(err))}>
                    <PayPalCardFieldsForm />
                    <SubmitCardButton onError={setError} />
                  </PayPalCardFieldsProvider>
                </div>
              )}
            </PayPalScriptProvider>
          )}
        </div>
      )}

      <p className="muted" style={{ fontSize: '.85rem', marginTop: '1rem' }}>{storeName}</p>
    </div>
  );
}
