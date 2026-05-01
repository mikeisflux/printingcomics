/**
 * /admin/partners — list of crowdfunding platforms / publishers / other
 * external integrators that submit orders via the public API.
 *
 * From the row's "View" link, the operator drills into the per-partner
 * dashboard at /admin/partners/:id. From this page they can also create new
 * partners and bulk-suspend/restore via the per-row controls.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';

interface Partner {
  id: string;
  slug: string;
  name: string;
  platform: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  contactEmail: string | null;
  contactName: string | null;
  website: string | null;
  color: string | null;
  notes: string | null;
  webhookUrl: string | null;
  createdAt: string;
  apiKeyCount: number;
  memberCount: number;
  orderCount: number;
  paidOrderCount: number;
  paidRevenueCents: number;
  lastOrderAt: string | null;
}

interface ListResponse {
  counts: { active: number; suspended: number; archived: number };
  partners: Partner[];
}

const STATUS_FILTERS = ['ALL', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export function AdminPartners() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return api
      .get<ListResponse>(`/admin/partners${qs}`)
      .then(setData)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    void load();
  }, [statusFilter]);

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '.25rem' }}>Partners</h1>
          <p className="muted" style={{ margin: 0 }}>
            Crowdfunding platforms, publishers, and other integrators that submit orders via the
            public <code>/api/v1</code> endpoints. Manage their API keys, team contacts, and
            webhook configuration here.{' '}
            <Link to="/developers">Public docs →</Link>
          </p>
        </div>
        <button className="btn" onClick={() => setCreating(true)}>
          New partner
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {data && (
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {STATUS_FILTERS.map((s) => {
            const count =
              s === 'ALL'
                ? data.counts.active + data.counts.suspended + data.counts.archived
                : s === 'ACTIVE'
                  ? data.counts.active
                  : s === 'SUSPENDED'
                    ? data.counts.suspended
                    : data.counts.archived;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '.4rem .9rem',
                  border: `1px solid ${statusFilter === s ? 'var(--brand)' : 'var(--border)'}`,
                  background: statusFilter === s ? 'var(--brand)' : 'transparent',
                  color: statusFilter === s ? '#fff' : 'var(--ink)',
                  borderRadius: 4,
                  fontSize: '.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()} · {count}
              </button>
            );
          })}
        </div>
      )}

      <div className="admin-card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
          style={{ display: 'flex', gap: '.5rem' }}
        >
          <input
            placeholder="Search name, slug, email, platform"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1, padding: '.5rem', border: '1px solid var(--border)', borderRadius: 4 }}
          />
          <button className="btn" type="submit">
            Search
          </button>
        </form>
      </div>

      {creating && (
        <CreatePartnerForm
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      )}

      <div className="admin-card" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Partner</th>
              <th>Platform</th>
              <th>Keys</th>
              <th>Team</th>
              <th>Orders</th>
              <th>Paid revenue</th>
              <th>Last order</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.partners.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink-muted)' }}
                >
                  No partners yet. Click <strong>New partner</strong> to onboard your first
                  crowdfunding platform.
                </td>
              </tr>
            )}
            {data?.partners.map((p) => (
              <PartnerRow key={p.id} partner={p} onChanged={load} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PartnerRow({ partner, onChanged }: { partner: Partner; onChanged: () => void }) {
  return (
    <tr>
      <td>
        <Link to={`/admin/partners/${partner.id}`} style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: partner.color ?? '#94a3b8',
            }}
          />
          <div>
            <div style={{ fontWeight: 600 }}>{partner.name}</div>
            <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>/{partner.slug}</div>
          </div>
        </Link>
      </td>
      <td>{partner.platform ?? <span className="muted">—</span>}</td>
      <td>{partner.apiKeyCount}</td>
      <td>{partner.memberCount}</td>
      <td>
        {partner.orderCount}
        {partner.paidOrderCount > 0 && (
          <span style={{ marginLeft: 4, color: 'var(--muted)', fontSize: '.8rem' }}>
            ({partner.paidOrderCount} paid)
          </span>
        )}
      </td>
      <td>{formatMoney(partner.paidRevenueCents)}</td>
      <td style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
        {partner.lastOrderAt ? new Date(partner.lastOrderAt).toLocaleDateString() : 'Never'}
      </td>
      <td>
        <StatusPill status={partner.status} />
      </td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {partner.status === 'ACTIVE' ? (
          <button
            className="btn secondary"
            style={{ padding: '.3rem .6rem', fontSize: '.85rem', color: '#b91c1c', borderColor: '#b91c1c' }}
            onClick={async () => {
              const reason = prompt(`Suspend "${partner.name}"? All API keys will start failing immediately. Reason (optional):`);
              if (reason === null) return;
              await api.post(`/admin/partners/${partner.id}/suspend`, { reason });
              onChanged();
            }}
          >
            Suspend
          </button>
        ) : partner.status === 'SUSPENDED' ? (
          <button
            className="btn secondary"
            style={{ padding: '.3rem .6rem', fontSize: '.85rem' }}
            onClick={async () => {
              await api.post(`/admin/partners/${partner.id}/restore`);
              onChanged();
            }}
          >
            Restore
          </button>
        ) : (
          <span className="muted" style={{ fontSize: '.85rem' }}>Archived</span>
        )}
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: Partner['status'] }) {
  if (status === 'ACTIVE') return <span className="badge paid">Active</span>;
  if (status === 'SUSPENDED') return <span className="badge cancelled">Suspended</span>;
  return <span className="badge">Archived</span>;
}

function CreatePartnerForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [platform, setPlatform] = useState('kickstarter');
  const [contactEmail, setContactEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [website, setWebsite] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="admin-card">
      <h3 style={{ marginTop: 0 }}>Onboard a new partner</h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          setError(null);
          try {
            await api.post('/admin/partners', {
              name,
              slug: slug.trim() || undefined,
              platform: platform.trim() || undefined,
              contactEmail: contactEmail.trim() || undefined,
              contactName: contactName.trim() || undefined,
              website: website.trim() || undefined,
              webhookUrl: webhookUrl.trim() || undefined,
              notes: notes.trim() || undefined,
            });
            onCreated();
          } catch (err: any) {
            setError(err.message);
            setSubmitting(false);
          }
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
          <Field label="Display name" required value={name} onChange={setName} placeholder="Acme Comics on Kickstarter" />
          <Field label="Slug (optional)" value={slug} onChange={setSlug} placeholder="auto-generated from name" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={fieldLabelStyle}>Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              style={inputStyle}
            >
              <option value="kickstarter">Kickstarter</option>
              <option value="indiegogo">Indiegogo</option>
              <option value="backerkit">BackerKit</option>
              <option value="gamefound">Gamefound</option>
              <option value="zoop">Zoop</option>
              <option value="publisher">Publisher</option>
              <option value="other">Other</option>
            </select>
          </div>
          <Field label="Website" value={website} onChange={setWebsite} placeholder="https://www.kickstarter.com/projects/…" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Field label="Contact email" value={contactEmail} onChange={setContactEmail} placeholder="dev@partner.com" />
          <Field label="Contact name" value={contactName} onChange={setContactName} placeholder="Jane Doe" />
        </div>
        <Field
          label="Webhook URL (optional, can be set later)"
          value={webhookUrl}
          onChange={setWebhookUrl}
          placeholder="https://partner.com/webhooks/printingcomics"
        />
        <div>
          <label style={fieldLabelStyle}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Onboarded for Spring 2026 campaign — primary contact via Slack"
            style={{ ...inputStyle, fontFamily: 'inherit' }}
          />
        </div>
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
          <button type="submit" className="btn" disabled={submitting || !name.trim()}>
            {submitting ? 'Creating…' : 'Create partner'}
          </button>
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '.85rem',
  fontWeight: 600,
  marginBottom: 4,
  marginTop: '.5rem',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '.5rem',
  border: '1px solid var(--border)',
  borderRadius: 4,
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}
