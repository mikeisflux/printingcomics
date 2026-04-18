import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PayPalButtons,
  PayPalCardFieldsForm,
  PayPalCardFieldsProvider,
  PayPalScriptProvider,
  usePayPalCardFields,
} from '@paypal/react-paypal-js';
import { api, formatMoney } from '../api/client';
import { useCart } from '../store/cart';
import { useAuth } from '../store/auth';
import { formatCartItemOptions } from '../lib/cart-options';

interface Address {
  firstName: string; lastName: string; line1: string; line2?: string;
  city: string; region: string; postalCode: string; country: string; phone?: string;
}

const emptyAddress: Address = {
  firstName: '', lastName: '', line1: '', line2: '', city: '', region: '', postalCode: '', country: 'US', phone: '',
};

export function PaypalCheckout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { cart, load, subtotal } = useCart();

  const [paypalClientId, setPaypalClientId] = useState<string | null>(null);
  const [enableCard, setEnableCard] = useState(true);
  const [enableButton, setEnableButton] = useState(true);
  const [env, setEnv] = useState<'sandbox' | 'live'>('sandbox');

  const [email, setEmail] = useState('');
  const [ship, setShip] = useState<Address>(emptyAddress);
  const [bill, setBill] = useState<Address>(emptyAddress);
  const [sameAsShip, setSameAsShip] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (user?.email) setEmail(user.email); }, [user]);

  // Fetch PayPal config from the API (reads from admin settings).
  useEffect(() => {
    void fetch('/api/config/paypal', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (!j) return;
        setPaypalClientId(j.clientId);
        setEnableCard(j.enableCard);
        setEnableButton(j.enableButton);
        setEnv(j.environment);
      })
      .catch(() => undefined);
  }, []);

  const canCheckout = !!email && !!ship.line1 && !!ship.city && !!ship.postalCode && !!(cart?.items.length);

  const createOrder = async (): Promise<string> => {
    setError(null);
    const r = await api.post<{ paypalOrderId: string; orderNumber: string }>('/checkout/paypal/create', {
      email,
      shippingAddress: ship,
      billingAddress: sameAsShip ? ship : bill,
    });
    return r.paypalOrderId;
  };

  const onApprove = async (data: { orderID: string }) => {
    try {
      const r = await api.post<{ orderNumber: string }>(`/checkout/paypal/capture/${data.orderID}`);
      navigate(`/order/${r.orderNumber}`);
    } catch (e: any) {
      setError(e.message ?? 'Capture failed');
    }
  };

  if (!paypalClientId) {
    return (
      <div className="container" style={{ padding: '2rem 0' }}>
        <h1>Checkout</h1>
        <div className="error">
          PayPal is not yet configured. Set the credentials in Admin → Settings → Payments.
        </div>
      </div>
    );
  }

  const items = cart?.items ?? [];
  const sub = subtotal();

  return (
    <div className="container" style={{ padding: '2rem 0', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
      <div>
        <h1>Checkout</h1>

        <h3 style={{ marginTop: '2rem' }}>Contact</h3>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

        <h3 style={{ marginTop: '2rem' }}>Shipping</h3>
        <AddressForm value={ship} onChange={setShip} />

        <h3 style={{ marginTop: '2rem' }}>Billing</h3>
        <label>
          <input type="checkbox" checked={sameAsShip} onChange={(e) => setSameAsShip(e.target.checked)} style={{ width: 'auto', marginRight: '.5rem' }} />
          Same as shipping
        </label>
        {!sameAsShip && <AddressForm value={bill} onChange={setBill} />}

        <h3 style={{ marginTop: '2rem' }}>Payment</h3>
        {error && <div className="error">{error}</div>}

        {!canCheckout ? (
          <p className="muted">Fill in the email and shipping address to enable payment.</p>
        ) : (
          <PayPalScriptProvider
            options={{
              clientId: paypalClientId,
              currency: 'USD',
              intent: 'capture',
              components: `buttons${enableCard ? ',card-fields' : ''}`,
              environment: env === 'live' ? 'production' : 'sandbox',
            }}
          >
            {enableButton && (
              <div style={{ marginBottom: '1rem' }}>
                <PayPalButtons
                  style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' }}
                  createOrder={createOrder}
                  onApprove={onApprove}
                  onError={(err) => setError(String(err))}
                />
              </div>
            )}

            {enableCard && (
              <div className="admin-card">
                <h4>Pay with card</h4>
                <PayPalCardFieldsProvider createOrder={createOrder} onApprove={onApprove} onError={(err) => setError(String(err))}>
                  <PayPalCardFieldsForm />
                  <SubmitCardButton />
                </PayPalCardFieldsProvider>
              </div>
            )}
          </PayPalScriptProvider>
        )}
      </div>

      <aside>
        <div className="admin-card">
          <h3>Order summary</h3>
          {items.map((i) => {
            const pairs = formatCartItemOptions(i);
            return (
              <div key={i.id} style={{ padding: '.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <div className="spread">
                  <span>{i.product.name} × {i.quantity}</span>
                  <span>{formatMoney(i.unitPriceCents * i.quantity)}</span>
                </div>
                {pairs.length > 0 && (
                  <ul className="muted" style={{ fontSize: '.8rem', margin: '.25rem 0 0', paddingLeft: '1rem' }}>
                    {pairs.map((p, j) => (
                      <li key={j}>{p.label}: {p.value}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          <div className="spread" style={{ padding: '.75rem 0', fontWeight: 700, fontSize: '1.1rem', borderTop: '1px solid var(--border)' }}>
            <span>Subtotal</span><span>{formatMoney(sub)}</span>
          </div>
          <p className="muted" style={{ fontSize: '.8rem' }}>
            Shipping + tax calculated after payment authorization on PayPal's review page.
          </p>
        </div>
      </aside>
    </div>
  );
}

function SubmitCardButton() {
  const { cardFieldsForm } = usePayPalCardFields();
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (!cardFieldsForm) return;
    setSubmitting(true);
    try { await cardFieldsForm.submit(); }
    catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  };
  return (
    <button className="btn" style={{ marginTop: '1rem', width: '100%' }} onClick={submit} disabled={submitting}>
      {submitting ? 'Processing…' : 'Pay with card'}
    </button>
  );
}

function AddressForm({ value, onChange }: { value: Address; onChange: (v: Address) => void }) {
  const set = (patch: Partial<Address>) => onChange({ ...value, ...patch });
  return (
    <div>
      <div className="grid-2">
        <div><label>First name</label><input value={value.firstName} onChange={(e) => set({ firstName: e.target.value })} /></div>
        <div><label>Last name</label><input value={value.lastName} onChange={(e) => set({ lastName: e.target.value })} /></div>
      </div>
      <label>Street</label>
      <input value={value.line1} onChange={(e) => set({ line1: e.target.value })} />
      <label>Apt / suite (optional)</label>
      <input value={value.line2 ?? ''} onChange={(e) => set({ line2: e.target.value })} />
      <div className="grid-2">
        <div><label>City</label><input value={value.city} onChange={(e) => set({ city: e.target.value })} /></div>
        <div><label>State / region</label><input value={value.region} onChange={(e) => set({ region: e.target.value })} /></div>
      </div>
      <div className="grid-2">
        <div><label>Postal code</label><input value={value.postalCode} onChange={(e) => set({ postalCode: e.target.value })} /></div>
        <div><label>Country</label><input value={value.country} onChange={(e) => set({ country: e.target.value })} /></div>
      </div>
    </div>
  );
}
