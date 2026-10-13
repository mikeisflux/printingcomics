import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatMoney } from '../api/client';
import { useCart } from '../store/cart';
import { COUNTRIES, arrivalFromDays, postalCodeLooksValid, postalFieldFor } from '../lib/address';
import { rememberedDestination, type ShipRate } from './ShippingEstimator';

interface BulkResult {
  units: number;
  unitsSupplied: number;
  packs: { productId: string; slug: string; name: string; packUnits: number; quantity: number; unitPriceCents: number; lineCents: number }[];
  goodsCents: number;
  packing: { box: string; count: number; lengthIn: number; widthIn: number; heightIn: number }[];
  boxes: number;
  shipmentWeightOz: number;
  shippingOptions: ShipRate[];
  liveError?: string | null;
}

/** "mailers" for the T-fold packs, "sleeves" for Comic Armor, else "units". */
export function unitNoun(productName: string): string {
  if (/mailer/i.test(productName)) return 'mailers';
  if (/armor|sleeve/i.test(productName)) return 'sleeves';
  return 'units';
}

/** "Comic Book Mailers — Adjustable T-Fold Mailer, 135 Pack" → "135 Pack" */
function packLabel(name: string): string {
  const m = name.match(/(\d+)\s*pack/i);
  return m ? `${m[1]} Pack` : name;
}

/**
 * A bulk quote for shelf goods sold by the pack: how many mailers or
 * sleeves, where to, and back comes the cheapest set of packs that covers
 * it, the boxes it ships in, and live carrier options with every box's label
 * added up. One click puts the packs in the cart.
 */
