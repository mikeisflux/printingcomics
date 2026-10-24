/**
 * /admin/orders/new — an order placed by staff for a customer: a phone order,
 * a quote that became a sale, a replacement. The server prices every line
 * with the storefront's engine (a price can be set by hand), quotes shipping
 * for the real boxes, applies a code or an amount off, and creates the order
 * paid (money taken another way), comped, or waiting on an emailed pay link.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';
import { PageHeader, errorMessage, useDebounced, useToast } from '../../components/admin/ui';
import { AddressFields } from '../../components/AddressFields';
import { emptyAddress, validateAddress, emailLooksValid, arrivalFromDays, type Address, type AddressField } from '../../lib/address';
import { OptionControl, keyOf, type ProductOption } from '../Product';
import { fullName, type UserRow } from './Users';

/** Mirrors PAYMENT_METHODS in server/src/lib/manual-order.ts. */
export const PAYMENT_METHODS: { key: string; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'check', label: 'Check' },
  { key: 'paypal-invoice', label: 'PayPal invoice / PayPal.me' },
  { key: 'venmo', label: 'Venmo' },
  { key: 'zelle', label: 'Zelle' },
  { key: 'card-terminal', label: 'Card (terminal / over the phone)' },
  { key: 'bank', label: 'Bank transfer / wire' },
  { key: 'other', label: 'Other' },
];

interface ProductHit {
  id: string; slug: string; name: string; sku?: string | null; priceCents: number; active: boolean;
  madeToOrder: boolean; minQuantity: number; unitsPerItem?: number; images: { url: string }[];
}
interface ProductFull extends ProductHit {
  variants: { id: string; label: string; priceCents: number; stock: number; active: boolean }[];
  options: ProductOption[];
}
interface Line {
  key: string;
  product: ProductFull;
  variantId: string | null;
  quantity: number;
  selections: Record<string, string | number | boolean>;
  /** Dollars, as typed; used only while `customPrice` is on. */
  priceText: string;
  customPrice: boolean;
}
interface PreviewLine {
  productId: string; variantId: string | null; name: string; quantity: number;
  unitPriceCents: number; enginePriceCents: number; overridden: boolean; totalCents: number;
  stockNote: string | null; belowMinimum: number | null; hidden: boolean;
}
interface ShipOption { id: string; name: string; rateCents: number; estimatedDays: string | null; boxes: number }
interface Preview {
  lines: PreviewLine[];
  subtotalCents: number; discountCents: number; shippingDiscountCents: number;
  discountLabel: string | null; couponCode: string | null;
  shippingListCents: number; shippingCents: number; shippingName: string | null; shippingOptionId: string | null;
  taxCents: number; taxAutoCents: number; totalCents: number;
  shippingOptions: ShipOption[]; shippingError: string | null;
  warnings: string[]; stockShort: boolean;
}
interface SavedAddress {
  id: string; label?: string | null; firstName: string; lastName: string; company?: string | null; line1: string; line2?: string | null;
  city: string; region: string; postalCode: string; country: string; phone?: string | null; isDefault: boolean;
}
type PayMode = 'link' | 'paid' | 'comp';

