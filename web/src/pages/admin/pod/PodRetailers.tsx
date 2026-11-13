/**
 * /admin/pod/retailers — comic-shop accounts: applications to approve,
 * active shops, tiers, resale certificates, people; /:id for one shop.
 */
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Search, Plus, ArrowLeft, Check, Ban, Undo2, Archive, UserPlus, Trash2 } from 'lucide-react';
import { api } from '../../../api/client';
import { money, dateShort, RETAILER_STATUS, type PodEvent, type PublicSettings } from '../../../lib/pod';
import { Avatar, Drawer, Empty, Events, Kpi, Pill, TonePill, errText, useFlash, useLoad } from '../../../components/pod/ui';
import { useOverview } from './PodLayout';

interface Retailer {
  id: string; slug: string; name: string; contactName: string | null; contactEmail: string; phone: string | null; website: string | null; address: Record<string, string> | null; status: string; tierOverride: number | null;
  resaleCertNumber: string | null; resaleCertState: string | null; resaleCertExpires: string | null; resaleCertStatus: string; taxExempt: boolean; applicationMessage: string | null; notes: string | null; createdAt: string;
  members: { id: string; email: string; firstName: string | null; lastName: string | null; lastLoginAt: string | null; passwordSetAt: string | null }[]; orderCount: number; wholesaleCents?: number;
}
const US = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

type RForm = { name: string; contactName: string; contactEmail: string; phone: string; website: string; line1: string; line2: string; city: string; region: string; postalCode: string; tierOverride: string; resaleCertNumber: string; resaleCertState: string; resaleCertExpires: string; resaleCertStatus: string; taxExempt: boolean; notes: string };
const blankR: RForm = { name: '', contactName: '', contactEmail: '', phone: '', website: '', line1: '', line2: '', city: '', region: '', postalCode: '', tierOverride: '', resaleCertNumber: '', resaleCertState: '', resaleCertExpires: '', resaleCertStatus: 'not_submitted', taxExempt: false, notes: '' };
const toForm = (r: Retailer): RForm => ({ name: r.name, contactName: r.contactName ?? '', contactEmail: r.contactEmail, phone: r.phone ?? '', website: r.website ?? '', line1: r.address?.line1 ?? '', line2: r.address?.line2 ?? '', city: r.address?.city ?? '', region: r.address?.region ?? '', postalCode: r.address?.postalCode ?? '', tierOverride: r.tierOverride ? String(r.tierOverride) : '', resaleCertNumber: r.resaleCertNumber ?? '', resaleCertState: r.resaleCertState ?? '', resaleCertExpires: r.resaleCertExpires ? r.resaleCertExpires.slice(0, 10) : '', resaleCertStatus: r.resaleCertStatus, taxExempt: r.taxExempt, notes: r.notes ?? '' });
const toBody = (f: RForm) => ({ name: f.name, contactName: f.contactName || null, contactEmail: f.contactEmail, phone: f.phone || null, website: f.website || null, address: { line1: f.line1 || null, line2: f.line2 || null, city: f.city || null, region: f.region || null, postalCode: f.postalCode || null, country: 'US' }, tierOverride: f.tierOverride ? Number(f.tierOverride) : null, resaleCertNumber: f.resaleCertNumber || null, resaleCertState: f.resaleCertState || null, resaleCertExpires: f.resaleCertExpires || null, resaleCertStatus: f.resaleCertStatus, taxExempt: f.taxExempt, notes: f.notes || null });

