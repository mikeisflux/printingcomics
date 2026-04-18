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
  payments: { id: string; provider: string; amountCents: number; status: string; createdAt: string }[];
  user?: { id: string; email: string; firstName?: string | null; lastName?: string | null } | null;
  createdAt: string;
}

const STATUSES = ['PENDING', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
const PAY_STATUSES = ['PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED'];

export function AdminOrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState<OrderFull | null>(null);
  const [tracking, setTracking] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!id) return;
    void api.get<{ order: OrderFull }>(`/admin/orders/${id}`).then((r) => {
      setOrder(r.order);
      setTracking(r.order.trackingNumber ?? '');
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

  if (!order) return <div>Loading…</div>;

  return (
    <div>
      <h1>Order {order.number}</h1>

      <div className="admin-card">
        <div className="spread">
          <div>
            <label>Status</label>
            <select value={order.status} onChange={(e) => update({ status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label>Payment</label>
            <select value={order.paymentStatus} onChange={(e) => update({ paymentStatus: e.target.value })}>
              {PAY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label>Tracking</label>
            <input value={tracking} onChange={(e) => setTracking(e.target.value)} onBlur={() => update({ trackingNumber: tracking })} />
          </div>
        </div>
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
            <thead><tr><th>Provider</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
            <tbody>
              {order.payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.provider}</td>
                  <td>{formatMoney(p.amountCents)}</td>
                  <td>{p.status}</td>
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
