import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatMoney } from '../api/client';
import { useCart } from '../store/cart';
import { StatusBadge } from './Account';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  product: { slug: string; images: { url: string }[] };
}

interface Order {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  totalCents: number;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  trackingNumber?: string | null;
  shippingMethod?: string | null;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

const STATUS_FILTERS: { label: string; match: (o: Order) => boolean }[] = [
  { label: 'All', match: () => true },
  { label: 'In production', match: (o) => o.status === 'PENDING' || o.status === 'PAID' || o.status === 'IN_PRODUCTION' },
  { label: 'Shipped', match: (o) => o.status === 'SHIPPED' || o.status === 'DELIVERED' },
  { label: 'Cancelled', match: (o) => o.status === 'CANCELLED' || o.status === 'REFUNDED' },
];

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const navigate = useNavigate();
  const { load: reloadCart } = useCart();

  useEffect(() => {
    void api.get<{ orders: Order[] }>('/orders').then((r) => setOrders(r.orders));
  }, []);

  const filtered = useMemo(() => orders.filter(STATUS_FILTERS[filter]!.match), [orders, filter]);

  async function reorder(number: string) {
    setBusy(number);
    try {
      await api.post(`/orders/${number}/reorder`);
      await reloadCart();
      navigate('/cart');
    } catch (e: any) {
      alert(e.message ?? 'Reorder failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <h1 style={{ margin: 0 }}>Orders</h1>
        <div className="row" style={{ gap: '.25rem' }}>
          {STATUS_FILTERS.map((f, i) => (
            <button
              key={f.label}
              onClick={() => setFilter(i)}
              className={filter === i ? 'btn' : 'btn secondary'}
              style={{ padding: '.35rem .75rem', fontSize: '.85rem' }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="muted">No orders match this filter.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filtered.map((o) => (
            <div key={o.id} className="admin-card" style={{ margin: 0 }}>
              <div className="spread" style={{ flexWrap: 'wrap', gap: '.75rem', marginBottom: '.75rem' }}>
                <div>
                  <Link to={`/order/${o.number}`} style={{ fontWeight: 600, fontSize: '1.05rem' }}>
                    Order {o.number}
                  </Link>
                  <div className="muted" style={{ fontSize: '.85rem' }}>
                    Placed {new Date(o.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="row" style={{ gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <StatusBadge status={o.status} />
                  <StatusBadge status={o.paymentStatus} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
                {o.items.slice(0, 5).map((item) => {
                  const img = item.product.images[0]?.url;
                  return (
                    <Link
                      key={item.id}
                      to={`/product/${item.product.slug}`}
                      style={{ width: 56, height: 56, borderRadius: 6, border: '1px solid var(--border)', background: img ? `center/cover no-repeat url(${img})` : 'var(--bg-alt)', position: 'relative', textDecoration: 'none' }}
                      title={`${item.name} × ${item.quantity}`}
                    >
                      <span style={{
                        position: 'absolute', top: -6, right: -6,
                        background: 'var(--brand)', color: '#fff',
                        borderRadius: 999, minWidth: 20, height: 20,
                        fontSize: '.7rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 .35rem',
                      }}>{item.quantity}</span>
                    </Link>
                  );
                })}
                {o.items.length > 5 && (
                  <div className="muted" style={{ alignSelf: 'center', fontSize: '.85rem' }}>+{o.items.length - 5} more</div>
                )}
              </div>

              {o.trackingNumber && (
                <div className="muted" style={{ fontSize: '.85rem', marginBottom: '.5rem' }}>
                  Tracking: <code>{o.trackingNumber}</code>
                  {o.shippingMethod && <span> · {o.shippingMethod}</span>}
                </div>
              )}

              <div className="spread" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
                <div className="muted" style={{ fontSize: '.9rem' }}>
                  {o.items.reduce((s, i) => s + i.quantity, 0)} item{o.items.reduce((s, i) => s + i.quantity, 0) === 1 ? '' : 's'} · {formatMoney(o.totalCents)}
                </div>
                <div className="row" style={{ gap: '.5rem', flexWrap: 'wrap' }}>
                  <Link to={`/order/${o.number}`} className="btn secondary" style={{ padding: '.35rem .75rem', fontSize: '.85rem' }}>
                    View details
                  </Link>
                  <button
                    className="btn"
                    disabled={busy === o.number}
                    onClick={() => void reorder(o.number)}
                    style={{ padding: '.35rem .75rem', fontSize: '.85rem' }}
                  >
                    {busy === o.number ? 'Adding…' : 'Reorder'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