export function BulkQuote({ product }: { product: { id: string; name: string } }) {
  const navigate = useNavigate();
  const { add } = useCart();
  const noun = unitNoun(product.name);
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState('');
  const [dest, setDest] = useState(rememberedDestination);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const postal = postalFieldFor(dest.country);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(units.replace(/[^0-9]/g, ''), 10);
    if (!Number.isFinite(n) || n < 1) { setError(`Enter how many ${noun} you need.`); return; }
    if (!postalCodeLooksValid(dest.country, dest.postalCode)) { setError(dest.country === 'US' ? 'Enter a 5-digit ZIP code.' : `Enter a ${postal.label.toLowerCase()}.`); return; }
    setBusy(true); setError(null);
    try {
      const r = await api.post<BulkResult>('/checkout/bulk-quote', { productId: product.id, units: n, country: dest.country, postalCode: dest.postalCode.trim() });
      setResult(r);
      try { localStorage.setItem('pc.ship-to', JSON.stringify({ country: dest.country, postalCode: dest.postalCode.trim() })); } catch { /* ignore */ }
      if (r.shippingOptions.length === 0) setError(r.liveError ?? 'No shipping options for that postal code yet.');
    } catch (e: any) {
      setResult(null);
      setError(e?.message ?? 'Could not build the quote.');
    } finally { setBusy(false); }
  };

  const addAll = async () => {
    if (!result) return;
    setAdding(true); setError(null);
    try {
      for (const p of result.packs) await add({ productId: p.productId, quantity: p.quantity });
      navigate('/cart');
    } catch (e: any) {
      setError(e?.message ?? 'Could not add the packs to the cart.');
    } finally { setAdding(false); }
  };

  const weight = result ? (result.shipmentWeightOz >= 16 ? `${(result.shipmentWeightOz / 16).toFixed(1)} lb` : `${result.shipmentWeightOz.toFixed(1)} oz`) : '';
  const fmt = (n: number) => n.toLocaleString('en-US');

  return (
    <section className="bulk-quote" id="bulk-quote" aria-labelledby="bulk-quote-title">
      <h2 id="bulk-quote-title" style={{ marginBottom: '.25rem' }}>Buying {noun} in bulk?</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Need 500, 1,000 or 5,000 {noun}? Tell us how many and where they are going. We pick the cheapest packs that cover it,
        pack them into as few cartons as it takes, and add up the carrier's price for every carton — the same live rates checkout charges.
      </p>
      {!open ? (
        <button type="button" className="btn" onClick={() => setOpen(true)} data-testid="bulk-quote-open">Click here for a bulk quote</button>
      ) : (
        <form className="bulk-quote-form" onSubmit={submit} data-testid="bulk-quote-form">
          <div className="field">
            <label htmlFor="bulk-units">How many {noun}?</label>
            <input id="bulk-units" inputMode="numeric" pattern="[0-9]*" placeholder="e.g. 1000" value={units} onChange={(e) => { setUnits(e.target.value); setError(null); }} />
          </div>
          <div className="field">
            <label htmlFor="bulk-country">Ship to</label>
            <select id="bulk-country" value={dest.country} onChange={(e) => { setDest({ ...dest, country: e.target.value }); setResult(null); }}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="bulk-postal">{postal.label}</label>
            <input id="bulk-postal" inputMode={postal.numeric ? 'numeric' : 'text'} autoComplete="postal-code" placeholder={postal.placeholder || postal.label} maxLength={12} value={dest.postalCode} onChange={(e) => { setDest({ ...dest, postalCode: e.target.value }); setError(null); }} />
          </div>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Working it out…' : 'Get bulk quote'}</button>
        </form>
      )}
      {error && <div className="field-error" role="alert" style={{ marginTop: '.5rem' }}>{error}</div>}

      {result && (
        <div className="bulk-quote-result" data-testid="bulk-quote-result">
          <h3 style={{ margin: '1rem 0 .25rem' }}>Your order: {fmt(result.unitsSupplied)} {noun}</h3>
          {result.unitsSupplied !== result.units && (
            <p className="muted" style={{ marginTop: 0, fontSize: '.9rem' }}>
              Packs come in fixed sizes, so the cheapest way to get {fmt(result.units)} is {fmt(result.unitsSupplied)} — {fmt(result.unitsSupplied - result.units)} extra for nothing more than you would pay for {fmt(result.units)}.
            </p>
          )}
          <table className="admin-table bulk-table">
            <thead><tr><th>Pack</th><th>Qty</th><th>Each</th><th>Line</th></tr></thead>
            <tbody>
              {result.packs.map((p) => (
                <tr key={p.productId}>
                  <td>{packLabel(p.name)} <span className="muted">· {fmt(p.packUnits)} {noun}</span></td>
                  <td>{p.quantity}</td>
                  <td>{formatMoney(p.unitPriceCents)}</td>
                  <td>{formatMoney(p.lineCents)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}><td colSpan={3} style={{ textAlign: 'right' }}>Goods</td><td>{formatMoney(result.goodsCents)}</td></tr>
            </tbody>
          </table>

          <p style={{ margin: '.75rem 0 .25rem' }} data-testid="bulk-packing">
            <strong>Ships in {result.boxes} box{result.boxes === 1 ? '' : 'es'}</strong> · {weight} ·{' '}
            {result.packing.map((b) => `${b.count} × ${b.box} (${b.lengthIn}×${b.widthIn}×${b.heightIn}″)`).join(' + ')}
          </p>

          {result.shippingOptions.length > 0 && (
            <table className="admin-table bulk-table">
              <thead><tr><th>Shipping</th><th>Est. arrival</th><th>All boxes</th><th>Order total</th></tr></thead>
              <tbody>
                {result.shippingOptions.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="muted">{arrivalFromDays(r.estimatedDays) ?? r.estimatedDays ?? '—'}</td>
                    <td>{formatMoney(r.rateCents)}</td>
                    <td><strong>{formatMoney(result.goodsCents + r.rateCents)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {result.liveError && result.shippingOptions.length > 0 && <p className="muted" style={{ fontSize: '.85rem' }}>{result.liveError}</p>}
          <div className="row" style={{ gap: '.75rem', flexWrap: 'wrap', marginTop: '.75rem' }}>
            <button type="button" className="btn" disabled={adding} onClick={() => void addAll()} data-testid="bulk-add">{adding ? 'Adding…' : 'Add these packs to cart'}</button>
            <span className="muted" style={{ fontSize: '.85rem' }}>Shipping is confirmed at checkout with your full address. Sales tax, where it applies, is added there.</span>
          </div>
        </div>
      )}
    </section>
  );
}
