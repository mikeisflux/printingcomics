import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { api } from '../api/client';
import { DialogProvider, ToastProvider } from './admin/ui';

/** Counts that mean "someone is waiting on you", shown as badges in the nav. */
interface Waiting { orders: number; inbox: number; reviews: number }

function useWaiting(): Waiting {
  const [w, setW] = useState<Waiting>({ orders: 0, inbox: 0, reviews: 0 });
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [d, r] = await Promise.all([
          api.get<{ counts: { awaitingFulfillment: number; unreadInbox: number } }>('/admin/dashboard'),
          api.get<{ counts: Record<string, number> }>('/admin/reviews?status=pending'),
        ]);
        if (alive) setW({ orders: d.counts.awaitingFulfillment, inbox: d.counts.unreadInbox, reviews: r.counts.pending ?? 0 });
      } catch { /* badges are a convenience; never block the admin on them */ }
    };
    void tick();
    const t = window.setInterval(tick, 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);
  return w;
}

function Item({ to, end, badge, children }: { to: string; end?: boolean; badge?: number; children: string }) {
  return (
    <NavLink to={to} end={end}>
      <span>{children}</span>
      {badge ? <span className="nav-badge" title={`${badge} waiting`}>{badge}</span> : null}
    </NavLink>
  );
}

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
    <ToastProvider>
      <DialogProvider>
        <div className="admin-shell">
          <Sidebar email={user.email} onLogout={async () => { await logout(); navigate('/login'); }} />
          <main className="admin-main">
            <Outlet />
          </main>
        </div>
      </DialogProvider>
    </ToastProvider>
  );
}

function Sidebar({ email, onLogout }: { email: string; onLogout: () => void }) {
  const waiting = useWaiting();
  return (
    <aside className="admin-side">
      <div className="brand">Printing Comics</div>
      <nav>
        <Item to="/admin" end>Dashboard</Item>

        <div className="group">Sales</div>
        <Item to="/admin/orders" badge={waiting.orders}>Orders</Item>
        <Item to="/admin/fulfillment">Fulfillment</Item>
        <Item to="/admin/customers">Customers</Item>
        <Item to="/admin/reviews" badge={waiting.reviews}>Reviews</Item>

        <div className="group">Catalog</div>
        <Item to="/admin/products">Products</Item>
        <Item to="/admin/categories">Categories</Item>
        <Item to="/admin/media">Media</Item>
        <Item to="/admin/seo">SEO</Item>

        <div className="group">Marketing</div>
        <Item to="/admin/email" badge={waiting.inbox}>Email</Item>
        <Item to="/admin/coupons">Discount Codes</Item>
        <Item to="/admin/sitediscounts">Site-wide Sale</Item>

        <div className="group">Partners</div>
        <Item to="/admin/partners">Partners</Item>
        <Item to="/admin/api-keys">API Keys</Item>

        <div className="group">System</div>
        <Item to="/admin/settings">Settings</Item>
        <Item to="/admin/security">Security</Item>
      </nav>
      <div style={{ marginTop: 'auto', padding: '1rem 1.5rem', borderTop: '1px solid #333' }}>
        <div style={{ fontSize: '.8rem', color: '#aaa', overflowWrap: 'anywhere' }}>{email}</div>
        <button
          className="btn secondary sm"
          style={{ marginTop: '.5rem', width: '100%', color: '#fff', borderColor: '#fff' }}
          onClick={onLogout}
        >
          Log out
        </button>
      </div>
    </aside>
  );
}
