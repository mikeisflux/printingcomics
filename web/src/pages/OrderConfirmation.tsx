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
  items: { id: string; name: string; quantity: number; totalCents: number }[];
  createdAt: string;
}

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

  if (error) return <div className="container" style={{ padding: '2rem 0' }}><div className="error">{error}</div><Link to="/login">Log in to view your orders</Link></div>;
  if (!order) return <div className="container" style={{ padding: '2rem 0' }}>Loading…</div>;

  return (
    <div className="container" style={{ padding: '2rem 0', maxWidth: 720 }}>
      <h1>Thank you!</h1>
      <p>Your order <strong>{order.number}</strong> has been received.</p>

      <div className="admin-card">
        <div className="spread">
          <span>Status</span><span className="badge pending">{order.status}</span>
        </div>
        <div className="spread">
          <span>Payment</span><span className="badge pending">{order.paymentStatus}</span>
        </div>
      </div>

      <h3>Items</h3>
      <ul>
        {order.items.map((i) => (
          <li key={i.id}>{i.name} × {i.quantity} — {formatMoney(i.totalCents)}</li>
        ))}
      </ul>

      <div className="admin-card">
        <div className="spread"><span>Subtotal</span><span>{formatMoney(order.subtotalCents)}</span></div>
        <div className="spread"><span>Shipping</span><span>{formatMoney(order.shippingCents)}</span></div>
        <div className="spread"><span>Tax</span><span>{formatMoney(order.taxCents)}</span></div>
        <div className="spread" style={{ fontWeight: 700, marginTop: '.5rem' }}><span>Total</span><span>{formatMoney(order.totalCents)}</span></div>
      </div>

      <p><Link to="/account/orders">View all your orders</Link></p>
    </div>
  );
}
