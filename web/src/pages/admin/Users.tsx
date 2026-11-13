import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader, TableState, errorMessage, rowClick, useDebounced, useToast } from '../../components/admin/ui';
import { useAuth } from '../../store/auth';
import { PERMISSIONS, STAFF_GRANTABLE, can, type PermissionKey } from '../../lib/permissions';

/**
 * Accounts — customers, staff and admins — in one list with search, role and
 * status filters, sorting and paging; and a form to create one (with a
 * password, or an emailed invitation to choose one). Opening a row goes to
 * the account page, where everything about it can be changed.
 */

export interface UserRow {
  id: string; email: string; firstName?: string | null; lastName?: string | null; phone?: string | null;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN'; permissions: string[]; grantedPermissions: string[]; active: boolean; hasPassword: boolean;
  lastLoginAt?: string | null; createdAt: string; orderCount: number;
  partner?: { id: string; slug: string; name: string; color?: string | null } | null;
}
interface Meta {
  counts: { all: number; customers: number; staff: number; admins: number; disabled: number; noPassword: number };
  partners: { id: string; name: string; color?: string | null }[];
}

export const ROLE_LABEL: Record<string, string> = { CUSTOMER: 'Customer', STAFF: 'Staff', ADMIN: 'Admin' };
export const fullName = (u: { firstName?: string | null; lastName?: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(' ');
export const ago = (iso?: string | null) => {
  if (!iso) return 'never';
  const d = new Date(iso); const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return `today ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString();
};

export function RoleBadge({ role, active }: { role: string; active?: boolean }) {
  const color = role === 'ADMIN' ? '#7c2d12' : role === 'STAFF' ? '#1e3a8a' : '#374151';
  const bg = role === 'ADMIN' ? '#ffedd5' : role === 'STAFF' ? '#dbeafe' : 'var(--bg-alt)';
  return (
    <span className="row" style={{ gap: '.3rem', display: 'inline-flex' }}>
      <span className="badge" style={{ background: bg, color }}>{ROLE_LABEL[role] ?? role}</span>
      {active === false && <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>Disabled</span>}
    </span>
  );
}

type RoleTab = 'all' | 'CUSTOMER' | 'team' | 'STAFF' | 'ADMIN';

export function AdminUsers({ mode = 'all' }: { mode?: 'all' | 'customers' }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { user: me } = useAuth();
  const canManage = can(me, 'users');

  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const [roleTab, setRoleTab] = useState<RoleTab>(mode === 'customers' ? 'CUSTOMER' : 'all');
  const [status, setStatus] = useState<'all' | 'active' | 'disabled' | 'no-password'>('all');
  const [partner, setPartner] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => { void api.get<Meta>('/admin/users/meta').then(setMeta).catch(() => undefined); }, [tick]);
  useEffect(() => { setPage(1); }, [query, roleTab, status, partner, sort]);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    const params = new URLSearchParams({ sort, page: String(page), pageSize: String(pageSize) });
    if (query) params.set('q', query);
    if (roleTab !== 'all') params.set('role', roleTab);
    if (status !== 'all') params.set('status', status);
    if (partner !== 'all') params.set('partner', partner);
    api.get<{ users: UserRow[]; total: number }>(`/admin/users?${params}`)
      .then((r) => { if (alive) { setUsers(r.users); setTotal(r.total); } })
      .catch((e) => { if (alive) setError(errorMessage(e, 'Could not load accounts')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [query, roleTab, status, partner, sort, page, tick]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const tabs: { key: RoleTab; label: string; count?: number }[] = mode === 'customers'
    ? [{ key: 'CUSTOMER', label: 'Customers', count: meta?.counts.customers }, { key: 'all', label: 'Everyone', count: meta?.counts.all }]
    : [
      { key: 'all', label: 'Everyone', count: meta?.counts.all },
      { key: 'CUSTOMER', label: 'Customers', count: meta?.counts.customers },
      { key: 'team', label: 'Team', count: meta ? meta.counts.staff + meta.counts.admins : undefined },
      { key: 'STAFF', label: 'Staff', count: meta?.counts.staff },
      { key: 'ADMIN', label: 'Admins', count: meta?.counts.admins },
    ];

  return (
    <div>
      <PageHeader
        title={mode === 'customers' ? 'Customers' : 'Users & access'}
        subtitle={!loading && !error ? `${total.toLocaleString()} account${total === 1 ? '' : 's'}${meta?.counts.disabled ? ` · ${meta.counts.disabled} disabled` : ''}${meta?.counts.noPassword ? ` · ${meta.counts.noPassword} never set a password` : ''}` : undefined}
        actions={canManage ? <button type="button" className="btn" onClick={() => setCreating((v) => !v)} data-testid="user-new">{creating ? 'Cancel' : '+ New account'}</button> : undefined}
      />

      {creating && canManage && (
        <CreateUserCard
          partners={meta?.partners ?? []}
          onCreated={(u, invite) => {
            setCreating(false); setTick((t) => t + 1);
            toast.success(invite ? (invite.sent ? `Account created — invitation emailed to ${u.email}.` : `Account created. The invitation could not be emailed; copy the link from the account page.`) : `Account created for ${u.email}.`);
            navigate(`/admin/users/${u.id}`);
          }}
        />
      )}

      <div className="admin-card">
        <div className="row" style={{ gap: '.35rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
          {tabs.map((t) => (
            <button key={t.key} type="button" className={roleTab === t.key ? 'btn sm' : 'btn secondary sm'} onClick={() => setRoleTab(t.key)}>
              {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 260px' }}>
            <label htmlFor="users-q">Search</label>
            <input id="users-q" type="search" placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          <div>
            <label htmlFor="users-status">Status</label>
            <select id="users-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="all">Any</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
              <option value="no-password">Never set a password</option>
            </select>
          </div>
          <div>
            <label htmlFor="users-partner">Partner</label>
            <select id="users-partner" value={partner} onChange={(e) => setPartner(e.target.value)}>
              <option value="all">Any</option>
              <option value="none">Direct customers</option>
              <option value="any">Partner contacts</option>
              {(meta?.partners ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="users-sort">Sort</label>
            <select id="users-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">Name</option>
              <option value="email">Email</option>
              <option value="last-login">Last sign-in</option>
              <option value="orders">Most orders</option>
            </select>
          </div>
          {(q || status !== 'all' || partner !== 'all' || sort !== 'newest') && (
            <button type="button" className="btn secondary sm" onClick={() => { setQ(''); setStatus('all'); setPartner('all'); setSort('newest'); }}>Clear</button>
          )}
        </div>
      </div>

      <div className="admin-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-table" data-testid="users-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th>Orders</th><th>Last sign-in</th><th>Joined</th></tr></thead>
          <tbody>
            <TableState loading={loading} error={error} count={users.length} colSpan={7} empty={query || status !== 'all' || partner !== 'all' ? 'No accounts match.' : 'No accounts yet.'} />
            {!loading && !error && users.map((u) => (
              <tr key={u.id} className="clickable" onClick={rowClick(() => navigate(`/admin/users/${u.id}`))} style={u.active ? undefined : { opacity: .6 }}>
                <td>
                  <Link to={`/admin/users/${u.id}`} style={{ fontWeight: 600 }}>{fullName(u) || <span className="muted">(no name)</span>}</Link>
                  {u.partner && (
                    <div style={{ fontSize: '.78rem' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: u.partner.color ?? '#94a3b8', marginRight: 4 }} />
                      {u.partner.name}
                    </div>
                  )}
                </td>
                <td style={{ overflowWrap: 'anywhere' }}>{u.email}{!u.hasPassword && <div className="muted" style={{ fontSize: '.75rem' }}>no password yet</div>}</td>
                <td><RoleBadge role={u.role} active={u.active} /></td>
                <td style={{ fontSize: '.8rem', maxWidth: 260 }}>
                  {u.role === 'ADMIN' ? <span className="muted">Everything</span>
                    : u.role === 'STAFF' ? (u.permissions.length === 0 ? <span style={{ color: '#b45309' }}>Nothing yet</span> : u.permissions.length === STAFF_GRANTABLE.length ? 'All areas' : u.permissions.map((k) => PERMISSIONS.find((p) => p.key === (k as PermissionKey))?.label ?? k).join(', '))
                    : <span className="muted">—</span>}
                </td>
                <td>{u.orderCount}</td>
                <td className="muted" style={{ fontSize: '.85rem' }}>{ago(u.lastLoginAt)}</td>
                <td title={new Date(u.createdAt).toLocaleString()}>{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {pages > 1 && (
          <div className="spread" style={{ padding: '.6rem 1rem', borderTop: '1px solid var(--border)', fontSize: '.85rem' }}>
            <span className="muted">Page {page} of {pages}</span>
            <div className="row" style={{ gap: '.4rem' }}>
              <button type="button" className="btn secondary sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Previous</button>
              <button type="button" className="btn secondary sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateUserCard({ partners, onCreated }: { partners: { id: string; name: string }[]; onCreated: (u: UserRow, invite: { sent: boolean } | null) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', phone: '', role: 'CUSTOMER' as 'CUSTOMER' | 'STAFF' | 'ADMIN', partnerId: '', notes: '' });
  const [permissions, setPermissions] = useState<string[]>([]);
  const [how, setHow] = useState<'invite' | 'password'>('invite');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const emailOk = /.+@.+\..+/.test(form.email.trim());
  const canCreate = emailOk && (how === 'invite' || password.length >= 8) && !busy;

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ user: UserRow; invite: { link: string; sent: boolean } | null }>('/admin/users', {
        email: form.email.trim(), firstName: form.firstName || undefined, lastName: form.lastName || undefined, phone: form.phone || undefined,
        role: form.role, permissions: form.role === 'STAFF' ? permissions : undefined, partnerId: form.partnerId || null, notes: form.notes || undefined,
        password: how === 'password' ? password : undefined, sendInvite: how === 'invite',
      });
      onCreated(r.user, r.invite);
    } catch (e) { toast.error(errorMessage(e, 'Could not create the account')); }
    finally { setBusy(false); }
  };

  return (
    <div className="admin-card" data-testid="user-create">
      <h3 style={{ marginTop: 0 }}>New account</h3>
      <div className="grid-2">
        <div><label htmlFor="nu-email">Email</label><input id="nu-email" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><label htmlFor="nu-phone">Phone</label><input id="nu-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
      </div>
      <div className="grid-2">
        <div><label htmlFor="nu-first">First name</label><input id="nu-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
        <div><label htmlFor="nu-last">Last name</label><input id="nu-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
      </div>
      <div className="grid-2">
        <div>
          <label htmlFor="nu-role">Role</label>
          <select id="nu-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}>
            <option value="CUSTOMER">Customer — shops and sees their own orders</option>
            <option value="STAFF">Staff — the admin areas ticked below</option>
            <option value="ADMIN">Admin — everything, including users and settings</option>
          </select>
        </div>
        <div>
          <label htmlFor="nu-partner">Partner contact (optional)</label>
          <select id="nu-partner" value={form.partnerId} onChange={(e) => setForm({ ...form, partnerId: e.target.value })}>
            <option value="">— none —</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      {form.role === 'STAFF' && <PermissionPicker value={permissions} onChange={setPermissions} />}
      <label style={{ marginTop: '.75rem' }}>How do they get in?</label>
      <div className="row" style={{ gap: '1rem', flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 500, margin: 0, display: 'flex', alignItems: 'center', gap: '.4rem' }}><input type="radio" name="nu-how" checked={how === 'invite'} onChange={() => setHow('invite')} /> Email them an invitation to choose a password</label>
        <label style={{ fontWeight: 500, margin: 0, display: 'flex', alignItems: 'center', gap: '.4rem' }}><input type="radio" name="nu-how" checked={how === 'password'} onChange={() => setHow('password')} /> Set a password now</label>
      </div>
      {how === 'password' && (
        <div style={{ maxWidth: 360 }}>
          <label htmlFor="nu-password">Password (8+ characters)</label>
          <input id="nu-password" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      )}
      <label htmlFor="nu-notes">Notes (staff only)</label>
      <textarea id="nu-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      <div className="row" style={{ marginTop: '.75rem' }}>
        <button type="button" className="btn" disabled={!canCreate} onClick={() => void create()} data-testid="user-create-submit">{busy ? 'Creating…' : 'Create account'}</button>
      </div>
    </div>
  );
}

/** The admin areas a staff account may use. */
export function PermissionPicker({ value, onChange, disabled }: { value: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const toggle = (k: string) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  const all = STAFF_GRANTABLE.every((k) => value.includes(k));
  return (
    <div className="perm-picker" data-testid="permission-picker">
      <div className="spread" style={{ marginBottom: '.4rem' }}>
        <label style={{ margin: 0 }}>Admin areas</label>
        <span className="row" style={{ gap: '.4rem' }}>
          <button type="button" className="btn secondary sm" disabled={disabled} title="Distribution + Preflight only: the account lives in /admin/pod and sees nothing else of the admin" onClick={() => onChange(['pod', 'preflight'])} data-testid="preset-pod-admin">Distribution admin</button>
          <button type="button" className="btn secondary sm" disabled={disabled} onClick={() => onChange(all ? [] : [...STAFF_GRANTABLE])}>{all ? 'Clear all' : 'Select all'}</button>
        </span>
      </div>
      {value.length > 0 && value.every((k) => k === 'pod' || k === 'preflight') && (
        <p className="muted" style={{ fontSize: '.82rem', margin: '0 0 .5rem' }}>Distribution admin: this account opens straight into Distribution and the rest of the admin is hidden from it.</p>
      )}
      <div className="perm-grid">
        {PERMISSIONS.filter((p) => p.key !== 'users').map((p) => (
          <label key={p.key} className={`perm-item${value.includes(p.key) ? ' on' : ''}`}>
            <input type="checkbox" disabled={disabled} checked={value.includes(p.key)} onChange={() => toggle(p.key)} />
            <span><strong>{p.label}</strong><span className="muted" style={{ display: 'block', fontSize: '.8rem', fontWeight: 400 }}>{p.description}</span></span>
          </label>
        ))}
      </div>
    </div>
  );
}
