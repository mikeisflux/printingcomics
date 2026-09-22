import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader, TableState, errorMessage, rowClick, useConfirm, useDebounced, useToast } from '../../components/admin/ui';

interface User {
  id: string; email: string; firstName?: string | null; lastName?: string | null;
  role: string; createdAt: string;
  partner?: { id: string; slug: string; name: string; color?: string | null } | null;
  _count: { orders: number };
}

type PartnerFilter = 'all' | 'any' | 'none';

const ROLE_LABEL: Record<string, string> = { CUSTOMER: 'Customer', STAFF: 'Staff', ADMIN: 'Admin' };

export function AdminCustomers() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const [users, setUsers] = useState<User[]>([]);
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const [partnerFilter, setPartnerFilter] = useState<PartnerFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (partnerFilter !== 'all') params.set('partner', partnerFilter);
    const qs = params.toString() ? `?${params}` : '';
    api.get<{ users: User[] }>(`/admin/users${qs}`)
      .then((r) => { if (alive) setUsers(r.users); })
      .catch((e) => { if (alive) setError(errorMessage(e, 'Could not load customers')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [query, partnerFilter, tick]);

  const updateRole = async (u: User, role: string) => {
    if (role === u.role) return;
    // Giving someone admin or staff access is a big deal for a dropdown to do
    // silently. Demotions and customer-to-customer are harmless.
    if (role === 'ADMIN' || role === 'STAFF') {
      const ok = await confirm({
        title: `Make ${u.email} ${role === 'ADMIN' ? 'an admin' : 'staff'}?`,
        body: role === 'ADMIN'
          ? 'Admins can see and change everything in here — orders, payments, settings, other users.'
          : 'Staff can work orders, fulfillment and the catalog.',
        confirmLabel: `Yes, make ${(ROLE_LABEL[role] ?? role).toLowerCase()}`,
        danger: role === 'ADMIN',
      });
      if (!ok) { setTick((t) => t + 1); return; } // re-render resets the select
    }
    try {
      await api.patch(`/admin/users/${u.id}`, { role });
      toast.success(`${u.email} is now ${(ROLE_LABEL[role] ?? role).toLowerCase()}.`);
      setTick((t) => t + 1);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not change the role'));
      setTick((t) => t + 1);
    }
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={!loading && !error ? `${users.length} shown` : undefined}
      />

      <div className="admin-card">
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 260px' }}>
            <label>Search</label>
            <input type="search" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          <div>
            <label>Type</label>
            <select value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value as PartnerFilter)}>
              <option value="all">All customers</option>
              <option value="any">Partner contacts only</option>
              <option value="none">Direct customers only</option>
            </select>
          </div>
          {(q || partnerFilter !== 'all') && (
            <button className="btn secondary sm" onClick={() => { setQ(''); setPartnerFilter('all'); }}>Clear</button>
          )}
        </div>
      </div>

      <div className="admin-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-table">
          <thead><tr><th>Email</th><th>Name</th><th>Partner</th><th>Role</th><th>Orders</th><th>Joined</th></tr></thead>
          <tbody>
            <TableState
              loading={loading}
              error={error}
              count={users.length}
              colSpan={6}
              empty={query || partnerFilter !== 'all' ? 'No customers match.' : 'No customers yet.'}
            />
            {!loading && !error && users.map((u) => (
              <tr key={u.id} className="clickable" onClick={rowClick(() => navigate(`/admin/customers/${u.id}`))}>
                <td><Link to={`/admin/customers/${u.id}`} style={{ fontWeight: 600 }}>{u.email}</Link></td>
                <td>{[u.firstName, u.lastName].filter(Boolean).join(' ') || <span className="muted">—</span>}</td>
                <td style={{ fontSize: '.85rem' }}>
                  {u.partner ? (
                    <Link to={`/admin/partners/${u.partner.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: u.partner.color ?? '#94a3b8' }} />
                      {u.partner.name}
                    </Link>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <select
                    value={u.role}
                    onChange={(e) => void updateRole(u, e.target.value)}
                    style={{ width: 'auto', padding: '.3rem .5rem', fontSize: '.9rem' }}
                    aria-label={`Role for ${u.email}`}
                  >
                    <option value="CUSTOMER">Customer</option>
                    <option value="STAFF">Staff</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </td>
                <td>{u._count.orders}</td>
                <td title={new Date(u.createdAt).toLocaleString()}>{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
