/**
 * Staff view of the publisher and retailer portals. A picker when nothing is
 * chosen yet, and a banner across the top of the portal while viewing as
 * someone (switch, or leave for the admin). The choice is kept in lib/view-as.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, LogOut, Repeat, Search } from 'lucide-react';
import { Avatar, Empty, Pill, useLoad } from './ui';
import { setViewAs, type ViewAsKind } from '../../lib/view-as';
import { statusWord } from '../../lib/pod';

interface Lists {
  publishers: { id: string; name: string; status: string; listings: number }[];
  retailers: { id: string; name: string; status: string; place: string; orders: number }[];
}

const WORDS: Record<ViewAsKind, { one: string; many: string; portal: string; adminList: string }> = {
  partner: { one: 'publisher', many: 'publishers', portal: 'publisher portal', adminList: '/admin/pod/publishers' },
  retailer: { one: 'shop', many: 'comic shops', portal: 'wholesale ordering', adminList: '/admin/pod/retailers' },
};

export function ViewAsPicker({ kind, notice }: { kind: ViewAsKind; notice?: string | null }) {
  const { data, error } = useLoad<Lists>('/pod/staff/view-as');
  const [q, setQ] = useState('');
  const w = WORDS[kind];
  const rows = useMemo(() => {
    const list: { id: string; name: string; status: string; sub: string }[] = kind === 'partner'
      ? (data?.publishers ?? []).map((p) => ({ id: p.id, name: p.name, status: p.status, sub: `${p.listings} listing${p.listings === 1 ? '' : 's'}` }))
      : (data?.retailers ?? []).map((r) => ({ id: r.id, name: r.name, status: r.status, sub: [r.place, `${r.orders} order${r.orders === 1 ? '' : 's'}`].filter(Boolean).join(' · ') }));
    const needle = q.trim().toLowerCase();
    return needle ? list.filter((r) => r.name.toLowerCase().includes(needle)) : list;
  }, [data, kind, q]);
  return (
    <div className="pod container" style={{ padding: '2.5rem 1.25rem 3rem', maxWidth: 820 }} data-testid={`view-as-picker-${kind}`}>
      <div className="eyebrow" style={{ marginBottom: '.4rem' }}>Staff view</div>
      <h1 className="display-md" style={{ margin: 0 }}>See the {w.portal} as a {w.one}</h1>
      <p className="dim" style={{ margin: '.5rem 0 1.25rem', maxWidth: 600 }}>Pick who to view as. You will see exactly what they see, and anything you do in there is recorded under your own name.</p>
      {notice && <div className="notice warn" style={{ marginBottom: '1rem' }}>{notice}</div>}
      {error && <div className="notice bad" style={{ marginBottom: '1rem' }}>{error}</div>}
      <div className="row" style={{ marginBottom: '1rem' }}>
        <label className="row" style={{ flex: 1, gap: '.5rem' }}><Search size={16} className="dim" /><input className="inp" style={{ flex: 1 }} autoFocus placeholder={`Find a ${w.one}…`} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <Link to="/admin/pod" className="pbtn ghost">Back to admin</Link>
      </div>
      {data && rows.length === 0 ? (
        <Empty title={q ? `No ${w.many} match "${q}"` : `No ${w.many} yet`} action={<Link to={w.adminList} className="pbtn primary sm">Manage {w.many}</Link>} />
      ) : (
        <div className="panel flush">
          {rows.map((r) => (
            <button key={r.id} type="button" className="between" data-testid="view-as-row" onClick={() => setViewAs(kind, { id: r.id, name: r.name })}
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--p-line)', padding: '.8rem 1rem', cursor: 'pointer', gap: '1rem', font: 'inherit', color: 'inherit' }}>
              <span className="row" style={{ gap: '.75rem' }}><Avatar name={r.name} /><span><b>{r.name}</b><div className="dim" style={{ fontSize: '.8rem' }}>{r.sub}</div></span></span>
              <span className="row" style={{ gap: '.6rem' }}><Pill tone={r.status === 'ACTIVE' ? 'green' : r.status === 'PENDING' ? 'amber' : 'slate'}>{statusWord(r.status)}</Pill><span className="pbtn soft xs"><Eye size={13} /> View as</span></span>
            </button>
          ))}
          {!data && !error && <div className="dim" style={{ padding: '1rem' }}>Loading…</div>}
        </div>
      )}
    </div>
  );
}

export function ViewAsBanner({ kind, name }: { kind: ViewAsKind; name: string }) {
  const navigate = useNavigate();
  const w = WORDS[kind];
  return (
    <div className="notice info" data-testid="view-as-banner" style={{ marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <Eye size={16} />
      <span style={{ flex: 1 }}><b>Staff view.</b> You are seeing the {w.portal} as <b>{name}</b>. Anything you do here happens for real and is recorded under your name.</span>
      <span className="row" style={{ gap: '.4rem' }}>
        <button type="button" className="pbtn ghost xs" onClick={() => setViewAs(kind, null)}><Repeat size={13} /> Switch {w.one}</button>
        <button type="button" className="pbtn ghost xs" onClick={() => { setViewAs(kind, null); navigate('/admin/pod'); }}><LogOut size={13} /> Back to admin</button>
      </span>
    </div>
  );
}
