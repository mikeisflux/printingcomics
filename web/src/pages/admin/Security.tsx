import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface Stats {
  activeUsers: number;
  blockedIPs: number;
  failedLogins24h: number;
  users2FAEnabled: number;
  blockedPreview: any[];
}

interface Blocked {
  ipAddress: string;
  reason: string;
  violationCount: number;
  blockedAt: string;
  expiresAt: string;
  lastPath?: string | null;
  lastUserAgent?: string | null;
}

interface Event {
  id: string;
  ipAddress: string;
  reason: string;
  path?: string | null;
  createdAt: string;
}

export function AdminSecurity() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  const load = async () => {
    const [s, b, e] = await Promise.all([
      api.get<Stats>('/admin/security/stats'),
      api.get<{ blocked: Blocked[] }>('/admin/security/blocked'),
      api.get<{ events: Event[] }>('/admin/security/suspicious'),
    ]);
    setStats(s);
    setBlocked(b.blocked);
    setEvents(e.events);
  };

  useEffect(() => { void load(); }, []);

  const unblock = async (ip: string) => {
    if (!confirm(`Unblock ${ip}?`)) return;
    await api.del(`/admin/security/block/${encodeURIComponent(ip)}`);
    void load();
  };

  const blockManual = async () => {
    const ip = prompt('IP to block');
    if (!ip) return;
    const reason = prompt('Reason', 'Manual block') ?? 'Manual block';
    await api.post('/admin/security/block', { ip, reason });
    void load();
  };

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Security</h1>
        <button className="btn" onClick={blockManual}>Block an IP</button>
      </div>

      {stats && (
        <div className="stat-grid">
          <div className="stat"><div className="label">Users</div><div className="value">{stats.activeUsers}</div></div>
          <div className="stat"><div className="label">Blocked IPs</div><div className="value" style={{ color: stats.blockedIPs > 0 ? '#b91c1c' : 'var(--brand)' }}>{stats.blockedIPs}</div></div>
          <div className="stat"><div className="label">Suspicious (24h)</div><div className="value">{stats.failedLogins24h}</div></div>
          <div className="stat"><div className="label">2FA enabled</div><div className="value">{stats.users2FAEnabled}</div></div>
        </div>
      )}

      <div className="admin-card">
        <h3>Blocked IPs</h3>
        {blocked.length === 0 ? (
          <p className="muted">No blocked IPs right now.</p>
        ) : (
          <table className="admin-table">
            <thead><tr><th>IP</th><th>Reason</th><th>Violations</th><th>Blocked</th><th>Expires</th><th /></tr></thead>
            <tbody>
              {blocked.map((b) => (
                <tr key={b.ipAddress}>
                  <td>{b.ipAddress}</td>
                  <td>{b.reason}</td>
                  <td>{b.violationCount}</td>
                  <td>{new Date(b.blockedAt).toLocaleString()}</td>
                  <td>{new Date(b.expiresAt).toLocaleString()}</td>
                  <td><button className="btn secondary" onClick={() => unblock(b.ipAddress)}>Unblock</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="admin-card">
        <h3>Recent suspicious activity</h3>
        {events.length === 0 ? (
          <p className="muted">Nothing suspicious logged.</p>
        ) : (
          <table className="admin-table">
            <thead><tr><th>When</th><th>IP</th><th>Reason</th><th>Path</th></tr></thead>
            <tbody>
              {events.slice(0, 100).map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.createdAt).toLocaleString()}</td>
                  <td>{e.ipAddress}</td>
                  <td>{e.reason}</td>
                  <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
