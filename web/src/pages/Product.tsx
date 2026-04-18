import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, formatMoney } from '../api/client';
import { useCart } from '../store/cart';

interface Variant { id: string; label: string; priceCents: number; active: boolean; }
interface OptionValue { id: string; label: string; priceModifierCents: number; }
interface Option { id: string; name: string; values: OptionValue[]; }
interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  shortDescription?: string | null;
  description?: string | null;
  priceCents: number;
  hasVariants: boolean;
  minQuantity: number;
  volumeTiers?: { minQty: number; pricePerUnitCents: number }[] | null;
  images: { id: string; url: string; alt?: string | null }[];
  variants: Variant[];
  options: Option[];
}

function priceForQuantity(base: number, qty: number, tiers?: ProductDetail['volumeTiers']): number {
  if (!tiers || tiers.length === 0) return base;
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  let price = base;
  for (const t of sorted) if (qty >= t.minQty) price = t.pricePerUnitCents;
  return price;
}

export function Product() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { add } = useCart();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [variantId, setVariantId] = useState<string | undefined>();
  const [qty, setQty] = useState(1);
  const [options, setOptions] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!slug) return;
    void api.get<{ product: ProductDetail }>(`/products/${slug}`).then((r) => {
      setProduct(r.product);
      setQty(r.product.minQuantity);
      if (r.product.variants.length > 0) setVariantId(r.product.variants[0].id);
    });
  }, [slug]);

  if (!product) return <div className="container" style={{ padding: '2rem 0' }}>Loading…</div>;

  const variant = product.variants.find((v) => v.id === variantId);
  const basePrice = variant?.priceCents ?? product.priceCents;
  const unitPrice = priceForQuantity(basePrice, qty, product.volumeTiers);

  const addToCart = async () => {
    setError(null);
    setAdding(true);
    try {
      await add({ productId: product.id, variantId, quantity: qty, options });
      navigate('/cart');
    } catch (e: any) {
      setError(e.message ?? 'Could not add to cart');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="container product-detail">
      <div className="gallery">
        {product.images[0] ? (
          <img src={product.images[0].url} alt={product.images[0].alt ?? product.name} />
        ) : (
          <div style={{ aspectRatio: '1', background: 'var(--bg-alt)' }} />
        )}
      </div>
      <div>
        <h1>{product.name}</h1>
        {product.shortDescription && <p className="muted">{product.shortDescription}</p>}
        <div style={{ fontSize: '1.75rem', color: 'var(--brand)', fontWeight: 700, margin: '1rem 0' }}>
          {formatMoney(unitPrice)} <span style={{ fontSize: '1rem', color: 'var(--ink-muted)' }}>each</span>
        </div>

        {product.variants.length > 0 && (
          <>
            <label>Variant</label>
            <select value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              {product.variants.filter((v) => v.active).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} — {formatMoney(v.priceCents)}
                </option>
              ))}
            </select>
          </>
        )}

        {product.options.map((opt) => (
          <div key={opt.id}>
            <label>{opt.name}</label>
            <select
              value={options[opt.name] ?? ''}
              onChange={(e) => setOptions({ ...options, [opt.name]: e.target.value })}
            >
              <option value="">Select…</option>
              {opt.values.map((v) => (
                <option key={v.id} value={v.label}>{v.label}</option>
              ))}
            </select>
          </div>
        ))}

        <label>Quantity (min {product.minQuantity})</label>
        <input
          type="number"
          min={product.minQuantity}
          value={qty}
          onChange={(e) => setQty(Math.max(product.minQuantity, Number(e.target.value)))}
        />

        {product.volumeTiers && product.volumeTiers.length > 0 && (
          <div style={{ background: 'var(--bg-alt)', padding: '.75rem', borderRadius: 'var(--radius)', margin: '.75rem 0', fontSize: '.9rem' }}>
            <strong>Volume pricing:</strong>
            <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.25rem' }}>
              {product.volumeTiers.map((t) => (
                <li key={t.minQty}>
                  {t.minQty}+ units → {formatMoney(t.pricePerUnitCents)} each
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ margin: '1rem 0', fontSize: '1.1rem' }}>
          Subtotal: <strong>{formatMoney(unitPrice * qty)}</strong>
        </div>

        {error && <div className="error">{error}</div>}
        <button className="btn" onClick={addToCart} disabled={adding}>
          {adding ? 'Adding…' : 'Add to cart'}
        </button>

        {product.description && (
          <div style={{ marginTop: '2rem', whiteSpace: 'pre-wrap' }}>{product.description}</div>
        )}
      </div>
    </div>
  );
}
