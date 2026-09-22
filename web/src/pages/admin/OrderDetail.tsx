import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';
import { formatCartItemOptions } from '../../lib/cart-options';
import { StatusBadge } from '../Account';
import { OptionControl, keyOf, type ProductOption } from '../Product';
import { PageHeader, errorMessage, useConfirm, useToast } from '../../components/admin/ui';
import { FilePreviewModal } from '../../components/PdfPreview';
import { downloadHref } from '../../lib/files';

interface OrderEvent {
  id: string;
  kind: string;
  message?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorName?: string | null;
  createdAt: string;
}

interface AdjustmentDiff { key: string; label: string; from: string; to: string }
interface AdjustmentChange {
  orderItemId: string; itemName: string; quantity: number;
  before: { options: Record<string, unknown>; unitPriceCents: number; totalCents: number };
  after: { options: Record<string, unknown>; unitPriceCents: number; totalCents: number };
  diff: AdjustmentDiff[];
}
interface AdjustmentTotals { subtotalCents: number; discountCents: number; taxCents: number; shippingCents: number; totalCents: number }
interface AdjustmentRow {
  id: string; token: string; status: 'pending' | 'paid' | 'applied' | 'cancelled';
  amountCents: number; note: string | null;
  changes: AdjustmentChange[];
  totals: { before: AdjustmentTotals; after: AdjustmentTotals };
  createdAt: string; paidAt: string | null; appliedAt: string | null; expiresAt: string;
}

