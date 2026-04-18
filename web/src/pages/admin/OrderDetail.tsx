import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';
import { formatCartItemOptions } from '../../lib/cart-options';
import { StatusBadge } from '../Account';

interface OrderEvent {
  id: string;
  kind: string;
  message?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorName?: string | null;
  createdAt: string;
}

interface OrderFull {
  id: string; number: string; email: string;
  status: string; paymentStatus: string;
  subtotalCents: number; shippingCents: number; taxCents: number;
  discountCents: number; totalCents: number;
  trackingNumber?: string | null;
  shippingMethod?: string | null;
  notes?: string | null;
  shippingAddress: any;
  billingAddress: any;
  items: {
    id: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    options?: any;
    product: {
      slug: string;
      images: { url: string }[];
      options: { id: string; name: string; internalKey?: string | null; type: string; values: { label: string; subLabel?: string | null }[] }[];
    };
  }[];
  payments: { id: string; provider: string; providerRef?: string | null; amountCents: number; status: string; createdAt: string }[];
  events: OrderEvent[];
  user?: { id: string; email: string; firstName?: string | null; lastName?: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

const STATUSES = ['PENDING', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
const PAY_STATUSES = ['PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED'];

export function AdminOrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState<OrderFull | null>(null);
  const [tracking, setTracking] = useState('');
  const [shippingMethod, setShippingMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!id) return;
    void api.get<{ order: OrderFull }>(`/admin/orders/${id}`).then((r) => {
      setOrder(r.order);
      setTracking(r.order.trackingNumber ?? '');
      setShippingMethod(r.order.shippingMethod ?? '');
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

  const addNote = async () => {
    if (!noteDraft.trim() || !id) return;
    await api.post(`/admin/orders/${id}/events`, { message: noteDraft.trim(), kind: 'note' });
    setNoteDraft('');
    load();
  };

  const refund = async () => {
    if (!order) return;
    const fullAmount = order.totalCents;
    const input = prompt(
      `Refund amount (in dollars). Leave blank for full refund of ${formatMoney(fullAmount)}.`,
      '',
    );
    if (input === null) return;
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
      <div className="spread" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Order {order.number}</h1>
          <div className="muted" style={{ fontSize: '.85rem' }}>
            Placed {new Date(order.createdAt).toLocaleString()}
          </div>
        </div>
        <div className="row" style={{ gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge status={order.status} />
          <StatusBadge status={order.paymentStatus} />
          <button
            className="btn secondary"
            onClick={async () => {
              try {
                const packages = await api.get<{ items: { id: string; name: string }[] }>('/admin/fulfillment/packages');
                if (packages.items.length === 0) {
                  alert('Add at least one package in /admin/fulfillment → Packages first.');
                  return;
                }
                const pkgChoice = prompt(
                  'Which package?\n' + packages.items.map((p, i) => `${i + 1}. ${p.name}`).join('\n'),
                  '1',
                );
                const pkgIdx = Number(pkgChoice) - 1;
                const pkg = packages.items[pkgIdx];
                if (!pkg) return;

                const ratesResp = await api.post<{ services: { id: number; name: string; carrier_name: string; price: { total_price: number; currency: string }; transit_days: number | null }[] }>(
                  '/admin/fulfillment/packlink/rates',
                  { orderId: order.id, packageId: pkg.id },
                );
                if (ratesResp.services.length === 0) {
                  alert('Packlink returned no services for this route/package.');
                  return;
                }
                const svcChoice = prompt(
                  'Pick a service:\n' + ratesResp.services.map((s, i) =>
                    `${i + 1}. ${s.carrier_name} ${s.name} — ${s.price.total_price} ${s.price.currency}${s.transit_days ? ` (${s.transit_days}d)` : ''}`,
                  ).join('\n'),
                  '1',
                );
                const svcIdx = Number(svcChoice) - 1;
                const svc = ratesResp.services[svcIdx];
                if (!svc) return;

                await api.post(`/admin/fulfillment/packlink/push/${order.id}`, {
                  packageId: pkg.id,
                  serviceId: svc.id,
                });
                alert(`Shipment created with ${svc.carrier_name} ${svc.name}.`);
                load();
              } catch (e: any) {
                alert(e.message ?? 'Push failed');
              }
            }}
          >
            Push to Packlink Pro
          </button>
          {order.paymentStatus === 'CAPTURED' && (
            <button className="btn secondary" style={{ color: '#b91c1c', borderColor: '#b91c1c' }} onClick={refund}>
              Refund via PayPal
            </button>
          )}
        </div>
      </div>

      <div className="admin-card">
        <h3>Fulfilment</h3>
        <div className="grid-2">
          <div>
            <label>Order status</label>
            <select value={order.status} onChange={(e) => update({ status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <p className="muted" style={{ fontSize: '.75rem' }}>
              Marking SHIPPED will email the customer their tracking number.
            </p>
          </div>
          <div>
            <label>Payment status</label>
            <select value={order.paymentStatus} onChange={(e) => update({ paymentStatus: e.target.value })}>
              {PAY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div>
            <label>Tracking number</label>
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              onBlur={() => {
                if (tracking !== (order.trackingNumber ?? '')) update({ trackingNumber: tracking });
              }}
              placeholder="USPS / UPS / FedEx tracking"
            />
          </div>
          <div>
            <label>Shipping method</label>
            <input
              value={shippingMethod}
              onChange={(e) => setShippingMethod(e.target.value)}
              onBlur={() => {
                if (shippingMethod !== (order.shippingMethod ?? '')) update({ shippingMethod });
              }}
              placeholder='e.g. "UPS Ground"'
            />
          </div>
        </div>
        <label>Internal notes (not emailed)</label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (order.notes ?? '')) update({ notes });
          }}
        />
      </div>

      <div className="admin-card">
        <h3>Items</h3>
        <table className="admin-table">
          <thead><tr><th /><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
          <tbody>
            {order.items.map((i) => {
              const img = i.product?.images?.[0]?.url;
              const pairs = formatCartItemOptions(i);
              return (
                <tr key={i.id}>
                  <td style={{ width: 60 }}>
                    {img ? (
                      <img src={img} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} />
                    ) : (
                      <div style={{ width: 48, height: 48, background: 'var(--bg-alt)', borderRadius: 4 }} />
                    )}
                  </td>
                  <td>
                    <Link to={`/product/${i.product.slug}`}>{i.name}</Link>
                    {pairs.length > 0 && (
                      <ul className="muted" style={{ fontSize: '.8rem', margin: '.25rem 0 0', paddingLeft: '1rem' }}>
                        {pairs.map((p, j) => <li key={j}>{p.label}: {p.value}</li>)}
                      </ul>
                    )}
                  </td>
                  <td>{i.quantity}</td>
                  <td>{formatMoney(i.unitPriceCents)}</td>
                  <td>{formatMoney(i.totalCents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="spread"><span>Subtotal</span><span>{formatMoney(order.subtotalCents)}</span></div>
        {order.discountCents > 0 && <div className="spread"><span>Discount</span><span>−{formatMoney(order.discountCents)}</span></div>}
        <div className="spread"><span>Shipping</span><span>{formatMoney(order.shippingCents)}</span></div>
        <div className="spread"><span>Tax</span><span>{formatMoney(order.taxCents)}</span></div>
        <div className="spread" style={{ fontWeight: 700 }}><span>Total</span><span>{formatMoney(order.totalCents)}</span></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <div className="admin-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Customer</h3>
          <div>{order.email}</div>
          {order.user && (
            <div className="muted">
              <Link to={`/admin/customers/${order.user.id}`}>
                {order.user.firstName} {order.user.lastName}
              </Link>
            </div>
          )}
        </div>

        <div className="admin-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Shipping address</h3>
          <AddressDisplay a={order.shippingAddress} />
        </div>

        <div className="admin-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Billing address</h3>
          <AddressDisplay a={order.billingAddress} />
        </div>
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
                  <td><StatusBadge status={p.status} /></td>
                  <td>{new Date(p.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-card">
        <h3>Activity timeline</h3>
        <div className="row" style={{ marginBottom: '.75rem' }}>
          <input
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add a timeline note (visible on the customer order page)"
            onKeyDown={(e) => { if (e.key === 'Enter') void addNote(); }}
          />
          <button className="btn" onClick={() => void addNote()} disabled={!noteDraft.trim()}>Add</button>
        </div>
        {order.events.length === 0 ? (
          <p className="muted">No activity yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {order.events.map((e) => (
              <li key={e.id} style={{ display: 'flex', gap: '.75rem', padding: '.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--muted)', fontSize: '.85rem', minWidth: 160 }}>
                  {new Date(e.createdAt).toLocaleString()}
                </span>
                <span style={{ minWidth: 80, textTransform: 'uppercase', fontSize: '.7rem', fontWeight: 700, color: 'var(--muted)' }}>
                  {e.kind}
                </span>
                <span style={{ flex: 1, fontSize: '.9rem' }}>
                  {e.message}
                  {e.actorName && <span className="muted" style={{ fontSize: '.8rem' }}> — {e.actorName}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {saving && <p className="muted">Saving…</p>}
    </div>
  );
}

function AddressDisplay({ a }: { a: any }) {
  if (!a) return <p className="muted">None</p>;
  return (
    <div style={{ lineHeight: 1.5 }}>
      <div>{a.firstName} {a.lastName}</div>
      {a.company && <div>{a.company}</div>}
      <div>{a.line1}{a.line2 ? `, ${a.line2}` : ''}</div>
      <div>{a.city}, {a.region} {a.postalCode}</div>
      <div>{a.country}</div>
      {a.phone && <div className="muted">{a.phone}</div>}
    </div>
  );
}
