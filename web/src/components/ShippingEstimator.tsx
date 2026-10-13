import { useEffect, useState } from 'react';
import { api, formatMoney } from '../api/client';
import { COUNTRIES, arrivalFromDays, postalCodeLooksValid, postalFieldFor } from '../lib/address';

export interface ShipRate { id: string; name: string; rateCents: number; estimatedDays?: string | null }
export interface EstimateResult { shippingOptions: ShipRate[]; shipmentWeightOz?: number; boxes?: number; liveError?: string | null; region?: string | null }

const REMEMBER_KEY = 'pc.ship-to';

/** The destination the shopper last estimated to, so the cart, product and checkout pages agree. */
export function rememberedDestination(): { country: string; postalCode: string } {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (raw) { const v = JSON.parse(raw); if (v && typeof v.postalCode === 'string' && typeof v.country === 'string') return v; }
  } catch { /* private mode, blocked storage */ }
  return { country: 'US', postalCode: '' };
}
function remember(v: { country: string; postalCode: string }) {
  try { localStorage.setItem(REMEMBER_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

/** "Ships in 2 boxes · 59.7 lb" */
export function shipmentLine(r: { boxes?: number; shipmentWeightOz?: number } | null): string | null {
  if (!r || !r.boxes) return null;
  const w = r.shipmentWeightOz ?? 0;
  const weight = w >= 16 ? `${(w / 16).toFixed(1)} lb` : `${w.toFixed(1)} oz`;
  return `Ships in ${r.boxes} box${r.boxes === 1 ? '' : 'es'} · ${weight}`;
}

/** One carrier option, as a row: name, arrival estimate, price. */
export function RateRow({ rate, selected, onSelect, name }: { rate: ShipRate; selected?: boolean; onSelect?: () => void; name?: string }) {
  const arrival = arrivalFromDays(rate.estimatedDays);
  const inner = (
    <>
      {onSelect && <input type="radio" name={name ?? 'shiprate'} checked={!!selected} onChange={onSelect} style={{ width: 'auto', margin: 0 }} />}
      <span className="rate-name">
        {rate.name}
        <span className="rate-eta">{arrival ? `Est. arrival ${arrival}` : rate.estimatedDays ? rate.estimatedDays : 'Transit time varies'}</span>
      </span>
      <span className="rate-price">{formatMoney(rate.rateCents)}</span>
    </>
  );
  return onSelect
    ? <label className={`rate-row${selected ? ' selected' : ''}`}>{inner}</label>
    : <div className="rate-row">{inner}</div>;
}

/**
 * Shipping to a postal code, before the address is typed: the cart page and
 * a product page ask for a country and ZIP and show the live options for
 * the boxes the order will ship in. `items` rates those lines instead of
 * the cart.
 */
export function ShippingEstimator({ items, compact = false, title = 'Estimate shipping' }: {
  items?: { productId: string; quantity: number; options?: Record<string, string> }[];
  compact?: boolean;
  title?: string;
}) {
  const [dest, setDest] = useState(rememberedDestination);
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const postal = postalFieldFor(dest.country);
  const valid = postalCodeLooksValid(dest.country, dest.postalCode);
  const itemsKey = JSON.stringify(items ?? null);

  const estimate = async () => {
    if (!valid) { setError(dest.country === 'US' ? 'Enter a 5-digit ZIP code.' : `Enter a ${postal.label.toLowerCase()}.`); return; }
    setBusy(true); setError(null);
    try {
      const r = await api.post<EstimateResult>('/checkout/estimate', { country: dest.country, postalCode: dest.postalCode.trim(), items });
      setResult(r);
      remember({ country: dest.country, postalCode: dest.postalCode.trim() });
      if (r.shippingOptions.length === 0) setError(r.liveError ?? 'No shipping options for that postal code yet.');
    } catch (e: any) {
      setResult(null);
      setError(e?.message ?? 'Could not estimate shipping.');
    } finally { setBusy(false); }
  };

  // A remembered ZIP (or a changed cart / quantity) refreshes the estimate without a click.
  useEffect(() => {
    if (!valid) { setResult(null); return; }
    const t = setTimeout(() => { void estimate(); }, 300);
    return () => clearTimeout(t);
  }, [itemsKey, dest.country]); // eslint-disable-line react-hooks/exhaustive-deps

  const line = shipmentLine(result);
  return (
    <div className={`ship-estimator${compact ? ' compact' : ''}`} data-testid="ship-estimator">
      <div className="ship-estimator-head">
        <strong>{title}</strong>
        {line && <span className="muted">{line}</span>}
      </div>
      <form className="ship-estimator-form" onSubmit={(e) => { e.preventDefault(); void estimate(); }}>
        <select aria-label="Country" value={dest.country} onChange={(e) => { setDest({ ...dest, country: e.target.value }); setResult(null); }}>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <input
          aria-label={postal.label}
          placeholder={postal.placeholder || postal.label}
          inputMode={postal.numeric ? 'numeric' : 'text'}
          autoComplete="postal-code"
          maxLength={12}
          value={dest.postalCode}
          onChange={(e) => { setDest({ ...dest, postalCode: e.target.value }); setError(null); }}
        />
        <button type="submit" className="btn secondary" disabled={busy || !dest.postalCode.trim()}>{busy ? 'Checking…' : 'Get rates'}</button>
      </form>
      {error && <div className="field-error" role="alert">{error}</div>}
      {busy && !result && <div className="muted" style={{ fontSize: '.85rem' }}>Getting live rates from the carriers…</div>}
      {result && result.shippingOptions.length > 0 && (
        <div className="rate-list" aria-busy={busy}>
          {result.shippingOptions.slice(0, compact ? 3 : 6).map((r) => <RateRow key={r.id} rate={r} />)}
          {compact && result.shippingOptions.length > 3 && <div className="muted" style={{ fontSize: '.8rem' }}>+{result.shippingOptions.length - 3} more at checkout</div>}
        </div>
      )}
    </div>
  );
}
