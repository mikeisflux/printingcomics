import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, type CurrentUser } from '../store/auth';
import { api } from '../api/client';
import { DialogProvider, ToastProvider } from './admin/ui';
import { PERMISSIONS, can, permissionForPath } from '../lib/permissions';

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
          api.get<{ counts: Record<string, number> }>('/admin/reviews?status=pending').catch(() => ({ counts: {} as Record<string, number> })),
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
          <Sidebar user={user} onLogout={async () => { await logout(); navigate('/login'); }} />
          <main className="admin-main">
            <AreaGuard user={user}><Outlet /></AreaGuard>
          </main>
        </div>
      </DialogProvider>
    </ToastProvider>
  );
}

/** A staff account only sees the areas it was granted; the rest say so instead of erroring. */
function AreaGuard({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const { pathname } = useLocation();
  const needed = permissionForPath(pathname);
  if (!needed || can(user, needed)) return <>{children}</>;
  const label = PERMISSIONS.find((p) => p.key === needed)?.label ?? needed;
  return (
    <div className="admin-card" style={{ maxWidth: 560 }} data-testid="no-access">
      <h2 style={{ marginTop: 0 }}>No access to {label}</h2>
      <p className="muted">Your account does not have the {label} area. An admin can grant it under Users &amp; access.</p>
    </div>
  );
}

function Sidebar({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  const waiting = useWaiting();
  const show = (key: Parameters<typeof can>[1]) => can(user, key);
  const sales = show('orders') || show('fulfillment') || show('customers') || show('marketing');
  const catalog = show('products') || show('marketing');
  const marketing = show('email') || show('marketing');
  const partners = show('partners');
  const system = show('settings') || show('users');
  return (
    <aside className="admin-side">
      <div className="brand">Printing Comics</div>
      <nav>
        <Item to="/admin" end>Dashboard</Item>

        {sales && <div className="group">Sales</div>}
        {show('orders') && <Item to="/admin/orders" badge={waiting.orders}>Orders</Item>}
        {show('fulfillment') && <Item to="/admin/fulfillment">Fulfillment</Item>}
        {show('customers') && <Item to="/admin/customers">Customers</Item>}
        {show('marketing') && <Item to="/admin/reviews" badge={waiting.reviews}>Reviews</Item>}

        {catalog && <div className="group">Catalog</div>}
        {show('products') && <Item to="/admin/products">Products</Item>}
        {show('products') && <Item to="/admin/categories">Categories</Item>}
        {show('products') && <Item to="/admin/media">Media</Item>}
        {show('marketing') && <Item to="/admin/seo">SEO</Item>}

        {marketing && <div className="group">Marketing</div>}
        {show('email') && <Item to="/admin/email" badge={waiting.inbox}>Email</Item>}
        {show('marketing') && <Item to="/admin/coupons">Discount Codes</Item>}
        {show('marketing') && <Item to="/admin/sitediscounts">Site-wide Sale</Item>}

        {partners && <div className="group">Partners</div>}
        {show('partners') && <Item to="/admin/partners">Partners</Item>}
        {show('partners') && <Item to="/admin/api-keys">API Keys</Item>}

        {system && <div className="group">System</div>}
        {show('users') && <Item to="/admin/users">Users &amp; access</Item>}
        {show('settings') && <Item to="/admin/settings">Settings</Item>}
        {show('settings') && <Item to="/admin/security">Security</Item>}
      </nav>
      <div style={{ padding: '.5rem 1.5rem' }}>
        <a href="/" style={{ color: '#ddd', fontSize: '.85rem' }}>← View the store</a>
      </div>
      <div style={{ marginTop: 'auto', padding: '1rem 1.5rem', borderTop: '1px solid #333' }}>
        <div style={{ fontSize: '.8rem', color: '#aaa', overflowWrap: 'anywhere' }}>{user.email}<div style={{ fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>{user.role === 'ADMIN' ? 'Admin' : 'Staff'}</div></div>
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
