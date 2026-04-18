import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatMoney } from '../api/client';
import { formatCartItemOptions } from '../lib/cart-options';
import { useCart } from '../store/cart';
import { StatusBadge } from './Account';

interface ShippingAddress {
  firstName?: string;
  lastName?: string;
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
}

interface Payment {
  id: string;
  provider: string;
  providerRef?: string | null;
  amountCents: number;
  status: string;
  createdAt: string;
}

interface Order {
  number: string;
  email: string;
  status: string;
  paymentStatus: string;
  totalCents: number;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  trackingNumber?: string | null;
  shippingMethod?: string | null;
  shippingAddress: ShippingAddress;
  billingAddress?: ShippingAddress;
  notes?: string | null;
  payments: Payment[];
  items: {
    id: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    options?: any;
    product: {
      id: string;
      slug: string;
      name: string;
      images: { url: string }[];
      options: { id: string; name: string; internalKey?: string | null; type: string; values: { label: string; subLabel?: string | null }[] }[];
    };
  }[];
  createdAt: string;
  updatedAt: string;
}

const STATUS_PIPELINE = ['PENDING', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED'] as const;

export function OrderConfirmation() {
  const { number } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const navigate = useNavigate();
  const { load: reloadCart } = useCart();

  async function reorder() {
    if (!number) return;
    setReordering(true);
    try {
      await api.post(`/orders/${number}/reorder`);
      await reloadCart();
      navigate('/cart');
    } catch (e: any) {
      alert(e.message ?? 'Reorder failed');
    } finally {
      setReordering(false);
    }
  }

  useEffect(() => {
    if (!number) return;
    api
      .get<{ order: Order }>(`/orders/${number}`)
      .then((r) => setOrder(r.order))
      .catch((e) => setError(e.message));
  }, [number]);

  if (error) {
    return (
      <div className="container" style={{ padding: '2rem 0' }}>
        <div className="error">{error}</div>
        <p><Link to="/login">Log in</Link> to see your orders, or check your email for the receipt.</p>
      </div>
    );
  }
  if (!order) return <div className="container" style={{ padding: '2rem 0' }}>Loading…</div>;

  const currentIdx = Math.max(0, STATUS_PIPELINE.indexOf(order.status as any));
  const isCancelled = order.status === 'CANCELLED' || order.status === 'REFUNDED';
  const paid = order.paymentStatus === 'CAPTURED';

  return (
    <div className="container" style={{ padding: '2rem 0', maxWidth: 880 }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 64, height: 64, borderRadius: '50%',
          background: paid ? '#d4f5dc' : '#fff3cd',
          fontSize: '2rem', marginBottom: '.75rem',
        }}>{paid ? '✓' : '⏳'}</div>
        <h1 style={{ margin: 0 }}>
          {paid ? 'Thank you!' : 'Order received'}
        </h1>
        <p className="muted">
          Order <strong>{order.number}</strong> · {new Date(order.createdAt).toLocaleString()}
        </p>
        <div className="row" style={{ justifyContent: 'center', gap: '.5rem', marginTop: '.5rem' }}>
          <StatusBadge status={order.status} />
          <StatusBadge status={order.paymentStatus} />
        </div>
      </div>

      {!isCancelled && (
        <div className="admin-card">
          <h3>Order status</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', marginTop: '1rem' }}>
            <div style={{
              position: 'absolute', top: 16, left: 20, right: 20, height: 2,
              background: 'var(--border)', zIndex: 0,
            }} />
            <div style={{
              position: 'absolute', top: 16, left: 20,
              width: `calc((100% - 40px) * ${currentIdx / (STATUS_PIPELINE.length - 1)})`,
              height: 2, background: 'var(--brand)', zIndex: 1, transition: 'width .4s',
            }} />
            {STATUS_PIPELINE.map((s, i) => (
              <div key={s} style={{ position: 'relative', zIndex: 2, textAlign: 'center', flex: 1 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: i <= currentIdx ? 'var(--brand)' : '#fff',
                  border: `2px solid ${i <= currentIdx ? 'var(--brand)' : 'var(--border)'}`,
                  color: i <= currentIdx ? '#fff' : 'var(--ink-muted)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '.85rem',
                }}>{i + 1}</div>
                <div style={{ fontSize: '.75rem', marginTop: '.35rem', color: i <= currentIdx ? 'var(--ink)' : 'var(--ink-muted)' }}>
                  {s.replace(/_/g, ' ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        <div className="admin-card" style={{ margin: 0 }}>
          <h4 style={{ marginTop: 0 }}>Shipping to</h4>
          <div style={{ lineHeight: 1.5 }}>
            <div>{order.shippingAddress.firstName} {order.shippingAddress.lastName}</div>
            <div>{order.shippingAddress.line1}</div>
            {order.shippingAddress.line2 && <div>{order.shippingAddress.line2}</div>}
            <div>{order.shippingAddress.city}, {order.shippingAddress.region} {order.shippingAddress.postalCode}</div>
            <div>{order.shippingAddress.country}</div>
          </div>
          {order.trackingNumber && (
            <div style={{ marginTop: '.75rem', paddingTop: '.75rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '.75rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>Tracking</div>
              <div><code>{order.trackingNumber}</code></div>
              {order.shippingMethod && <div className="muted" style={{ fontSize: '.85rem' }}>{order.shippingMethod}</div>}
            </div>
          )}
        </div>

        <div className="admin-card" style={{ margin: 0 }}>
          <h4 style={{ marginTop: 0 }}>Payment</h4>
          {order.payments.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No payments recorded yet.</p>
          ) : (
            order.payments.map((p) => (
              <div key={p.id} style={{ paddingBottom: '.5rem', borderBottom: '1px solid var(--border)', marginBottom: '.5rem' }}>
                <div className="spread">
                  <span>{p.provider}</span>
                  <StatusBadge status={p.status} />
                </div>
                <div className="muted" style={{ fontSize: '.85rem' }}>
                  {formatMoney(p.amountCents)} · {new Date(p.createdAt).toLocaleString()}
                </div>
                {p.providerRef && (
                  <div className="muted" style={{ fontSize: '.75rem', wordBreak: 'break-all' }}>
                    Ref: <code>{p.providerRef}</code>
                  </div>
                )}
              </div>
            ))
          )}
          <div className="muted" style={{ fontSize: '.85rem' }}>
            Receipt emailed to <strong>{order.email}</strong>
          </div>
        </div>
      </div>

      <h3>Items</h3>
      <div className="admin-card">
        {order.items.map((i) => {
          const pairs = formatCartItemOptions(i);
          const img = i.product.images[0]?.url;
          return (
            <div key={i.id} style={{ display: 'flex', gap: '.75rem', padding: '.75rem 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{
                width: 64, height: 64, borderRadius: 6, flexShrink: 0,
                background: img ? `center/cover no-repeat url(${img})` : 'var(--bg-alt)',
                border: '1px solid var(--border)',
              }} />
              <div style={{ flex: 1 }}>
                <div className="spread">
                  <Link to={`/product/${i.product.slug}`} style={{ fontWeight: 500 }}>{i.name}</Link>
                  <span>{formatMoney(i.totalCents)}</span>
                </div>
                <div className="muted" style={{ fontSize: '.85rem' }}>
                  Qty {i.quantity} × {formatMoney(i.unitPriceCents)}
                </div>
                {pairs.length > 0 && (
                  <ul className="muted" style={{ fontSize: '.85rem', margin: '.25rem 0 0', paddingLeft: '1rem' }}>
                    {pairs.map((p, j) => (
                      <li key={j}>{p.label}: {p.value}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
        <div className="spread" style={{ padding: '.5rem 0' }}><span>Subtotal</span><span>{formatMoney(order.subtotalCents)}</span></div>
        {order.discountCents > 0 && (
          <div className="spread" style={{ padding: '.5rem 0' }}><span>Discount</span><span>−{formatMoney(order.discountCents)}</span></div>
        )}
        <div className="spread" style={{ padding: '.5rem 0' }}><span>Shipping</span><span>{formatMoney(order.shippingCents)}</span></div>
        <div className="spread" style={{ padding: '.5rem 0' }}><span>Tax</span><span>{formatMoney(order.taxCents)}</span></div>
        <div className="spread" style={{ padding: '.75rem 0', borderTop: '1px solid var(--border)', fontWeight: 700, fontSize: '1.1rem' }}>
          <span>Total</span><span>{formatMoney(order.totalCents)}</span>
        </div>
      </div>

      {order.notes && (
        <div className="admin-card">
          <h4 style={{ marginTop: 0 }}>Order notes</h4>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{order.notes}</p>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
        <Link to="/account/orders" className="btn secondary">All orders</Link>
        <button className="btn secondary" disabled={reordering} onClick={() => void reorder()}>
          {reordering ? 'Adding to cart…' : 'Reorder these items'}
        </button>
        <Link to="/shop" className="btn">Keep shopping</Link>
      </div>
    </div>
  );
}
