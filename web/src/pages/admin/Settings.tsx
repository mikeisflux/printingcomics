import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';

type Section = 'store' | 'payments' | 'email' | 'ai' | 'seo' | 'shipping' | 'easypost' | 'storage' | 'taxes' | 'coupons' | 'backup';

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
          {(['store', 'payments', 'email', 'ai', 'seo', 'shipping', 'easypost', 'storage', 'taxes', 'coupons', 'backup'] as Section[]).map((s) => (
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
      {section === 'easypost' && <EasyPostSection />}
      {section === 'storage' && <StorageSection />}
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
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState<string | null>(null);

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

  // Runs in batches until nothing is left on local disk.
  async function migrate() {
    setMigrating(true); setMigrateMsg(null);
    try {
      let total = 0;
      const allFailures: { name: string; error: string }[] = [];
      for (let pass = 0; pass < 500; pass++) {
        const r = await api.post<{ migrated: number; missing?: number; remaining: number; failures: { name: string; error: string }[] }>(
          // First pass of a click re-checks anything previously written off as
          // missing, in case the path resolution has since improved.
          '/admin/settings/r2/migrate', { limit: 10, retryMissing: pass === 0 },
        );
        total += r.migrated;
        allFailures.push(...(r.failures ?? []));
        setMigrateMsg(`Moved ${total} file(s)… ${r.remaining} left`);
        // Stop when finished, or when a pass can't make progress.
        if (r.remaining === 0 || r.migrated === 0) break;
      }
      setMigrateMsg(
        `Done — moved ${total} file(s) to R2.` +
        (allFailures.length ? ` ${allFailures.length} could not be moved (${allFailures.slice(0, 3).map((f) => `${f.name}: ${f.error}`).join('; ')}${allFailures.length > 3 ? '…' : ''}).` : ''),
      );
    } catch (e: any) {
      setMigrateMsg(e?.message ?? 'Migration failed');
    } finally { setMigrating(false); loadStatus(); }
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

      {/* TEMPORARY: one-time backfill. Remove this card (and the /r2/migrate
          route) once everything has been moved and "still local" reads 0. */}
      <div className="admin-card">
        <h3>Move existing files to R2</h3>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
          One-time backfill for files uploaded before R2 was turned on. Copies each one
          up and repoints its link. Safe to re-run — it only touches files still on local
          disk, and nothing is deleted from the server until its copy is confirmed.
        </p>
        <button className="btn" onClick={migrate} disabled={migrating || !status?.enabled || (status?.local ?? 0) === 0}>
          {migrating ? 'Moving…' : `Move ${status?.local ?? 0} file(s) to R2`}
        </button>
        {!status?.enabled && (
          <p className="muted" style={{ fontSize: '.8rem', marginTop: '.5rem' }}>
            Turn on R2 and test the connection first.
          </p>
        )}
        {migrateMsg && <div style={{ marginTop: '.6rem', fontSize: '.85rem' }}>{migrateMsg}</div>}
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
  const deleteZone = async (z: any) => {
    if (!confirm(`Delete zone "${z.name}" and all its rates?`)) return;
    await api.del(`/admin/settings/shipping/zones/${z.id}`);
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
  const deleteRate = async (r: any) => {
    if (!confirm(`Delete rate "${r.name}"?`)) return;
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
