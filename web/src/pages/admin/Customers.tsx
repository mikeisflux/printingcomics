import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

interface User {
  id: string; email: string; firstName?: string | null; lastName?: string | null;
  role: string; createdAt: string; _count: { orders: number };
}

export function AdminCustomers() {
  const [users, setUsers] = useState<User[]>([]);
  const [q, setQ] = useState('');

  const load = () => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    void api.get<{ users: User[] }>(`/admin/users${qs}`).then((r) => setUsers(r.users));
  };

  useEffect(() => { load(); }, []);

  const updateRole = async (id: string, role: string) => {
    await api.patch(`/admin/users/${id}`, { role });
    load();
  };

  return (
    <div>
      <h1>Customers</h1>
      <div className="admin-card">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: 'flex', gap: '.5rem' }}>
          <input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn">Search</button>
        </form>
      </div>
      <div className="admin-card">
        <table className="admin-table">
          <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Orders</th><th>Joined</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><Link to={`/admin/customers/${u.id}`}>{u.email}</Link></td>
                <td>{u.firstName} {u.lastName}</td>
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
