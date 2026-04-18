import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';

export function AdminLayout() {
  const { user, loaded, load, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  useEffect(() => {
    if (!loaded) return;
    if (!user) {
      navigate('/login?redirect=/admin');
    } else if (user.role !== 'ADMIN' && user.role !== 'STAFF') {
      navigate('/');
    }
  }, [loaded, user, navigate]);

  if (!loaded || !user) {
    return <div style={{ padding: 40 }}>Loading…</div>;
  }

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="brand">Printing Comics</div>
        <nav>
          <NavLink to="/admin" end>Dashboard</NavLink>
          <NavLink to="/admin/products">Products</NavLink>
          <NavLink to="/admin/categories">Categories</NavLink>
          <NavLink to="/admin/orders">Orders</NavLink>
          <NavLink to="/admin/customers">Customers</NavLink>
          <NavLink to="/admin/settings">Settings</NavLink>
        </nav>
        <div style={{ marginTop: 'auto', padding: '1rem 1.5rem', borderTop: '1px solid #333' }}>
          <div style={{ fontSize: '.8rem', color: '#aaa' }}>{user.email}</div>
          <button
            className="btn secondary"
            style={{ marginTop: '.5rem', width: '100%', color: '#fff', borderColor: '#fff' }}
            onClick={async () => { await logout(); navigate('/login'); }}
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
