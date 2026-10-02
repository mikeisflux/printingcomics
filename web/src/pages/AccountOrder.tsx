import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatMoney } from '../api/client';
import { StatusBadge } from './Account';
import { formatCartItemOptions } from '../lib/cart-options';
import { formatFileSize, printFileSummary, uploadWithProgress, type PrintFileKind } from '../lib/print-files';

/**
 * Account → Orders → one order: the screen a customer manages an order from.
 * Every book on it has two upload spots — the Cover PDF and the Interior PDF
 * — with the rules spelled out next to each; a print has one. This is where
 * the "we need new files" email lands, and where the files are first sent if
 * they were not at checkout.
 */

export interface PrintFileSlot {
  kind: PrintFileKind;
  label: string;
  expectedPages: number | null;
  instructions: string[];
  file: { id: string; name: string; size: number; url: string; pages: number | null; uploadedAt: string } | null;
  previous: number;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  options?: Record<string, unknown> | null;
  product: { slug: string; name: string; options: { id: string; name: string; internalKey?: string | null; type: string; values: { label: string; subLabel?: string | null }[] }[] };
  printFiles: PrintFileSlot[];
}

interface MediaRequest { id: string; message: string; status: 'open' | 'fulfilled'; createdAt: string; fulfilledAt: string | null }

