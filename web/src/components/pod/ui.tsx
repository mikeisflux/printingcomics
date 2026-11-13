/**
 * Building blocks for every Print On Demand screen. All of them assume a
 * `.pod` ancestor (styles/pod.css).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, XCircle, Info, UploadCloud, X } from 'lucide-react';
import { api } from '../../api/client';
import { LISTING_STATUS, type ListingStatus, type PreflightResult, daysUntil, dateShort, money, hueOf, initials, fileSize } from '../../lib/pod';

// --- Pills ------------------------------------------------------------------

export function Pill({ tone = 'violet', children, live, title }: { tone?: string; children: ReactNode; live?: boolean; title?: string }) {
  return <span className={`pill ${tone}${live ? ' live' : ''}`} title={title}>{children}</span>;
}

export function StatusPill({ status }: { status: ListingStatus | string }) {
  const s = LISTING_STATUS[status as ListingStatus];
  return <Pill tone={s?.tone ?? 'slate'} live={status === 'LIVE'} title={s?.hint}>{s?.label ?? status}</Pill>;
}

export function TonePill({ map, status }: { map: Record<string, { label: string; tone: string }>; status: string }) {
  const s = map[status];
  return <Pill tone={s?.tone ?? 'slate'}>{s?.label ?? status}</Pill>;
}

// --- KPI tiles --------------------------------------------------------------

export function Kpi({ label, value, sub, to, tone, dark, icon }: { label: ReactNode; value: ReactNode; sub?: ReactNode; to?: string; tone?: 'hot'; dark?: boolean; icon?: ReactNode }) {
  const body = (
    <>
      <div className="kpi-label"><span>{label}</span>{icon}</div>
      <div className="kpi-value mono">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </>
  );
  const cls = `kpi${tone ? ` ${tone}` : ''}${dark ? ' dark' : ''}${to ? ' link' : ''}`;
  return to ? <Link to={to} className={cls} style={{ textDecoration: 'none' }}>{body}</Link> : <div className={cls}>{body}</div>;
}

// --- Cycle timeline + countdown -----------------------------------------------

export function CycleTimeline({ catalogDate, focDate, inStoreDate, compact }: { catalogDate: string; focDate: string; inStoreDate: string; compact?: boolean }) {
  const now = Date.now();
  const t = [new Date(catalogDate).getTime(), new Date(focDate).getTime(), new Date(inStoreDate).getTime()];
  let progress = 0;
  if (now >= t[2]!) progress = 100;
  else if (now >= t[1]!) progress = 50 + (50 * (now - t[1]!)) / Math.max(1, t[2]! - t[1]!);
  else if (now >= t[0]!) progress = (50 * (now - t[0]!)) / Math.max(1, t[1]! - t[0]!);
  const stage = (i: number) => (now >= t[i]! ? (i === 2 || now < t[i + 1]! ? 'now' : 'done') : '');
  const steps = [
    { label: 'Catalog', date: catalogDate, hint: 'Solicitations open' },
    { label: 'Final order cutoff', date: focDate, hint: 'Shops lock their orders' },
    { label: 'In store', date: inStoreDate, hint: 'Books ship & land' },
  ];
  return (
    <div className="timeline" aria-label="Catalog cycle timeline">
      <div className="progress" style={{ width: `${Math.min(84, (progress / 100) * 84)}%` }} />
      {steps.map((s, i) => (
        <div key={s.label} className={`tl-step ${stage(i)}`}>
          <div className="tl-dot" />
          <div className="tl-label">{s.label}</div>
          <div className="tl-date">{dateShort(s.date)}</div>
          {!compact && <div className="tl-hint">{s.hint}</div>}
        </div>
      ))}
    </div>
  );
}

export function Countdown({ to, label }: { to: string; label?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  const end = new Date(to).setHours(23, 59, 59, 999);
  const ms = Math.max(0, end - now);
  const d = Math.floor(ms / 86_400_000); const h = Math.floor((ms % 86_400_000) / 3_600_000); const m = Math.floor((ms % 3_600_000) / 60_000); const s = Math.floor((ms % 60_000) / 1000);
  return (
    <div>
      {label && <div className="eyebrow" style={{ marginBottom: '.5rem' }}>{label}</div>}
      <div className="countdown mono" role="timer">
        {[[d, 'days'], [h, 'hrs'], [m, 'min'], [s, 'sec']].map(([v, l]) => <div className="cd" key={l as string}><b>{String(v).padStart(2, '0')}</b><span>{l}</span></div>)}
      </div>
    </div>
  );
}

export function DaysLeft({ to }: { to: string | null | undefined }) {
  const d = daysUntil(to);
  if (d === null) return null;
  const tone = d < 0 ? 'slate' : d <= 3 ? 'rose' : d <= 10 ? 'amber' : 'teal';
  return <Pill tone={tone}>{d < 0 ? `${-d}d ago` : d === 0 ? 'today' : `${d}d left`}</Pill>;
}

// --- Tier ladder --------------------------------------------------------------

export function TierLadder({ tiers, activeIndex, subtotalCents }: { tiers: { name: string; minCents: number; discountBps: number }[]; activeIndex?: number; subtotalCents?: number }) {
  return (
    <div className="ladder" style={{ gridTemplateColumns: `repeat(${tiers.length}, 1fr)` }}>
      {tiers.map((t, i) => (
        <div key={t.name} className={`rung${activeIndex === i ? ' on' : ''}`}>
          <div className="nm">{t.name}</div>
          <div className="big">{Math.round(t.discountBps / 100)}%<span style={{ fontSize: '.9rem', fontWeight: 600, marginLeft: '.25rem' }}>off</span></div>
          <div className="from">{t.minCents ? `Orders from ${money(t.minCents)} at cover price` : 'Every order'}</div>
          {activeIndex === i && subtotalCents !== undefined && <div className="dim" style={{ fontSize: '.78rem', marginTop: '.25rem' }}>Your basket: {money(subtotalCents)} at cover</div>}
        </div>
      ))}
    </div>
  );
}

export function Meter({ value, thin }: { value: number; thin?: boolean }) {
  return <div className={`meter${thin ? ' thin' : ''}`}><i style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} /></div>;
}

// --- Covers --------------------------------------------------------------------

export function CoverArt({ url, title, tag, className }: { url: string | null | undefined; title: string; tag?: ReactNode; className?: string }) {
  return (
    <div className={`cover-art${className ? ` ${className}` : ''}`} style={{ ['--h' as string]: hueOf(title) }}>
      {url ? <img src={url} alt={title} loading="lazy" /> : <div className="fallback">{title}</div>}
      <div className="spine" /><div className="gloss" />
      {tag && <div className="tag">{tag}</div>}
    </div>
  );
}

export function CoverCard({ to, url, title, sub, price, tag }: { to: string; url: string | null | undefined; title: string; sub?: ReactNode; price?: ReactNode; tag?: ReactNode }) {
  return (
    <Link to={to} className="cover-card">
      <CoverArt url={url} title={title} tag={tag} />
      <div className="cover-meta">
        <div className="cover-title">{title}</div>
        <div className="cover-sub"><span>{sub}</span>{price && <span className="price">{price}</span>}</div>
      </div>
    </Link>
  );
}

export function Thumb({ url, title, size = 38 }: { url: string | null | undefined; title: string; size?: number }) {
  const h = Math.round(size * 1.47);
  return url
    ? <img className="thumb" src={url} alt="" style={{ width: size, height: h }} />
    : <span className="thumb ph" style={{ width: size, height: h, ['--h' as string]: hueOf(title) }}>{initials(title)}</span>;
}

export function Avatar({ name, lg }: { name: string; lg?: boolean }) {
  return <span className={`avatar${lg ? ' lg' : ''}`} style={{ ['--h' as string]: hueOf(name) }}>{initials(name)}</span>;
}

// --- Drop zone (uploads) --------------------------------------------------------

export function DropZone({ accept, title, hint, busy, onFile, compact }: { accept: string; title: ReactNode; hint?: ReactNode; busy?: boolean; onFile: (f: File) => void; compact?: boolean }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`drop${over ? ' over' : ''}${busy ? ' busy' : ''}`}
      style={compact ? { padding: '.7rem' } : undefined}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
    >
      <input type="file" accept={accept} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ''; }} aria-label={typeof title === 'string' ? title : 'Upload'} />
      <UploadCloud size={compact ? 18 : 24} style={{ color: 'var(--p-violet)' }} />
      <div className="drop-title">{busy ? 'Uploading…' : title}</div>
      {hint && <div className="drop-hint">{hint}</div>}
    </div>
  );
}

// --- Preflight report -------------------------------------------------------------

export function PreflightReport({ result, compact }: { result: PreflightResult | null | undefined; compact?: boolean }) {
  if (!result) return null;
  const ic = { pass: '✓', fail: '✕', warning: '!', manual: '…' } as const;
  return (
    <div className={`preflight ${result.status}`}>
      <div className="pf-head">
        <span className="row" style={{ gap: '.5rem' }}>
          {result.status === 'ready' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}{result.headline}
        </span>
        <span className="dim" style={{ fontSize: '.78rem', fontWeight: 500 }}>{result.pageCount != null ? `${result.pageCount} pages` : ''}</span>
      </div>
      {(compact ? result.checks.filter((c) => c.status !== 'pass') : result.checks).map((c) => (
        <div key={c.id} className={`pf-row ${c.status}`}><i>{ic[c.status]}</i><div><b>{c.label}</b><span>{c.detail}</span></div></div>
      ))}
    </div>
  );
}

// --- File slot: one kind of file on a listing -----------------------------------

export function FileSlot({ label, file, accept, onUpload, busy, hint, actions, readOnly, versions, onRestore, onDelete }: {
  label: string; file: { id?: string; media: { url: string; name: string; size: number }; version: number; olderVersions: number; reviewStatus: string; preflight: PreflightResult | null; note: string | null } | null;
  accept: string; onUpload?: (f: File) => void; busy?: boolean; hint?: ReactNode; actions?: ReactNode; readOnly?: boolean;
  /** Older versions of this kind, newest first. */
  versions?: { id: string; version: number; reviewStatus: string; createdAt: string; media: { url: string; name: string; size: number } }[];
  onRestore?: (fileId: string) => void; onDelete?: (fileId: string) => void;
}) {
  const tone = !file ? 'rose' : file.reviewStatus === 'approved' ? 'green' : file.reviewStatus === 'rejected' ? 'red' : 'amber';
  const stat = !file ? 'Missing' : file.reviewStatus === 'approved' ? 'Approved' : file.reviewStatus === 'rejected' ? 'Needs a new file' : 'Uploaded';
  return (
    <div className="panel tight">
      <div className="between" style={{ marginBottom: '.6rem' }}>
        <b>{label}</b>
        <Pill tone={tone}>{stat}</Pill>
      </div>
      {file && (
        <div className="stack" style={{ gap: '.5rem', marginBottom: '.6rem' }}>
          <div className="between" style={{ fontSize: '.88rem' }}>
            <a href={file.media.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{file.media.name}</a>
            <span className="dim">{fileSize(file.media.size)} · v{file.version}{file.olderVersions ? ` (+${file.olderVersions} older)` : ''}</span>
          </div>
          {file.note && <div className="notice warn" style={{ padding: '.6rem .8rem' }}><Info size={16} /> <span>{file.note}</span></div>}
          <PreflightReport result={file.preflight} compact />
        </div>
      )}
      {!readOnly && onUpload && <DropZone compact accept={accept} busy={busy} title={file ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`} hint={hint} onFile={onUpload} />}
      {actions && <div className="row" style={{ marginTop: '.6rem' }}>{actions}</div>}
      {versions && versions.length > 0 && (
        <details style={{ marginTop: '.6rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '.8rem', fontWeight: 600, color: 'var(--p-text-dim)' }}>{versions.length} older version{versions.length === 1 ? '' : 's'}</summary>
          <ul style={{ listStyle: 'none', margin: '.4rem 0 0', padding: 0, display: 'grid', gap: '.3rem' }}>
            {versions.map((v) => (
              <li key={v.id} className="between" style={{ fontSize: '.78rem', gap: '.5rem' }}>
                <span><b>v{v.version}</b> · <a href={v.media.url} target="_blank" rel="noreferrer">{v.media.name}</a> · {fileSize(v.media.size)} · {v.reviewStatus} · {new Date(v.createdAt).toLocaleDateString()}</span>
                <span className="row" style={{ gap: '.3rem' }}>
                  {onRestore && <button className="pbtn ghost xs" onClick={() => onRestore(v.id)}>Make current</button>}
                  {onDelete && <button className="pbtn ghost xs" onClick={() => { if (confirm(`Delete v${v.version} for good?`)) onDelete(v.id); }} aria-label="Delete version">✕</button>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** A scannable barcode image (served by the API) with the number under it. */
export function Barcode({ code, height = 64 }: { code: string; height?: number }) {
  return <img src={`/api/pod/barcode/${code}.svg`} alt={`Barcode ${code}`} style={{ height, maxWidth: '100%', background: '#fff', borderRadius: 6, border: '1px solid var(--p-line)', padding: 4 }} />;
}

/** A tiny bar chart with no library: values scaled to the tallest. */
export function Bars({ values, labels, height = 120, format }: { values: number[]; labels?: string[]; height?: number; format?: (v: number) => string }) {
  const max = Math.max(1, ...values);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height, width: '100%' }} role="img" aria-label="Bar chart">
      {values.map((v, i) => (
        <div key={i} title={`${labels?.[i] ?? ''} ${format ? format(v) : v}`} style={{ flex: 1, minWidth: 2, height: `${Math.max(2, (v / max) * 100)}%`, background: v ? 'var(--p-grad)' : 'var(--p-line)', borderRadius: '3px 3px 0 0', opacity: v ? 1 : .6 }} />
      ))}
    </div>
  );
}

// --- Drawer ---------------------------------------------------------------------

export function Drawer({ open, onClose, title, children, width }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer" style={width ? { width: `min(${width}px, 100vw)` } : undefined} role="dialog" aria-modal="true">
        <div className="drawer-head"><h3 className="display-md" style={{ margin: 0 }}>{title}</h3><button className="pbtn ghost xs" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        {children}
      </aside>
    </>
  );
}

// --- Inline toast ------------------------------------------------------------------

export function useFlash() {
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(null);
  const t = useRef<number | null>(null);
  const show = useCallback((text: string, bad = false) => {
    setFlash({ text, bad });
    if (t.current) window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setFlash(null), 3600);
  }, []);
  const node = flash ? <div className={`toast-inline${flash.bad ? ' bad' : ''}`} role="status">{flash.bad ? <XCircle size={16} /> : <CheckCircle2 size={16} />}{flash.text}</div> : null;
  return { show, node };
}

export function errText(e: unknown, fallback = 'Something went wrong') {
  return e instanceof Error && e.message ? e.message : fallback;
}

// --- Data hook ---------------------------------------------------------------------

export function useLoad<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try { setData(await api.get<T>(path)); setError(null); } catch (e) { setError(errText(e)); } finally { setLoading(false); }
  }, [path]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, [reload, ...deps]);
  return { data, error, loading, reload, setData };
}

export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{body && <div>{body}</div>}{action && <div style={{ marginTop: '1rem' }}>{action}</div>}</div>;
}

export function Events({ events }: { events: { id: string; message: string | null; kind: string; actorName: string | null; createdAt: string }[] }) {
  if (!events.length) return <p className="dim" style={{ fontSize: '.88rem' }}>Nothing yet.</p>;
  return (
    <ul className="events">
      {events.map((e) => (
        <li key={e.id}><span className="who">{e.actorName ?? 'system'}</span> · {e.kind}{e.message ? ` — ${e.message}` : ''}<span className="when">{new Date(e.createdAt).toLocaleString()}</span></li>
      ))}
    </ul>
  );
}
