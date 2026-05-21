import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useCart } from '../store/cart';
import { computePricing, formatMoney, type PricingConfig } from '../lib/pricing';
import { useSiteDiscount } from '../lib/useSiteDiscount';

type OptionType = 'TILES' | 'RADIO' | 'SELECT' | 'TOGGLE' | 'TEXT' | 'NUMBER' | 'UPLOAD' | 'CONFIRM';

interface ProductOptionValue {
  id: string;
  label: string;
  subLabel?: string | null;
  imageUrl?: string | null;
  priceModifierCents: number;
  sortOrder: number;
}

interface ProductOption {
  id: string;
  name: string;
  internalKey?: string | null;
  section?: string | null;
  type: OptionType;
  required: boolean;
  helpText?: string | null;
  longDescription?: string | null;
  dependsOnOptionId?: string | null;
  dependsOnValue?: string | null;
  sortOrder: number;
  values: ProductOptionValue[];
}

interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  shortDescription?: string | null;
  description?: string | null;
  priceCents: number;
  minQuantity: number;
  volumeTiers?: { minQty: number; pricePerUnitCents: number }[] | null;
  templateUrl?: string | null;
  faq?: { q: string; a: string }[] | null;
  pricingConfig?: PricingConfig | null;
  images: { id: string; url: string; alt?: string | null }[];
  options: ProductOption[];
}

