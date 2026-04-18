import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
  const [galleryIdx, setGalleryIdx] = useState(0);

  useEffect(() => {
    if (!slug) return;
    void api.get<{ product: ProductDetail }>(`/products/${slug}`).then((r) => {
      setProduct(r.product);
      setQty(r.product.minQuantity);
      setGalleryIdx(0);
      if (r.product.variants.length > 0) setVariantId(r.product.variants[0].id);
    });
  }, [slug]);

  const variant = useMemo(() => product?.variants.find((v) => v.id === variantId), [product, variantId]);
  const basePrice = variant?.priceCents ?? product?.priceCents ?? 0;
  const unitPrice = product ? priceForQuantity(basePrice, qty, product.volumeTiers) : 0;

  if (!product) return <div className="container" style={{ padding: '2rem 0' }}>Loading…</div>;

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

  const requiredOptionsMet =
    product.options.every((o) => !!options[o.name]) || product.options.length === 0;

  return (
    <div className="container product-detail">
      <div className="gallery">
        {product.images.length === 0 ? (
          <div style={{ aspectRatio: '1', background: 'var(--bg-alt)', borderRadius: 'var(--radius)' }} />
        ) : (
          <>
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: '.75rem' }}>
              <img
                src={product.images[galleryIdx]?.url ?? product.images[0]!.url}
                alt={product.images[galleryIdx]?.alt ?? product.name}
                style={{ width: '100%', display: 'block' }}
              />
            </div>
            {product.images.length > 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: '.5rem' }}>
                {product.images.map((img, i) => (
                  <button
                    key={img.id}
                    onClick={() => setGalleryIdx(i)}
                    aria-label={`Show image ${i + 1}`}
                    style={{
                      padding: 0,
                      background: '#fff',
                      border: i === galleryIdx ? '2px solid var(--brand)' : '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      aspectRatio: '1',
                    }}
                  >
                    <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <h1>{product.name}</h1>
        {product.shortDescription && <p className="muted">{product.shortDescription}</p>}
        <div style={{ fontSize: '1.75rem', color: 'var(--brand)', fontWeight: 700, margin: '1rem 0' }}>
          {formatMoney(unitPrice)} <span style={{ fontSize: '1rem', color: 'var(--ink-muted)' }}>each</span>
          {unitPrice < basePrice && (
            <span style={{ fontSize: '.9rem', marginLeft: '.75rem', color: '#1e6b32' }}>
              Volume discount applied
            </span>
          )}
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
            <label>{opt.name} <span style={{ color: '#b91c1c' }}>*</span></label>
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
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'stretch' }}>
          <button
            type="button"
            className="btn secondary"
            onClick={() => setQty(Math.max(product.minQuantity, qty - 1))}
            aria-label="Decrease quantity"
          >−</button>
          <input
            type="number"
            min={product.minQuantity}
            value={qty}
            onChange={(e) => setQty(Math.max(product.minQuantity, Number(e.target.value)))}
            style={{ textAlign: 'center' }}
          />
          <button
            type="button"
            className="btn secondary"
            onClick={() => setQty(qty + 1)}
            aria-label="Increase quantity"
          >+</button>
        </div>

        {product.volumeTiers && product.volumeTiers.length > 0 && (
          <div style={{ background: 'var(--bg-alt)', padding: '.75rem', borderRadius: 'var(--radius)', margin: '.75rem 0', fontSize: '.9rem' }}>
            <strong>Volume pricing:</strong>
            <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.25rem' }}>
              {product.volumeTiers.map((t) => (
                <li key={t.minQty} style={{ fontWeight: qty >= t.minQty ? 700 : 400 }}>
                  {t.minQty}+ units → {formatMoney(t.pricePerUnitCents)} each
                  {qty >= t.minQty && <span style={{ color: '#1e6b32', marginLeft: '.5rem' }}>✓</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ margin: '1rem 0', fontSize: '1.1rem' }}>
          Subtotal: <strong>{formatMoney(unitPrice * qty)}</strong>
        </div>

        {error && <div className="error">{error}</div>}
        <button
          className="btn"
          onClick={addToCart}
          disabled={adding || !requiredOptionsMet}
          style={{ width: '100%', padding: '1rem' }}
        >
          {adding ? 'Adding…' : !requiredOptionsMet ? 'Select options to continue' : 'Add to cart'}
        </button>

        <p className="muted" style={{ fontSize: '.85rem', marginTop: '.75rem' }}>
          Custom print run · US-based · <Link to="/">See pricing tiers</Link>
        </p>

        {product.description && (
          <div style={{ marginTop: '2rem', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{product.description}</div>
        )}
      </div>
    </div>
  );
}
