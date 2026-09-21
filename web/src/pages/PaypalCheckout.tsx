import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PayPalButtons,
  PayPalCardFieldsForm,
  PayPalCardFieldsProvider,
  PayPalScriptProvider,
  usePayPalCardFields,
} from '@paypal/react-paypal-js';
import { api, ApiError, formatMoney } from '../api/client';
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
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [ship, setShip] = useState<Address>(emptyAddress);
  const [bill, setBill] = useState<Address>(emptyAddress);
  const [sameAsShip, setSameAsShip] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Discount code (applied before payment; stacks on top of the site-wide discount)
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountCents: number; description: string | null } | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  // Shipping rate selection
  interface ShipRate { id: string; name: string; rateCents: number; estimatedDays?: string | null }
  const [shipRates, setShipRates] = useState<ShipRate[]>([]);
  const [shipRateId, setShipRateId] = useState<string | null>(null);
  const [shipQuoting, setShipQuoting] = useState(false);
  const [shipWeightOz, setShipWeightOz] = useState<number | null>(null);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (user?.email) setEmail(user.email); }, [user]);
  // Live shipping quote. Rates depend on the parcel's real weight, so this
  // re-runs whenever the destination or the cart changes — a flat
  // country-only lookup would quote 50 books the same as one.
  useEffect(() => {
    if (!ship.country || !ship.postalCode || !cart?.items.length) { setShipRates([]); return; }
    let cancelled = false;
    setShipQuoting(true);
    const t = setTimeout(() => {
      void api.post<{ shippingOptions: ShipRate[]; shipmentWeightOz?: number }>('/checkout/quote', { shippingAddress: ship })
        .then((j) => {
          if (cancelled) return;
          const rates = j.shippingOptions ?? [];
          setShipRates(rates);
          setShipWeightOz(j.shipmentWeightOz ?? null);
          setShipRateId((cur) => (cur && rates.some((r) => r.id === cur) ? cur : rates[0]?.id ?? null));
        })
        .catch(() => { if (!cancelled) setShipRates([]); })
        .finally(() => { if (!cancelled) setShipQuoting(false); });
    }, 400); // debounce while the address is being typed
    return () => { cancelled = true; clearTimeout(t); setShipQuoting(false); };
  }, [ship.country, ship.postalCode, ship.region, ship.city, ship.line1, cart?.items.length, subtotal()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch PayPal config from the API (reads from admin settings).
  useEffect(() => {
    void fetch('/api/config/paypal', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) { setConfigError(`API ${r.status}`); return null; }
        return r.json();
      })
      .then((j) => {
        setConfigLoaded(true);
        if (!j) return;
        setPaypalClientId(j.clientId || null);
        setEnableCard(j.enableCard);
        setEnableButton(j.enableButton);
        setEnv(j.environment);
      })
      .catch((e) => { setConfigError(String(e)); setConfigLoaded(true); });
  }, []);

  const canCheckout = !!email && !!ship.line1 && !!ship.city && !!ship.postalCode && !!(cart?.items.length);

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponBusy(true);
    setCouponMsg(null);
    try {
      const r = await api.post<{ ok: boolean; code: string; description: string | null; discountCents: number; reason: string | null }>(
        '/checkout/validate-coupon',
        { code },
      );
      if (r.ok) {
        setAppliedCoupon({ code: r.code, discountCents: r.discountCents, description: r.description });
        setCouponMsg(null);
      } else {
        setAppliedCoupon(null);
        setCouponMsg(r.reason ?? 'That code isn’t valid.');
      }
    } catch (e: any) {
      setAppliedCoupon(null);
      setCouponMsg(e?.message ?? 'Could not validate that code.');
    } finally {
      setCouponBusy(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponMsg(null);
  };

  const createOrder = async (): Promise<string> => {
    setError(null);
    try {
      const r = await api.post<{ paypalOrderId: string; orderNumber: string }>('/checkout/paypal/create', {
        email,
        shippingAddress: ship,
        billingAddress: sameAsShip ? ship : bill,
        shippingRateId: shipRateId,
        couponCode: appliedCoupon?.code,
      });
      return r.paypalOrderId;
    } catch (e: any) {
      // The SDK swallows this rejection into a generic onError; show the
      // server's actual reason first, then let the SDK abort the flow.
      setError(describeError(e));
      throw e;
    }
  };

  const onApprove = async (data: { orderID: string }, actions?: { restart?: () => unknown }) => {
    setError(null);
    try {
      const r = await api.post<{ orderNumber: string }>(`/checkout/paypal/capture/${data.orderID}`);
      navigate(`/order/${r.orderNumber}`);
    } catch (e: any) {
      setError(describeError(e));
      // PayPal's documented handling for a declined instrument: restart the
      // approval so the buyer can pick a different card or funding source,
      // instead of leaving them on a dead button.
      if (e instanceof ApiError && (e.details as any)?.issue === 'INSTRUMENT_DECLINED' && actions?.restart) {
        void actions.restart();
      }
    }
  };

  if (!configLoaded) {
    return (
      <div className="container" style={{ padding: '2rem 0' }}>
        <h1>Checkout</h1>
        <p className="muted">Loading payment options…</p>
      </div>
    );
  }

  if (!paypalClientId) {
    return (
      <div className="container" style={{ padding: '2rem 0' }}>
        <h1>Checkout</h1>
        <div className="error">
          PayPal is not yet configured. Set the credentials in Admin → Settings → Payments.
        </div>
        <p className="muted" style={{ marginTop: '1rem', fontSize: '.85rem' }}>
          Diagnostic: {configError
            ? `config endpoint failed (${configError})`
            : `config endpoint returned environment=${env}, clientId=empty. Re-paste the Client ID in Admin → Settings → Payments and click outside the field to save (browser autofill can silently swallow it).`}
        </p>
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
                  onError={(err) => setError((prev) => prev ?? describeError(err))}
                />
              </div>
            )}

            {enableCard && (
              <div className="admin-card">
                <h4>Pay with card</h4>
                <PayPalCardFieldsProvider createOrder={createOrder} onApprove={onApprove} onError={(err) => setError((prev) => prev ?? describeError(err))}>
                  <PayPalCardFieldsForm />
                  <SubmitCardButton onError={(msg) => setError(msg)} />
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
          <div className="spread" style={{ padding: '.5rem 0', borderTop: '1px solid var(--border)' }}>
            <span>Subtotal</span><span>{formatMoney(sub)}</span>
          </div>

          {/* Discount code — applied here, before payment */}
          <div style={{ padding: '.5rem 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: '.35rem' }}>Discount code</div>
            {appliedCoupon ? (
              <div className="spread" style={{ alignItems: 'center' }}>
                <span style={{ fontSize: '.9rem' }}>
                  <strong>{appliedCoupon.code}</strong> applied
                  {appliedCoupon.description ? ` — ${appliedCoupon.description}` : ''}
                </span>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ padding: '.2rem .6rem', fontSize: '.8rem' }}
                  onClick={removeCoupon}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void applyCoupon(); } }}
                  placeholder="Enter code"
                  style={{ flex: 1, textTransform: 'uppercase' }}
                />
                <button
                  type="button"
                  className="btn secondary"
                  onClick={applyCoupon}
                  disabled={couponBusy || !couponInput.trim()}
                >
                  {couponBusy ? '…' : 'Apply'}
                </button>
              </div>
            )}
            {couponMsg && (
              <div className="error" style={{ marginTop: '.4rem', fontSize: '.8rem' }}>{couponMsg}</div>
            )}
          </div>

          {(shipRates.length > 0 || shipQuoting || !!ship.postalCode) && (
            <div style={{ padding: '.5rem 0', borderTop: '1px solid var(--border)' }}>
              <div className="spread" style={{ marginBottom: '.35rem' }}>
                <span style={{ fontWeight: 600, fontSize: '.9rem' }}>Shipping</span>
                {shipWeightOz != null && (
                  <span className="muted" style={{ fontSize: '.75rem' }}>
                    {shipWeightOz >= 16 ? `${(shipWeightOz / 16).toFixed(2)} lb` : `${shipWeightOz.toFixed(1)} oz`}
                  </span>
                )}
              </div>
              {shipQuoting && <div className="muted" style={{ fontSize: '.85rem' }}>Getting live rates…</div>}
              {!shipQuoting && shipRates.length === 0 && (
                <div className="muted" style={{ fontSize: '.85rem' }}>
                  {ship.postalCode ? 'No rates for this address yet — check the postal code.' : 'Enter your postal code for shipping rates.'}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                {shipRates.map((r) => (
                  <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer', fontSize: '.9rem' }}>
                    <input
                      type="radio"
                      name="shiprate"
                      checked={shipRateId === r.id}
                      onChange={() => setShipRateId(r.id)}
                      style={{ width: 'auto' }}
                    />
                    <span style={{ flex: 1 }}>
                      {r.name}
                      {r.estimatedDays && <span className="muted" style={{ fontSize: '.8rem' }}> ({r.estimatedDays})</span>}
                    </span>
                    <span>{formatMoney(r.rateCents)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {appliedCoupon && appliedCoupon.discountCents > 0 && (
            <div className="spread" style={{ padding: '.5rem 0', borderTop: '1px solid var(--border)', color: 'green' }}>
              <span>Discount ({appliedCoupon.code})</span>
              <span>−{formatMoney(appliedCoupon.discountCents)}</span>
            </div>
          )}

          {(() => {
            const ship = shipRates.find((r) => r.id === shipRateId);
            const shipCents = ship?.rateCents ?? 0;
            const discount = appliedCoupon?.discountCents ?? 0;
            return (
              <div className="spread" style={{ padding: '.75rem 0', fontWeight: 700, fontSize: '1.1rem', borderTop: '1px solid var(--border)' }}>
                <span>Total</span><span>{formatMoney(Math.max(0, sub - discount) + shipCents)}</span>
              </div>
            );
          })()}
          <p className="muted" style={{ fontSize: '.8rem', margin: 0 }}>
            Tax (if applicable) calculated on PayPal's review page.
          </p>
        </div>
      </aside>
    </div>
  );
}

/** One line a buyer can act on, from whatever shape the SDK or our API threw. */
function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message || 'Payment failed. Please try again.';
  if (typeof err === 'string') return err;
  const m = (err as any)?.message;
  return typeof m === 'string' && m ? m : 'Payment failed. Please try again.';
}

function SubmitCardButton({ onError }: { onError: (message: string) => void }) {
  const { cardFieldsForm } = usePayPalCardFields();
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (!cardFieldsForm) return;
    setSubmitting(true);
    try {
      const state = await cardFieldsForm.getState();
      if (!state.isFormValid) {
        onError('Please check the card number, expiry and security code.');
        return;
      }
      await cardFieldsForm.submit();
    } catch (e) {
      console.error('[card-fields] submit failed', e);
      onError(describeError(e));
    } finally { setSubmitting(false); }
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
