import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';
import { StatusBadge } from '../Account';
import { useToast, useConfirm, errorMessage } from '../../components/admin/ui';
import { useAuth } from '../../store/auth';
import { PERMISSIONS, can, type PermissionKey } from '../../lib/permissions';
import { PermissionPicker, RoleBadge, ago, fullName, type UserRow } from './Users';

/**
 * One account: profile, role and admin areas, status, passwords and
 * sign-in links, addresses, orders, staff notes and the record of what was
 * done to it. Everything saves from here.
 */

interface Address {
  id: string; label?: string | null; firstName: string; lastName: string; company?: string | null; line1: string; line2?: string | null;
  city: string; region: string; postalCode: string; country: string; phone?: string | null; isDefault: boolean;
}
interface UserEvent { id: string; actorEmail?: string | null; action: string; details?: any; ip?: string | null; createdAt: string }
interface UserDetail extends UserRow {
  notes?: string | null; createdBy?: string | null; lastLoginIp?: string | null; updatedAt: string; outstandingResets: number;
  addresses: Address[];
  orders: { id: string; number: string; status: string; paymentStatus: string; totalCents: number; createdAt: string }[];
  partner?: { id: string; slug: string; name: string; status: string; color?: string | null } | null;
  events: UserEvent[];
}

const ACTION_LABEL: Record<string, string> = {
  created: 'Account created', invite_sent: 'Invitation emailed', login: 'Signed in', updated: 'Details changed', role_changed: 'Role changed',
  permissions_changed: 'Admin areas changed', enabled: 'Account enabled', disabled: 'Account disabled', password_set: 'Password set by staff',
  password_reset_sent: 'Password reset link issued', password_reset_used: 'Password reset by the user', sign_in_link: 'Sign-in link issued', signed_out_everywhere: 'Signed out everywhere',
};
function describeEvent(e: UserEvent): string {
  const d = e.details ?? {};
  switch (e.action) {
    case 'login': return `Signed in${d.how === 'link' ? ' with a link' : ''}${e.ip ? ` from ${e.ip}` : ''}`;
    case 'role_changed': return `Role ${d.role?.from ?? '?'} → ${d.role?.to ?? '?'}`;
    case 'permissions_changed': return `Areas: ${(d.permissions?.to ?? []).map((k: string) => PERMISSIONS.find((p) => p.key === k)?.label ?? k).join(', ') || 'none'}`;
    case 'updated': return Object.entries(d).filter(([k]) => k !== 'notes').map(([k, v]: [string, any]) => `${k}: ${v?.from ?? '—'} → ${v?.to ?? '—'}`).join('; ') || 'Notes updated';
    case 'created': return `${d.role ?? ''}${d.invite ? ', invitation emailed' : d.withPassword ? ', password set' : ''}`;
    case 'password_reset_sent': return d.emailed ? 'Emailed to them' : d.copied ? 'Copied by staff' : 'Could not be emailed';
    case 'sign_in_link': return `${d.emailed ? 'Emailed' : 'Copied'} · opens ${d.path ?? '/account'}`;
    case 'password_set': return d.signedOutEverywhere ? 'Other sessions signed out' : '';
    default: return '';
  }
}

