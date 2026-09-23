import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { ProofDecision, formatDateTime, type DecisionProof } from '../components/ProofDecision';

/**
 * Account → Proofs & files: everything waiting on the customer, in one place.
 * Orders with proofs to approve or files to send come first; approved and
 * revised proofs stay visible underneath as history. Also embedded on the
 * order page for one order (`only`).
 */

export interface ProofOrder {
  id: string;
  number: string;
  status: string;
  proofStatus: string | null;
  createdAt: string;
  items: { id: string; name: string; quantity: number; title: string }[];
  proofs: (DecisionProof & { kind: string | null; createdAt: string })[];
  pendingProofs: number;
  awaitingUpload: boolean;
  mediaRequests: { id: string; message: string; status: string; createdAt: string; fulfilledAt: string | null }[];
}

interface ProofsResponse { orders: ProofOrder[]; terms: string; pendingProofs: number; openRequests: number }

export function useAccountProofs() {
  const [data, setData] = useState<ProofsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api.get<ProofsResponse>('/account/proofs').then(setData).catch((e: any) => setError(e?.message ?? 'Could not load your proofs'));
  useEffect(() => { void load(); }, []);
  return { data, error, reload: load };
}

function FileRequest({ request, orderNumber, onDone }: { request: ProofOrder['mediaRequests'][number]; orderNumber: string; onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  async function upload() {
    if (files.length === 0) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      const res = await fetch(`/api/account/media-requests/${request.id}/upload`, { method: 'POST', credentials: 'include', body: fd });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Upload failed. Please try again.');
      const r = (await res.json()) as { count: number };
      setDone(r.count); setFiles([]); onDone();
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed. Please try again.'); }
    finally { setBusy(false); }
  }

  if (request.status === 'fulfilled' || done !== null) {
    return (
      <div className="admin-card" style={{ background: '#d4f5dc', border: '1px solid #166534' }}>
        <strong>✓ Files received{done !== null ? ` — ${done} file${done === 1 ? '' : 's'} uploaded` : ''}.</strong>
        <div className="muted" style={{ fontSize: '.85rem' }}>Our team will take it from here for order {orderNumber}.</div>
      </div>
    );
  }
  return (
    <div className="admin-card" style={{ borderLeft: '4px solid var(--brand)' }}>
      <h3 style={{ marginTop: 0 }}>We need updated files</h3>
      <blockquote style={{ borderLeft: '3px solid var(--border)', margin: '0 0 .75rem', padding: '.25rem 1rem', whiteSpace: 'pre-wrap' }}>{request.message}</blockquote>
      <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      {files.length > 0 && <p className="muted" style={{ fontSize: '.85rem', margin: '.35rem 0 0' }}>{files.map((f) => f.name).join(', ')}</p>}
      {error && <div className="error">{error}</div>}
      <button className="btn" type="button" style={{ marginTop: '.75rem' }} disabled={busy || files.length === 0} onClick={upload}>
        {busy ? 'Uploading…' : `Send ${files.length || ''} file${files.length === 1 ? '' : 's'}`}
      </button>
    </div>
  );
}

const STATUS_TEXT: Record<string, { text: string; color: string }> = {
  pending: { text: 'Waiting for your approval', color: '#b45309' },
  approved: { text: 'Approved', color: '#166534' },
  changes_requested: { text: 'Changes requested — new version coming', color: '#7b2cbf' },
};

export function ProofOrderCard({ order, terms, onChange, open: forceOpen }: { order: ProofOrder; terms: string; onChange: () => void; open?: boolean }) {
  const [openProof, setOpenProof] = useState<string | null>(() => order.proofs.find((p) => p.status === 'pending')?.id ?? null);
  const needsYou = order.pendingProofs > 0 || order.mediaRequests.some((m) => m.status === 'open');

  return (
    <div className="admin-card" style={{ borderTop: needsYou ? '4px solid var(--brand)' : undefined }}>
      <div className="spread" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>
            Order <Link to={`/order/${order.number}`}>{order.number}</Link>
          </h2>
          <div className="muted" style={{ fontSize: '.85rem' }}>
            {order.items.map((i) => (i.title ? `“${i.title}”` : i.name)).join(' · ')}
          </div>
        </div>
        <div style={{ fontWeight: 700, color: needsYou ? 'var(--brand)' : '#166534' }}>
          {order.pendingProofs > 0
            ? `${order.pendingProofs} proof${order.pendingProofs === 1 ? '' : 's'} to approve`
            : order.awaitingUpload ? 'Proofs being prepared'
            : order.proofStatus === 'approved' ? '✓ All proofs approved'
            : order.mediaRequests.some((m) => m.status === 'open') ? 'Files needed' : ''}
        </div>
      </div>

      {order.mediaRequests.filter((m) => m.status === 'open').map((m) => (
        <FileRequest key={m.id} request={m} orderNumber={order.number} onDone={onChange} />
      ))}

      {order.awaitingUpload && (
        <p className="muted" style={{ margin: '.75rem 0 0' }}>You asked for a proof before printing. Our team is preparing it — you’ll get one email when it’s ready, and it will appear here.</p>
      )}

      {order.proofs.length > 0 && (
        <div style={{ marginTop: '.75rem', display: 'grid', gap: '.5rem' }}>
          {order.proofs.map((p) => {
            const st = STATUS_TEXT[p.status] ?? { text: p.status, color: 'var(--muted)' };
            const isOpen = forceOpen || openProof === p.id;
            return (
              <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setOpenProof(isOpen && !forceOpen ? null : p.id)}
                  style={{ width: '100%', textAlign: 'left', background: isOpen ? 'var(--bg-alt)' : '#fff', border: 'none', padding: '.7rem .9rem', cursor: 'pointer', font: 'inherit', display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}
                >
                  <span>
                    <strong>{p.kindLabel ?? 'Proof'}</strong>
                    {p.itemTitle ? <> — “{p.itemTitle}”</> : p.itemName ? <> — {p.itemName}</> : null}
                    <span className="muted"> · v{p.version}</span>
                  </span>
                  <span style={{ color: st.color, fontWeight: 600, fontSize: '.9rem' }}>
                    {st.text}{p.status !== 'pending' && p.decidedAt ? <span className="muted" style={{ fontWeight: 400 }}> · {formatDateTime(p.decidedAt)}</span> : null}
                    <span className="muted" style={{ marginLeft: '.6rem' }}>{isOpen ? '▴' : '▾'}</span>
                  </span>
                </button>
                {isOpen && (
                  <div style={{ padding: '.75rem .9rem', borderTop: '1px solid var(--border)' }}>
                    <ProofDecision
                      proof={p}
                      terms={terms}
                      compact
                      approve={(name) => api.post(`/account/proofs/${p.id}/approve`, { name, acceptTerms: true })}
                      requestChanges={(note) => api.post(`/account/proofs/${p.id}/changes`, { note })}
                      onDecided={() => onChange()}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AccountProofs() {
  const { data, error, reload } = useAccountProofs();
  const [params] = useSearchParams();
  const focus = params.get('order');
  const scrolled = useRef(false);

  useEffect(() => {
    if (!data || !focus || scrolled.current) return;
    const el = document.getElementById(`order-${focus}`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); scrolled.current = true; }
  }, [data, focus]);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="muted">Loading your proofs…</div>;

  const needsYou = data.orders.filter((o) => o.pendingProofs > 0 || o.mediaRequests.some((m) => m.status === 'open'));
  const rest = data.orders.filter((o) => !needsYou.includes(o));

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Proofs &amp; files</h1>
      <div style={{ padding: '.8rem 1rem', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderLeft: '4px solid var(--brand)', borderRadius: 'var(--radius)', marginBottom: '1rem', fontWeight: 600 }}>
        Nothing goes to print until you approve every proof on an order. Everything we need from you is on this page.
      </div>

      {data.orders.length === 0 && (
        <p className="muted">No proofs yet. When you order with a proof, it shows up here as soon as our team prepares it.</p>
      )}

      {needsYou.length > 0 && <h2 style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--brand)' }}>Needs you</h2>}
      {needsYou.map((o) => <div key={o.id} id={`order-${o.number}`}><ProofOrderCard order={o} terms={data.terms} onChange={reload} /></div>)}

      {rest.length > 0 && <h2 style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)', marginTop: '1.5rem' }}>Done &amp; in progress</h2>}
      {rest.map((o) => <div key={o.id} id={`order-${o.number}`}><ProofOrderCard order={o} terms={data.terms} onChange={reload} /></div>)}
    </div>
  );
}
