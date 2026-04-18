import { useEffect, useState } from 'react';
import { api } from '../../api/client';

type Section = 'store' | 'payments' | 'email' | 'ai' | 'seo' | 'shipping' | 'taxes' | 'coupons' | 'backup';

interface SettingsMap {
  [key: string]: unknown;
}

export function AdminSettings() {
  const [section, setSection] = useState<Section>('store');

  return (
    <div>
      <h1>Settings</h1>
      <div className="admin-card" style={{ padding: 0, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', padding: '0 .5rem' }}>
          {(['store', 'payments', 'email', 'ai', 'seo', 'shipping', 'taxes', 'coupons', 'backup'] as Section[]).map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              style={{
                padding: '.85rem 1rem',
                background: 'transparent',
                border: 'none',
                borderBottom: section === s ? '3px solid var(--brand)' : '3px solid transparent',
                color: section === s ? 'var(--brand)' : 'var(--ink)',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {s === 'ai' ? 'AI (Claude)' : s}
            </button>
          ))}
        </div>
      </div>
      {section === 'store' && <StoreSection />}
      {section === 'payments' && <PaymentsSection />}
      {section === 'email' && <EmailSection />}
      {section === 'ai' && <AiSection />}
      {section === 'seo' && <SeoSection />}
      {section === 'shipping' && <ShippingSection />}
      {section === 'taxes' && <TaxesSection />}
      {section === 'coupons' && <CouponsSection />}
      {section === 'backup' && <BackupSection />}
    </div>
  );
}

function useSettings() {
  const [settings, setSettings] = useState<SettingsMap>({});
  const [secretKeys, setSecretKeys] = useState<string[]>([]);
  const load = () =>
    api.get<{ settings: SettingsMap; secretKeys: string[] }>('/admin/settings').then((r) => {
      setSettings(r.settings);
      setSecretKeys(r.secretKeys);
    });
  useEffect(() => { void load(); }, []);
  const save = async (key: string, value: unknown) => {
    await api.put('/admin/settings', { key, value });
    void load();
  };
  const saveBulk = async (entries: { key: string; value: unknown }[]) => {
    await api.put('/admin/settings/bulk', { entries });
    void load();
  };
  return { settings, secretKeys, save, saveBulk, reload: load };
}

function Field({
  value, onSave, label, type = 'text', placeholder,
}: {
  value: unknown; onSave: (v: string) => void; label: string; type?: string; placeholder?: string;
}) {
  const [local, setLocal] = useState(String(value ?? ''));
  useEffect(() => { setLocal(String(value ?? '')); }, [value]);
  return (
    <div>
      <label>{label}</label>
      <input
        type={type}
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== String(value ?? '')) onSave(local); }}
      />
    </div>
  );
}

function Toggle({ value, onSave, label }: { value: unknown; onSave: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', margin: '.5rem 0' }}>
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onSave(e.target.checked)}
        style={{ width: 'auto' }}
      />
      {label}
    </label>
  );
}

function StoreSection() {
  const { settings, save } = useSettings();
  return (
    <div className="admin-card">
      <h3>Store info</h3>
      <Field label="Store name" value={settings['store.name']} onSave={(v) => save('store.name', v)} />
      <Field label="Support email" value={settings['store.email']} onSave={(v) => save('store.email', v)} />
      <Field label="Support phone" value={settings['store.phone']} onSave={(v) => save('store.phone', v)} />
      <Field label="Address line 1" value={settings['store.addressLine1']} onSave={(v) => save('store.addressLine1', v)} />
      <Field label="Address line 2" value={settings['store.addressLine2']} onSave={(v) => save('store.addressLine2', v)} />
      <div className="grid-2">
        <Field label="City" value={settings['store.city']} onSave={(v) => save('store.city', v)} />
        <Field label="Region / State" value={settings['store.region']} onSave={(v) => save('store.region', v)} />
      </div>
      <div className="grid-2">
        <Field label="Postal code" value={settings['store.postalCode']} onSave={(v) => save('store.postalCode', v)} />
        <Field label="Country" value={settings['store.country']} onSave={(v) => save('store.country', v)} />
      </div>
      <Field label="Logo URL" value={settings['store.logoUrl']} onSave={(v) => save('store.logoUrl', v)} />
      <Field label="Currency" value={settings['store.currency']} onSave={(v) => save('store.currency', v)} placeholder="USD" />
    </div>
  );
}

