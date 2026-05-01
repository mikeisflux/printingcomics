/**
 * /admin/partners — list of crowdfunding platforms / publishers / other
 * external integrators that submit orders via the public API.
 *
 * Two views: "Partners" (provisioned and live) and "Applications" (inbound
 * requests from /developers awaiting review). The Applications view exposes
 * the approve / reject flow which provisions the Partner + first key on
 * approval.
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
  const [pendingApps, setPendingApps] = useState(0);
  const [view, setView] = useState<'partners' | 'applications'>('partners');
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

  const loadPendingCount = () =>
    api
      .get<{ pendingCount: number }>('/admin/partners/applications/list?status=PENDING')
      .then((r) => setPendingApps(r.pendingCount))
      .catch(() => undefined);

  useEffect(() => {
    void load();
    void loadPendingCount();
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

      <div className="admin-card" style={{ padding: 0, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 .5rem' }}>
          <ViewTab active={view === 'partners'} onClick={() => setView('partners')}>
            Partners
          </ViewTab>
          <ViewTab active={view === 'applications'} onClick={() => setView('applications')}>
            Applications
            {pendingApps > 0 && (
              <span
                style={{
                  marginLeft: 6,
                  background: '#b91c1c',
                  color: '#fff',
                  borderRadius: 9999,
                  padding: '0 .45rem',
                  fontSize: '.7rem',
                  fontWeight: 700,
                }}
              >
                {pendingApps}
              </span>
            )}
          </ViewTab>
        </div>
      </div>

      {view === 'applications' ? (
        <ApplicationsView
          onChanged={() => {
            void loadPendingCount();
            void load();
          }}
        />
      ) : (
        <PartnersView
          data={data}
          q={q}
          setQ={setQ}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          load={load}
          creating={creating}
          setCreating={setCreating}
          error={error}
        />
      )}
    </div>
  );
}

function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '.85rem 1rem',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '3px solid var(--brand)' : '3px solid transparent',
        color: active ? 'var(--brand)' : 'var(--ink)',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {children}
    </button>
  );
}

function PartnersView({
  data,
  q,
  setQ,
  statusFilter,
  setStatusFilter,
  load,
  creating,
  setCreating,
  error,
}: {
  data: ListResponse | null;
  q: string;
  setQ: (v: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  load: () => Promise<void> | void;
  creating: boolean;
  setCreating: (v: boolean) => void;
  error: string | null;
}) {
  return (
    <>
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
              <PartnerRow key={p.id} partner={p} onChanged={() => void load()} />
            ))}
          </tbody>
        </table>
      </div>
    </>
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

// ---- Applications view ---------------------------------------------------

interface PartnerApplication {
  id: string;
  name: string;
  contactName: string;
  contactEmail: string;
  platform: string | null;
  website: string | null;
  scopes: string[];
  estimatedMonthlyOrders: number | null;
  message: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewerId: string | null;
  reviewer: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  reviewNotes: string | null;
  partnerId: string | null;
  partner: { id: string; slug: string; name: string } | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

interface ApprovalResult {
  partner: { id: string; slug: string; name: string };
  apiKey: {
    secret: string;
    signingSecret: string;
    prefix: string;
    name: string;
    scopes: string[];
  } | null;
}

const APP_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

function ApplicationsView({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<PartnerApplication[] | null>(null);
  const [filter, setFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [reviewing, setReviewing] = useState<PartnerApplication | null>(null);
  const [revealed, setRevealed] = useState<ApprovalResult | null>(null);

  const load = () => {
    const qs = filter === 'ALL' ? '' : `?status=${filter}`;
    void api
      .get<{ applications: PartnerApplication[] }>(`/admin/partners/applications/list${qs}`)
      .then((r) => setItems(r.applications));
  };
  useEffect(() => {
    load();
  }, [filter]);

  return (
    <div>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: '.4rem .9rem',
              border: `1px solid ${filter === s ? 'var(--brand)' : 'var(--border)'}`,
              background: filter === s ? 'var(--brand)' : 'transparent',
              color: filter === s ? '#fff' : 'var(--ink)',
              borderRadius: 4,
              fontSize: '.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {revealed && <ApprovalReveal result={revealed} onDismiss={() => setRevealed(null)} />}

      <div className="admin-card" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Contact</th>
              <th>Platform</th>
              <th>Est. orders</th>
              <th>Submitted</th>
              <th>Status</th>
              <th></th>
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
                  {filter === 'PENDING' ? 'No pending applications.' : 'No applications match this filter.'}
                </td>
              </tr>
            )}
            {items?.map((a) => (
              <tr key={a.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  {a.website && (
                    <div style={{ fontSize: '.75rem' }}>
                      <a href={a.website} target="_blank" rel="noreferrer">
                        {a.website}
                      </a>
                    </div>
                  )}
                </td>
                <td style={{ fontSize: '.85rem' }}>
                  {a.contactName}
                  <br />
                  <span style={{ color: 'var(--muted)' }}>{a.contactEmail}</span>
                </td>
                <td>{a.platform ?? <span className="muted">—</span>}</td>
                <td>{a.estimatedMonthlyOrders ?? <span className="muted">—</span>}</td>
                <td style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
                  {new Date(a.createdAt).toLocaleString()}
                </td>
                <td>
                  {a.status === 'PENDING' && <span className="badge pending">Pending</span>}
                  {a.status === 'APPROVED' && (
                    <Link to={`/admin/partners/${a.partnerId}`} className="badge paid">
                      Approved
                    </Link>
                  )}
                  {a.status === 'REJECTED' && <span className="badge cancelled">Rejected</span>}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn secondary"
                    style={{ padding: '.3rem .6rem', fontSize: '.85rem' }}
                    onClick={() => setReviewing(a)}
                  >
                    {a.status === 'PENDING' ? 'Review' : 'View'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reviewing && (
        <ReviewApplicationModal
          application={reviewing}
          onClose={() => setReviewing(null)}
          onApproved={(result) => {
            setReviewing(null);
            setRevealed(result);
            load();
            onChanged();
          }}
          onRejected={() => {
            setReviewing(null);
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function ReviewApplicationModal({
  application,
  onClose,
  onApproved,
  onRejected,
}: {
  application: PartnerApplication;
  onClose: () => void;
  onApproved: (r: ApprovalResult) => void;
  onRejected: () => void;
}) {
  const [tab, setTab] = useState<'review' | 'approve' | 'reject'>('review');

  // Approval form state.
  const [partnerName, setPartnerName] = useState(application.name);
  const [slug, setSlug] = useState('');
  const [platform, setPlatform] = useState(application.platform ?? '');
  const [scopes, setScopes] = useState<string[]>(
    application.scopes.length > 0
      ? application.scopes
      : ['catalog:read', 'pricing:read', 'shipping:read', 'orders:read', 'orders:write'],
  );
  const [webhookUrl, setWebhookUrl] = useState('');
  const [rate, setRate] = useState('');
  const [cap, setCap] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [mintInitialKey, setMintInitialKey] = useState(true);
  const [initialKeyName, setInitialKeyName] = useState('Production key');
  const [emailCredentials, setEmailCredentials] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reject form state.
  const [rejectNotes, setRejectNotes] = useState('');
  const [emailRequester, setEmailRequester] = useState(true);

  const isPending = application.status === 'PENDING';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        className="admin-card"
        style={{ maxWidth: 760, width: '92%', maxHeight: '90vh', overflow: 'auto', margin: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="spread" style={{ marginBottom: '.5rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>{application.name}</h3>
            <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
              from {application.contactName} &lt;{application.contactEmail}&gt; ·{' '}
              {new Date(application.createdAt).toLocaleString()}
            </div>
          </div>
          <button className="btn secondary" onClick={onClose} style={{ padding: '.3rem .6rem' }}>
            Close
          </button>
        </div>

        {isPending && (
          <div style={{ display: 'flex', gap: 8, marginTop: '.75rem', borderBottom: '1px solid var(--border)' }}>
            {(['review', 'approve', 'reject'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '.6rem .9rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: tab === t ? '3px solid var(--brand)' : '3px solid transparent',
                  color: tab === t ? 'var(--brand)' : 'var(--ink)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {(tab === 'review' || !isPending) && (
          <div style={{ marginTop: '.75rem' }}>
            <ReviewDetail label="Platform" value={application.platform} />
            <ReviewDetail
              label="Website"
              value={
                application.website ? (
                  <a href={application.website} target="_blank" rel="noreferrer">
                    {application.website}
                  </a>
                ) : null
              }
            />
            <ReviewDetail
              label="Est. monthly orders"
              value={application.estimatedMonthlyOrders ?? '—'}
            />
            <ReviewDetail
              label="Scopes requested"
              value={
                application.scopes.length === 0
                  ? '—'
                  : application.scopes.map((s) => <code key={s} style={{ marginRight: 4 }}>{s}</code>)
              }
            />
            <ReviewDetail
              label="Message"
              value={
                application.message ? (
                  <div style={{ whiteSpace: 'pre-wrap', borderLeft: '3px solid var(--border)', padding: '0 0 0 .75rem' }}>
                    {application.message}
                  </div>
                ) : (
                  '—'
                )
              }
            />
            <ReviewDetail
              label="Submitted from"
              value={
                <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>
                  IP {application.ipAddress ?? '—'} · {application.userAgent?.slice(0, 60) ?? '—'}
                </span>
              }
            />
            {!isPending && (
              <>
                <ReviewDetail
                  label="Status"
                  value={
                    <>
                      {application.status === 'APPROVED' ? (
                        <Link to={`/admin/partners/${application.partnerId}`} className="badge paid">
                          Approved → {application.partner?.name}
                        </Link>
                      ) : (
                        <span className="badge cancelled">Rejected</span>
                      )}
                      {application.reviewedAt && (
                        <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: '.85rem' }}>
                          {new Date(application.reviewedAt).toLocaleString()} by{' '}
                          {application.reviewer?.email ?? 'system'}
                        </span>
                      )}
                    </>
                  }
                />
                {application.reviewNotes && (
                  <ReviewDetail
                    label="Review notes"
                    value={
                      <div style={{ whiteSpace: 'pre-wrap', borderLeft: '3px solid var(--border)', padding: '0 0 0 .75rem' }}>
                        {application.reviewNotes}
                      </div>
                    }
                  />
                )}
              </>
            )}
          </div>
        )}

        {tab === 'approve' && isPending && (
          <form
            style={{ marginTop: '.75rem', display: 'grid', gap: '.6rem' }}
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              setError(null);
              try {
                const r = await api.post<ApprovalResult>(
                  `/admin/partners/applications/${application.id}/approve`,
                  {
                    partnerName,
                    slug: slug.trim() || undefined,
                    platform: platform || undefined,
                    scopes,
                    webhookUrl: webhookUrl.trim() || undefined,
                    rateLimitPerMinute: rate ? Number(rate) : undefined,
                    monthlyOrderCap: cap ? Number(cap) : undefined,
                    reviewNotes: reviewNotes.trim() || undefined,
                    mintInitialKey,
                    initialKeyName,
                    emailCredentials,
                  },
                );
                onApproved(r);
              } catch (err: any) {
                setError(err.message);
                setSubmitting(false);
              }
            }}
          >
            <ApproveField label="Partner display name">
              <input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} required style={modalInput} />
            </ApproveField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
              <ApproveField label="Slug (optional, auto-generated)">
                <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="kebab-case" style={modalInput} />
              </ApproveField>
              <ApproveField label="Platform">
                <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={modalInput}>
                  <option value="">—</option>
                  <option value="kickstarter">Kickstarter</option>
                  <option value="indiegogo">Indiegogo</option>
                  <option value="backerkit">BackerKit</option>
                  <option value="gamefound">Gamefound</option>
                  <option value="zoop">Zoop</option>
                  <option value="publisher">Publisher</option>
                  <option value="other">Other</option>
                </select>
              </ApproveField>
            </div>
            <ApproveField label="Scopes to grant">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                {['catalog:read', 'pricing:read', 'shipping:read', 'orders:read', 'orders:write'].map((s) => {
                  const on = scopes.includes(s);
                  return (
                    <label
                      key={s}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '.4rem',
                        padding: '.3rem .6rem',
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
                        onChange={(e) =>
                          setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))
                        }
                      />
                      <code>{s}</code>
                    </label>
                  );
                })}
              </div>
            </ApproveField>
            <ApproveField label="Webhook URL (optional, can be set later)">
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://partner.example/webhook"
                style={modalInput}
              />
            </ApproveField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
              <ApproveField label="Rate limit (req/min)">
                <input
                  type="number"
                  min={1}
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="default 300"
                  style={modalInput}
                />
              </ApproveField>
              <ApproveField label="Monthly order cap">
                <input
                  type="number"
                  min={1}
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                  placeholder="unlimited"
                  style={modalInput}
                />
              </ApproveField>
            </div>
            <label style={{ fontSize: '.85rem' }}>
              <input
                type="checkbox"
                checked={mintInitialKey}
                onChange={(e) => setMintInitialKey(e.target.checked)}
              />{' '}
              Mint initial API key now
            </label>
            {mintInitialKey && (
              <ApproveField label="Initial key name">
                <input
                  value={initialKeyName}
                  onChange={(e) => setInitialKeyName(e.target.value)}
                  style={modalInput}
                />
              </ApproveField>
            )}
            <label style={{ fontSize: '.85rem' }}>
              <input
                type="checkbox"
                checked={emailCredentials}
                onChange={(e) => setEmailCredentials(e.target.checked)}
              />{' '}
              Email credentials to {application.contactEmail}
            </label>
            <ApproveField label="Internal review notes">
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={2}
                style={{ ...modalInput, fontFamily: 'inherit' }}
              />
            </ApproveField>
            {error && <div className="error">{error}</div>}
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <button type="submit" className="btn" disabled={submitting || !partnerName.trim()}>
                {submitting ? 'Approving…' : 'Approve & provision partner'}
              </button>
              <button type="button" className="btn secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {tab === 'reject' && isPending && (
          <form
            style={{ marginTop: '.75rem', display: 'grid', gap: '.6rem' }}
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              setError(null);
              try {
                await api.post(`/admin/partners/applications/${application.id}/reject`, {
                  reviewNotes: rejectNotes.trim() || undefined,
                  emailRequester,
                });
                onRejected();
              } catch (err: any) {
                setError(err.message);
                setSubmitting(false);
              }
            }}
          >
            <ApproveField label="Reason / message to requester (optional)">
              <textarea
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                rows={4}
                placeholder="We currently only support fulfillment for printed comics — please reach back out once your project includes a print component."
                style={{ ...modalInput, fontFamily: 'inherit' }}
              />
            </ApproveField>
            <label style={{ fontSize: '.85rem' }}>
              <input
                type="checkbox"
                checked={emailRequester}
                onChange={(e) => setEmailRequester(e.target.checked)}
              />{' '}
              Email rejection notice to {application.contactEmail}
            </label>
            {error && <div className="error">{error}</div>}
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <button type="submit" className="btn" style={{ background: '#b91c1c' }} disabled={submitting}>
                {submitting ? 'Rejecting…' : 'Reject application'}
              </button>
              <button type="button" className="btn secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ReviewDetail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '.75rem', padding: '.4rem 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </div>
      <div>{value}</div>
    </div>
  );
}

function ApproveField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const modalInput: React.CSSProperties = {
  width: '100%',
  padding: '.45rem .55rem',
  border: '1px solid var(--border)',
  borderRadius: 4,
  fontSize: '.9rem',
};

function ApprovalReveal({ result, onDismiss }: { result: ApprovalResult; onDismiss: () => void }) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  return (
    <div
      className="admin-card"
      style={{
        background: '#fff8db',
        border: '1px solid #d97706',
        marginBottom: '1.5rem',
      }}
    >
      <h3 style={{ marginTop: 0, color: '#7a5800' }}>
        Provisioned <Link to={`/admin/partners/${result.partner.id}`}>{result.partner.name}</Link> —
        copy credentials now
      </h3>
      {result.apiKey ? (
        <>
          <p style={{ margin: '0 0 .75rem' }}>
            These secrets are shown <strong>once</strong>. They've been emailed to the requester (if
            you didn't uncheck that box). Copy them now if you need an offline backup.
          </p>
          <SecretLine
            label="API key"
            value={result.apiKey.secret}
            copied={copiedField === 'api'}
            onCopy={() => {
              void navigator.clipboard.writeText(result.apiKey!.secret);
              setCopiedField('api');
              setTimeout(() => setCopiedField(null), 1500);
            }}
          />
          <SecretLine
            label="Signing secret"
            value={result.apiKey.signingSecret}
            copied={copiedField === 'sig'}
            onCopy={() => {
              void navigator.clipboard.writeText(result.apiKey!.signingSecret);
              setCopiedField('sig');
              setTimeout(() => setCopiedField(null), 1500);
            }}
          />
          <p style={{ margin: '.75rem 0 0', fontSize: '.85rem', color: '#7a5800' }}>
            Key: <strong>{result.apiKey.name}</strong> · Prefix: <code>{result.apiKey.prefix}</code> ·
            Scopes: {result.apiKey.scopes.join(', ')}
          </p>
        </>
      ) : (
        <p style={{ margin: 0 }}>
          Partner provisioned without an initial key. Mint one from the partner detail page when
          ready.
        </p>
      )}
      <button className="btn secondary" style={{ marginTop: '.75rem' }} onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

function SecretLine({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div style={{ marginBottom: '.5rem' }}>
      <div style={{ fontSize: '.75rem', fontWeight: 600, color: '#7a5800', marginBottom: 2 }}>{label}</div>
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
