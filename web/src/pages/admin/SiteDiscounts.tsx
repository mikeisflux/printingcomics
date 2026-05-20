import { useEffect, useState } from 'react';

export function AdminSiteDiscounts() {
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [input, setInput] = useState<string>('0');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/site-discounts', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        setDiscountPct(d.discountPct ?? 0);
        setInput(String(d.discountPct ?? 0));
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    const pct = Math.max(0, Math.min(99.99, parseFloat(input) || 0));
    setStatus('saving');
    try {
      const r = await fetch('/api/admin/site-discounts', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discountPct: pct }),
      });
      if (!r.ok) throw new Error('Save failed');
      const d = await r.json();
      setDiscountPct(d.discountPct);
      setInput(String(d.discountPct));
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('error');
    }
  }

  const pct = parseFloat(input) || 0;
  const isActive = discountPct > 0;

  if (loading) return <div style={{ padding: '2rem' }}>Loading…</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: 560 }}>
      <h1 style={{ marginBottom: '.25rem' }}>Site-wide Discount</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>
        Override all product prices by a percentage. Set to 0 to disable. The discount
        stacks on top of each product's quantity-tier discounts — it is not stored in
        product pricing configs and can be removed instantly.
      </p>

      {isActive && (
        <div
          style={{
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: 8,
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            fontWeight: 600,
          }}
        >
          Active: {discountPct}% off all products sitewide
        </div>
      )}

      <label style={{ display: 'block', fontWeight: 600, marginBottom: '.5rem' }}>
        Discount %
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <input
          type="range"
          min={0}
          max={50}
          step={0.5}
          value={Math.min(50, pct)}
          onChange={(e) => setInput(e.target.value)}
          style={{ flex: 1 }}
        />
        <input
          type="number"
          min={0}
          max={99.99}
          step={0.5}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{
            width: 90,
            padding: '.45rem .75rem',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: '1rem',
            textAlign: 'right',
          }}
        />
        <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>%</span>
      </div>

      {pct > 0 && (
        <div style={{ color: 'var(--muted)', fontSize: '.9rem', marginBottom: '1.5rem' }}>
          A $10.00 product becomes{' '}
          <strong>${(10 * (1 - pct / 100)).toFixed(2)}</strong> after this discount.
        </div>
      )}

      <div style={{ display: 'flex', gap: '.75rem' }}>
        <button className="btn" onClick={save} disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {isActive && (
          <button
            className="btn secondary"
            onClick={() => { setInput('0'); }}
            disabled={status === 'saving'}
          >
            Clear Discount
          </button>
        )}
      </div>

      {status === 'saved' && (
        <div style={{ marginTop: '1rem', color: 'green', fontWeight: 600 }}>
          Saved — discount is {discountPct > 0 ? `${discountPct}% active` : 'off'}.
        </div>
      )}
      {status === 'error' && (
        <div style={{ marginTop: '1rem', color: 'red' }}>Save failed. Try again.</div>
      )}
    </div>
  );
}
