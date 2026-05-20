import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { api } from '../api/client';
import { useCart } from '../store/cart';
import { computePricing, formatMoney, type PricingConfig } from '../lib/pricing';
import '../styles/configurator.css';

// 3D book preview lives behind a lazy import — its R3F deps add ~250KB and
// most page traffic won't sit on this view long enough to need it pre-loaded.
const BookPreview3D = lazy(() => import('../components/BookPreview3D').then((m) => ({ default: m.BookPreview3D })));

type OptionType = 'TILES' | 'RADIO' | 'SELECT' | 'TOGGLE' | 'TEXT' | 'NUMBER' | 'UPLOAD' | 'CONFIRM';

interface OptionValue {
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
  values: OptionValue[];
}

interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  shortDescription?: string | null;
  priceCents: number;
  minQuantity: number;
  pricingConfig?: PricingConfig | null;
  images: { id: string; url: string; alt?: string | null }[];
  options: ProductOption[];
}

interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  heroImageUrl?: string | null;
}

function keyOf(opt: ProductOption): string {
  if (opt.internalKey) return opt.internalKey;
  return opt.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/**
 * For one option, the list-price delta of each value vs. that option's
 * cheapest value — used to show "($0.19)" next to each choice.
 *
 * Display only: runs the existing pricing engine with each candidate value
 * substituted into the current selections. Numeric value labels (page
 * counts) are coerced to numbers so the per-page formula fires. Does not
 * change any stored pricing.
 */
function optionPriceDeltas(
  cfg: PricingConfig,
  opt: ProductOption,
  selections: Record<string, string | number | boolean>,
): Map<string, number> {
  const key = keyOf(opt);
  const base: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(selections)) {
    if (typeof v === 'number') base[k] = v;
    else if (typeof v === 'string' && v) base[k] = /^\d+$/.test(v) ? Number(v) : v;
  }
  const rows = opt.values.map((val) => {
    const candidate: string | number = /^\d+$/.test(val.label) ? Number(val.label) : val.label;
    const list = computePricing(cfg, {
      quantity: 1,
      options: { ...base, [key]: candidate },
    }).combinedListCents;
    return { label: val.label, list };
  });
  if (rows.length === 0) return new Map();
  const min = Math.min(...rows.map((r) => r.list));
  return new Map(rows.map((r) => [r.label, Math.round(r.list - min)]));
}

// Parse a product name like "Comic Book — Standard (6.625" × 10.25")" → { width, height }
function parseDimensions(name: string): { widthIn: number; heightIn: number } | null {
  const m = name.match(/(\d+(?:\.\d+)?)["”]?\s*[×x]\s*(\d+(?:\.\d+)?)["”]?/);
  if (!m) return null;
  return { widthIn: Number(m[1]), heightIn: Number(m[2]) };
}

function colorForCover(label: string): string {
  // Map common cover/embellishment values to a hex tint for the 3D model.
  const v = label.toLowerCase();
  if (v.includes('black')) return '#1a1a1a';
  if (v.includes('white') || v.includes('uncoat')) return '#f5f3ee';
  if (v.includes('foil') || v.includes('gold')) return '#d4af37';
  if (v.includes('silver')) return '#c0c0c0';
  if (v.includes('matte')) return '#2a3a4d';
  if (v.includes('gloss')) return '#1e74fc';
  return '#c61a22'; // brand red default
}