function keyOf(opt: ProductOption): string {
  if (opt.internalKey) return opt.internalKey;
  return opt.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function Product() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { add } = useCart();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [selections, setSelections] = useState<Record<string, string | number | boolean>>({});
  const [qty, setQty] = useState(1);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const siteDiscountBps = useSiteDiscount();

  useEffect(() => {
    if (!slug) return;
    void api.get<{ product: ProductDetail }>(`/products/${slug}`).then((r) => {
      setProduct(r.product);
      setQty(r.product.minQuantity);
      // pre-select first value of each non-required tile/select option
      const init: Record<string, string> = {};
      for (const opt of r.product.options) {
        if ((opt.type === 'TILES' || opt.type === 'SELECT') && opt.values.length > 0 && !opt.required) {
          init[keyOf(opt)] = opt.values[0]!.label;
        }
      }
      setSelections(init);
      const firstSection = r.product.options.find((o) => o.section)?.section ?? null;
      setOpenSection(firstSection);
    });
  }, [slug]);

  // Group visible options by section.
  const { sections, nonSectionOpts } = useMemo(() => {
    if (!product) return { sections: [] as { name: string; opts: ProductOption[] }[], nonSectionOpts: [] as ProductOption[] };
    const visible = product.options.filter((o) => {
      if (!o.dependsOnValue) return true;
      const parent = product.options.find((x) => x.id === o.dependsOnOptionId) ??
                     product.options.find((x) => x.name === 'Embellishments'); // convention fallback
      if (!parent) return false;
      return selections[keyOf(parent)] === o.dependsOnValue;
    });
    const bySection = new Map<string, ProductOption[]>();
    const non: ProductOption[] = [];
    for (const o of visible.sort((a, b) => a.sortOrder - b.sortOrder)) {
      if (o.section) {
        if (!bySection.has(o.section)) bySection.set(o.section, []);
        bySection.get(o.section)!.push(o);
      } else {
        non.push(o);
      }
    }
    return {
      sections: Array.from(bySection.entries()).map(([name, opts]) => ({ name, opts })),
      nonSectionOpts: non,
    };
  }, [product, selections]);

  const sectionComplete = (opts: ProductOption[]) =>
    opts.every((o) => !o.required || selections[keyOf(o)] !== undefined && selections[keyOf(o)] !== '' && selections[keyOf(o)] !== false);

  const allComplete = useMemo(() => {
    if (!product) return false;
    return product.options.every((o) => {
      if (!o.required) return true;
      // skip options that are not currently visible
      if (o.dependsOnValue) {
        const parent = product.options.find((x) => x.id === o.dependsOnOptionId) ??
                       product.options.find((x) => x.name === 'Embellishments');
        if (!parent || selections[keyOf(parent)] !== o.dependsOnValue) return true;
      }
      const v = selections[keyOf(o)];
      return v !== undefined && v !== '' && v !== false;
    });
  }, [product, selections]);

  const breakdown = useMemo(() => {
    if (!product?.pricingConfig) return null;
    // Convert selections into pricing inputs (strings + numbers only).
    const options: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(selections)) {
      if (typeof v === 'string' && v !== '') options[k] = v;
      else if (typeof v === 'number') options[k] = v;
    }
    return computePricing(product.pricingConfig, { quantity: qty, options, siteDiscountBps });
  }, [product, selections, qty, siteDiscountBps]);

  if (!product) return <div className="container" style={{ padding: '2rem 0' }}>Loading…</div>;

  const setSel = (key: string, v: string | number | boolean) => setSelections({ ...selections, [key]: v });

  const addToCart = async () => {
    setError(null);
    setAdding(true);
    try {
      // Pass selected options as a string-keyed object for cart snapshot.
      const optionsForCart: Record<string, string> = {};
      for (const [k, v] of Object.entries(selections)) {
        if (typeof v === 'string') optionsForCart[k] = v;
        else optionsForCart[k] = String(v);
      }
      await add({ productId: product.id, quantity: qty, options: optionsForCart });
      navigate('/cart');
    } catch (e: any) {
      setError(e.message ?? 'Could not add to cart');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="container" style={{ padding: '1.5rem 1.25rem', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
      {/* LEFT — image gallery + trust + FAQ */}
      <aside>
        {product.images[0] ? (
          <img src={product.images[0].url} alt={product.name} style={{ width: '100%', borderRadius: 'var(--radius)' }} />
        ) : (
          <div style={{ aspectRatio: '3/4', background: 'var(--bg-alt)', borderRadius: 'var(--radius)' }} />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginTop: '1rem' }}>
          <div className="admin-card" style={{ textAlign: 'center', padding: '1rem .5rem' }}>
            <div style={{ fontSize: '1.5rem' }}>⊞</div>
            <div style={{ fontWeight: 600, fontSize: '.9rem' }}>Minimum QTY of 1</div>
          </div>
          <div className="admin-card" style={{ textAlign: 'center', padding: '1rem .5rem' }}>
            <div style={{ fontSize: '1.5rem' }}>★</div>
            <div style={{ fontWeight: 600, fontSize: '.9rem' }}>Collectible Grade Quality</div>
          </div>
        </div>

        <div className="admin-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem' }}>%</div>
          <div style={{ fontWeight: 700 }}>Print More. Pay Less.</div>
          <a href="#bulk-pricing">Click to View Bulk Pricing ↗</a>
        </div>

        {product.templateUrl && (
          <div className="admin-card">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div style={{ fontSize: '1.75rem' }}>⬇</div>
              <div>
                <div style={{ fontWeight: 700, textTransform: 'uppercase' }}>Print Template</div>
                <p className="muted" style={{ fontSize: '.85rem', margin: '.25rem 0' }}>
                  Download your free template we created for your specifications.
                </p>
                <a href={product.templateUrl} download>Download Your PDF Template!</a>
              </div>
            </div>
          </div>
        )}

        {product.faq && product.faq.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <h2>FAQ</h2>
            {product.faq.map((f, i) => (
              <details key={i} className="admin-card" style={{ padding: '.75rem 1rem', cursor: 'pointer' }}>
                <summary style={{ fontWeight: 600, listStyle: 'none', display: 'flex', justifyContent: 'space-between' }}>
                  {f.q} <span style={{ color: 'var(--brand)' }}>▾</span>
                </summary>
                <p style={{ marginTop: '.5rem', color: 'var(--ink-muted)' }}>{f.a}</p>
              </details>
            ))}
          </div>
        )}
      </aside>

      {/* RIGHT — configurator */}
      <div>
        <h1 style={{ marginBottom: '.25rem' }}>{product.name}</h1>
        {product.shortDescription && <p className="muted">{product.shortDescription}</p>}

        {/* Title input (non-sectioned) */}
        {nonSectionOpts.map((opt) => (
          <div key={opt.id} style={{ marginTop: '1rem' }}>
            <OptionControl opt={opt} value={selections[keyOf(opt)]} onChange={(v) => setSel(keyOf(opt), v)} productId={product.id} />
          </div>
        ))}

        {/* Sections */}
        <div style={{ marginTop: '1.5rem' }}>
          {sections.map(({ name, opts }) => {
            const open = openSection === name;
            const done = sectionComplete(opts);
            return (
              <div key={name} className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
                <button
                  onClick={() => setOpenSection(open ? null : name)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.75rem',
                    padding: '1rem 1.25rem',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: done ? '#16a34a' : 'var(--brand)',
                    color: '#fff',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.1rem', fontWeight: 800,
                  }}>{done ? '✓' : '!'}</span>
                  <span style={{ flex: 1 }}>{name}</span>
                  <span style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .15s' }}>▾</span>
                </button>
                {open && (
                  <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid var(--border)' }}>
                    {opts.map((opt) => (
                      <div key={opt.id} style={{ marginTop: '1.25rem' }}>
                        <OptionControl
                          opt={opt}
                          value={selections[keyOf(opt)]}
                          onChange={(v) => setSel(keyOf(opt), v)}
                          productId={product.id}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Qty + Add to cart */}
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <button className="btn" style={{ borderRadius: 0, background: 'var(--bg-alt)', color: 'var(--ink)' }} onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <input
              value={qty}
              type="number"
              min={1}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
              style={{ width: 70, border: 'none', textAlign: 'center' }}
            />
            <button className="btn" style={{ borderRadius: 0, background: 'var(--bg-alt)', color: 'var(--ink)' }} onClick={() => setQty(qty + 1)}>+</button>
          </div>
          <button
            className="btn"
            style={{ flex: 1, fontSize: '1.1rem', fontWeight: 700 }}
            onClick={addToCart}
            disabled={!allComplete || adding}
          >
            {adding ? 'Adding…' : '🛒 ADD TO CART'}
          </button>
        </div>
        {error && <div className="error">{error}</div>}

        <div className="admin-card" style={{ marginTop: '1rem', background: 'rgba(30, 116, 252, 0.08)' }}>
          🚚 Your order will ship in approximately 5 business days pending proof approval.
        </div>

        {/* Order summary */}
        <details open className="admin-card" id="bulk-pricing" style={{ marginTop: '1rem' }}>
          <summary style={{ fontWeight: 700, cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Order Summary <span>▾</span>
          </summary>
          {breakdown ? (
            <div style={{ marginTop: '1rem', fontSize: '.95rem' }}>
              <div className="spread"><span>Base list / book</span><span>{formatMoney(breakdown.baseCents)}</span></div>
              {Object.entries(breakdown.modifierCents).map(([k, v]) =>
                v > 0 ? (
                  <div key={k} className="spread"><span style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span><span>+{formatMoney(v)}</span></div>
                ) : null,
              )}
              {breakdown.pagesCents > 0 && (
                <div className="spread"><span>Pages</span><span>+{formatMoney(breakdown.pagesCents)}</span></div>
              )}
              <div className="spread"><span>Combined list / book</span><span>{formatMoney(breakdown.combinedListCents)}</span></div>
              {breakdown.discountBps > 0 && (
                <div className="spread" style={{ color: '#1e6b32' }}>
                  <span>Volume discount ({(breakdown.discountBps / 100).toFixed(1)}%)</span>
                  <span>−{formatMoney(Math.round(breakdown.combinedListCents * breakdown.discountBps / 10000))}</span>
                </div>
              )}
              {breakdown.siteDiscountBps > 0 && (
                <div className="spread" style={{ color: '#1e6b32' }}>
                  <span>Site discount ({(breakdown.siteDiscountBps / 100).toFixed(1)}%)</span>
                  <span>−{formatMoney(breakdown.combinedListCents - breakdown.unitCents - Math.round(breakdown.combinedListCents * breakdown.discountBps / 10000))}</span>
                </div>
              )}
              <div className="spread" style={{ borderTop: '1px solid var(--border)', paddingTop: '.5rem', marginTop: '.5rem' }}>
                <span><strong>{product.name}</strong><br /><span className="muted">{formatMoney(breakdown.unitCents)} per book × {qty}</span></span>
                <span>Sub Total: <strong>{formatMoney(breakdown.totalCents)}</strong></span>
              </div>
              <div className="spread" style={{ fontWeight: 700, fontSize: '1.1rem', marginTop: '.5rem' }}>
                <span>Total:</span><span>{formatMoney(breakdown.totalCents)}</span>
              </div>
            </div>
          ) : (
            <p className="muted">Configure options above to see pricing.</p>
          )}
        </details>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Option controls                                                     */
/* ------------------------------------------------------------------ */

function OptionControl({
  opt, value, onChange, productId,
}: {
  opt: ProductOption;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
  productId?: string;
}) {
  const label = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '.75rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
      <strong>{opt.name}</strong>
      {opt.required && <span style={{ color: '#b91c1c' }}>*</span>}
      {typeof value === 'string' && value && (
        <span style={{ color: 'var(--brand)', fontSize: '.9rem' }}>{value}</span>
      )}
      {opt.helpText && <span title={opt.helpText} style={{ cursor: 'help' }}>ⓘ</span>}
    </div>
  );

  switch (opt.type) {
    case 'TEXT':
      return (
        <div>
          {label}
          <input type="text" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case 'NUMBER':
      return (
        <div>
          {label}
          <input type="number" value={(value as number) ?? 0} onChange={(e) => onChange(Number(e.target.value))} />
        </div>
      );
    case 'SELECT':
      return (
        <div>
          {label}
          <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
            <option value="">Please select</option>
            {opt.values.map((v) => (
              <option key={v.id} value={v.label}>
                {v.label}{v.priceModifierCents > 0 ? `  (+$${(v.priceModifierCents / 100).toFixed(2)})` : ''}
              </option>
            ))}
          </select>
        </div>
      );
    case 'RADIO':
      return (
        <div>
          {label}
          <div className="row">
            {opt.values.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onChange(v.label)}
                style={{
                  padding: '.5rem 1rem',
                  border: '1px solid var(--border)',
                  background: value === v.label ? 'var(--brand)' : '#fff',
                  color: value === v.label ? '#fff' : 'var(--ink)',
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      );
    case 'TOGGLE':
      return (
        <div>
          {label}
          <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span>Yes</span>
          </label>
        </div>
      );
    case 'UPLOAD':
      return (
        <UploadControl opt={opt} value={value} onChange={onChange} productId={productId} label={label} />
      );
    case 'CONFIRM':
      return (
        <div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
              style={{ width: 'auto', marginTop: '.25rem' }}
            />
            <span>
              <strong>{opt.name}</strong>{opt.required && <span style={{ color: '#b91c1c' }}> *</span>} — <span>I confirm</span>
              {opt.longDescription && (
                <p className="muted" style={{ fontSize: '.85rem', marginTop: '.5rem' }}>{opt.longDescription}</p>
              )}
            </span>
          </label>
        </div>
      );
    case 'TILES':
      return (
        <div>
          {label}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '.75rem' }}>
            {opt.values.map((v) => {
              const selected = value === v.label;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onChange(v.label)}
                  style={{
                    padding: '.75rem',
                    background: selected ? 'var(--brand)' : '#fff',
                    color: selected ? '#fff' : 'var(--ink)',
                    border: `2px solid ${selected ? 'var(--brand)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '.25rem',
                  }}
                >
                  {v.imageUrl && (
                    <img src={v.imageUrl} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 4 }} />
                  )}
                  <strong style={{ fontSize: '.95rem', textAlign: 'center' }}>{v.label}</strong>
                  {v.priceModifierCents > 0 && (
                    <span style={{ fontSize: '.85rem', opacity: selected ? 0.9 : 0.7 }}>
                      ${(v.priceModifierCents / 100).toFixed(2)}
                    </span>
                  )}
                  {v.subLabel && (
                    <span style={{ fontSize: '.75rem', opacity: 0.7, textAlign: 'center' }}>{v.subLabel}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      );
    default:
      return null;
  }
}

function UploadControl({
  opt, value, onChange, productId, label,
}: {
  opt: ProductOption;
  value: string | number | boolean | undefined;
  onChange: (v: string) => void;
  productId?: string;
  label: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const file = list[0]!;
    setBusy(true);
    setErr(null);
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (productId) fd.append('productId', productId);
      fd.append('optionKey', opt.internalKey ?? opt.id);

      const url: string = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/uploads/customer');
        xhr.withCredentials = true;
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const body = JSON.parse(xhr.responseText);
              resolve(body.url);
            } catch (e) { reject(e); }
          } else {
            reject(new Error(xhr.statusText || 'Upload failed'));
          }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(fd);
      });
      onChange(url);
    } catch (e: any) {
      setErr(e.message ?? 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {label}
      <label
        className="btn secondary"
        style={{ cursor: busy ? 'wait' : 'pointer', display: 'inline-block' }}
      >
        {busy ? `Uploading… ${progress}%` : value ? 'Replace file' : 'Upload your work'}
        <input
          type="file"
          style={{ display: 'none' }}
          disabled={busy}
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </label>
      {typeof value === 'string' && value && !busy && (
        <div className="muted" style={{ fontSize: '.85rem', marginTop: '.5rem', wordBreak: 'break-all' }}>
          Uploaded: <a href={value} target="_blank" rel="noreferrer">{value}</a>
        </div>
      )}
      {err && <div className="error" style={{ marginTop: '.5rem' }}>{err}</div>}
    </div>
  );
}
