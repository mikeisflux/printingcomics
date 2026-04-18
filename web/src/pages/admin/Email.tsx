import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

type Tab = 'campaigns' | 'templates' | 'subscribers' | 'sends';

export function AdminEmail() {
  const [tab, setTab] = useState<Tab>('campaigns');

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Email Center</h1>
        <Link to="/admin/email/campaigns/new" className="btn">New campaign</Link>
      </div>
      <div className="admin-card" style={{ padding: 0, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 .5rem' }}>
          {(['campaigns', 'templates', 'subscribers', 'sends'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '.85rem 1rem',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t ? '3px solid var(--brand)' : '3px solid transparent',
                color: tab === t ? 'var(--brand)' : 'var(--ink)',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'subscribers' && <SubscribersTab />}
      {tab === 'sends' && <SendsTab />}
    </div>
  );
}

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  useEffect(() => {
    void api.get<{ campaigns: any[] }>('/admin/email/campaigns').then((r) => setCampaigns(r.campaigns));
  }, []);

  return (
    <div className="admin-card">
      {campaigns.length === 0 ? (
        <p className="muted">No campaigns yet. <Link to="/admin/email/campaigns/new">Create one</Link>.</p>
      ) : (
        <table className="admin-table">
          <thead><tr><th>Name</th><th>Subject</th><th>Status</th><th>Sends</th><th>Attachments</th><th>Updated</th></tr></thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/admin/email/campaigns/${c.id}`}>{c.name}</Link></td>
                <td>{c.subject}</td>
                <td><span className="badge">{c.status}</span></td>
                <td>{c._count.sends}</td>
                <td>{c._count.attachments}</td>
                <td>{new Date(c.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TemplatesTab() {
  const [templates, setTemplates] = useState<any[]>([]);
  useEffect(() => {
    void api.get<{ templates: any[] }>('/admin/email/templates').then((r) => setTemplates(r.templates));
  }, []);

  return (
    <div className="admin-card">
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>Templates</h3>
        <Link to="/admin/email/templates/new" className="btn">New template</Link>
      </div>
      {templates.length === 0 ? (
        <p className="muted">No templates yet.</p>
      ) : (
        <table className="admin-table">
          <thead><tr><th>Name</th><th>Subject</th><th>Updated</th></tr></thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td><Link to={`/admin/email/templates/${t.id}`}>{t.name}</Link></td>
                <td>{t.subject}</td>
                <td>{new Date(t.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SubscribersTab() {
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [showImport, setShowImport] = useState(false);

  const load = () => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    void api.get<{ subscribers: any[] }>(`/admin/email/subscribers${qs}`).then((r) => setSubscribers(r.subscribers));
  };

  useEffect(load, []);

  const importCsv = async () => {
    const r = await api.post<{ imported: number }>('/admin/email/subscribers/import', { text: bulkText });
    alert(`Imported ${r.imported} subscribers.`);
    setBulkText('');
    setShowImport(false);
    load();
  };

  return (
    <>
      <div className="admin-card">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: 'flex', gap: '.5rem' }}>
          <input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn">Search</button>
          <button type="button" className="btn secondary" onClick={() => setShowImport(!showImport)}>
            {showImport ? 'Cancel import' : 'Import CSV'}
          </button>
        </form>
        {showImport && (
          <div style={{ marginTop: '1rem' }}>
            <label>Paste emails (one per line or comma-separated)</label>
            <textarea rows={6} value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
            <button className="btn" onClick={importCsv} style={{ marginTop: '.5rem' }}>Import</button>
          </div>
        )}
      </div>
      <div className="admin-card">
        <table className="admin-table">
          <thead><tr><th>Email</th><th>Name</th><th>Opted in</th><th>Tags</th><th>Joined</th></tr></thead>
          <tbody>
            {subscribers.map((s) => (
              <tr key={s.id}>
                <td>{s.email}</td>
                <td>{s.firstName} {s.lastName}</td>
                <td>{s.optedIn ? 'Yes' : 'No'}</td>
                <td>{(s.tags ?? []).join(', ')}</td>
                <td>{new Date(s.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SendsTab() {
  const [sends, setSends] = useState<any[]>([]);
  useEffect(() => {
    void api.get<{ sends: any[] }>('/admin/email/sends').then((r) => setSends(r.sends));
  }, []);
  return (
    <div className="admin-card">
      <h3>Send log (last 200)</h3>
      <table className="admin-table">
        <thead><tr><th>When</th><th>To</th><th>Subject</th><th>Campaign</th><th>Status</th></tr></thead>
        <tbody>
          {sends.map((s) => (
            <tr key={s.id}>
              <td>{new Date(s.createdAt).toLocaleString()}</td>
              <td>{s.toEmail}</td>
              <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.subject}</td>
              <td>{s.campaign?.name ?? '—'}</td>
              <td>
                <span className="badge" style={{
                  background: s.status === 'DELIVERED' || s.status === 'OPENED' || s.status === 'CLICKED' ? '#d4f5dc' : s.status === 'FAILED' || s.status === 'BOUNCED' ? '#f8d7da' : '#fff3cd',
                }}>{s.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