function PaymentsSection() {
  const { settings, save } = useSettings();
  return (
    <>
      <div className="admin-card">
        <h3>PayPal</h3>
        <p className="muted">
          Configure your PayPal credentials here — they're stored encrypted (AES-GCM).
          Mode <code>sandbox</code> uses <code>api-m.sandbox.paypal.com</code>; <code>live</code> uses <code>api-m.paypal.com</code>.
        </p>
        <div>
          <label>Environment</label>
          <select value={(settings['paypal.environment'] as string) ?? 'sandbox'} onChange={(e) => save('paypal.environment', e.target.value)}>
            <option value="sandbox">Sandbox</option>
            <option value="live">Live</option>
          </select>
        </div>
        <Field label="Client ID" value={settings['paypal.clientId']} onSave={(v) => save('paypal.clientId', v)} />
        <Field label="Client secret" value={settings['paypal.clientSecret']} onSave={(v) => save('paypal.clientSecret', v)} type="password" placeholder="paste to update (encrypted)" />
        <Field label="Webhook ID" value={settings['paypal.webhookId']} onSave={(v) => save('paypal.webhookId', v)} />
        <Toggle label="Enable PayPal button" value={settings['paypal.enablePaypalButton'] ?? true} onSave={(v) => save('paypal.enablePaypalButton', v)} />
        <Toggle label="Enable credit/debit card fields" value={settings['paypal.enableCard'] ?? true} onSave={(v) => save('paypal.enableCard', v)} />
      </div>
    </>
  );
}

function EmailSection() {
  const { settings, save } = useSettings();
  return (
    <>
      <div className="admin-card">
        <h3>SMTP</h3>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
          Transactional + campaign email. Point at a local Postfix instance on the same host
          (<code>localhost:25</code>, no auth) or an external relay. See <code>deploy/SMTP.md</code>
          for the Postfix + DKIM + SPF + DMARC setup.
        </p>
        <div className="grid-2">
          <Field label="Host" value={settings['smtp.host']} onSave={(v) => save('smtp.host', v)} placeholder="localhost" />
          <Field label="Port" value={settings['smtp.port']} onSave={(v) => save('smtp.port', Number(v))} placeholder="25" />
        </div>
        <Toggle label="Secure (implicit TLS, usually for port 465)" value={settings['smtp.secure']} onSave={(v) => save('smtp.secure', v)} />
        <div className="grid-2">
          <Field label="Username (optional)" value={settings['smtp.user']} onSave={(v) => save('smtp.user', v)} />
          <Field label="Password (optional)" type="password" placeholder="paste to update" value={settings['smtp.password']} onSave={(v) => save('smtp.password', v)} />
        </div>
        <div className="grid-2">
          <Field label="From email" value={settings['smtp.fromEmail']} onSave={(v) => save('smtp.fromEmail', v)} placeholder="hello@printingcomics.com" />
          <Field label="From name" value={settings['smtp.fromName']} onSave={(v) => save('smtp.fromName', v)} />
        </div>
        <Field label="Reply-to (optional)" value={settings['smtp.replyTo']} onSave={(v) => save('smtp.replyTo', v)} />
        <Toggle label="Test mode (log only, don't actually send)" value={settings['smtp.testMode']} onSave={(v) => save('smtp.testMode', v)} />
      </div>

      <div className="admin-card">
        <h3>Inbound mail</h3>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
          Postfix pipes incoming RFC-822 messages to <code>POST /api/inbound</code> authenticated
          with this secret (sent as <code>Authorization: Bearer …</code>). See
          <code> deploy/SMTP.md </code> for the aliases / pipe config.
        </p>
        <Field label="Inbound secret" type="password" placeholder="rotate to update" value={settings['smtp.inboundSecret']} onSave={(v) => save('smtp.inboundSecret', v)} />
      </div>

      <div className="admin-card">
        <h3>Tracking</h3>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: 0 }}>
          Open tracking uses a 1×1 pixel at <code>/api/track/open?t=…</code>. Click tracking
          rewrites outbound links through <code>/api/track/click?t=…&amp;u=…</code>. Both require
          <code> store.publicUrl </code> to be set.
        </p>
        <Field label="Public site URL" value={settings['store.publicUrl']} onSave={(v) => save('store.publicUrl', v)} placeholder="https://printingcomics.com" />
      </div>
    </>
  );
}

function AiSection() {
  const { settings, save } = useSettings();
  return (
    <div className="admin-card">
      <h3>Anthropic (Claude)</h3>
      <Field label="API key" type="password" placeholder="paste to update" value={settings['anthropic.apiKey']} onSave={(v) => save('anthropic.apiKey', v)} />
      <div>
        <label>Model</label>
        <select value={(settings['anthropic.model'] as string) ?? 'claude-opus-4-7'} onChange={(e) => save('anthropic.model', e.target.value)}>
          <option value="claude-opus-4-7">claude-opus-4-7 (recommended)</option>
          <option value="claude-opus-4-6">claude-opus-4-6</option>
          <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
          <option value="claude-haiku-4-5">claude-haiku-4-5</option>
        </select>
      </div>
    </div>
  );
}

function SeoSection() {
  const { settings, save } = useSettings();
  return (
    <div className="admin-card">
      <h3>SEO defaults</h3>
      <Field label="Site title template" placeholder="{{page}} — Printing Comics" value={settings['seo.siteTitleTemplate']} onSave={(v) => save('seo.siteTitleTemplate', v)} />
      <Field label="Default meta description" value={settings['seo.defaultMetaDescription']} onSave={(v) => save('seo.defaultMetaDescription', v)} />
      <div>
        <label>Default robots policy</label>
        <select value={(settings['seo.robotsPolicy'] as string) ?? 'index'} onChange={(e) => save('seo.robotsPolicy', e.target.value)}>
          <option value="index">Index</option>
          <option value="noindex">Noindex</option>
        </select>
      </div>
    </div>
  );
}

