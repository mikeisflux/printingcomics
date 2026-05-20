import { useEffect, useRef, useState } from 'react';
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
                { to: '/shop/artist-tools', label: 'Artist Tools' },
              ]}
            />
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
                { to: '/terms', label: 'Terms & Conditions' },
              ]}
            />
            <Link to="/contact">Contact</Link>
          </nav>
          <div className="actions">
            <ShareMenu />
            <SearchBox />
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
          <NewsletterForm />
        </div>
      </section>

      <footer className="site-footer">
        <div className="container">
          <div className="cols" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div>
              <h4>Products</h4>
              <ul>
                <li><Link to="/shop/comic-books">Comic Books</Link></li>
                <li><Link to="/shop/graphic-novels">Graphic Novels</Link></li>
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

function SearchBox() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) navigate(`/shop?q=${encodeURIComponent(q.trim())}`);
      }}
      style={{ display: 'flex', alignItems: 'center', gap: 0 }}
    >
      <input
        type="search"
        placeholder="Search products"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{
          padding: '.4rem .75rem', fontSize: '.85rem',
          border: '1px solid var(--border)', borderRadius: '6px 0 0 6px',
          borderRight: 'none', width: 180,
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
