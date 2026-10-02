import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';

/**
 * /upload/<token> — the link in older "we need updated files" emails and
 * the one staff copy from the admin. It proves the visitor has the order's
 * inbox, so it is swapped for a sign-in link straight to the order screen,
 * where each book has its Cover PDF and Interior PDF upload spots.
 */
export function CorrectedUpload() {
  const { token } = useParams();
  const [state, setState] = useState<{ url: string; orderNumber: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) { setNotFound(true); return; }
    api.post<{ url: string; orderNumber: string }>(`/proofing/media-request/${token}/link`)
      .then((r) => { setState(r); window.location.assign(r.url); })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(e instanceof Error ? e.message : 'Could not open your order.');
      });
  }, [token]);

  if (notFound) {
    return (
      <div className="container" style={{ padding: '2rem 0', maxWidth: 760 }}>
        <h1>We couldn't find that upload request</h1>
        <p className="muted">This link may have expired. Sign in to your account to see your orders, or reply to the email we sent you.</p>
        <Link to="/login" className="btn">Sign in</Link>
      </div>
    );
  }
  if (error) {
    return (
      <div className="container" style={{ padding: '2rem 0', maxWidth: 760 }}>
        <div className="error">{error}</div>
        <Link to="/login" className="btn secondary">Sign in instead</Link>
      </div>
    );
  }
  return (
    <div className="container" style={{ padding: '2rem 0', maxWidth: 760 }}>
      <h1>Opening your order{state ? ` ${state.orderNumber}` : ''}…</h1>
      <p className="muted">You'll be signed in and taken to the order, where each book has a Cover PDF and an Interior PDF upload spot.</p>
      {state && <a className="btn" href={state.url}>Open the order</a>}
    </div>
  );
}
