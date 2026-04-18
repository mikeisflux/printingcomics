import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatMoney } from '../api/client';

interface Order {
  number: string;
  status: string;
  paymentStatus: string;
  totalCents: number;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  trackingNumber?: string | null;
  items: { id: string; name: string; quantity: number; totalCents: number; options?: any }[];
  createdAt: string;
}

const STATUS_PIPELINE = ['PENDING', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED'] as const;

export function OrderConfirmation() {
  const { number } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="container" style={{ padding: '2rem 0', maxWidth: 760 }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 64, height: 64,
          borderRadius: '50%',
          background: order.paymentStatus === 'CAPTURED' ? '#d4f5dc' : '#fff3cd',
          fontSize: '2rem',
          marginBottom: '.75rem',
        }}>{order.paymentStatus === 'CAPTURED' ? '✓' : '⏳'}</div>
        <h1 style={{ margin: 0 }}>
          {order.paymentStatus === 'CAPTURED' ? 'Thank you!' : 'Order received'}
        </h1>
        <p className="muted">
          Order <strong>{order.number}</strong> · {new Date(order.createdAt).toLocaleString()}
        </p>
      </div>

      {/* Status timeline */}
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
                  {s.replace('_', ' ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="admin-card">
        <div className="spread"><span>Payment</span><span className="badge">{order.paymentStatus}</span></div>
        {order.trackingNumber && (
          <div className="spread"><span>Tracking</span><span><code>{order.trackingNumber}</code></span></div>
        )}
      </div>

      <h3>Items</h3>
      <div className="admin-card">
        {order.items.map((i) => (
          <div key={i.id} className="spread" style={{ padding: '.75rem 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              {i.name} × {i.quantity}
              {i.options && Object.keys(i.options).length > 0 && (
                <div className="muted" style={{ fontSize: '.85rem' }}>
                  {Object.entries(i.options).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                </div>
              )}
            </div>
            <span>{formatMoney(i.totalCents)}</span>
          </div>
        ))}
        <div className="spread" style={{ padding: '.5rem 0' }}><span>Subtotal</span><span>{formatMoney(order.subtotalCents)}</span></div>
        <div className="spread" style={{ padding: '.5rem 0' }}><span>Shipping</span><span>{formatMoney(order.shippingCents)}</span></div>
        <div className="spread" style={{ padding: '.5rem 0' }}><span>Tax</span><span>{formatMoney(order.taxCents)}</span></div>
        <div className="spread" style={{ padding: '.75rem 0', borderTop: '1px solid var(--border)', fontWeight: 700, fontSize: '1.1rem' }}>
          <span>Total</span><span>{formatMoney(order.totalCents)}</span>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
        <Link to="/account/orders" className="btn secondary">All orders</Link>
        <Link to="/shop" className="btn">Keep shopping</Link>
      </div>
    </div>
  );
}
