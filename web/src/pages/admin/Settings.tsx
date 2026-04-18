import { useEffect, useState } from 'react';
import { api } from '../../api/client';

type Section = 'store' | 'payments' | 'email' | 'ai' | 'seo' | 'shipping' | 'packlinkpro' | 'taxes' | 'coupons' | 'backup';

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
          {(['store', 'payments', 'email', 'ai', 'seo', 'shipping', 'packlinkpro', 'taxes', 'coupons', 'backup'] as Section[]).map((s) => (
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
      {section === 'packlinkpro' && <PacklinkSection />}
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
        <h3>Mailgun</h3>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
          Transactional + campaign email via Mailgun's HTTP API. Get your API key from
          Mailgun → <em>Sending → API Keys → Private API key</em>. Recommended sending domain:
          <code> mail.printingcomics.com</code>.
        </p>
        <div className="grid-2">
          <Field label="API key" type="password" placeholder="paste to update" value={settings['mailgun.apiKey']} onSave={(v) => save('mailgun.apiKey', v)} />
          <Field label="Sending domain" value={settings['mailgun.domain']} onSave={(v) => save('mailgun.domain', v)} placeholder="mail.printingcomics.com" />
        </div>
        <div className="grid-2">
          <div>
            <label>Region</label>
            <select value={String(settings['mailgun.region'] ?? 'us')} onChange={(e) => save('mailgun.region', e.target.value)}>
              <option value="us">US (api.mailgun.net)</option>
              <option value="eu">EU (api.eu.mailgun.net)</option>
            </select>
          </div>
          <Field label="From email" value={settings['mailgun.fromEmail']} onSave={(v) => save('mailgun.fromEmail', v)} placeholder="hello@printingcomics.com" />
        </div>
        <div className="grid-2">
          <Field label="From name" value={settings['mailgun.fromName']} onSave={(v) => save('mailgun.fromName', v)} />
          <Field label="Reply-to (optional)" value={settings['mailgun.replyTo']} onSave={(v) => save('mailgun.replyTo', v)} />
        </div>
        <Toggle label="Test mode (log only, don't actually send)" value={settings['mailgun.testMode']} onSave={(v) => save('mailgun.testMode', v)} />
      </div>

      <div className="admin-card">
        <h3>Webhook</h3>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
          In Mailgun → <em>Sending → Webhooks</em>, point all event types (Accepted, Delivered,
          Opened, Clicked, Permanent Failure, Temporary Failure, Complained, Unsubscribed) at:
          <br />
          <code>https://printingcomics.com/api/webhooks/mailgun</code>
          <br /><br />
          The signing key below validates the HMAC Mailgun stamps on each request — grab it from
          the <em>HTTP Webhook Signing Key</em> section of the same page.
        </p>
        <Field label="Webhook signing key" type="password" placeholder="paste to update" value={settings['mailgun.webhookSigningKey']} onSave={(v) => save('mailgun.webhookSigningKey', v)} />
      </div>

      <div className="admin-card">
        <h3>Inbound</h3>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: 0 }}>
          In Mailgun → <em>Receiving → Create Route</em>, create a <em>catch_all()</em> (or
          <em>match_recipient(".*@mail.printingcomics.com")</em>) route with action
          <em> forward("you@yourmailbox.com") </em>
          to get replies delivered to your normal inbox. No in-app inbox needed — Mailgun handles
          bounces automatically via the webhook above.
        </p>
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

function PacklinkSection() {
  const { settings, save } = useSettings();
  const webhookUrl = settings['packlinkpro.webhookSecret']
    ? `https://printingcomics.com/api/webhooks/packlinkpro?token=${encodeURIComponent(String(settings['packlinkpro.webhookSecret']))}`
    : 'https://printingcomics.com/api/webhooks/packlinkpro';
  return (
    <>
      <div className="admin-card">
        <h3>Packlink Pro</h3>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
          Grab your API key from <em>Packlink Pro → Settings → API key</em>
          {' '}(<code>https://pro.packlink.it/private/settings/api-key</code>).
          Then fill the ship-from address below — required for rate quotes.
        </p>
        <Field label="API key" type="password" placeholder="paste to update" value={settings['packlinkpro.apiKey']} onSave={(v) => save('packlinkpro.apiKey', v)} />
        <Toggle label="Auto-push paid orders to Packlink Pro" value={settings['packlinkpro.autoPushOnPaid']} onSave={(v) => save('packlinkpro.autoPushOnPaid', v)} />
      </div>

      <div className="admin-card">
        <h3>Ship-from address</h3>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
          Used as the origin for rate quotes and on shipping labels.
        </p>
        <div className="grid-2">
          <Field label="Sender name" value={settings['packlinkpro.fromName']} onSave={(v) => save('packlinkpro.fromName', v)} />
          <Field label="Company" value={settings['packlinkpro.fromCompany']} onSave={(v) => save('packlinkpro.fromCompany', v)} />
        </div>
        <div className="grid-2">
          <Field label="Sender email" value={settings['packlinkpro.fromEmail']} onSave={(v) => save('packlinkpro.fromEmail', v)} />
          <Field label="Sender phone" value={settings['packlinkpro.fromPhone']} onSave={(v) => save('packlinkpro.fromPhone', v)} />
        </div>
        <Field label="Street address line 1" value={settings['packlinkpro.fromStreet1']} onSave={(v) => save('packlinkpro.fromStreet1', v)} />
        <Field label="Street address line 2" value={settings['packlinkpro.fromStreet2']} onSave={(v) => save('packlinkpro.fromStreet2', v)} />
        <div className="grid-2">
          <Field label="City" value={settings['packlinkpro.fromCity']} onSave={(v) => save('packlinkpro.fromCity', v)} />
          <Field label="State / region" value={settings['packlinkpro.fromState']} onSave={(v) => save('packlinkpro.fromState', v)} />
        </div>
        <div className="grid-2">
          <Field label="Postal code" value={settings['packlinkpro.fromPostalCode']} onSave={(v) => save('packlinkpro.fromPostalCode', v)} />
          <Field label="Country (ISO)" value={settings['packlinkpro.fromCountry']} onSave={(v) => save('packlinkpro.fromCountry', v)} placeholder="US" />
        </div>
      </div>

      <div className="admin-card">
        <h3>Webhook</h3>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: '.5rem' }}>
          Paste this URL into <em>Packlink Pro → Settings → Webhooks</em>. Set the shared token below
          — the app rejects any webhook call that doesn't carry the same token in the query string.
        </p>
        <Field label="Webhook shared secret (random string)" type="password" placeholder="paste to update" value={settings['packlinkpro.webhookSecret']} onSave={(v) => save('packlinkpro.webhookSecret', v)} />
        <code style={{ display: 'block', padding: '.5rem', background: 'var(--bg-alt)', borderRadius: 4, wordBreak: 'break-all' }}>
          {webhookUrl}
        </code>
      </div>
    </>
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
