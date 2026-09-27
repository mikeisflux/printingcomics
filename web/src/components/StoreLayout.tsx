import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useCart } from '../store/cart';
import { useProofCounts } from '../pages/Account';

export function StoreLayout() {
  const { user, loaded, load, logout } = useAuth();
  const proofCounts = useProofCounts(user);
  const waiting = (proofCounts?.pendingProofs ?? 0) + (proofCounts?.openRequests ?? 0);
  const { cart, load: loadCart } = useCart();
  const navigate = useNavigate();
  const [productsOpen, setProductsOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  // Phone-width header: everything but the logo, cart and a hamburger lives
  // in a full-screen menu (see MobileMenu). Closes on navigation and Escape.
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const location = useLocation();
  useEffect(() => { setMenuOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, [menuOpen]);

  useEffect(() => {
    if (!loaded) void load();
    void loadCart();
  }, [loaded, load, loadCart]);

  const itemCount = cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <>
      {/* Top utility bar — phone number, always visible at the top of every page */}
      <div style={{ background: 'var(--brand-dark)', color: '#fff', fontSize: '.85rem' }}>
        <div
          className="container"
          style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', padding: '.4rem 0' }}
        >
          <a
            href="tel:+12192386540"
            style={{ color: '#fff', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}
          >
            <span aria-hidden="true">📞</span> (219) 238-6540
          </a>
        </div>
      </div>

      <header className="site-header" ref={headerRef}>
        <div className="container">
          <Link to="/" className="logo">Printing Comics</Link>
          <nav>
            <NavItem label="Products" isOpen={productsOpen} onToggle={() => setProductsOpen(!productsOpen)} items={NAV_GROUPS.products} />
            <Link to="/crowdfunding">Crowdfunding</Link>
            <NavItem label="Resources" isOpen={resourcesOpen} onToggle={() => setResourcesOpen(!resourcesOpen)} items={NAV_GROUPS.resources} />
            <NavItem label="About" isOpen={aboutOpen} onToggle={() => setAboutOpen(!aboutOpen)} items={NAV_GROUPS.about} />
            <Link to="/contact">Contact</Link>
          </nav>
          <div className="actions">
            <div className="desktop-only">
              <ShareMenu />
              <SearchBox />
              {user ? (
                <>
                  <Link to="/account" title={user.email} aria-label="Account">
                    Hi, {user.firstName ?? 'Account'}
                  </Link>
                  {waiting > 0 && (
                    <Link to="/account/proofs" title="Proofs and file requests waiting for you" className="waiting-pill">
                      {waiting} waiting
                    </Link>
                  )}
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
            </div>
            <Link to="/cart" className="btn" style={{ padding: '.4rem .8rem', fontSize: '.9rem' }} aria-label="Cart">
              🛒 {itemCount > 0 && <span>({itemCount})</span>}
            </Link>
            <button
              type="button"
              className="menu-toggle"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? '✕' : '☰'}
              {!menuOpen && waiting > 0 && <span className="menu-dot" aria-hidden="true" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <MobileMenu
            top={headerRef.current?.getBoundingClientRect().bottom ?? 0}
            user={user}
            waiting={waiting}
            itemCount={itemCount}
            onClose={() => setMenuOpen(false)}
            onLogout={async () => { await logout(); setMenuOpen(false); navigate('/'); }}
          />
        )}
      </header>

      <main>
        <Outlet />
      </main>

      {/* Newsletter signup band */}
      <section style={{ background: '#1e74fc', color: '#fff', padding: '3rem 0' }}>
        <div className="container newsletter-band">
          <div>
            <div style={{ fontSize: '.9rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '.5rem' }}>
              Be part of the Printing Comics creator community!
            </div>
            <p style={{ margin: 0, opacity: 0.9 }}>
              Sign up for our newsletter for exclusive deals, print promotions, and first access to news and giveaways.
            </p>
          </div>
          <NewsletterForm />
        </div>
      </section>

      <footer className="site-footer">
        <div className="container">
          <div className="cols">
            <div>
              <h4>Products</h4>
              <ul>
                <li><Link to="/shop/comic-books">Comic Books</Link></li>
                <li><Link to="/shop/graphic-novels">Graphic Novels</Link></li>
                <li><Link to="/shop/art-prints">Art Prints</Link></li>
                <li><Link to="/shop/shipping-supplies">Shipping Supplies</Link></li>
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
              <h4>Developers</h4>
              <ul>
                <li><Link to="/developers">API Overview</Link></li>
                <li><Link to="/developers#getting-started">Getting Started</Link></li>
                <li><Link to="/developers#catalog">Catalog API</Link></li>
                <li><Link to="/developers#pricing">Pricing API</Link></li>
                <li><Link to="/developers#orders">Orders API</Link></li>
                <li><Link to="/developers#quickstart">Quickstart</Link></li>
                <li><Link to="/developers#request-access">Request an API Key</Link></li>
              </ul>
            </div>
            <div>
              <h4>Other</h4>
              <ul>
                <li><Link to="/about">About</Link></li>
                <li><Link to="/contact">Contact</Link></li>
                <li><Link to="/terms">Terms and Conditions</Link></li>
                <li><Link to="/sample-pack">Sample Pack</Link></li>
              </ul>
            </div>
          </div>
          <SocialRow />
          <div className="copyright">© {new Date().getFullYear()} Printing Comics. All rights reserved.</div>
        </div>
      </footer>
    </>
  );
}

function ShareMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const url = encodeURIComponent('https://printingcomics.com');
  const text = encodeURIComponent('Check out Printing Comics — custom comic & graphic novel printing!');

  const targets = [
    { label: 'X / Twitter', icon: '𝕏', href: `https://x.com/intent/tweet?url=${url}&text=${text}` },
    { label: 'Facebook', icon: 'f', href: `https://www.facebook.com/sharer/sharer.php?u=${url}` },
    { label: 'Reddit', icon: 'r/', href: `https://www.reddit.com/submit?url=${url}&title=${text}` },
    { label: 'LinkedIn', icon: 'in', href: `https://www.linkedin.com/sharing/share-offsite/?url=${url}` },
    { label: 'Bluesky', icon: '☁', href: `https://bsky.app/intent/compose?text=${text}%20https%3A%2F%2Fprintingcomics.com` },
    { label: 'Threads', icon: '@', href: `https://www.threads.net/intent/post?text=${text}%20https%3A%2F%2Fprintingcomics.com` },
  ];

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Share this site"
        style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '.35rem .65rem',
          fontSize: '.85rem',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '.3rem',
          color: 'var(--ink)',
          whiteSpace: 'nowrap',
        }}
      >
        ↗ Share
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '2.2rem',
            right: 0,
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow)',
            minWidth: 180,
            padding: '.4rem 0',
            zIndex: 40,
          }}
        >
          {targets.map((t) => (
            <a
              key={t.label}
              href={t.href}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '.75rem',
                padding: '.5rem 1rem',
                color: 'var(--ink)',
                textDecoration: 'none',
                fontSize: '.9rem',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-alt)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: 'var(--bg-alt)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '.75rem',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {t.icon}
              </span>
              {t.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchBox({ fullWidth = false }: { fullWidth?: boolean } = {}) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) navigate(`/shop?q=${encodeURIComponent(q.trim())}`);
      }}
      style={{ display: 'flex', alignItems: 'center', gap: 0, width: fullWidth ? '100%' : undefined }}
    >
      <input
        type="search"
        placeholder="Search products"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{
          padding: fullWidth ? '.6rem .85rem' : '.4rem .75rem', fontSize: fullWidth ? '1rem' : '.85rem',
          border: '1px solid var(--border)', borderRadius: '6px 0 0 6px',
          borderRight: 'none', width: fullWidth ? '100%' : 180, flex: fullWidth ? 1 : undefined,
        }}
      />
      <button
        type="submit"
        aria-label="Search"
        style={{
          padding: '.4rem .6rem', fontSize: '.9rem',
          border: '1px solid var(--border)', borderRadius: '0 6px 6px 0',
          background: 'var(--bg-alt)', cursor: 'pointer',
        }}
      >
        🔍
      </button>
    </form>
  );
}

