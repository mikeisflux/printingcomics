import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';

interface Dashboard {
  counts: { orders: number; products: number; users: number };
  revenueLast30Cents: number;
  recentOrders: {
    id: string; number: string; email: string; status: string;
    paymentStatus: string; totalCents: number; createdAt: string;
  }[];
  lowStock: { id: string; slug: string; name: string; stock: number }[];
}

export function AdminDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    void api.get<Dashboard>('/admin/dashboard').then(setData);
  }, []);

  if (!data) return <div>Loading…</div>;

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="stat-grid">
        <div className="stat">
          <div className="label">Revenue (30d)</div>
          <div className="value">{formatMoney(data.revenueLast30Cents)}</div>
        </div>
        <div className="stat">
          <div className="label">Orders</div>
          <div className="value">{data.counts.orders}</div>
        </div>
        <div className="stat">
          <div className="label">Products</div>
          <div className="value">{data.counts.products}</div>
        </div>
        <div className="stat">
          <div className="label">Customers</div>
          <div className="value">{data.counts.users}</div>
        </div>
      </div>

      <div className="admin-card">
        <h3>Recent orders</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Number</th><th>Email</th><th>Status</th><th>Payment</th><th>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.recentOrders.map((o) => (
              <tr key={o.id}>
                <td><Link to={`/admin/orders/${o.id}`}>{o.number}</Link></td>
                <td>{o.email}</td>
                <td><span className="badge">{o.status}</span></td>
                <td><span className="badge">{o.paymentStatus}</span></td>
                <td>{formatMoney(o.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.lowStock.length > 0 && (
        <div className="admin-card">
          <h3>Low stock</h3>
          <ul>
            {data.lowStock.map((p) => (
              <li key={p.id}><Link to={`/admin/products/${p.id}`}>{p.name}</Link> — {p.stock} left</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
