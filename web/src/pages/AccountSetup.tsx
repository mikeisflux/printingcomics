import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../store/auth';

/**
 * First visit for an account that was created at checkout: the customer is
 * already signed in (through an emailed link) and chooses a name and password
 * before seeing anything else. `next` is where the email was taking them.
 */
export function AccountSetup() {
  const { user, loaded, load } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawNext = params.get('next') ?? '/account/proofs';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/account/proofs';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);
  useEffect(() => {
    if (!loaded) return;
    if (!user) navigate(`/login?redirect=${encodeURIComponent(next)}`, { replace: true });
    else if (user.hasPassword !== false) navigate(next, { replace: true });
  }, [loaded, user, navigate, next]);
  useEffect(() => {
    if (user) { setFirstName(user.firstName ?? ''); setLastName(user.lastName ?? ''); }
  }, [user]);

  if (!user || user.hasPassword !== false) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      await api.post('/account/setup', { password, firstName: firstName.trim() || undefined, lastName: lastName.trim() || undefined });
      await load();
      navigate(next, { replace: true });
    } catch (err: any) {
      setError(err.message ?? 'Could not finish setting up your account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-box">
      <h1>Finish setting up your account</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Your account was created with your order. Choose a password and you can sign in any time to see your orders, approve proofs and send us files.
      </p>
      <form onSubmit={onSubmit}>
        <label>Email</label>
        <input type="email" value={user.email} disabled />
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
          {busy ? 'Saving…' : 'Create my account'}
        </button>
      </form>
    </div>
  );
}