function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setMessage(null);
    try {
      const r = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, source: 'footer' }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({ error: 'Failed' }))).error);
      setStatus('ok');
      setMessage('Thanks — you\'re in!');
      setEmail('');
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message ?? 'Signup failed');
    }
  }

  return (
    <div>
      <form
        onSubmit={submit}
        style={{ display: 'flex', gap: '.5rem', background: '#fff', borderRadius: '999px', padding: '.25rem' }}
      >
        <input
          type="email"
          placeholder="Email address"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'sending'}
          style={{ border: 'none', padding: '.75rem 1rem', flex: 1, borderRadius: '999px', background: 'transparent' }}
        />
        <button
          type="submit"
          className="btn"
          disabled={status === 'sending'}
          style={{ borderRadius: '50%', width: 44, height: 44, padding: 0, fontSize: '1.1rem' }}
          aria-label="Sign up"
        >
          {status === 'sending' ? '…' : '→'}
        </button>
      </form>
      {message && (
        <div style={{ marginTop: '.5rem', fontSize: '.85rem', opacity: 0.95 }}>{message}</div>
      )}
    </div>
  );
}

function SocialRow() {
  const socials: { href: string; label: string; icon: string }[] = [
    { href: 'https://www.facebook.com/printingcomics', label: 'Facebook', icon: 'f' },
    { href: 'https://www.instagram.com/printingcomics', label: 'Instagram', icon: 'ig' },
    { href: 'https://www.youtube.com/@printingcomics', label: 'YouTube', icon: '▶' },
    { href: 'https://www.tiktok.com/@printingcomics', label: 'TikTok', icon: 'tk' },
    { href: 'https://x.com/printingcomics', label: 'X', icon: '𝕏' },
    { href: 'https://www.threads.net/@printingcomics', label: 'Threads', icon: '@' },
    { href: 'https://www.linkedin.com/company/printingcomics', label: 'LinkedIn', icon: 'in' },
    { href: 'https://bsky.app/profile/printingcomics.bsky.social', label: 'Bluesky', icon: '☁' },
  ];
  return (
    <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', margin: '1.5rem 0 1rem', flexWrap: 'wrap' }}>
      {socials.map((s) => (
        <a
          key={s.label}
          href={s.href}
          target="_blank"
          rel="noreferrer"
          aria-label={s.label}
          title={s.label}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
            fontSize: '.9rem',
            fontWeight: 700,
          }}
        >
          {s.icon}
        </a>
      ))}
    </div>
  );
}

