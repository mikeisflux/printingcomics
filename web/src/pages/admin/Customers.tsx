import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface User {
  id: string; email: string; firstName?: string | null; lastName?: string | null;
  role: string; createdAt: string; _count: { orders: number };
}

export function AdminCustomers() {
  const [users, setUsers] = useState<User[]>([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<User | null>(null);

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
                <td>{u.email}</td>
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
                <td><button className="btn secondary" onClick={() => setEditing(u)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <CustomerDrawer user={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CustomerDrawer({ user, onClose }: { user: User; onClose: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  useEffect(() => {
    void api.get<{ user: any }>(`/admin/users/${user.id}`).then((r) => setDetail(r.user));
  }, [user.id]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 500, background: '#fff', padding: '2rem', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h2>{user.email}</h2>
        {!detail ? (
          <p>Loading…</p>
        ) : (
          <>
            <h3>Orders ({detail.orders.length})</h3>
            <ul>{detail.orders.map((o: any) => (
              <li key={o.id}>{o.number} — {o.status} — ${(o.totalCents / 100).toFixed(2)}</li>
            ))}</ul>
            <h3>Addresses ({detail.addresses.length})</h3>
            <ul>{detail.addresses.map((a: any) => (
              <li key={a.id}>{a.line1}, {a.city} {a.region} {a.postalCode}</li>
            ))}</ul>
          </>
        )}
        <button className="btn secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
