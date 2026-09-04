import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatMoney } from '../api/client';
import { useCart } from '../store/cart';
import { formatCartItemOptions } from '../lib/cart-options';
import { formatEta } from './Product';

export function CartPage() {
  const { cart, load, update, remove, subtotal } = useCart();
  const navigate = useNavigate();

  useEffect(() => { void load(); }, [load]);

  const items = cart?.items ?? [];

  return (
    <div className="container" style={{ padding: '2rem 0' }}>
      <h1>Your cart</h1>
      {items.length === 0 ? (
        <>
          <p className="muted">Your cart is empty.</p>
          <Link to="/shop" className="btn">Continue shopping</Link>
        </>
      ) : (
        <>
          <table className="cart-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Line</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link to={`/product/${item.product.slug}`}>{item.product.name}</Link>
                    {item.variant && <div className="muted" style={{ fontSize: '.85rem' }}>{item.variant.label}</div>}
                    {item.product.backorder && (
                      <div style={{ fontSize: '.85rem', color: '#b45309', fontWeight: 600, marginTop: '.2rem' }}>
                        ⏳ On backorder
                        {item.product.backorderEta && <> — ships around {formatEta(item.product.backorderEta)}</>}
                      </div>
                    )}
                    {(() => {
                      const pairs = formatCartItemOptions(item);
                      if (pairs.length === 0) return null;
                      return (
                        <ul className="muted" style={{ fontSize: '.85rem', margin: '.25rem 0 0', paddingLeft: '1rem' }}>
                          {pairs.map((p, i) => (
                            <li key={i}><strong>{p.label}:</strong> {p.value}</li>
                          ))}
                        </ul>
                      );
                    })()}
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      style={{ width: 80 }}
                      onChange={(e) => void update(item.id, Math.max(1, Number(e.target.value)))}
                    />
                  </td>
                  <td>{formatMoney(item.unitPriceCents)}</td>
                  <td>{formatMoney(item.unitPriceCents * item.quantity)}</td>
                  <td>
                    <button className="btn secondary" style={{ padding: '.3rem .6rem' }} onClick={() => void remove(item.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="cart-total-row">
                <td colSpan={3} style={{ textAlign: 'right' }}>Subtotal</td>
                <td colSpan={2}>{formatMoney(subtotal())}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
            <button className="btn" onClick={() => navigate('/checkout')}>Checkout</button>
          </div>
        </>
      )}
    </div>
  );
}