interface Order {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  proofStatus?: string | null;
  createdAt: string;
  totalCents: number;
  items: OrderItem[];
  mediaRequests: MediaRequest[];
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString();

function itemTitle(it: OrderItem): string | null {
  const t = it.options?.['title'];
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

function SlotCard({ orderNumber, item, slot, onChange }: { orderNumber: string; item: OrderItem; slot: PrintFileSlot; onChange: (slots: PrintFileSlot[], openRequests: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [justDone, setJustDone] = useState(false);

  async function send(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    setBusy(true); setErr(null); setProgress(0); setJustDone(false);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', slot.kind);
      const r = await uploadWithProgress<{ printFiles: PrintFileSlot[]; openRequests: number }>(`/api/orders/${encodeURIComponent(orderNumber)}/items/${item.id}/files`, fd, setProgress);
      onChange(r.printFiles, r.openRequests);
      setJustDone(true);
    } catch (e: any) {
      setErr(e?.message ?? 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!slot.file) return;
    if (!window.confirm(`Remove ${slot.file.name}? The ${slot.label} spot will show as missing until you upload another.`)) return;
    setBusy(true); setErr(null); setJustDone(false);
    try {
      const r = await api.del<{ printFiles: PrintFileSlot[]; openRequests: number }>(`/orders/${encodeURIComponent(orderNumber)}/items/${item.id}/files/${slot.file.id}`);
      onChange(r.printFiles, r.openRequests);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not remove the file');
    } finally {
      setBusy(false);
    }
  }

  const has = !!slot.file;
  return (
    <div
      data-testid={`slot-${slot.kind}`}
      style={{ border: `2px solid ${has ? '#16a34a' : '#c61a22'}`, borderRadius: 'var(--radius)', padding: '.85rem 1rem', background: has ? '#f0fdf4' : '#fff5f5', display: 'flex', flexDirection: 'column', gap: '.5rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '1.05rem' }}>{slot.label}</strong>
        <span style={{ fontWeight: 700, fontSize: '.8rem', color: has ? '#166534' : '#b91c1c', textTransform: 'uppercase', letterSpacing: '.03em' }}>
          {has ? (justDone ? 'Uploaded ✓' : 'On file ✓') : 'Missing'}
        </span>
      </div>
      <div className="muted" style={{ fontSize: '.85rem' }}>{printFileSummary(slot.kind, slot.expectedPages)}</div>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '.85rem', lineHeight: 1.5 }}>
        {slot.instructions.map((line, i) => <li key={i}>{line}</li>)}
      </ul>
      {slot.file && (
        <div style={{ fontSize: '.9rem' }}>
          <a href={slot.file.url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{slot.file.name}</a>
          <span className="muted"> · {slot.file.pages ? `${slot.file.pages} page${slot.file.pages === 1 ? '' : 's'} · ` : ''}{formatFileSize(slot.file.size)} · {fmtDate(slot.file.uploadedAt)}</span>
          {slot.previous > 0 && <span className="muted"> · replaces {slot.previous} earlier upload{slot.previous === 1 ? '' : 's'}</span>}
        </div>
      )}
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <label className={has ? 'btn secondary' : 'btn'} style={{ display: 'inline-block', cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? (progress ? `Uploading… ${progress}%` : 'Working…') : has ? `Replace ${slot.label}` : `Upload ${slot.label}`}
          <input type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} disabled={busy} onChange={(e) => { void send(e.target.files); e.currentTarget.value = ''; }} />
        </label>
        {has && (
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void remove()} title="Take this file out — the spot shows as missing until you upload another">
            Remove
          </button>
        )}
      </div>
      {err && <div className="error" style={{ margin: 0 }}>{err}</div>}
    </div>
  );
}

export function AccountOrder() {
  const { number } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneBusy, setDoneBusy] = useState<string | null>(null);
  const [doneErr, setDoneErr] = useState<string | null>(null);

  const load = () => api.get<{ order: Order }>(`/orders/${encodeURIComponent(number ?? '')}`).then((r) => setOrder(r.order)).catch((e: any) => setError(e?.message ?? 'Could not load this order'));
  useEffect(() => { if (number) void load(); }, [number]); // eslint-disable-line react-hooks/exhaustive-deps

  async function markDone(requestId: string) {
    setDoneBusy(requestId); setDoneErr(null);
    try {
      await api.post(`/orders/${encodeURIComponent(number ?? '')}/requests/${requestId}/done`);
      await load();
    } catch (e: any) {
      setDoneErr(e?.message ?? 'Could not mark the request done');
    } finally {
      setDoneBusy(null);
    }
  }

  if (error) return <div className="error">{error}</div>;
  if (!order) return <p className="muted">Loading your order…</p>;

  const openRequests = order.mediaRequests.filter((m) => m.status === 'open');
  const bookLines = order.items.filter((i) => i.printFiles.length > 0);
  const missing = bookLines.reduce((n, i) => n + i.printFiles.filter((s) => !s.file).length, 0);
  const otherLines = order.items.filter((i) => i.printFiles.length === 0);

  return (
    <div>
      <p style={{ margin: '0 0 .5rem' }}><Link to="/account/orders">← All orders</Link></p>
      <div className="spread" style={{ flexWrap: 'wrap', gap: '.75rem', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0 }}>Order {order.number}</h1>
          <div className="muted" style={{ fontSize: '.9rem' }}>Placed {fmtDate(order.createdAt)} · {formatMoney(order.totalCents)} · <Link to={`/order/${order.number}`}>Receipt</Link></div>
        </div>
        <div className="row" style={{ gap: '.5rem', flexWrap: 'wrap' }}>
          <StatusBadge status={order.status} />
          <StatusBadge status={order.paymentStatus} />
        </div>
      </div>

      {openRequests.map((m) => (
        <div key={m.id} className="admin-card" data-testid="file-request" style={{ borderLeft: '5px solid var(--brand)', marginTop: '1rem' }}>
          <div style={{ fontSize: '.75rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.03em', color: 'var(--brand)' }}>We need new files from you</div>
          <blockquote style={{ borderLeft: '3px solid var(--border)', margin: '.5rem 0', padding: '.25rem 1rem', whiteSpace: 'pre-wrap' }}>{m.message}</blockquote>
          <p style={{ margin: '.25rem 0 .75rem', fontSize: '.9rem' }}>
            Asked {fmtDate(m.createdAt)}. Upload the files into the spots below — each book has a <strong>Cover PDF</strong> and an <strong>Interior PDF</strong> — then press Done so our team picks them up.
          </p>
          <button className="btn" type="button" disabled={doneBusy === m.id} onClick={() => void markDone(m.id)}>
            {doneBusy === m.id ? 'Saving…' : 'Done — the files are uploaded'}
          </button>
          {doneErr && doneBusy === null && <div className="error" style={{ marginTop: '.5rem' }}>{doneErr}</div>}
        </div>
      ))}

      {bookLines.length > 0 && (
        <div style={{ marginTop: '1.25rem' }}>
          <h2 style={{ margin: '0 0 .25rem', fontSize: '1.2rem' }}>Print files</h2>
          <p className="muted" style={{ margin: '0 0 .75rem', fontSize: '.9rem' }}>
            {missing > 0
              ? `${missing} file${missing === 1 ? '' : 's'} still missing. Each book needs two PDFs: the cover (4 pages) and the interior (every inside page). Nothing prints until both are here.`
              : 'Every book has its two PDFs. Replace one any time before the order goes to print — the newest upload is the one we use.'}
          </p>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {bookLines.map((it) => {
              const title = itemTitle(it);
              const pairs = formatCartItemOptions({ options: it.options ?? undefined, product: { options: it.product.options } } as any).filter((p) => !/pdf|upload/i.test(p.label));
              return (
                <div key={it.id} className="admin-card" data-testid={`book-${it.id}`} style={{ margin: 0 }}>
                  <div style={{ marginBottom: '.5rem' }}>
                    <strong style={{ fontSize: '1.05rem' }}>{title ? `“${title}”` : it.name}</strong>
                    <span className="muted"> · {title ? it.name : ''}{title ? ' · ' : ''}{it.quantity} cop{it.quantity === 1 ? 'y' : 'ies'}</span>
                    {pairs.length > 0 && (
                      <div className="muted" style={{ fontSize: '.8rem', marginTop: '.2rem' }}>{pairs.slice(0, 6).map((p) => `${p.label}: ${p.value}`).join(' · ')}</div>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '.75rem' }}>
                    {it.printFiles.map((slot) => (
                      <SlotCard
                        key={slot.kind}
                        orderNumber={order.number}
                        item={it}
                        slot={slot}
                        onChange={(slots, open) => setOrder((o) => o && ({
                          ...o,
                          items: o.items.map((x) => (x.id === it.id ? { ...x, printFiles: slots } : x)),
                          mediaRequests: open === 0 ? o.mediaRequests.map((m) => ({ ...m, status: 'fulfilled' as const })) : o.mediaRequests,
                        }))}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {otherLines.length > 0 && (
        <div className="admin-card" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Also on this order</h3>
          {otherLines.map((it) => (
            <div key={it.id} className="spread" style={{ fontSize: '.9rem', padding: '.25rem 0' }}>
              <span>{it.name} × {it.quantity}</span><span>{formatMoney(it.totalCents)}</span>
            </div>
          ))}
        </div>
      )}

      <p className="muted" style={{ marginTop: '1.25rem', fontSize: '.9rem' }}>
        Proofs to approve are under <Link to={`/account/proofs?order=${encodeURIComponent(order.number)}`}>Proofs &amp; files</Link>. Questions? Reply to any of our emails.
      </p>
    </div>
  );
}
