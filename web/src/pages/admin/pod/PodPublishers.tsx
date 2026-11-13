/**
 * /admin/pod/publishers — the publisher directory: profiles, portal logins
 * and invitations, commission, hold / reactivate / archive, listings,
 * ledger, assets and barcodes; plus publisher applications to approve.
 */
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Search, Plus, ArrowLeft, UserPlus, Trash2, Check, Ban, Undo2, Archive, Mail, Copy, Upload } from 'lucide-react';
import { api } from '../../../api/client';
import { money, dateShort, pct, type Listing, type PodEvent, ASSET_KINDS, BARCODE_STATUS } from '../../../lib/pod';
import { Avatar, Drawer, DropZone, Empty, Events, Kpi, Pill, StatusPill, Thumb, TonePill, errText, useFlash, useLoad } from '../../../components/pod/ui';
import { useOverview } from './PodLayout';

interface Publisher { id: string; slug: string; name: string; platform: string | null; status: string; contactEmail: string | null; contactName: string | null; website: string | null; phone: string | null; address: Record<string, string> | null; bio: string | null; printerInfo: string | null; payoutMethod: string | null; payoutDetails: string | null; notes: string | null; color: string | null; commissionBps: number | null; createdAt: string; logo: { id: string; url: string } | null; members: { id: string; email: string; firstName: string | null; lastName: string | null; lastLoginAt: string | null; passwordSetAt: string | null }[]; listingCount: number; memberCount: number; unitsSold?: number; wholesaleCents?: number; owedCents?: number; listingsByStatus?: Record<string, number> }
interface Application { id: string; name: string; contactName: string; contactEmail: string; website: string | null; message: string | null; status: string; createdAt: string; reviewNotes: string | null; partner: { id: string; name: string } | null }
const STATUS: Record<string, { label: string; tone: string }> = { ACTIVE: { label: 'Active', tone: 'green' }, SUSPENDED: { label: 'On hold', tone: 'rose' }, ARCHIVED: { label: 'Archived', tone: 'slate' } };

type PForm = { name: string; contactName: string; contactEmail: string; website: string; phone: string; bio: string; printerInfo: string; payoutMethod: string; payoutDetails: string; notes: string; commissionBps: string; line1: string; line2: string; city: string; region: string; postalCode: string; inviteEmail: string };
const blank: PForm = { name: '', contactName: '', contactEmail: '', website: '', phone: '', bio: '', printerInfo: '', payoutMethod: '', payoutDetails: '', notes: '', commissionBps: '', line1: '', line2: '', city: '', region: '', postalCode: '', inviteEmail: '' };
const toForm = (p: Publisher): PForm => ({ name: p.name, contactName: p.contactName ?? '', contactEmail: p.contactEmail ?? '', website: p.website ?? '', phone: p.phone ?? '', bio: p.bio ?? '', printerInfo: p.printerInfo ?? '', payoutMethod: p.payoutMethod ?? '', payoutDetails: p.payoutDetails ?? '', notes: p.notes ?? '', commissionBps: p.commissionBps != null ? String(p.commissionBps / 100) : '', line1: p.address?.line1 ?? '', line2: p.address?.line2 ?? '', city: p.address?.city ?? '', region: p.address?.region ?? '', postalCode: p.address?.postalCode ?? '', inviteEmail: '' });
const toBody = (f: PForm) => ({ name: f.name, contactName: f.contactName || null, contactEmail: f.contactEmail || null, website: f.website || null, phone: f.phone || null, bio: f.bio || null, printerInfo: f.printerInfo || null, payoutMethod: f.payoutMethod || null, payoutDetails: f.payoutDetails || null, notes: f.notes || null, commissionBps: f.commissionBps === '' ? null : Math.round(Number(f.commissionBps) * 100), address: { line1: f.line1 || null, line2: f.line2 || null, city: f.city || null, region: f.region || null, postalCode: f.postalCode || null, country: 'US' } });

