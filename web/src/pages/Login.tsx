import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../store/auth';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate(redirect);
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-box">
      <h1>Log in</h1>
      <form onSubmit={onSubmit}>
        <label>Email</label>
        <input type="email" value={email} required onChange={(e) => setEmail(e.target.value)} />
        <label>Password</label>
        <input type="password" value={password} required onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="error">{error}</div>}
        <button className="btn" style={{ width: '100%', marginTop: '1rem' }} disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p style={{ marginTop: '1rem' }} className="muted">
        No account? <Link to="/register">Register</Link>
      </p>
    </div>
  );
}
