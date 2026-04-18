import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, formatMoney } from '../api/client';
import { useAuth } from '../store/auth';

export interface Address {
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

interface Summary {
  orderCount: number;
  totalSpentCents: number;
  addressCount: number;
  recentOrders: {
    id: string;
    number: string;
    status: string;
    paymentStatus: string;
    totalCents: number;
    createdAt: string;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#a16207',
  PAID: '#1e74fc',
  IN_PRODUCTION: '#7b2cbf',
  SHIPPED: '#059669',
  DELIVERED: '#166534',
  CANCELLED: '#6b7280',
  REFUNDED: '#6b7280',
  AUTHORIZED: '#a16207',
  CAPTURED: '#166534',
  FAILED: '#b91c1c',
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#6b7280';
  return (
    <span
      style={{
        display: 'inline-block',
        background: `${color}15`,
        color,
        border: `1px solid ${color}40`,
        padding: '.15rem .5rem',
        fontSize: '.75rem',
        fontWeight: 600,
        borderRadius: 999,
      }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function AccountLayout() {
  const { user, loaded, load } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);
  useEffect(() => { if (loaded && !user) navigate('/login?redirect=/account'); }, [loaded, user, navigate]);

  if (!user) return null;

  const tabStyle = ({ isActive }: { isActive: boolean }) => ({
    display: 'block',
    padding: '.6rem 1rem',
    borderRadius: 6,
    textDecoration: 'none',
    color: isActive ? '#fff' : 'var(--ink)',
    background: isActive ? 'var(--brand)' : 'transparent',
    fontWeight: isActive ? 600 : 500,
  });

  return (
    <div className="container" style={{ padding: '2rem 0', display: 'grid', gridTemplateColumns: 'minmax(200px, 220px) 1fr', gap: '2rem' }}>
      <aside>
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Signed in as</div>
          <div style={{ fontWeight: 600 }}>{user.firstName || user.email}</div>
          <div className="muted" style={{ fontSize: '.85rem' }}>{user.email}</div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
          <NavLink to="/account" end style={tabStyle}>Dashboard</NavLink>
          <NavLink to="/account/orders" style={tabStyle}>Orders</NavLink>
          <NavLink to="/account/addresses" style={tabStyle}>Addresses</NavLink>
          <NavLink to="/account/profile" style={tabStyle}>Profile</NavLink>
          <NavLink to="/account/password" style={tabStyle}>Password</NavLink>
        </nav>
      </aside>
      <div><Outlet /></div>
    </div>
  );
}

export function AccountDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    void api.get<Summary>('/orders/summary').then(setSummary);
  }, []);

  if (!summary) return <div className="muted">Loading…</div>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Welcome back</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <StatCard label="Orders placed" value={String(summary.orderCount)} />
        <StatCard label="Total spent" value={formatMoney(summary.totalSpentCents)} />
        <StatCard label="Saved addresses" value={String(summary.addressCount)} />
      </div>