const dollarsToCents = (s: string): number => {
  const n = Number(String(s).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const centsToDollars = (c: number) => (c / 100).toFixed(2);
let lineSeq = 0;

/** The options to show for a line: in order, minus uploads, honouring "only when X is Y". */
function visibleOptions(product: ProductFull, sel: Record<string, unknown>): ProductOption[] {
  return [...product.options]
    .filter((o) => o.type !== 'UPLOAD')
    .filter((o) => {
      if (!o.dependsOnValue) return true;
      const parent = product.options.find((x) => x.id === o.dependsOnOptionId) ?? product.options.find((x) => x.name === 'Embellishments');
      return !!parent && sel[keyOf(parent)] === o.dependsOnValue;
    })
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** What the storefront preselects: the first choice of every pick-one option. */
function defaultSelections(product: ProductFull): Record<string, string> {
  const init: Record<string, string> = {};
  for (const opt of product.options) {
    if ((opt.type === 'TILES' || opt.type === 'SELECT' || opt.type === 'RADIO') && opt.values.length > 0) init[keyOf(opt)] = opt.values[0]!.label;
  }
  return init;
}

function serialize(sel: Record<string, string | number | boolean>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sel)) {
    if (v === '' || v == null) continue;
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

export function AdminOrderNew() {
  const navigate = useNavigate();
  const toast = useToast();

  // Customer
  const [custQ, setCustQ] = useState('');
  const [custHits, setCustHits] = useState<UserRow[]>([]);
  const [picked, setPicked] = useState<UserRow | null>(null);
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // Addresses
  const [ship, setShip] = useState<Address>({ ...emptyAddress });
  const [shipTouched, setShipTouched] = useState<Set<AddressField> | 'all'>(new Set());
  const [billSame, setBillSame] = useState(true);
  const [bill, setBill] = useState<Address>({ ...emptyAddress });
  const [billTouched, setBillTouched] = useState<Set<AddressField> | 'all'>(new Set());

  // Items
  const [prodQ, setProdQ] = useState('');
  const [prodHits, setProdHits] = useState<ProductHit[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [adding, setAdding] = useState(false);

  // Shipping, discount, tax, payment
  const [shipMode, setShipMode] = useState<'quote' | 'manual'>('quote');
  const [shipOptionId, setShipOptionId] = useState('');
  const [shipManualName, setShipManualName] = useState('');
  const [shipManualAmount, setShipManualAmount] = useState('');
  const [discMode, setDiscMode] = useState<'none' | 'code' | 'amount'>('none');
  const [discCode, setDiscCode] = useState('');
  const [discAmount, setDiscAmount] = useState('');
  const [discLabel, setDiscLabel] = useState('');
  const [taxMode, setTaxMode] = useState<'auto' | 'manual'>('auto');
  const [taxAmount, setTaxAmount] = useState('');
  const [payMode, setPayMode] = useState<PayMode>('link');
  const [payProvider, setPayProvider] = useState('check');
  const [payReference, setPayReference] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [notes, setNotes] = useState('');
  const [ignoreStock, setIgnoreStock] = useState(false);

  // Pricing
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ---- customer search ----
  const custQd = useDebounced(custQ.trim(), 300);
  useEffect(() => {
    if (picked || custQd.length < 2) { setCustHits([]); return; }
    let alive = true;
    api.get<{ users: UserRow[] }>(`/admin/users?q=${encodeURIComponent(custQd)}`)
      .then((r) => { if (alive) setCustHits(r.users.slice(0, 8)); })
      .catch(() => { if (alive) setCustHits([]); });
    return () => { alive = false; };
  }, [custQd, picked]);

  const applyAddress = (a: SavedAddress | null, fallback?: { firstName?: string | null; lastName?: string | null; phone?: string | null }) => {
    if (a) {
      setShip({
        firstName: a.firstName, lastName: a.lastName, company: a.company ?? '', line1: a.line1, line2: a.line2 ?? '', city: a.city,
        region: a.region, postalCode: a.postalCode, country: a.country || 'US', phone: a.phone ?? fallback?.phone ?? '',
      });
    } else if (fallback) {
      setShip((s) => ({ ...s, firstName: s.firstName || fallback.firstName || '', lastName: s.lastName || fallback.lastName || '', phone: s.phone || fallback.phone || '' }));
    }
    setShipTouched(new Set());
  };

  const pickCustomer = async (u: UserRow) => {
    setPicked(u); setCustHits([]); setCustQ('');
    setEmail(u.email); setFirstName(u.firstName ?? ''); setLastName(u.lastName ?? '');
    try {
      const r = await api.get<{ user: { addresses?: SavedAddress[]; phone?: string | null } }>(`/admin/users/${u.id}`);
      const addresses = r.user.addresses ?? [];
      setSaved(addresses);
      applyAddress(addresses.find((a) => a.isDefault) ?? addresses[0] ?? null, { firstName: u.firstName, lastName: u.lastName, phone: r.user.phone ?? u.phone });
    } catch {
      setSaved([]);
      applyAddress(null, { firstName: u.firstName, lastName: u.lastName, phone: u.phone });
    }
  };
  const clearCustomer = () => { setPicked(null); setSaved([]); };

  // ---- product search ----
  const prodQd = useDebounced(prodQ.trim(), 300);
  useEffect(() => {
    if (prodQd.length < 2) { setProdHits([]); return; }
    let alive = true;
    api.get<{ products: ProductHit[] }>(`/admin/products?q=${encodeURIComponent(prodQd)}`)
      .then((r) => { if (alive) setProdHits(r.products.slice(0, 12)); })
      .catch(() => { if (alive) setProdHits([]); });
    return () => { alive = false; };
  }, [prodQd]);

  const addProduct = async (hit: ProductHit) => {
    setAdding(true);
    try {
      const { product } = await api.get<{ product: ProductFull }>(`/admin/products/${hit.id}`);
      const variant = product.variants.find((v) => v.active) ?? product.variants[0] ?? null;
      setLines((ls) => [...ls, {
        key: `l${++lineSeq}`, product, variantId: variant?.id ?? null, quantity: Math.max(1, product.minQuantity || 1),
        selections: defaultSelections(product), priceText: '', customPrice: false,
      }]);
      setProdQ(''); setProdHits([]);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load that product'));
    } finally { setAdding(false); }
  };
  const patchLine = (key: string, patch: Partial<Line> | ((l: Line) => Partial<Line>)) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...(typeof patch === 'function' ? patch(l) : patch) } : l)));
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  // ---- the body the server prices (and, with payment, creates) ----
  const canRate = !!ship.postalCode.trim() && !!ship.country;
  const body = (forCreate: boolean) => ({
    email: email.trim(),
    firstName: firstName.trim() || undefined,
    lastName: lastName.trim() || undefined,
    shippingAddress: ship,
    billingAddress: billSame ? undefined : { ...bill, phone: ship.phone },
    items: lines.map((l) => ({
      productId: l.product.id,
      variantId: l.variantId,
      quantity: Math.max(1, Math.floor(Number(l.quantity) || 1)),
      options: serialize(l.selections),
      unitPriceCents: l.customPrice && l.priceText.trim() !== '' ? dollarsToCents(l.priceText) : null,
    })),
    shipping: shipMode === 'quote'
      ? { mode: 'quote' as const, optionId: shipOptionId || null }
      : { mode: 'manual' as const, cents: dollarsToCents(shipManualAmount), name: shipManualName.trim() },
    discount: discMode === 'code' ? { code: discCode.trim() || null } : discMode === 'amount' ? { cents: dollarsToCents(discAmount), label: discLabel.trim() || null } : null,
    tax: taxMode === 'manual' ? { mode: 'manual' as const, cents: dollarsToCents(taxAmount) } : { mode: 'auto' as const },
    ignoreStock,
    ...(forCreate ? {
      payment: payMode === 'paid' ? { mode: 'paid' as const, provider: payProvider, reference: payReference.trim() || null } : { mode: payMode },
      notes: notes.trim() || null,
      sendEmail,
    } : {}),
  });

  // Reprice on every change, debounced, through the real engine on the server.
  const previewKey = useMemo(() => (lines.length ? JSON.stringify(body(false)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, ship, bill, billSame, email, shipMode, shipOptionId, shipManualName, shipManualAmount, discMode, discCode, discAmount, discLabel, taxMode, taxAmount, ignoreStock]);
  const previewKeyD = useDebounced(previewKey, 350);
  useEffect(() => {
    if (!previewKeyD) { setPreview(null); setPreviewError(null); return; }
    let alive = true;
    setPreviewing(true);
    api.post<{ preview: Preview }>('/admin/orders/preview', JSON.parse(previewKeyD))
      .then((r) => { if (!alive) return; setPreview(r.preview); setPreviewError(null); })
      .catch((e) => { if (alive) setPreviewError(errorMessage(e, 'Could not price the order')); })
      .finally(() => { if (alive) setPreviewing(false); });
    return () => { alive = false; };
  }, [previewKeyD]);

  // The cheapest rate is picked until staff choose another (or the chosen one is gone).
  useEffect(() => {
    if (shipMode !== 'quote' || !preview) return;
    const opts = preview.shippingOptions;
    if (opts.length === 0) return;
    if (!shipOptionId || !opts.some((o) => o.id === shipOptionId)) setShipOptionId(opts[0]!.id);
  }, [preview, shipMode, shipOptionId]);

  const shipErrors = validateAddress(ship);
  const billErrors = validateAddress({ ...bill, phone: ship.phone });
  const touch = (set: typeof setShipTouched) => (f: AddressField) => set((prev) => (prev === 'all' ? prev : new Set(prev).add(f)));

  const create = async () => {
    setCreateError(null);
    const problems: string[] = [];
    if (!emailLooksValid(email)) problems.push('Enter the customer’s email address.');
    if (lines.length === 0) problems.push('Add at least one item.');
    if (Object.keys(shipErrors).length) { setShipTouched('all'); problems.push('Complete the shipping address (phone included).'); }
    if (!billSame && Object.keys(billErrors).length) { setBillTouched('all'); problems.push('Complete the billing address.'); }
    if (shipMode === 'quote' && !shipOptionId) problems.push('Pick a shipping rate, or enter the shipping charge by hand.');
    if (shipMode === 'manual' && !shipManualName.trim()) problems.push('Name the shipping method.');
    if (problems.length) { setCreateError(problems.join(' ')); return; }
    setCreating(true);
    try {
      const r = await api.post<{ order: { id: string; number: string }; payLink: string | null; emailed: boolean; emailError: string | null }>('/admin/orders', body(true));
      if (r.payLink) {
        if (r.emailed) toast.success(`Order ${r.order.number} created — the pay link went to ${email.trim()}.`);
        else toast.error(`Order ${r.order.number} created, but the pay link email failed${r.emailError ? ` (${r.emailError})` : ''}. Copy the link from the order.`);
      } else {
        toast.success(`Order ${r.order.number} created.`);
      }
      navigate(`/admin/orders/${r.order.id}`);
    } catch (e) {
      setCreateError(errorMessage(e, 'Could not create the order'));
    } finally { setCreating(false); }
  };

  const p = preview;
  const chosenRate = p?.shippingOptions.find((o) => o.id === shipOptionId) ?? null;
  // Between picking a rate and the server repricing with it, the summary
  // shows that rate from the quote in hand rather than a blank.
  const pendingShip = shipMode === 'quote' && p && !p.shippingName && chosenRate ? chosenRate.rateCents : 0;
  const shipLabel = p?.shippingName ?? (pendingShip ? chosenRate!.name : null);

  return (
    <div>
      <PageHeader title="New order" back={{ to: '/admin/orders', label: 'Orders' }} subtitle="Place an order for a customer — priced and shipped exactly as the store would." />

      <div className="order-new">
        <div>
          {/* ---- Customer ---- */}
          <section className="admin-card">
            <h3>Customer</h3>
            {picked ? (
              <div className="on-picked" data-testid="picked-customer">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{fullName(picked) || picked.email}</strong>
                  <div className="muted" style={{ fontSize: '.85rem' }}>{picked.email}{picked.phone ? ` · ${picked.phone}` : ''} · {picked.orderCount} order{picked.orderCount === 1 ? '' : 's'}</div>
                </div>
                <button type="button" className="btn secondary sm" onClick={clearCustomer}>Change</button>
              </div>
            ) : (
              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="cust-q">Find an existing customer</label>
                <input id="cust-q" type="search" placeholder="Name or email" value={custQ} onChange={(e) => setCustQ(e.target.value)} autoComplete="off" />
                {custHits.length > 0 && (
                  <ul className="on-hits" data-testid="customer-hits">
                    {custHits.map((u) => (
                      <li key={u.id}>
                        <button type="button" onClick={() => void pickCustomer(u)}>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <strong>{fullName(u) || u.email}</strong>
                            <span className="muted" style={{ fontSize: '.85rem' }}> {u.email}{u.phone ? ` · ${u.phone}` : ''} · {u.orderCount} order{u.orderCount === 1 ? '' : 's'}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="muted" style={{ fontSize: '.85rem', margin: '.5rem 0 0' }}>Or enter a new customer below — their account is created with the order, and the confirmation signs them in.</p>
              </div>
            )}
            <div className="grid-3">
              <div>
                <label htmlFor="cust-email">Email</label>
                <input id="cust-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" autoComplete="off" />
              </div>
              <div>
                <label htmlFor="cust-first">First name</label>
                <input id="cust-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="cust-last">Last name</label>
                <input id="cust-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
          </section>

          {/* ---- Ship to ---- */}
          <section className="admin-card">
            <h3>Ship to</h3>
            {saved.length > 0 && (
              <div className="on-saved">
                <span className="muted" style={{ fontSize: '.85rem', alignSelf: 'center' }}>Saved:</span>
                {saved.map((a) => (
                  <button key={a.id} type="button" className="btn secondary sm" onClick={() => applyAddress(a, { firstName, lastName, phone: picked?.phone })}>
                    {a.label || `${a.line1}, ${a.city}`}{a.isDefault ? ' · default' : ''}
                  </button>
                ))}
              </div>
            )}
            <AddressFields value={ship} onChange={setShip} errors={shipErrors} touched={shipTouched} onBlur={touch(setShipTouched)} idPrefix="ship" section="shipping" />
            <label className="on-check">
              <input type="checkbox" checked={billSame} onChange={(e) => setBillSame(e.target.checked)} />
              <span>Billing address is the same</span>
            </label>
            {!billSame && (
              <div style={{ marginTop: '1rem' }}>
                <h4 style={{ margin: '0 0 .5rem' }}>Bill to</h4>
                <AddressFields value={bill} onChange={setBill} errors={billErrors} touched={billTouched} onBlur={touch(setBillTouched)} idPrefix="bill" section="billing" showPhone={false} />
              </div>
            )}
          </section>

          {/* ---- Items ---- */}
          <section className="admin-card">
            <h3>Items</h3>
            <label htmlFor="prod-q">Add a product</label>
            <input id="prod-q" type="search" placeholder="Search by name or SKU" value={prodQ} onChange={(e) => setProdQ(e.target.value)} autoComplete="off" disabled={adding} />
            {prodHits.length > 0 && (
              <ul className="on-hits" data-testid="product-hits">
                {prodHits.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => void addProduct(h)}>
                      <span className="on-thumb" style={h.images[0] ? { backgroundImage: `url(${h.images[0].url})` } : undefined} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <strong>{h.name}</strong>
                        <span className="muted" style={{ fontSize: '.85rem' }}> {h.sku ? `${h.sku} · ` : ''}{h.madeToOrder === false ? 'from stock' : 'printed to order'}{!h.active ? ' · hidden from the store' : ''}</span>
                      </span>
                      <span className="muted" style={{ fontSize: '.85rem' }}>{formatMoney(h.priceCents)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {lines.length === 0 ? (
              <p className="muted" style={{ margin: '1rem 0 0' }}>No items yet — search above and pick a product.</p>
            ) : (
              <div style={{ marginTop: '1rem' }}>
                {lines.map((l, i) => {
                  const pl = p?.lines[i] ?? null;
                  const opts = visibleOptions(l.product, l.selections);
                  const uploads = l.product.options.filter((o) => o.type === 'UPLOAD');
                  return (
                    <div key={l.key} className="on-line" data-testid="order-line">
                      <div className="on-line-head">
                        <span className="on-thumb" style={l.product.images[0] ? { backgroundImage: `url(${l.product.images[0].url})` } : undefined} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong>{l.product.name}</strong>
                          <div className="muted" style={{ fontSize: '.8rem' }}>
                            {l.product.madeToOrder === false ? 'Ships from stock' : 'Printed to order'}
                            {pl?.stockNote ? <span style={{ color: '#b45309' }}> · {pl.stockNote}</span> : null}
                            {pl?.belowMinimum ? <span style={{ color: '#b45309' }}> · store minimum is {pl.belowMinimum}</span> : null}
                            {pl?.hidden ? ' · hidden from the store' : ''}
                          </div>
                        </div>
                        <button type="button" className="btn secondary sm" onClick={() => removeLine(l.key)} aria-label={`Remove ${l.product.name}`}>Remove</button>
                      </div>
                      {l.product.variants.length > 0 && (
                        <div>
                          <label htmlFor={`${l.key}-variant`}>Variant</label>
                          <select id={`${l.key}-variant`} value={l.variantId ?? ''} onChange={(e) => patchLine(l.key, { variantId: e.target.value || null })}>
                            {l.product.variants.filter((v) => v.active || v.id === l.variantId).map((v) => (
                              <option key={v.id} value={v.id}>{v.label} — {formatMoney(v.priceCents)}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {opts.length > 0 && (
                        <div className="on-options">
                          {opts.map((opt) => (
                            <OptionControl
                              key={opt.id}
                              opt={opt}
                              value={l.selections[keyOf(opt)]}
                              onChange={(v) => patchLine(l.key, (cur) => ({ selections: { ...cur.selections, [keyOf(opt)]: v } }))}
                              productId={l.product.id}
                            />
                          ))}
                        </div>
                      )}
                      {uploads.length > 0 && (
                        <p className="muted" style={{ fontSize: '.8rem', margin: 0 }}>
                          {uploads.map((o) => o.name).join(' and ')}: not attached here. The customer uploads from their order page, or you attach the files on the order once it exists.
                        </p>
                      )}
                      <div className="on-line-nums">
                        <div>
                          <label htmlFor={`${l.key}-qty`}>Quantity</label>
                          <input id={`${l.key}-qty`} type="number" min={1} inputMode="numeric" value={l.quantity}
                            onChange={(e) => patchLine(l.key, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
                        </div>
                        <div>
                          <label htmlFor={`${l.key}-price`}>Unit price</label>
                          {l.customPrice ? (
                            <div className="row" style={{ gap: '.4rem' }}>
                              <span>$</span>
                              <input id={`${l.key}-price`} type="number" step="0.01" min="0" inputMode="decimal" value={l.priceText} style={{ maxWidth: 130 }}
                                onChange={(e) => patchLine(l.key, { priceText: e.target.value })} />
                              <button type="button" className="btn secondary sm" onClick={() => patchLine(l.key, { customPrice: false, priceText: '' })}>Use list price</button>
                            </div>
                          ) : (
                            <div className="row" style={{ gap: '.6rem' }}>
                              <strong id={`${l.key}-price`} data-testid="unit-price">{pl ? formatMoney(pl.enginePriceCents) : '…'}</strong>
                              <button type="button" className="btn secondary sm" onClick={() => patchLine(l.key, { customPrice: true, priceText: pl ? centsToDollars(pl.enginePriceCents) : '' })}>Set price</button>
                            </div>
                          )}
                          {pl?.overridden && <div className="muted" style={{ fontSize: '.78rem', marginTop: '.25rem' }}>List price {formatMoney(pl.enginePriceCents)} — noted on the order.</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <label>Line total</label>
                          <strong data-testid="line-total">{pl ? formatMoney(pl.totalCents) : '…'}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ---- Shipping ---- */}
          <section className="admin-card">
            <h3>Shipping</h3>
            <div className="on-radios">
              <label><input type="radio" name="ship-mode" checked={shipMode === 'quote'} onChange={() => setShipMode('quote')} /><span>Carrier rate for this address — the boxes it packs into, at the price we pay for the labels</span></label>
              <label><input type="radio" name="ship-mode" checked={shipMode === 'manual'} onChange={() => setShipMode('manual')} /><span>Enter the shipping charge by hand (local pickup, a quoted freight, free)</span></label>
            </div>
            {shipMode === 'quote' && (
              lines.length === 0 ? <p className="muted" style={{ margin: 0 }}>Add an item first.</p>
              : !canRate ? <p className="muted" style={{ margin: 0 }}>Enter the postal code and country above to see rates.</p>
              : p && p.shippingOptions.length > 0 ? (
                <div className="on-rates" role="radiogroup" aria-label="Shipping rates" data-testid="ship-rates">
                  {p.shippingOptions.map((o) => {
                    const arrival = arrivalFromDays(o.estimatedDays);
                    return (
                      <label key={o.id} className={`on-rate${shipOptionId === o.id ? ' selected' : ''}`}>
                        <input type="radio" name="ship-opt" checked={shipOptionId === o.id} onChange={() => setShipOptionId(o.id)} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <strong>{o.name}</strong>
                          {arrival && <span className="muted" style={{ fontSize: '.85rem' }}> · arrives by {arrival}</span>}
                        </span>
                        <strong>{formatMoney(o.rateCents)}</strong>
                      </label>
                    );
                  })}
                  {chosenRate && chosenRate.boxes > 1 && <p className="muted" style={{ fontSize: '.85rem', margin: 0 }}>Packs into {chosenRate.boxes} boxes; the rate covers all of them.</p>}
                  {p.shippingError && <div className="error" style={{ margin: 0 }}>{p.shippingError}</div>}
                </div>
              )
              : previewing ? <p className="muted" style={{ margin: 0 }}>Quoting…</p>
              : <p className="muted" style={{ margin: 0 }}>{p?.shippingError ?? 'No rates for this address yet.'}</p>
            )}
            {shipMode === 'manual' && (
              <div className="grid-2">
                <div>
                  <label htmlFor="ship-name">Method name</label>
                  <input id="ship-name" value={shipManualName} onChange={(e) => setShipManualName(e.target.value)} placeholder="e.g. UPS Ground, Local pickup, Freight" />
                </div>
                <div>
                  <label htmlFor="ship-amount">Charge ($)</label>
                  <input id="ship-amount" type="number" step="0.01" min="0" inputMode="decimal" value={shipManualAmount} onChange={(e) => setShipManualAmount(e.target.value)} placeholder="0.00" />
                </div>
              </div>
            )}
          </section>

          {/* ---- Discount & tax ---- */}
          <section className="admin-card">
            <h3>Discount &amp; tax</h3>
            <div className="grid-2">
              <div>
                <label htmlFor="disc-mode">Discount</label>
                <select id="disc-mode" value={discMode} onChange={(e) => setDiscMode(e.target.value as typeof discMode)}>
                  <option value="none">None</option>
                  <option value="code">Discount code</option>
                  <option value="amount">Amount off</option>
                </select>
                {discMode === 'code' && (
                  <input aria-label="Discount code" value={discCode} onChange={(e) => setDiscCode(e.target.value.toUpperCase())} placeholder="CODE" style={{ marginTop: '.5rem' }} />
                )}
                {discMode === 'amount' && (
                  <div className="row" style={{ marginTop: '.5rem', gap: '.5rem' }}>
                    <input aria-label="Amount off, dollars" type="number" step="0.01" min="0" inputMode="decimal" value={discAmount} onChange={(e) => setDiscAmount(e.target.value)} placeholder="0.00" style={{ maxWidth: 130 }} />
                    <input aria-label="Reason" value={discLabel} onChange={(e) => setDiscLabel(e.target.value)} placeholder="Reason (shown on the order)" />
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="tax-mode">Sales tax</label>
                <select id="tax-mode" value={taxMode} onChange={(e) => setTaxMode(e.target.value as typeof taxMode)}>
                  <option value="auto">From the tax table{p ? ` — ${formatMoney(p.taxAutoCents)}` : ''}</option>
                  <option value="manual">Enter an amount</option>
                </select>
                {taxMode === 'manual' && (
                  <input aria-label="Tax, dollars" type="number" step="0.01" min="0" inputMode="decimal" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} placeholder="0.00" style={{ marginTop: '.5rem' }} />
                )}
              </div>
            </div>
          </section>

          {/* ---- Payment ---- */}
          <section className="admin-card">
            <h3>Payment</h3>
            <div className="on-radios" data-testid="pay-modes">
              <label>
                <input type="radio" name="pay-mode" checked={payMode === 'link'} onChange={() => setPayMode('link')} />
                <span><strong>Send a pay link</strong><br /><span className="muted">The customer pays with PayPal or any card from an emailed link, no account needed. The order waits until they do.</span></span>
              </label>
              <label>
                <input type="radio" name="pay-mode" checked={payMode === 'paid'} onChange={() => setPayMode('paid')} />
                <span><strong>Already paid</strong><br /><span className="muted">You took the money another way — record how, and the order is paid right away.</span></span>
              </label>
              <label>
                <input type="radio" name="pay-mode" checked={payMode === 'comp'} onChange={() => setPayMode('comp')} />
                <span><strong>No charge</strong><br /><span className="muted">A replacement or a comp: nothing is collected and the order is paid right away.</span></span>
              </label>
            </div>
            {payMode === 'paid' && (
              <div className="grid-2">
                <div>
                  <label htmlFor="pay-provider">Paid by</label>
                  <select id="pay-provider" value={payProvider} onChange={(e) => setPayProvider(e.target.value)}>
                    {PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="pay-ref">Reference (optional)</label>
                  <input id="pay-ref" value={payReference} onChange={(e) => setPayReference(e.target.value)} placeholder="Check number, PayPal invoice id, last 4…" />
                </div>
              </div>
            )}
            <label className="on-check">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              <span>{payMode === 'link' ? 'Email the pay link to the customer now' : 'Email the order confirmation to the customer'}</span>
            </label>
          </section>

          {/* ---- Notes ---- */}
          <section className="admin-card">
            <h3>Notes</h3>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Shown on the order — the customer sees these too." aria-label="Order notes" />
          </section>
        </div>

        {/* ---- Summary ---- */}
        <aside className="order-new-aside">
          <div className="admin-card" style={{ margin: 0 }} data-testid="order-summary">
            <h3>Summary</h3>
            {lines.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Add an item to see the total.</p>
            ) : (
              <>
                <ul className="on-sum-lines">
                  {(p?.lines ?? []).map((pl, i) => (
                    <li key={i}><span>{pl.name} × {pl.quantity}</span><span>{formatMoney(pl.totalCents)}</span></li>
                  ))}
                </ul>
                <div className="spread"><span>Subtotal</span><span>{p ? formatMoney(p.subtotalCents) : '…'}</span></div>
                {p && p.discountCents > 0 && <div className="spread"><span>Discount{p.discountLabel ? ` (${p.discountLabel})` : ''}</span><span>−{formatMoney(p.discountCents)}</span></div>}
                <div className="spread">
                  <span>Shipping{shipLabel ? <span className="muted"> · {shipLabel}</span> : null}</span>
                  <span>{p ? (shipLabel ? formatMoney(p.shippingCents + pendingShip) : '—') : '…'}</span>
                </div>
                {p && p.shippingDiscountCents > 0 && <div className="muted" style={{ fontSize: '.8rem', textAlign: 'right' }}>code took {formatMoney(p.shippingDiscountCents)} off shipping</div>}
                <div className="spread"><span>Tax</span><span>{p ? formatMoney(p.taxCents) : '…'}</span></div>
                <div className="spread on-total"><span>Total</span><span data-testid="order-total">{p ? formatMoney(p.totalCents + pendingShip) : '…'}</span></div>
              </>
            )}
            {p && p.warnings.length > 0 && (
              <div className="on-warn" data-testid="order-warnings">
                {p.warnings.map((w) => <div key={w}>⚠ {w}</div>)}
                {p.stockShort && (
                  <label className="on-check" style={{ marginTop: '.5rem' }}>
                    <input type="checkbox" checked={ignoreStock} onChange={(e) => setIgnoreStock(e.target.checked)} />
                    <span>Sell anyway — stock shows short</span>
                  </label>
                )}
              </div>
            )}
            {previewError && <div className="error" role="alert">{previewError}</div>}
            {createError && <div className="error" role="alert" data-testid="create-error">{createError}</div>}
            <button type="button" className="btn" style={{ width: '100%', marginTop: '1rem' }} disabled={creating || lines.length === 0} onClick={() => void create()} data-testid="create-order">
              {creating ? 'Creating…' : payMode === 'link' ? (sendEmail ? 'Create order & email pay link' : 'Create order (pay link)') : payMode === 'paid' ? 'Create paid order' : 'Create order — no charge'}
            </button>
            <p className="muted" style={{ fontSize: '.8rem', marginTop: '.6rem', marginBottom: 0 }}>
              {payMode === 'link'
                ? 'The order is created unpaid and nothing ships or prints until the customer pays. You can copy or resend the link from the order.'
                : payMode === 'paid'
                  ? 'Recorded as paid with the method above; stock is taken and the confirmation goes out like any paid order.'
                  : 'Recorded as paid with nothing collected; stock is taken and the confirmation goes out.'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
