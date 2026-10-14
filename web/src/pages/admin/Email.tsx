import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useToast, useConfirm, errorMessage } from '../../components/admin/ui';

type Tab = 'inbox' | 'campaigns' | 'templates' | 'subscribers' | 'sends';

export function AdminEmail() {
  const [tab, setTab] = useState<Tab>('inbox');

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Email</h1>
        {tab === 'campaigns' && <Link to="/admin/email/campaigns/new" className="btn">New campaign</Link>}
      </div>
      <div className="admin-card" style={{ padding: 0, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 .5rem', overflowX: 'auto' }}>
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
                whiteSpace: 'nowrap',
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

// ---------------------------------------------------------------------------
// Inbox: conversations. The list on the left is threads — one per person and
// subject — each holding what they sent and what we replied, in order. A
// reply goes into the open conversation and stays on screen; closing is a
// separate choice. Beside the conversation: who they are, their orders, notes.
// ---------------------------------------------------------------------------

interface ThreadRow {
  id: string; subject: string; contactEmail: string; contactName?: string | null;
  status: 'open' | 'closed'; unreadCount: number; lastMessageAt: string; lastDirection: 'in' | 'out';
  lastSnippet?: string | null; messageCount: number; orderCount: number; hasBounce: boolean;
}
interface ThreadMessage {
  id: string; direction: 'in' | 'out'; sentBy?: string | null; fromEmail: string; fromName?: string | null; toEmail: string;
  subject: string; textBody?: string | null; strippedText?: string | null; htmlBody?: string | null;
  attachments?: { filename: string; contentType: string; size: number }[] | null;
  kind: string; bounceType?: string | null; receivedAt: string; readAt?: string | null;
  delivery?: { status: string; openedAt?: string | null; error?: string | null } | null;
}
interface ThreadDetail extends Omit<ThreadRow, 'messageCount' | 'orderCount' | 'hasBounce'> {
  notes?: string | null;
  messages: ThreadMessage[];
  orders: { id: string; number: string; status: string; paymentStatus: string; totalCents: number; createdAt: string; proofStatus?: string | null }[];
  customer: { id: string; firstName?: string | null; lastName?: string | null } | null;
}

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + (d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : '');
};

function InboxTab() {
  const toast = useToast(); const confirm = useConfirm();
  const [status, setStatus] = useState<'open' | 'closed' | 'all'>('open');
  const [q, setQ] = useState('');
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [counts, setCounts] = useState({ open: 0, closed: 0 });
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(async (keep?: string | null) => {
    const params = new URLSearchParams({ status });
    if (q.trim()) params.set('q', q.trim());
    const r = await api.get<{ threads: ThreadRow[]; counts: { open: number; closed: number } }>(`/admin/email/threads?${params}`);
    setThreads(r.threads);
    setCounts(r.counts);
    setLoaded(true);
    const want = keep === undefined ? selectedId : keep;
    if (want && r.threads.some((t) => t.id === want)) return;
    // The selected conversation left this list (closed, filtered) — keep showing it; only pick another when nothing is open.
    if (!want && r.threads[0]) setSelectedId(r.threads[0].id);
  }, [status, q, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(null); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  // New mail shows up without a reload.
  useEffect(() => { const t = setInterval(() => { void load(); }, 60_000); return () => clearInterval(t); }, [load]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    void api.get<{ thread: ThreadDetail }>(`/admin/email/threads/${selectedId}`).then((r) => {
      if (cancelled) return;
      setDetail(r.thread);
      setThreads((rows) => rows.map((t) => (t.id === selectedId ? { ...t, unreadCount: 0 } : t)));
    }).catch((e) => toast.error(errorMessage(e, 'Could not open the conversation')));
    return () => { cancelled = true; };
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyDetail = (t: ThreadDetail) => {
    setDetail(t);
    setThreads((rows) => rows.map((r) => (r.id === t.id ? { ...r, status: t.status, unreadCount: t.unreadCount, lastMessageAt: t.lastMessageAt, lastDirection: t.lastDirection, lastSnippet: t.lastSnippet, messageCount: t.messages.length } : r)));
  };

  const patch = async (id: string, body: Record<string, unknown>, done?: string) => {
    try {
      const r = await api.patch<{ thread: ThreadDetail }>(`/admin/email/threads/${id}`, body);
      applyDetail(r.thread);
      if (done) toast.success(done);
      await load(id);
    } catch (e) { toast.error(errorMessage(e, 'Could not update the conversation')); }
  };

  const remove = async (id: string) => {
    if (!(await confirm({ title: 'Delete this conversation?', body: 'Every message in it, theirs and ours, is removed. The emails themselves were already sent.', confirmLabel: 'Delete', danger: true }))) return;
    await api.del(`/admin/email/threads/${id}`);
    setSelectedId(null);
    await load(null);
  };

  const unread = threads.reduce((n, t) => n + (t.unreadCount > 0 ? 1 : 0), 0);

  return (
    <div className="inbox">
      <div className="inbox-list admin-card">
        <div className="inbox-toolbar">
          <div className="row" style={{ gap: '.35rem', flexWrap: 'wrap' }}>
            {([['open', `Open${counts.open ? ` (${counts.open})` : ''}`], ['closed', 'Closed'], ['all', 'All']] as const).map(([k, label]) => (
              <button key={k} type="button" className={status === k ? 'btn sm' : 'btn secondary sm'} onClick={() => { setStatus(k); }}>{label}</button>
            ))}
          </div>
          <button type="button" className="btn secondary sm" onClick={() => { setComposing(true); }}>+ New email</button>
        </div>
        <form className="inbox-search" onSubmit={(e) => { e.preventDefault(); void load(null); }}>
          <input placeholder="Search name, email, subject or words in the message" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search conversations" />
          <button type="submit" className="btn secondary sm">Search</button>
        </form>
        <div className="inbox-rows">
          {!loaded ? <p className="muted" style={{ padding: '1rem' }}>Loading…</p>
            : threads.length === 0 ? <p className="muted" style={{ padding: '1rem' }}>{status === 'open' ? 'Nothing waiting for a reply.' : 'No conversations here.'}</p>
            : threads.map((t) => (
              <button key={t.id} type="button" className={`inbox-row${selectedId === t.id ? ' selected' : ''}${t.unreadCount > 0 ? ' unread' : ''}`} onClick={() => { setComposing(false); setSelectedId(t.id); }}>
                <div className="inbox-row-top">
                  <span className="inbox-row-who">{t.contactName || t.contactEmail}</span>
                  <span className="inbox-row-when">{when(t.lastMessageAt)}</span>
                </div>
                <div className="inbox-row-subject">
                  {t.hasBounce && <span className="inbox-pill bounce">bounce</span>}
                  {t.status === 'closed' && status !== 'closed' && <span className="inbox-pill">closed</span>}
                  {t.subject || '(no subject)'}
                </div>
                <div className="inbox-row-snippet">
                  {t.lastDirection === 'out' ? <span className="muted">You: </span> : null}{t.lastSnippet || ''}
                </div>
                <div className="inbox-row-meta">
                  {t.messageCount} message{t.messageCount === 1 ? '' : 's'}{t.orderCount > 0 && <> · {t.orderCount} order{t.orderCount === 1 ? '' : 's'}</>}
                </div>
              </button>
            ))}
        </div>
        {unread > 0 && <div className="muted" style={{ fontSize: '.78rem', padding: '.4rem .9rem', borderTop: '1px solid var(--border)' }}>{unread} unread</div>}
      </div>

      {composing ? (
        <ComposeCard
          onCancel={() => setComposing(false)}
          onSent={async (t) => { setComposing(false); setSelectedId(t.id); setDetail(t); await load(t.id); }}
        />
      ) : !detail ? (
        <div className="admin-card inbox-empty">
          <p className="muted" style={{ margin: 0 }}>{threads.length ? 'Pick a conversation.' : 'When someone emails your Mailgun address, it shows up here. Replies you send from here stay in the conversation.'}</p>
        </div>
      ) : (
        <Conversation
          key={detail.id}
          thread={detail}
          onUpdated={applyDetail}
          onReplied={async (t) => { applyDetail(t); await load(t.id); }}
          onClose={() => void patch(detail.id, { status: 'closed' }, 'Closed. Find it under Closed; a new message from them reopens it.')}
          onReopen={() => void patch(detail.id, { status: 'open' }, 'Reopened.')}
          onUnread={() => void patch(detail.id, { unread: true }, 'Marked unread.')}
          onDelete={() => void remove(detail.id)}
          onSaveNotes={(notes) => void patch(detail.id, { notes }, 'Notes saved.')}
        />
      )}
    </div>
  );
}

function ComposeCard({ onCancel, onSent }: { onCancel: () => void; onSent: (thread: ThreadDetail) => void | Promise<void> }) {
  const toast = useToast();
  const [to, setTo] = useState('');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const canSend = /.+@.+\..+/.test(to.trim()) && subject.trim().length > 0 && text.trim().length > 0 && !busy;
  const send = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ thread: ThreadDetail }>('/admin/email/threads', { to: to.trim(), name: name.trim() || undefined, subject: subject.trim(), text });
      toast.success(`Sent to ${to.trim()}.`);
      await onSent(r.thread);
    } catch (e) { toast.error(errorMessage(e, 'Send failed')); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-card inbox-main">
      <div className="spread"><h3 style={{ margin: 0 }}>New email</h3><button type="button" className="btn secondary sm" onClick={onCancel}>Cancel</button></div>
      <p className="muted" style={{ fontSize: '.85rem' }}>Sent from your Mailgun address with your signature. It starts a conversation here, so their answer lands in this inbox.</p>
      <div className="grid-2">
        <div><label htmlFor="compose-to">To (email)</label><input id="compose-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com" /></div>
        <div><label htmlFor="compose-name">Name (optional)</label><input id="compose-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      </div>
      <label htmlFor="compose-subject">Subject</label>
      <input id="compose-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <label htmlFor="compose-text">Message</label>
      <textarea id="compose-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your message…" />
      <TemplatePicker onPick={(t) => setText((cur) => (cur.trim() ? `${cur.trimEnd()}\n\n${t}` : t))} onSubject={(s) => { if (!subject.trim()) setSubject(s); }} />
      <div className="row" style={{ marginTop: '.75rem' }}>
        <button type="button" className="btn" disabled={!canSend} onClick={() => void send()}>{busy ? 'Sending…' : 'Send email'}</button>
      </div>
    </div>
  );
}

/** Drop a saved template's words into the reply. */
function TemplatePicker({ onPick, onSubject }: { onPick: (text: string) => void; onSubject?: (subject: string) => void }) {
  const [templates, setTemplates] = useState<{ id: string; name: string; subject: string; html: string; text?: string | null }[]>([]);
  useEffect(() => { void api.get<{ templates: any[] }>('/admin/email/templates').then((r) => setTemplates(r.templates)).catch(() => setTemplates([])); }, []);
  if (templates.length === 0) return null;
  return (
    <div className="row" style={{ gap: '.5rem', marginTop: '.5rem', fontSize: '.85rem' }}>
      <label htmlFor="tpl-pick" style={{ margin: 0 }}>Insert template</label>
      <select id="tpl-pick" value="" style={{ width: 'auto', margin: 0 }} onChange={(e) => {
        const t = templates.find((x) => x.id === e.target.value);
        if (!t) return;
        const text = (t.text && t.text.trim()) || t.html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
        onPick(text);
        onSubject?.(t.subject);
      }}>
        <option value="">— pick —</option>
        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
  );
}

function Conversation({ thread, onUpdated, onReplied, onClose, onReopen, onUnread, onDelete, onSaveNotes }: {
  thread: ThreadDetail;
  onUpdated: (t: ThreadDetail) => void;
  onReplied: (t: ThreadDetail) => void | Promise<void>;
  onClose: () => void; onReopen: () => void; onUnread: () => void; onDelete: () => void;
  onSaveNotes: (notes: string) => void;
}) {
  const toast = useToast();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(thread.notes ?? '');
  const [showFull, setShowFull] = useState<Record<string, boolean>>({});
  const endRef = useRef<HTMLDivElement>(null);
  void onUpdated;

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [thread.messages.length]);

  const send = async (close: boolean) => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      const r = await api.post<{ thread: ThreadDetail }>(`/admin/email/threads/${thread.id}/reply`, { text: reply, close });
      setReply('');
      toast.success(close ? 'Reply sent and conversation closed.' : 'Reply sent.');
      await onReplied(r.thread);
    } catch (e) { toast.error(errorMessage(e, 'Reply failed')); }
    finally { setBusy(false); }
  };

  const bounced = thread.messages.some((m) => m.kind === 'bounce');
  return (
    <>
      <div className="admin-card inbox-main" data-testid="conversation">
        <div className="inbox-head">
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, overflowWrap: 'anywhere' }}>{thread.subject || '(no subject)'}</h3>
            <div className="muted" style={{ fontSize: '.85rem' }}>
              <strong>{thread.contactName || thread.contactEmail}</strong>{thread.contactName ? ` <${thread.contactEmail}>` : ''}
              {' · '}{thread.messages.length} message{thread.messages.length === 1 ? '' : 's'}
              {' · '}<span className={`inbox-pill ${thread.status}`}>{thread.status}</span>
            </div>
          </div>
          <div className="row" style={{ gap: '.4rem', flexWrap: 'wrap' }}>
            {thread.status === 'open'
              ? <button type="button" className="btn secondary sm" onClick={onClose} title="Done with this — it moves to Closed and comes back if they write again">Close</button>
              : <button type="button" className="btn secondary sm" onClick={onReopen}>Reopen</button>}
            <button type="button" className="btn secondary sm" onClick={onUnread}>Mark unread</button>
            <button type="button" className="btn secondary sm" style={{ color: '#b91c1c' }} onClick={onDelete}>Delete</button>
          </div>
        </div>

        <div className="inbox-messages">
          {thread.messages.map((m) => {
            const ours = m.direction === 'out';
            const full = showFull[m.id];
            const short = m.strippedText?.trim();
            const long = (m.textBody ?? '').trim();
            const hasMore = !ours && ((short && long && long.length > short.length + 20) || !!m.htmlBody);
            return (
              <article key={m.id} className={`inbox-msg ${ours ? 'ours' : 'theirs'}${m.kind === 'bounce' ? ' bounce' : ''}`} data-direction={m.direction}>
                <header className="inbox-msg-head">
                  <span>
                    <strong>{ours ? `You${m.sentBy ? ` (${m.sentBy})` : ''}` : (m.fromName || m.fromEmail)}</strong>
                    {!ours && m.fromName ? <span className="muted"> &lt;{m.fromEmail}&gt;</span> : null}
                    {m.kind === 'bounce' && <span className="inbox-pill bounce" style={{ marginLeft: '.4rem' }}>{m.bounceType ? `${m.bounceType} bounce` : 'bounce'}</span>}
                  </span>
                  <span className="muted" style={{ fontSize: '.8rem' }}>
                    {new Date(m.receivedAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {ours && m.delivery && (
                      <span className={`inbox-pill ${/BOUNCED|FAILED/.test(m.delivery.status) ? 'bounce' : /OPENED|CLICKED/.test(m.delivery.status) ? 'good' : ''}`} style={{ marginLeft: '.4rem' }} title={m.delivery.error ?? undefined}>
                        {m.delivery.status === 'OPENED' || m.delivery.status === 'CLICKED' ? 'opened' : m.delivery.status === 'DELIVERED' ? 'delivered' : m.delivery.status === 'SENT' ? 'sent' : m.delivery.status.toLowerCase()}
                      </span>
                    )}
                  </span>
                </header>
                {ours || !full ? (
                  <div className="inbox-msg-body">{ours ? (m.textBody ?? '') : (short || long || '(empty message)')}</div>
                ) : m.htmlBody ? (
                  <iframe title="message" srcDoc={m.htmlBody} sandbox="" className="inbox-msg-frame" />
                ) : (
                  <div className="inbox-msg-body">{long}</div>
                )}
                {hasMore && (
                  <button type="button" className="inbox-link" onClick={() => setShowFull({ ...showFull, [m.id]: !full })}>{full ? 'Show the reply only' : 'Show the full message as sent'}</button>
                )}
                {m.attachments && m.attachments.length > 0 && (
                  <div className="muted" style={{ fontSize: '.82rem', marginTop: '.4rem' }}>
                    📎 {m.attachments.map((a) => `${a.filename} (${a.size >= 1048576 ? `${(a.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(a.size / 1024))} KB`})`).join(', ')}
                    <span> — attachments are kept in your Mailgun account's stored messages.</span>
                  </div>
                )}
              </article>
            );
          })}
          <div ref={endRef} />
        </div>

        {bounced && thread.messages.every((m) => m.kind === 'bounce' || m.direction === 'out') ? (
          <p className="muted" style={{ fontSize: '.85rem' }}>This is a bounce notice; there is nobody to reply to. Check the address on their order and send a fresh email.</p>
        ) : (
          <div className="inbox-reply">
            <label htmlFor="reply-text" style={{ marginTop: 0 }}>Reply to {thread.contactName || thread.contactEmail}</label>
            <textarea id="reply-text" rows={6} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Hi ${thread.contactName?.split(' ')[0] || ''},\n\n`} data-testid="reply-text" />
            <TemplatePicker onPick={(t) => setReply((cur) => (cur.trim() ? `${cur.trimEnd()}\n\n${t}` : t))} />
            <div className="row" style={{ gap: '.5rem', marginTop: '.6rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn" disabled={busy || !reply.trim()} onClick={() => void send(false)} data-testid="reply-send">{busy ? 'Sending…' : 'Send reply'}</button>
              <button type="button" className="btn secondary" disabled={busy || !reply.trim()} onClick={() => void send(true)} data-testid="reply-send-close">Send &amp; close</button>
              <span className="muted" style={{ fontSize: '.8rem' }}>Threaded under their message; your signature from Settings → Email is added.</span>
            </div>
          </div>
        )}
      </div>

      <aside className="admin-card inbox-side" aria-label="About this contact">
        <h4 style={{ marginTop: 0 }}>Contact</h4>
        <div style={{ fontSize: '.9rem' }}>
          <div><strong>{thread.contactName || '—'}</strong></div>
          <div style={{ overflowWrap: 'anywhere' }}><a href={`mailto:${thread.contactEmail}`}>{thread.contactEmail}</a></div>
          {thread.customer && <div style={{ marginTop: '.3rem' }}><Link to={`/admin/customers/${thread.customer.id}`}>Open customer</Link></div>}
        </div>
        <h4>Orders</h4>
        {thread.orders.length === 0 ? <p className="muted" style={{ fontSize: '.85rem', marginTop: 0 }}>No orders from this address.</p> : (
          <ul className="inbox-orders">
            {thread.orders.map((o) => (
              <li key={o.id}>
                <Link to={`/admin/orders/${o.id}`}>{o.number}</Link>
                <span className="muted"> · {new Date(o.createdAt).toLocaleDateString()} · {money(o.totalCents)}</span>
                <div><span className="badge">{o.status}</span> {o.paymentStatus !== 'CAPTURED' && <span className="badge">{o.paymentStatus}</span>} {o.proofStatus && <span className="badge">proof: {o.proofStatus.replace(/_/g, ' ')}</span>}</div>
              </li>
            ))}
          </ul>
        )}
        <h4>Notes <span className="muted" style={{ fontWeight: 400, fontSize: '.8rem' }}>(staff only)</span></h4>
        <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the next person should know…" />
        {notes !== (thread.notes ?? '') && <button type="button" className="btn secondary sm" style={{ marginTop: '.4rem' }} onClick={() => onSaveNotes(notes)}>Save notes</button>}
      </aside>
    </>
  );
}

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void api.get<{ campaigns: any[] }>('/admin/email/campaigns').then((r) => setCampaigns(r.campaigns)).finally(() => setLoaded(true));
  }, []);

  return (
    <div className="admin-card">
      {!loaded ? (
        <p className="muted">Loading…</p>
      ) : campaigns.length === 0 ? (
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
  const toast = useToast();
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
    toast.success(`Imported ${r.imported} subscribers.`);
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