      <div className="admin-card">
        <div className="spread" style={{ marginBottom: '.75rem' }}>
          <h3 style={{ margin: 0 }}>Recent orders</h3>
          <Link to="/account/orders">View all →</Link>
        </div>
        {summary.recentOrders.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No orders yet. <Link to="/shop">Start shopping</Link>.</p>
        ) : (
          <table className="cart-table">
            <thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Payment</th><th>Total</th></tr></thead>
            <tbody>
              {summary.recentOrders.map((o) => (
                <tr key={o.id}>
                  <td><Link to={`/order/${o.number}`}>{o.number}</Link></td>
                  <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td><StatusBadge status={o.paymentStatus} /></td>
                  <td>{formatMoney(o.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-card" style={{ margin: 0, padding: '1.25rem' }}>
      <div style={{ fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '.25rem' }}>{value}</div>
    </div>
  );
}

export function AccountProfile() {
  const { user, load } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [phone, setPhone] = useState((user as any)?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
    setPhone((user as any)?.phone ?? '');
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api.put('/account/profile', {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        phone: phone || undefined,
      });
      await load();
      setMessage('Saved.');
    } catch (e: any) {
      setMessage(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1 style={{ marginTop: 0 }}>Profile</h1>
      <div className="admin-card">
        <label>Email</label>
        <input value={user?.email ?? ''} disabled />
        <div className="grid-2">
          <div>
            <label>First name</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <label>Last name</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <label>Phone</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div className="row" style={{ marginTop: '1rem', alignItems: 'center' }}>
          <button className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          {message && <span className="muted">{message}</span>}
        </div>
      </div>
    </form>
  );
}

export function AccountPassword() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword !== confirm) { setError('New passwords do not match'); return; }
    setSaving(true);
    try {
      await api.post('/account/password', { currentPassword, newPassword });
      setCurrent(''); setNew(''); setConfirm('');
      setMessage('Password updated.');
    } catch (e: any) {
      setError(e.message ?? 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1 style={{ marginTop: 0 }}>Change password</h1>
      <div className="admin-card">
        <label>Current password</label>
        <input type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
        <label>New password</label>
        <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} required minLength={8} />
        <label>Confirm new password</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
        {error && <div className="error">{error}</div>}
        <div className="row" style={{ marginTop: '1rem', alignItems: 'center' }}>
          <button className="btn" disabled={saving}>{saving ? 'Saving…' : 'Update password'}</button>
          {message && <span className="muted">{message}</span>}
        </div>
      </div>
    </form>
  );
}

const emptyAddr = {
  label: '', firstName: '', lastName: '', company: '',
  line1: '', line2: '', city: '', region: '', postalCode: '',
  country: 'US', phone: '', isDefault: false,
};

export function AccountAddresses() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState(emptyAddr);
  const [saving, setSaving] = useState(false);

  const load = () => api.get<{ addresses: Address[] }>('/account/addresses').then((r) => setAddresses(r.addresses));
  useEffect(() => { void load(); }, []);

  function startEdit(a: Address) {
    setEditing(a.id);
    setDraft({
      label: a.label ?? '',
      firstName: a.firstName,
      lastName: a.lastName,
      company: a.company ?? '',
      line1: a.line1,
      line2: a.line2 ?? '',
      city: a.city,
      region: a.region,
      postalCode: a.postalCode,
      country: a.country,
      phone: a.phone ?? '',
      isDefault: a.isDefault,
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...draft,
        label: draft.label || undefined,
        company: draft.company || undefined,
        line2: draft.line2 || undefined,
        phone: draft.phone || undefined,
      };
      if (editing === 'new') await api.post('/account/addresses', payload);
      else if (editing) await api.put(`/account/addresses/${editing}`, payload);
      setEditing(null);
      await load();
    } catch (e: any) {
      alert(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this address?')) return;
    await api.del(`/account/addresses/${id}`);
    await load();
  }

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Addresses</h1>
        {editing === null && (
          <button className="btn" onClick={() => { setEditing('new'); setDraft(emptyAddr); }}>Add address</button>
        )}
      </div>

      {editing !== null ? (
        <form onSubmit={save} className="admin-card">
          <label>Label (e.g. "Home")</label>
          <input value={draft.label ?? ''} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <div className="grid-2">
            <div><label>First name</label><input value={draft.firstName} required onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} /></div>
            <div><label>Last name</label><input value={draft.lastName} required onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} /></div>
          </div>
          <label>Company (optional)</label>
          <input value={draft.company ?? ''} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
          <label>Street</label>
          <input value={draft.line1} required onChange={(e) => setDraft({ ...draft, line1: e.target.value })} />
          <label>Apt / suite</label>
          <input value={draft.line2 ?? ''} onChange={(e) => setDraft({ ...draft, line2: e.target.value })} />
          <div className="grid-2">
            <div><label>City</label><input value={draft.city} required onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></div>
            <div><label>State / region</label><input value={draft.region} required onChange={(e) => setDraft({ ...draft, region: e.target.value })} /></div>
          </div>
          <div className="grid-2">
            <div><label>Postal code</label><input value={draft.postalCode} required onChange={(e) => setDraft({ ...draft, postalCode: e.target.value })} /></div>
            <div><label>Country</label><input value={draft.country} required maxLength={2} onChange={(e) => setDraft({ ...draft, country: e.target.value.toUpperCase() })} /></div>
          </div>
          <label>Phone</label>
          <input value={draft.phone ?? ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          <label>
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
              style={{ width: 'auto', marginRight: '.35rem' }}
            />
            Set as default shipping address
          </label>
          <div className="row" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      ) : addresses.length === 0 ? (
        <p className="muted">No saved addresses yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {addresses.map((a) => (
            <div key={a.id} className="admin-card" style={{ margin: 0 }}>
              <div className="spread">
                <strong>{a.label || 'Address'}</strong>
                {a.isDefault && <span style={{ background: '#1e74fc15', color: '#1e74fc', padding: '.15rem .5rem', borderRadius: 999, fontSize: '.75rem', fontWeight: 600 }}>Default</span>}
              </div>
              <div style={{ marginTop: '.5rem', lineHeight: 1.5 }}>
                <div>{a.firstName} {a.lastName}</div>
                {a.company && <div>{a.company}</div>}
                <div>{a.line1}</div>
                {a.line2 && <div>{a.line2}</div>}
                <div>{a.city}, {a.region} {a.postalCode}</div>
                <div>{a.country}</div>
                {a.phone && <div className="muted">{a.phone}</div>}
              </div>
              <div className="row" style={{ marginTop: '1rem' }}>
                <button className="btn secondary" onClick={() => startEdit(a)}>Edit</button>
                <button className="btn secondary" style={{ color: '#b91c1c' }} onClick={() => void remove(a.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