export function CategoryConfigure() {
  const { category: categorySlug } = useParams();
  const navigate = useNavigate();
  const { add } = useCart();

  const [category, setCategory] = useState<Category | null>(null);
  const [products, setProducts] = useState<ProductDetail[]>([]);
  const [productId, setProductId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string | number | boolean>>({});
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // AI-describe state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  // Animated price ticker
  const [displayPrice, setDisplayPrice] = useState(0);
  const [priceFlash, setPriceFlash] = useState(0);
  const cartBtnRef = useRef<HTMLButtonElement>(null);

  // Local-only cover image previews. These are object URLs pointing at
  // File objects in the browser's memory — never uploaded. They live for
  // the page session; revoked when replaced or on unmount.
  const [frontCoverUrl, setFrontCoverUrl] = useState<string | null>(null);
  const [backCoverUrl, setBackCoverUrl] = useState<string | null>(null);
  const [spineCoverUrl, setSpineCoverUrl] = useState<string | null>(null);
  useEffect(() => () => {
    if (frontCoverUrl) URL.revokeObjectURL(frontCoverUrl);
    if (backCoverUrl) URL.revokeObjectURL(backCoverUrl);
    if (spineCoverUrl) URL.revokeObjectURL(spineCoverUrl);
  }, [frontCoverUrl, backCoverUrl, spineCoverUrl]);

  const pickCover = (side: 'front' | 'back' | 'spine') => (file: File | null | undefined) => {
    const setter =
      side === 'front' ? setFrontCoverUrl :
      side === 'back' ? setBackCoverUrl : setSpineCoverUrl;
    const current =
      side === 'front' ? frontCoverUrl :
      side === 'back' ? backCoverUrl : spineCoverUrl;
    if (current) URL.revokeObjectURL(current);
    setter(file ? URL.createObjectURL(file) : null);
  };

  useEffect(() => {
    if (!categorySlug) return;
    void api.get<{ category: Category; products: ProductDetail[] }>(`/products/_meta/categories/${categorySlug}/configure`)
      .then((r) => {
        setCategory(r.category);
        setProducts(r.products);
        if (r.products.length > 0) {
          setProductId(r.products[0]!.id);
          setQty(r.products[0]!.minQuantity);
        }
      });
  }, [categorySlug]);

  const product = useMemo(() => products.find((p) => p.id === productId) ?? null, [products, productId]);

  // When the active product changes, seed default selections from non-required tile/select values.
  useEffect(() => {
    if (!product) return;
    const init: Record<string, string> = {};
    for (const opt of product.options) {
      if ((opt.type === 'TILES' || opt.type === 'SELECT' || opt.type === 'RADIO') && opt.values.length > 0) {
        init[keyOf(opt)] = opt.values[0]!.label;
      }
    }
    setSelections(init);
    setQty(product.minQuantity);
  }, [productId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const visibleOptions = useMemo(() => {
    if (!product) return [];
    return product.options
      .filter((o) => {
        if (!o.dependsOnValue) return true;
        const parent = product.options.find((x) => x.id === o.dependsOnOptionId)
          ?? product.options.find((x) => x.name.toLowerCase() === 'embellishments');
        if (!parent) return false;
        return selections[keyOf(parent)] === o.dependsOnValue;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [product, selections]);

  const sections = useMemo(() => {
    const map = new Map<string, ProductOption[]>();
    for (const o of visibleOptions) {
      const key = o.section ?? 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries()).map(([name, opts]) => ({ name, opts }));
  }, [visibleOptions]);

  const breakdown = useMemo(() => {
    if (!product?.pricingConfig) return null;
    const opts: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(selections)) {
      // Coerce numeric value labels (page counts) to numbers so the per-page
      // pricing formula fires — matches the server-side cart (cart.ts) and
      // the v1 orders API. Without this the running total skips page upgrades.
      if (typeof v === 'number') opts[k] = v;
      else if (typeof v === 'string' && v) opts[k] = /^\d+$/.test(v) ? Number(v) : v;
    }
    return computePricing(product.pricingConfig, { quantity: qty, options: opts });
  }, [product, selections, qty]);

  // Animate price reveal — interpolates over ~400ms whenever the target changes.
  useEffect(() => {
    const target = breakdown?.totalCents ?? (product ? product.priceCents * qty : 0);
    if (target !== displayPrice) setPriceFlash((n) => n + 1);
    let raf = 0;
    const start = performance.now();
    const from = displayPrice;
    const duration = 380;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayPrice(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [breakdown?.totalCents, product, qty]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Build the 3D book spec from active product + selections
  const bookSpec = useMemo(() => {
    if (!product) return null;
    const dim = parseDimensions(product.name) ?? { widthIn: 6.625, heightIn: 10.25 };
    const pageCount = Number(selections['pages']) || Number(selections['interior_pages']) || 32;
    const cover = (selections['cover_paper'] ?? selections['cover'] ?? 'White') as string;
    const embellishment = (selections['embellishments'] ?? '') as string;
    const lamStyle = (selections['lamination_style'] ?? '') as string;
    // Title is ONLY whatever the customer types into the Title field.
    // Empty until they type — leaves the cover hero region clean.
    const userTitle = (selections['title'] as string | undefined)?.trim();
    const sizeLabel = product.name.replace(/^.*?[—-]\s*/, '').replace(/\s*\(.*?\)/, '');

    let paperStyle: 'uncoated' | 'matte' | 'gloss' | 'foil' | 'uv' = 'uncoated';
    if (/foil/i.test(embellishment)) paperStyle = 'foil';
    else if (/uv/i.test(embellishment)) paperStyle = 'uv';
    else if (/gloss/i.test(lamStyle)) paperStyle = 'gloss';
    else if (/matte/i.test(lamStyle)) paperStyle = 'matte';

    // Comics are saddle-stitched (stapled through the fold) — no spine.
    // Anything else (graphic novels, trade paperbacks, zines above a page
    // count) defaults to perfect binding with a real spine.
    const binding: 'saddle-stitch' | 'perfect' =
      /comic/i.test(categorySlug ?? '') ? 'saddle-stitch' : 'perfect';

    return {
      widthIn: dim.widthIn,
      heightIn: dim.heightIn,
      pageCount,
      coverColor: colorForCover(cover),
      pageColor: '#fbf8f3',
      hasFoil: /foil/i.test(embellishment),
      paperStyle,
      title: userTitle,   // undefined when blank → no top-of-cover label
      subtitle: sizeLabel,
      binding,
      frontCoverImageUrl: frontCoverUrl ?? undefined,
      backCoverImageUrl: backCoverUrl ?? undefined,
      spineImageUrl: binding === 'perfect' ? (spineCoverUrl ?? undefined) : undefined,
    };
  }, [product, selections, categorySlug, frontCoverUrl, backCoverUrl, spineCoverUrl]);

  const setSel = (k: string, v: string | number | boolean) => setSelections((cur) => ({ ...cur, [k]: v }));

  async function applyAi() {
    if (!aiInput.trim() || !categorySlug) return;
    setAiBusy(true);
    setAiMessage(null);
    try {
      const r = await api.post<{ configuration: { productSlug: string; selections: Record<string, string | number>; quantity: number; rationale: string } }>(
        '/ai/configure',
        { categorySlug, description: aiInput },
      );
      const cfg = r.configuration;
      const target = products.find((p) => p.slug === cfg.productSlug);
      if (target) {
        setProductId(target.id);
        // Selections are seeded after productId effect — apply ours after a microtask.
        setTimeout(() => {
          setSelections(cfg.selections as Record<string, string | number>);
          setQty(Math.max(target.minQuantity, cfg.quantity));
        }, 50);
        setAiMessage(`✨ ${cfg.rationale}`);
      }
    } catch (e: any) {
      setAiMessage(`Couldn't parse that — try being more specific. (${e.message ?? 'error'})`);
    } finally {
      setAiBusy(false);
    }
  }

  async function addToCart() {
    if (!product) return;
    setError(null);
    setAdding(true);
    try {
      const optionsForCart: Record<string, string> = {};
      for (const [k, v] of Object.entries(selections)) {
        optionsForCart[k] = String(v);
      }
      await add({ productId: product.id, quantity: qty, options: optionsForCart });
      // Confetti burst from the button position
      const rect = cartBtnRef.current?.getBoundingClientRect();
      const x = rect ? (rect.left + rect.width / 2) / window.innerWidth : 0.5;
      const y = rect ? (rect.top + rect.height / 2) / window.innerHeight : 0.5;
      confetti({
        particleCount: 90,
        spread: 75,
        origin: { x, y },
        colors: ['#c61a22', '#1e74fc', '#8b5cf6', '#ec4899', '#fde68a'],
        scalar: 0.9,
      });
      setTimeout(() => navigate('/cart'), 650);
    } catch (e: any) {
      setError(e.message ?? 'Could not add to cart');
    } finally {
      setAdding(false);
    }
  }

  if (!category) return <div className="container" style={{ padding: '3rem 0' }}>Loading…</div>;

  if (products.length === 0) {
    return (
      <div className="container" style={{ padding: '3rem 0' }}>
        <h1>{category.name}</h1>
        <p className="muted">No products in this category yet.</p>
      </div>
    );
  }

  return (
    <>
      {/* Hero band */}
      <section className="pc-hero-mesh" style={{
        color: '#fff',
        padding: '2.5rem 0 1.5rem',
        marginBottom: '1.5rem',
      }}>
        <div className="container">
          <div className="spread" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', opacity: .7 }}>
                Configure your print run
              </div>
              <h1 style={{ color: '#fff', margin: '.25rem 0 .5rem', fontSize: '2.25rem' }}>{category.name}</h1>
              {category.description && (
                <p style={{ margin: 0, opacity: .85, maxWidth: 580 }}>{category.description}</p>
              )}
            </div>
            <button className="pc-ai-pill" onClick={() => setAiOpen((o) => !o)}>
              ✨ Configure with AI
            </button>
          </div>

          {aiOpen && (
            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <input
                className="pc-ai-input"
                placeholder='Describe what you want — e.g. "100 copies of a 48-page comic with foil cover"'
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void applyAi(); }}
                style={{ flex: 1, minWidth: 280 }}
              />
              <button className="btn" disabled={aiBusy || !aiInput.trim()} onClick={() => void applyAi()}>
                {aiBusy ? 'Thinking…' : 'Configure'}
              </button>
            </div>
          )}
          {aiMessage && (
            <div style={{ marginTop: '.5rem', fontSize: '.85rem', opacity: .9 }}>{aiMessage}</div>
          )}
        </div>
      </section>

      <div className="container" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(360px, 460px)', gap: '2rem', alignItems: 'flex-start' }}>
        {/* Left: 3D preview pinned, vertically centered in the viewport */}
        <div style={{ position: 'sticky', top: 'max(6rem, calc(50vh - 16rem))' }}>
          <Suspense fallback={<div style={{ height: 520, background: '#0f172a', borderRadius: 16 }} />}>
            {bookSpec && <BookPreview3D spec={bookSpec} />}
          </Suspense>
          <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '.85rem', color: 'var(--muted)' }}>
            Live preview — drag to orbit, scroll to zoom
          </div>

          <div className="admin-card" style={{ marginTop: '1rem' }}>
            <div className="muted" style={{ fontSize: '.75rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.05em', marginBottom: '.5rem' }}>
              Cover artwork (optional)
            </div>
            <p className="muted" style={{ fontSize: '.8rem', marginTop: 0, marginBottom: '.75rem' }}>
              <strong>Preview only.</strong> Drop cover images here to visualize your book in 3D.
              These are not used for order fulfillment — you'll upload your final print-ready
              artwork separately when you finalize the order.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: bookSpec?.binding === 'perfect' ? '1fr 1fr 1fr' : '1fr 1fr',
                gap: '.75rem',
              }}
            >
              <CoverUploadTile
                label="Front cover"
                url={frontCoverUrl}
                onPick={pickCover('front')}
                onClear={() => pickCover('front')(null)}
              />
              {bookSpec?.binding === 'perfect' && (
                <CoverUploadTile
                  label="Spine art"
                  url={spineCoverUrl}
                  onPick={pickCover('spine')}
                  onClear={() => pickCover('spine')(null)}
                />
              )}
              <CoverUploadTile
                label="Back cover"
                url={backCoverUrl}
                onPick={pickCover('back')}
                onClear={() => pickCover('back')(null)}
              />
            </div>
          </div>

          {product && (
            <div className="admin-card pc-summary-card" style={{ marginTop: '1rem' }}>
              <div className="muted" style={{ fontSize: '.75rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.05em' }}>
                Order summary
              </div>
              <div style={{ marginTop: '.5rem', fontSize: '.95rem', lineHeight: 1.7 }}>
                {Object.entries(selections).filter(([_, v]) => v !== '' && v !== false && v !== undefined).slice(0, 8).map(([k, v]) => (
                  <div key={k} className="spread" style={{ fontSize: '.85rem' }}>
                    <span className="muted" style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                    <span>{String(v)}</span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px solid var(--border)', marginTop: '.75rem', paddingTop: '.75rem' }}>
                <div className="spread" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--brand)' }}>
                  <span>Total</span>
                  <span key={priceFlash} className="pc-price-flash" style={{ display: 'inline-block' }}>
                    {formatMoney(displayPrice)}
                  </span>
                </div>
                {breakdown && (
                  <div className="muted" style={{ fontSize: '.8rem', textAlign: 'right' }}>
                    {qty} × {formatMoney(breakdown.unitCents)}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem', alignItems: 'center' }}>
                <input
                  type="number"
                  min={product.minQuantity}
                  value={qty}
                  onChange={(e) => setQty(Math.max(product.minQuantity, Number(e.target.value)))}
                  style={{ width: 100 }}
                />
                <button
                  ref={cartBtnRef}
                  className="btn pc-cta"
                  style={{ flex: 1 }}
                  disabled={adding}
                  onClick={() => void addToCart()}
                >
                  {adding ? 'Adding…' : 'Add to cart →'}
                </button>
              </div>
              {error && <div className="error" style={{ marginTop: '.5rem' }}>{error}</div>}
            </div>
          )}
        </div>

        {/* Right: configurator panels */}
        <div>
          {/* Size picker — synthesized from the products */}
          <ConfigSection title="Choose your size" subtitle="Pick a trim size to start" defaultOpen>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '.75rem' }}>
              {products.map((p) => {
                const dim = parseDimensions(p.name);
                const selected = p.id === productId;
                return (
                  <button
                    key={p.id}
                    onClick={() => setProductId(p.id)}
                    className={`pc-tile ${selected ? 'pc-tile-selected' : ''}`}
                    style={{
                      background: selected ? 'var(--brand)' : '#fff',
                      color: selected ? '#fff' : 'var(--ink)',
                      border: `2px solid ${selected ? 'var(--brand)' : 'var(--border)'}`,
                      borderRadius: 12,
                      padding: '1rem .5rem',
                      cursor: 'pointer',
                      transform: selected ? 'scale(1.04)' : 'scale(1)',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '.95rem' }}>
                      {p.name.replace(/^.*?[—-]\s*/, '').replace(/\s*\(.*?\)/, '')}
                    </div>
                    {dim && (
                      <div style={{ fontSize: '.8rem', opacity: .85, marginTop: '.25rem' }}>
                        {dim.widthIn}" × {dim.heightIn}"
                      </div>
                    )}
                    <div style={{ fontSize: '.8rem', marginTop: '.5rem', opacity: .9 }}>
                      from {formatMoney(p.priceCents)}
                    </div>
                  </button>
                );
              })}
            </div>
          </ConfigSection>

          {/* Per-section options for the active product */}
          {product && sections.map((sec) => (
            <ConfigSection key={sec.name} title={sec.name} defaultOpen>
              {sec.opts.map((opt) => (
                <div key={opt.id} style={{ marginBottom: '1.25rem' }}>
                  <OptionField
                    opt={opt}
                    value={selections[keyOf(opt)]}
                    onChange={(v) => setSel(keyOf(opt), v)}
                    deltas={
                      product.pricingConfig
                        ? optionPriceDeltas(product.pricingConfig, opt, selections)
                        : undefined
                    }
                  />
                </div>
              ))}
            </ConfigSection>
          ))}
        </div>
      </div>
    </>
  );
}

function ConfigSection({ title, subtitle, defaultOpen, children }: { title: string; subtitle?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className={`admin-card pc-section ${open ? 'pc-section-open' : ''}`} style={{ marginBottom: '1rem', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '.5rem 0', fontWeight: 600, fontSize: '1.1rem',
        }}
      >
        <span>
          {title}
          {subtitle && <span className="muted" style={{ fontWeight: 400, fontSize: '.85rem', marginLeft: '.5rem' }}>{subtitle}</span>}
        </span>
        <span style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .2s' }}>▾</span>
      </button>
      <div style={{
        maxHeight: open ? 4000 : 0,
        opacity: open ? 1 : 0,
        overflow: 'hidden',
        transition: 'max-height .35s ease, opacity .25s ease',
        paddingTop: open ? '.75rem' : 0,
      }}>
        {children}
      </div>
    </div>
  );
}

function OptionField({ opt, value, onChange, deltas }: { opt: ProductOption; value: string | number | boolean | undefined; onChange: (v: string | number | boolean) => void; deltas?: Map<string, number> }) {
  // Price shown next to a value: the list-price delta vs. the cheapest choice.
  const priceTag = (valueLabel: string): string => {
    const d = deltas?.get(valueLabel) ?? 0;
    return d > 0 ? ` (${formatMoney(d)})` : '';
  };
  const label = (
    <div style={{ marginBottom: '.5rem' }}>
      <strong>{opt.name}</strong>
      {opt.required && <span style={{ color: '#b91c1c', marginLeft: 4 }}>*</span>}
      {opt.helpText && <div className="muted" style={{ fontSize: '.85rem' }}>{opt.helpText}</div>}
    </div>
  );

  switch (opt.type) {
    case 'TILES':
      return (
        <div>
          {label}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '.5rem' }}>
            {opt.values.map((v) => {
              const selected = value === v.label;
              return (
                <button
                  key={v.id}
                  onClick={() => onChange(v.label)}
                  className={`pc-tile ${selected ? 'pc-tile-selected' : ''}`}
                  style={{
                    background: selected ? 'var(--brand)' : '#fff',
                    color: selected ? '#fff' : 'var(--ink)',
                    border: `2px solid ${selected ? 'var(--brand)' : 'var(--border)'}`,
                    borderRadius: 8,
                    padding: '.6rem .5rem',
                    cursor: 'pointer',
                    fontSize: '.85rem',
                    fontWeight: selected ? 600 : 500,
                  }}
                >
                  {v.imageUrl && <img src={v.imageUrl} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, marginBottom: '.25rem' }} />}
                  <div>{v.label}</div>
                  {v.subLabel && <div style={{ fontSize: '.7rem', opacity: .8 }}>{v.subLabel}</div>}
                  {(deltas?.get(v.label) ?? 0) > 0 && (
                    <div style={{ fontSize: '.7rem', marginTop: '.2rem', opacity: .9 }}>
                      ({formatMoney(deltas!.get(v.label)!)})
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      );
    case 'SELECT':
      return (
        <div>
          {label}
          <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
            {opt.values.map((v) => {
              // For bare-number values (page counts) repeat the option name so
              // the row reads like "12 Interior Pages ($0.19)".
              const numeric = /^\d+$/.test(v.label);
              const text = `${v.label}${numeric ? ` ${opt.name}` : ''}${priceTag(v.label)}`;
              return <option key={v.id} value={v.label}>{text}</option>;
            })}
          </select>
        </div>
      );
    case 'RADIO':
      return (
        <div>
          {label}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
            {opt.values.map((v) => (
              <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
                <input type="radio" name={opt.id} checked={value === v.label} onChange={() => onChange(v.label)} style={{ width: 'auto' }} />
                <span>
                  {v.label}
                  {v.subLabel && <span className="muted" style={{ fontSize: '.85rem' }}> — {v.subLabel}</span>}
                  {priceTag(v.label) && <span className="muted" style={{ fontSize: '.85rem' }}>{priceTag(v.label)}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      );
    case 'TOGGLE':
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} style={{ width: 'auto' }} />
          <strong>{opt.name}</strong>
        </label>
      );
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
    case 'CONFIRM':
      return (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} style={{ width: 'auto', marginTop: '.25rem' }} />
          <span>
            <strong>{opt.name}</strong>{opt.required && <span style={{ color: '#b91c1c' }}> *</span>}
            {opt.longDescription && <p className="muted" style={{ fontSize: '.85rem', marginTop: '.5rem' }}>{opt.longDescription}</p>}
          </span>
        </label>
      );
    default:
      return null;
  }
}


function CoverUploadTile({
  label, url, onPick, onClear,
}: {
  label: string;
  url: string | null;
  onPick: (file: File | null) => void;
  onClear: () => void;
}) {
  return (
    <div
      style={{
        border: '1px dashed var(--border)',
        borderRadius: 8,
        padding: '.5rem',
        textAlign: 'center',
        position: 'relative',
        minHeight: 120,
        display: 'flex', flexDirection: 'column', gap: '.4rem', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{ fontSize: '.8rem', fontWeight: 600 }}>{label}</div>
      {url ? (
        <>
          <img src={url} alt={label} style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 4, objectFit: 'contain' }} />
          <button type="button" className="btn secondary" style={{ fontSize: '.75rem', padding: '.25rem .5rem' }} onClick={onClear}>
            Remove
          </button>
        </>
      ) : (
        <label className="btn secondary" style={{ fontSize: '.8rem', cursor: 'pointer' }}>
          Choose file
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </label>
      )}
    </div>
  );
}
