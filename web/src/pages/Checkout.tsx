import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatMoney } from '../api/client';
import { useCart } from '../store/cart';
import { useAuth } from '../store/auth';

interface ShippingOption { id: string; name: string; rateCents: number; estimatedDays?: string | null; }

interface Address {
  firstName: string; lastName: string; line1: string; line2?: string;
  city: string; region: string; postalCode: string; country: string; phone?: string;
}

const emptyAddress: Address = {
  firstName: '', lastName: '', line1: '', line2: '',
  city: '', region: '', postalCode: '', country: 'US', phone: '',
};

export function Checkout() {
  const navigate = useNavigate();
  const { cart, load, subtotal } = useCart();
  const { user } = useAuth();

  const [email, setEmail] = useState('');
  const [ship, setShip] = useState<Address>(emptyAddress);
  const [bill, setBill] = useState<Address>(emptyAddress);
  const [sameAsShip, setSameAsShip] = useState(true);
  const [couponCode, setCouponCode] = useState('');
  const [notes, setNotes] = useState('');
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [shippingMethodId, setShippingMethodId] = useState<string | null>(null);
  const [taxCents, setTaxCents] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user]);

  const sub = subtotal();
  const shippingCents = options.find((o) => o.id === shippingMethodId)?.rateCents ?? 0;
  const total = sub + shippingCents + taxCents;

  const canQuote = ship.line1 && ship.city && ship.region && ship.postalCode;
  const requestQuote = async () => {
    setError(null);
    try {
      const r = await api.post<{ shippingOptions: ShippingOption[]; taxCents: number }>('/checkout/quote', {
        shippingAddress: ship,
      });
      setOptions(r.shippingOptions);
      setTaxCents(r.taxCents);
      if (r.shippingOptions[0]) setShippingMethodId(r.shippingOptions[0].id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const place = async () => {
    setError(null);
    setPlacing(true);
    try {
      const r = await api.post<{ order: { number: string } }>('/checkout/place', {
        email,
        shippingAddress: ship,
        billingAddress: sameAsShip ? ship : bill,
        shippingMethodId: shippingMethodId ?? undefined,
        couponCode: couponCode || undefined,
        notes: notes || undefined,
      });
      navigate(`/order/${r.order.number}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPlacing(false);
    }
  };

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container" style={{ padding: '2rem 0' }}>
        <h1>Checkout</h1>
        <p className="muted">Your cart is empty.</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '2rem 0', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
      <div>
        <h1>Checkout</h1>

        <h3 style={{ marginTop: '2rem' }}>Contact</h3>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

        <h3 style={{ marginTop: '2rem' }}>Shipping address</h3>
        <AddressForm value={ship} onChange={setShip} />
        <button className="btn secondary" onClick={requestQuote} disabled={!canQuote} style={{ marginTop: '.75rem' }}>
          Calculate shipping & tax
        </button>

        {options.length > 0 && (
          <>
            <h3 style={{ marginTop: '2rem' }}>Shipping method</h3>
            {options.map((o) => (
              <label key={o.id} style={{ display: 'block', padding: '.5rem 0' }}>
                <input
                  type="radio"
                  checked={shippingMethodId === o.id}
                  onChange={() => setShippingMethodId(o.id)}
                  style={{ width: 'auto', marginRight: '.5rem' }}
                />
                {o.name} — {formatMoney(o.rateCents)}
                {o.estimatedDays && <span className="muted"> ({o.estimatedDays})</span>}
              </label>
            ))}
          </>
        )}

        <h3 style={{ marginTop: '2rem' }}>Billing address</h3>
        <label>
          <input type="checkbox" checked={sameAsShip} onChange={(e) => setSameAsShip(e.target.checked)} style={{ width: 'auto', marginRight: '.5rem' }} />
          Same as shipping
        </label>
        {!sameAsShip && <AddressForm value={bill} onChange={setBill} />}

        <h3 style={{ marginTop: '2rem' }}>Extras</h3>
        <label>Coupon code</label>
        <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} />
        <label>Order notes</label>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

        {error && <div className="error">{error}</div>}
      </div>

      <aside>
        <div className="admin-card">
          <h3>Order summary</h3>
          {cart.items.map((i) => (
            <div key={i.id} className="spread" style={{ padding: '.5rem 0', borderBottom: '1px solid var(--border)' }}>
              <span>
                {i.product.name} × {i.quantity}
                {i.variant && <div className="muted" style={{ fontSize: '.8rem' }}>{i.variant.label}</div>}
              </span>
              <span>{formatMoney(i.unitPriceCents * i.quantity)}</span>
            </div>
          ))}
          <div className="spread" style={{ padding: '.5rem 0' }}>
            <span>Subtotal</span><span>{formatMoney(sub)}</span>
          </div>
          <div className="spread" style={{ padding: '.5rem 0' }}>
            <span>Shipping</span><span>{shippingCents > 0 ? formatMoney(shippingCents) : '—'}</span>
          </div>
          <div className="spread" style={{ padding: '.5rem 0' }}>
            <span>Tax</span><span>{taxCents > 0 ? formatMoney(taxCents) : '—'}</span>
          </div>
          <div className="spread" style={{ padding: '.75rem 0', borderTop: '1px solid var(--border)', fontWeight: 700, fontSize: '1.1rem' }}>
            <span>Total</span><span>{formatMoney(total)}</span>
          </div>
          <button className="btn" style={{ width: '100%', marginTop: '1rem' }} onClick={place} disabled={placing || !email}>
            {placing ? 'Placing order…' : 'Place order'}
          </button>
          <p className="muted" style={{ fontSize: '.8rem', marginTop: '.75rem' }}>
            Payment integration (Stripe) to be enabled in settings. Orders are created with PENDING payment status.
          </p>
        </div>
      </aside>
    </div>
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
      <label>Phone (optional)</label>
      <input value={value.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} />
    </div>
  );
}
