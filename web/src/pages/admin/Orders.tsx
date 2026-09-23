import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';
import { StatusBadge } from '../Account';
import { PageHeader, TableState, errorMessage, rowClick, useDebounced } from '../../components/admin/ui';

interface Order {
  id: string; number: string; email: string;
  status: string; paymentStatus: string;
  totalCents: number; createdAt: string;
  items?: { quantity: number }[];
  partner?: { id: string; slug: string; name: string; color?: string | null } | null;
}

const STATUSES: [string, string][] = [
  ['', 'All paid orders'],
  ['PENDING', 'Pending'],
  ['PAID', 'Paid'],
  ['IN_PRODUCTION', 'In production'],
  ['SHIPPED', 'Shipped'],
  ['DELIVERED', 'Delivered'],
  ['CANCELLED', 'Cancelled'],
  ['REFUNDED', 'Refunded'],
  ['ABANDONED', 'Unpaid (abandoned, pending or declined at PayPal)'],
];

/** "3m ago" / "Yesterday 4:12 PM" / "Aug 3" — dense enough for a list. */
function when(iso: string): string {
  const d = new Date(iso);
  const mins = (Date.now() - d.getTime()) / 60_000;
  if (mins < 1) return 'just now';
  if (mins < 60) return `${Math.floor(mins)}m ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 60 * 48) return `Yesterday ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function AdminOrders() {
  const navigate = useNavigate();
  // Filters live in the URL so a refresh, a shared link or the back button
  // lands on the same view.
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const source = (params.get('source') as 'all' | 'any' | 'none' | null) ?? 'all';
  const [q, setQ] = useState(params.get('q') ?? '');
  const query = useDebounced(q.trim(), 300);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  useEffect(() => { if ((params.get('q') ?? '') !== query) setParam('q', query); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (source !== 'all') p.set('partner', source);
    if (query) p.set('q', query);
    const qs = p.toString() ? `?${p}` : '';
    api.get<{ orders: Order[] }>(`/admin/orders${qs}`)
      .then((r) => { if (alive) setOrders(r.orders); })
      .catch((e) => { if (alive) setError(errorMessage(e, 'Could not load orders')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [status, source, query]);

  const units = (o: Order) => o.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle={!loading && !error ? `${orders.length}${orders.length === 100 ? '+' : ''} shown` : undefined}
      />

      <div className="admin-card">
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 260px' }}>
            <label>Search</label>
            <input
              type="search"
              placeholder="Order number, email, or partner reference"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label>Status</label>
            <select value={status} onChange={(e) => setParam('status', e.target.value)}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label>Source</label>
            <select value={source} onChange={(e) => setParam('source', e.target.value === 'all' ? '' : e.target.value)}>
              <option value="all">All</option>
              <option value="any">Partner-submitted</option>
              <option value="none">Storefront direct</option>
            </select>
          </div>
          {(q || status || source !== 'all') && (
            <button className="btn secondary sm" onClick={() => { setQ(''); setParams({}, { replace: true }); }}>Clear</button>
          )}
        </div>
      </div>

      <div className="admin-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Order</th><th>Customer</th><th>Partner</th><th>Placed</th>
              <th>Status</th><th>Payment</th><th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              loading={loading}
              error={error}
              count={orders.length}
              colSpan={7}
              empty={
                query || status || source !== 'all'
                  ? 'No orders match these filters.'
                  : status === 'ABANDONED' ? 'No abandoned checkouts.' : 'No orders yet.'
              }
            />
            {!loading && !error && orders.map((o) => (
              <tr key={o.id} className="clickable" onClick={rowClick(() => navigate(`/admin/orders/${o.id}`))}>
                <td>
                  <Link to={`/admin/orders/${o.id}`} style={{ fontWeight: 600 }}>{o.number}</Link>
                  {units(o) > 0 && <div className="muted" style={{ fontSize: '.78rem' }}>{units(o)} unit{units(o) === 1 ? '' : 's'}</div>}
                </td>
                <td>{o.email}</td>
                <td style={{ fontSize: '.85rem' }}>
                  {o.partner ? (
                    <Link to={`/admin/partners/${o.partner.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: o.partner.color ?? '#94a3b8' }} />
                      {o.partner.name}
                    </Link>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td title={new Date(o.createdAt).toLocaleString()} style={{ whiteSpace: 'nowrap' }}>{when(o.createdAt)}</td>
                <td><StatusBadge status={o.status} /></td>
                <td><StatusBadge status={o.paymentStatus} /></td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(o.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