const NAV_GROUPS = {
  products: [
    { to: '/shop/comic-books', label: 'Comic Books' },
    { to: '/shop/graphic-novels', label: 'Graphic Novels' },
    { to: '/shop/art-prints', label: 'Art Prints' },
    { to: '/shop/artist-tools', label: 'Artist Tools' },
    { to: '/shop/shipping-supplies', label: 'Shipping Supplies' },
  ],
  resources: [
    { to: '/resources/make-a-comic', label: 'Make A Comic' },
    { to: '/resources/file-prep', label: 'File Prep' },
    { to: '/resources/templates', label: 'Templates' },
    { to: '/resources/faq', label: 'FAQ' },
  ],
  about: [
    { to: '/about', label: 'About Us' },
    { to: '/terms', label: 'Terms & Conditions' },
  ],
};

/**
 * The phone-width menu: a full-screen sheet under the header with search,
 * the same link groups as the desktop dropdowns (Products open by default),
 * and the account actions. Tapping any link closes it (StoreLayout closes on
 * navigation); the backdrop of the sheet is the page itself, so ✕ and Escape
 * are the ways out.
 */
function MobileMenu({ top, user, waiting, itemCount, onClose, onLogout }: {
  /** Where the sheet starts: just under the header, so its ✕ stays reachable. */
  top: number;
  user: { email: string; firstName?: string | null; role: string } | null;
  waiting: number;
  itemCount: number;
  onClose: () => void;
  onLogout: () => Promise<void>;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ products: true });
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const group = (key: 'products' | 'resources' | 'about', label: string) => (
    <div className="mobile-group">
      <button type="button" className="mobile-group-toggle" aria-expanded={!!open[key]} onClick={() => toggle(key)}>
        <span>{label}</span>
        <span aria-hidden="true">{open[key] ? '−' : '+'}</span>
      </button>
      {open[key] && (
        <div className="mobile-group-links">
          {NAV_GROUPS[key].map((it) => <Link key={it.to} to={it.to} onClick={onClose}>{it.label}</Link>)}
        </div>
      )}
    </div>
  );

  return (
    <div id="mobile-menu" className="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" style={{ top }}>
      <div className="mobile-menu-inner">
        <SearchBox fullWidth />

        {user ? (
          <div className="mobile-account">
            <div className="muted" style={{ fontSize: '.75rem', textTransform: 'uppercase', fontWeight: 700 }}>Signed in as</div>
            <div style={{ fontWeight: 600 }}>{user.firstName || user.email}</div>
            <div className="mobile-account-links">
              <Link to="/account" onClick={onClose}>My account</Link>
              <Link to="/account/orders" onClick={onClose}>Orders</Link>
              <Link to="/account/proofs" onClick={onClose} className={waiting > 0 ? 'waiting' : undefined}>
                Proofs &amp; files{waiting > 0 ? ` · ${waiting} waiting` : ''}
              </Link>
              {(user.role === 'ADMIN' || user.role === 'STAFF') && <Link to="/admin" onClick={onClose}>Admin</Link>}
              <button type="button" onClick={() => { void onLogout(); }}>Log out</button>
            </div>
          </div>
        ) : (
          <div className="mobile-account">
            <div className="mobile-account-links">
              <Link to="/login" onClick={onClose}>Log in</Link>
              <Link to="/register" onClick={onClose}>Create account</Link>
            </div>
          </div>
        )}

        {group('products', 'Products')}
        <Link to="/crowdfunding" className="mobile-top-link" onClick={onClose}>Crowdfunding</Link>
        {group('resources', 'Resources')}
        {group('about', 'About')}
        <Link to="/contact" className="mobile-top-link" onClick={onClose}>Contact</Link>
        <Link to="/cart" className="mobile-top-link" onClick={onClose}>🛒 Cart{itemCount > 0 ? ` (${itemCount})` : ''}</Link>

        <a href="tel:+12192386540" className="mobile-call">📞 Call (219) 238-6540</a>
      </div>
    </div>
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
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        onClick={onToggle}
        onBlur={() => setTimeout(onToggle, 200)}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          margin: 0,
          color: 'var(--ink)',
          fontWeight: 500,
          fontSize: '1rem',
          lineHeight: 1,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '.25rem',
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: '.75rem', opacity: 0.7 }}>▾</span>
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