function RetailerEditor({ open, onClose, initial, id, tiers, onSaved }: { open: boolean; onClose: () => void; initial: RForm; id?: string; tiers: PublicSettings['tiers']; onSaved: () => void }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(initial); }, [initial, open]);
  const set = (k: keyof RForm) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => { setBusy(true); setErr(null); try { if (id) await api.patch(`/admin/pod/retailers/${id}`, toBody(f)); else await api.post('/admin/pod/retailers', toBody(f)); onSaved(); onClose(); } catch (x) { setErr(errText(x)); } finally { setBusy(false); } };
  return (
    <Drawer open={open} onClose={onClose} title={id ? 'Edit retailer' : 'New retailer'} width={680}>
      <div className="form-grid">
        <div className="field span-2"><label>Shop name</label><input value={f.name} onChange={set('name')} /></div>
        <div className="field"><label>Contact</label><input value={f.contactName} onChange={set('contactName')} /></div>
        <div className="field"><label>Email</label><input type="email" value={f.contactEmail} onChange={set('contactEmail')} /></div>
        <div className="field"><label>Phone</label><input value={f.phone} onChange={set('phone')} /></div>
        <div className="field"><label>Website</label><input value={f.website} onChange={set('website')} /></div>
        <div className="field span-2"><label>Ship-to</label><input value={f.line1} onChange={set('line1')} placeholder="Street" /></div>
        <div className="field span-2"><input value={f.line2} onChange={set('line2')} placeholder="Suite (optional)" aria-label="Line 2" /></div>
        <div className="field"><label>City</label><input value={f.city} onChange={set('city')} /></div>
        <div className="field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}><div className="field"><label>State</label><select value={f.region} onChange={set('region')}><option value="">—</option>{US.map((s) => <option key={s}>{s}</option>)}</select></div><div className="field"><label>ZIP</label><input value={f.postalCode} onChange={set('postalCode')} /></div></div>
        <div className="field"><label>Fixed tier</label><select value={f.tierOverride} onChange={set('tierOverride')}><option value="">By order size (default)</option>{tiers.map((t, i) => <option key={t.name} value={i + 1}>{t.name} · {Math.round(t.discountBps / 100)}% always</option>)}</select></div>
        <label className="switch" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.taxExempt} onChange={(e) => setF((x) => ({ ...x, taxExempt: e.target.checked }))} /> Tax exempt</label>
        <div className="field"><label>Resale certificate #</label><input value={f.resaleCertNumber} onChange={set('resaleCertNumber')} /></div>
        <div className="field"><label>Cert state / expires</label><div className="row"><select className="inp" style={{ width: 90 }} value={f.resaleCertState} onChange={set('resaleCertState')}><option value="">—</option>{US.map((s) => <option key={s}>{s}</option>)}</select><input type="date" value={f.resaleCertExpires} onChange={set('resaleCertExpires')} /></div></div>
        <div className="field"><label>Certificate status</label><select value={f.resaleCertStatus} onChange={set('resaleCertStatus')}><option value="not_submitted">Not submitted</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div>
        <div className="field span-2"><label>Internal notes</label><textarea rows={3} value={f.notes} onChange={set('notes')} /></div>
      </div>
      {err && <div className="notice bad" style={{ marginTop: '1rem' }}>{err}</div>}
      <div className="row" style={{ marginTop: '1rem' }}><button className="pbtn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : id ? 'Save' : 'Create retailer'}</button><button className="pbtn ghost" onClick={onClose}>Cancel</button></div>
    </Drawer>
  );
}

