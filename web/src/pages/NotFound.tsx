import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="container" style={{ padding: '5rem 0', textAlign: 'center', maxWidth: 560 }}>
      <div style={{ fontSize: '6rem', fontWeight: 900, color: 'var(--brand)', lineHeight: 1, marginBottom: '1rem' }}>
        404
      </div>
      <h1 style={{ marginTop: 0 }}>That page is off the shelf</h1>
      <p className="muted" style={{ fontSize: '1.05rem', marginBottom: '2rem' }}>
        The issue you're looking for doesn't exist — maybe it went to back-issues.
        Let's get you back on track.
      </p>
      <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to="/" className="btn">Home</Link>
        <Link to="/shop/comic-books" className="btn secondary">Shop Comics</Link>
        <Link to="/shop/graphic-novels" className="btn secondary">Shop Graphic Novels</Link>
        <Link to="/contact" className="btn secondary">Contact support</Link>
      </div>
    </div>
  );
}
