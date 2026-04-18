import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';

interface Inbound {
  id: string;
  messageId?: string | null;
  inReplyTo?: string | null;
  fromEmail: string;
  fromName?: string | null;
  toEmail: string;
  subject: string;
  textBody?: string | null;
  htmlBody?: string | null;
  kind: string;
  bounceType?: string | null;
  handled: boolean;
  receivedAt: string;
}

const FILTERS: { label: string; query: Record<string, string> }[] = [
  { label: 'All', query: {} },
  { label: 'Unhandled', query: { handled: 'false' } },
  { label: 'Replies', query: { kind: 'inbound' } },
  { label: 'Bounces', query: { kind: 'bounce' } },
  { label: 'Handled', query: { handled: 'true' } },
];

export function AdminInbox() {
  const [items, setItems] = useState<Inbound[]>([]);
  const [filter, setFilter] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);

  const load = async () => {
    const qs = new URLSearchParams(FILTERS[filter]!.query).toString();
    const r = await api.get<{ items: Inbound[] }>(`/admin/email/inbound${qs ? `?${qs}` : ''}`);
    setItems(r.items);
    if (r.items.length > 0 && !selectedId) setSelectedId(r.items[0]!.id);
  };

  useEffect(() => { void load(); }, [filter]);

  async function markHandled(id: string, handled: boolean) {
    await api.patch(`/admin/email/inbound/${id}`, { handled });
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this message?')) return;
    await api.del(`/admin/email/inbound/${id}`);
    setSelectedId(null);
    await load();
  }

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <h1 style={{ margin: 0 }}>Inbox</h1>
        <div className="row" style={{ gap: '.25rem' }}>
          {FILTERS.map((f, i) => (
            <button
              key={f.label}
              className={filter === i ? 'btn' : 'btn secondary'}
              style={{ padding: '.35rem .75rem', fontSize: '.85rem' }}
              onClick={() => { setFilter(i); setSelectedId(null); }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: '1rem' }}>
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
                <div className="muted" style={{ fontSize: '.75rem', marginTop: '.25rem' }}>
                  {new Date(it.receivedAt).toLocaleString()}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="admin-card" style={{ margin: 0 }}>
          {selected ? (
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
                    onClick={() => void markHandled(selected.id, !selected.handled)}
                  >
                    {selected.handled ? 'Mark unread' : 'Mark handled'}
                  </button>
                  <a className="btn secondary" href={`mailto:${selected.fromEmail}?subject=Re: ${encodeURIComponent(selected.subject)}`}>
                    Reply
                  </a>
                  <button className="btn secondary" style={{ color: '#b91c1c' }} onClick={() => void remove(selected.id)}>
                    Delete
                  </button>
                </div>
              </div>

              {selected.inReplyTo && (
                <div className="muted" style={{ fontSize: '.75rem', marginBottom: '.75rem' }}>
                  In reply to: <code>{selected.inReplyTo}</code>
                </div>
              )}

              {selected.htmlBody ? (
                <iframe
                  title="message"
                  srcDoc={selected.htmlBody}
                  sandbox=""
                  style={{ width: '100%', minHeight: 480, border: '1px solid var(--border)', borderRadius: 4 }}
                />
              ) : (
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
                  {selected.textBody ?? '(empty body)'}
                </pre>
              )}
            </>
          ) : (
            <p className="muted">Select a message.</p>
          )}
        </div>
      </div>
    </div>
  );
}
