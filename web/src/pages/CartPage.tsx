import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatMoney } from '../api/client';
import { useCart, type CartItem } from '../store/cart';
import { formatCartItemOptions } from '../lib/cart-options';
import { QuantityInput } from '../components/QuantityInput';
import { formatEta } from './Product';

/** Where a configured line is edited: the configurator it was built in, pointed at this line. */
function editHref(item: CartItem): string | null {
  const configurable = (item.product.options?.length ?? 0) > 0 && item.options && Object.keys(item.options).length > 0;
  if (!configurable) return null;
  // Shelf goods are bought off a plain grid, not the configurator.
  const category = item.product.categories?.map((c) => c.category.slug).find((slug) => slug !== 'shipping-supplies');
  return category ? `/shop/${category}?edit=${item.id}` : null;
}

export function CartPage() {
  const { cart, load, update, remove, subtotal } = useCart();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void load(); }, [load]);

  const items = cart?.items ?? [];
  const changeQty = async (item: CartItem, qty: number) => {
    setError(null);
    try { await update(item.id, qty); }
    catch (e: any) { setError(e?.message ?? 'Could not update the quantity'); await load(); }
  };

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
                  <td data-label="Qty">
                    {item.options?.proof_kind === 'hard-copy'
                      ? <span className="muted">1</span>
                      : <QuantityInput value={item.quantity} min={1} onChange={(q) => void changeQty(item, q)} style={{ width: 80 }} />}
                  </td>
                  <td data-label="Unit">{formatMoney(item.unitPriceCents)}</td>
                  <td data-label="Line">{formatMoney(item.unitPriceCents * item.quantity)}</td>
                  <td className="cart-actions">
                    {editHref(item) && (
                      <Link to={editHref(item)!} className="btn secondary" style={{ padding: '.3rem .6rem' }}>
                        Edit
                      </Link>
                    )}
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

          {error && <div className="error" style={{ marginTop: '1rem' }}>{error}</div>}
          <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
            <button className="btn" onClick={() => navigate('/checkout')}>Checkout</button>
          </div>
        </>
      )}
    </div>
  );
}
