import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';

interface Order {
  id: string; number: string; email: string;
  status: string; paymentStatus: string;
  totalCents: number; createdAt: string;
  partner?: { id: string; slug: string; name: string; color?: string | null } | null;
}

const STATUSES = ['PENDING', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];

export function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState('');
  const [partnerFilter, setPartnerFilter] = useState<'all' | 'any' | 'none'>('all');

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (partnerFilter !== 'all') params.set('partner', partnerFilter);
    const qs = params.toString() ? `?${params.toString()}` : '';
    void api.get<{ orders: Order[] }>(`/admin/orders${qs}`).then((r) => setOrders(r.orders));
  }, [status, partnerFilter]);

  return (
    <div>
      <h1>Orders</h1>
      <div className="admin-card">
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All (excludes abandoned)</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value="ABANDONED">Abandoned (unpaid)</option>
            </select>
          </div>
          <div>
            <label>Source</label>
            <select value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value as 'all' | 'any' | 'none')}>
              <option value="all">All</option>
              <option value="any">Partner-submitted</option>
              <option value="none">Storefront direct</option>
            </select>
          </div>
        </div>
      </div>
      <div className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Order</th><th>Email</th><th>Partner</th><th>Placed</th>
              <th>Status</th><th>Payment</th><th>Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan={7} className="muted" style={{ padding: '1.5rem', textAlign: 'center' }}>
                {status === 'ABANDONED' ? 'No abandoned checkouts.' : 'No orders yet.'}
              </td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id}>
                <td><Link to={`/admin/orders/${o.id}`}>{o.number}</Link></td>
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
                <td>{new Date(o.createdAt).toLocaleString()}</td>
                <td><span className="badge">{o.status}</span></td>
                <td><span className="badge">{o.paymentStatus}</span></td>
                <td>{formatMoney(o.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
