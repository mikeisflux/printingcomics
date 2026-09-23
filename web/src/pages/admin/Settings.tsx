import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { errorMessage, useConfirm, usePrompt, useToast } from '../../components/admin/ui';

type Section = 'store' | 'payments' | 'email' | 'ai' | 'seo' | 'shipping' | 'easypost' | 'storage' | 'taxes' | 'coupons' | 'costs' | 'backup';
const SECTIONS: Section[] = ['store', 'payments', 'email', 'ai', 'seo', 'shipping', 'easypost', 'storage', 'taxes', 'coupons', 'costs', 'backup'];
const SECTION_LABEL: Partial<Record<Section, string>> = { ai: 'AI (Claude)', costs: 'Print costs' };

interface SettingsMap {
  [key: string]: unknown;
}

export function AdminSettings() {
  // ?section=costs deep-links a tab (the order page links straight to Print costs).
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('section') as Section | null;
  const section: Section = fromUrl && SECTIONS.includes(fromUrl) ? fromUrl : 'store';
  const setSection = (s: Section) => setParams(s === 'store' ? {} : { section: s }, { replace: true });

  return (
    <div>
      <h1>Settings</h1>
      <div className="admin-card" style={{ padding: 0, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', padding: '0 .5rem' }}>
          {SECTIONS.map((s) => (
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
              {SECTION_LABEL[s] ?? s}
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
      {section === 'easypost' && <EasyPostSection />}
      {section === 'storage' && <StorageSection />}
      {section === 'taxes' && <TaxesSection />}
      {section === 'coupons' && <CouponsSection />}
      {section === 'costs' && <PrintCostsSection />}
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
  value, onSave, label, type = 'text', placeholder, autoComplete, name,
}: {
  value: unknown; onSave: (v: string) => void; label: string; type?: string; placeholder?: string;
  autoComplete?: string; name?: string;
}) {
  const saved = String(value ?? '');
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // When a save finishes and fresh data flows down via props, drop back to
  // read-only so the user sees the canonical stored value.
  useEffect(() => {
    if (!editing) setLocal('');
  }, [saved, editing]);

  const ac = autoComplete ?? (type === 'password' ? 'new-password' : 'off');
  const fieldName = name ?? `pc-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${type}`;

  const startEdit = () => { setLocal(''); setEditing(true); setJustSaved(false); };
  const cancel = () => { setLocal(''); setEditing(false); };
  const commit = async () => {
    if (local === '') { cancel(); return; }
    setSaving(true);
    try {
      await onSave(local);
      setEditing(false);
      setLocal('');
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const rowStyle: CSSProperties = { display: 'flex', gap: '.5rem', alignItems: 'stretch' };
  const inputStyle: CSSProperties = { flex: 1 };
  const btnBase: CSSProperties = { width: 'auto', padding: '.5rem .9rem', whiteSpace: 'nowrap' };

  return (
    <div>
      <label>{label} {justSaved && <span style={{ color: 'var(--brand, #16a34a)', fontSize: '.8rem', marginLeft: '.4rem' }}>✓ saved</span>}</label>
      {editing ? (
        <div style={rowStyle}>
          <input
            style={inputStyle}
            type={type}
            value={local}
            name={fieldName}
            autoFocus
            autoComplete={ac}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            placeholder={placeholder ?? 'Paste value'}
            onChange={(e) => setLocal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void commit(); }
              else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }}
          />
          <button type="button" className="btn" style={btnBase} onClick={commit} disabled={saving || local === ''}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn secondary" style={btnBase} onClick={cancel} disabled={saving}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={rowStyle}>
          <input
            style={{ ...inputStyle, opacity: 0.75, cursor: 'default' }}
            type={type}
            value={saved}
            disabled
            name={fieldName}
            autoComplete={ac}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            tabIndex={-1}
          />
          <button type="button" className="btn secondary" style={btnBase} onClick={startEdit}>
            {saved ? 'Edit' : 'Set'}
          </button>
        </div>
      )}
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

      <h3 style={{ marginTop: '1.5rem' }}>Shipping Supplies page</h3>
      <p className="muted" style={{ fontSize: '.85rem', marginTop: '-.4rem' }}>
        The video that plays as the first hero slide and in the “Watch demo” band on{' '}
        <code>/shop/shipping-supplies</code>. Paste a different link to swap it; clearing the
        field restores the Comic Armor demo.
      </p>
      <Field
        label="Hero video URL (YouTube or direct .mp4)"
        value={settings['shippingSupplies.heroVideoUrl']}
        onSave={(v) => save('shippingSupplies.heroVideoUrl', v)}
        placeholder="https://www.youtube.com/watch?v=…"
      />
    </div>
  );
}

function PaymentsSection() {
  const { settings, save } = useSettings();
  const clientIdSet = Boolean(String(settings['paypal.clientId'] ?? '').trim());
  const clientSecretSet = Boolean(String(settings['paypal.clientSecret'] ?? '').trim());
  return (
    <>
      <div className="admin-card">
        <h3>PayPal</h3>
        <p className="muted">
          Configure your PayPal credentials here — they're stored encrypted (AES-GCM).
          Mode <code>sandbox</code> uses <code>api-m.sandbox.paypal.com</code>; <code>live</code> uses <code>api-m.paypal.com</code>.
        </p>
        {/* Decoy fields: some browsers ignore autoComplete="off" but will dump
            saved logins into the FIRST email/password fields they see in a form.
            Sacrificing two hidden inputs spares the real PayPal fields below. */}
        <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
          <input type="text" name="username" autoComplete="username" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />
          <input type="password" name="password" autoComplete="current-password" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />
          <div>
            <label>Environment</label>
            <select value={(settings['paypal.environment'] as string) ?? 'sandbox'} onChange={(e) => save('paypal.environment', e.target.value)}>
              <option value="sandbox">Sandbox</option>
              <option value="live">Live</option>
            </select>
          </div>
          <Field
            label="Client ID"
            value={settings['paypal.clientId']}
            onSave={(v) => save('paypal.clientId', v)}
            placeholder="A21AA…"
          />
          <p className="muted" style={{ fontSize: '.8rem', margin: '-.25rem 0 .75rem' }}>
            {clientIdSet
              ? '✓ Client ID saved.'
              : 'Not saved yet. Paste the long Client ID from your PayPal app (looks like A21AA…), then click out of the field.'}
          </p>
          <Field label="Client secret" value={settings['paypal.clientSecret']} onSave={(v) => save('paypal.clientSecret', v)} type="password" placeholder="paste to update (encrypted)" />
          <p className="muted" style={{ fontSize: '.8rem', margin: '-.25rem 0 .75rem' }}>
            {clientSecretSet ? '✓ Client secret saved (encrypted).' : 'Not saved yet.'}
          </p>
          <Field label="Webhook ID" value={settings['paypal.webhookId']} onSave={(v) => save('paypal.webhookId', v)} />
          <Toggle label="Enable PayPal button" value={settings['paypal.enablePaypalButton'] ?? true} onSave={(v) => save('paypal.enablePaypalButton', v)} />
          <Toggle label="Enable credit/debit card fields" value={settings['paypal.enableCard'] ?? true} onSave={(v) => save('paypal.enableCard', v)} />
        </form>
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
          Transactional + campaign email via Mailgun's HTTP API. The <strong>API key</strong> box
          takes a Mailgun <em>Sending key</em> (Mailgun → your domain → <em>Domain settings →
          Sending keys → Add sending key</em>, then copy the <strong>full key shown once</strong>).
          The short <em>Key ID</em> like <code>8a38…a6cf</code> is <strong>not</strong> the key — copy
          the full secret. A legacy account <em>Private API key</em> also works if you still have one.
          Set <strong>Sending domain</strong> to your verified Mailgun domain exactly (e.g.
          <code> printingcomics.com</code>) and <strong>From email</strong> to an address at that
          domain. Region must match your Mailgun account (US vs EU).
        </p>
        <div className="grid-2">
          <Field label="API key (Mailgun sending key)" type="password" placeholder="paste full sending key" value={settings['mailgun.apiKey']} onSave={(v) => save('mailgun.apiKey', v)} />
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

function StorageSection() {
  const { settings, save } = useSettings();
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [status, setStatus] = useState<{ enabled: boolean; local: number; remote: number } | null>(null);

  const loadStatus = () => {
    void api.get<{ enabled: boolean; local: number; remote: number }>('/admin/settings/r2/status')
      .then(setStatus)
      .catch(() => setStatus(null));
  };
  useEffect(loadStatus, []);

  async function testConnection() {
    setTesting(true); setTestMsg(null);
    try {
      const r = await api.post<{ ok: boolean; message: string }>('/admin/settings/r2/test', {});
      setTestMsg(r);
    } catch (e: any) {
      setTestMsg({ ok: false, message: e?.message ?? 'Test failed' });
    } finally { setTesting(false); loadStatus(); }
  }

  return (
    <>
      <div className="admin-card">
        <h3>Cloudflare R2 storage</h3>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
          Serves uploads (artwork, proofs, media) from Cloudflare's edge instead of this
          server's disk — much faster downloads for customers. Create a bucket plus an
          <em> R2 API token</em> in the Cloudflare dashboard. While this is off, or if R2
          ever errors, files keep saving locally exactly as before.
        </p>
        <Toggle label="Use R2 for new uploads" value={settings['r2.enabled']} onSave={(v) => { save('r2.enabled', v); setTimeout(loadStatus, 300); }} />
        <Field label="Account ID" value={settings['r2.accountId']} onSave={(v) => save('r2.accountId', v)} />
        <Field label="Access key ID" type="password" placeholder="paste to update" value={settings['r2.accessKeyId']} onSave={(v) => save('r2.accessKeyId', v)} />
        <Field label="Secret access key" type="password" placeholder="paste to update" value={settings['r2.secretAccessKey']} onSave={(v) => save('r2.secretAccessKey', v)} />
        <Field label="Bucket name" value={settings['r2.bucket']} onSave={(v) => save('r2.bucket', v)} />
        <Field
          label="Public URL (bucket public domain or custom domain)"
          placeholder="https://files.printingcomics.com"
          value={settings['r2.publicBaseUrl']}
          onSave={(v) => save('r2.publicBaseUrl', v)}
        />
        <p className="muted" style={{ fontSize: '.8rem' }}>
          Leave the public URL blank for a private bucket — links become time-limited
          signed URLs instead. A public custom domain is faster and cacheable.
        </p>
        <Field label="S3 endpoint override (optional)" placeholder="https://<account>.r2.cloudflarestorage.com" value={settings['r2.endpoint']} onSave={(v) => save('r2.endpoint', v)} />

        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={testConnection} disabled={testing}>
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          {status && (
            <span className="muted" style={{ fontSize: '.85rem' }}>
              {status.remote} file(s) on R2 · {status.local} still local
            </span>
          )}
        </div>
        {testMsg && (
          <div className={testMsg.ok ? 'success' : 'error'} style={{ marginTop: '.6rem', fontSize: '.85rem' }}>
            {testMsg.message}
          </div>
        )}
      </div>
    </>
  );
}

function EasyPostSection() {
  const { settings, save } = useSettings();
  return (
    <>
      <div className="admin-card">
        <h3>EasyPost</h3>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
          Grab an API key from <em>EasyPost → API Keys</em>
          {' '}(<code>https://www.easypost.com/account/api-keys</code>). Use a test
          key while you're wiring things up — test labels are free and watermarked.
          Fill the ship-from address below — required for rate quotes.
        </p>
        <Field label="API key" type="password" placeholder="paste to update" value={settings['easypost.apiKey']} onSave={(v) => save('easypost.apiKey', v)} />
        <Field
          label="API base URL (leave default unless EasyPost told you otherwise)"
          value={settings['easypost.baseUrl']}
          onSave={(v) => save('easypost.baseUrl', v)}
          placeholder="https://api.easypost.com/v2"
        />
        <Field label="Webhook signing secret" type="password" placeholder="paste to update" value={settings['easypost.webhookSecret']} onSave={(v) => save('easypost.webhookSecret', v)} />
        <Toggle label="Auto-buy cheapest label on paid orders" value={settings['easypost.autoBuyOnPaid']} onSave={(v) => save('easypost.autoBuyOnPaid', v)} />
      </div>

      <div className="admin-card">
        <h3>Ship-from address</h3>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
          Used as the origin for rate quotes and on shipping labels.
        </p>
        <div className="grid-2">
          <Field label="Sender name" value={settings['easypost.fromName']} onSave={(v) => save('easypost.fromName', v)} />
          <Field label="Company" value={settings['easypost.fromCompany']} onSave={(v) => save('easypost.fromCompany', v)} />
        </div>
        <div className="grid-2">
          <Field label="Sender email" value={settings['easypost.fromEmail']} onSave={(v) => save('easypost.fromEmail', v)} />
          <Field label="Sender phone" value={settings['easypost.fromPhone']} onSave={(v) => save('easypost.fromPhone', v)} />
        </div>
        <Field label="Street address line 1" value={settings['easypost.fromStreet1']} onSave={(v) => save('easypost.fromStreet1', v)} />
        <Field label="Street address line 2" value={settings['easypost.fromStreet2']} onSave={(v) => save('easypost.fromStreet2', v)} />
        <div className="grid-2">
          <Field label="City" value={settings['easypost.fromCity']} onSave={(v) => save('easypost.fromCity', v)} />
          <Field label="State / region" value={settings['easypost.fromState']} onSave={(v) => save('easypost.fromState', v)} />
        </div>
        <div className="grid-2">
          <Field label="Postal code" value={settings['easypost.fromPostalCode']} onSave={(v) => save('easypost.fromPostalCode', v)} />
          <Field label="Country (ISO)" value={settings['easypost.fromCountry']} onSave={(v) => save('easypost.fromCountry', v)} placeholder="US" />
        </div>
      </div>

      <div className="admin-card">
        <h3>Webhook</h3>
        <p className="muted" style={{ fontSize: '.85rem', margin: 0 }}>
          In the EasyPost dashboard (<em>Account → Webhooks</em>), point a webhook at{' '}
          <code>{(settings['store.publicUrl'] as string) || 'https://your.domain'}/api/webhooks/easypost</code>{' '}
          and paste the signing secret above. Tracker events (in-transit, delivered)
          will update orders automatically; the customer gets a shipping notification
          email the first time an order transitions to SHIPPED.
        </p>
      </div>
    </>
  );
}

function ShippingSection() {
  const confirm = useConfirm(); const prompt = usePrompt();
  const [zones, setZones] = useState<any[]>([]);
  const load = () => api.get<{ zones: any[] }>('/admin/settings/shipping').then((r) => setZones(r.zones));
  useEffect(() => { void load(); }, []);

  const addZone = async () => {
    const name = (await prompt({ title: 'Zone name' }));
    if (!name) return;
    const countries = ((await prompt({ title: 'Countries (comma-separated ISO codes)', defaultValue: 'US' })) ?? 'US').split(',').map((s) => s.trim().toUpperCase());
    await api.post('/admin/settings/shipping/zones', { name, countries });
    load();
  };
  const deleteZone = async (z: any) => {
    if (!(await confirm({ title: `Delete zone "${z.name}" and all its rates?`, confirmLabel: 'Delete', danger: true }))) return;
    await api.del(`/admin/settings/shipping/zones/${z.id}`);
    load();
  };
  const addRate = async (zoneId: string) => {
    const name = (await prompt({ title: 'Rate name' }));
    if (!name) return;
    const dollars = await prompt({ title: 'Rate (dollars)', defaultValue: '10.00', validate: (v) => (isNaN(Number(v)) || Number(v) < 0 ? 'Enter a dollar amount like 9.95' : null) });
    if (dollars === null) return;
    const rateCents = Math.round(Number(dollars) * 100);
    const estimatedDays = (await prompt({ title: 'Estimated days' })) ?? undefined;
    await api.post('/admin/settings/shipping/rates', { zoneId, name, rateCents, estimatedDays });
    load();
  };
  const deleteRate = async (r: any) => {
    if (!(await confirm({ title: `Delete rate "${r.name}"?`, confirmLabel: 'Delete', danger: true }))) return;
    await api.del(`/admin/settings/shipping/rates/${r.id}`);
    load();
  };

  return (
    <div className="admin-card">
      <div className="spread">
        <h3 style={{ margin: 0 }}>Shipping zones</h3>
        <button className="btn" onClick={addZone}>Add zone</button>
      </div>
      {zones.length === 0 && <p className="muted" style={{ marginTop: '1rem' }}>No zones yet.</p>}
      {zones.map((z) => (
        <div key={z.id} style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '1rem' }}>
          <div className="spread" style={{ alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
            <div>
              <strong>{z.name}</strong>{' '}
              <span className="muted">({z.countries.join(', ')})</span>
            </div>
            <div className="row" style={{ gap: '.5rem' }}>
              <button className="btn secondary" onClick={() => addRate(z.id)}>Add rate</button>
              <button
                className="btn secondary"
                style={{ color: '#b91c1c', borderColor: '#b91c1c' }}
                onClick={() => deleteZone(z)}
              >
                Delete zone
              </button>
            </div>
          </div>
          {z.rates.length === 0 ? (
            <p className="muted" style={{ fontSize: '.85rem', margin: '.5rem 0 0' }}>No rates in this zone.</p>
          ) : (
            <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.25rem' }}>
              {z.rates.map((r: any) => (
                <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.25rem' }}>
                  <span style={{ flex: 1 }}>
                    {r.name} — ${(r.rateCents / 100).toFixed(2)} ({r.estimatedDays ?? '—'})
                  </span>
                  <button
                    onClick={() => deleteRate(r)}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: '#b91c1c', fontSize: '.85rem',
                    }}
                    title="Delete rate"
                  >
                    × Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function TaxesSection() {
  const prompt = usePrompt();
  const [taxes, setTaxes] = useState<any[]>([]);
  const load = () => api.get<{ taxes: any[] }>('/admin/settings/taxes').then((r) => setTaxes(r.taxes));
  useEffect(() => { void load(); }, []);
  const addTax = async () => {
    const name = (await prompt({ title: 'Tax name' }));
    if (!name) return;
    const region = (await prompt({ title: 'Region (e.g. CA)' })) ?? '';
    const country = (await prompt({ title: 'Country', defaultValue: 'US' })) ?? 'US';
    const pct = await prompt({ title: 'Tax rate (%)', placeholder: 'e.g. 8.25', validate: (v) => (isNaN(Number(v)) || Number(v) < 0 ? 'Enter a percentage like 8.25' : null) });
    if (pct === null) return;
    const rateBps = Math.round(Number(pct) * 100);
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
  const prompt = usePrompt();
  const [coupons, setCoupons] = useState<any[]>([]);
  const load = () => api.get<{ coupons: any[] }>('/admin/settings/coupons').then((r) => setCoupons(r.coupons));
  useEffect(() => { void load(); }, []);
  const addCoupon = async () => {
    const code = (await prompt({ title: 'Code' }));
    if (!code) return;
    const kind = (await prompt({ title: 'Type: percent or amount', defaultValue: 'percent' }));
    const body: any = { code, active: true };
    if (kind === 'percent') body.percentOffBps = Math.round(Number((await prompt({ title: 'Percent off', placeholder: 'e.g. 15' })) ?? '0') * 100);
    else body.amountOffCents = Math.round(Number((await prompt({ title: 'Amount off (dollars)', placeholder: 'e.g. 5.00' })) ?? '0') * 100);
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

// ---------------------------------------------------------------------------
// Print costs — what an order costs US in paper, clicks, metal and add-ons.
// Owner-only; the resulting estimate shows on every order page. Mirrors
// server/src/lib/print-costs.ts, which owns the arithmetic.
// ---------------------------------------------------------------------------

type SheetSize = '11x17' | '12x18';
const SHEET_SIZES: SheetSize[] = ['11x17', '12x18'];
const SHEET_LABEL: Record<SheetSize, string> = { '11x17': '11 × 17', '12x18': '12 × 18' };

interface PaperStock { code: string; name: string; sheet: SheetSize; costPerSheetCents: number | null; cartonCents: number | null; sheetsPerCarton: number | null }
type StockMap = Record<string, Partial<Record<SheetSize, string>>>;
interface PrintCostConfig {
  version: 1;
  clicks: { colorCents: number; grayscaleCents: number; perSide: Record<SheetSize, number> };
  coverSidesPrinted: 1 | 2;
  spoilagePct: number;
  pagesPerSheet: number;
  sheetSizeByTrim: Record<string, SheetSize>;
  stocks: PaperStock[];
  interiorStock: StockMap;
  coverStock: StockMap;
  metal: {
    sheetCostCents: number; coverTypes: string[]; paperCoverType: string;
    yields: { comicCover: number; tradingCard: number; print11x17: number; printComic: number };
    extraPerPieceCents: number;
    adhesive: { rollCents: number; rollFeet: number; inchesPerPiece: number };
  };
  paperPrints: { stock: string; perSheet: { full: number; comic: number } };
  addOnCents: Record<string, number>;
  productUnitCents: Record<string, number>;
}
interface PrintCostRefs {
  trims: { key: string; name: string }[];
  interiorPapers: string[];
  coverTypes: string[];
  addOnKeys: string[];
  products: { slug: string; name: string; kind: 'unit' | 'extra' }[];
}

const perSheetOf = (s: PaperStock): number | null =>
  s.costPerSheetCents !== null && s.costPerSheetCents > 0 ? s.costPerSheetCents
  : s.cartonCents && s.sheetsPerCarton ? s.cartonCents / s.sheetsPerCarton : null;

function NumInput({ value, onChange, step = 'any', min = 0, width = 110, placeholder, prefix, suffix }: {
  value: number | null | undefined; onChange: (v: number | null) => void;
  step?: string | number; min?: number; width?: number; placeholder?: string; prefix?: string; suffix?: string;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
      {prefix && <span className="muted">{prefix}</span>}
      <input
        type="number" step={step} min={min} placeholder={placeholder}
        value={value === null || value === undefined ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        style={{ width, margin: 0 }}
      />
      {suffix && <span className="muted">{suffix}</span>}
    </span>
  );
}

/** Dollars in the box, cents in the config. */
function Dollars({ cents, onChange, width = 110, placeholder = '0.00' }: { cents: number | null | undefined; onChange: (cents: number | null) => void; width?: number; placeholder?: string }) {
  return (
    <NumInput
      prefix="$" step="0.01" width={width} placeholder={placeholder}
      value={cents === null || cents === undefined ? null : Math.round(cents) / 100}
      onChange={(v) => onChange(v === null ? null : Math.round(v * 100))}
    />
  );
}

function CostRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="spread" style={{ padding: '.4rem 0', borderTop: '1px solid var(--border)', gap: '1rem', flexWrap: 'wrap' }}>
      <span style={{ flex: '1 1 260px' }}>
        {label}
        {hint && <div className="muted" style={{ fontSize: '.78rem' }}>{hint}</div>}
      </span>
      <span style={{ display: 'inline-flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>{children}</span>
    </div>
  );
}

function PrintCostsSection() {
  const toast = useToast();
  const [cfg, setCfg] = useState<PrintCostConfig | null>(null);
  const [refs, setRefs] = useState<PrintCostRefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.get<{ config: PrintCostConfig; refs: PrintCostRefs }>('/admin/costs/print')
      .then((r) => { setCfg(r.config); setRefs(r.refs); })
      .catch((e) => setError(errorMessage(e, 'Could not load print costs')));
  }, []);

  const update = (fn: (c: PrintCostConfig) => PrintCostConfig) => { setCfg((c) => (c ? fn(c) : c)); setDirty(true); };
  const setMap = (which: 'interiorStock' | 'coverStock', label: string, sheet: SheetSize, code: string) =>
    update((c) => ({ ...c, [which]: { ...c[which], [label]: { ...(c[which][label] ?? {}), [sheet]: code || undefined } } }));

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const r = await api.put<{ config: PrintCostConfig }>('/admin/costs/print', { config: cfg });
      setCfg(r.config); setDirty(false);
      toast.success('Print costs saved. Every order page now uses them.');
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save print costs'));
    } finally { setSaving(false); }
  };

  if (error) return <div className="error">{error}</div>;
  if (!cfg || !refs) return <p className="muted">Loading…</p>;

  const usedSheets = SHEET_SIZES.filter((s) => Object.values(cfg.sheetSizeByTrim).includes(s));
  const StockSelect = ({ value, sheet, onChange }: { value: string | undefined; sheet: SheetSize; onChange: (code: string) => void }) => (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={{ margin: 0, maxWidth: 300, fontSize: '.85rem' }}>
      <option value="">— not set —</option>
      {cfg.stocks.filter((s) => s.sheet === sheet).map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
    </select>
  );
  const paperCoverTypes = refs.coverTypes.filter((c) => !/^self/i.test(c) && !cfg.metal.coverTypes.includes(c));
  const addOnGroups = ['Cover', 'Lamination', 'UV', 'Foil'].map((g) => ({ g, keys: refs.addOnKeys.filter((k) => k.startsWith(`${g}: `)) })).filter((x) => x.keys.length > 0);
  const missingSheetCosts = cfg.stocks.filter((s) => perSheetOf(s) === null).map((s) => s.code);

  return (
    <div>
      <p className="muted" style={{ fontSize: '.85rem' }}>
        These numbers drive the <strong>Materials</strong> line on every order: what the paper, press clicks,
        metal plates and add-ons cost us. Only the owner login sees any of it. Save at the bottom.
      </p>

      <div className="admin-card">
        <h3>Press clicks</h3>
        <CostRow label="Colour click" hint="Per click on the press. An 11 × 17 side is 2 clicks, so a double-sided sheet is 4.">
          <NumInput value={cfg.clicks.colorCents} onChange={(v) => update((c) => ({ ...c, clicks: { ...c.clicks, colorCents: v ?? 0 } }))} step="0.1" suffix="¢" width={90} />
        </CostRow>
        <CostRow label="Grayscale click" hint="Interiors ordered in grayscale. Same as colour unless your press bills black cheaper.">
          <NumInput value={cfg.clicks.grayscaleCents} onChange={(v) => update((c) => ({ ...c, clicks: { ...c.clicks, grayscaleCents: v ?? 0 } }))} step="0.1" suffix="¢" width={90} />
        </CostRow>
        <CostRow label="Clicks per side">
          {SHEET_SIZES.map((s) => (
            <NumInput key={s} prefix={SHEET_LABEL[s]} value={cfg.clicks.perSide[s]} onChange={(v) => update((c) => ({ ...c, clicks: { ...c.clicks, perSide: { ...c.clicks.perSide, [s]: v ?? 0 } } }))} step="1" width={70} />
          ))}
        </CostRow>
        <CostRow label="Cover printed on" hint="Both sides when the inside covers print.">
          <select value={cfg.coverSidesPrinted} onChange={(e) => update((c) => ({ ...c, coverSidesPrinted: Number(e.target.value) === 1 ? 1 : 2 }))} style={{ margin: 0 }}>
            <option value={2}>both sides (4 clicks)</option>
            <option value={1}>one side (2 clicks)</option>
          </select>
        </CostRow>
        <CostRow label="Pages per interior sheet" hint="Two pages up, both sides = 4. Interior sheets per book = pages ÷ this, rounded up.">
          <NumInput value={cfg.pagesPerSheet} onChange={(v) => update((c) => ({ ...c, pagesPerSheet: v ?? 4 }))} step="1" min={1} width={70} />
        </CostRow>
        <CostRow label="Spoilage" hint="Extra added to every sheet, click and plate for make-ready and waste.">
          <NumInput value={cfg.spoilagePct} onChange={(v) => update((c) => ({ ...c, spoilagePct: v ?? 0 }))} step="0.5" suffix="%" width={80} />
        </CostRow>
      </div>

      <div className="admin-card">
        <h3>Which sheet each book size prints on</h3>
        {refs.trims.map((t) => (
          <CostRow key={t.key} label={t.name}>
            <select value={cfg.sheetSizeByTrim[t.key] ?? '11x17'} onChange={(e) => update((c) => ({ ...c, sheetSizeByTrim: { ...c.sheetSizeByTrim, [t.key]: e.target.value as SheetSize } }))} style={{ margin: 0 }}>
              {SHEET_SIZES.map((s) => <option key={s} value={s}>{SHEET_LABEL[s]}</option>)}
            </select>
          </CostRow>
        ))}
      </div>

      <div className="admin-card">
        <h3>Paper stocks</h3>
        <p className="muted" style={{ fontSize: '.8rem' }}>
          Enter what a carton costs and how many sheets are in it — the per-sheet figure is worked out — or type the per-sheet cost directly (it wins when set).
          {missingSheetCosts.length > 0 && <span style={{ color: '#b45309' }}> Still missing a cost: {missingSheetCosts.join(', ')}.</span>}
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table" style={{ fontSize: '.85rem' }}>
            <thead><tr><th>Code</th><th>Description</th><th>Sheet</th><th>Carton</th><th>Sheets / carton</th><th>Per sheet</th><th /></tr></thead>
            <tbody>
              {cfg.stocks.map((s, i) => {
                const derived = s.cartonCents && s.sheetsPerCarton ? s.cartonCents / s.sheetsPerCarton : null;
                const set = (patch: Partial<PaperStock>) => update((c) => ({ ...c, stocks: c.stocks.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
                return (
                  <tr key={i}>
                    <td><input value={s.code} onChange={(e) => set({ code: e.target.value })} style={{ width: 110, margin: 0 }} /></td>
                    <td><input value={s.name} onChange={(e) => set({ name: e.target.value })} style={{ minWidth: 220, margin: 0 }} /></td>
                    <td>
                      <select value={s.sheet} onChange={(e) => set({ sheet: e.target.value as SheetSize })} style={{ margin: 0 }}>
                        {SHEET_SIZES.map((z) => <option key={z} value={z}>{SHEET_LABEL[z]}</option>)}
                      </select>
                    </td>
                    <td><Dollars cents={s.cartonCents} onChange={(v) => set({ cartonCents: v })} width={95} /></td>
                    <td><NumInput value={s.sheetsPerCarton} onChange={(v) => set({ sheetsPerCarton: v })} step="1" width={80} placeholder="e.g. 500" /></td>
                    <td>
                      <NumInput value={s.costPerSheetCents} onChange={(v) => set({ costPerSheetCents: v })} step="0.01" width={85} suffix="¢" placeholder={derived !== null ? derived.toFixed(2) : '—'} />
                    </td>
                    <td><button type="button" className="btn secondary sm" onClick={() => update((c) => ({ ...c, stocks: c.stocks.filter((_, j) => j !== i) }))}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn secondary sm" style={{ marginTop: '.5rem' }} onClick={() => update((c) => ({ ...c, stocks: [...c.stocks, { code: '', name: '', sheet: '11x17', costPerSheetCents: null, cartonCents: null, sheetsPerCarton: null }] }))}>+ Add a stock</button>
      </div>

      <div className="admin-card">
        <h3>Which stock prints what</h3>
        <h4 style={{ margin: '.5rem 0 0' }}>Interior paper</h4>
        {refs.interiorPapers.map((label) => (
          <CostRow key={label} label={label}>
            {usedSheets.map((sheet) => (
              <span key={sheet} style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: '.8rem' }}>{SHEET_LABEL[sheet]}</span>
                <StockSelect value={cfg.interiorStock[label]?.[sheet]} sheet={sheet} onChange={(code) => setMap('interiorStock', label, sheet, code)} />
              </span>
            ))}
          </CostRow>
        ))}
        <h4 style={{ margin: '1rem 0 0' }}>Cover paper</h4>
        <p className="muted" style={{ fontSize: '.78rem', margin: '.2rem 0 0' }}>
          Metal covers use the row for “{cfg.metal.paperCoverType}” (set below) — the book is printed on that and the plate is stuck on. Self Cover uses the interior stock.
        </p>
        {paperCoverTypes.map((label) => (
          <CostRow key={label} label={label}>
            {usedSheets.map((sheet) => (
              <span key={sheet} style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: '.8rem' }}>{SHEET_LABEL[sheet]}</span>
                <StockSelect value={cfg.coverStock[label]?.[sheet]} sheet={sheet} onChange={(code) => setMap('coverStock', label, sheet, code)} />
              </span>
            ))}
          </CostRow>
        ))}
        <h4 style={{ margin: '1rem 0 0' }}>Paper art prints</h4>
        <CostRow label="Print stock" hint="Printed one side. Foil prints use it too, plus their extra below.">
          <select value={cfg.paperPrints.stock} onChange={(e) => update((c) => ({ ...c, paperPrints: { ...c.paperPrints, stock: e.target.value } }))} style={{ margin: 0, maxWidth: 320, fontSize: '.85rem' }}>
            <option value="">— not set —</option>
            {cfg.stocks.map((st) => <option key={st.code} value={st.code}>{st.code} — {st.name}</option>)}
          </select>
        </CostRow>
        <CostRow label="Prints per sheet">
          <NumInput prefix="11 × 17" value={cfg.paperPrints.perSheet.full} onChange={(v) => update((c) => ({ ...c, paperPrints: { ...c.paperPrints, perSheet: { ...c.paperPrints.perSheet, full: v ?? 1 } } }))} step="1" min={1} width={60} />
          <NumInput prefix="comic size" value={cfg.paperPrints.perSheet.comic} onChange={(v) => update((c) => ({ ...c, paperPrints: { ...c.paperPrints, perSheet: { ...c.paperPrints.perSheet, comic: v ?? 1 } } }))} step="1" min={1} width={60} />
        </CostRow>
      </div>

      <div className="admin-card">
        <h3>Metal plates</h3>
        <CostRow label="Sublimation sheet (300 × 600 mm)" hint="What one blank sheet costs.">
          <Dollars cents={cfg.metal.sheetCostCents} onChange={(v) => update((c) => ({ ...c, metal: { ...c.metal, sheetCostCents: v ?? 0 } }))} />
        </CostRow>
        <CostRow label="Pieces per sheet" hint="How many of each you cut from one sheet. A comic cover is costed as sheet ÷ covers per sheet.">
          <NumInput prefix="comic covers" value={cfg.metal.yields.comicCover} onChange={(v) => update((c) => ({ ...c, metal: { ...c.metal, yields: { ...c.metal.yields, comicCover: v ?? 1 } } }))} step="1" min={1} width={60} />
          <NumInput prefix="trading cards" value={cfg.metal.yields.tradingCard} onChange={(v) => update((c) => ({ ...c, metal: { ...c.metal, yields: { ...c.metal.yields, tradingCard: v ?? 1 } } }))} step="1" min={1} width={60} />
          <NumInput prefix="11 × 17 prints" value={cfg.metal.yields.print11x17} onChange={(v) => update((c) => ({ ...c, metal: { ...c.metal, yields: { ...c.metal.yields, print11x17: v ?? 1 } } }))} step="1" min={1} width={60} />
          <NumInput prefix="comic-size prints" value={cfg.metal.yields.printComic} onChange={(v) => update((c) => ({ ...c, metal: { ...c.metal, yields: { ...c.metal.yields, printComic: v ?? 1 } } }))} step="1" min={1} width={60} />
        </CostRow>
        <CostRow label="Adhesive" hint="A roll's price and length, and how many inches each plate uses.">
          <Dollars cents={cfg.metal.adhesive.rollCents} onChange={(v) => update((c) => ({ ...c, metal: { ...c.metal, adhesive: { ...c.metal.adhesive, rollCents: v ?? 0 } } }))} width={90} />
          <NumInput prefix="per" value={cfg.metal.adhesive.rollFeet} onChange={(v) => update((c) => ({ ...c, metal: { ...c.metal, adhesive: { ...c.metal.adhesive, rollFeet: v ?? 1 } } }))} step="1" suffix="ft roll" width={70} />
          <NumInput value={cfg.metal.adhesive.inchesPerPiece} onChange={(v) => update((c) => ({ ...c, metal: { ...c.metal, adhesive: { ...c.metal.adhesive, inchesPerPiece: v ?? 0 } } }))} step="0.5" suffix="in per plate" width={70} />
        </CostRow>
        <CostRow label="Extra per plate" hint="Transfer paper, sublimation ink — anything else each plate uses.">
          <NumInput value={cfg.metal.extraPerPieceCents} onChange={(v) => update((c) => ({ ...c, metal: { ...c.metal, extraPerPieceCents: v ?? 0 } }))} step="0.1" suffix="¢" width={80} />
        </CostRow>
        <CostRow label="Cover types that get a plate">
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem .9rem' }}>
            {refs.coverTypes.filter((c) => !/^self|^standard/i.test(c)).map((label) => (
              <label key={label} style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center', fontWeight: 400, margin: 0 }}>
                <input
                  type="checkbox"
                  checked={cfg.metal.coverTypes.includes(label)}
                  onChange={(e) => update((c) => ({ ...c, metal: { ...c.metal, coverTypes: e.target.checked ? [...c.metal.coverTypes, label] : c.metal.coverTypes.filter((x) => x !== label) } }))}
                />
                {label}
              </label>
            ))}
          </span>
        </CostRow>
        <CostRow label="Paper under the plate" hint="A metal book is this cover type with the plate stuck on; its paper and clicks are counted too.">
          <select value={cfg.metal.paperCoverType} onChange={(e) => update((c) => ({ ...c, metal: { ...c.metal, paperCoverType: e.target.value } }))} style={{ margin: 0 }}>
            {refs.coverTypes.filter((c) => !/^self/i.test(c)).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </CostRow>
      </div>

      <div className="admin-card">
        <h3>Add-ons, per book</h3>
        <p className="muted" style={{ fontSize: '.8rem' }}>Flat extra for each finish — glow ink, foil, raised layer, lamination. Leave blank until you have the number; the order page lists what is still unpriced.</p>
        {addOnGroups.map(({ g, keys }) => (
          <div key={g}>
            <h4 style={{ margin: '.75rem 0 0' }}>{g}</h4>
            {keys.map((k) => (
              <CostRow key={k} label={k.slice(g.length + 2)}>
                <Dollars cents={cfg.addOnCents[k]} onChange={(v) => update((c) => { const next = { ...c.addOnCents }; if (v === null) delete next[k]; else next[k] = v; return { ...c, addOnCents: next }; })} placeholder="not set" />
              </CostRow>
            ))}
          </div>
        ))}
      </div>

      <div className="admin-card">
        <h3>Everything else, per unit</h3>
        <p className="muted" style={{ fontSize: '.8rem' }}>Mailers, Comic Armor and the like: what one unit costs us to buy. For prints this is an extra on top of the sheet or plate — a foil layer, a raised layer.</p>
        {refs.products.map((p) => (
          <CostRow key={p.slug} label={p.name} hint={p.kind === 'extra' ? 'extra per print, on top of the paper / plate' : undefined}>
            <Dollars cents={cfg.productUnitCents[p.slug]} onChange={(v) => update((c) => { const next = { ...c.productUnitCents }; if (v === null) delete next[p.slug]; else next[p.slug] = v; return { ...c, productUnitCents: next }; })} placeholder="not set" />
          </CostRow>
        ))}
      </div>

      <div style={{ position: 'sticky', bottom: 0, background: '#fff', padding: '.75rem 0', borderTop: '1px solid var(--border)', display: 'flex', gap: '.75rem', alignItems: 'center' }}>
        <button type="button" className="btn" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : dirty ? 'Save print costs' : 'Saved'}</button>
        {dirty && <span className="muted" style={{ fontSize: '.85rem' }}>Unsaved changes</span>}
      </div>
    </div>
  );
}
