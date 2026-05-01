import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';
import { StatusBadge } from '../Account';

interface Address {
  id: string;
  label?: string | null;
  firstName: string;
  lastName: string;
  company?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone?: string | null;
  isDefault: boolean;
}

interface UserDetail {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  createdAt: string;
  addresses: Address[];
  orders: { id: string; number: string; status: string; totalCents: number; createdAt: string }[];
  partner?: { id: string; slug: string; name: string; status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED'; color?: string | null } | null;
}

export function AdminUserDetail() {
  const { id } = useParams();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!id) return;
    const r = await api.get<{ user: UserDetail }>(`/admin/users/${id}`);
    setUser(r.user);
  };
  useEffect(() => { void load(); }, [id]);

  const updateField = async (field: keyof UserDetail, value: any) => {
    if (!user) return;
    setSaving(true);
    try {
      await api.patch(`/admin/users/${user.id}`, { [field]: value });
      load();
    } finally { setSaving(false); }
  };

  const resetPassword = async () => {
    if (!user || !newPassword || newPassword.length < 8) return;
    if (!confirm(`Reset password for ${user.email}? Any existing sessions will keep working until their JWT expires.`)) return;
    setSaving(true);
    try {
      await api.patch(`/admin/users/${user.id}`, { newPassword });
      setNewPassword('');
      alert('Password reset.');
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const stats = useMemo(() => {
    if (!user) return null;
    const completed = user.orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'REFUNDED');
    const lifetime = completed.reduce((s, o) => s + o.totalCents, 0);
    const lastOrder = user.orders[0]?.createdAt ?? null;
    return {
      orderCount: completed.length,
      lifetime,
      avg: completed.length ? Math.round(lifetime / completed.length) : 0,
      lastOrder,
    };
  }, [user]);

  if (!user || !stats) return <div>Loading…</div>;

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/admin/customers">← Back to Customers</Link>
      </div>
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>{user.firstName || user.lastName ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : user.email}</h1>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          {user.partner && (
            <Link
              to={`/admin/partners/${user.partner.id}`}
              className="badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '.35rem',
                background: user.partner.color ? `${user.partner.color}1a` : 'var(--bg-alt)',
                color: 'inherit',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: user.partner.color ?? '#94a3b8',
                }}
              />
              Partner: {user.partner.name}
            </Link>
          )}
          <span className="badge">{user.role}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <Stat label="Orders" value={String(stats.orderCount)} />
        <Stat label="Lifetime spend" value={formatMoney(stats.lifetime)} />
        <Stat label="Avg order" value={formatMoney(stats.avg)} />
        <Stat label="Last order" value={stats.lastOrder ? new Date(stats.lastOrder).toLocaleDateString() : '—'} />
      </div>

      <div className="admin-card">
        <h3>Profile</h3>
        <div className="grid-2">
          <div>
            <label>Email</label>
            <input value={user.email} readOnly />
          </div>
          <div>
            <label>Role</label>
            <select value={user.role} onChange={(e) => updateField('role', e.target.value)}>
              <option value="CUSTOMER">CUSTOMER</option>
              <option value="STAFF">STAFF</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div>
            <label>First name</label>
            <input
              defaultValue={user.firstName ?? ''}
              onBlur={(e) => updateField('firstName', e.target.value)}
            />
          </div>
          <div>
            <label>Last name</label>
            <input
              defaultValue={user.lastName ?? ''}
              onBlur={(e) => updateField('lastName', e.target.value)}
            />
          </div>
        </div>
        <label>Phone</label>
        <input
          defaultValue={user.phone ?? ''}
          onBlur={(e) => updateField('phone', e.target.value)}
        />
        <div className="muted" style={{ fontSize: '.85rem', marginTop: '.5rem' }}>
          Joined {new Date(user.createdAt).toLocaleDateString()}
        </div>
      </div>

      <div className="admin-card">
        <h3>Password</h3>
        <p className="muted" style={{ fontSize: '.85rem' }}>
          Reset lets you send the customer a new temporary password out-of-band.
        </p>
        <div className="row">
          <input
            type="password"
            placeholder="New password (min 8 chars)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
          />
          <button className="btn" onClick={resetPassword} disabled={!newPassword || newPassword.length < 8 || saving}>
            Reset password
          </button>
        </div>
      </div>

      <div className="admin-card">
        <div className="spread"><h3 style={{ margin: 0 }}>Addresses</h3><span className="muted">{user.addresses.length} on file</span></div>
        {user.addresses.length === 0 ? (
          <p className="muted">No addresses on file.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {user.addresses.map((a) => (
              <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '.75rem', background: '#fff' }}>
                <div style={{ fontWeight: 700 }}>
                  {a.label ?? 'Address'}
                  {a.isDefault && <span className="badge" style={{ marginLeft: '.5rem' }}>Default</span>}
                </div>
                <div style={{ whiteSpace: 'pre-line', fontSize: '.9rem', marginTop: '.35rem' }}>
                  {a.firstName} {a.lastName}{'\n'}
                  {a.company && `${a.company}\n`}
                  {a.line1}{a.line2 ? `, ${a.line2}` : ''}{'\n'}
                  {a.city}, {a.region} {a.postalCode}{'\n'}
                  {a.country}
                  {a.phone && <>{'\n'}{a.phone}</>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-card">
        <div className="spread"><h3 style={{ margin: 0 }}>Orders</h3><span className="muted">{user.orders.length} placed</span></div>
        {user.orders.length === 0 ? (
          <p className="muted">No orders placed.</p>
        ) : (
          <table className="admin-table">
            <thead><tr><th>Number</th><th>Placed</th><th>Status</th><th>Total</th></tr></thead>
            <tbody>
              {user.orders.map((o) => (
                <tr key={o.id}>
                  <td><Link to={`/admin/orders/${o.id}`}>{o.number}</Link></td>
                  <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>{formatMoney(o.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {saving && <p className="muted">Saving…</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-card" style={{ margin: 0, padding: '1rem' }}>
      <div style={{ fontSize: '.7rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '.25rem' }}>{value}</div>
    </div>
  );
}
