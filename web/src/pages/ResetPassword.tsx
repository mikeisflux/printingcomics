import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (!token) { setError('Missing reset token'); return; }
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 1800);
    } catch (e: any) {
      setError(e.message ?? 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ padding: '3rem 0', maxWidth: 460 }}>
      <h1>Choose a new password</h1>
      {done ? (
        <div className="admin-card" style={{ background: '#d4f5dc', border: '1px solid #166534' }}>
          <p style={{ margin: 0 }}>Password updated. Redirecting to log in…</p>
        </div>
      ) : (
        <form onSubmit={submit} className="admin-card">
          <label>New password (min 8 characters)</label>
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          <label>Confirm new password</label>
          <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {error && <div className="error">{error}</div>}
          <div className="row" style={{ marginTop: '1rem' }}>
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
            <Link to="/login" className="btn secondary">Back to log in</Link>
          </div>
        </form>
      )}
    </div>
  );
}
