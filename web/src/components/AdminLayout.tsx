import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, type CurrentUser } from '../store/auth';
import { api } from '../api/client';
import { DialogProvider, ToastProvider } from './admin/ui';
import { GENERAL_KEYS, PERMISSIONS, can, canPath, permissionForPath, podOnly } from '../lib/permissions';

/** Counts that mean "someone is waiting on you", shown as badges in the nav. */
interface Waiting { orders: number; inbox: number; reviews: number; pod: number }

function useWaiting(user: CurrentUser): Waiting {
  const [w, setW] = useState<Waiting>({ orders: 0, inbox: 0, reviews: 0, pod: 0 });
  const general = GENERAL_KEYS.some((k) => can(user, k));
  const pod = can(user, 'pod');
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [d, r, p] = await Promise.all([
          general ? api.get<{ counts: { awaitingFulfillment: number; unreadInbox: number } }>('/admin/dashboard').catch(() => null) : null,
          general && can(user, 'marketing') ? api.get<{ counts: Record<string, number> }>('/admin/reviews?status=pending').catch(() => ({ counts: {} as Record<string, number> })) : null,
          pod ? api.get<{ counts: { toReview: number; retailersPending: number } }>('/admin/pod/overview').catch(() => null) : null,
        ]);
        if (alive) setW({ orders: d?.counts.awaitingFulfillment ?? 0, inbox: d?.counts.unreadInbox ?? 0, reviews: r?.counts.pending ?? 0, pod: (p?.counts.toReview ?? 0) + (p?.counts.retailersPending ?? 0) });
      } catch { /* badges are a convenience; never block the admin on them */ }
    };
    void tick();
    const t = window.setInterval(tick, 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, [general, pod, user]);
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
  const { pathname } = useLocation();

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

  // A seeded or invited account signs in with a starter password and must
  // choose its own before it sees anything here.
  if (user.hasPassword === false) return <Navigate to={`/account/setup?next=${encodeURIComponent(pathname)}`} replace />;
  // A Distribution admin has no store dashboard: the section is their home.
  if (podOnly(user) && (pathname === '/admin' || pathname === '/admin/')) return <Navigate to="/admin/pod" replace />;

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
  if (canPath(user, pathname)) return <>{children}</>;
  const needed = permissionForPath(pathname) ?? 'orders';
  const label = PERMISSIONS.find((p) => p.key === needed)?.label ?? needed;
  return (
    <div className="admin-card" style={{ maxWidth: 560 }} data-testid="no-access">
      <h2 style={{ marginTop: 0 }}>No access to {label}</h2>
      <p className="muted">Your account does not have the {label} area. An admin can grant it under Users &amp; access.</p>
    </div>
  );
}

function Sidebar({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  const waiting = useWaiting(user);
  const show = (key: Parameters<typeof can>[1]) => can(user, key);
  const onlyPod = podOnly(user);
  const sales = show('orders') || show('fulfillment') || show('customers') || show('marketing');
  const catalog = show('products') || show('marketing');
  const marketing = show('email') || show('marketing');
  const partners = show('partners');
  const system = show('settings') || show('users');
  const pod = show('pod') || show('preflight');
  return (
    <aside className="admin-side">
      <div className="brand">{onlyPod ? 'Distribution' : 'Printing Comics'}</div>
      <nav>
        {!onlyPod && <Item to="/admin" end>Dashboard</Item>}

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

        {pod && <div className="group">Distribution</div>}
        {show('pod') && <Item to="/admin/pod" end badge={waiting.pod}>Overview</Item>}
        {show('pod') && <Item to="/admin/pod/listings">Listings</Item>}
        {show('pod') && <Item to="/admin/pod/publishers">Publishers</Item>}
        {show('pod') && <Item to="/admin/pod/cycles">Catalog cycles</Item>}
        {show('pod') && <Item to="/admin/pod/retailers">Retailers</Item>}
        {show('pod') && <Item to="/admin/pod/orders">Orders</Item>}
        {show('pod') && <Item to="/admin/pod/fulfillment">Fulfillment</Item>}
        {show('pod') && <Item to="/admin/pod/production">Production</Item>}
        {show('pod') && <Item to="/admin/pod/purchase-orders">Purchase orders</Item>}
        {show('pod') && <Item to="/admin/pod/inventory">Inventory</Item>}
        {show('pod') && <Item to="/admin/pod/returns">Returns</Item>}
        {show('pod') && <Item to="/admin/pod/payouts">Payouts</Item>}
        {show('pod') && <Item to="/admin/pod/files">Files</Item>}
        {show('pod') && <Item to="/admin/pod/barcodes">Barcodes</Item>}
        {(show('pod') || show('preflight')) && <Item to="/admin/pod/preflight">Preflight</Item>}
        {show('pod') && <Item to="/admin/pod/analytics">Analytics</Item>}
        {show('pod') && <Item to="/admin/pod/activity">Activity</Item>}
        {show('pod') && <Item to="/admin/pod/settings">Distribution settings</Item>}

        {system && <div className="group">System</div>}
        {show('users') && <Item to="/admin/users">Users &amp; access</Item>}
        {show('settings') && <Item to="/admin/settings">Settings</Item>}
        {show('settings') && <Item to="/admin/security">Security</Item>}
      </nav>
      <div style={{ padding: '.5rem 1.5rem' }}>
        <a href={onlyPod ? '/distribution' : '/'} style={{ color: '#ddd', fontSize: '.85rem' }}>← {onlyPod ? 'View the program page' : 'View the store'}</a>
      </div>
      <div style={{ marginTop: 'auto', padding: '1rem 1.5rem', borderTop: '1px solid #333' }}>
        <div style={{ fontSize: '.8rem', color: '#aaa', overflowWrap: 'anywhere' }}>{user.email}<div style={{ fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>{user.role === 'ADMIN' ? 'Admin' : onlyPod ? 'Distribution admin' : 'Staff'}</div></div>
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
