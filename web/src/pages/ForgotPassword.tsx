import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (e: any) {
      setError(e.message ?? 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ padding: '3rem 0', maxWidth: 460 }}>
      <h1>Forgot your password?</h1>
      {sent ? (
        <div className="admin-card" style={{ background: '#d4f5dc', border: '1px solid #166534' }}>
          <p style={{ margin: 0 }}>
            If <strong>{email}</strong> is on file, we just sent a reset link there.
            Check your inbox (and spam folder). The link expires in 1 hour.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="admin-card">
          <p className="muted">
            Enter the email you used to sign up. We'll send you a one-time link to choose a new password.
          </p>
          <label>Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <div className="error">{error}</div>}
          <div className="row" style={{ marginTop: '1rem' }}>
            <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
            <Link to="/login" className="btn secondary">Back to log in</Link>
          </div>
        </form>
      )}
    </div>
  );
}
