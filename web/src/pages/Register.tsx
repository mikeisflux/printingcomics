import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await register(form.email, form.password, form.firstName, form.lastName);
      if (r === 'claim') { setClaimed(true); return; }
      navigate('/account');
    } catch (err: any) {
      setError(err.message ?? 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  if (claimed) {
    return (
      <div className="auth-box">
        <h1>Check your email</h1>
        <p>
          There is already an account for <strong>{form.email}</strong> — one is created with every order.
          We just emailed that address a link to choose a password. Open it and everything you have ordered will be waiting for you.
        </p>
        <p className="muted" style={{ fontSize: '.9rem' }}>No email after a few minutes? Check spam, or <Link to="/forgot-password">request another link</Link>.</p>
      </div>
    );
  }

  return (
    <div className="auth-box">
      <h1>Create account</h1>
      <form onSubmit={onSubmit}>
        <div className="grid-2">
          <div>
            <label>First name</label>
            <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </div>
          <div>
            <label>Last name</label>
            <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </div>
        </div>
        <label>Email</label>
        <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <label>Password (min. 8 chars)</label>
        <input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <div className="error">{error}</div>}
        <button className="btn" style={{ width: '100%', marginTop: '1rem' }} disabled={busy}>
          {busy ? 'Creating account…' : 'Register'}
        </button>
      </form>
      <p style={{ marginTop: '1rem' }} className="muted">
        Already have one? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