function PublisherEditor({ open, onClose, initial, id, onSaved }: { open: boolean; onClose: () => void; initial: PForm; id?: string; onSaved: (p?: Publisher) => void }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(initial); }, [initial, open]);
  const set = (k: keyof PForm) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => { setBusy(true); setErr(null); try { const r = id ? await api.patch<{ publisher: Publisher }>(`/admin/pod/publishers/${id}`, toBody(f)) : await api.post<{ publisher: Publisher }>('/admin/pod/publishers', { ...toBody(f), inviteEmail: f.inviteEmail || null }); onSaved(r.publisher); onClose(); } catch (x) { setErr(errText(x)); } finally { setBusy(false); } };
  return (
    <Drawer open={open} onClose={onClose} title={id ? 'Edit publisher' : 'Add publisher'} width={700}>
      <div className="form-grid">
        <div className="field span-2"><label>Publisher / imprint name</label><input value={f.name} onChange={set('name')} /></div>
        <div className="field"><label>Contact name</label><input value={f.contactName} onChange={set('contactName')} /></div>
        <div className="field"><label>Contact email</label><input type="email" value={f.contactEmail} onChange={set('contactEmail')} /></div>
        <div className="field"><label>Phone</label><input value={f.phone} onChange={set('phone')} /></div>
        <div className="field"><label>Website</label><input value={f.website} onChange={set('website')} /></div>
        <div className="field span-2"><label>Mailing address</label><input value={f.line1} onChange={set('line1')} placeholder="Street" /></div>
        <div className="field span-2"><input value={f.line2} onChange={set('line2')} placeholder="Suite (optional)" aria-label="Line 2" /></div>
        <div className="field"><label>City</label><input value={f.city} onChange={set('city')} /></div>
        <div className="field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}><div className="field"><label>State</label><input value={f.region} onChange={set('region')} /></div><div className="field"><label>ZIP</label><input value={f.postalCode} onChange={set('postalCode')} /></div></div>
        <div className="field"><label>Commission % <span className="dim">blank = programme default</span></label><input type="number" step="0.5" min={0} max={99} value={f.commissionBps} onChange={set('commissionBps')} /></div>
        <div className="field"><label>Outside printer</label><input value={f.printerInfo} onChange={set('printerInfo')} /></div>
        <div className="field"><label>Payout method</label><select value={f.payoutMethod} onChange={set('payoutMethod')}><option value="">—</option><option value="bank">Bank transfer (ACH)</option><option value="paypal">PayPal</option><option value="check">Check</option><option value="zelle">Zelle</option><option value="other">Other</option></select></div>
        <div className="field"><label>Payout details</label><input value={f.payoutDetails} onChange={set('payoutDetails')} /></div>
        <div className="field span-2"><label>About (public)</label><textarea rows={3} value={f.bio} onChange={set('bio')} /></div>
        <div className="field span-2"><label>Internal notes</label><textarea rows={3} value={f.notes} onChange={set('notes')} /></div>
        {!id && <div className="field span-2"><label>Invite a portal login now <span className="dim">optional</span></label><input type="email" value={f.inviteEmail} onChange={set('inviteEmail')} placeholder="their@email.com" /><span className="hint">They get a sign-in link by email and set a password on first login.</span></div>}
      </div>
      {err && <div className="notice bad" style={{ marginTop: '1rem' }}>{err}</div>}
      <div className="row" style={{ marginTop: '1rem' }}><button className="pbtn primary" disabled={busy || !f.name.trim()} onClick={() => void save()}>{busy ? 'Saving…' : id ? 'Save' : 'Create publisher'}</button><button className="pbtn ghost" onClick={onClose}>Cancel</button></div>
    </Drawer>
  );
}

