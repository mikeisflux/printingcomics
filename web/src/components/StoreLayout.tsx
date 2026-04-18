import { useEffect } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useCart } from '../store/cart';

export function StoreLayout() {
  const { user, loaded, load, logout } = useAuth();
  const { cart, load: loadCart } = useCart();
  const navigate = useNavigate();

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
            <Link to="/shop">Shop All</Link>
            <Link to="/shop/comic-books">Comic Books</Link>
            <Link to="/shop/graphic-novels">Graphic Novels</Link>
            <Link to="/shop/trade-paperbacks">Trade Paperbacks</Link>
          </nav>
          <div className="actions">
            {user ? (
              <>
                <Link to="/account">Hi, {user.firstName ?? 'Account'}</Link>
                {(user.role === 'ADMIN' || user.role === 'STAFF') && (
                  <Link to="/admin">Admin</Link>
                )}
                <button
                  className="btn secondary"
                  style={{ padding: '.4rem .8rem', fontSize: '.9rem' }}
                  onClick={async () => {
                    await logout();
                    navigate('/');
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <Link to="/login" className="btn secondary" style={{ padding: '.4rem .8rem', fontSize: '.9rem' }}>
                Log in
              </Link>
            )}
            <Link to="/cart" className="btn" style={{ padding: '.4rem .8rem', fontSize: '.9rem' }}>
              Cart ({itemCount})
            </Link>
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="cols">
            <div>
              <h4>Shop</h4>
              <ul>
                <li><Link to="/shop/comic-books">Comic Books</Link></li>
                <li><Link to="/shop/graphic-novels">Graphic Novels</Link></li>
                <li><Link to="/shop/trade-paperbacks">Trade Paperbacks</Link></li>
              </ul>
            </div>
            <div>
              <h4>Services</h4>
              <ul>
                <li><Link to="/shop">Custom Printing</Link></li>
                <li><Link to="/shop">Fulfilment</Link></li>
              </ul>
            </div>
            <div>
              <h4>Account</h4>
              <ul>
                <li><Link to="/login">Log in</Link></li>
                <li><Link to="/register">Register</Link></li>
                <li><Link to="/account/orders">My orders</Link></li>
              </ul>
            </div>
            <div>
              <h4>About</h4>
              <ul>
                <li><a href="mailto:hello@printingcomics.com">hello@printingcomics.com</a></li>
              </ul>
            </div>
          </div>
          <div className="copyright">© {new Date().getFullYear()} Printing Comics. All rights reserved.</div>
        </div>
      </footer>
    </>
  );
}