export function AdminUserEdit() {
  const toast = useToast(); const confirm = useConfirm();
  const navigate = useNavigate();
  const { id } = useParams();
  const { user: me, load: reloadMe } = useAuth();
  const canManage = can(me, 'users');
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'profile' | 'access' | 'password' | 'addresses' | 'orders' | 'activity'>('profile');

  const load = async () => {
    if (!id) return;
    try { setUser((await api.get<{ user: UserDetail }>(`/admin/users/${id}`)).user); }
    catch (e) { setError(errorMessage(e, 'Could not load the account')); }
  };
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (body: Record<string, unknown>, done?: string) => {
    if (!user) return false;
    try {
      const r = await api.patch<{ user: UserDetail }>(`/admin/users/${user.id}`, body);
      setUser(r.user);
      if (done) toast.success(done);
      if (user.id === me?.id) void reloadMe();
      return true;
    } catch (e) { toast.error(errorMessage(e, 'Could not save')); return false; }
  };

  const stats = useMemo(() => {
    if (!user) return null;
    const completed = user.orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'REFUNDED');
    const lifetime = completed.reduce((s, o) => s + o.totalCents, 0);
    return { orderCount: completed.length, lifetime, avg: completed.length ? Math.round(lifetime / completed.length) : 0, lastOrder: user.orders[0]?.createdAt ?? null };
  }, [user]);

  if (error) return <div className="error">{error}</div>;
  if (!user || !stats) return <div>Loading…</div>;
  const isMe = user.id === me?.id;

  const remove = async () => {
    if (!(await confirm({ title: `Delete ${user.email}?`, body: `The account, its addresses and activity are removed. ${user.orderCount ? `Its ${user.orderCount} order(s) stay on file under the email address.` : ''} This cannot be undone.`, confirmLabel: 'Delete account', danger: true }))) return;
    try {
      await api.del(`/admin/users/${user.id}`);
      toast.success(`Deleted ${user.email}.`);
      navigate('/admin/users');
    } catch (e) { toast.error(errorMessage(e, 'Could not delete')); }
  };

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}><Link to="/admin/users" className="admin-back">← Users &amp; access</Link></div>
      <div className="spread" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>{fullName(user) || user.email}</h1>
          <div className="muted" style={{ fontSize: '.9rem' }}>
            {user.email} · <RoleBadge role={user.role} active={user.active} />
            {isMe && <span className="badge" style={{ marginLeft: '.35rem' }}>you</span>}
            {user.partner && <> · <Link to={`/admin/partners/${user.partner.id}`}>Partner: {user.partner.name}</Link></>}
          </div>
        </div>
        <div className="muted" style={{ fontSize: '.85rem', textAlign: 'right' }}>
          Last sign-in {ago(user.lastLoginAt)}{user.lastLoginIp ? ` · ${user.lastLoginIp}` : ''}<br />
          Joined {new Date(user.createdAt).toLocaleDateString()}{user.createdBy ? ` · created by ${user.createdBy}` : ''}
        </div>
      </div>

      {!user.active && <div className="error">This account is disabled: it cannot sign in and its sessions no longer work.</div>}
      {!user.hasPassword && <div className="ship-status" style={{ marginBottom: '1rem' }}>This account has never set a password (it was created at checkout or by invitation). It signs in through emailed links until it chooses one — send a set-password link from the Password tab.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <Stat label="Orders" value={String(stats.orderCount)} />
        <Stat label="Lifetime spend" value={formatMoney(stats.lifetime)} />
        <Stat label="Avg order" value={formatMoney(stats.avg)} />
        <Stat label="Last order" value={stats.lastOrder ? new Date(stats.lastOrder).toLocaleDateString() : '—'} />
      </div>

      <div className="admin-card" style={{ padding: 0, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 .5rem', overflowX: 'auto' }}>
          {([['profile', 'Profile'], ['access', 'Role & access'], ['password', 'Password & sign-in'], ['addresses', `Addresses (${user.addresses.length})`], ['orders', `Orders (${user.orders.length})`], ['activity', 'Activity']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)} data-testid={`tab-${k}`} style={{ padding: '.85rem 1rem', background: 'transparent', border: 'none', borderBottom: tab === k ? '3px solid var(--brand)' : '3px solid transparent', color: tab === k ? 'var(--brand)' : 'var(--ink)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
          ))}
        </div>
      </div>

      {tab === 'profile' && <ProfileTab user={user} canManage={canManage} onSave={patch} />}
      {tab === 'access' && <AccessTab user={user} isMe={isMe} canManage={canManage} onSave={patch} onDelete={remove} onReload={load} />}
      {tab === 'password' && <PasswordTab user={user} canManage={canManage} onReload={load} />}
      {tab === 'addresses' && <AddressesTab user={user} />}
      {tab === 'orders' && <OrdersTab user={user} />}
      {tab === 'activity' && <ActivityTab user={user} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-card" style={{ margin: 0, padding: '1rem' }}>
      <div style={{ fontSize: '.7rem', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '.25rem' }}>{value}</div>
    </div>
  );
}

function ProfileTab({ user, canManage, onSave }: { user: UserDetail; canManage: boolean; onSave: (body: Record<string, unknown>, done?: string) => Promise<boolean> }) {
  const [form, setForm] = useState({ email: user.email, firstName: user.firstName ?? '', lastName: user.lastName ?? '', phone: user.phone ?? '', notes: user.notes ?? '' });
  useEffect(() => { setForm({ email: user.email, firstName: user.firstName ?? '', lastName: user.lastName ?? '', phone: user.phone ?? '', notes: user.notes ?? '' }); }, [user]);
  const dirty = form.email !== user.email || form.firstName !== (user.firstName ?? '') || form.lastName !== (user.lastName ?? '') || form.phone !== (user.phone ?? '') || form.notes !== (user.notes ?? '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    await onSave({ email: form.email.trim(), firstName: form.firstName, lastName: form.lastName, phone: form.phone, notes: form.notes }, 'Profile saved.');
    setSaving(false);
  };
  return (
    <div className="admin-card">
      <h3 style={{ marginTop: 0 }}>Profile</h3>
      <div className="grid-2">
        <div><label htmlFor="u-first">First name</label><input id="u-first" value={form.firstName} disabled={!canManage} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
        <div><label htmlFor="u-last">Last name</label><input id="u-last" value={form.lastName} disabled={!canManage} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
      </div>
      <div className="grid-2">
        <div><label htmlFor="u-email">Email (sign-in)</label><input id="u-email" type="email" value={form.email} disabled={!canManage} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><label htmlFor="u-phone">Phone</label><input id="u-phone" type="tel" value={form.phone} disabled={!canManage} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
      </div>
      <label htmlFor="u-notes">Notes <span className="muted" style={{ fontWeight: 400 }}>(staff only — never shown to the customer)</span></label>
      <textarea id="u-notes" rows={3} value={form.notes} disabled={!canManage} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      {canManage && (
        <div className="row" style={{ marginTop: '.75rem', gap: '.5rem' }}>
          <button type="button" className="btn" disabled={!dirty || saving} onClick={() => void save()} data-testid="profile-save">{saving ? 'Saving…' : 'Save profile'}</button>
          {dirty && <button type="button" className="btn secondary" onClick={() => setForm({ email: user.email, firstName: user.firstName ?? '', lastName: user.lastName ?? '', phone: user.phone ?? '', notes: user.notes ?? '' })}>Discard</button>}
        </div>
      )}
      {!canManage && <p className="muted" style={{ fontSize: '.85rem' }}>You can see this account but only an admin can change it.</p>}
    </div>
  );
}

function AccessTab({ user, isMe, canManage, onSave, onDelete, onReload }: { user: UserDetail; isMe: boolean; canManage: boolean; onSave: (body: Record<string, unknown>, done?: string) => Promise<boolean>; onDelete: () => void; onReload: () => Promise<void> }) {
  const toast = useToast(); const confirm = useConfirm();
  const [role, setRole] = useState(user.role);
  const [perms, setPerms] = useState<string[]>(user.grantedPermissions ?? []);
  useEffect(() => { setRole(user.role); setPerms(user.grantedPermissions ?? []); }, [user]);
  const dirty = role !== user.role || JSON.stringify([...perms].sort()) !== JSON.stringify([...(user.grantedPermissions ?? [])].sort());

  const save = async () => {
    if (role === 'ADMIN' && user.role !== 'ADMIN' && !(await confirm({ title: `Make ${user.email} an admin?`, body: 'Admins can see and change everything here: orders, payments, settings, every other account.', confirmLabel: 'Make admin', danger: true }))) return;
    await onSave({ role, permissions: role === 'STAFF' ? perms : undefined }, 'Access saved.');
  };
  const setActive = async (active: boolean) => {
    if (!active && !(await confirm({ title: `Disable ${user.email}?`, body: 'They are signed out everywhere and cannot sign in until the account is enabled again. Orders and history stay.', confirmLabel: 'Disable', danger: true }))) return;
    await onSave({ active }, active ? 'Account enabled.' : 'Account disabled.');
  };
  const signOut = async () => {
    try { await api.post(`/admin/users/${user.id}/sign-out`); toast.success('Signed out of every device. They can sign in again.'); await onReload(); }
    catch (e) { toast.error(errorMessage(e, 'Could not sign them out')); }
  };

  return (
    <>
      <div className="admin-card">
        <h3 style={{ marginTop: 0 }}>Role</h3>
        <div className="role-options">
          {([['CUSTOMER', 'Customer', 'Shops, sees their own orders, proofs and files. No admin access.'], ['STAFF', 'Staff', 'Uses the admin areas ticked below and nothing else.'], ['ADMIN', 'Admin', 'Everything, including accounts, permissions and settings.']] as const).map(([k, label, desc]) => (
            <label key={k} className={`role-option${role === k ? ' on' : ''}`}>
              <input type="radio" name="role" value={k} checked={role === k} disabled={!canManage || (isMe && user.role === 'ADMIN')} onChange={() => setRole(k)} />
              <span><strong>{label}</strong><span className="muted" style={{ display: 'block', fontSize: '.82rem' }}>{desc}</span></span>
            </label>
          ))}
        </div>
        {role === 'STAFF' && <div style={{ marginTop: '1rem' }}><PermissionPicker value={perms} onChange={setPerms} disabled={!canManage} /></div>}
        {role === 'ADMIN' && <p className="muted" style={{ fontSize: '.85rem', marginTop: '.75rem' }}>Admins have every area: {PERMISSIONS.map((p) => p.label).join(', ')}.</p>}
        {isMe && user.role === 'ADMIN' && <p className="muted" style={{ fontSize: '.85rem' }}>You cannot change your own role; ask another admin.</p>}
        {canManage && (
          <div className="row" style={{ marginTop: '1rem', gap: '.5rem' }}>
            <button type="button" className="btn" disabled={!dirty} onClick={() => void save()} data-testid="access-save">Save access</button>
            {dirty && <button type="button" className="btn secondary" onClick={() => { setRole(user.role); setPerms(user.grantedPermissions ?? []); }}>Discard</button>}
          </div>
        )}
      </div>

      {canManage && (
        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>Status &amp; sessions</h3>
          <div className="row" style={{ gap: '.5rem', flexWrap: 'wrap' }}>
            {user.active
              ? <button type="button" className="btn secondary" disabled={isMe} onClick={() => void setActive(false)} data-testid="disable">Disable account</button>
              : <button type="button" className="btn" onClick={() => void setActive(true)} data-testid="enable">Enable account</button>}
            <button type="button" className="btn secondary" onClick={() => void signOut()} data-testid="sign-out-everywhere">Sign out everywhere</button>
          </div>
          <p className="muted" style={{ fontSize: '.85rem', marginBottom: 0 }}>Disabling keeps the account and its orders but refuses sign-in. "Sign out everywhere" ends every open session on every device; they can sign in again normally.{isMe ? ' You cannot disable your own account.' : ''}</p>
        </div>
      )}

      {canManage && !isMe && (
        <div className="admin-card" style={{ borderColor: '#fecaca' }}>
          <h3 style={{ marginTop: 0, color: '#991b1b' }}>Delete account</h3>
          <p className="muted" style={{ fontSize: '.85rem' }}>Removes the account, its addresses and activity. Orders stay on file under the email address. Prefer disabling if there is any chance they come back.</p>
          <button type="button" className="btn secondary danger" onClick={onDelete} data-testid="delete-user">Delete this account</button>
        </div>
      )}
    </>
  );
}

function PasswordTab({ user, canManage, onReload }: { user: UserDetail; canManage: boolean; onReload: () => Promise<void> }) {
  const toast = useToast(); const confirm = useConfirm();
  const [password, setPassword] = useState('');
  const [signOut, setSignOut] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ kind: 'reset' | 'sign-in'; link: string; sent: boolean } | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } catch (e) { toast.error(errorMessage(e, 'That did not work')); } finally { setBusy(null); } };
  const setPw = () => run('set', async () => {
    if (!(await confirm({ title: `Set a new password for ${user.email}?`, body: signOut ? 'Their other sessions are signed out; they sign in with the new password.' : 'Their open sessions keep working.', confirmLabel: 'Set password' }))) return;
    await api.post(`/admin/users/${user.id}/password`, { password, signOutEverywhere: signOut });
    setPassword(''); toast.success('Password set.'); await onReload();
  });
  const sendReset = (send: boolean) => run(send ? 'reset-send' : 'reset-copy', async () => {
    const r = await api.post<{ link: string; sent: boolean }>(`/admin/users/${user.id}/password-reset`, { send });
    setIssued({ kind: 'reset', link: r.link, sent: r.sent });
    toast.success(send ? (r.sent ? `Reset link emailed to ${user.email}.` : 'The email could not be sent — the link is below to copy.') : 'Reset link ready to copy (valid 1 hour).');
    await onReload();
  });
  const signInLink = (send: boolean) => run(send ? 'link-send' : 'link-copy', async () => {
    const r = await api.post<{ link: string; sent: boolean }>(`/admin/users/${user.id}/sign-in-link`, { send, path: '/account' });
    setIssued({ kind: 'sign-in', link: r.link, sent: r.sent });
    toast.success(send ? (r.sent ? `Sign-in link emailed to ${user.email}.` : 'The email could not be sent — the link is below to copy.') : 'Sign-in link ready to copy (valid 14 days).');
    await onReload();
  });
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success('Copied.'); } catch { toast.error('Could not copy — select the link and copy it.'); } };

  if (!canManage) return <div className="admin-card"><p className="muted" style={{ margin: 0 }}>Only an admin can set passwords or issue links.</p></div>;
  return (
    <>
      <div className="admin-card">
        <h3 style={{ marginTop: 0 }}>Reset their password</h3>
        <p className="muted" style={{ fontSize: '.85rem' }}>Emails them a link to choose a new password (good for 1 hour){user.hasPassword ? '' : ' — for this account it reads as "finish setting up your account"'}. Or get the link to read out or paste into a message.{user.outstandingResets ? ` ${user.outstandingResets} unused link${user.outstandingResets === 1 ? '' : 's'} outstanding.` : ''}</p>
        <div className="row" style={{ gap: '.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn" disabled={!!busy} onClick={() => void sendReset(true)} data-testid="reset-send">Email a reset link</button>
          <button type="button" className="btn secondary" disabled={!!busy} onClick={() => void sendReset(false)} data-testid="reset-copy">Get a link to copy</button>
        </div>
      </div>
      <div className="admin-card">
        <h3 style={{ marginTop: 0 }}>Sign-in link</h3>
        <p className="muted" style={{ fontSize: '.85rem' }}>A one-click link that opens their account without a password (good for 14 days) — handy for a customer who cannot get in, or to walk them to their proofs.</p>
        <div className="row" style={{ gap: '.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn" disabled={!!busy || !user.active} onClick={() => void signInLink(true)} data-testid="link-send">Email a sign-in link</button>
          <button type="button" className="btn secondary" disabled={!!busy || !user.active} onClick={() => void signInLink(false)} data-testid="link-copy">Get a link to copy</button>
        </div>
      </div>
      {issued && (
        <div className="admin-card" style={{ background: 'var(--bg-alt)' }} data-testid="issued-link">
          <strong>{issued.kind === 'reset' ? 'Password reset link' : 'Sign-in link'}</strong> {issued.sent ? '— emailed, and here to copy:' : '— copy and send it yourself:'}
          <div className="row" style={{ gap: '.5rem', marginTop: '.4rem' }}>
            <input readOnly value={issued.link} onFocus={(e) => e.currentTarget.select()} style={{ margin: 0, fontSize: '.85rem' }} />
            <button type="button" className="btn secondary sm" onClick={() => void copy(issued.link)}>Copy</button>
          </div>
        </div>
      )}
      <div className="admin-card">
        <h3 style={{ marginTop: 0 }}>Set a password yourself</h3>
        <p className="muted" style={{ fontSize: '.85rem' }}>For when you are on the phone with them. Tell them to change it once they are in.</p>
        <div className="row" style={{ gap: '.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 260px' }}>
            <label htmlFor="u-newpw" style={{ marginTop: 0 }}>New password (8+ characters)</label>
            <input id="u-newpw" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ margin: 0 }} />
          </div>
          <button type="button" className="btn" disabled={password.length < 8 || !!busy} onClick={() => void setPw()} data-testid="password-set">Set password</button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: 500, marginTop: '.6rem' }}>
          <input type="checkbox" checked={signOut} onChange={(e) => setSignOut(e.target.checked)} /> Sign them out everywhere else
        </label>
      </div>
    </>
  );
}

