import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface Zone { id: string; name: string; countries: string[]; rates: Rate[]; }
interface Rate { id: string; name: string; rateCents: number; perKg: boolean; estimatedDays?: string | null; }
interface Tax { id: string; name: string; region: string; country: string; rateBps: number; }
interface Coupon {
  id: string; code: string; description?: string | null;
  percentOffBps?: number | null; amountOffCents?: number | null;
  minSubtotalCents: number; usageLimit?: number | null; usageCount: number;
  expiresAt?: string | null; active: boolean;
}

export function AdminSettings() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [zones, setZones] = useState<Zone[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  const load = async () => {
    const [s, sh, t, c] = await Promise.all([
      api.get<{ settings: Record<string, unknown> }>('/admin/settings'),
      api.get<{ zones: Zone[] }>('/admin/settings/shipping'),
      api.get<{ taxes: Tax[] }>('/admin/settings/taxes'),
      api.get<{ coupons: Coupon[] }>('/admin/settings/coupons'),
    ]);
    setSettings(s.settings);
    setZones(sh.zones);
    setTaxes(t.taxes);
    setCoupons(c.coupons);
  };
  useEffect(() => { void load(); }, []);

  const saveSetting = async (key: string, value: unknown) => {
    await api.put('/admin/settings', { key, value });
    load();
  };

  const addZone = async () => {
    const name = prompt('Zone name (e.g. "US domestic")');
    if (!name) return;
    const countriesStr = prompt('Countries (comma-separated ISO codes, e.g. US,CA)', 'US');
    if (!countriesStr) return;
    await api.post('/admin/settings/shipping/zones', {
      name, countries: countriesStr.split(',').map((s) => s.trim().toUpperCase()),
    });
    load();
  };

  const addRate = async (zoneId: string) => {
    const name = prompt('Rate name (e.g. "Standard Ground")');
    if (!name) return;
    const rateCents = Number(prompt('Rate in cents', '1000') ?? '0');
    const estimatedDays = prompt('Estimated days (e.g. "5–7 business days")') ?? undefined;
    await api.post('/admin/settings/shipping/rates', { zoneId, name, rateCents, estimatedDays });
    load();
  };

  const addTax = async () => {
    const name = prompt('Tax name');
    if (!name) return;
    const region = prompt('Region (e.g. "CA" for California)') ?? '';
    const country = prompt('Country code', 'US') ?? 'US';
    const rateBps = Number(prompt('Rate in basis points (825 = 8.25%)') ?? '0');
    await api.post('/admin/settings/taxes', { name, region, country, rateBps });
    load();
  };

  const addCoupon = async () => {
    const code = prompt('Coupon code');
    if (!code) return;
    const kind = prompt('Type: "percent" or "amount"', 'percent');
    const body: any = { code, active: true };
    if (kind === 'percent') body.percentOffBps = Number(prompt('Percent off (e.g. 10 for 10%)') ?? '0') * 100;
    else body.amountOffCents = Number(prompt('Amount off in cents') ?? '0');
    await api.post('/admin/settings/coupons', body);
    load();
  };

  return (
    <div>
      <h1>Settings</h1>

      <div className="admin-card">
        <h3>Store info</h3>
        <SettingField settings={settings} keyName="store.name" label="Store name" save={saveSetting} />
        <SettingField settings={settings} keyName="store.email" label="Support email" save={saveSetting} />
        <SettingField settings={settings} keyName="store.phone" label="Support phone" save={saveSetting} />
      </div>

      <div className="admin-card">
        <div className="spread"><h3 style={{ margin: 0 }}>Shipping zones</h3><button className="btn" onClick={addZone}>Add zone</button></div>
        {zones.map((z) => (
          <div key={z.id} style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '1rem' }}>
            <div className="spread">
              <strong>{z.name}</strong> <span className="muted">({z.countries.join(', ')})</span>
              <button className="btn secondary" onClick={() => addRate(z.id)}>Add rate</button>
            </div>
            <ul>
              {z.rates.map((r) => (
                <li key={r.id}>{r.name} — ${(r.rateCents / 100).toFixed(2)}{r.estimatedDays ? ` (${r.estimatedDays})` : ''}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="admin-card">
        <div className="spread"><h3 style={{ margin: 0 }}>Tax rates</h3><button className="btn" onClick={addTax}>Add tax</button></div>
        <table className="admin-table">
          <thead><tr><th>Name</th><th>Country</th><th>Region</th><th>Rate</th></tr></thead>
          <tbody>
            {taxes.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td><td>{t.country}</td><td>{t.region}</td><td>{(t.rateBps / 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-card">
        <div className="spread"><h3 style={{ margin: 0 }}>Coupons</h3><button className="btn" onClick={addCoupon}>Add coupon</button></div>
        <table className="admin-table">
          <thead><tr><th>Code</th><th>Value</th><th>Used</th><th>Active</th></tr></thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id}>
                <td>{c.code}</td>
                <td>
                  {c.percentOffBps ? `${(c.percentOffBps / 100).toFixed(1)}%` : ''}
                  {c.amountOffCents ? `$${(c.amountOffCents / 100).toFixed(2)}` : ''}
                </td>
                <td>{c.usageCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                <td>{c.active ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SettingField({
  settings, keyName, label, save,
}: { settings: Record<string, unknown>; keyName: string; label: string; save: (k: string, v: unknown) => void }) {
  const initial = (settings[keyName] as string | undefined) ?? '';
  const [val, setVal] = useState(initial);
  useEffect(() => { setVal(initial); }, [initial]);
  return (
    <div>
      <label>{label}</label>
      <input value={val} onChange={(e) => setVal(e.target.value)} onBlur={() => save(keyName, val)} />
    </div>
  );
}
