import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';

interface OrderFull {
  id: string; number: string; email: string;
  status: string; paymentStatus: string;
  subtotalCents: number; shippingCents: number; taxCents: number; totalCents: number;
  trackingNumber?: string | null;
  notes?: string | null;
  shippingAddress: any;
  billingAddress: any;
  items: { id: string; name: string; quantity: number; unitPriceCents: number; totalCents: number; options?: any }[];
  payments: { id: string; provider: string; providerRef?: string | null; amountCents: number; status: string; createdAt: string }[];
  user?: { id: string; email: string; firstName?: string | null; lastName?: string | null } | null;
  createdAt: string;
}

const STATUSES = ['PENDING', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
const PAY_STATUSES = ['PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED'];

export function AdminOrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState<OrderFull | null>(null);
  const [tracking, setTracking] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!id) return;
    void api.get<{ order: OrderFull }>(`/admin/orders/${id}`).then((r) => {
      setOrder(r.order);
      setTracking(r.order.trackingNumber ?? '');
      setNotes(r.order.notes ?? '');
    });
  };

  useEffect(() => { load(); }, [id]);

  const update = async (patch: any) => {
    setSaving(true);
    try {
      await api.patch(`/admin/orders/${id}`, patch);
      load();
    } finally {
      setSaving(false);
    }
  };

  const refund = async () => {
    if (!order) return;
    const fullAmount = order.totalCents;
    const input = prompt(
      `Refund amount (in dollars). Leave blank for full refund of ${formatMoney(fullAmount)}.`,
      '',
    );
    const note = prompt('Note to customer (optional)') ?? undefined;
    const amountCents = input ? Math.round(Number(input) * 100) : undefined;
    if (!confirm(amountCents ? `Refund ${formatMoney(amountCents)}?` : `Refund full amount ${formatMoney(fullAmount)}?`)) return;
    try {
      await api.post(`/admin/orders/${id}/refund`, { amountCents, note });
      alert('Refund issued.');
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (!order) return <div>Loading…</div>;

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Order {order.number}</h1>
        {order.paymentStatus === 'CAPTURED' && (
          <button className="btn secondary" style={{ color: '#b91c1c', borderColor: '#b91c1c' }} onClick={refund}>
            Refund via PayPal
          </button>
        )}
      </div>

      <div className="admin-card">
        <h3>Fulfilment</h3>
        <div className="grid-2">
          <div>
            <label>Order status</label>
            <select value={order.status} onChange={(e) => update({ status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label>Payment status</label>
            <select value={order.paymentStatus} onChange={(e) => update({ paymentStatus: e.target.value })}>
              {PAY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <label>Tracking number</label>
        <input
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          onBlur={() => update({ trackingNumber: tracking })}
          placeholder="USPS / UPS / FedEx tracking"
        />
        <label>Internal notes</label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => update({ notes })}
          placeholder="Not visible to customer."
        />
      </div>

      <div className="admin-card">
        <h3>Items</h3>
        <table className="admin-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.name}
                  {i.options && Object.keys(i.options).length > 0 && (
                    <div className="muted" style={{ fontSize: '.85rem' }}>
                      {Object.entries(i.options).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                    </div>
                  )}
                </td>
                <td>{i.quantity}</td>
                <td>{formatMoney(i.unitPriceCents)}</td>
                <td>{formatMoney(i.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="spread"><span>Subtotal</span><span>{formatMoney(order.subtotalCents)}</span></div>
        <div className="spread"><span>Shipping</span><span>{formatMoney(order.shippingCents)}</span></div>
        <div className="spread"><span>Tax</span><span>{formatMoney(order.taxCents)}</span></div>
        <div className="spread" style={{ fontWeight: 700 }}><span>Total</span><span>{formatMoney(order.totalCents)}</span></div>
      </div>

      <div className="admin-card">
        <h3>Customer</h3>
        <div>{order.email}</div>
        {order.user && <div className="muted">User: {order.user.firstName} {order.user.lastName}</div>}
      </div>

      <div className="admin-card">
        <h3>Shipping address</h3>
        <AddressDisplay a={order.shippingAddress} />
      </div>

      <div className="admin-card">
        <h3>Billing address</h3>
        <AddressDisplay a={order.billingAddress} />
      </div>

      {order.payments.length > 0 && (
        <div className="admin-card">
          <h3>Payments</h3>
          <table className="admin-table">
            <thead><tr><th>Provider</th><th>Reference</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
            <tbody>
              {order.payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.provider}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '.8rem' }}>{p.providerRef ?? '—'}</td>
                  <td>{formatMoney(p.amountCents)}</td>
                  <td><span className="badge">{p.status}</span></td>
                  <td>{new Date(p.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {saving && <p className="muted">Saving…</p>}
    </div>
  );
}

function AddressDisplay({ a }: { a: any }) {
  if (!a) return <p className="muted">None</p>;
  return (
    <div style={{ whiteSpace: 'pre-line' }}>
      {a.firstName} {a.lastName}{'\n'}
      {a.line1}{a.line2 ? `, ${a.line2}` : ''}{'\n'}
      {a.city}, {a.region} {a.postalCode}{'\n'}
      {a.country}
      {a.phone && <>{'\n'}{a.phone}</>}
    </div>
  );
}