export function PodPublishers() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') ?? 'directory';
  const [q, setQ] = useState('');
  const { data, reload } = useLoad<{ publishers: Publisher[] }>('/admin/pod/publishers');
  const { data: apps, reload: reloadApps } = useLoad<{ applications: Application[]; pending: number }>('/admin/pod/publishers/applications/list');
  const { reloadOverview } = useOverview();
  const { show, node } = useFlash();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = (data?.publishers ?? []).filter((p) => !q || [p.name, p.contactEmail, p.contactName].some((x) => x?.toLowerCase().includes(q.toLowerCase())));
  const decide = async (a: Application, approve: boolean) => {
    const note = approve ? window.prompt('Commission % for this publisher (blank = default)', '') : window.prompt('Reason (emailed? no — kept on the application)', '');
    if (note === null) return; setBusy(a.id);
    try { if (approve) { const r = await api.post<{ mail: { sent: boolean; to?: string; error?: string } }>(`/admin/pod/publishers/applications/${a.id}/approve`, { commissionBps: note ? Math.round(Number(note) * 100) : null }); show(r.mail.sent ? `Approved · invite sent to ${r.mail.to}` : `Approved · invite failed: ${r.mail.error}`); } else { await api.post(`/admin/pod/publishers/applications/${a.id}/decline`, { note }); show('Declined'); } await Promise.all([reload(), reloadApps()]); void reloadOverview(); } catch (e) { show(errText(e), true); } finally { setBusy(null); }
  };
  return (
    <>
      {node}
      <div className="toolbar">
        <div className="seg"><button className={view === 'directory' ? 'on' : ''} onClick={() => setParams({})}>Directory <span className="n">{data?.publishers.length ?? 0}</span></button><button className={view === 'applications' ? 'on' : ''} onClick={() => setParams({ view: 'applications' })}>Applications <span className="n">{apps?.pending ?? 0}</span></button></div>
        <div className="row"><div className="search"><Search size={15} /><input className="inp" placeholder="Publisher, contact, email…" value={q} onChange={(e) => setQ(e.target.value)} /></div><button className="pbtn primary sm" onClick={() => setCreating(true)}><Plus size={14} /> Add publisher</button></div>
      </div>
      {view === 'directory' ? (
        <div className="panel flush scroll-x">
          {!data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : rows.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No publishers yet" body="Add one by hand, or approve an application." /></div> : (
            <table className="ptable"><thead><tr><th>Publisher</th><th>Contact</th><th>Logins</th><th>Commission</th><th className="num">Listings</th><th className="num">Sold</th><th className="num">Owed</th><th>Status</th></tr></thead><tbody>
              {rows.map((p) => <tr key={p.id} className="click" onClick={() => (window.location.href = `/admin/pod/publishers/${p.id}`)}>
                <td><span className="row" style={{ gap: '.6rem' }}>{p.logo ? <img src={p.logo.url} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 8, background: '#fff', border: '1px solid var(--p-line)' }} /> : <Avatar name={p.name} />}<span><b>{p.name}</b><div className="dim" style={{ fontSize: '.76rem' }}>{p.platform ?? 'publisher'} · since {dateShort(p.createdAt)}</div></span></span></td>
                <td>{p.contactName}<div className="dim" style={{ fontSize: '.76rem' }}>{p.contactEmail}</div></td>
                <td className="mono">{p.memberCount}</td><td>{p.commissionBps != null ? pct(p.commissionBps) : <span className="dim">default</span>}</td>
                <td className="num mono">{p.listingCount}</td><td className="num mono">{p.unitsSold ?? 0}</td><td className="num mono">{money(p.owedCents ?? 0)}</td><td><TonePill map={STATUS} status={p.status} /></td>
              </tr>)}
            </tbody></table>
          )}
        </div>
      ) : (
        <div className="panel flush">
          {!apps ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : apps.applications.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No publisher applications" body="They come from the public Print On Demand page." /></div> : (
            <table className="ptable"><thead><tr><th>Imprint</th><th>Contact</th><th>Message</th><th>Applied</th><th>Status</th><th></th></tr></thead><tbody>
              {apps.applications.map((a) => <tr key={a.id}><td><b>{a.name}</b>{a.website && <div className="dim" style={{ fontSize: '.76rem' }}>{a.website}</div>}{a.partner && <div style={{ fontSize: '.76rem' }}><Link to={`/admin/pod/publishers/${a.partner.id}`}>→ {a.partner.name}</Link></div>}</td><td>{a.contactName}<div className="dim" style={{ fontSize: '.76rem' }}>{a.contactEmail}</div></td><td style={{ fontSize: '.84rem', whiteSpace: 'pre-wrap', maxWidth: 360 }}>{a.message}{a.reviewNotes && <div className="dim">Note: {a.reviewNotes}</div>}</td><td className="dim">{dateShort(a.createdAt)}</td><td><Pill tone={a.status === 'PENDING' ? 'amber' : a.status === 'APPROVED' ? 'green' : 'slate'}>{a.status.toLowerCase()}</Pill></td><td>{a.status === 'PENDING' && <span className="row"><button className="pbtn glow xs" disabled={busy === a.id} onClick={() => void decide(a, true)}><Check size={12} /> Approve &amp; invite</button><button className="pbtn danger xs" disabled={busy === a.id} onClick={() => void decide(a, false)}><Ban size={12} /> Decline</button></span>}</td></tr>)}
            </tbody></table>
          )}
        </div>
      )}
      <PublisherEditor open={creating} onClose={() => setCreating(false)} initial={blank} onSaved={(p) => { void reload(); void reloadOverview(); if (p) window.location.href = `/admin/pod/publishers/${p.id}`; }} />
    </>
  );
}

