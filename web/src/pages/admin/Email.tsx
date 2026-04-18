import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

type Tab = 'inbox' | 'campaigns' | 'templates' | 'subscribers' | 'sends';

export function AdminEmail() {
  const [tab, setTab] = useState<Tab>('inbox');

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Email Center</h1>
        {tab === 'campaigns' && <Link to="/admin/email/campaigns/new" className="btn">New campaign</Link>}
      </div>
      <div className="admin-card" style={{ padding: 0, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 .5rem' }}>
          {(['inbox', 'campaigns', 'templates', 'subscribers', 'sends'] as Tab[]).map((t) => (
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
      {tab === 'inbox' && <InboxTab />}
      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'subscribers' && <SubscribersTab />}
      {tab === 'sends' && <SendsTab />}
    </div>
  );
}

interface InboundMessage {
  id: string;
  messageId?: string | null;
  inReplyTo?: string | null;
  fromEmail: string;
  fromName?: string | null;
  toEmail: string;
  subject: string;
  strippedText?: string | null;
  kind: string;
  bounceType?: string | null;
  linkedSendId?: string | null;
  handled: boolean;
  receivedAt: string;
}

interface InboundFull extends InboundMessage {
  textBody?: string | null;
  htmlBody?: string | null;
  attachments?: { filename: string; contentType: string; size: number }[] | null;
}

const INBOX_FILTERS: { label: string; query: Record<string, string> }[] = [
  { label: 'Unhandled', query: { handled: 'false' } },
  { label: 'All', query: {} },
  { label: 'Replies', query: { kind: 'inbound' } },
  { label: 'Bounces', query: { kind: 'bounce' } },
  { label: 'Handled', query: { handled: 'true' } },
];

function InboxTab() {
  const [items, setItems] = useState<InboundMessage[]>([]);
  const [filter, setFilter] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<InboundFull | null>(null);
  const [replyHtml, setReplyHtml] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);

  const load = async () => {
    const params = { ...INBOX_FILTERS[filter]!.query };
    if (search) (params as any).q = search;
    const qs = new URLSearchParams(params).toString();
    const r = await api.get<{ items: InboundMessage[] }>(`/admin/email/inbound${qs ? `?${qs}` : ''}`);
    setItems(r.items);
    if (r.items.length > 0 && !selectedId) setSelectedId(r.items[0]!.id);
    else if (r.items.length === 0) { setSelectedId(null); setSelected(null); }
  };

  useEffect(() => { void load(); }, [filter]);

  useEffect(() => {
    if (!selectedId) return setSelected(null);
    void api.get<{ item: InboundFull }>(`/admin/email/inbound/${selectedId}`).then((r) => setSelected(r.item));
  }, [selectedId]);

  async function toggleHandled(id: string, handled: boolean) {
    await api.patch(`/admin/email/inbound/${id}`, { handled });
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this message?')) return;
    await api.del(`/admin/email/inbound/${id}`);
    setSelectedId(null);
    await load();
  }

  async function sendReply() {
    if (!selected || !replyHtml.trim()) return;
    setReplyBusy(true);
    try {
      await api.post(`/admin/email/inbound/${selected.id}/reply`, {
        html: replyHtml,
        text: replyHtml.replace(/<[^>]+>/g, ''),
      });
      setReplyHtml('');
      await load();
    } catch (e: any) {
      alert(e.message ?? 'Reply failed');
    } finally {
      setReplyBusy(false);
    }
  }

  return (
    <div>
      <div className="row" style={{ gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {INBOX_FILTERS.map((f, i) => (
          <button
            key={f.label}
            className={filter === i ? 'btn' : 'btn secondary'}
            style={{ padding: '.35rem .75rem', fontSize: '.85rem' }}
            onClick={() => { setFilter(i); setSelectedId(null); }}
          >
            {f.label}
          </button>
        ))}
        <form
          onSubmit={(e) => { e.preventDefault(); void load(); }}
          style={{ marginLeft: 'auto', display: 'flex', gap: '.5rem' }}
        >
          <input
            placeholder="Search subject or sender"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 240 }}
          />
          <button className="btn secondary" style={{ padding: '.35rem .75rem', fontSize: '.85rem' }}>Search</button>
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: '1rem' }}>
        <div className="admin-card" style={{ margin: 0, padding: 0, maxHeight: '70vh', overflowY: 'auto' }}>
          {items.length === 0 ? (
            <p className="muted" style={{ padding: '1rem' }}>No messages.</p>
          ) : (
            items.map((it) => (
              <button
                key={it.id}
                onClick={() => setSelectedId(it.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '.75rem 1rem', border: 'none',
                  background: selectedId === it.id ? 'var(--bg-alt)' : '#fff',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                <div className="spread" style={{ marginBottom: '.25rem' }}>
                  <strong style={{ fontSize: '.9rem', fontWeight: it.handled ? 400 : 700 }}>
                    {it.fromName || it.fromEmail}
                  </strong>
                  {it.kind === 'bounce' && (
                    <span style={{ background: '#fee2e2', color: '#991b1b', padding: '.1rem .4rem', borderRadius: 4, fontSize: '.7rem', fontWeight: 600 }}>
                      {it.bounceType ?? 'bounce'}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '.85rem', color: 'var(--ink)', fontWeight: it.handled ? 400 : 500 }}>
                  {it.subject || '(no subject)'}
                </div>
                {it.strippedText && (
                  <div className="muted" style={{ fontSize: '.78rem', marginTop: '.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.strippedText.slice(0, 120)}
                  </div>
                )}
                <div className="muted" style={{ fontSize: '.75rem', marginTop: '.25rem' }}>
                  {new Date(it.receivedAt).toLocaleString()}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="admin-card" style={{ margin: 0 }}>
          {!selected ? (
            <p className="muted">Select a message.</p>
          ) : (
            <>
              <div className="spread" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{selected.subject || '(no subject)'}</h3>
                  <div className="muted" style={{ fontSize: '.85rem' }}>
                    From <strong>{selected.fromName || selected.fromEmail}</strong> &lt;{selected.fromEmail}&gt;
                    {' · '}to {selected.toEmail}
                    {' · '}{new Date(selected.receivedAt).toLocaleString()}
                  </div>
                </div>
                <div className="row" style={{ gap: '.5rem' }}>
                  <button
                    className="btn secondary"
                    onClick={() => void toggleHandled(selected.id, !selected.handled)}
                  >
                    {selected.handled ? 'Mark unhandled' : 'Mark handled'}
                  </button>
                  <button className="btn secondary" style={{ color: '#b91c1c' }} onClick={() => void remove(selected.id)}>
                    Delete
                  </button>
                </div>
              </div>

              {selected.inReplyTo && (
                <div className="muted" style={{ fontSize: '.75rem', marginBottom: '.75rem' }}>
                  In reply to: <code>{selected.inReplyTo}</code>
                  {selected.linkedSendId && <> · Linked to send: <code>{selected.linkedSendId}</code></>}
                </div>
              )}

              {selected.attachments && selected.attachments.length > 0 && (
                <div className="muted" style={{ fontSize: '.85rem', marginBottom: '.75rem' }}>
                  Attachments: {selected.attachments.map((a) => a.filename).join(', ')}
                </div>
              )}

              {selected.htmlBody ? (
                <iframe
                  title="message"
                  srcDoc={selected.htmlBody}
                  sandbox=""
                  style={{ width: '100%', minHeight: 360, border: '1px solid var(--border)', borderRadius: 4 }}
                />
              ) : (
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, padding: '.5rem', background: 'var(--bg-alt)', borderRadius: 4 }}>
                  {selected.strippedText ?? selected.textBody ?? '(empty body)'}
                </pre>
              )}

              {selected.kind !== 'bounce' && (
                <div style={{ marginTop: '1rem' }}>
                  <h4>Reply</h4>
                  <textarea
                    rows={6}
                    value={replyHtml}
                    onChange={(e) => setReplyHtml(e.target.value)}
                    placeholder={`Re: ${selected.subject}\n\nHi ${selected.fromName || ''},\n\n`}
                  />
                  <div className="row" style={{ marginTop: '.5rem' }}>
                    <button className="btn" disabled={replyBusy || !replyHtml.trim()} onClick={() => void sendReply()}>
                      {replyBusy ? 'Sending…' : 'Send reply'}
                    </button>
                    <span className="muted" style={{ fontSize: '.8rem' }}>
                      Sent from {selected.toEmail || 'your configured From address'}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
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
