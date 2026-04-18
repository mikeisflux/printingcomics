import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useCart } from '../store/cart';

export function StoreLayout() {
  const { user, loaded, load, logout } = useAuth();
  const { cart, load: loadCart } = useCart();
  const navigate = useNavigate();
  const [productsOpen, setProductsOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    if (!loaded) void load();
    void loadCart();
  }, [loaded, load, loadCart]);

  const itemCount = cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <>
      <header className="site-header">
        <div className="container">
          <Link to="/" className="logo">Printing Comics</Link>
          <nav>
            <NavItem
              label="Products"
              isOpen={productsOpen}
              onToggle={() => setProductsOpen(!productsOpen)}
              items={[
                { to: '/shop/comic-books', label: 'Comic Books' },
                { to: '/shop/graphic-novels', label: 'Graphic Novels' },
                { to: '/shop/manga', label: 'Manga' },
                { to: '/shop/zines', label: 'Zines' },
                { to: '/shop/artist-tools', label: 'Artist Tools' },
              ]}
            />
            <Link to="/shop">Print-On-Demand</Link>
            <Link to="/crowdfunding">Crowdfunding</Link>
            <NavItem
              label="Resources"
              isOpen={resourcesOpen}
              onToggle={() => setResourcesOpen(!resourcesOpen)}
              items={[
                { to: '/resources/make-a-comic', label: 'Make A Comic' },
                { to: '/resources/file-prep', label: 'File Prep' },
                { to: '/resources/templates', label: 'Templates' },
                { to: '/resources/faq', label: 'FAQ' },
              ]}
            />
            <NavItem
              label="About"
              isOpen={aboutOpen}
              onToggle={() => setAboutOpen(!aboutOpen)}
              items={[
                { to: '/about', label: 'About Us' },
                { to: '/terms', label: 'Terms &amp; Conditions' },
              ]}
            />
            <Link to="/media">CWS Media</Link>
            <Link to="/contact">Contact</Link>
          </nav>
          <div className="actions">
            {user ? (
              <>
                <Link to="/account" title={user.email} aria-label="Account">
                  Hi, {user.firstName ?? 'Account'}
                </Link>
                {(user.role === 'ADMIN' || user.role === 'STAFF') && (
                  <Link to="/admin">Admin</Link>
                )}
                <button
                  className="btn secondary"
                  style={{ padding: '.4rem .8rem', fontSize: '.9rem' }}
                  onClick={async () => { await logout(); navigate('/'); }}
                >
                  Log out
                </button>
              </>
            ) : (
              <Link to="/login" aria-label="Log in" style={{ padding: '.4rem' }}>👤</Link>
            )}
            <Link to="/cart" className="btn" style={{ padding: '.4rem .8rem', fontSize: '.9rem' }}>
              🛒 {itemCount > 0 && <span>({itemCount})</span>}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      {/* Newsletter signup band */}
      <section style={{ background: '#1e74fc', color: '#fff', padding: '3rem 0' }}>
        <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '.9rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '.5rem' }}>
              Be part of the Printing Comics creator community!
            </div>
            <p style={{ margin: 0, opacity: 0.9 }}>
              Sign up for our newsletter for exclusive deals, print promotions, and first access to news and giveaways.
            </p>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); alert('Thanks! (Newsletter form stub — wire to Brevo contact list next.)'); }}
            style={{ display: 'flex', gap: '.5rem', background: '#fff', borderRadius: '999px', padding: '.25rem' }}
          >
            <input
              type="email"
              placeholder="Email address"
              required
              style={{ border: 'none', padding: '.75rem 1rem', flex: 1, borderRadius: '999px', background: 'transparent' }}
            />
            <button
              className="btn"
              style={{ borderRadius: '50%', width: 44, height: 44, padding: 0, fontSize: '1.1rem' }}
              aria-label="Sign up"
            >
              →
            </button>
          </form>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container">
          <div className="cols" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div>
              <h4>Products</h4>
              <ul>
                <li><Link to="/shop/comic-books">Comic Books</Link></li>
                <li><Link to="/shop/graphic-novels">Graphic Novels</Link></li>
                <li><Link to="/shop/manga">Manga</Link></li>
                <li><Link to="/shop/zines">Zines</Link></li>
                <li><Link to="/shop/artist-tools">Artist Tools</Link></li>
              </ul>
            </div>
            <div>
              <h4>Resources</h4>
              <ul>
                <li><Link to="/resources/make-a-comic">Make A Comic</Link></li>
                <li><Link to="/resources/file-prep">File Prep</Link></li>
                <li><Link to="/resources/templates">Templates</Link></li>
                <li><Link to="/account/orders">Order Status</Link></li>
                <li><Link to="/resources/faq">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h4>Other</h4>
              <ul>
                <li><Link to="/about">About</Link></li>
                <li><Link to="/contact">Contact</Link></li>
                <li><Link to="/terms">Terms and Conditions</Link></li>
                <li><Link to="/media">CWS Media</Link></li>
                <li><Link to="/sample-pack">Sample Pack</Link></li>
              </ul>
            </div>
          </div>
          <div className="copyright">© {new Date().getFullYear()} Printing Comics. All rights reserved.</div>
        </div>
      </footer>
    </>
  );
}

function NavItem({
  label, isOpen, onToggle, items,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  items: { to: string; label: string }[];
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onToggle}
        onBlur={() => setTimeout(onToggle, 200)}
        style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--ink)', fontWeight: 500, fontSize: '1rem', cursor: 'pointer' }}
      >
        {label} ▾
      </button>
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '2rem',
            left: 0,
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow)',
            minWidth: 200,
            padding: '.5rem 0',
            zIndex: 30,
          }}
        >
          {items.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              style={{ display: 'block', padding: '.5rem 1rem', color: 'var(--ink)' }}
              onClick={onToggle}
            >
              {it.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
