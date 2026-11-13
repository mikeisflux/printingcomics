/**
 * /retailer/catalog — ordering. Every open catalog is orderable (one order
 * per catalog per shop); search, filters (publisher, format, released,
 * availability, followed), sort, paging, a fast-entry box for catalog ids,
 * the order sheet round trip, and a title drawer with the full solicitation,
 * a quantity box and "follow publisher".
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { ShoppingCart, Download, Upload, Search, CheckCircle2, X, Trash2, Zap, Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../api/client';
import { money, dateShort, FORMAT_LABELS, type PublicSettings } from '../../lib/pod';
import { priceBasket } from '../../lib/wholesale';
import { CoverArt, DaysLeft, Drawer, Empty, Meter, Pill, Thumb, errText, useFlash, useLoad } from '../../components/pod/ui';

interface Me { retailer: { id: string; name: string; tierOverride: number | null; creditCents: number; followedPartnerIds: string[] }; settings: PublicSettings; cycle: { id: string } | null; openCycles: { id: string; slug: string; name: string; catalogDate: string; focDate: string; inStoreDate: string }[] }
const useMe = () => useOutletContext<{ me: Me | null; reload: () => Promise<void> }>();
interface Snapshot { listingId: string; catalogKey: string; title: string; seriesName: string | null; issueNumber: string | null; coverDescription: string | null; variantNumber: string | null; upc: string | null; format: string; pageCount: number | null; trimWidthIn: number | null; trimHeightIn: number | null; interiorColor: string | null; msrpCents: number; writer: string | null; artist: string | null; coverArtist: string | null; ageRating: string | null; synopsis: string | null; description: string | null; incentiveRatio: string | null; reorderable: boolean; fulfillment: string; partner: { id: string; name: string; slug: string }; coverImageUrl: string | null; baseWholesaleCents: number; followed: boolean; publisherLogoUrl: string | null; publisherWebsite: string | null }
interface CatalogResp { cycle: { id: string; slug: string; name: string; catalogDate: string; focDate: string; inStoreDate: string; orderingOpen: boolean; status: string } | null; tiers: PublicSettings['tiers']; forcedTier: number | null; followedPartnerIds: string[]; openOrder: { id: string; number: string; subtotalCents: number; items: { listingId: string; quantity: number }[] } | null; listings: Snapshot[] }

const SORTS: Record<string, { label: string; fn: (a: Snapshot, b: Snapshot) => number }> = {
  code: { label: 'Catalog id A–Z', fn: (a, b) => a.catalogKey.localeCompare(b.catalogKey) },
  title: { label: 'Title A–Z', fn: (a, b) => a.title.localeCompare(b.title) || String(a.issueNumber).localeCompare(String(b.issueNumber), undefined, { numeric: true }) },
  publisher: { label: 'Publisher A–Z', fn: (a, b) => a.partner.name.localeCompare(b.partner.name) || a.title.localeCompare(b.title) },
  priceAsc: { label: 'Price low → high', fn: (a, b) => a.msrpCents - b.msrpCents },
  priceDesc: { label: 'Price high → low', fn: (a, b) => b.msrpCents - a.msrpCents },
};
const PAGE = 24;

export function RetailerCatalog() {
  const { me, reload: reloadMe } = useMe();
  const [params, setParams] = useSearchParams();
  const cycleId = params.get('cycle') ?? '';
  const { data, loading, reload } = useLoad<CatalogResp>(`/pod/retailer/catalog${cycleId ? `?cycle=${cycleId}` : ''}`, [cycleId]);
  const { show, node } = useFlash();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [q, setQ] = useState('');
  const [publisher, setPublisher] = useState('');
  const [format, setFormat] = useState('');
  const [released, setReleased] = useState('');
  const [availability, setAvailability] = useState('');
  const [onlyFollowed, setOnlyFollowed] = useState(false);
  const [onlyBasket, setOnlyBasket] = useState(false);
  const [sort, setSort] = useState('code');
  const [page, setPage] = useState(1);
  const [fast, setFast] = useState(false);
  const [fastText, setFastText] = useState('');
  const [open, setOpen] = useState<Snapshot | null>(null);
  const [notes, setNotes] = useState('');
  const [po, setPo] = useState('');
  const [coupon, setCoupon] = useState('');
  const [couponState, setCouponState] = useState<{ ok: boolean; discountCents: number; reason: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<{ number: string; replaced: boolean; creditApplied: number } | null>(null);
  const [serverProblems, setServerProblems] = useState<string[]>([]);
  const seededFor = useRef<string | null>(null);
  useEffect(() => { if (data?.cycle && seededFor.current !== data.cycle.id) { setQty(Object.fromEntries((data.openOrder?.items ?? []).map((i) => [i.listingId, i.quantity]))); seededFor.current = data.cycle.id; } }, [data]);

  const titles = data?.listings ?? [];
  const c = data?.cycle;
  const basket = useMemo(() => priceBasket(qty, titles.map((t) => ({ listingId: t.listingId, catalogKey: t.catalogKey, title: t.title, msrpCents: t.msrpCents, incentiveRatio: t.incentiveRatio })), data?.tiers ?? me?.settings.tiers ?? [], data?.forcedTier ?? me?.retailer.tierOverride), [qty, titles, data, me]);
  const publishers = useMemo(() => Array.from(new Map(titles.map((t) => [t.partner.id, t.partner])).values()).sort((a, b) => a.name.localeCompare(b.name)), [titles]);
  const formats = useMemo(() => Array.from(new Set(titles.map((t) => t.format))), [titles]);
  const inStorePassed = c ? new Date(c.inStoreDate).getTime() <= Date.now() : false;
  const shown = useMemo(() => titles.filter((t) =>
    (!publisher || t.partner.id === publisher) && (!format || t.format === format)
    && (!released || (released === 'released' ? inStorePassed : !inStorePassed))
    && (!availability || (availability === 'open' ? Boolean(c?.orderingOpen) : availability === 'reorder' ? t.reorderable : availability === 'incentive' ? Boolean(t.incentiveRatio) : true))
    && (!onlyFollowed || t.followed) && (!onlyBasket || (qty[t.listingId] ?? 0) > 0)
    && (!q || [t.title, t.seriesName, t.writer, t.artist, t.coverArtist, t.partner.name, t.catalogKey, t.upc].some((x) => x?.toLowerCase().includes(q.toLowerCase()))),
  ).sort(SORTS[sort]?.fn ?? SORTS.code!.fn), [titles, publisher, format, released, availability, onlyFollowed, onlyBasket, q, sort, qty, c, inStorePassed]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const pageRows = shown.slice((page - 1) * PAGE, page * PAGE);
  useEffect(() => { setPage(1); }, [q, publisher, format, released, availability, onlyFollowed, onlyBasket, sort]);
  const setQ1 = (id: string, v: number) => setQty((m) => ({ ...m, [id]: Math.max(0, Math.min(100_000, Math.floor(v) || 0)) }));
  const unitFor = (t: Snapshot) => Math.round((t.msrpCents * (10_000 - basket.tier.tier.discountBps)) / 10_000);

  useEffect(() => {
    if (!c || !basket.units) { setServerProblems([]); return; }
    const t = window.setTimeout(() => { api.post<{ pricing: { problems: string[] }; coupon: { ok: boolean; discountCents: number; reason: string | null } | null }>('/pod/retailer/basket/preview', { cycleId: c.id, quantities: qty, couponCode: coupon || null }).then((r) => { setServerProblems(r.pricing.problems); setCouponState(r.coupon); }).catch(() => undefined); }, 500);
    return () => window.clearTimeout(t);
  }, [qty, c, basket.units, coupon]);

  const upload = async (f: File) => {
    const fd = new FormData(); fd.append('file', f);
    try { const r = await api.postForm<{ quantities: Record<string, number>; matched: number; problems: string[] }>('/pod/retailer/basket/upload', fd); setQty(r.quantities); show(`${r.matched} titles loaded${r.problems.length ? `; ${r.problems.length} rows skipped` : ''}`, r.problems.length > 0); if (r.problems.length) setServerProblems(r.problems); } catch (x) { show(errText(x), true); }
  };
  const applyFast = () => {
    const byKey = new Map<string, string>();
    for (const t of titles) { byKey.set(t.catalogKey.toLowerCase(), t.listingId); if (t.upc) byKey.set(t.upc, t.listingId); }
    const next = { ...qty }; let n = 0; const bad: string[] = [];
    for (const line of fastText.split(/\n/)) {
      const m = /^\s*([A-Za-z0-9-]+)\s*[,;\t x]+\s*(\d+)\s*$/.exec(line) ?? /^\s*(\d+)\s*[,;\t x]+\s*([A-Za-z0-9-]+)\s*$/.exec(line);
      if (!m) { if (line.trim()) bad.push(line.trim()); continue; }
      const [ref, num] = /^\d+$/.test(m[1]!) && !/^\d{11,13}$/.test(m[1]!) ? [m[2]!, m[1]!] : [m[1]!, m[2]!];
      const id = byKey.get(ref.toLowerCase()) ?? byKey.get(ref.replace(/\D/g, ''));
      if (!id) { bad.push(ref); continue; }
      next[id] = (next[id] ?? 0) + Number(num); n++;
    }
    setQty(next); setFast(false); setFastText('');
    show(`${n} line${n === 1 ? '' : 's'} added${bad.length ? `; not found: ${bad.slice(0, 5).join(', ')}` : ''}`, bad.length > 0);
  };
  const follow = async (t: Snapshot) => { try { await api.post('/pod/retailer/follow', { partnerId: t.partner.id, follow: !t.followed }); await Promise.all([reload(), reloadMe()]); } catch (x) { show(errText(x), true); } };
  const place = async () => {
    if (!c) return; setBusy(true);
    try { const r = await api.post<{ order: { number: string; creditApplied: number }; replaced: boolean }>('/pod/retailer/orders', { cycleId: c.id, quantities: qty, notes, poNumber: po, couponCode: coupon || null }); setPlaced({ number: r.order.number, replaced: r.replaced, creditApplied: r.order.creditApplied }); void reloadMe(); void reload(); } catch (x) { show(errText(x), true); } finally { setBusy(false); }
  };

  if (placed) {
    return (
      <div className="panel rise" style={{ textAlign: 'center', padding: '3rem 2rem', maxWidth: 640, margin: '2rem auto' }}>
        <CheckCircle2 size={48} style={{ color: 'var(--p-green)' }} /><h1 className="display-md" style={{ marginTop: '.75rem' }}>{placed.replaced ? 'Order updated' : 'Order placed'}</h1>
        <p className="dim" style={{ margin: '.5rem auto 1.5rem', maxWidth: '46ch' }}>{placed.number} · {basket.units} copies · {money(basket.subtotalCents)} at {basket.tier.tier.name}{placed.creditApplied ? ` · ${money(placed.creditApplied)} store credit applied` : ''}. Change it until final order cutoff; we invoice and print after that.</p>
        <div className="row" style={{ justifyContent: 'center' }}><Link to={`/retailer/orders/${placed.number}`} className="pbtn primary">View the order</Link><button className="pbtn ghost" onClick={() => setPlaced(null)}>Keep editing</button></div>
      </div>
    );
  }
  const openCycles = me?.openCycles ?? [];
  return (
    <>
      {node}
      <div className="ptop">
        <div><div className="eyebrow">Order the catalog</div><h1>{c?.name ?? 'Catalog'}</h1>{c && <div className="row" style={{ marginTop: '.4rem' }}>{c.orderingOpen ? <Pill tone="green" live>Ordering open</Pill> : <Pill tone="amber">Ordering closed</Pill>}<DaysLeft to={c.focDate} /><span className="dim" style={{ fontSize: '.88rem' }}>FOC {dateShort(c.focDate)} · in store {dateShort(c.inStoreDate)} · {titles.length} titles</span>{data?.openOrder && <Pill tone="violet">your order {data.openOrder.number}</Pill>}</div>}</div>
        <div className="row">
          {openCycles.length > 1 && <div className="seg">{openCycles.map((oc) => <button key={oc.id} className={(c?.id ?? '') === oc.id ? 'on' : ''} onClick={() => setParams({ cycle: oc.id })}>{oc.name}</button>)}</div>}
          <button className="pbtn soft sm" onClick={() => setFast(true)}><Zap size={14} /> Fast entry</button>
          <a href={c ? `/api/pod/retailer/catalog/${c.id}.csv` : '/api/pod/retailer/catalog.csv'} className="pbtn ghost sm"><Download size={14} /> Order sheet</a>
          <label className="pbtn ghost sm" style={{ cursor: 'pointer' }}><Upload size={14} /> Upload sheet<input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.currentTarget.value = ''; }} /></label>
        </div>
      </div>
      {openCycles.length > 0 && (() => { const now = Date.now(); const within = (d: number) => openCycles.filter((oc) => { const t = new Date(oc.inStoreDate).getTime(); return t >= now && t <= now + d * 86_400_000; }).length; return (
        <div className="panel tight" style={{ marginBottom: '.75rem' }}>
          <div className="between" style={{ marginBottom: '.4rem' }}><b style={{ fontSize: '.84rem' }}>Release planning</b><span className="dim" style={{ fontSize: '.78rem' }}>Catalogs by in-store date, so you can match how often you place orders.</span></div>
          <div className="grid cols-4" style={{ gap: '.5rem' }}>
            {[['Open catalogs', openCycles.length, 'orderable now'], ['Landing this week', within(7), 'in store within 7 days'], ['Within a month', within(30), 'in store within 30 days'], ['All upcoming', openCycles.filter((oc) => new Date(oc.inStoreDate).getTime() >= now).length, 'every future release']].map(([l, n, h]) => <div key={l as string} style={{ padding: '.5rem .7rem', borderRadius: 10, background: 'var(--p-paper)', border: '1px solid var(--p-line)' }}><div className="dim" style={{ fontSize: '.7rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>{l}</div><div className="display-md mono">{n}</div><div className="dim" style={{ fontSize: '.74rem' }}>{h}</div></div>)}
          </div>
        </div>
      ); })()}
      {!c ? <Empty title="No catalog is open" body="You'll get an email when the next one opens for ordering." action={<Link to="/retailer/downloads" className="pbtn ghost sm">Past catalogs</Link>} /> : (
        <div className="split" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px' }}>
          <div>
            <div className="panel tight" style={{ marginBottom: '.75rem' }}>
              <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1 1 260px' }}><Search size={16} style={{ position: 'absolute', left: '.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--p-text-dim)' }} /><input className="inp" style={{ paddingLeft: '2.2rem' }} placeholder="Title, creator, catalog id, UPC…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                <select className="inp" style={{ width: 'auto' }} value={publisher} onChange={(e) => setPublisher(e.target.value)}><option value="">All publishers</option>{publishers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <select className="inp" style={{ width: 'auto' }} value={format} onChange={(e) => setFormat(e.target.value)}><option value="">All product types</option>{formats.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f] ?? f}</option>)}</select>
                <select className="inp" style={{ width: 'auto' }} value={released} onChange={(e) => setReleased(e.target.value)}><option value="">Released & upcoming</option><option value="upcoming">Upcoming</option><option value="released">Released</option></select>
                <select className="inp" style={{ width: 'auto' }} value={availability} onChange={(e) => setAvailability(e.target.value)}><option value="">Any availability</option><option value="open">Ordering open</option><option value="reorder">Reorderable</option><option value="incentive">Incentive covers</option></select>
                <select className="inp" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value)}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>Sort: {v.label}</option>)}</select>
                <label className="switch"><input type="checkbox" checked={onlyFollowed} onChange={(e) => setOnlyFollowed(e.target.checked)} /> Followed publishers</label>
                <label className="switch"><input type="checkbox" checked={onlyBasket} onChange={(e) => setOnlyBasket(e.target.checked)} /> In my order</label>
                {(q || publisher || format || released || availability || onlyFollowed || onlyBasket) && <button className="pbtn ghost xs" onClick={() => { setQ(''); setPublisher(''); setFormat(''); setReleased(''); setAvailability(''); setOnlyFollowed(false); setOnlyBasket(false); }}>Reset</button>}
              </div>
            </div>
            <div className="panel flush scroll-x">
              {loading && !data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading the catalog…</p> : (
                <table className="ptable">
                  <thead><tr><th></th><th>Title</th><th>Publisher</th><th className="num">Cover</th><th className="num">Your price</th><th style={{ textAlign: 'center' }}>Qty</th><th className="num">Line</th></tr></thead>
                  <tbody>
                    {pageRows.map((t) => {
                      const unit = unitFor(t); const n = qty[t.listingId] ?? 0;
                      return (
                        <tr key={t.listingId} style={n ? { background: 'rgba(124,92,255,.05)' } : undefined}>
                          <td style={{ width: 46 }} className="click" onClick={() => setOpen(t)}><Thumb url={t.coverImageUrl} title={t.title} size={34} /></td>
                          <td className="click" onClick={() => setOpen(t)}><b>{t.title}{t.issueNumber ? ` #${t.issueNumber}` : ''}</b>{t.followed && <Heart size={12} style={{ color: 'var(--p-magenta)', marginLeft: '.35rem', verticalAlign: '-1px' }} fill="currentColor" />}<div className="dim" style={{ fontSize: '.78rem' }}><span className="key">{t.catalogKey}</span> · {[t.coverDescription && !/^main/i.test(t.coverDescription) ? t.coverDescription : null, FORMAT_LABELS[t.format], t.pageCount ? `${t.pageCount}pp` : null, t.writer].filter(Boolean).join(' · ')}{t.incentiveRatio && <> · <Pill tone="rose">{t.incentiveRatio}</Pill></>}</div></td>
                          <td className="dim" style={{ fontSize: '.86rem' }}>{t.partner.name}</td>
                          <td className="num mono dim">{money(t.msrpCents)}</td>
                          <td className="num mono"><b>{money(unit)}</b></td>
                          <td style={{ textAlign: 'center' }}><input className="inp qty mono" type="number" min={0} value={n || ''} placeholder="0" onChange={(e) => setQ1(t.listingId, Number(e.target.value))} disabled={!c.orderingOpen} aria-label={`Quantity for ${t.title}`} /></td>
                          <td className="num mono">{n ? money(unit * n) : <span className="dim">—</span>}</td>
                        </tr>
                      );
                    })}
                    {shown.length === 0 && <tr><td colSpan={7}><Empty title="Nothing matches" /></td></tr>}
                  </tbody>
                </table>
              )}
              {pages > 1 && <div className="between" style={{ padding: '.6rem .9rem', borderTop: '1px solid var(--p-line)', fontSize: '.84rem' }}><span className="dim">Page {page} of {pages} · {shown.length} titles</span><span className="row"><button className="pbtn ghost xs" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button><button className="pbtn ghost xs" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></button></span></div>}
            </div>
          </div>
          <aside className="sticky stack">
            <div className="panel accent">
              <div className="between"><h3>Your order</h3>{data?.openOrder && <Pill tone="violet">{data.openOrder.number}</Pill>}</div>
              <div className="display-md mono" style={{ marginTop: '.5rem' }}>{money(Math.max(0, basket.subtotalCents - Math.min(me?.retailer.creditCents ?? 0, basket.subtotalCents)))}</div>
              <div className="dim" style={{ fontSize: '.85rem' }}>{basket.units} copies · {money(basket.msrpSubtotalCents)} at cover · you save {money(basket.savingsCents)}{(me?.retailer.creditCents ?? 0) > 0 && basket.subtotalCents > 0 ? ` · ${money(Math.min(me!.retailer.creditCents, basket.subtotalCents))} store credit applied` : ''}</div>
              <div style={{ margin: '1rem 0 .5rem' }}>
                <div className="between" style={{ fontSize: '.82rem', marginBottom: '.35rem' }}><b>{basket.tier.tier.name} · {Math.round(basket.tier.tier.discountBps / 100)}% off</b>{basket.tier.next && !basket.tier.forced && <span className="dim">{money(basket.tier.toNextCents)} more at cover → {basket.tier.next.name}</span>}</div>
                <Meter value={basket.tier.progress} />
              </div>
              {serverProblems.length > 0 && <div className="notice warn" style={{ marginTop: '.75rem', fontSize: '.84rem' }}><div>{serverProblems.map((p, i) => <div key={i}>{p}</div>)}</div></div>}
              <div className="field" style={{ marginTop: '.9rem' }}><label>Coupon code <span className="dim">optional</span></label><input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="CODE" />{couponState && coupon && <span className={couponState.ok ? 'hint' : 'err'} style={couponState.ok ? { color: '#065f46', fontWeight: 600 } : undefined}>{couponState.ok ? `−${money(couponState.discountCents)} applied` : couponState.reason}</span>}</div>
              <div className="field" style={{ marginTop: '.6rem' }}><label>Your PO number <span className="dim">optional</span></label><input value={po} onChange={(e) => setPo(e.target.value)} /></div>
              <div className="field" style={{ marginTop: '.6rem' }}><label>Notes for us</label><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              <button className="pbtn hot block" style={{ marginTop: '1rem' }} disabled={!c.orderingOpen || !basket.units || busy || serverProblems.length > 0 || Boolean(coupon && couponState && !couponState.ok)} onClick={() => void place()}>{busy ? 'Placing…' : data?.openOrder ? 'Update my order' : 'Place order'}</button>
              {basket.units > 0 && <button className="pbtn ghost xs block" style={{ marginTop: '.5rem' }} onClick={() => setQty({})}><Trash2 size={12} /> Clear</button>}
              <p className="dim" style={{ fontSize: '.76rem', marginTop: '.75rem' }}>{me?.settings.retailerTerms}</p>
            </div>
            {basket.lines.length > 0 && (
              <div className="panel tight"><b style={{ fontSize: '.84rem' }}>In this order</b>
                {basket.lines.map((l) => <div key={l.title.listingId} className="between" style={{ fontSize: '.82rem', padding: '.3rem 0', borderBottom: '1px dashed var(--p-line)' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.quantity} × {l.title.title}</span><span className="row" style={{ gap: '.4rem' }}><b className="mono">{money(l.totalCents)}</b><button className="pbtn ghost xs" style={{ padding: '.15rem' }} onClick={() => setQ1(l.title.listingId, 0)} aria-label="Remove"><X size={12} /></button></span></div>)}
              </div>
            )}
          </aside>
        </div>
      )}

      <Drawer open={fast} onClose={() => setFast(false)} title={<span className="row"><Zap size={18} /> Fast entry</span>}>
        <p className="dim" style={{ fontSize: '.9rem' }}>One line per title: the catalog id (or UPC) and the quantity. Paste from your spreadsheet or type.</p>
        <textarea className="inp mono" rows={12} value={fastText} onChange={(e) => setFastText(e.target.value)} placeholder={'SAV-92708 6\nSAV-92715, 3\n637609922145 x 10'} autoFocus />
        <div className="row" style={{ marginTop: '.75rem' }}><button className="pbtn primary" onClick={applyFast} disabled={!fastText.trim()}>Add to my order</button><button className="pbtn ghost" onClick={() => setFast(false)}>Cancel</button></div>
      </Drawer>

      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open ? `${open.title}${open.issueNumber ? ` #${open.issueNumber}` : ''}` : ''} width={720}>
        {open && (() => { const t = open; const unit = unitFor(t); const n = qty[t.listingId] ?? 0; return (
          <>
            <div className="row" style={{ marginBottom: '.75rem' }}>{t.publisherLogoUrl && <img src={t.publisherLogoUrl} alt="" style={{ height: 28, borderRadius: 6 }} />}<b>{t.partner.name}</b><span className="dim">{t.seriesName && t.seriesName !== t.title ? `${t.seriesName} · ` : ''}{t.coverDescription}{t.variantNumber ? ` · variant ${t.variantNumber}` : ''}</span><button className="pbtn ghost xs" onClick={() => void follow(t)}><Heart size={12} fill={t.followed ? 'currentColor' : 'none'} /> {t.followed ? 'Following' : 'Follow publisher'}</button></div>
            <div className="split" style={{ gridTemplateColumns: '220px 1fr' }}>
              <CoverArt url={t.coverImageUrl} title={t.title} className="cover-hero" />
              <div className="stack">
                <div className="grid cols-2"><div className="panel tight"><div className="eyebrow">Cover price</div><div className="display-md mono">{money(t.msrpCents)}</div></div><div className="panel tight" style={{ background: 'rgba(124,92,255,.08)' }}><div className="eyebrow">Your wholesale</div><div className="display-md mono">{money(unit)}</div><div className="dim" style={{ fontSize: '.76rem' }}>{basket.tier.tier.name} · {Math.round(basket.tier.tier.discountBps / 100)}% off</div></div></div>
                <dl className="spec panel tight">
                  <dt>Format</dt><dd>{FORMAT_LABELS[t.format] ?? t.format}</dd>
                  {t.ageRating && <><dt>Rating</dt><dd>{t.ageRating}</dd></>}
                  <dt>Size</dt><dd>{t.trimWidthIn && t.trimHeightIn ? `${t.trimWidthIn} × ${t.trimHeightIn} in` : '—'}</dd>
                  <dt>Pages</dt><dd>{t.pageCount ?? '—'} · {t.interiorColor === 'bw' ? 'black & white' : 'colour'}</dd>
                  {t.writer && <><dt>Writer</dt><dd>{t.writer}</dd></>}{t.artist && <><dt>Artist</dt><dd>{t.artist}</dd></>}{t.coverArtist && <><dt>Cover artist</dt><dd>{t.coverArtist}</dd></>}
                  <dt>FOC</dt><dd>{dateShort(c?.focDate)}</dd><dt>In store</dt><dd>{dateShort(c?.inStoreDate)}</dd>
                  <dt>Catalog id</dt><dd><span className="key">{t.catalogKey}</span></dd>
                  {t.upc && <><dt>UPC</dt><dd className="mono">{t.upc}</dd></>}
                  {t.incentiveRatio && <><dt>Incentive</dt><dd>{t.incentiveRatio} per qualifying copies</dd></>}
                  <dt>Fulfilment</dt><dd>{t.fulfillment === 'PARTNER_SHIPS' ? 'Ships from the publisher' : 'Ships from Printing Comics'} · {t.reorderable ? 'reorderable' : 'no reorders'}</dd>
                </dl>
                <div className="panel accent tight"><div className="row" style={{ justifyContent: 'space-between' }}><label className="lbl" style={{ margin: 0 }}>Quantity</label><input className="inp qty mono" type="number" min={0} value={n || ''} placeholder="0" onChange={(e) => setQ1(t.listingId, Number(e.target.value))} disabled={!c?.orderingOpen} /><b className="mono">{n ? money(unit * n) : ''}</b>{!c?.orderingOpen && <Pill tone="amber">FOC locked</Pill>}</div></div>
              </div>
            </div>
            {(t.synopsis || t.description) && <div className="panel" style={{ marginTop: '1rem' }}><div className="eyebrow">Solicitation</div>{t.synopsis && <p style={{ fontSize: '1rem', lineHeight: 1.55 }}>{t.synopsis}</p>}{t.description && t.description !== t.synopsis && <p className="dim" style={{ whiteSpace: 'pre-wrap' }}>{t.description}</p>}</div>}
          </>
        ); })()}
      </Drawer>
    </>
  );
}

export { ShoppingCart };
