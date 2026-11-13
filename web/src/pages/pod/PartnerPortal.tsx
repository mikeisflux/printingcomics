/**
 * /partner — the publisher portal: listings (write, upload, submit),
 * purchase orders to fulfil, statements and what is owed.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BookOpen, FileText, Receipt, LayoutDashboard, Plus, Send, ArrowLeft, Sparkles, Truck, CheckCircle2, Undo2 } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../store/auth';
import { useSeo } from '../../lib/seo';
import { money, dateShort, dateTime, pct, LISTING_STATUS, FORMAT_LABELS, FULFILLMENT_LABELS, TRIM_PRESETS, AGE_RATINGS, GENRES, type Listing, type PublicSettings, type PodEvent } from '../../lib/pod';
import { Avatar, Empty, Events, FileSlot, Kpi, Pill, StatusPill, Thumb, TonePill, errText, useFlash, useLoad } from '../../components/pod/ui';
import { PURCHASE_STATUS, STATEMENT_STATUS } from '../../lib/pod';

interface Me {
  partner: { id: string; name: string; slug: string; contactEmail: string | null; website: string | null; commissionBpsPrintedByUs: number; commissionBpsPartnerShips: number };
  counts: Record<string, number>; openCycle: { id: string; name: string; catalogDate: string; focDate: string; inStoreDate: string } | null; settings: PublicSettings;
  sales: { units: number; wholesaleCents: number; owedCents: number; paidCents: number }; purchaseOrdersOpen: number;
  statements: { id: string; number: string; status: string; netCents: number; issuedAt: string | null; paidAt: string | null }[];
}

export function PartnerLayout() {
  const { user, loaded, load } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);
  useEffect(() => { if (loaded && !user) navigate('/login?redirect=/partner'); }, [loaded, user, navigate]);
  const { data, error, reload } = useLoad<Me>(loaded && user ? '/pod/partner/me' : null);
  useSeo({ title: 'Publisher portal — Print On Demand', description: 'Manage your Print On Demand listings.' });
  if (!loaded || !user) return <div className="pod container" style={{ padding: '3rem' }}><p className="dim">Loading…</p></div>;
  if (error) {
    return (
      <div className="pod container" style={{ padding: '3rem 1.25rem' }}>
        <Empty title="This account is not a publisher account" body={error} action={<div className="row" style={{ justifyContent: 'center' }}><Link to="/print-on-demand/apply?as=publisher" className="pbtn glow">Apply as a publisher</Link><Link to="/account" className="pbtn ghost">My account</Link></div>} />
      </div>
    );
  }
  const queue = (data?.counts.CHANGES_REQUESTED ?? 0);
  return (
    <div className="pod">
      <div className="portal">
        <aside className="pside">
          <div className="who"><Avatar name={data?.partner.name ?? '…'} /><div><b>{data?.partner.name ?? '…'}</b><small>Publisher portal</small></div></div>
          <nav>
            <NavLink to="/partner" end><span className="row" style={{ gap: '.5rem' }}><LayoutDashboard size={16} /> Overview</span></NavLink>
            <NavLink to="/partner/listings"><span className="row" style={{ gap: '.5rem' }}><BookOpen size={16} /> Listings</span>{queue > 0 && <span className="n">{queue}</span>}</NavLink>
            <NavLink to="/partner/purchase-orders"><span className="row" style={{ gap: '.5rem' }}><Truck size={16} /> Purchase orders</span>{(data?.purchaseOrdersOpen ?? 0) > 0 && <span className="n">{data!.purchaseOrdersOpen}</span>}</NavLink>
            <NavLink to="/partner/statements"><span className="row" style={{ gap: '.5rem' }}><Receipt size={16} /> Sales & payouts</span></NavLink>
          </nav>
          <div style={{ marginTop: '1.5rem', padding: '.5rem .85rem', fontSize: '.78rem', color: 'var(--p-text-inv-dim)' }}>
            <Link to="/print-on-demand/catalog" style={{ color: 'inherit' }}>Public catalog →</Link><br />
            <Link to="/account" style={{ color: 'inherit' }}>My account →</Link>
          </div>
        </aside>
        <main className="pmain"><Outlet context={{ me: data, reload }} /></main>
      </div>
    </div>
  );
}

import { useOutletContext } from 'react-router-dom';
function useMe() { return useOutletContext<{ me: Me | null; reload: () => Promise<void> }>(); }

export function PartnerDashboard() {
  const { me } = useMe();
  const { data } = useLoad<{ listings: Listing[] }>('/pod/partner/listings');
  const recent = (data?.listings ?? []).slice(0, 6);
  if (!me) return <p className="dim">Loading…</p>;
  const c = me.counts;
  return (
    <>
      <div className="ptop">
        <div><div className="eyebrow">Overview</div><h1>Hello, {me.partner.name}</h1><div className="sub">{me.openCycle ? <>The <b>{me.openCycle.name}</b> catalog is open for listings until {dateShort(me.openCycle.catalogDate)}. FOC {dateShort(me.openCycle.focDate)}, in store {dateShort(me.openCycle.inStoreDate)}.</> : 'No catalog is open for new listings right now; drafts can still be prepared.'}</div></div>
        <Link to="/partner/listings/new" className="pbtn glow"><Plus size={16} /> New listing</Link>
      </div>
      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <Kpi label="Live titles" value={c.LIVE ?? 0} sub={`${(c.APPROVED ?? 0) + (c.SCHEDULED ?? 0)} approved & waiting`} to="/partner/listings?status=LIVE" />
        <Kpi label="In review" value={c.SUBMITTED ?? 0} sub={c.CHANGES_REQUESTED ? `${c.CHANGES_REQUESTED} need changes` : 'Nothing sent back'} to="/partner/listings?status=SUBMITTED" tone={c.CHANGES_REQUESTED ? 'hot' : undefined} />
        <Kpi label="Copies sold" value={me.sales.units} sub={`${money(me.sales.wholesaleCents)} wholesale`} to="/partner/statements" />
        <Kpi label="Owed to you" value={money(me.sales.owedCents)} sub={`${money(me.sales.paidCents)} paid out so far`} to="/partner/statements" dark />
      </div>
      <div className="split">
        <div className="panel">
          <div className="panel-head"><h3>Recent listings</h3><Link to="/partner/listings" className="pbtn ghost xs">All listings</Link></div>
          {recent.length === 0 ? <Empty title="No listings yet" body="Start with your first title: cover, price, page count, files." action={<Link to="/partner/listings/new" className="pbtn primary sm">New listing</Link>} /> : (
            <table className="ptable"><tbody>
              {recent.map((l) => (
                <tr key={l.id} className="click" onClick={() => (window.location.href = `/partner/listings/${l.id}`)}>
                  <td style={{ width: 50 }}><Thumb url={l.coverImage?.url} title={l.title} /></td>
                  <td><b>{l.title}{l.issueNumber ? ` #${l.issueNumber}` : ''}</b><div className="dim" style={{ fontSize: '.8rem' }}>{l.cycle?.name ?? 'No catalog yet'} · {money(l.msrpCents)}</div></td>
                  <td><StatusPill status={l.status} /></td>
                  <td className="num">{l.unitsSold ? `${l.unitsSold} sold` : ''}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
        <div className="stack">
          <div className="panel accent">
            <h3>Your terms</h3>
            <dl className="spec" style={{ marginTop: '.5rem' }}>
              <dt>Commission, we print</dt><dd>{pct(me.partner.commissionBpsPrintedByUs)}</dd>
              <dt>Commission, you ship</dt><dd>{pct(me.partner.commissionBpsPartnerShips)}</dd>
              <dt>Printing</dt><dd>Charged per copy against your payout</dd>
              <dt>Payout</dt><dd>A statement per catalog cycle</dd>
            </dl>
          </div>
          {me.statements.length > 0 && (
            <div className="panel">
              <div className="panel-head"><h3>Latest statements</h3><Link to="/partner/statements" className="pbtn ghost xs">All</Link></div>
              {me.statements.map((s) => <div key={s.id} className="between" style={{ padding: '.4rem 0', borderBottom: '1px dashed var(--p-line)', fontSize: '.9rem' }}><Link to={`/partner/statements/${s.id}`}><b>{s.number}</b></Link><span className="row"><TonePill map={STATEMENT_STATUS} status={s.status} /><b className="mono">{money(s.netCents)}</b></span></div>)}
            </div>
          )}
          <div className="panel" style={{ background: 'var(--p-ink)', color: '#fff', borderColor: 'transparent' }}>
            <Sparkles size={20} style={{ color: 'var(--p-lime)' }} />
            <h3 style={{ marginTop: '.5rem' }}>Files that pass first time</h3>
            <p className="tight" style={{ color: 'var(--p-text-inv-dim)', fontSize: '.88rem' }}>Export single pages with 0.125" bleed, fonts embedded, images flattened. Our checks run the moment you upload.</p>
            <Link to="/resources/file-prep" className="pbtn ghost sm" style={{ marginTop: '.75rem', color: '#fff', borderColor: 'rgba(255,255,255,.35)' }}>File prep guide</Link>
          </div>
        </div>
      </div>
    </>
  );
}

export function PartnerListings() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const { data, loading } = useLoad<{ listings: Listing[] }>('/pod/partner/listings');
  const rows = (data?.listings ?? []).filter((l) => !status || l.status === status);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const l of data?.listings ?? []) c[l.status] = (c[l.status] ?? 0) + 1; return c; }, [data]);
  return (
    <>
      <div className="ptop">
        <div><div className="eyebrow">Listings</div><h1>Your titles</h1><div className="sub">One listing per cover. Drafts are yours to edit; once submitted, staff review and either approve or send back notes.</div></div>
        <Link to="/partner/listings/new" className="pbtn glow"><Plus size={16} /> New listing</Link>
      </div>
      <div className="seg" style={{ marginBottom: '1rem' }}>
        <button className={!status ? 'on' : ''} onClick={() => setParams({})}>All <span className="n">{data?.listings.length ?? 0}</span></button>
        {(Object.keys(LISTING_STATUS) as (keyof typeof LISTING_STATUS)[]).filter((k) => counts[k]).map((k) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setParams({ status: k })}>{LISTING_STATUS[k].label} <span className="n">{counts[k]}</span></button>)}
      </div>
      <div className="panel flush">
        {loading && !data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : rows.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title={status ? 'Nothing with that status' : 'No listings yet'} body="Your first listing takes about ten minutes: details, cover image, print files." action={<Link to="/partner/listings/new" className="pbtn primary sm">New listing</Link>} /></div> : (
          <div className="scroll-x"><table className="ptable">
            <thead><tr><th></th><th>Title</th><th>Catalog</th><th>Cover price</th><th>Files</th><th>Status</th><th className="num">Sold</th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="click" onClick={() => (window.location.href = `/partner/listings/${l.id}`)}>
                  <td style={{ width: 50 }}><Thumb url={l.coverImage?.url} title={l.title} /></td>
                  <td><b>{l.title}{l.issueNumber ? ` #${l.issueNumber}` : ''}</b><div className="dim" style={{ fontSize: '.8rem' }}>{l.coverDescription ?? FORMAT_LABELS[l.format]} · <span className="key">{l.catalogKey}</span></div></td>
                  <td>{l.cycle?.name ?? <span className="dim">—</span>}</td>
                  <td className="mono">{money(l.msrpCents)}</td>
                  <td>{l.fulfillment === 'PRINTED_BY_US' ? (l.missingFiles.length ? <Pill tone="rose">{l.missingFiles.length} missing</Pill> : <Pill tone="green">Complete</Pill>) : <Pill tone="slate">You ship</Pill>}</td>
                  <td><StatusPill status={l.status} /></td>
                  <td className="num mono">{l.unitsSold ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Listing editor (new + edit)
// ---------------------------------------------------------------------------

type Form = {
  title: string; seriesName: string; seriesCode: string; issueNumber: string; coverDescription: string; variantNumber: string; upc: string; format: string; seriesType: string; frequency: string;
  language: string; ageRating: string; pageCount: string; trimWidthIn: string; trimHeightIn: string; interiorColor: string; msrp: string; description: string; synopsis: string; writer: string; artist: string;
  coverArtist: string; genres: string[]; incentiveRatio: string; incentiveQualifierKey: string; reorderable: boolean; fulfillment: string; cycleId: string;
};
const blank: Form = { title: '', seriesName: '', seriesCode: '', issueNumber: '', coverDescription: 'Main Cover', variantNumber: '', upc: '', format: 'comic', seriesType: 'ongoing', frequency: '', language: 'English', ageRating: 'Teen', pageCount: '32', trimWidthIn: '6.625', trimHeightIn: '10.25', interiorColor: 'color', msrp: '4.99', description: '', synopsis: '', writer: '', artist: '', coverArtist: '', genres: [], incentiveRatio: '', incentiveQualifierKey: '', reorderable: true, fulfillment: 'PRINTED_BY_US', cycleId: '' };

function fromListing(l: Listing): Form {
  return { title: l.title, seriesName: l.seriesName ?? '', seriesCode: l.seriesCode ?? '', issueNumber: l.issueNumber ?? '', coverDescription: l.coverDescription ?? '', variantNumber: l.variantNumber ?? '', upc: l.upc ?? '', format: l.format, seriesType: l.seriesType ?? '', frequency: l.frequency ?? '', language: l.language, ageRating: l.ageRating ?? '', pageCount: l.pageCount ? String(l.pageCount) : '', trimWidthIn: l.trimWidthIn ? String(l.trimWidthIn) : '', trimHeightIn: l.trimHeightIn ? String(l.trimHeightIn) : '', interiorColor: l.interiorColor ?? 'color', msrp: (l.msrpCents / 100).toFixed(2), description: l.description ?? '', synopsis: l.synopsis ?? '', writer: l.writer ?? '', artist: l.artist ?? '', coverArtist: l.coverArtist ?? '', genres: l.genres, incentiveRatio: l.incentiveRatio ?? '', incentiveQualifierKey: l.incentiveQualifierKey ?? '', reorderable: l.reorderable, fulfillment: l.fulfillment, cycleId: l.cycle?.id ?? '' };
}
function toBody(f: Form) {
  const n = (s: string) => (s.trim() === '' ? null : Number(s));
  return {
    title: f.title, seriesName: f.seriesName || null, seriesCode: f.seriesCode || null, issueNumber: f.issueNumber || null, coverDescription: f.coverDescription || null, variantNumber: f.variantNumber || null, upc: f.upc || null,
    format: f.format, seriesType: f.seriesType || null, frequency: f.frequency || null, language: f.language || 'English', ageRating: f.ageRating || null, pageCount: n(f.pageCount), trimWidthIn: n(f.trimWidthIn), trimHeightIn: n(f.trimHeightIn),
    interiorColor: f.interiorColor || null, msrpCents: Math.round((Number(f.msrp) || 0) * 100), description: f.description || null, synopsis: f.synopsis || null, writer: f.writer || null, artist: f.artist || null, coverArtist: f.coverArtist || null,
    genres: f.genres, incentiveRatio: f.incentiveRatio || null, incentiveQualifierKey: f.incentiveQualifierKey || null, reorderable: f.reorderable, fulfillment: f.fulfillment, cycleId: f.cycleId || null,
  };
}

export function ListingForm({ value, onChange, cycles, settings, disabled, admin }: { value: Form; onChange: (f: Form) => void; cycles: { id: string; name: string; catalogDate: string; focDate: string }[]; settings: PublicSettings | null; disabled?: boolean; admin?: boolean }) {
  const set = <K extends keyof Form>(k: K) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const step = settings?.pageCountStep ?? 4;
  const pages = Number(value.pageCount);
  const pagesOk = !value.pageCount || (pages % step === 0 && pages >= (settings?.minPageCount ?? 8) && pages <= (settings?.maxPageCount ?? 200));
  const preset = TRIM_PRESETS.find((t) => String(t.w) === value.trimWidthIn && String(t.h) === value.trimHeightIn);
  return (
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '1.25rem' }}>
      <div className="panel">
        <h3>The book</h3>
        <div className="form-grid" style={{ marginTop: '.75rem' }}>
          <div className="field span-2"><label>Title</label><input required value={value.title} onChange={set('title')} placeholder="Savage Wonders" /></div>
          <div className="field"><label>Series name</label><input value={value.seriesName} onChange={set('seriesName')} placeholder="Savage Wonders" /></div>
          <div className="field"><label>Issue / volume #</label><input value={value.issueNumber} onChange={set('issueNumber')} placeholder="4" /></div>
          <div className="field"><label>Cover description</label><input value={value.coverDescription} onChange={set('coverDescription')} placeholder="Main Cover · Cover B — Virgin" /><span className="hint">One listing per cover. Variants are their own listing.</span></div>
          <div className="field"><label>Format</label><select value={value.format} onChange={set('format')}>{Object.entries(FORMAT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field"><label>Series code <span className="dim">3–6 letters</span></label><input value={value.seriesCode} onChange={(e) => onChange({ ...value, seriesCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) })} placeholder="SAV" /><span className="hint">Makes the catalog id: CODE-last five of the UPC.</span></div>
          <div className="field"><label>UPC / ISBN</label><input value={value.upc} onChange={set('upc')} placeholder="9798995292708" /></div>
          <div className="field"><label>Series type</label><select value={value.seriesType} onChange={set('seriesType')}><option value="ongoing">Ongoing</option><option value="limited">Limited series</option><option value="one_shot">One-shot</option><option value="collection">Collection / trade</option></select></div>
          <div className="field"><label>Age rating</label><select value={value.ageRating} onChange={set('ageRating')}><option value="">—</option>{AGE_RATINGS.map((a) => <option key={a}>{a}</option>)}</select></div>
        </div>
      </div>
      <div className="panel">
        <h3>Specs &amp; price</h3>
        <div className="form-grid" style={{ marginTop: '.75rem' }}>
          <div className="field"><label>Cover price (USD)</label><input required type="number" min="0" step="0.01" value={value.msrp} onChange={set('msrp')} /><span className="hint">What a reader pays. Shops buy at a tier discount off this.</span></div>
          <div className="field"><label>Interior pages {!pagesOk && <span className="err">multiple of {step}, {settings?.minPageCount ?? 8}–{settings?.maxPageCount ?? 200}</span>}</label><input required type="number" min={settings?.minPageCount ?? 8} step={step} value={value.pageCount} onChange={set('pageCount')} /></div>
          <div className="field span-2"><label>Trim size</label>
            <div className="seg" style={{ marginBottom: '.5rem' }}>{TRIM_PRESETS.map((t) => <button type="button" key={t.label} className={preset?.label === t.label ? 'on' : ''} onClick={() => onChange({ ...value, trimWidthIn: String(t.w), trimHeightIn: String(t.h) })}>{t.label}</button>)}</div>
            <div className="row"><input type="number" step="0.001" min="1" value={value.trimWidthIn} onChange={set('trimWidthIn')} style={{ width: 120 }} aria-label="Trim width" /> × <input type="number" step="0.001" min="1" value={value.trimHeightIn} onChange={set('trimHeightIn')} style={{ width: 120 }} aria-label="Trim height" /> <span className="dim">inches, finished size</span></div>
          </div>
          <div className="field"><label>Interior</label><div className="seg">{[['color', 'Full colour'], ['bw', 'Black & white']].map(([k, l]) => <button type="button" key={k} className={value.interiorColor === k ? 'on' : ''} onClick={() => onChange({ ...value, interiorColor: k! })}>{l}</button>)}</div></div>
          <div className="field"><label>Language</label><input value={value.language} onChange={set('language')} /></div>
          <div className="field span-2"><label>Fulfilment</label>
            <div className="seg">{Object.entries(FULFILLMENT_LABELS).map(([k, l]) => <button type="button" key={k} className={value.fulfillment === k ? 'on' : ''} onClick={() => onChange({ ...value, fulfillment: k })}>{l}</button>)}</div>
            <span className="hint">{value.fulfillment === 'PRINTED_BY_US' ? `We print to the ordered count and ship; printing is charged per copy, commission ${settings ? pct(settings.commissionBpsPrintedByUs) : '5%'}.` : `You ship from stock on the purchase order we send after FOC; commission ${settings ? pct(settings.commissionBpsPartnerShips) : '10%'}.`}</span>
          </div>
        </div>
      </div>
      <div className="panel">
        <h3>Catalog copy &amp; credits</h3>
        <div className="form-grid" style={{ marginTop: '.75rem' }}>
          <div className="field span-2"><label>Synopsis <span className="dim">shown to shops and readers</span></label><textarea rows={3} value={value.synopsis} onChange={set('synopsis')} /></div>
          <div className="field span-2"><label>Longer description</label><textarea rows={4} value={value.description} onChange={set('description')} /></div>
          <div className="field"><label>Writer</label><input value={value.writer} onChange={set('writer')} /></div>
          <div className="field"><label>Artist</label><input value={value.artist} onChange={set('artist')} /></div>
          <div className="field"><label>Cover artist</label><input value={value.coverArtist} onChange={set('coverArtist')} /></div>
          <div className="field"><label>Frequency</label><input value={value.frequency} onChange={set('frequency')} placeholder="Monthly · Irregular" /></div>
          <div className="field span-2"><label>Genres</label><div className="row">{GENRES.map((g) => <button type="button" key={g} className={`chip${value.genres.includes(g) ? ' on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => onChange({ ...value, genres: value.genres.includes(g) ? value.genres.filter((x) => x !== g) : [...value.genres, g].slice(0, 10) })}>{g}</button>)}</div></div>
        </div>
      </div>
      <div className="panel">
        <h3>Catalog &amp; retailer rules</h3>
        <div className="form-grid" style={{ marginTop: '.75rem' }}>
          <div className="field span-2"><label>Catalog cycle</label><select value={value.cycleId} onChange={set('cycleId')}><option value="">— pick when ready —</option>{cycles.map((c) => <option key={c.id} value={c.id}>{c.name} · catalog {dateShort(c.catalogDate)} · FOC {dateShort(c.focDate)}</option>)}</select><span className="hint">The three dates come with the cycle; you never type them.</span></div>
          <div className="field"><label>Retailer incentive ratio <span className="dim">optional</span></label><input value={value.incentiveRatio} onChange={set('incentiveRatio')} placeholder="1:10" /><span className="hint">For incentive covers: one free per 10 copies of the qualifying cover.</span></div>
          <div className="field"><label>Qualifying catalog id <span className="dim">optional</span></label><input value={value.incentiveQualifierKey} onChange={set('incentiveQualifierKey')} placeholder="SAV-92708" /><span className="hint">Leave blank to use the main cover of the same issue.</span></div>
          <label className="switch span-2"><input type="checkbox" checked={value.reorderable} onChange={(e) => onChange({ ...value, reorderable: e.target.checked })} /> Shops may reorder after this cycle</label>
          {admin && null}
        </div>
      </div>
    </fieldset>
  );
}

export function PartnerListingEdit() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { me, reload: reloadMe } = useMe();
  const { show, node } = useFlash();
  const { data: cyc } = useLoad<{ cycles: { id: string; name: string; catalogDate: string; focDate: string; inStoreDate: string }[] }>('/pod/partner/cycles');
  const { data, reload } = useLoad<{ listing: Listing; events: PodEvent[]; sales: { units: number; wholesaleCents: number }; editable: boolean }>(isNew ? null : `/pod/partner/listings/${id}`, [id]);
  const [form, setForm] = useState<Form>(blank);
  const [busy, setBusy] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (data?.listing) { setForm(fromListing(data.listing)); setDirty(false); } }, [data?.listing]);
  useEffect(() => { if (isNew && me?.openCycle && !form.cycleId) setForm((f) => ({ ...f, cycleId: me.openCycle!.id })); }, [isNew, me?.openCycle, form.cycleId]);
  const l = data?.listing;
  const editable = isNew || Boolean(data?.editable);
  const change = (f: Form) => { setForm(f); setDirty(true); };

  const save = async (e?: FormEvent) => {
    e?.preventDefault(); setBusy('save');
    try {
      if (isNew) { const r = await api.post<{ listing: Listing }>('/pod/partner/listings', toBody(form)); show('Listing created. Now add the cover image and print files.'); navigate(`/partner/listings/${r.listing.id}`, { replace: true }); }
      else { await api.patch(`/pod/partner/listings/${id}`, toBody(form)); show('Saved'); setDirty(false); await reload(); }
      void reloadMe();
    } catch (x) { show(errText(x), true); } finally { setBusy(null); }
  };
  const upload = async (kind: string, file: File) => {
    setBusy(kind);
    try {
      const fd = new FormData(); fd.append('kind', kind); fd.append('file', file);
      const r = await api.postForm<{ preflight: { status: string; headline: string } | null }>(`/pod/partner/listings/${id}/files`, fd);
      show(r.preflight ? r.preflight.headline : 'Uploaded', r.preflight?.status === 'changes_required');
      await reload();
    } catch (x) { show(errText(x), true); } finally { setBusy(null); }
  };
  const act = async (path: string, ok: string) => {
    setBusy(path);
    try { await api.post(`/pod/partner/listings/${id}/${path}`); show(ok); await reload(); void reloadMe(); } catch (x) { show(errText(x), true); } finally { setBusy(null); }
  };

  const readyToSubmit = l && !l.missingFiles.length && l.files.cover_image && l.cycle && l.msrpCents > 0 && l.pageCount && l.trimWidthIn;
  return (
    <>
      {node}
      <div className="ptop">
        <div>
          <Link to="/partner/listings" className="pbtn ghost xs" style={{ marginBottom: '.5rem' }}><ArrowLeft size={14} /> Listings</Link>
          <h1>{isNew ? 'New listing' : l ? `${l.title}${l.issueNumber ? ` #${l.issueNumber}` : ''}` : '…'}</h1>
          {l && <div className="row" style={{ marginTop: '.4rem' }}><StatusPill status={l.status} /><span className="key">{l.catalogKey}</span>{l.cycle && <span className="dim" style={{ fontSize: '.88rem' }}>{l.cycle.name}</span>}</div>}
        </div>
        <div className="row">
          {!isNew && l && (l.status === 'DRAFT' || l.status === 'CHANGES_REQUESTED') && <button className="pbtn glow" disabled={!readyToSubmit || busy !== null || dirty} title={dirty ? 'Save first' : !readyToSubmit ? 'Finish the details and files first' : ''} onClick={() => void act('submit', 'Sent for review. We will email you.')}><Send size={16} /> Submit for review</button>}
          {!isNew && l?.status === 'SUBMITTED' && <button className="pbtn ghost" disabled={busy !== null} onClick={() => void act('withdraw', 'Back to draft.')}><Undo2 size={16} /> Withdraw</button>}
          {editable && <button className="pbtn primary" disabled={busy !== null || (!isNew && !dirty)} onClick={() => void save()}>{busy === 'save' ? 'Saving…' : isNew ? 'Create listing' : 'Save changes'}</button>}
        </div>
      </div>

      {l?.status === 'CHANGES_REQUESTED' && l.reviewNote && <div className="notice warn" style={{ marginBottom: '1rem' }}><FileText size={18} /><div><b>Changes requested</b><div style={{ whiteSpace: 'pre-wrap' }}>{l.reviewNote}</div></div></div>}
      {l?.status === 'REJECTED' && <div className="notice bad" style={{ marginBottom: '1rem' }}><div><b>Not accepted</b>{l.reviewNote && <div style={{ whiteSpace: 'pre-wrap' }}>{l.reviewNote}</div>}</div></div>}
      {l && !editable && l.status !== 'REJECTED' && <div className="notice info" style={{ marginBottom: '1rem' }}><CheckCircle2 size={18} /> This listing is {LISTING_STATUS[l.status].label.toLowerCase()}, so its details are locked. Write to us if something must change. Print files can still be replaced on approved or live titles.</div>}
      {isNew && <div className="notice info" style={{ marginBottom: '1rem' }}><Sparkles size={18} /> Create the listing first; the cover image and print files are added on the next screen.</div>}

      <div className="split">
        <form onSubmit={save}><ListingForm value={form} onChange={change} cycles={cyc?.cycles ?? []} settings={me?.settings ?? null} disabled={!editable} /></form>
        <aside className="stack sticky">
          {!isNew && l && (
            <>
              <div className="panel accent">
                <h3>Readiness</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: '.5rem 0 0', display: 'grid', gap: '.35rem', fontSize: '.9rem' }}>
                  {[[Boolean(l.msrpCents && l.pageCount && l.trimWidthIn), 'Price, pages and trim set'], [Boolean(l.cycle), 'Catalog cycle picked'], [Boolean(l.files.cover_image), 'Cover image'], ...(l.fulfillment === 'PRINTED_BY_US' ? [[Boolean(l.files.cover), 'Cover PDF'], [Boolean(l.files.interior), 'Interior PDF']] as [boolean, string][] : [])].map(([ok, label]) => (
                    <li key={label as string} className="row" style={{ gap: '.5rem' }}><span style={{ width: 18, height: 18, borderRadius: '50%', background: ok ? 'var(--p-green)' : 'var(--p-line)', display: 'inline-grid', placeItems: 'center', color: '#fff', fontSize: '.7rem', fontWeight: 800 }}>{ok ? '✓' : ''}</span>{label}</li>
                  ))}
                </ul>
              </div>
              <FileSlot label="Cover image" file={l.files.cover_image} accept="image/*" busy={busy === 'cover_image'} hint="JPG, PNG or WebP · the catalog thumbnail" onUpload={(f) => void upload('cover_image', f)} readOnly={!editable && !['APPROVED', 'LIVE'].includes(l.status)} />
              {l.fulfillment === 'PRINTED_BY_US' && <>
                <FileSlot label="Cover PDF" file={l.files.cover} accept="application/pdf" busy={busy === 'cover'} hint="4 pages or a wrap, with 0.125&quot; bleed" onUpload={(f) => void upload('cover', f)} readOnly={!editable && !['APPROVED', 'LIVE'].includes(l.status)} />
                <FileSlot label="Interior PDF" file={l.files.interior} accept="application/pdf" busy={busy === 'interior'} hint={`${l.pageCount ?? '?'} single pages with bleed`} onUpload={(f) => void upload('interior', f)} readOnly={!editable && !['APPROVED', 'LIVE'].includes(l.status)} />
              </>}
              {data && data.sales.units > 0 && <div className="panel"><h3>Sales</h3><div className="display-md mono">{data.sales.units} copies</div><div className="dim">{money(data.sales.wholesaleCents)} wholesale to date</div></div>}
              <div className="panel"><h3>History</h3><div style={{ marginTop: '.5rem' }}><Events events={data?.events ?? []} /></div></div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Purchase orders & statements
// ---------------------------------------------------------------------------

interface PO { id: string; number: string; status: string; lines: { catalogKey: string; title: string; quantity: number; wholesaleCents: number; shipTo: { qty: number; address: Record<string, string> }[] }[]; unitsTotal: number; wholesaleCents: number; commissionCents: number; netCents: number; sentAt: string | null; acknowledgedAt: string | null; fulfilledAt: string | null; notes: string | null; cycle: { name: string; inStoreDate: string } }

export function PartnerPurchaseOrders() {
  const { data, reload } = useLoad<{ purchaseOrders: PO[] }>('/pod/partner/purchase-orders');
  const { id } = useParams();
  const { show, node } = useFlash();
  const [note, setNote] = useState('');
  const sel = data?.purchaseOrders.find((p) => p.id === id) ?? null;
  const act = async (path: string, body?: unknown) => { try { await api.post(`/pod/partner/purchase-orders/${sel!.id}/${path}`, body); show('Thanks — noted.'); await reload(); } catch (x) { show(errText(x), true); } };
  const fmtAddr = (a: Record<string, string>) => [a.company, [a.firstName, a.lastName].filter(Boolean).join(' '), a.line1, a.line2, [a.city, a.region, a.postalCode].filter(Boolean).join(', '), a.phone].filter(Boolean).join(' · ');
  if (sel) {
    return (
      <>
        {node}
        <div className="ptop"><div><Link to="/partner/purchase-orders" className="pbtn ghost xs" style={{ marginBottom: '.5rem' }}><ArrowLeft size={14} /> Purchase orders</Link><h1>{sel.number}</h1><div className="row" style={{ marginTop: '.4rem' }}><TonePill map={PURCHASE_STATUS} status={sel.status} /><span className="dim">{sel.cycle.name} · ship for {dateShort(sel.cycle.inStoreDate)}</span></div></div>
          <div className="row">{sel.status === 'SENT' && <button className="pbtn soft" onClick={() => void act('acknowledge')}>Acknowledge</button>}{(sel.status === 'SENT' || sel.status === 'ACKNOWLEDGED') && <button className="pbtn glow" onClick={() => void act('shipped', { note })}><Truck size={16} /> Mark shipped</button>}</div></div>
        <div className="split">
          <div className="stack">
            {sel.lines.map((ln) => (
              <div key={ln.catalogKey} className="panel">
                <div className="between"><div><b>{ln.title}</b> <span className="key">{ln.catalogKey}</span></div><div className="display-md mono">{ln.quantity} copies</div></div>
                <table className="ptable" style={{ marginTop: '.75rem' }}><thead><tr><th>Ship to</th><th className="num">Copies</th></tr></thead><tbody>{ln.shipTo.map((s, i) => <tr key={i}><td style={{ fontSize: '.86rem' }}>{fmtAddr(s.address)}</td><td className="num mono">{s.qty}</td></tr>)}</tbody></table>
              </div>
            ))}
            {(sel.status === 'SENT' || sel.status === 'ACKNOWLEDGED') && <div className="panel"><label className="lbl">Shipping note for us (tracking, carrier, dates)</label><textarea className="inp" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></div>}
          </div>
          <aside className="panel sticky"><h3>Money on this order</h3>
            <div className="money-row"><span>{sel.unitsTotal} copies at wholesale</span><b className="mono">{money(sel.wholesaleCents)}</b></div>
            <div className="money-row"><span>Our commission</span><b className="mono neg">−{money(sel.commissionCents)}</b></div>
            <div className="money-row total"><span>Net to you</span><b className="mono">{money(sel.netCents)}</b></div>
            <p className="dim" style={{ fontSize: '.82rem' }}>Paid out on your next statement once the order has shipped.</p>
            {sel.notes && <div className="notice info" style={{ marginTop: '.75rem', whiteSpace: 'pre-wrap' }}>{sel.notes}</div>}
          </aside>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="ptop"><div><div className="eyebrow">Purchase orders</div><h1>Books you ship</h1><div className="sub">After each final order cutoff, the copies shops ordered of your publisher-shipped titles, with addresses. Shop names stay with us.</div></div></div>
      <div className="panel flush">
        {!data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : data.purchaseOrders.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No purchase orders yet" body="They appear here once a catalog with your publisher-shipped titles locks at FOC." /></div> : (
          <table className="ptable"><thead><tr><th>Number</th><th>Catalog</th><th>Ship by</th><th className="num">Copies</th><th className="num">Net to you</th><th>Status</th></tr></thead><tbody>
            {data.purchaseOrders.map((p) => <tr key={p.id} className="click" onClick={() => (window.location.href = `/partner/purchase-orders/${p.id}`)}><td><b>{p.number}</b></td><td>{p.cycle.name}</td><td>{dateShort(p.cycle.inStoreDate)}</td><td className="num mono">{p.unitsTotal}</td><td className="num mono">{money(p.netCents)}</td><td><TonePill map={PURCHASE_STATUS} status={p.status} /></td></tr>)}
          </tbody></table>
        )}
      </div>
    </>
  );
}

interface Statement { id: string; number: string; status: string; periodStart: string; periodEnd: string; grossCents: number; commissionCents: number; printingCents: number; creditsCents: number; adjustmentCents: number; netCents: number; issuedAt: string | null; paidAt: string | null; paymentMethod: string | null; paymentRef: string | null; notes: string | null; lines: { kind: string; amountCents: number; description: string; catalogKey: string | null; title: string | null; cycle: string | null; at: string }[]; cycle: { name: string } | null }
interface LedgerEntry { id: string; kind: string; amountCents: number; description: string; createdAt: string; listing: { catalogKey: string; title: string } | null; cycle: { name: string } | null }

export function PartnerStatements() {
  const { id } = useParams();
  const { data } = useLoad<{ statements: Statement[]; summary: { grossCents: number; commissionCents: number; printingCents: number; netCents: number; unassignedCents: number; payoutsCents: number }; pending: LedgerEntry[] }>('/pod/partner/statements');
  const sel = data?.statements.find((s) => s.id === id);
  if (sel) {
    return (
      <>
        <div className="ptop"><div><Link to="/partner/statements" className="pbtn ghost xs" style={{ marginBottom: '.5rem' }}><ArrowLeft size={14} /> Statements</Link><h1>Statement {sel.number}</h1><div className="row" style={{ marginTop: '.4rem' }}><TonePill map={STATEMENT_STATUS} status={sel.status} /><span className="dim">{dateShort(sel.periodStart)} – {dateShort(sel.periodEnd)}{sel.cycle ? ` · ${sel.cycle.name}` : ''}</span></div></div><button className="pbtn ghost" onClick={() => window.print()}>Print / save PDF</button></div>
        <div className="split">
          <div className="panel flush"><table className="ptable"><thead><tr><th>Date</th><th>Entry</th><th>Title</th><th className="num">Amount</th></tr></thead><tbody>
            {sel.lines.map((ln, i) => <tr key={i}><td className="dim" style={{ whiteSpace: 'nowrap' }}>{dateShort(ln.at)}</td><td>{ln.description}</td><td>{ln.title ? <>{ln.title} <span className="key">{ln.catalogKey}</span></> : ''}</td><td className={`num mono${ln.amountCents < 0 ? ' neg' : ''}`} style={ln.amountCents < 0 ? { color: '#c81e24' } : undefined}>{money(ln.amountCents)}</td></tr>)}
          </tbody></table></div>
          <aside className="panel sticky"><h3>Summary</h3>
            <div className="money-row"><span>Wholesale sales</span><b className="mono">{money(sel.grossCents)}</b></div>
            <div className="money-row"><span>Commission</span><b className="mono neg">{money(sel.commissionCents)}</b></div>
            <div className="money-row"><span>Printing</span><b className="mono neg">{money(sel.printingCents)}</b></div>
            {sel.creditsCents !== 0 && <div className="money-row"><span>Return credits</span><b className="mono neg">{money(sel.creditsCents)}</b></div>}
            {sel.adjustmentCents !== 0 && <div className="money-row"><span>Adjustments</span><b className="mono">{money(sel.adjustmentCents)}</b></div>}
            <div className="money-row total"><span>Net payout</span><b className="mono">{money(sel.netCents)}</b></div>
            {sel.status === 'PAID' && <div className="notice good" style={{ marginTop: '.75rem' }}><CheckCircle2 size={16} /> Paid {dateShort(sel.paidAt)}{sel.paymentMethod ? ` by ${sel.paymentMethod}` : ''}{sel.paymentRef ? ` · ${sel.paymentRef}` : ''}</div>}
            {sel.notes && <p className="dim" style={{ fontSize: '.86rem', whiteSpace: 'pre-wrap' }}>{sel.notes}</p>}
          </aside>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="ptop"><div><div className="eyebrow">Sales &amp; payouts</div><h1>What you've earned</h1><div className="sub">Every wholesale sale, our commission and any printing land here as they happen; a statement sweeps them up each cycle.</div></div></div>
      {data && (
        <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
          <Kpi label="Wholesale sales" value={money(data.summary.grossCents)} sub="all time" />
          <Kpi label="Commission" value={money(-data.summary.commissionCents)} sub="all time" />
          <Kpi label="Printing" value={money(-data.summary.printingCents)} sub="charged against payouts" />
          <Kpi label="Owed to you" value={money(data.summary.unassignedCents)} sub={`${money(-data.summary.payoutsCents)} paid out`} dark />
        </div>
      )}
      <div className="split">
        <div className="panel flush">
          <div className="panel-head" style={{ padding: '1rem 1rem 0' }}><h3>Statements</h3></div>
          {!data ? <p className="dim" style={{ padding: '1rem' }}>Loading…</p> : data.statements.length === 0 ? <div style={{ padding: '1rem' }}><Empty title="No statements yet" body="Your first statement comes after the first cycle your titles sell in." /></div> : (
            <table className="ptable"><thead><tr><th>Number</th><th>Period</th><th className="num">Net</th><th>Status</th></tr></thead><tbody>
              {data.statements.map((s) => <tr key={s.id} className="click" onClick={() => (window.location.href = `/partner/statements/${s.id}`)}><td><b>{s.number}</b>{s.cycle && <div className="dim" style={{ fontSize: '.78rem' }}>{s.cycle.name}</div>}</td><td className="dim">{dateShort(s.periodStart)} – {dateShort(s.periodEnd)}</td><td className="num mono">{money(s.netCents)}</td><td><TonePill map={STATEMENT_STATUS} status={s.status} /></td></tr>)}
            </tbody></table>
          )}
        </div>
        <div className="panel flush">
          <div className="panel-head" style={{ padding: '1rem 1rem 0' }}><h3>Not yet on a statement</h3></div>
          {!data ? null : data.pending.length === 0 ? <p className="dim" style={{ padding: '0 1rem 1rem', fontSize: '.9rem' }}>Nothing pending.</p> : (
            <table className="ptable"><tbody>{data.pending.map((e) => <tr key={e.id}><td><div style={{ fontSize: '.88rem' }}>{e.description}</div><div className="dim" style={{ fontSize: '.76rem' }}>{dateTime(e.createdAt)}</div></td><td className="num mono" style={e.amountCents < 0 ? { color: '#c81e24' } : undefined}>{money(e.amountCents)}</td></tr>)}</tbody></table>
          )}
        </div>
      </div>
    </>
  );
}

export { toBody as listingFormToBody, fromListing as listingToForm, blank as blankListingForm, type Form as ListingFormValue };