function AddressesTab({ user }: { user: UserDetail }) {
  return (
    <div className="admin-card">
      <div className="spread"><h3 style={{ margin: 0 }}>Addresses</h3><span className="muted">{user.addresses.length} on file</span></div>
      {user.addresses.length === 0 ? <p className="muted">No saved addresses. (Order addresses are on each order.)</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginTop: '.75rem' }}>
          {user.addresses.map((a) => (
            <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '.75rem', background: '#fff' }}>
              <div style={{ fontWeight: 700 }}>{a.label ?? 'Address'}{a.isDefault && <span className="badge" style={{ marginLeft: '.5rem' }}>Default</span>}</div>
              <div style={{ whiteSpace: 'pre-line', fontSize: '.9rem', marginTop: '.35rem' }}>
                {a.firstName} {a.lastName}{'\n'}{a.company && `${a.company}\n`}{a.line1}{a.line2 ? `, ${a.line2}` : ''}{'\n'}{a.city}, {a.region} {a.postalCode}{'\n'}{a.country}{a.phone && <>{'\n'}{a.phone}</>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OrdersTab({ user }: { user: UserDetail }) {
  return (
    <div className="admin-card">
      <div className="spread"><h3 style={{ margin: 0 }}>Orders</h3><span className="muted">{user.orders.length} placed{user.orders.length === 50 ? ' (latest 50)' : ''}</span></div>
      {user.orders.length === 0 ? <p className="muted">No orders placed.</p> : (
        <table className="admin-table" style={{ marginTop: '.75rem' }}>
          <thead><tr><th>Number</th><th>Placed</th><th>Status</th><th>Payment</th><th>Total</th></tr></thead>
          <tbody>
            {user.orders.map((o) => (
              <tr key={o.id}>
                <td><Link to={`/admin/orders/${o.id}`}>{o.number}</Link></td>
                <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                <td><StatusBadge status={o.status} /></td>
                <td><span className="badge">{o.paymentStatus}</span></td>
                <td>{formatMoney(o.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ActivityTab({ user }: { user: UserDetail }) {
  return (
    <div className="admin-card" data-testid="activity">
      <h3 style={{ marginTop: 0 }}>Activity</h3>
      {user.events.length === 0 ? <p className="muted">Nothing recorded yet.</p> : (
        <table className="admin-table">
          <thead><tr><th>When</th><th>What</th><th>Details</th><th>By</th></tr></thead>
          <tbody>
            {user.events.map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.createdAt).toLocaleString()}</td>
                <td>{ACTION_LABEL[e.action] ?? e.action}</td>
                <td className="muted" style={{ fontSize: '.85rem' }}>{describeEvent(e)}</td>
                <td className="muted" style={{ fontSize: '.85rem' }}>{e.actorEmail ?? (e.action === 'login' || e.action === 'password_reset_used' ? 'them' : '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export { type PermissionKey };