interface OrderFull {
  id: string; number: string; email: string;
  status: string; paymentStatus: string;
  subtotalCents: number; shippingCents: number; taxCents: number;
  discountCents: number; totalCents: number;
  trackingNumber?: string | null;
  shippingMethod?: string | null;
  notes?: string | null;
  shippingAddress: any;
  billingAddress: any;
  items: {
    id: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    options?: any;
    product: {
      slug: string;
      images: { url: string }[];
      options: {
        id: string; name: string; internalKey?: string | null; type: string;
        required?: boolean; section?: string | null; helpText?: string | null; longDescription?: string | null;
        dependsOnOptionId?: string | null; dependsOnValue?: string | null; sortOrder?: number;
        values: { id?: string; label: string; subLabel?: string | null; imageUrl?: string | null; priceModifierCents?: number; sortOrder?: number }[];
      }[];
    };
    files?: {
      id: string;
      purpose: string | null;
      notes: string | null;
      media: {
        id: string;
        originalName: string;
        mimeType: string;
        size: number;
        url: string;
        contentHash: string | null;
        createdAt: string;
      };
    }[];
  }[];
  payments: { id: string; provider: string; providerRef?: string | null; amountCents: number; status: string; createdAt: string }[];
  adjustments?: AdjustmentRow[];
  events: OrderEvent[];
  user?: { id: string; email: string; firstName?: string | null; lastName?: string | null } | null;
  apiKey?: { id: string; name: string; prefix: string } | null;
  partner?: { id: string; slug: string; name: string; color?: string | null; status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' } | null;
  project?: {
    id: string;
    externalProjectId: string;
    title: string;
    creatorName: string | null;
    creatorEmail: string | null;
    status: string;
  } | null;
  source?: string | null;
  externalRef?: string | null;
  proofStatus?: string | null;
  proofs?: {
    id: string; version: number; status: string; token: string;
    orderItemId?: string | null; kind?: string | null;
    orderItem?: { id: string; name: string; options?: any } | null;
    message: string | null; decisionNote: string | null; approvedName: string | null;
    approvedTermsAt: string | null; decidedAt: string | null; createdAt: string;
    media: { id: string; originalName: string; url: string; size: number; mimeType: string };
  }[];
  mediaRequests?: {
    id: string; message: string; token: string; status: string; fulfilledAt: string | null; createdAt: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

const STATUSES = ['PENDING', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
const PAY_STATUSES = ['PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED'];

function proofBanner(status: string | null | undefined): { text: string; bg: string; border: string } | null {
  switch (status) {
    case 'requested': return { text: '⚠ Proof requested — upload a PDF proof to send the customer. Production is blocked until it is approved.', bg: '#fdf3e7', border: '#e08a00' };
    case 'awaiting_approval': return { text: '⏳ Awaiting customer approval — production is blocked until the customer approves the proof.', bg: '#fdf3e7', border: '#e08a00' };
    case 'changes_requested': return { text: '✎ Customer requested changes — upload a revised proof. Production is blocked.', bg: '#fdecea', border: '#c0392b' };
    case 'approved': return { text: '✓ Proof approved — this order is cleared for production.', bg: '#eef9f0', border: '#1c9b4b' };
    default: return null;
  }
}

const PROOF_KIND_LABELS: Record<string, string> = {
  cover: 'Cover proof',
  interior: 'Interior proof',
  artwork: 'Artwork proof',
};

// Books need two proofs (cover + interior); prints and everything else one.
function proofKindsForSlug(slug: string): string[] {
  if (slug.startsWith('comic-') || slug.startsWith('graphic-novel-')) return ['cover', 'interior'];
  return ['artwork'];
}

/** The customer's "Title of Comic" for a line, trimmed, or ''. */
function titleOf(item: { options?: any } | null | undefined): string {
  const t = item?.options?.title;
  return typeof t === 'string' ? t.trim() : '';
}

// A line is named by its title first — `“Issue #1” · Comic Book — Standard…`.
// Twelve lines of the same product are indistinguishable by product name,
// which is the whole reason titles exist (the server labels proofs the same way).
function labelOf(item: { name: string; options?: any } | null | undefined): string {
  if (!item) return '';
  const t = titleOf(item);
  return t ? `“${t}” · ${item.name}` : item.name;
}

function slotLabelOf(p: { kind?: string | null; orderItem?: { name: string; options?: any } | null }): string {
  const kind = p.kind ? (PROOF_KIND_LABELS[p.kind] ?? 'Proof') : 'Proof';
  return p.orderItem ? `${kind} — ${labelOf(p.orderItem)}` : kind;
}

function ProofingCard({ order, onChange }: { order: OrderFull; onChange: () => void }) {
  const confirm = useConfirm();
  const [previewMedia, setPreviewMedia] = useState<{ id: string; url: string; originalName: string } | null>(null);
  const [showProof, setShowProof] = useState(false);
  const [proofMsg, setProofMsg] = useState('');
  const [showRequest, setShowRequest] = useState(false);
  const [requestMsg, setRequestMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const origin = window.location.origin;
  const banner = proofBanner(order.proofStatus);
  const proofs = order.proofs ?? [];
  const requests = order.mediaRequests ?? [];

  // Items that can be proofed (the hard-copy-proof fee line is not an item to proof).
  const proofItems = order.items.filter((i) => i.product.slug !== 'hard-copy-proof');
  const itemLabel = (it: (typeof proofItems)[number]) => labelOf(it);

  // Upload queue: pick many files at once, assign each a slot, send together.
  const [queue, setQueue] = useState<{ file: File; itemId: string; kind: string }[]>([]);

  // Latest proof per slot (proofs arrive newest-first) → per-slot status chips.
  const latestBySlot = new Map<string, (typeof proofs)[number]>();
  for (const p of proofs) {
    const key = `${p.orderItemId ?? 'order'}:${p.kind ?? 'artwork'}`;
    if (!latestBySlot.has(key)) latestBySlot.set(key, p);
  }
  const slotChip = (status: string | undefined) =>
    status === 'approved' ? { text: '✓ approved', color: '#1c9b4b' }
    : status === 'changes_requested' ? { text: '✎ changes requested', color: '#c0392b' }
    : status === 'pending' ? { text: '⏳ awaiting approval', color: '#e08a00' }
    : { text: 'not sent', color: 'var(--muted)' };

  // Queue newly-picked files, defaulting each to the first still-unsent slot so
  // a multi-file drop mostly assigns itself.
  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setQueue((cur) => {
      const next = [...cur];
      const taken = new Set([
        ...cur.map((q) => `${q.itemId}:${q.kind}`),
        ...[...latestBySlot.keys()],
      ]);
      for (const file of Array.from(list)) {
        let itemId = proofItems[0]?.id ?? '';
        let kind = itemId ? proofKindsForSlug(proofItems[0]!.product.slug)[0]! : 'artwork';
        outer: for (const it of proofItems) {
          for (const k of proofKindsForSlug(it.product.slug)) {
            if (!taken.has(`${it.id}:${k}`)) { itemId = it.id; kind = k; break outer; }
          }
        }
        taken.add(`${itemId}:${kind}`);
        next.push({ file, itemId, kind });
      }
      return next;
    });
  }

  async function sendQueue() {
    if (queue.length === 0) return;
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      for (const q of queue) fd.append('files', q.file);
      fd.append('assignments', JSON.stringify(queue.map((q) => ({ orderItemId: q.itemId || null, kind: q.kind }))));
      if (proofMsg.trim()) fd.append('message', proofMsg.trim());
      const r = await fetch(`/api/admin/orders/${order.id}/proofs/batch`, { method: 'POST', credentials: 'include', body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({ error: 'Upload failed' }))).error);
      const body = await r.json().catch(() => ({}));
      setShowProof(false); setQueue([]); setProofMsg('');
      setNotice(
        body?.email?.sent
          ? { ok: true, text: `✓ ${body.count} proof${body.count === 1 ? '' : 's'} uploaded and emailed to ${body.email.to}.` }
          : { ok: false, text: `Proofs uploaded, but the customer email did NOT send${body?.email?.error ? `: ${body.email.error}` : ''}. Check Mailgun settings, then copy the review links to the customer manually.` },
      );
      onChange();
    } catch (e: any) { setErr(e.message ?? 'Upload failed'); }
    finally { setBusy(false); }
  }

  async function deleteProof(proofId: string) {
    if (!(await confirm({ title: 'Delete this proof?', body: 'The customer’s review link for it will stop working.', confirmLabel: 'Delete', danger: true }))) return;
    setBusy(true); setErr(null);
    try {
      await api.del(`/admin/orders/${order.id}/proof/${proofId}`);
      onChange();
    } catch (e: any) { setErr(e.message ?? 'Delete failed'); }
    finally { setBusy(false); }
  }

  async function requestMedia() {
    if (!requestMsg.trim()) return;
    setBusy(true); setErr(null);
    try {
      await api.post(`/admin/orders/${order.id}/request-media`, { message: requestMsg.trim() });
      setShowRequest(false); setRequestMsg('');
      onChange();
    } catch (e: any) { setErr(e.message ?? 'Request failed'); }
    finally { setBusy(false); }
  }

  return (
    <>
      {previewMedia && <FilePreviewModal media={previewMedia} onClose={() => setPreviewMedia(null)} />}
    <div className="admin-card">
      <h3 style={{ marginTop: 0 }}>Proofing</h3>
      {banner ? (
        <div style={{ background: banner.bg, borderLeft: `4px solid ${banner.border}`, borderRadius: 8, padding: '.7rem 1rem', margin: '.5rem 0 1rem', fontWeight: 600 }}>
          {banner.text}
        </div>
      ) : (
        <p className="muted" style={{ margin: '.25rem 0 1rem' }}>No proof was requested for this order — you can still send one below.</p>
      )}

      {notice && (
        <div style={{
          background: notice.ok ? '#eef9f0' : '#fdecea',
          borderLeft: `4px solid ${notice.ok ? '#1c9b4b' : '#c0392b'}`,
          borderRadius: 8, padding: '.6rem 1rem', margin: '0 0 1rem', fontSize: '.88rem',
        }}>
          {notice.text}
          <button className="btn secondary" style={{ padding: '.05rem .4rem', fontSize: '.7rem', marginLeft: '.6rem' }} onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {/* Per-item proof checklist — one slot per item (books: cover + interior). */}
      {proofItems.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '.6rem .9rem', marginBottom: '1rem' }}>
          <div className="spread" style={{ marginBottom: '.35rem' }}>
            <span style={{ fontWeight: 700, fontSize: '.85rem' }}>Proofs needed</span>
            <span className="muted" style={{ fontSize: '.8rem' }}>
              {(() => {
                const slots = proofItems.flatMap((it) => proofKindsForSlug(it.product.slug).map((k) => `${it.id}:${k}`));
                const approved = slots.filter((s) => latestBySlot.get(s)?.status === 'approved').length;
                const sent = slots.filter((s) => latestBySlot.has(s)).length;
                return `${approved} of ${slots.length} approved · ${sent} sent · ${proofs.length} upload${proofs.length === 1 ? '' : 's'} total`;
              })()}
            </span>
          </div>
          {proofItems.map((it) => (
            <div key={it.id} style={{ padding: '.25rem 0', fontSize: '.85rem' }}>
              {titleOf(it) ? (
                <>
                  <strong>“{titleOf(it)}”</strong>
                  <span className="muted"> · {it.name}</span>
                </>
              ) : (
                <>
                  <strong>{it.name}</strong>
                  <span style={{ color: '#b91c1c', fontSize: '.8rem' }}> · no title — add one in Items below</span>
                </>
              )}
              <span style={{ display: 'inline-flex', gap: '.75rem', marginLeft: '.75rem', flexWrap: 'wrap' }}>
                {proofKindsForSlug(it.product.slug).map((k) => {
                  const chip = slotChip(latestBySlot.get(`${it.id}:${k}`)?.status);
                  return (
                    <span key={k} className="muted" style={{ fontSize: '.8rem' }}>
                      {PROOF_KIND_LABELS[k]}: <span style={{ color: chip.color, fontWeight: 600 }}>{chip.text}</span>
                    </span>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button className="btn" onClick={() => { setShowProof((v) => !v); setShowRequest(false); }}>Upload PDF proof</button>
        <button className="btn secondary" onClick={() => { setShowRequest((v) => !v); setShowProof(false); }}>Request additional media</button>
      </div>

      {showProof && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
          <label>Proof files — select as many as you want</label>
          <input
            type="file"
            multiple
            accept="application/pdf,image/*"
            onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ''; }}
          />
          <p className="muted" style={{ fontSize: '.8rem', margin: '.35rem 0 0' }}>
            Each file gets assigned to a proof slot below. They’re all sent together in one email.
          </p>

          {queue.length > 0 && (
            <div style={{ marginTop: '.85rem' }}>
              <div style={{ fontWeight: 700, fontSize: '.85rem', marginBottom: '.35rem' }}>
                Queue ({queue.length} file{queue.length === 1 ? '' : 's'})
              </div>
              {queue.map((q, idx) => {
                const it = proofItems.find((i) => i.id === q.itemId);
                const kinds = it ? proofKindsForSlug(it.product.slug) : ['artwork'];
                const dupe = queue.some((o, j) => j !== idx && o.itemId === q.itemId && o.kind === q.kind);
                return (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 1fr auto', gap: '.5rem', alignItems: 'center', padding: '.35rem 0', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '.82rem', wordBreak: 'break-all' }} title={q.file.name}>
                      📄 {q.file.name}
                    </span>
                    <select
                      value={q.itemId}
                      onChange={(e) => setQueue((cur) => cur.map((row, j) => {
                        if (j !== idx) return row;
                        const nit = proofItems.find((i) => i.id === e.target.value);
                        const nkinds = nit ? proofKindsForSlug(nit.product.slug) : ['artwork'];
                        return { ...row, itemId: e.target.value, kind: nkinds.includes(row.kind) ? row.kind : nkinds[0]! };
                      }))}
                      style={{ fontSize: '.8rem' }}
                    >
                      {proofItems.map((i) => <option key={i.id} value={i.id}>{itemLabel(i)}</option>)}
                    </select>
                    <select
                      value={q.kind}
                      onChange={(e) => setQueue((cur) => cur.map((row, j) => (j === idx ? { ...row, kind: e.target.value } : row)))}
                      style={{ fontSize: '.8rem', borderColor: dupe ? '#c0392b' : undefined }}
                    >
                      {kinds.map((k) => <option key={k} value={k}>{PROOF_KIND_LABELS[k]}</option>)}
                    </select>
                    <button
                      className="btn secondary"
                      style={{ padding: '.15rem .5rem', fontSize: '.75rem' }}
                      onClick={() => setQueue((cur) => cur.filter((_, j) => j !== idx))}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
              {queue.some((q, i) => queue.some((o, j) => j !== i && o.itemId === q.itemId && o.kind === q.kind)) && (
                <div className="muted" style={{ color: '#c0392b', fontSize: '.8rem', marginTop: '.35rem' }}>
                  Two files are assigned to the same slot — the later one becomes the newer version.
                </div>
              )}
            </div>
          )}

          <label style={{ marginTop: '.75rem' }}>Note to customer (optional)</label>
          <textarea rows={2} value={proofMsg} onChange={(e) => setProofMsg(e.target.value)} placeholder="Anything the customer should look at…" />
          <div style={{ marginTop: '.6rem' }}>
            <button className="btn" onClick={sendQueue} disabled={busy || queue.length === 0}>
              {busy ? 'Sending…' : `Send ${queue.length || ''} proof${queue.length === 1 ? '' : 's'} to customer`}
            </button>
          </div>
        </div>
      )}

      {showRequest && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
          <label>What do you need from the customer?</label>
          <textarea rows={3} value={requestMsg} onChange={(e) => setRequestMsg(e.target.value)} placeholder="e.g. Your cover file is low-resolution — please re-upload at 300 DPI with bleed." />
          <div style={{ marginTop: '.6rem' }}>
            <button className="btn" onClick={requestMedia} disabled={busy || !requestMsg.trim()}>{busy ? 'Sending…' : 'Email the request'}</button>
          </div>
        </div>
      )}

      {err && <div className="error" style={{ marginBottom: '1rem' }}>{err}</div>}

      {proofs.length > 0 && (
        <div style={{ marginBottom: requests.length ? '1rem' : 0 }}>
          <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: '.4rem' }}>Proofs</div>
          {proofs.map((p) => (
            <div key={p.id} style={{ borderTop: '1px solid var(--border)', padding: '.5rem 0', fontSize: '.85rem' }}>
              <div className="spread">
                <span><strong>{slotLabelOf(p)} v{p.version}</strong> · {p.status.replace(/_/g, ' ')}</span>
                <span className="muted">{new Date(p.createdAt).toLocaleString()}</span>
              </div>
              <div className="muted" style={{ fontSize: '.8rem', marginTop: '.15rem', wordBreak: 'break-all' }}>
                📄 {p.media.originalName}
                {p.media.size ? <span> · {(p.media.size / 1024 / 1024).toFixed(2)} MB</span> : null}
              </div>
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.25rem' }}>
                <button type="button" className="btn secondary" style={{ padding: '.15rem .5rem', fontSize: '.75rem' }} onClick={() => setPreviewMedia(p.media)}>Preview</button>
                <a className="btn secondary" style={{ padding: '.15rem .5rem', fontSize: '.75rem' }} href={downloadHref(p.media.url)} download={p.media.originalName}>Download</a>
                <button className="btn secondary" style={{ padding: '.15rem .5rem', fontSize: '.75rem' }} onClick={() => { void navigator.clipboard?.writeText(`${origin}/proof/${p.token}`); }}>Copy review link</button>
                <button
                  className="btn secondary"
                  style={{ padding: '.15rem .5rem', fontSize: '.75rem', color: '#c0392b', borderColor: '#c0392b' }}
                  disabled={busy}
                  onClick={() => void deleteProof(p.id)}
                >
                  Delete
                </button>
              </div>
              {p.status === 'approved' && <div style={{ color: 'green', marginTop: '.25rem' }}>Approved by {p.approvedName}{p.decidedAt ? ` on ${new Date(p.decidedAt).toLocaleString()}` : ''}</div>}
              {p.status === 'changes_requested' && p.decisionNote && <div style={{ color: '#c0392b', marginTop: '.25rem' }}>Changes requested: {p.decisionNote}</div>}
            </div>
          ))}
        </div>
      )}

      {requests.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: '.4rem' }}>Media requests</div>
          {requests.map((mr) => (
            <div key={mr.id} style={{ borderTop: '1px solid var(--border)', padding: '.5rem 0', fontSize: '.85rem' }}>
              <div className="spread">
                <span>{mr.status === 'fulfilled' ? '✓ fulfilled' : 'open'}</span>
                <span className="muted">{new Date(mr.createdAt).toLocaleString()}</span>
              </div>
              <div style={{ marginTop: '.2rem' }}>{mr.message}</div>
              <button className="btn secondary" style={{ padding: '.15rem .5rem', fontSize: '.75rem', marginTop: '.3rem' }} onClick={() => { void navigator.clipboard?.writeText(`${origin}/upload/${mr.token}`); }}>Copy upload link</button>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}

export function AdminOrderDetail() {
  const toast = useToast(); const confirm = useConfirm();
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderFull | null>(null);
  const [resending, setResending] = useState(false);
  const [tracking, setTracking] = useState('');
  const [shippingMethod, setShippingMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [previewMedia, setPreviewMedia] = useState<{ id?: string; url: string; originalName: string } | null>(null);

  const load = () => {
    if (!id) return;
    void api.get<{ order: OrderFull }>(`/admin/orders/${id}`).then((r) => {
      setOrder(r.order);
      setTracking(r.order.trackingNumber ?? '');
      setShippingMethod(r.order.shippingMethod ?? '');
      setNotes(r.order.notes ?? '');
    });
  };

  useEffect(() => { load(); }, [id]);

  const update = async (patch: any) => {
    setSaving(true);
    try {
      await api.patch(`/admin/orders/${id}`, patch);
      load();
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!noteDraft.trim() || !id) return;
    await api.post(`/admin/orders/${id}/events`, { message: noteDraft.trim(), kind: 'note' });
    setNoteDraft('');
    load();
  };

  // Re-send the current proof links. Tokens don't change — this just puts a
  // fresh, working email in the customer's inbox (the original may have gone
  // out with rewritten tracking links, or never arrived).
  const resendProofs = async () => {
    if (!order) return;
    if (!(await confirm({ title: 'Re-send the proof emails?', body: `The outstanding proof links go to ${order.email} again.`, confirmLabel: 'Send' }))) return;
    setResending(true);
    try {
      const r = await api.post<{ count: number; to: string }>(`/admin/orders/${id}/proofs/resend`, {});
      toast.success(`Sent ${r.count} proof link(s) to ${r.to}.`);
      load();
    } catch (e: any) {
      toast.error(errorMessage(e, 'Could not re-send the proof emails.'));
    } finally {
      setResending(false);
    }
  };

  const [refundOpen, setRefundOpen] = useState(false);

  const deleteOrder = async () => {
    if (!order) return;
    if (!(await confirm({ title: `Permanently delete order ${order.number}?`, body: "This removes the order and any uploaded files and can't be undone.", confirmLabel: 'Delete order', danger: true }))) return;
    try {
      await api.del(`/admin/orders/${id}`);
      navigate('/admin/orders');
    } catch (e: any) {
      toast.error(errorMessage(e, 'Delete failed'));
    }
  };

  if (!order) return <div>Loading…</div>;

  return (
    <div>
      <Link className="admin-back" to="/admin/orders">← Orders</Link>
      <div className="spread" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Order {order.number}</h1>
          <div className="muted" style={{ fontSize: '.85rem' }}>
            Placed {new Date(order.createdAt).toLocaleString()}
            {order.partner && (
              <>
                {' · '}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: order.partner.color ?? '#94a3b8',
                    }}
                  />
                  via{' '}
                  <Link to={`/admin/partners/${order.partner.id}`}>{order.partner.name}</Link>
                  {order.apiKey && (
                    <span style={{ marginLeft: 4 }}>
                      (<code>{order.apiKey.prefix}</code>)
                    </span>
                  )}
                </span>
              </>
            )}
            {!order.partner && order.apiKey && (
              <>
                {' · '}via API key <code>{order.apiKey.prefix}</code>
              </>
            )}
            {order.externalRef && (
              <>
                {' · '}externalRef <code>{order.externalRef}</code>
              </>
            )}
            {order.project && (
              <>
                {' · '}project{' '}
                {order.partner ? (
                  <Link to={`/admin/partners/${order.partner.id}`}>{order.project.title}</Link>
                ) : (
                  <span>{order.project.title}</span>
                )}{' '}
                <code style={{ fontSize: '.75rem' }}>{order.project.externalProjectId}</code>
                {order.project.creatorName && (
                  <span> · creator {order.project.creatorName}</span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="row" style={{ gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge status={order.status} />
          <StatusBadge status={order.paymentStatus} />
          {(order.proofs?.length ?? 0) > 0 && (
            <button className="btn secondary" onClick={resendProofs} disabled={resending}>
              {resending ? 'Sending…' : 'Resend proof emails'}
            </button>
          )}
          {order.paymentStatus === 'CAPTURED' && (
            <button className="btn secondary danger" onClick={() => setRefundOpen(true)}>
              Refund via PayPal
            </button>
          )}
          {order.paymentStatus !== 'CAPTURED' && (
            <button className="btn secondary" style={{ color: '#b91c1c', borderColor: '#b91c1c' }} onClick={deleteOrder}>
              Delete order
            </button>
          )}
        </div>
      </div>

      <ProofingCard order={order} onChange={load} />

      <div className="admin-card">
        <h3>Fulfilment</h3>
        <div className="grid-2">
          <div>
            <label>Order status</label>
            <select value={order.status} onChange={(e) => update({ status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <p className="muted" style={{ fontSize: '.75rem' }}>
              Marking SHIPPED will email the customer their tracking number.
            </p>
          </div>
          <div>
            <label>Payment status</label>
            <select value={order.paymentStatus} onChange={(e) => update({ paymentStatus: e.target.value })}>
              {PAY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div>
            <label>Tracking number</label>
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              onBlur={() => {
                if (tracking !== (order.trackingNumber ?? '')) update({ trackingNumber: tracking });
              }}
              placeholder="USPS / UPS / FedEx tracking"
            />
          </div>
          <div>
            <label>Shipping method</label>
            <input
              value={shippingMethod}
              onChange={(e) => setShippingMethod(e.target.value)}
              onBlur={() => {
                if (shippingMethod !== (order.shippingMethod ?? '')) update({ shippingMethod });
              }}
              placeholder='e.g. "UPS Ground"'
            />
          </div>
        </div>
        <label>Internal notes (not emailed)</label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (order.notes ?? '')) update({ notes });
          }}
        />
      </div>

      <ShipmentsSection orderId={order.id} />

      {previewMedia && <FilePreviewModal media={previewMedia} onClose={() => setPreviewMedia(null)} />}

      {refundOpen && (
        <RefundDialog
          orderId={order.id}
          fullAmountCents={order.totalCents}
          onClose={() => setRefundOpen(false)}
          onDone={() => { setRefundOpen(false); load(); }}
        />
      )}

      {editingItemId && (() => {
        const item = order.items.find((x) => x.id === editingItemId);
        return item ? (
          <ItemOptionsEditor
            order={order}
            item={item}
            onClose={() => setEditingItemId(null)}
            onDone={() => { setEditingItemId(null); load(); }}
          />
        ) : null;
      })()}

      {order.adjustments && order.adjustments.length > 0 && (
        <AdjustmentsCard orderId={order.id} adjustments={order.adjustments} onChange={load} />
      )}

      <div className="admin-card">
        <h3>Items</h3>
        <table className="admin-table">
          <thead><tr><th /><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
          <tbody>
            {order.items.map((i) => {
              const img = i.product?.images?.[0]?.url;
              // Free-text options (the title) get their own editable rows;
              // keep them out of the read-only summary list.
              const textOptions = i.product.options.filter((o) => o.type === 'TEXT');
              const textLabels = new Set(textOptions.map((o) => o.name));
              const pairs = formatCartItemOptions(i).filter((p) => !textLabels.has(p.label));
              return (
                <tr key={i.id}>
                  <td style={{ width: 60 }}>
                    {img ? (
                      <img src={img} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} />
                    ) : (
                      <div style={{ width: 48, height: 48, background: 'var(--bg-alt)', borderRadius: 4 }} />
                    )}
                  </td>
                  <td>
                    <Link to={`/product/${i.product.slug}`}>{i.name}</Link>
                    {textOptions.map((o) => (
                      <TextOptionRow key={o.id} orderId={order.id} item={i} opt={o} onSaved={load} />
                    ))}
                    {pairs.length > 0 && (
                      <ul className="muted" style={{ fontSize: '.8rem', margin: '.25rem 0 0', paddingLeft: '1rem' }}>
                        {pairs.map((p, j) => (
                          <li key={j}>
                            {p.label}:{' '}
                            {p.urls?.length ? (
                              // Uploaded files are links, always — even when the
                              // MediaFile row behind them is gone (see the chips
                              // below for name/size when it isn't).
                              p.urls.map((u, k) => {
                                const name = u.split('?')[0]!.split('/').pop() ?? u;
                                // Prefer the linked file row (has the original name); fall back to a URL lookup.
                                const linked = i.files?.find((f) => f.media.url === u || f.media.url.split('?')[0] === u.split('?')[0]);
                                return (
                                  <span key={k} style={{ marginRight: '.6rem', whiteSpace: 'nowrap' }}>
                                    📎{' '}
                                    <button
                                      type="button"
                                      onClick={() => setPreviewMedia(linked ? linked.media : { url: u, originalName: name })}
                                      title="Preview"
                                      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--brand)', cursor: 'pointer' }}
                                    >
                                      {linked?.media.originalName ?? name}
                                    </button>
                                    {' '}<a href={downloadHref(u)} download={linked?.media.originalName ?? name} title="Save to your computer" style={{ fontSize: '.75rem' }}>save</a>
                                  </span>
                                );
                              })
                            ) : p.value}
                          </li>
                        ))}
                      </ul>
                    )}
                    {order.paymentStatus === 'CAPTURED' && i.product.options.length > 0 && (
                      <button
                        className="btn secondary"
                        style={{ marginTop: '.5rem', padding: '.25rem .6rem', fontSize: '.8rem' }}
                        disabled={!!order.adjustments?.some((a) => a.status === 'pending')}
                        title={order.adjustments?.some((a) => a.status === 'pending') ? 'Cancel the pending payment request first' : 'Change this item\'s selections and bill the difference'}
                        onClick={() => setEditingItemId(i.id)}
                      >
                        ✎ Edit options
                      </button>
                    )}
                    {i.files && i.files.length > 0 && (
                      <div style={{ marginTop: '.4rem', display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                        {i.files.map((f) => (
                          <span
                            key={f.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'stretch',
                              borderRadius: 4,
                              border: '1px solid var(--border)',
                              overflow: 'hidden',
                              fontSize: '.8rem',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => setPreviewMedia(f.media)}
                              title={f.notes ?? 'Preview'}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '.3rem .55rem',
                                background: 'var(--bg-alt)',
                                border: 'none',
                                cursor: 'pointer',
                                font: 'inherit',
                                color: 'var(--brand)',
                              }}
                            >
                              <span style={{ fontWeight: 600 }}>
                                {f.purpose ? f.purpose.toUpperCase() : 'FILE'}
                              </span>
                              <span style={{ color: 'var(--ink)' }}>{f.media.originalName}</span>
                              <span className="muted">({formatBytes(f.media.size)})</span>
                            </button>
                            <a
                              href={downloadHref(f.media.url)}
                              download={f.media.originalName}
                              title="Download"
                              style={{ padding: '.3rem .5rem', borderLeft: '1px solid var(--border)', textDecoration: 'none', color: 'var(--brand)', fontWeight: 700 }}
                            >
                              ↓
                            </a>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>{i.quantity}</td>
                  <td>{formatMoney(i.unitPriceCents)}</td>
                  <td>{formatMoney(i.totalCents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="spread"><span>Subtotal</span><span>{formatMoney(order.subtotalCents)}</span></div>
        {order.discountCents > 0 && <div className="spread"><span>Discount</span><span>−{formatMoney(order.discountCents)}</span></div>}
        <div className="spread"><span>Shipping</span><span>{formatMoney(order.shippingCents)}</span></div>
        <div className="spread"><span>Tax</span><span>{formatMoney(order.taxCents)}</span></div>
        <div className="spread" style={{ fontWeight: 700 }}><span>Total</span><span>{formatMoney(order.totalCents)}</span></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <div className="admin-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Customer</h3>
          <div>{order.email}</div>
          {order.user && (
            <div className="muted">
              <Link to={`/admin/customers/${order.user.id}`}>
                {order.user.firstName} {order.user.lastName}
              </Link>
            </div>
          )}
        </div>

        <div className="admin-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Shipping address</h3>
          <AddressDisplay a={order.shippingAddress} />
        </div>

        <div className="admin-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Billing address</h3>
          <AddressDisplay a={order.billingAddress} />
        </div>
      </div>

      {order.payments.length > 0 && (
        <div className="admin-card">
          <h3>Payments</h3>
          <table className="admin-table">
            <thead><tr><th>Provider</th><th>Reference</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
            <tbody>
              {order.payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.provider}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '.8rem' }}>{p.providerRef ?? '—'}</td>
                  <td>{formatMoney(p.amountCents)}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>{new Date(p.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-card">
        <h3>Activity timeline</h3>
        <div className="row" style={{ marginBottom: '.75rem' }}>
          <input
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add a timeline note (visible on the customer order page)"
            onKeyDown={(e) => { if (e.key === 'Enter') void addNote(); }}
          />
          <button className="btn" onClick={() => void addNote()} disabled={!noteDraft.trim()}>Add</button>
        </div>
        {order.events.length === 0 ? (
          <p className="muted">No activity yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {order.events.map((e) => (
              <li key={e.id} style={{ display: 'flex', gap: '.75rem', padding: '.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--muted)', fontSize: '.85rem', minWidth: 160 }}>
                  {new Date(e.createdAt).toLocaleString()}
                </span>
                <span style={{ minWidth: 80, textTransform: 'uppercase', fontSize: '.7rem', fontWeight: 700, color: 'var(--muted)' }}>
                  {e.kind}
                </span>
                <span style={{ flex: 1, fontSize: '.9rem' }}>
                  {e.message}
                  {e.actorName && <span className="muted" style={{ fontSize: '.8rem' }}> — {e.actorName}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {saving && <p className="muted">Saving…</p>}
    </div>
  );
}

interface RemainingItem {
  orderItemId: string;
  name: string;
  unitPriceCents: number;
  totalQuantity: number;
  remaining: number;
  weightGramsEach: number;
}

interface ShipmentRow {
  id: string;
  status: string;
  carrier?: string | null;
  service?: string | null;
  trackingCode?: string | null;
  labelUrl?: string | null;
  rateAmountCents?: number | null;
  insuredValueCents?: number | null;
  weightOz?: number | null;
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
  package?: { id: string; name: string } | null;
  items: { orderItemId: string; quantity: number }[];
  createdAt: string;
}

interface EpRate {
  id: string;
  carrier: string;
  service: string;
  rate: string;
  currency: string;
  delivery_days: number | null;
}

function ShipmentsSection({ orderId }: { orderId: string }) {
  const toast = useToast(); const confirm = useConfirm();
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [remaining, setRemaining] = useState<RemainingItem[]>([]);
  const [packages, setPackages] = useState<{ id: string; name: string; emptyWeightOz: number; maxWeightOz: number | null }[]>([]);
  const [building, setBuilding] = useState(false);
  const [autoPacking, setAutoPacking] = useState(false);
  const [autoPackSummary, setAutoPackSummary] = useState<{ boxCount: number; estimatedShippingCents: number; unpacked: number } | null>(null);

  const load = async () => {
    const r = await api.get<{ shipments: ShipmentRow[]; remaining: RemainingItem[] }>(`/admin/fulfillment/orders/${orderId}/shipments`);
    setShipments(r.shipments);
    setRemaining(r.remaining);
  };
  useEffect(() => {
    void load();
    void api.get<{ items: { id: string; name: string; emptyWeightOz: number; maxWeightOz: number | null }[] }>('/admin/fulfillment/packages').then((r) => setPackages(r.items));
  }, [orderId]);

  const remainingCount = remaining.reduce((sum, r) => sum + r.remaining, 0);

  // Cheapest-rate total across ALL shipments on this order (both the
  // already-created CREATED ones, and after auto-pack). Lets the admin see
  // what shipping will cost before buying anything.
  const cheapestTotalCents = shipments.reduce((sum, s) => {
    if (s.rateAmountCents != null) return sum + s.rateAmountCents;
    // CREATED but not yet bought — we don't have rates on the shipment row
    // itself (they're only on the one-shot create response). Skip in rollup.
    return sum;
  }, 0);

  async function autoPack() {
    if (!(await confirm({ title: 'Auto-pack the remaining items?', body: 'Sizes boxes automatically and fetches rates from EasyPost. This creates shipments but does not buy labels yet.', confirmLabel: 'Auto-pack' }))) return;
    setAutoPacking(true);
    setAutoPackSummary(null);
    try {
      const r = await api.post<{ boxCount: number; estimatedShippingCents: number; unpacked: { orderItemId: string }[] }>(
        `/admin/fulfillment/orders/${orderId}/auto-pack`,
        {},
      );
      setAutoPackSummary({
        boxCount: r.boxCount,
        estimatedShippingCents: r.estimatedShippingCents,
        unpacked: r.unpacked?.length ?? 0,
      });
      await load();
    } catch (e: any) {
      toast.error(errorMessage(e, 'Auto-pack failed'));
    } finally { setAutoPacking(false); }
  }

  return (
    <div className="admin-card">
      <div className="spread" style={{ marginBottom: '.75rem' }}>
        <h3 style={{ margin: 0 }}>Shipments ({shipments.length})</h3>
        <div className="row" style={{ gap: '.5rem' }}>
          {!building && remainingCount > 0 && (
            <>
              <button className="btn secondary" disabled={autoPacking} onClick={() => void autoPack()}>
                {autoPacking ? 'Auto-packing…' : `Auto-pack ${remainingCount} item${remainingCount === 1 ? '' : 's'}`}
              </button>
              <button className="btn" onClick={() => setBuilding(true)}>Add shipment</button>
            </>
          )}
          {!building && remainingCount === 0 && shipments.length > 0 && (
            <span className="muted" style={{ fontSize: '.85rem' }}>All items allocated.</span>
          )}
        </div>
      </div>

      {autoPackSummary && (
        <div style={{ padding: '.6rem .75rem', background: 'var(--bg-alt, #f3f4f6)', borderRadius: 6, fontSize: '.85rem', marginBottom: '.75rem' }}>
          Auto-pack: <strong>{autoPackSummary.boxCount}</strong> box{autoPackSummary.boxCount === 1 ? '' : 'es'} created,
          estimated shipping <strong>{formatMoney(autoPackSummary.estimatedShippingCents)}</strong> (cheapest rates + 1% insurance)
          {autoPackSummary.unpacked > 0 && (
            <span style={{ color: '#b91c1c' }}> — {autoPackSummary.unpacked} item(s) too heavy for any active package</span>
          )}
        </div>
      )}

      {shipments.length === 0 && !building && (
        <p className="muted">No shipments yet. Click <em>Auto-pack</em> to let the system size boxes automatically, or <em>Add shipment</em> to build one manually.</p>
      )}

      {shipments.length > 0 && cheapestTotalCents > 0 && (
        <div style={{ fontSize: '.85rem', marginBottom: '.5rem', color: 'var(--muted)' }}>
          Total postage purchased so far: <strong>{formatMoney(cheapestTotalCents)}</strong>
        </div>
      )}

      {shipments.length > 0 && (
        <table className="admin-table">
          <thead><tr>
            <th>Box</th><th>Carrier / Service</th><th>Tracking</th><th>Insured</th><th>Postage</th><th>Status</th><th>Label</th><th />
          </tr></thead>
          <tbody>
            {shipments.map((s, i) => (
              <tr key={s.id}>
                <td>
                  <strong>#{i + 1}</strong>
                  {s.package && <div className="muted" style={{ fontSize: '.75rem' }}>{s.package.name}</div>}
                  <div className="muted" style={{ fontSize: '.75rem' }}>
                    {s.lengthIn}×{s.widthIn}×{s.heightIn}″, {s.weightOz}oz
                  </div>
                </td>
                <td>{s.carrier && s.service ? `${s.carrier} ${s.service}` : <span className="muted">—</span>}</td>
                <td>{s.trackingCode ?? <span className="muted">—</span>}</td>
                <td>{s.insuredValueCents != null ? formatMoney(s.insuredValueCents) : <span className="muted">—</span>}</td>
                <td>{s.rateAmountCents != null ? formatMoney(s.rateAmountCents) : <span className="muted">—</span>}</td>
                <td><StatusBadge status={s.status} /></td>
                <td>
                  {s.labelUrl
                    ? <a href={s.labelUrl} target="_blank" rel="noreferrer">PDF</a>
                    : <span className="muted">—</span>}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {s.status === 'PURCHASED' && (
                    <button
                      className="btn secondary"
                      style={{ color: '#b91c1c' }}
                      onClick={async () => {
                        if (!(await confirm({ title: 'Refund this label?', body: 'Asks EasyPost to refund the postage. Only works for labels that have not been scanned by the carrier.', confirmLabel: 'Request refund', danger: true }))) return;
                        try {
                          await api.post(`/admin/fulfillment/shipments/${s.id}/refund`);
                          await load();
                        } catch (e: any) { toast.error(errorMessage(e, 'Refund failed')); }
                      }}
                    >Refund label</button>
                  )}
                  {s.status === 'CREATED' && (
                    <button
                      className="btn secondary"
                      style={{ color: '#b91c1c' }}
                      onClick={async () => {
                        if (!(await confirm({ title: 'Delete this shipment?', body: 'No label was bought, so nothing is refunded — the box is just removed.', confirmLabel: 'Delete', danger: true }))) return;
                        try {
                          await api.del(`/admin/fulfillment/shipments/${s.id}`);
                          await load();
                        } catch (e: any) { toast.error(errorMessage(e, 'Delete failed')); }
                      }}
                    >Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {building && (
        <ShipmentBuilder
          orderId={orderId}
          remaining={remaining}
          packages={packages}
          onCancel={() => setBuilding(false)}
          onDone={async () => { setBuilding(false); await load(); }}
        />
      )}
    </div>
  );
}

function ShipmentBuilder({
  orderId, remaining, packages, onCancel, onDone,
}: {
  orderId: string;
  remaining: RemainingItem[];
  packages: { id: string; name: string; emptyWeightOz: number; maxWeightOz: number | null }[];
  onCancel: () => void;
  onDone: () => void | Promise<void>;
}) {
  const toast = useToast(); const confirm = useConfirm();
  const [packageId, setPackageId] = useState<string>(packages[0]?.id ?? '');
  const [qtys, setQtys] = useState<Record<string, number>>(
    () => Object.fromEntries(remaining.map((r) => [r.orderItemId, 0])),
  );
  const [rates, setRates] = useState<EpRate[] | null>(null);
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const [insuredValueCents, setInsuredValueCents] = useState(0);
  const [busy, setBusy] = useState(false);

  const allocatedValueCents = remaining.reduce((sum, r) => sum + (qtys[r.orderItemId] ?? 0) * r.unitPriceCents, 0);
  const allocatedCount = remaining.reduce((sum, r) => sum + (qtys[r.orderItemId] ?? 0), 0);

  // Parcel weight is what the carrier actually prices, so show it before rates
  // are fetched — underpaying postage gets a package returned or surcharged.
  const GRAMS_PER_OZ = 28.3495;
  const pkg = packages.find((p) => p.id === packageId);
  const contentOz = remaining.reduce(
    (sum, r) => sum + ((qtys[r.orderItemId] ?? 0) * (r.weightGramsEach ?? 0)) / GRAMS_PER_OZ, 0,
  );
  const boxOz = pkg?.emptyWeightOz ?? 0;
  const computedOz = Math.max(0.5, contentOz + boxOz);
  // The weight field is pre-filled from the allocation and then edited freely:
  // staff put the box on a scale and type the real number, and THAT is what
  // gets rated. It keeps tracking the computed weight while untouched, so
  // changing the allocation still updates it; once edited it stays put until
  // "Recalculate" is clicked.
  const [weightInput, setWeightInput] = useState('');
  const [weightEdited, setWeightEdited] = useState(false);
  useEffect(() => {
    if (!weightEdited) setWeightInput(computedOz.toFixed(1));
  }, [computedOz, weightEdited]);

  const typedOz = Number(weightInput);
  const effectiveOz = Number.isFinite(typedOz) && typedOz > 0 ? typedOz : computedOz;
  const overMax = pkg?.maxWeightOz != null && effectiveOz > pkg.maxWeightOz;
  const fmtOz = (oz: number) => (oz >= 16 ? `${(oz / 16).toFixed(2)} lb (${oz.toFixed(1)} oz)` : `${oz.toFixed(1)} oz`);

  async function getRates() {
    setBusy(true);
    try {
      const allocations = remaining
        .filter((r) => (qtys[r.orderItemId] ?? 0) > 0)
        .map((r) => ({ orderItemId: r.orderItemId, quantity: qtys[r.orderItemId] }));
      if (allocations.length === 0) { toast.error('Put at least one item in this box first.'); return; }
      if (!packageId) { toast.error('Pick a box size first.'); return; }
      const r = await api.post<{ shipment: { id: string }; rates: EpRate[]; insuredValueCents: number }>(
        `/admin/fulfillment/orders/${orderId}/shipments`,
        { packageId, allocations, weightOz: +effectiveOz.toFixed(2) },
      );
      setShipmentId(r.shipment.id);
      setRates([...r.rates].sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate)));
      setInsuredValueCents(r.insuredValueCents);
    } catch (e: any) { toast.error(errorMessage(e, 'Could not fetch rates')); }
    finally { setBusy(false); }
  }

  async function buy(rate: EpRate) {
    if (!shipmentId) return;
    if (!(await confirm({
      title: `Buy ${rate.carrier} ${rate.service} for $${rate.rate}?`,
      body: `Insured for ${formatMoney(insuredValueCents)}. EasyPost charges the postage plus 1% of the declared value ($1 minimum) to your account.`,
      confirmLabel: `Buy label — $${rate.rate}`,
    }))) return;
    setBusy(true);
    try {
      await api.post(`/admin/fulfillment/shipments/${shipmentId}/buy`, { rateId: rate.id });
      await onDone();
    } catch (e: any) { toast.error(errorMessage(e, 'Could not buy the label')); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ border: '1px dashed var(--border)', padding: '1rem', borderRadius: 8, marginTop: '1rem' }}>
      <h4 style={{ marginTop: 0 }}>New shipment</h4>

      {!rates && (
        <>
          <label>Package</label>
          <select value={packageId} onChange={(e) => setPackageId(e.target.value)}>
            <option value="" disabled>Select a package…</option>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <label style={{ marginTop: '.75rem', display: 'block', fontWeight: 600 }}>Allocate items to this box</label>
          <table className="admin-table">
            <thead><tr><th>Item</th><th>Unit</th><th>Weight ea.</th><th>Remaining</th><th>This box</th><th>Subtotal</th></tr></thead>
            <tbody>
              {remaining.map((r) => (
                <tr key={r.orderItemId} style={{ opacity: r.remaining === 0 ? 0.4 : 1 }}>
                  <td>{r.name}</td>
                  <td>{formatMoney(r.unitPriceCents)}</td>
                  <td>{r.weightGramsEach ? `${(r.weightGramsEach / 28.3495).toFixed(1)} oz` : <span className="muted">—</span>}</td>
                  <td>{r.remaining} / {r.totalQuantity}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={r.remaining}
                      value={qtys[r.orderItemId] ?? 0}
                      disabled={r.remaining === 0}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(r.remaining, Number(e.target.value) || 0));
                        setQtys({ ...qtys, [r.orderItemId]: v });
                      }}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>{formatMoney((qtys[r.orderItemId] ?? 0) * r.unitPriceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total weight: pre-filled from the allocation, edited to whatever the
              box actually weighs, and used verbatim when fetching rates. */}
          <div
            style={{
              marginTop: '.75rem',
              padding: '.75rem .9rem',
              borderRadius: 8,
              background: overMax ? '#fdecea' : 'var(--bg-alt)',
              border: `1px solid ${overMax ? '#c0392b' : 'var(--border)'}`,
            }}
          >
            <label style={{ fontWeight: 600, display: 'block', marginBottom: '.35rem' }}>
              Total shipping weight
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <input
                type="number"
                min={0}
                step="0.1"
                value={weightInput}
                onChange={(e) => { setWeightInput(e.target.value); setWeightEdited(true); }}
                style={{ width: 130, fontSize: '1.15rem', fontWeight: 700, padding: '.4rem .5rem' }}
              />
              <span style={{ fontWeight: 600 }}>oz</span>
              <span className="muted" style={{ fontSize: '.9rem' }}>
                = {(effectiveOz / 16).toFixed(2)} lb
              </span>
              {weightEdited && (
                <button
                  type="button"
                  className="btn secondary"
                  style={{ padding: '.2rem .55rem', fontSize: '.78rem' }}
                  onClick={() => { setWeightEdited(false); setWeightInput(computedOz.toFixed(1)); }}
                >
                  Recalculate
                </button>
              )}
            </div>
            <div className="muted" style={{ fontSize: '.82rem', marginTop: '.4rem' }}>
              Estimated {computedOz.toFixed(1)} oz — contents {contentOz.toFixed(1)} oz + box {boxOz.toFixed(1)} oz.
              {' '}Weigh the packed box and correct this before fetching rates; the price is quoted on this number.
            </div>
          </div>
          {overMax && (
            <div className="error" style={{ marginTop: '.4rem', fontSize: '.85rem' }}>
              Over this package's {pkg?.maxWeightOz} oz limit — split it across boxes or pick a bigger package.
            </div>
          )}
          {contentOz === 0 && allocatedCount > 0 && (
            <div style={{ marginTop: '.4rem', fontSize: '.85rem', color: '#b45309' }}>
              These items have no recorded weight, so the estimate is just the box. Weigh it and enter
              the real figure above.
            </div>
          )}

          <div className="spread" style={{ marginTop: '.75rem', fontSize: '.9rem' }}>
            <span>
              {allocatedCount} item{allocatedCount === 1 ? '' : 's'} allocated — insured value{' '}
              <strong>{formatMoney(allocatedValueCents)}</strong>
            </span>
            <div className="row" style={{ gap: '.5rem' }}>
              <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
              <button type="button" className="btn" disabled={busy || allocatedCount === 0 || !packageId} onClick={getRates}>
                {busy ? 'Fetching rates…' : 'Get rates'}
              </button>
            </div>
          </div>
        </>
      )}

      {rates && (
        <>
          <p className="muted" style={{ fontSize: '.85rem' }}>
            Insured value: <strong>{formatMoney(insuredValueCents)}</strong> —{' '}
            {rates.length} rate{rates.length === 1 ? '' : 's'} from EasyPost.
          </p>
          <table className="admin-table">
            <thead><tr><th>Carrier</th><th>Service</th><th>Postage</th><th>Transit</th><th /></tr></thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id}>
                  <td>{r.carrier}</td>
                  <td>{r.service}</td>
                  <td>${r.rate} {r.currency}</td>
                  <td>{r.delivery_days ? `${r.delivery_days}d` : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn" disabled={busy} onClick={() => buy(r)}>Buy label</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: '.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}

function AddressDisplay({ a }: { a: any }) {
  if (!a) return <p className="muted">None</p>;
  return (
    <div style={{ lineHeight: 1.5 }}>
      <div>{a.firstName} {a.lastName}</div>
      {a.company && <div>{a.company}</div>}
      <div>{a.line1}{a.line2 ? `, ${a.line2}` : ''}</div>
      <div>{a.city}, {a.region} {a.postalCode}</div>
      <div>{a.country}</div>
      {a.phone && <div className="muted">{a.phone}</div>}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ---------------------------------------------------------------------------
// Post-order item changes + "pay the difference"
// ---------------------------------------------------------------------------

type ItemOf<O> = O extends { items: (infer I)[] } ? I : never;
type OrderItemRow = ItemOf<OrderFull>;

interface AdjustmentPreview {
  changes: AdjustmentChange[];
  before: AdjustmentTotals;
  after: AdjustmentTotals;
  amountCents: number;
}

function signed(cents: number): string {
  return `${cents < 0 ? '−' : cents > 0 ? '+' : ''}${formatMoney(Math.abs(cents))}`;
}

/**
 * One free-text option on an order line (the "Title of Comic"), edited in
 * place. Text never moves the price, so there is nothing to reprice or bill —
 * unlike Edit options — and it can be changed at any order status. The
 * server keeps titles unique within the order.
 */
function TextOptionRow({ orderId, item, opt, onSaved }: {
  orderId: string;
  item: OrderItemRow;
  opt: OrderItemRow['product']['options'][number];
  onSaved: () => void;
}) {
  const toast = useToast();
  const key = keyOf(opt as unknown as ProductOption);
  const raw = item.options?.[key];
  const current = typeof raw === 'string' ? raw.trim() : '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!editing) setDraft(current); }, [current, editing]);

  const cancel = () => { setEditing(false); setDraft(current); };
  const save = async () => {
    if (draft.trim() === current) { cancel(); return; }
    setBusy(true);
    try {
      await api.patch(`/admin/orders/${orderId}/items/${item.id}/text`, { key, value: draft });
      toast.success(`${opt.name} updated.`);
      setEditing(false);
      onSaved();
    } catch (e: any) {
      toast.error(errorMessage(e, `Could not update ${opt.name}`));
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div className="row" style={{ gap: '.4rem', margin: '.3rem 0', flexWrap: 'wrap', fontSize: '.9rem' }}>
        <span className="muted">{opt.name}:</span>
        {current
          ? <strong>“{current}”</strong>
          : <span style={{ color: '#b91c1c', fontWeight: 600 }}>none</span>}
        <button
          type="button"
          className="btn secondary sm"
          style={{ padding: '.1rem .5rem', fontSize: '.75rem' }}
          onClick={() => setEditing(true)}
          title="Change the text only — no price change, no payment request"
        >
          ✎ {current ? 'Rename' : 'Add'}
        </button>
      </div>
    );
  }
  return (
    <form
      className="row"
      style={{ gap: '.4rem', margin: '.3rem 0', flexWrap: 'wrap', fontSize: '.9rem' }}
      onSubmit={(e) => { e.preventDefault(); void save(); }}
    >
      <span className="muted">{opt.name}:</span>
      <input
        autoFocus
        value={draft}
        maxLength={200}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
        placeholder={opt.required ? 'Required' : ''}
        style={{ flex: '1 1 240px', maxWidth: 440, margin: 0 }}
      />
      <button type="submit" className="btn sm" disabled={busy || (!!opt.required && !draft.trim())}>{busy ? 'Saving…' : 'Save'}</button>
      <button type="button" className="btn secondary sm" disabled={busy} onClick={cancel}>Cancel</button>
    </form>
  );
}

/**
 * Change one item's selections with the same controls the customer used, see
 * the repriced result, then either bill the difference or apply a no-charge /
 * credit change immediately.
 */
function ItemOptionsEditor({ order, item, onClose, onDone }: {
  order: OrderFull; item: OrderItemRow; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast(); const confirm = useConfirm();
  const options = [...item.product.options]
    .filter((o) => o.type !== 'UPLOAD') // artwork is replaced through the proofing flow, not here
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) as unknown as ProductOption[];

  const [sel, setSel] = useState<Record<string, string | number | boolean>>(() => ({ ...(item.options ?? {}) }));
  const [preview, setPreview] = useState<AdjustmentPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(sel) !== JSON.stringify(item.options ?? {});

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [busy, onClose]);

  // Reprice on every change, debounced, through the real engine on the server.
  useEffect(() => {
    if (!dirty) { setPreview(null); setPreviewError(null); return; }
    const t = window.setTimeout(() => {
      api.post<{ preview: AdjustmentPreview }>(`/admin/orders/${order.id}/adjustments/preview`, {
        changes: [{ orderItemId: item.id, options: sel }],
      })
        .then((r) => { setPreview(r.preview); setPreviewError(null); })
        .catch((e: any) => { setPreview(null); setPreviewError(e?.message ?? 'Could not price this change'); });
    }, 300);
    return () => window.clearTimeout(t);
  }, [sel, dirty, order.id, item.id]);

  const change = preview?.changes[0];
  const delta = preview?.amountCents ?? 0;

  const submit = async () => {
    if (!preview || !change || change.diff.length === 0) return;
    const ok = await confirm(
      delta > 0
        ? { title: `Send a request to pay ${formatMoney(delta)}?`, body: `It goes to ${order.email}. The change is applied to the order once they pay.`, confirmLabel: 'Send request' }
        : delta < 0
          ? { title: 'Apply this change now?', body: `The customer will be owed ${formatMoney(-delta)} — refund it from the Payments panel afterwards.`, confirmLabel: 'Apply' }
          : { title: 'Apply this change now?', body: 'There is no difference in price.', confirmLabel: 'Apply' },
    );
    if (!ok) return;
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ applied: boolean; payUrl: string | null }>(`/admin/orders/${order.id}/adjustments`, {
        changes: [{ orderItemId: item.id, options: sel }],
        note: note.trim() || undefined,
      });
      if (r.applied) toast.success('Change applied to the order.');
      else if (r.payUrl) toast.success(`Payment request sent to ${order.email}.`);
      else toast.error(`Request sent to ${order.email}, but the email has no pay link: set the public site URL in Settings → Store, then use Resend.`);
      onDone();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save the change');
    } finally { setBusy(false); }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '2rem 1rem' }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="admin-card" style={{ width: 'min(920px, 100%)', margin: 0, background: '#fff' }}>
        <div className="spread" style={{ alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0 }}>Edit options — {item.name}</h3>
            <div className="muted" style={{ fontSize: '.85rem' }}>Qty {item.quantity} · currently {formatMoney(item.unitPriceCents)} each</div>
          </div>
          <button className="btn secondary" onClick={onClose} disabled={busy}>Close</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(260px, 2fr)', gap: '1.5rem', marginTop: '1rem' }}>
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            {options.map((opt) => (
              <OptionControl
                key={opt.id}
                opt={opt}
                value={sel[keyOf(opt)] as any}
                onChange={(v) => setSel((s) => ({ ...s, [keyOf(opt)]: v }))}
              />
            ))}
          </div>

          <aside style={{ position: 'sticky', top: '1rem', alignSelf: 'start' }}>
            <div className="admin-card" style={{ background: 'var(--bg-alt)', margin: 0 }}>
              <h4 style={{ marginTop: 0 }}>Repriced</h4>
              {!dirty && <p className="muted" style={{ margin: 0 }}>Change something to see the new price.</p>}
              {dirty && !preview && !previewError && <p className="muted" style={{ margin: 0 }}>Pricing…</p>}
              {previewError && <div className="error">{previewError}</div>}
              {preview && change && (
                <table style={{ width: '100%', fontSize: '.9rem' }}>
                  <tbody>
                    <tr><td>Unit</td><td style={{ textAlign: 'right' }}>{formatMoney(change.before.unitPriceCents)} → <strong>{formatMoney(change.after.unitPriceCents)}</strong></td></tr>
                    <tr><td>Line × {change.quantity}</td><td style={{ textAlign: 'right' }}>{formatMoney(change.before.totalCents)} → <strong>{formatMoney(change.after.totalCents)}</strong></td></tr>
                    {preview.after.taxCents !== preview.before.taxCents && (
                      <tr><td>Tax</td><td style={{ textAlign: 'right' }}>{formatMoney(preview.before.taxCents)} → {formatMoney(preview.after.taxCents)}</td></tr>
                    )}
                    <tr><td>Order total</td><td style={{ textAlign: 'right' }}>{formatMoney(preview.before.totalCents)} → <strong>{formatMoney(preview.after.totalCents)}</strong></td></tr>
                    <tr style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                      <td style={{ paddingTop: '.5rem' }}>{delta > 0 ? 'Customer owes' : delta < 0 ? 'Customer is owed' : 'Difference'}</td>
                      <td style={{ paddingTop: '.5rem', textAlign: 'right', color: delta > 0 ? '#b91c1c' : delta < 0 ? '#166534' : 'inherit' }}>{signed(delta)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              {change && change.diff.length > 0 && (
                <ul className="muted" style={{ fontSize: '.8rem', margin: '.75rem 0 0', paddingLeft: '1rem' }}>
                  {change.diff.map((d) => <li key={d.key}>{d.label}: {d.from} → <strong>{d.to}</strong></li>)}
                </ul>
              )}
            </div>

            <label style={{ marginTop: '1rem', fontSize: '.85rem' }}>Note to the customer (optional)</label>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Your files need the heavier cover to print cleanly — here's the difference." />

            {error && <div className="error" style={{ marginTop: '.5rem' }}>{error}</div>}

            <button
              className="btn"
              style={{ width: '100%', marginTop: '.75rem' }}
              disabled={busy || !preview || !change || change.diff.length === 0}
              onClick={submit}
            >
              {busy ? 'Working…'
                : !change || change.diff.length === 0 ? 'No change yet'
                : delta > 0 ? `Send payment request for ${formatMoney(delta)}`
                : delta < 0 ? `Apply — customer owed ${formatMoney(-delta)}`
                : 'Apply change (no price difference)'}
            </button>
            <p className="muted" style={{ fontSize: '.78rem', marginTop: '.5rem' }}>
              Priced at today's list, scaled to the same rate the customer paid on this line — so the difference is only the option change.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function AdjustmentsCard({ orderId, adjustments, onChange }: { orderId: string; adjustments: AdjustmentRow[]; onChange: () => void }) {
  const toast = useToast(); const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (a: AdjustmentRow, what: 'resend' | 'cancel') => {
    if (what === 'cancel' && !(await confirm({ title: 'Cancel this payment request?', body: 'The order stays exactly as it was; the link stops working.', confirmLabel: 'Cancel request', danger: true }))) return;
    setBusy(a.id);
    try {
      const r = await api.post<{ ok: boolean; payUrl?: string | null }>(`/admin/orders/${orderId}/adjustments/${a.id}/${what}`);
      if (what === 'resend') toast.success(r.payUrl ? 'Payment request re-sent.' : 'Re-sent, but there is no pay link — set the public site URL in Settings → Store.');
      onChange();
    } catch (e: any) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  const copyLink = async (a: AdjustmentRow) => {
    try {
      const r = await api.post<{ ok: boolean; payUrl?: string | null }>(`/admin/orders/${orderId}/adjustments/${a.id}/resend`);
      if (r.payUrl) { await navigator.clipboard?.writeText(r.payUrl); toast.success('Pay link copied (and the email re-sent).'); }
      else toast.error('No public site URL is set in Settings → Store, so there is no link to copy.');
    } catch (e: any) { toast.error(errorMessage(e)); }
  };
  const tone: Record<AdjustmentRow['status'], string> = { pending: '#b45309', paid: '#166534', applied: '#166534', cancelled: '#6b7280' };

  return (
    <div className="admin-card">
      <h3>Order changes</h3>
      <div style={{ display: 'grid', gap: '.75rem' }}>
        {adjustments.map((a) => (
          <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '.75rem 1rem' }}>
            <div className="spread" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '.5rem' }}>
              <div>
                <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '.75rem', letterSpacing: '.05em', color: tone[a.status] }}>{a.status}</span>
                <span style={{ marginLeft: '.6rem', fontWeight: 700 }}>{signed(a.amountCents)}</span>
                <span className="muted" style={{ marginLeft: '.6rem', fontSize: '.85rem' }}>
                  {new Date(a.createdAt).toLocaleString()}
                  {a.paidAt && ` · paid ${new Date(a.paidAt).toLocaleString()}`}
                  {a.status === 'pending' && ` · link expires ${new Date(a.expiresAt).toLocaleDateString()}`}
                </span>
              </div>
              {a.status === 'pending' && (
                <div className="row" style={{ gap: '.4rem' }}>
                  <button className="btn secondary" style={{ padding: '.25rem .6rem', fontSize: '.8rem' }} disabled={busy === a.id} onClick={() => copyLink(a)}>Copy pay link</button>
                  <button className="btn secondary" style={{ padding: '.25rem .6rem', fontSize: '.8rem' }} disabled={busy === a.id} onClick={() => act(a, 'resend')}>Resend email</button>
                  <button className="btn secondary" style={{ padding: '.25rem .6rem', fontSize: '.8rem', color: '#b91c1c', borderColor: '#b91c1c' }} disabled={busy === a.id} onClick={() => act(a, 'cancel')}>Cancel</button>
                </div>
              )}
            </div>
            <ul className="muted" style={{ fontSize: '.85rem', margin: '.4rem 0 0', paddingLeft: '1rem' }}>
              {a.changes.map((c) => (
                <li key={c.orderItemId}>
                  <strong>{c.itemName}</strong>: {c.diff.map((d) => `${d.label} ${d.from} → ${d.to}`).join(', ')}
                  {' '}<span>({formatMoney(c.before.totalCents)} → {formatMoney(c.after.totalCents)})</span>
                </li>
              ))}
            </ul>
            {a.note && <div className="muted" style={{ fontSize: '.85rem', marginTop: '.35rem', fontStyle: 'italic' }}>"{a.note}"</div>}
            {a.status === 'applied' && a.amountCents < 0 && (
              <div style={{ fontSize: '.85rem', marginTop: '.35rem', color: '#166534' }}>Customer is owed {formatMoney(-a.amountCents)} — use "Refund via PayPal" in Payments.</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Refund through PayPal. One form — amount (blank = everything), a note the
 * customer sees, and a clear statement of what is about to happen — instead
 * of three sequential browser prompts.
 */
function RefundDialog({ orderId, fullAmountCents, onClose, onDone }: {
  orderId: string; fullAmountCents: number; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleaned = amount.replace(/[^0-9.]/g, '');
  const amountCents = cleaned ? Math.round(Number(cleaned) * 100) : undefined;
  const problem =
    amount.trim() && !(amountCents! > 0) ? 'Enter a dollar amount like 12.50, or leave it blank for a full refund.'
    : amountCents && amountCents > fullAmountCents ? `That is more than the ${formatMoney(fullAmountCents)} this order was charged.`
    : null;
  const refunding = amountCents ?? fullAmountCents;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [busy, onClose]);

  const submit = async () => {
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ refund: { refundId: string; status: string; refundedCents: number } }>(
        `/admin/orders/${orderId}/refund`, { amountCents, note: note.trim() || undefined },
      );
      toast.success(`Refunded ${formatMoney(r.refund.refundedCents)} — PayPal refund ${r.refund.refundId} (${r.refund.status}).`);
      onDone();
    } catch (e: any) {
      // PayPal's issue code and debug id are what their support asks for.
      const d = e?.details ?? {};
      const extra = [d.issue, d.debugId ? `PayPal debug id ${d.debugId}` : null].filter(Boolean).join(', ');
      setError(`${errorMessage(e, 'Refund failed')}${extra ? ` (${extra})` : ''}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="pc-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form className="pc-dialog" role="dialog" aria-modal="true" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <h3 style={{ margin: '0 0 .25rem' }}>Refund via PayPal</h3>
        <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>This order was charged {formatMoney(fullAmountCents)}.</p>

        <label style={{ marginTop: '1rem' }}>Amount to refund</label>
        <input
          autoFocus
          inputMode="decimal"
          placeholder={`Leave blank to refund all ${formatMoney(fullAmountCents)}`}
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setError(null); }}
        />
        <label style={{ marginTop: '.75rem' }}>Note to the customer (optional)</label>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shows on their PayPal receipt" />

        {(error ?? problem) && <div className="error" style={{ marginBottom: 0 }}>{error ?? problem}</div>}

        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn danger" disabled={busy || !!problem}>
            {busy ? 'Refunding…' : `Refund ${formatMoney(refunding)}`}
          </button>
        </div>
      </form>
    </div>
  );
}
