import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';

interface Order {
  id: string; number: string; email: string;
  status: string; paymentStatus: string;
  totalCents: number; createdAt: string;
}

const STATUSES = ['PENDING', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];

export function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const qs = status ? `?status=${status}` : '';
    void api.get<{ orders: Order[] }>(`/admin/orders${qs}`).then((r) => setOrders(r.orders));
  }, [status]);

  return (
    <div>
      <h1>Orders</h1>
      <div className="admin-card">
        <label>Filter by status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Order</th><th>Email</th><th>Placed</th>
              <th>Status</th><th>Payment</th><th>Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td><Link to={`/admin/orders/${o.id}`}>{o.number}</Link></td>
                <td>{o.email}</td>
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
