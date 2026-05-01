/**
 * /admin/partners/:id — per-partner dashboard with tabs:
 *   Overview · API Keys · Orders · Team · Webhooks · Activity
 *
 * Each tab calls into /api/admin/partners/:id/<resource> and renders the
 * server-side data inline. The header surfaces the suspend/restore kill
 * switch and the partner's lifetime stats.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';
import { StatusBadge } from '../Account';

type Tab = 'overview' | 'api-keys' | 'orders' | 'team' | 'uploads' | 'webhooks' | 'activity';

interface PartnerSummary {
  id: string;
  slug: string;
  name: string;
  platform: string | null;
  contactEmail: string | null;
  contactName: string | null;
  website: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  notes: string | null;
  color: string | null;
  webhookUrl: string | null;
  webhookSecretFingerprint: string | null;
  rateLimitPerMinute: number | null;
  monthlyOrderCap: number | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  active: boolean;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  notes: string | null;
  requireRequestSigning: boolean;
  hasSigningSecret: boolean;
}

interface Member {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  createdAt: string;
}

interface DetailResponse {
  partner: PartnerSummary;
  apiKeys: ApiKey[];
  members: Member[];
  stats: {
    totalOrders: number;
    totalRevenueCents: number;
    paidOrders: number;
    paidRevenueCents: number;
    cancelledOrders: number;
    webhookDeliveries: number;
    lastOrder: { id: string; number: string; createdAt: string; status: string; totalCents: number } | null;
  };
  availableScopes: string[];
  webhookEvents: string[];
}

interface OrderRow {
  id: string;
  number: string;
  externalRef: string | null;
  email: string;
  status: string;
  paymentStatus: string;
  totalCents: number;
  shippingMethod: string | null;
  trackingNumber: string | null;
  createdAt: string;
  apiKey: { id: string; name: string; prefix: string } | null;
}

interface WebhookDelivery {
  id: string;
  event: string;
  orderId: string | null;
  url: string;
  attempts: number;
  statusCode: number | null;
  error: string | null;
  succeeded: boolean;
  createdAt: string;
  deliveredAt: string | null;
}

interface PartnerEvent {
  id: string;
  kind: string;
  message: string | null;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface CreatedSecret {
  apiKey: { id: string; name: string; prefix: string; scopes: string[] };
  secret: string;
  signingSecret: string;
}

export function AdminPartnerDetail() {
  const { id } = useParams();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    try {
      const r = await api.get<DetailResponse>(`/admin/partners/${id}`);
      setData(r);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    void load();
  }, [id]);

  if (error) return <div className="error">{error}</div>;
  if (!data || !id) return <div>Loading…</div>;
  const { partner, stats } = data;

  return (
    <div>
      <div style={{ marginBottom: '.5rem' }}>
        <Link to="/admin/partners">← Back to Partners</Link>
      </div>

      <div className="spread" style={{ marginBottom: '.5rem', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <span
            style={{
              display: 'inline-block',
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: partner.color ?? '#94a3b8',
            }}
          />
          <div>
            <h1 style={{ margin: 0 }}>{partner.name}</h1>
            <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
              /{partner.slug}
              {partner.platform && (
                <>
                  {' · '}
                  <span style={{ textTransform: 'capitalize' }}>{partner.platform}</span>
                </>
              )}
              {' · '}
              Onboarded {new Date(partner.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
        <PartnerStatusControls partner={partner} onChanged={load} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
          margin: '1rem 0',
        }}
      >
        <Stat label="Total orders" value={String(stats.totalOrders)} />
        <Stat label="Paid orders" value={String(stats.paidOrders)} />
        <Stat label="Paid revenue" value={formatMoney(stats.paidRevenueCents)} />
        <Stat label="Cancelled" value={String(stats.cancelledOrders)} />
        <Stat label="API keys" value={String(data.apiKeys.length)} sub={`${data.apiKeys.filter((k) => k.active).length} active`} />
        <Stat label="Team" value={String(data.members.length)} />
        <Stat
          label="Last order"
          value={stats.lastOrder ? new Date(stats.lastOrder.createdAt).toLocaleDateString() : '—'}
        />
      </div>

      <div className="admin-card" style={{ padding: 0, marginBottom: '1rem' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--border)',
            padding: '0 .5rem',
          }}
        >
          {(['overview', 'api-keys', 'orders', 'team', 'uploads', 'webhooks', 'activity'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '.85rem 1rem',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t ? '3px solid var(--brand)' : '3px solid transparent',
                color: tab === t ? 'var(--brand)' : 'var(--ink)',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {t === 'api-keys' ? 'API Keys' : t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <OverviewTab data={data} onChanged={load} />}
      {tab === 'api-keys' && <ApiKeysTab partnerId={id} apiKeys={data.apiKeys} availableScopes={data.availableScopes} onChanged={load} />}
      {tab === 'orders' && <OrdersTab partnerId={id} />}
      {tab === 'team' && <TeamTab partnerId={id} members={data.members} onChanged={load} />}
      {tab === 'uploads' && <UploadsTab partnerId={id} />}
      {tab === 'webhooks' && <WebhooksTab partnerId={id} partner={data.partner} events={data.webhookEvents} onChanged={load} />}
      {tab === 'activity' && <ActivityTab partnerId={id} onChanged={load} />}
    </div>
  );
}

function PartnerStatusControls({ partner, onChanged }: { partner: PartnerSummary; onChanged: () => void }) {
  return (
    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
      {partner.status === 'ACTIVE' && <span className="badge paid">Active</span>}
      {partner.status === 'SUSPENDED' && <span className="badge cancelled">Suspended</span>}
      {partner.status === 'ARCHIVED' && <span className="badge">Archived</span>}
      {partner.status === 'ACTIVE' && (
        <button
          className="btn secondary"
          style={{ padding: '.4rem .8rem', color: '#b91c1c', borderColor: '#b91c1c' }}
          onClick={async () => {
            const reason = prompt(`Suspend ${partner.name}? All API keys stop working immediately. Reason (optional):`);
            if (reason === null) return;
            await api.post(`/admin/partners/${partner.id}/suspend`, { reason });
            onChanged();
          }}
        >
          Suspend
        </button>
      )}
      {partner.status === 'SUSPENDED' && (
        <>
          <button
            className="btn"
            style={{ padding: '.4rem .8rem' }}
            onClick={async () => {
              await api.post(`/admin/partners/${partner.id}/restore`);
              onChanged();
            }}
          >
            Restore
          </button>
          <button
            className="btn secondary"
            style={{ padding: '.4rem .8rem' }}
            onClick={async () => {
              if (!confirm(`Archive ${partner.name}? This permanently revokes every API key. They can be restored from ACTIVE again, but already-revoked keys won't auto-reactivate.`)) return;
              await api.post(`/admin/partners/${partner.id}/archive`);
              onChanged();
            }}
          >
            Archive
          </button>
        </>
      )}
      {partner.status === 'ARCHIVED' && (
        <button
          className="btn secondary"
          style={{ padding: '.4rem .8rem' }}
          onClick={async () => {
            await api.post(`/admin/partners/${partner.id}/restore`);
            onChanged();
          }}
        >
          Un-archive
        </button>
      )}
    </div>
  );
}

// ---- Overview tab --------------------------------------------------------

function OverviewTab({ data, onChanged }: { data: DetailResponse; onChanged: () => void }) {
  const { partner } = data;
  return (
    <div>
      <ProfileForm partner={partner} onChanged={onChanged} />
      <div className="admin-card">
        <h3 style={{ marginTop: 0 }}>Limits & gating</h3>
        <p className="muted" style={{ fontSize: '.85rem' }}>
          Override the default per-minute rate limit for this partner's keys, and set a soft monthly
          order cap (the cap is informational — orders past it still process but show a warning).
        </p>
        <LimitsForm partner={partner} onChanged={onChanged} />
      </div>
      {data.stats.lastOrder && (
        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>Most recent order</h3>
          <Link to={`/admin/orders/${data.stats.lastOrder.id}`} style={{ fontWeight: 600 }}>
            {data.stats.lastOrder.number}
          </Link>{' '}
          — <StatusBadge status={data.stats.lastOrder.status} /> ·{' '}
          {formatMoney(data.stats.lastOrder.totalCents)} ·{' '}
          {new Date(data.stats.lastOrder.createdAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function ProfileForm({ partner, onChanged }: { partner: PartnerSummary; onChanged: () => void }) {
  const [name, setName] = useState(partner.name);
  const [platform, setPlatform] = useState(partner.platform ?? '');
  const [contactName, setContactName] = useState(partner.contactName ?? '');
  const [contactEmail, setContactEmail] = useState(partner.contactEmail ?? '');
  const [website, setWebsite] = useState(partner.website ?? '');
  const [color, setColor] = useState(partner.color ?? '#1e74fc');
  const [notes, setNotes] = useState(partner.notes ?? '');
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="admin-card"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await api.patch(`/admin/partners/${partner.id}`, {
            name,
            platform: platform.trim() || null,
            contactName: contactName.trim() || null,
            contactEmail: contactEmail.trim() || null,
            website: website.trim() || null,
            color: color.trim() || null,
            notes: notes.trim() || null,
          });
          onChanged();
        } finally {
          setSaving(false);
        }
      }}
    >
      <h3 style={{ marginTop: 0 }}>Profile</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
        <Labelled label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </Labelled>
        <Labelled label="Platform">
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={inputStyle}>
            <option value="">—</option>
            <option value="kickstarter">Kickstarter</option>
            <option value="indiegogo">Indiegogo</option>
            <option value="backerkit">BackerKit</option>
            <option value="gamefound">Gamefound</option>
            <option value="zoop">Zoop</option>
            <option value="publisher">Publisher</option>
            <option value="other">Other</option>
          </select>
        </Labelled>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Labelled label="Contact name">
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} style={inputStyle} />
        </Labelled>
        <Labelled label="Contact email">
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            style={inputStyle}
          />
        </Labelled>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '1rem' }}>
        <Labelled label="Website">
          <input value={website} onChange={(e) => setWebsite(e.target.value)} style={inputStyle} placeholder="https://" />
        </Labelled>
        <Labelled label="Tag color">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ ...inputStyle, padding: 0, height: 38 }}
          />
        </Labelled>
      </div>
      <Labelled label="Notes (internal)">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, fontFamily: 'inherit' }} />
      </Labelled>
      <button className="btn" type="submit" disabled={saving} style={{ marginTop: '.75rem' }}>
        {saving ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
}

function LimitsForm({ partner, onChanged }: { partner: PartnerSummary; onChanged: () => void }) {
  const [rate, setRate] = useState(partner.rateLimitPerMinute?.toString() ?? '');
  const [cap, setCap] = useState(partner.monthlyOrderCap?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await api.patch(`/admin/partners/${partner.id}`, {
            rateLimitPerMinute: rate.trim() ? Number(rate) : null,
            monthlyOrderCap: cap.trim() ? Number(cap) : null,
          });
          onChanged();
        } finally {
          setSaving(false);
        }
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Labelled label="Rate limit (req/min)">
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="default"
            type="number"
            min={1}
            style={inputStyle}
          />
        </Labelled>
        <Labelled label="Monthly order cap (soft)">
          <input
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            placeholder="unlimited"
            type="number"
            min={1}
            style={inputStyle}
          />
        </Labelled>
      </div>
      <button className="btn" type="submit" disabled={saving} style={{ marginTop: '.75rem' }}>
        {saving ? 'Saving…' : 'Save limits'}
      </button>
    </form>
  );
}

// ---- API Keys tab --------------------------------------------------------

function ApiKeysTab({
  partnerId,
  apiKeys,
  availableScopes,
  onChanged,
}: {
  partnerId: string;
  apiKeys: ApiKey[];
  availableScopes: string[];
  onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<CreatedSecret | null>(null);

  return (
    <div>
      <div className="spread" style={{ marginBottom: '.75rem' }}>
        <p className="muted" style={{ margin: 0, maxWidth: 720 }}>
          API keys minted here are scoped to this partner. Suspending the partner instantly invalidates
          every key without revoking — restoring brings them all back. Archiving permanently revokes
          them.
        </p>
        <button className="btn" onClick={() => setCreating(true)}>
          Mint key
        </button>
      </div>

      {justCreated && (
        <SecretReveal
          secret={justCreated.secret}
          signingSecret={justCreated.signingSecret}
          apiKey={justCreated.apiKey}
          onDismiss={() => setJustCreated(null)}
        />
      )}

      {creating && (
        <CreateKeyForm
          partnerId={partnerId}
          availableScopes={availableScopes}
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setJustCreated(c);
            setCreating(false);
            onChanged();
          }}
        />
      )}

      <div className="admin-card" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Scopes</th>
              <th>Signing</th>
              <th>Last used</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                  No API keys yet for this partner.
                </td>
              </tr>
            )}
            {apiKeys.map((k) => (
              <ApiKeyRow key={k.id} partnerId={partnerId} k={k} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ApiKeyRow({
  partnerId,
  k,
  onChanged,
}: {
  partnerId: string;
  k: ApiKey;
  onChanged: () => void;
}) {
  const [revealedSigning, setRevealedSigning] = useState<string | null>(null);
  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{k.name}</div>
        {k.notes && <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{k.notes}</div>}
      </td>
      <td><code>{k.prefix}…</code></td>
      <td style={{ fontSize: '.8rem' }}>
        {k.scopes.map((s) => (
          <span key={s} style={chipStyle}>{s}</span>
        ))}
      </td>
      <td style={{ fontSize: '.8rem' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={k.requireRequestSigning}
            disabled={!k.active}
            onChange={async (e) => {
              await api.patch(`/admin/partners/${partnerId}/api-keys/${k.id}`, {
                requireRequestSigning: e.target.checked,
              });
              onChanged();
            }}
          />{' '}
          Required
        </label>
        <div>
          {k.hasSigningSecret ? (
            <>
              <button
                className="btn secondary"
                style={{ padding: '.2rem .45rem', fontSize: '.75rem', marginRight: 4 }}
                onClick={async () => {
                  const r = await api.get<{ signingSecret: string | null }>(
                    `/admin/partners/${partnerId}/api-keys/${k.id}/signing-secret`,
                  );
                  setRevealedSigning(r.signingSecret ?? '(none)');
                }}
              >
                Reveal
              </button>
              <button
                className="btn secondary"
                style={{ padding: '.2rem .45rem', fontSize: '.75rem', color: '#b91c1c', borderColor: '#b91c1c' }}
                onClick={async () => {
                  if (!confirm('Rotate the signing secret? The old secret stops working immediately.')) return;
                  const r = await api.post<{ signingSecret: string }>(
                    `/admin/partners/${partnerId}/api-keys/${k.id}/signing-secret/rotate`,
                  );
                  setRevealedSigning(r.signingSecret);
                  onChanged();
                }}
              >
                Rotate
              </button>
            </>
          ) : (
            <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>none</span>
          )}
        </div>
        {revealedSigning !== null && (
          <div
            style={{
              marginTop: 4,
              background: '#0f1419',
              color: '#e2e8f0',
              padding: '.4rem .55rem',
              borderRadius: 4,
              fontFamily: 'monospace',
              fontSize: '.75rem',
              display: 'flex',
              gap: 4,
              alignItems: 'center',
            }}
          >
            <code style={{ flex: 1, overflowX: 'auto' }}>{revealedSigning}</code>
            <button
              onClick={() => navigator.clipboard.writeText(revealedSigning)}
              style={{ padding: '.1rem .35rem', fontSize: '.7rem', cursor: 'pointer' }}
            >
              Copy
            </button>
            <button
              onClick={() => setRevealedSigning(null)}
              style={{ padding: '.1rem .35rem', fontSize: '.7rem', cursor: 'pointer' }}
            >
              Hide
            </button>
          </div>
        )}
      </td>
      <td style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
        {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}
      </td>
      <td>{k.active ? <span className="badge paid">Active</span> : <span className="badge cancelled">Revoked</span>}</td>
      <td style={{ textAlign: 'right' }}>
        {k.active ? (
          <button
            className="btn secondary"
            style={{ padding: '.3rem .6rem', fontSize: '.85rem', color: '#b91c1c', borderColor: '#b91c1c' }}
            onClick={async () => {
              if (!confirm(`Revoke "${k.name}"?`)) return;
              await api.post(`/admin/partners/${partnerId}/api-keys/${k.id}/revoke`);
              onChanged();
            }}
          >
            Revoke
          </button>
        ) : (
          <button
            className="btn secondary"
            style={{ padding: '.3rem .6rem', fontSize: '.85rem' }}
            onClick={async () => {
              await api.post(`/admin/partners/${partnerId}/api-keys/${k.id}/restore`);
              onChanged();
            }}
          >
            Restore
          </button>
        )}
      </td>
    </tr>
  );
}

function CreateKeyForm({
  partnerId,
  availableScopes,
  onClose,
  onCreated,
}: {
  partnerId: string;
  availableScopes: string[];
  onClose: () => void;
  onCreated: (c: CreatedSecret) => void;
}) {
  const [name, setName] = useState('Production key');
  const [scopes, setScopes] = useState<string[]>([...availableScopes]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="admin-card">
      <h3 style={{ marginTop: 0 }}>Mint a new API key</h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          setError(null);
          try {
            const r = await api.post<CreatedSecret>(`/admin/partners/${partnerId}/api-keys`, {
              name,
              scopes,
              notes: notes || undefined,
            });
            onCreated(r);
          } catch (err: any) {
            setError(err.message);
            setSubmitting(false);
          }
        }}
      >
        <Labelled label="Key name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            placeholder="e.g. Production key, Test key, BackerKit fulfillment 2026-Q1"
          />
        </Labelled>
        <Labelled label="Scopes">
          <ScopeChecklist availableScopes={availableScopes} value={scopes} onChange={setScopes} />
        </Labelled>
        <Labelled label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{ ...inputStyle, fontFamily: 'inherit' }}
          />
        </Labelled>
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
          <button type="submit" className="btn" disabled={submitting || !name.trim() || scopes.length === 0}>
            {submitting ? 'Minting…' : 'Mint key'}
          </button>
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function ScopeChecklist({
  availableScopes,
  value,
  onChange,
}: {
  availableScopes: string[];
  value: string[];
  onChange: (s: string[]) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
      {availableScopes.map((s) => {
        const on = value.includes(s);
        return (
          <label
            key={s}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '.4rem',
              padding: '.35rem .65rem',
              borderRadius: 4,
              background: on ? 'rgba(30,116,252,.1)' : 'var(--bg-alt)',
              border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
              cursor: 'pointer',
              fontSize: '.85rem',
            }}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => {
                onChange(e.target.checked ? [...value, s] : value.filter((x) => x !== s));
              }}
            />
            <code>{s}</code>
          </label>
        );
      })}
    </div>
  );
}

function SecretReveal({
  secret,
  signingSecret,
  apiKey,
  onDismiss,
}: {
  secret: string;
  signingSecret?: string;
  apiKey: { name: string; prefix: string; scopes: string[] };
  onDismiss: () => void;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copy = (label: string, value: string) => {
    void navigator.clipboard.writeText(value);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1500);
  };
  return (
    <div className="admin-card" style={{ background: '#fff8db', border: '1px solid #d97706', marginBottom: '1.5rem' }}>
      <h3 style={{ marginTop: 0, color: '#7a5800' }}>Key created — copy both secrets now</h3>
      <p style={{ margin: '0 0 .75rem' }}>
        This is the only time the full secrets are displayed. Store them in a secret manager and
        share with the integrator over a secure channel.
      </p>
      <SecretBlock label="API key (bearer)" value={secret} copied={copiedField === 'k'} onCopy={() => copy('k', secret)} />
      {signingSecret && (
        <SecretBlock
          label="HMAC signing secret"
          value={signingSecret}
          copied={copiedField === 's'}
          onCopy={() => copy('s', signingSecret)}
        />
      )}
      <p style={{ margin: '.75rem 0 0', fontSize: '.85rem', color: '#7a5800' }}>
        Key: <strong>{apiKey.name}</strong> · Prefix: <code>{apiKey.prefix}</code> · Scopes:{' '}
        {apiKey.scopes.join(', ')}
      </p>
      <button className="btn secondary" style={{ marginTop: '.75rem' }} onClick={onDismiss}>
        I've copied them
      </button>
    </div>
  );
}

function SecretBlock({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div style={{ marginBottom: '.5rem' }}>
      <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#7a5800', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          gap: '.5rem',
          background: '#0f1419',
          color: '#e2e8f0',
          padding: '.6rem .75rem',
          borderRadius: 6,
          fontFamily: 'monospace',
          fontSize: '.85rem',
          alignItems: 'center',
        }}
      >
        <code style={{ flex: 1, overflowX: 'auto', whiteSpace: 'nowrap' }}>{value}</code>
        <button
          className="btn"
          style={{ padding: '.3rem .7rem', fontSize: '.8rem' }}
          onClick={onCopy}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// ---- Orders tab ----------------------------------------------------------

function OrdersTab({ partnerId }: { partnerId: string }) {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const load = () => {
    const qs = statusFilter ? `?status=${statusFilter}` : '';
    void api.get<{ orders: OrderRow[] }>(`/admin/partners/${partnerId}/orders${qs}`).then((r) => setOrders(r.orders));
  };
  useEffect(() => {
    load();
  }, [statusFilter]);

  if (!orders) return <div>Loading orders…</div>;

  return (
    <div>
      <div className="admin-card" style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '.85rem', fontWeight: 600 }}>Filter by status</label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, marginTop: 4, maxWidth: 240 }}>
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="IN_PRODUCTION">In production</option>
          <option value="SHIPPED">Shipped</option>
          <option value="DELIVERED">Delivered</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="REFUNDED">Refunded</option>
        </select>
      </div>
      <div className="admin-card" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>External ref</th>
              <th>Email</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Total</th>
              <th>Key</th>
              <th>Placed</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                  No orders submitted yet.
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link to={`/admin/orders/${o.id}`}>{o.number}</Link>
                </td>
                <td style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
                  {o.externalRef ?? '—'}
                </td>
                <td>{o.email}</td>
                <td><StatusBadge status={o.status} /></td>
                <td><StatusBadge status={o.paymentStatus} /></td>
                <td>{formatMoney(o.totalCents)}</td>
                <td style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                  {o.apiKey ? <code>{o.apiKey.prefix}</code> : '—'}
                </td>
                <td style={{ fontSize: '.85rem' }}>{new Date(o.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Team tab ------------------------------------------------------------

function TeamTab({ partnerId, members, onChanged }: { partnerId: string; members: Member[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <div className="spread" style={{ marginBottom: '.75rem' }}>
        <p className="muted" style={{ margin: 0, maxWidth: 720 }}>
          Members are user accounts tagged with this partner — typically the operations / dev contacts
          at the platform. They can be CC'd on partner-related emails and will (in a future release)
          have access to a partner-scoped dashboard.
        </p>
        <button className="btn" onClick={() => setAdding(true)}>
          Add member
        </button>
      </div>
      {adding && <AddMemberForm partnerId={partnerId} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); onChanged(); }} />}
      <div className="admin-card" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                  No team members yet.
                </td>
              </tr>
            )}
            {members.map((m) => (
              <tr key={m.id}>
                <td><Link to={`/admin/customers/${m.id}`}>{m.email}</Link></td>
                <td>{[m.firstName, m.lastName].filter(Boolean).join(' ') || <span className="muted">—</span>}</td>
                <td><span className="badge">{m.role}</span></td>
                <td style={{ fontSize: '.85rem' }}>{new Date(m.createdAt).toLocaleDateString()}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn secondary"
                    style={{ padding: '.3rem .6rem', fontSize: '.85rem', color: '#b91c1c', borderColor: '#b91c1c' }}
                    onClick={async () => {
                      if (!confirm(`Remove ${m.email} from this partner? Their user account stays intact.`)) return;
                      await api.del(`/admin/partners/${partnerId}/members/${m.id}`);
                      onChanged();
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddMemberForm({ partnerId, onClose, onAdded }: { partnerId: string; onClose: () => void; onAdded: () => void }) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="admin-card"
      onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
          await api.post(`/admin/partners/${partnerId}/members`, {
            email,
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            password: password || undefined,
          });
          onAdded();
        } catch (err: any) {
          setError(err.message);
          setSubmitting(false);
        }
      }}
    >
      <h3 style={{ marginTop: 0 }}>Add a partner contact</h3>
      <p className="muted" style={{ fontSize: '.85rem' }}>
        If a user with this email already exists, they're tagged with this partner. Otherwise a new
        account is created — supply a temporary password to share.
      </p>
      <Labelled label="Email">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
      </Labelled>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Labelled label="First name">
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
        </Labelled>
        <Labelled label="Last name">
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
        </Labelled>
      </div>
      <Labelled label="Password (only required for new accounts, min 8 chars)">
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          style={inputStyle}
          placeholder="leave blank to link an existing account"
        />
      </Labelled>
      {error && <div className="error">{error}</div>}
      <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
        <button type="submit" className="btn" disabled={submitting || !email.trim()}>
          {submitting ? 'Saving…' : 'Add member'}
        </button>
        <button type="button" className="btn secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---- Webhooks tab --------------------------------------------------------

function WebhooksTab({
  partnerId,
  partner,
  events,
  onChanged,
}: {
  partnerId: string;
  partner: PartnerSummary;
  events: string[];
  onChanged: () => void;
}) {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[] | null>(null);
  const [selectedDelivery, setSelectedDelivery] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState(partner.webhookUrl ?? '');
  const [savingUrl, setSavingUrl] = useState(false);

  const loadDeliveries = () => {
    void api
      .get<{ deliveries: WebhookDelivery[] }>(`/admin/partners/${partnerId}/webhook-deliveries`)
      .then((r) => setDeliveries(r.deliveries));
  };
  useEffect(loadDeliveries, [partnerId]);

  return (
    <div>
      <form
        className="admin-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setSavingUrl(true);
          try {
            await api.patch(`/admin/partners/${partnerId}`, { webhookUrl: webhookUrl.trim() || null });
            onChanged();
          } finally {
            setSavingUrl(false);
          }
        }}
      >
        <h3 style={{ marginTop: 0 }}>Webhook configuration</h3>
        <p className="muted" style={{ fontSize: '.85rem' }}>
          We POST a signed JSON body to this URL on order status transitions. Events emitted:{' '}
          {events.map((ev, i) => (
            <span key={ev}>
              <code>{ev}</code>
              {i < events.length - 1 ? ', ' : ''}
            </span>
          ))}
          .
        </p>
        <Labelled label="Webhook URL">
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            style={inputStyle}
            placeholder="https://partner.com/webhooks/printingcomics"
          />
        </Labelled>
        <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
          <button className="btn" type="submit" disabled={savingUrl}>
            {savingUrl ? 'Saving…' : 'Save URL'}
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={!partner.webhookUrl}
            onClick={async () => {
              await api.post(`/admin/partners/${partnerId}/webhook-test`);
              loadDeliveries();
            }}
          >
            Send test ping
          </button>
        </div>
      </form>

      <div className="admin-card">
        <h3 style={{ marginTop: 0 }}>Signing secret</h3>
        <p className="muted" style={{ fontSize: '.85rem' }}>
          The fingerprint <code>{partner.webhookSecretFingerprint ?? '—'}</code> identifies the
          current secret. Reveal once to copy, or rotate to invalidate the old secret immediately.
        </p>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button
            className="btn secondary"
            onClick={async () => {
              const r = await api.get<{ secret: string | null }>(`/admin/partners/${partnerId}/webhook-secret`);
              setRevealedSecret(r.secret ?? '');
            }}
          >
            Reveal current secret
          </button>
          <button
            className="btn secondary"
            style={{ color: '#b91c1c', borderColor: '#b91c1c' }}
            onClick={async () => {
              if (!confirm('Rotate the webhook secret? The old secret will stop working immediately and the partner must update their verification code.')) return;
              const r = await api.post<{ secret: string }>(`/admin/partners/${partnerId}/webhook-secret/rotate`);
              setRevealedSecret(r.secret);
              onChanged();
            }}
          >
            Rotate secret
          </button>
        </div>
        {revealedSecret !== null && (
          <div
            style={{
              marginTop: '.75rem',
              padding: '.75rem',
              background: '#0f1419',
              color: '#e2e8f0',
              borderRadius: 6,
              fontFamily: 'monospace',
              display: 'flex',
              gap: '.5rem',
              alignItems: 'center',
            }}
          >
            <code style={{ flex: 1 }}>{revealedSecret || '(no secret set)'}</code>
            {revealedSecret && (
              <button
                className="btn"
                style={{ padding: '.3rem .7rem', fontSize: '.85rem' }}
                onClick={() => navigator.clipboard.writeText(revealedSecret)}
              >
                Copy
              </button>
            )}
            <button
              className="btn secondary"
              style={{ padding: '.3rem .7rem', fontSize: '.85rem' }}
              onClick={() => setRevealedSecret(null)}
            >
              Hide
            </button>
          </div>
        )}
      </div>

      <div className="admin-card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem' }}>
          <h3 style={{ margin: 0 }}>Delivery log</h3>
          <p className="muted" style={{ fontSize: '.85rem', margin: '.25rem 0 0' }}>
            Last 100 attempts. Failed deliveries can be replayed from the row's "Replay" button.
          </p>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Order</th>
              <th>Result</th>
              <th>Attempts</th>
              <th>Sent</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {deliveries === null && (
              <tr>
                <td colSpan={6}>Loading…</td>
              </tr>
            )}
            {deliveries?.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                  No deliveries logged yet.
                </td>
              </tr>
            )}
            {deliveries?.map((d) => (
              <tr key={d.id}>
                <td><code>{d.event}</code></td>
                <td>
                  {d.orderId ? (
                    <Link to={`/admin/orders/${d.orderId}`} style={{ fontSize: '.85rem' }}>
                      {d.orderId.slice(0, 8)}…
                    </Link>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {d.succeeded ? (
                    <span className="badge paid">{d.statusCode ?? 200}</span>
                  ) : (
                    <span className="badge cancelled">
                      {d.statusCode ? `HTTP ${d.statusCode}` : d.error?.slice(0, 30) || 'Failed'}
                    </span>
                  )}
                </td>
                <td>{d.attempts}</td>
                <td style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
                  {new Date(d.createdAt).toLocaleString()}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    className="btn secondary"
                    style={{ padding: '.3rem .6rem', fontSize: '.85rem', marginRight: 4 }}
                    onClick={() => setSelectedDelivery(d.id)}
                  >
                    View
                  </button>
                  <button
                    className="btn secondary"
                    style={{ padding: '.3rem .6rem', fontSize: '.85rem' }}
                    onClick={async () => {
                      await api.post(`/admin/partners/${partnerId}/webhook-deliveries/${d.id}/replay`);
                      loadDeliveries();
                    }}
                  >
                    Replay
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedDelivery && (
        <DeliveryDetailModal
          partnerId={partnerId}
          deliveryId={selectedDelivery}
          onClose={() => setSelectedDelivery(null)}
        />
      )}
    </div>
  );
}

function DeliveryDetailModal({ partnerId, deliveryId, onClose }: { partnerId: string; deliveryId: string; onClose: () => void }) {
  const [delivery, setDelivery] = useState<(WebhookDelivery & { payload: unknown; responseBody: string | null }) | null>(null);
  useEffect(() => {
    void api
      .get<{ delivery: WebhookDelivery & { payload: unknown; responseBody: string | null } }>(
        `/admin/partners/${partnerId}/webhook-deliveries/${deliveryId}`,
      )
      .then((r) => setDelivery(r.delivery));
  }, [partnerId, deliveryId]);
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        className="admin-card"
        style={{ maxWidth: 720, width: '90%', maxHeight: '85vh', overflow: 'auto', margin: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="spread" style={{ marginBottom: '.5rem' }}>
          <h3 style={{ margin: 0 }}>Delivery</h3>
          <button className="btn secondary" onClick={onClose} style={{ padding: '.3rem .6rem' }}>
            Close
          </button>
        </div>
        {!delivery ? (
          <div>Loading…</div>
        ) : (
          <>
            <div style={{ fontSize: '.85rem', marginBottom: '.5rem' }}>
              <strong>{delivery.event}</strong> · {delivery.url}
              <br />
              {delivery.succeeded ? (
                <span className="badge paid">HTTP {delivery.statusCode}</span>
              ) : (
                <span className="badge cancelled">{delivery.error ?? `HTTP ${delivery.statusCode ?? '—'}`}</span>
              )}{' '}
              · {delivery.attempts} attempts · {new Date(delivery.createdAt).toLocaleString()}
            </div>
            <h4 style={{ marginBottom: 4 }}>Request payload</h4>
            <pre style={preStyle}>{JSON.stringify(delivery.payload, null, 2)}</pre>
            <h4 style={{ marginBottom: 4 }}>Response body</h4>
            <pre style={preStyle}>{delivery.responseBody || '(empty)'}</pre>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Uploads tab ---------------------------------------------------------

interface PartnerUpload {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  contentHash: string | null;
  tags: string[];
  apiKey: { id: string; name: string; prefix: string } | null;
  attachedToOrders: number;
  createdAt: string;
}

function UploadsTab({ partnerId }: { partnerId: string }) {
  const [items, setItems] = useState<PartnerUpload[] | null>(null);
  useEffect(() => {
    void api
      .get<{ uploads: PartnerUpload[] }>(`/admin/partners/${partnerId}/uploads`)
      .then((r) => setItems(r.uploads));
  }, [partnerId]);
  return (
    <div>
      <p className="muted" style={{ maxWidth: 720, marginTop: 0 }}>
        Print files this partner has uploaded via <code>POST /api/v1/uploads</code>. Click a file
        to download — admin sessions don't need the access token query param.
      </p>
      <div className="admin-card" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Purpose</th>
              <th>Size</th>
              <th>Type</th>
              <th>Uploaded by key</th>
              <th>Attached</th>
              <th>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {items === null && (
              <tr>
                <td colSpan={7}>Loading…</td>
              </tr>
            )}
            {items?.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                  No uploads yet.
                </td>
              </tr>
            )}
            {items?.map((u) => {
              const purpose = u.tags.find((t) => t.startsWith('purpose:'))?.slice('purpose:'.length) ?? '—';
              return (
                <tr key={u.id}>
                  <td>
                    <a href={u.url} target="_blank" rel="noreferrer">
                      {u.filename}
                    </a>
                    {u.contentHash && (
                      <div style={{ fontSize: '.7rem', color: 'var(--muted)' }} title={u.contentHash}>
                        sha256: {u.contentHash.slice(0, 12)}…
                      </div>
                    )}
                  </td>
                  <td>{purpose === '—' ? <span className="muted">—</span> : <code>{purpose}</code>}</td>
                  <td>{formatBytes(u.size)}</td>
                  <td style={{ fontSize: '.85rem' }}>{u.mimeType}</td>
                  <td style={{ fontSize: '.85rem' }}>
                    {u.apiKey ? (
                      <>
                        {u.apiKey.name}
                        <br />
                        <code style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{u.apiKey.prefix}</code>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{u.attachedToOrders}</td>
                  <td style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
                    {new Date(u.createdAt).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ---- Activity tab --------------------------------------------------------

function ActivityTab({ partnerId, onChanged }: { partnerId: string; onChanged: () => void }) {
  const [events, setEvents] = useState<PartnerEvent[] | null>(null);
  const [note, setNote] = useState('');
  const [posting, setPosting] = useState(false);

  const load = () => {
    void api.get<{ events: PartnerEvent[] }>(`/admin/partners/${partnerId}/events`).then((r) => setEvents(r.events));
  };
  useEffect(load, [partnerId]);

  return (
    <div>
      <form
        className="admin-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!note.trim()) return;
          setPosting(true);
          try {
            await api.post(`/admin/partners/${partnerId}/notes`, { message: note });
            setNote('');
            load();
            onChanged();
          } finally {
            setPosting(false);
          }
        }}
      >
        <h3 style={{ marginTop: 0 }}>Add note</h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="e.g. Onboarding call scheduled for Tuesday — confirm webhook payload format."
          style={{ ...inputStyle, fontFamily: 'inherit' }}
        />
        <button className="btn" type="submit" disabled={posting || !note.trim()} style={{ marginTop: '.5rem' }}>
          Add note
        </button>
      </form>
      <div className="admin-card">
        <h3 style={{ marginTop: 0 }}>Activity</h3>
        {events === null && <div>Loading…</div>}
        {events?.length === 0 && <p className="muted">No events yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {events?.map((ev) => (
            <li
              key={ev.id}
              style={{
                padding: '.6rem 0',
                borderBottom: '1px solid var(--border)',
                fontSize: '.9rem',
                display: 'flex',
                gap: '.6rem',
              }}
            >
              <span className="badge" style={{ alignSelf: 'flex-start' }}>{ev.kind}</span>
              <div style={{ flex: 1 }}>
                <div>{ev.message ?? <span className="muted">(no message)</span>}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>
                  {ev.actorName ?? 'system'} · {new Date(ev.createdAt).toLocaleString()}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---- Shared bits ---------------------------------------------------------

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="admin-card" style={{ margin: 0, padding: '1rem' }}>
      <div style={{ fontSize: '.7rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '.25rem' }}>{value}</div>
      {sub && <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{sub}</div>}
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '.5rem' }}>
      <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '.5rem',
  border: '1px solid var(--border)',
  borderRadius: 4,
};

const chipStyle: React.CSSProperties = {
  display: 'inline-block',
  background: 'var(--bg-alt)',
  padding: '.1rem .4rem',
  borderRadius: 3,
  marginRight: 4,
  marginBottom: 2,
};

const preStyle: React.CSSProperties = {
  background: '#0f1419',
  color: '#e2e8f0',
  padding: '.75rem',
  borderRadius: 6,
  fontSize: '.8rem',
  overflowX: 'auto',
  maxHeight: 240,
};
