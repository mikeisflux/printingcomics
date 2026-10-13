import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatMoney } from '../api/client';
import { useCart, type CartItem } from '../store/cart';
import { formatCartItemOptions } from '../lib/cart-options';
import { QuantityInput } from '../components/QuantityInput';
import { ShippingEstimator } from '../components/ShippingEstimator';
import { formatEta } from './Product';
import { useSeo } from '../lib/seo';

/** Where a configured line is edited: the configurator it was built in, pointed at this line. */
function editHref(item: CartItem): string | null {
  const configurable = (item.product.options?.length ?? 0) > 0 && item.options && Object.keys(item.options).length > 0;
  if (!configurable) return null;
  // Shelf goods are bought off a plain grid, not the configurator.
  const category = item.product.categories?.map((c) => c.category.slug).find((slug) => slug !== 'shipping-supplies');
  return category ? `/shop/${category}?edit=${item.id}` : null;
}

export function CartPage() {
  useSeo({ title: 'Your cart', noindex: true });
  const { cart, load, update, remove, subtotal } = useCart();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void load(); }, [load]);

  const items = cart?.items ?? [];
  const count = items.reduce((n, i) => n + i.quantity, 0);
  const changeQty = async (item: CartItem, qty: number) => {
    setError(null);
    try { await update(item.id, qty); }
    catch (e: any) { setError(e?.message ?? 'Could not update the quantity'); await load(); }
  };

  return (
    <div className="container" style={{ padding: '2rem 0 3rem' }}>
      <div className="spread" style={{ flexWrap: 'wrap', gap: '.5rem', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Your cart{items.length > 0 && <span className="muted" style={{ fontSize: '1rem', fontWeight: 500 }}> · {count} item{count === 1 ? '' : 's'}</span>}</h1>
        <Link to="/shop" className="link-cta">← Continue shopping</Link>
      </div>
      {!cart ? (
        <p className="muted">Loading your cart…</p>
      ) : items.length === 0 ? (
        <>
          <p className="muted">Your cart is empty.</p>
          <Link to="/shop" className="btn">Continue shopping</Link>
        </>
      ) : (
        <div className="cart-layout">
          <div>
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
                {items.map((item) => {
                  const img = item.product.images?.[0]?.url;
                  const pairs = formatCartItemOptions(item);
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="cart-item-cell">
                          {img ? <img className="cart-thumb" src={img} alt="" width={64} height={64} loading="lazy" /> : <div className="cart-thumb" aria-hidden="true" />}
                          <div style={{ minWidth: 0 }}>
                            <Link to={`/product/${item.product.slug}`} style={{ fontWeight: 600 }}>{item.product.name}</Link>
                            {item.variant && <div className="muted" style={{ fontSize: '.85rem' }}>{item.variant.label}</div>}
                            {item.product.backorder && (
                              <div style={{ fontSize: '.85rem', color: '#b45309', fontWeight: 600, marginTop: '.2rem' }}>
                                ⏳ On backorder
                                {item.product.backorderEta && <> — ships around {formatEta(item.product.backorderEta)}</>}
                              </div>
                            )}
                            {pairs.length > 0 && (
                              <ul className="muted" style={{ fontSize: '.85rem', margin: '.25rem 0 0', paddingLeft: '1rem' }}>
                                {pairs.map((p, i) => (
                                  <li key={i}><strong>{p.label}:</strong> {p.value}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
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
                          <Link to={editHref(item)!} className="btn secondary sm">Edit</Link>
                        )}
                        <button className="btn secondary sm" onClick={() => void remove(item.id)}>Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {error && <div className="error" style={{ marginTop: '1rem' }} role="alert">{error}</div>}
          </div>

          <aside className="admin-card cart-summary" aria-label="Cart summary">
            <div className="spread" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              <span>Subtotal</span><span data-testid="cart-subtotal">{formatMoney(subtotal())}</span>
            </div>
            <p className="muted" style={{ fontSize: '.85rem', margin: '.35rem 0 1rem' }}>Shipping is quoted live for your address at checkout; sales tax, where it applies, is added by PayPal before you confirm.</p>
            <button className="btn" style={{ width: '100%', fontSize: '1.05rem' }} onClick={() => navigate('/checkout')}>Checkout</button>
            <p className="muted" style={{ fontSize: '.8rem', textAlign: 'center', margin: '.5rem 0 1rem' }}>🔒 Secure checkout · PayPal or any card</p>
            <ShippingEstimator />
          </aside>
        </div>
      )}
    </div>
  );
}