function ShippingSection() {
  const [zones, setZones] = useState<any[]>([]);
  const load = () => api.get<{ zones: any[] }>('/admin/settings/shipping').then((r) => setZones(r.zones));
  useEffect(() => { void load(); }, []);
  const addZone = async () => {
    const name = prompt('Zone name');
    if (!name) return;
    const countries = (prompt('Countries (comma-separated ISO codes)', 'US') ?? 'US').split(',').map((s) => s.trim().toUpperCase());
    await api.post('/admin/settings/shipping/zones', { name, countries });
    load();
  };
  const addRate = async (zoneId: string) => {
    const name = prompt('Rate name');
    if (!name) return;
    const rateCents = Number(prompt('Rate in cents', '1000') ?? '0');
    const estimatedDays = prompt('Estimated days') ?? undefined;
    await api.post('/admin/settings/shipping/rates', { zoneId, name, rateCents, estimatedDays });
    load();
  };
  return (
    <div className="admin-card">
      <div className="spread"><h3 style={{ margin: 0 }}>Shipping zones</h3><button className="btn" onClick={addZone}>Add zone</button></div>
      {zones.map((z) => (
        <div key={z.id} style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '1rem' }}>
          <div className="spread">
            <strong>{z.name}</strong> <span className="muted">({z.countries.join(', ')})</span>
            <button className="btn secondary" onClick={() => addRate(z.id)}>Add rate</button>
          </div>
          <ul>
            {z.rates.map((r: any) => <li key={r.id}>{r.name} — ${(r.rateCents / 100).toFixed(2)} ({r.estimatedDays ?? '—'})</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TaxesSection() {
  const [taxes, setTaxes] = useState<any[]>([]);
  const load = () => api.get<{ taxes: any[] }>('/admin/settings/taxes').then((r) => setTaxes(r.taxes));
  useEffect(() => { void load(); }, []);
  const addTax = async () => {
    const name = prompt('Tax name');
    if (!name) return;
    const region = prompt('Region (e.g. CA)') ?? '';
    const country = prompt('Country', 'US') ?? 'US';
    const rateBps = Number(prompt('Rate bps (825 = 8.25%)') ?? '0');
    await api.post('/admin/settings/taxes', { name, region, country, rateBps });
    load();
  };
  return (
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
  );
}

function CouponsSection() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const load = () => api.get<{ coupons: any[] }>('/admin/settings/coupons').then((r) => setCoupons(r.coupons));
  useEffect(() => { void load(); }, []);
  const addCoupon = async () => {
    const code = prompt('Code');
    if (!code) return;
    const kind = prompt('Type: percent or amount', 'percent');
    const body: any = { code, active: true };
    if (kind === 'percent') body.percentOffBps = Number(prompt('Percent off') ?? '0') * 100;
    else body.amountOffCents = Number(prompt('Amount off in cents') ?? '0');
    await api.post('/admin/settings/coupons', body);
    load();
  };
  return (
    <div className="admin-card">
      <div className="spread"><h3 style={{ margin: 0 }}>Coupons</h3><button className="btn" onClick={addCoupon}>Add coupon</button></div>
      <table className="admin-table">
        <thead><tr><th>Code</th><th>Value</th><th>Used</th><th>Active</th></tr></thead>
        <tbody>
          {coupons.map((c) => (
            <tr key={c.id}>
              <td>{c.code}</td>
              <td>{c.percentOffBps ? `${(c.percentOffBps / 100).toFixed(1)}%` : c.amountOffCents ? `$${(c.amountOffCents / 100).toFixed(2)}` : ''}</td>
              <td>{c.usageCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
              <td>{c.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BackupSection() {
  const [stats, setStats] = useState<any | null>(null);
  useEffect(() => { void api.get('/admin/backup/stats').then(setStats); }, []);
  return (
    <div className="admin-card">
      <h3>Site backup</h3>
      <p className="muted">
        Exports a JSON snapshot of all application data (products, orders, customers, email subscribers, campaigns, SEO analyses, settings).
        Secrets are not included. For a full database-level backup, run <code>pg_dump</code> against your Postgres instance on a schedule.
      </p>
      {stats && (
        <ul>
          <li>Products: {stats.products}</li>
          <li>Orders: {stats.orders}</li>
          <li>Users: {stats.users}</li>
          <li>Subscribers: {stats.subscribers}</li>
          <li>Templates: {stats.templates}</li>
          <li>Campaigns: {stats.campaigns}</li>
          <li>Sends: {stats.sends}</li>
        </ul>
      )}
      <a className="btn" href="/api/admin/backup/export">Download backup</a>
    </div>
  );
}