interface Detail { publisher: Publisher; listings: Listing[]; ledger: { grossCents: number; commissionCents: number; printingCents: number; unassignedCents: number; payoutsCents: number }; assets: { id: string; kind: string; title: string | null; createdAt: string; media: { id: string; url: string; originalName: string; size: number; mimeType: string } }[]; barcodes: Record<string, number>; events: PodEvent[] }

export function PodPublisherDetail() {
  const { id = '' } = useParams();
  const { data, reload } = useLoad<Detail>(`/admin/pod/publishers/${id}`, [id]);
  const { reloadOverview } = useOverview();
  const { show, node } = useFlash();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState('');
  const [tab, setTab] = useState<'listings' | 'assets' | 'history'>('listings');
  const p = data?.publisher;
  const act = async (path: string, body?: unknown, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return; setBusy(path);
    try { const r = await api.post<{ mail?: { sent: boolean; to?: string; error?: string } | null }>(`/admin/pod/publishers/${id}/${path}`, body); show(r.mail ? (r.mail.sent ? `Done · email sent to ${r.mail.to}` : `Done · email failed: ${r.mail.error}`) : 'Done'); setInvite(''); await reload(); void reloadOverview(); } catch (e) { show(errText(e), true); } finally { setBusy(null); }
  };
  const uploadAsset = async (kind: string, file: File) => { setBusy(kind); try { const fd = new FormData(); fd.append('kind', kind); fd.append('file', file); await api.postForm(`/admin/pod/publishers/${id}/assets`, fd); show('Uploaded'); await reload(); } catch (e) { show(errText(e), true); } finally { setBusy(null); } };
  const signInLink = async (userId: string) => { try { const r = await api.post<{ link?: string; url?: string; sent?: boolean }>(`/admin/users/${userId}/sign-in-link`); const link = r.link ?? r.url; if (link) { await navigator.clipboard?.writeText(link).catch(() => undefined); show('Sign-in link copied / emailed'); } else show(r.sent ? 'Sign-in email sent' : 'Done'); } catch (e) { show(errText(e, 'Could not make a sign-in link (needs the Users area)'), true); } };
  if (!p) return <p className="dim">Loading…</p>;
  const ls = p.listingsByStatus ?? {};
  return (
    <>
      {node}
      <div className="toolbar" style={{ alignItems: 'flex-start' }}>
        <div><Link to="/admin/pod/publishers" className="pbtn ghost xs" style={{ marginBottom: '.5rem' }}><ArrowLeft size={14} /> Publishers</Link><div className="row" style={{ gap: '.75rem' }}>{p.logo ? <img src={p.logo.url} alt="" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 14, background: '#fff', border: '1px solid var(--p-line)' }} /> : <Avatar name={p.name} lg />}<div><h2 className="display-md" style={{ margin: 0 }}>{p.name}</h2><div className="row" style={{ marginTop: '.3rem' }}><TonePill map={STATUS} status={p.status} />{p.website && <a href={p.website} target="_blank" rel="noreferrer" className="chip">{p.website.replace(/^https?:\/\//, '')}</a>}<a href={`/print-on-demand/publishers/${p.slug}`} target="_blank" rel="noreferrer" className="chip">Public page ↗</a><span className="dim" style={{ fontSize: '.85rem' }}>since {dateShort(p.createdAt)}</span></div></div></div></div>
        <div className="row">
          {p.status === 'ACTIVE' && <button className="pbtn ghost" disabled={busy !== null} onClick={() => void act('suspend', {}, 'Place this publisher on hold? Their portal and listings stay but they cannot submit.')}><Ban size={16} /> Place on hold</button>}
          {p.status !== 'ACTIVE' && <button className="pbtn soft" disabled={busy !== null} onClick={() => void act('restore')}><Undo2 size={16} /> Reactivate</button>}
          {p.status !== 'ARCHIVED' && <button className="pbtn ghost" disabled={busy !== null} onClick={() => void act('archive', {}, 'Archive this publisher?')}><Archive size={16} /> Archive</button>}
          <Link to={`/admin/pod/payouts?partner=${p.id}`} className="pbtn ghost">Payouts</Link>
          <button className="pbtn primary" onClick={() => setEditing(true)}>Edit</button>
        </div>
      </div>
      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <Kpi label="Listings" value={p.listingCount} sub={Object.entries(ls).map(([k, n]) => `${n} ${k.toLowerCase().replace('_', ' ')}`).join(' · ') || 'none'} to={`/admin/pod/listings?status=all&partner=${p.id}`} />
        <Kpi label="Sold" value={p.unitsSold ?? 0} sub={`${money(p.wholesaleCents ?? 0)} wholesale`} />
        <Kpi label="Commission" value={p.commissionBps != null ? pct(p.commissionBps) : 'default'} sub={p.payoutMethod ? `pays by ${p.payoutMethod}` : 'no payout method yet'} />
        <Kpi label="Owed" value={money(data!.ledger.unassignedCents)} sub={`${money(-data!.ledger.payoutsCents)} paid out`} dark />
      </div>
      <div className="split">
        <div className="stack">
          <div className="seg"><button className={tab === 'listings' ? 'on' : ''} onClick={() => setTab('listings')}>Listings <span className="n">{data!.listings.length}</span></button><button className={tab === 'assets' ? 'on' : ''} onClick={() => setTab('assets')}>Logo &amp; assets <span className="n">{data!.assets.length}</span></button><button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>History</button></div>
          {tab === 'listings' && <div className="panel flush scroll-x">{data!.listings.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No listings yet" action={<Link to="/admin/pod/listings" className="pbtn primary sm">New listing</Link>} /></div> : <table className="ptable"><thead><tr><th></th><th>Title</th><th>Cycle</th><th className="num">Cover</th><th>Status</th><th>Updated</th></tr></thead><tbody>{data!.listings.map((l) => <tr key={l.id} className="click" onClick={() => (window.location.href = `/admin/pod/listings/${l.id}`)}><td style={{ width: 44 }}><Thumb url={l.coverImage?.url} title={l.title} size={32} /></td><td><b>{l.title}{l.issueNumber ? ` #${l.issueNumber}` : ''}</b><div className="dim" style={{ fontSize: '.76rem' }}><span className="key">{l.catalogKey}</span></div></td><td>{l.cycle?.name ?? '—'}</td><td className="num mono">{money(l.msrpCents)}</td><td><StatusPill status={l.status} /></td><td className="dim">{dateShort(l.updatedAt)}</td></tr>)}</tbody></table>}</div>}
          {tab === 'assets' && (
            <div className="panel">
              <div className="grid cols-2">
                <div><b>Logo</b><div className="row" style={{ margin: '.5rem 0' }}>{p.logo ? <img src={p.logo.url} alt="" style={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 10, background: '#fff', border: '1px solid var(--p-line)' }} /> : <span className="dim">none</span>}</div><DropZone compact accept="image/*" busy={busy === 'logo'} title={p.logo ? 'Replace logo' : 'Upload logo'} onFile={(f) => void uploadAsset('logo', f)} /></div>
                <div><b>Marketing / press</b><div style={{ margin: '.5rem 0' }}><DropZone compact accept="*/*" busy={busy === 'marketing'} title="Upload a marketing file" onFile={(f) => void uploadAsset('marketing', f)} /></div></div>
              </div>
              {data!.assets.length > 0 && <table className="ptable" style={{ marginTop: '1rem' }}><thead><tr><th>File</th><th>Kind</th><th>Added</th><th></th></tr></thead><tbody>{data!.assets.map((a) => <tr key={a.id}><td><a href={a.media.url} target="_blank" rel="noreferrer">{a.media.originalName}</a></td><td>{ASSET_KINDS[a.kind] ?? a.kind}</td><td className="dim">{dateShort(a.createdAt)}</td><td><button className="pbtn ghost xs" onClick={() => { if (confirm('Delete this asset?')) void api.del(`/admin/pod/publishers/${id}/assets/${a.id}`).then(() => reload()); }}><Trash2 size={12} /></button></td></tr>)}</tbody></table>}
            </div>
          )}
          {tab === 'history' && <div className="panel"><Events events={data!.events} /></div>}
        </div>
        <aside className="stack">
          <div className="panel"><h3>Portal logins</h3>
            {p.members.length === 0 && <p className="dim" style={{ fontSize: '.86rem' }}>Nobody can sign in yet. Invite the contact.</p>}
            {p.members.map((m) => <div key={m.id} className="between" style={{ fontSize: '.88rem', padding: '.4rem 0', borderBottom: '1px dashed var(--p-line)' }}><span><b>{[m.firstName, m.lastName].filter(Boolean).join(' ') || m.email}</b><div className="dim" style={{ fontSize: '.76rem' }}>{m.email} · {m.passwordSetAt ? (m.lastLoginAt ? `last in ${dateShort(m.lastLoginAt)}` : 'never signed in') : 'password not set'}</div></span><span className="row" style={{ gap: '.3rem' }}><button className="pbtn ghost xs" title="Re-send the invitation" onClick={() => void act('invite', { email: m.email })}><Mail size={12} /></button><button className="pbtn ghost xs" title="One-time sign-in link" onClick={() => void signInLink(m.id)}><Copy size={12} /></button><button className="pbtn ghost xs" onClick={() => { if (confirm(`Remove ${m.email} from this publisher?`)) void api.del(`/admin/pod/publishers/${id}/members/${m.id}`).then(() => reload()); }} aria-label="Remove"><Trash2 size={12} /></button></span></div>)}
            <div className="row" style={{ marginTop: '.75rem' }}><input className="inp" placeholder="email@publisher.com" value={invite} onChange={(e) => setInvite(e.target.value)} style={{ flex: 1 }} /><button className="pbtn soft sm" disabled={!invite.includes('@') || busy !== null} onClick={() => void act('invite', { email: invite })}><UserPlus size={14} /> Invite</button></div>
          </div>
          <div className="panel"><h3>Contact &amp; company</h3><dl className="spec" style={{ marginTop: '.5rem' }}><dt>Contact</dt><dd>{p.contactName ?? '—'}</dd><dt>Email</dt><dd>{p.contactEmail ? <a href={`mailto:${p.contactEmail}`}>{p.contactEmail}</a> : '—'}</dd><dt>Phone</dt><dd>{p.phone ?? '—'}</dd><dt>Address</dt><dd>{p.address ? [p.address.line1, p.address.line2, [p.address.city, p.address.region, p.address.postalCode].filter(Boolean).join(', ')].filter(Boolean).join(', ') : '—'}</dd><dt>Printer</dt><dd>{p.printerInfo ?? '—'}</dd><dt>Payout</dt><dd>{p.payoutMethod ? `${p.payoutMethod}${p.payoutDetails ? ` · ${p.payoutDetails}` : ''}` : '—'}</dd></dl>{p.bio && <p className="dim" style={{ fontSize: '.86rem', marginTop: '.75rem' }}>{p.bio}</p>}{p.notes && <div className="notice info" style={{ marginTop: '.75rem', fontSize: '.84rem', whiteSpace: 'pre-wrap' }}>{p.notes}</div>}</div>
          <div className="panel"><h3>Barcodes</h3><div className="row" style={{ marginTop: '.5rem' }}>{Object.entries(data!.barcodes).length === 0 ? <span className="dim" style={{ fontSize: '.86rem' }}>None reserved.</span> : Object.entries(data!.barcodes).map(([k, n]) => <TonePill key={k} map={BARCODE_STATUS} status={k} />).map((pill, i) => <span key={i} className="row" style={{ gap: '.3rem' }}>{pill}<b className="mono">{Object.values(data!.barcodes)[i]}</b></span>)}</div><Link to={`/admin/pod/barcodes?partnerId=${p.id}`} className="pbtn ghost xs" style={{ marginTop: '.6rem' }}>Manage barcodes</Link></div>
        </aside>
      </div>
      <PublisherEditor open={editing} onClose={() => setEditing(false)} id={id} initial={toForm(p)} onSaved={() => { void reload(); }} />
      <span style={{ display: 'none' }}><Upload size={1} /></span>
    </>
  );
}
