import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney } from '../api/client';

interface Order {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  totalCents: number;
  createdAt: string;
}

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    void api.get<{ orders: Order[] }>('/orders').then((r) => setOrders(r.orders));
  }, []);

  return (
    <div className="container" style={{ padding: '2rem 0' }}>
      <h1>Your orders</h1>
      {orders.length === 0 ? (
        <p className="muted">You haven't placed any orders yet.</p>
      ) : (
        <table className="cart-table">
          <thead>
            <tr>
              <th>Order</th><th>Placed</th><th>Status</th><th>Payment</th><th>Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td><Link to={`/order/${o.number}`}>{o.number}</Link></td>
                <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                <td><span className="badge">{o.status}</span></td>
                <td><span className="badge">{o.paymentStatus}</span></td>
                <td>{formatMoney(o.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
