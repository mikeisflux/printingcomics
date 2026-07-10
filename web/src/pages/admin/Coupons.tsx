import { useEffect, useState } from 'react';
import { api, ApiError, formatMoney } from '../../api/client';

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  percentOffBps: number | null;
  amountOffCents: number | null;
  minSubtotalCents: number;
  usageLimit: number | null;
  usageCount: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

interface FormState {
  id: string | null; // null = creating a new code
  code: string;
  description: string;
  type: 'percent' | 'amount';
  value: string; // percent (e.g. "10") or dollars (e.g. "5.00")
  minSubtotal: string; // dollars
  usageLimit: string; // integer or ''
  expiresAt: string; // 'YYYY-MM-DD' or ''
  active: boolean;
}

const emptyForm: FormState = {
  id: null,
  code: '',
  description: '',
  type: 'percent',
  value: '',
  minSubtotal: '',
  usageLimit: '',
  expiresAt: '',
  active: true,
};

function toBody(f: FormState) {
  const value = parseFloat(f.value) || 0;
  return {
    code: f.code.trim(),
    description: f.description.trim() || null,
    percentOffBps: f.type === 'percent' ? Math.round(value * 100) : null,
    amountOffCents: f.type === 'amount' ? Math.round(value * 100) : null,
    minSubtotalCents: Math.round((parseFloat(f.minSubtotal) || 0) * 100),
    usageLimit: f.usageLimit.trim() ? Math.max(1, Math.floor(Number(f.usageLimit))) : null,
    expiresAt: f.expiresAt.trim() ? f.expiresAt : null,
    active: f.active,
  };
}

function couponToForm(c: Coupon): FormState {
  const isAmount = !c.percentOffBps && c.amountOffCents != null;
  return {
    id: c.id,
    code: c.code,
    description: c.description ?? '',
    type: isAmount ? 'amount' : 'percent',
    value: isAmount
      ? ((c.amountOffCents ?? 0) / 100).toFixed(2)
      : String((c.percentOffBps ?? 0) / 100),
    minSubtotal: c.minSubtotalCents ? (c.minSubtotalCents / 100).toFixed(2) : '',
    usageLimit: c.usageLimit != null ? String(c.usageLimit) : '',
    expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : '',
    active: c.active,
  };
}

function valueLabel(c: Coupon): string {
  if (c.percentOffBps) return `${(c.percentOffBps / 100).toFixed(c.percentOffBps % 100 ? 1 : 0)}% off`;
  if (c.amountOffCents) return `${formatMoney(c.amountOffCents)} off`;
  return '—';
}

function expiryLabel(c: Coupon): string {
  if (!c.expiresAt) return 'Never';
  const d = new Date(c.expiresAt);
  const expired = d.getTime() <= Date.now();
  return `${d.toLocaleDateString()}${expired ? ' (expired)' : ''}`;
}

export function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api.get<{ coupons: Coupon[] }>('/admin/coupons').then((r) => setCoupons(r.coupons));

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, []);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const resetForm = () => { setForm(emptyForm); setError(null); };

  async function save() {
    setError(null);
    if (!form.code.trim()) { setError('Enter a code.'); return; }
    if (!(parseFloat(form.value) > 0)) {
      setError(form.type === 'percent' ? 'Enter a percent greater than 0.' : 'Enter an amount greater than 0.');
      return;
    }
    setSaving(true);
    try {
      const body = toBody(form);
      if (form.id) await api.put(`/admin/coupons/${form.id}`, body);
      else await api.post('/admin/coupons', body);
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: Coupon) {
    await api.put(`/admin/coupons/${c.id}`, { active: !c.active });
    await load();
  }

  async function remove(c: Coupon) {
    if (!confirm(`Delete code ${c.code}? This can't be undone.`)) return;
    await api.del(`/admin/coupons/${c.id}`);
    if (form.id === c.id) resetForm();
    await load();
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading…</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <h1 style={{ marginBottom: '.25rem' }}>Discount Codes</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', maxWidth: 640 }}>
        Create codes customers can enter at checkout. A code's discount applies to the
        order subtotal and <strong>stacks on top of the site-wide discount</strong> — the
        site-wide discount is already reflected in each item's price, and the code comes
        off after that.
      </p>

      <div className="admin-card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginTop: 0 }}>{form.id ? `Edit ${form.code}` : 'New code'}</h3>

        <div className="grid-2">
          <div>
            <label>Code</label>
            <input
              value={form.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
              placeholder="SUMMER10"
              style={{ textTransform: 'uppercase' }}
            />
          </div>
          <div>
            <label>Description (optional)</label>
            <input
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="Summer sale"
            />
          </div>
        </div>

        <div className="grid-2">
          <div>
            <label>Discount type</label>
            <select value={form.type} onChange={(e) => set({ type: e.target.value as 'percent' | 'amount' })}>
              <option value="percent">Percent off (%)</option>
              <option value="amount">Fixed amount off ($)</option>
            </select>
          </div>
          <div>
            <label>{form.type === 'percent' ? 'Percent off' : 'Amount off (USD)'}</label>
            <input
              type="number"
              min={0}
              step={form.type === 'percent' ? 1 : 0.01}
              value={form.value}
              onChange={(e) => set({ value: e.target.value })}
              placeholder={form.type === 'percent' ? '10' : '5.00'}
            />
          </div>
        </div>

        <div className="grid-2">
          <div>
            <label>Minimum subtotal (USD, optional)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.minSubtotal}
              onChange={(e) => set({ minSubtotal: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div>
            <label>Usage limit (optional)</label>
            <input
              type="number"
              min={1}
              step={1}
              value={form.usageLimit}
              onChange={(e) => set({ usageLimit: e.target.value })}
              placeholder="Unlimited"
            />
          </div>
        </div>

        <div className="grid-2">
          <div>
            <label>Expires (optional)</label>
            <input type="date" value={form.expiresAt} onChange={(e) => set({ expiresAt: e.target.value })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', margin: 0 }}>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => set({ active: e.target.checked })}
                style={{ width: 'auto' }}
              />
              Active
            </label>
          </div>
        </div>

        {error && <div className="error" style={{ marginTop: '.75rem' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem' }}>
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create code'}
          </button>
          {form.id && (
            <button className="btn secondary" onClick={resetForm} disabled={saving}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="admin-card">
        <h3 style={{ marginTop: 0 }}>All codes ({coupons.length})</h3>
        {coupons.length === 0 ? (
          <p className="muted">No discount codes yet. Create one above.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Value</th>
                <th>Min</th>
                <th>Used</th>
                <th>Expires</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} style={{ opacity: c.active ? 1 : 0.55 }}>
                  <td>
                    <strong>{c.code}</strong>
                    {c.description && (
                      <div className="muted" style={{ fontSize: '.8rem' }}>{c.description}</div>
                    )}
                  </td>
                  <td>{valueLabel(c)}</td>
                  <td>{c.minSubtotalCents ? formatMoney(c.minSubtotalCents) : '—'}</td>
                  <td>{c.usageCount}{c.usageLimit != null ? ` / ${c.usageLimit}` : ''}</td>
                  <td>{expiryLabel(c)}</td>
                  <td>{c.active ? 'Active' : 'Off'}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn secondary" style={{ marginRight: '.4rem' }} onClick={() => { setForm(couponToForm(c)); setError(null); }}>
                      Edit
                    </button>
                    <button className="btn secondary" style={{ marginRight: '.4rem' }} onClick={() => toggleActive(c)}>
                      {c.active ? 'Disable' : 'Enable'}
                    </button>
                    <button className="btn secondary" onClick={() => remove(c)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
