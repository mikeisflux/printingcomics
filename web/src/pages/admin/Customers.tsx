import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

interface User {
  id: string; email: string; firstName?: string | null; lastName?: string | null;
  role: string; createdAt: string;
  partner?: { id: string; slug: string; name: string; color?: string | null } | null;
  _count: { orders: number };
}

type PartnerFilter = 'all' | 'any' | 'none';

export function AdminCustomers() {
  const [users, setUsers] = useState<User[]>([]);
  const [q, setQ] = useState('');
  const [partnerFilter, setPartnerFilter] = useState<PartnerFilter>('all');

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (partnerFilter !== 'all') params.set('partner', partnerFilter);
    const qs = params.toString() ? `?${params.toString()}` : '';
    void api.get<{ users: User[] }>(`/admin/users${qs}`).then((r) => setUsers(r.users));
  };

  useEffect(() => { load(); }, [partnerFilter]);

  const updateRole = async (id: string, role: string) => {
    await api.patch(`/admin/users/${id}`, { role });
    load();
  };

  return (
    <div>
      <h1>Customers</h1>
      <div className="admin-card">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <select value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value as PartnerFilter)}>
            <option value="all">All customers</option>
            <option value="any">Partner contacts only</option>
            <option value="none">Direct customers only</option>
          </select>
          <button className="btn">Search</button>
        </form>
      </div>
      <div className="admin-card">
        <table className="admin-table">
          <thead><tr><th>Email</th><th>Name</th><th>Partner</th><th>Role</th><th>Orders</th><th>Joined</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><Link to={`/admin/customers/${u.id}`}>{u.email}</Link></td>
                <td>{u.firstName} {u.lastName}</td>
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
                  <select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)}>
                    <option value="CUSTOMER">CUSTOMER</option>
                    <option value="STAFF">STAFF</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </td>
                <td>{u._count.orders}</td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td><Link to={`/admin/customers/${u.id}`} className="btn secondary" style={{ padding: '.3rem .6rem' }}>View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