export function PodRetailers() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [q, setQ] = useState('');
  const { data, reload } = useLoad<{ retailers: Retailer[]; counts: Record<string, number> }>(`/admin/pod/retailers?status=${status}&q=${encodeURIComponent(q)}`, [status, q]);
  const { data: st } = useLoad<{ settings: PublicSettings }>('/admin/pod/settings');
  const { reloadOverview } = useOverview();
  const [creating, setCreating] = useState(false);
  const counts = data?.counts ?? {};
  return (
    <>
      <div className="toolbar">
        <div className="seg">
          <button className={!status ? 'on' : ''} onClick={() => setParams({})}>All <span className="n">{Object.values(counts).reduce((s, n) => s + n, 0)}</span></button>
          {['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'].map((k) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setParams({ status: k })}>{RETAILER_STATUS[k]!.label} <span className="n">{counts[k] ?? 0}</span></button>)}
        </div>
        <div className="row"><div className="search"><Search size={15} /><input className="inp" placeholder="Shop, contact, email…" value={q} onChange={(e) => setQ(e.target.value)} /></div><button className="pbtn primary sm" onClick={() => setCreating(true)}><Plus size={14} /> New retailer</button></div>
      </div>
      <div className="panel flush scroll-x">
        {!data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : data.retailers.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No retailers here" body="Shops apply from the public page; staff can add one by hand." /></div> : (
          <table className="ptable"><thead><tr><th>Shop</th><th>Contact</th><th>Where</th><th>Tier</th><th>Resale cert</th><th className="num">Orders</th><th className="num">Wholesale</th><th>Status</th></tr></thead><tbody>
            {data.retailers.map((r) => (
              <tr key={r.id} className="click" onClick={() => (window.location.href = `/admin/pod/retailers/${r.id}`)}>
                <td><span className="row" style={{ gap: '.6rem' }}><Avatar name={r.name} /><span><b>{r.name}</b><div className="dim" style={{ fontSize: '.78rem' }}>{r.members.length} login{r.members.length === 1 ? '' : 's'} · since {dateShort(r.createdAt)}</div></span></span></td>
                <td>{r.contactName}<div className="dim" style={{ fontSize: '.78rem' }}>{r.contactEmail}</div></td>
                <td className="dim" style={{ fontSize: '.86rem' }}>{[r.address?.city, r.address?.region].filter(Boolean).join(', ')}</td>
                <td>{r.tierOverride ? <Pill tone="violet">{st?.settings.tiers[r.tierOverride - 1]?.name ?? `Tier ${r.tierOverride}`} fixed</Pill> : <span className="dim">by order</span>}</td>
                <td><Pill tone={r.resaleCertStatus === 'approved' ? 'green' : r.resaleCertStatus === 'submitted' ? 'amber' : r.resaleCertStatus === 'rejected' ? 'red' : 'slate'}>{r.resaleCertStatus.replace('_', ' ')}</Pill></td>
                <td className="num mono">{r.orderCount}</td><td className="num mono">{money(r.wholesaleCents ?? 0)}</td>
                <td><TonePill map={RETAILER_STATUS} status={r.status} /></td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>
      <RetailerEditor open={creating} onClose={() => setCreating(false)} initial={blankR} tiers={st?.settings.tiers ?? []} onSaved={() => { void reload(); void reloadOverview(); }} />
    </>
  );
}

export function PodRetailerDetail() {
  const { id = '' } = useParams();
  const { data, reload } = useLoad<{ retailer: Retailer; orders: { id: string; number: string; status: string; paymentStatus: string; subtotalCents: number; totalCents: number; createdAt: string; cycle: { name: string } | null; wholesale: { tierName: string } | null; _count: { items: number } }[]; events: PodEvent[] }>(`/admin/pod/retailers/${id}`, [id]);
  const { data: st } = useLoad<{ settings: PublicSettings }>('/admin/pod/settings');
  const { reloadOverview } = useOverview();
  const { show, node } = useFlash();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState('');
  const r = data?.retailer;
  const act = async (path: string, body?: unknown, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(path);
    try { const x = await api.post<{ mail?: { sent: boolean; to?: string; error?: string } | null }>(`/admin/pod/retailers/${id}/${path}`, body); show(x.mail ? (x.mail.sent ? `Done · email sent to ${x.mail.to}` : `Done · email failed: ${x.mail.error}`) : 'Done'); setInvite(''); await reload(); void reloadOverview(); } catch (e) { show(errText(e), true); } finally { setBusy(null); }
  };
  if (!r) return <p className="dim">Loading…</p>;
  const spend = data.orders.filter((o) => o.status !== 'CANCELLED').reduce((s, o) => s + o.subtotalCents, 0);
  return (
    <>
      {node}
      <div className="toolbar" style={{ alignItems: 'flex-start' }}>
        <div><Link to="/admin/pod/retailers" className="pbtn ghost xs" style={{ marginBottom: '.5rem' }}><ArrowLeft size={14} /> Retailers</Link><div className="row" style={{ gap: '.75rem' }}><Avatar name={r.name} lg /><div><h2 className="display-md" style={{ margin: 0 }}>{r.name}</h2><div className="row" style={{ marginTop: '.3rem' }}><TonePill map={RETAILER_STATUS} status={r.status} />{r.website && <a href={r.website} target="_blank" rel="noreferrer" className="chip">{r.website.replace(/^https?:\/\//, '')}</a>}<span className="dim" style={{ fontSize: '.85rem' }}>applied {dateShort(r.createdAt)}</span></div></div></div></div>
        <div className="row">
          {r.status === 'PENDING' && <><button className="pbtn glow" disabled={busy !== null} onClick={() => void act('approve')}><Check size={16} /> Approve &amp; invite</button><button className="pbtn danger" disabled={busy !== null} onClick={() => void act('decline', {}, 'Decline this application? It is archived.')}><Ban size={16} /> Decline</button></>}
          {r.status === 'ACTIVE' && <button className="pbtn ghost" disabled={busy !== null} onClick={() => void act('suspend', {}, 'Suspend ordering for this shop?')}><Ban size={16} /> Suspend</button>}
          {(r.status === 'SUSPENDED' || r.status === 'ARCHIVED') && <button className="pbtn soft" disabled={busy !== null} onClick={() => void act('restore')}><Undo2 size={16} /> Restore</button>}
          {r.status !== 'ARCHIVED' && r.status !== 'PENDING' && <button className="pbtn ghost" disabled={busy !== null} onClick={() => void act('archive', {}, 'Archive this shop?')}><Archive size={16} /> Archive</button>}
          <button className="pbtn primary" onClick={() => setEditing(true)}>Edit</button>
        </div>
      </div>
      {r.applicationMessage && <div className="notice info" style={{ marginBottom: '1rem', whiteSpace: 'pre-wrap' }}><b>From the application:</b> {r.applicationMessage}</div>}
      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <Kpi label="Orders" value={r.orderCount} sub={`${money(spend)} wholesale`} />
        <Kpi label="Tier" value={r.tierOverride ? st?.settings.tiers[r.tierOverride - 1]?.name ?? `Tier ${r.tierOverride}` : 'By order'} sub={r.tierOverride ? 'fixed on the account' : (st?.settings.tiers.map((t) => `${Math.round(t.discountBps / 100)}%`).join(' · ') ?? '')} />
        <Kpi label="Resale certificate" value={r.resaleCertStatus.replace('_', ' ')} sub={r.resaleCertNumber ? `${r.resaleCertNumber} · ${r.resaleCertState ?? ''}${r.resaleCertExpires ? ` · exp ${dateShort(r.resaleCertExpires)}` : ''}` : 'none on file'} tone={r.resaleCertStatus === 'submitted' ? 'hot' : undefined} />
        <Kpi label="Tax" value={r.taxExempt ? 'Exempt' : 'Taxable'} sub={r.taxExempt ? 'certificate approved' : 'until a certificate is approved'} dark />
      </div>
      <div className="split">
        <div className="stack">
          <div className="panel flush"><div className="panel-head" style={{ padding: '1rem 1rem 0' }}><h3>Orders</h3></div>{data.orders.length === 0 ? <p className="dim" style={{ padding: '0 1rem 1rem' }}>No orders yet.</p> : <table className="ptable"><thead><tr><th>Order</th><th>Catalog</th><th>Tier</th><th className="num">Lines</th><th className="num">Wholesale</th><th>Status</th><th>Placed</th></tr></thead><tbody>{data.orders.map((o) => <tr key={o.id} className="click" onClick={() => (window.location.href = `/admin/orders/${o.id}`)}><td><b>{o.number}</b></td><td>{o.cycle?.name}</td><td>{o.wholesale?.tierName}</td><td className="num mono">{o._count.items}</td><td className="num mono">{money(o.subtotalCents)}</td><td><Pill tone={o.status === 'CANCELLED' ? 'slate' : o.paymentStatus === 'CAPTURED' ? 'green' : 'amber'}>{o.status.toLowerCase()} · {o.paymentStatus.toLowerCase()}</Pill></td><td className="dim">{dateShort(o.createdAt)}</td></tr>)}</tbody></table>}</div>
          <div className="panel"><div className="panel-head"><h3>History</h3></div><Events events={data.events} /></div>
        </div>
        <aside className="stack">
          <div className="panel"><h3>Contact &amp; ship-to</h3><dl className="spec" style={{ marginTop: '.5rem' }}><dt>Contact</dt><dd>{r.contactName ?? '—'}</dd><dt>Email</dt><dd><a href={`mailto:${r.contactEmail}`}>{r.contactEmail}</a></dd><dt>Phone</dt><dd>{r.phone ?? '—'}</dd><dt>Address</dt><dd>{r.address ? [r.address.line1, r.address.line2, [r.address.city, r.address.region, r.address.postalCode].filter(Boolean).join(', ')].filter(Boolean).join(', ') : '—'}</dd></dl>{r.notes && <p className="dim" style={{ fontSize: '.86rem', whiteSpace: 'pre-wrap', marginTop: '.75rem' }}>{r.notes}</p>}</div>
          <div className="panel"><h3>People who can order</h3>
            {r.members.length === 0 && <p className="dim" style={{ fontSize: '.86rem' }}>No logins yet. Approving creates one for the contact email.</p>}
            {r.members.map((m) => <div key={m.id} className="between" style={{ fontSize: '.88rem', padding: '.4rem 0', borderBottom: '1px dashed var(--p-line)' }}><span><b>{[m.firstName, m.lastName].filter(Boolean).join(' ') || m.email}</b><div className="dim" style={{ fontSize: '.76rem' }}>{m.email} · {m.passwordSetAt ? (m.lastLoginAt ? `last in ${dateShort(m.lastLoginAt)}` : 'never signed in') : 'password not set'}</div></span><button className="pbtn ghost xs" onClick={() => { if (confirm(`Remove ${m.email} from this shop?`)) void api.del(`/admin/pod/retailers/${id}/members/${m.id}`).then(() => reload()); }} aria-label="Remove"><Trash2 size={12} /></button></div>)}
            <div className="row" style={{ marginTop: '.75rem' }}><input className="inp" placeholder="email@shop.com" value={invite} onChange={(e) => setInvite(e.target.value)} style={{ flex: 1 }} /><button className="pbtn soft sm" disabled={!invite.includes('@') || busy !== null} onClick={() => void act('members', { email: invite })}><UserPlus size={14} /> Add</button></div>
            <p className="dim" style={{ fontSize: '.76rem', marginTop: '.5rem' }}>Active shops get a sign-in link by email.</p>
          </div>
        </aside>
      </div>
      <RetailerEditor open={editing} onClose={() => setEditing(false)} id={id} initial={toForm(r)} tiers={st?.settings.tiers ?? []} onSaved={() => { void reload(); }} />
    </>
  );
}
