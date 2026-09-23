import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../store/auth';

/**
 * Behind the older per-proof email links (/proof/<token>). Proofs are now
 * reviewed in the customer's account, so this page gets them there: it
 * creates the account's password if there is none yet (the link proves they
 * hold the order's inbox), or asks them to sign in, and then opens the
 * order's proofs.
 */

interface Access {
  orderNumber: string;
  email: string;
  hasPassword: boolean;
  signedInAsOwner: boolean;
  next: string;
}

const PAGE_STYLE = { padding: '2rem 0', maxWidth: 560 } as const;

export function ProofReview() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { load } = useAuth();
  const [access, setAccess] = useState<Access | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setNotFound(true); return; }
    let active = true;
    api.get<Access>(`/proofing/proof/${token}/access`)
      .then((a) => {
        if (!active) return;
        if (a.signedInAsOwner) navigate(a.next, { replace: true });
        else setAccess(a);
      })
      .catch((e) => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setLoadError(e instanceof Error ? e.message : 'Could not open this proof link.');
      });
    return () => { active = false; };
  }, [token, navigate]);

  async function createAccount(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      const r = await api.post<{ next: string }>(`/proofing/proof/${token}/setup`, {
        password, firstName: firstName.trim() || undefined, lastName: lastName.trim() || undefined,
      });
      await load();
      navigate(r.next, { replace: true });
    } catch (err: any) {
      setError(err.message ?? 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className="container" style={PAGE_STYLE}>
        <h1>We couldn't find that proof</h1>
        <p className="muted">This link may have expired. Every proof for your orders is in your account — sign in with the email you ordered with.</p>
        <Link to="/login?redirect=/account/proofs" className="btn">Go to my proofs</Link>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="container" style={PAGE_STYLE}>
        <div className="error">{loadError}</div>
        <Link to="/" className="btn secondary">Back to home</Link>
      </div>
    );
  }
  if (!access) return <div className="container" style={PAGE_STYLE}>Opening your proof…</div>;

  const loginHref = `/login?redirect=${encodeURIComponent(access.next)}&email=${encodeURIComponent(access.email)}`;

  return (
    <div className="container" style={PAGE_STYLE}>
      <div style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderLeft: '4px solid var(--brand)', borderRadius: 'var(--radius)' }}>
        <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Proofs for order {access.orderNumber} now live in your account.</div>
        <div className="muted" style={{ marginTop: '.35rem', fontSize: '.9rem' }}>
          Every proof for the order is together there, with approve and request-changes buttons — no more hunting through emails. Nothing prints until you approve every one.
        </div>
      </div>

      {access.hasPassword ? (
        <div className="auth-box" style={{ margin: 0 }}>
          <h1>Sign in to view your proofs</h1>
          <p className="muted" style={{ marginTop: 0 }}>Your account is <strong>{access.email}</strong>.</p>
          <Link to={loginHref} className="btn" style={{ display: 'block', textAlign: 'center' }}>Sign in</Link>
          <p className="muted" style={{ marginTop: '1rem', fontSize: '.9rem' }}>
            Forgotten your password? <Link to="/forgot-password">Reset it</Link>.
          </p>
        </div>
      ) : (
        <div className="auth-box" style={{ margin: 0 }}>
          <h1>Create your account to view your proofs</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            An account was created with your order. Choose a password and you're in — your proofs, orders and any files we need from you will all be in one place.
          </p>
          <form onSubmit={createAccount}>
            <label>Email</label>
            <input type="email" value={access.email} disabled />
            <div className="grid-2">
              <div>
                <label>First name</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
              </div>
              <div>
                <label>Last name</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
              </div>
            </div>
            <label>Password (min. 8 characters)</label>
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            <label>Confirm password</label>
            <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            {error && <div className="error">{error}</div>}
            <button className="btn" style={{ width: '100%', marginTop: '1rem' }} disabled={busy}>
              {busy ? 'Creating…' : 'Create my account & view proofs'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
