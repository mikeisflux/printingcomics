import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';

interface AdminReview {
  id: string;
  email: string;
  customerName: string | null;
  rating: number | null;
  title: string | null;
  body: string | null;
  status: 'invited' | 'pending' | 'approved' | 'rejected';
  featured: boolean;
  reply: string | null;
  adminNote: string | null;
  requestedAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  order: { id: string; number: string; totalCents: number } | null;
}

const TABS: { key: string; label: string }[] = [
  { key: 'pending', label: 'Awaiting moderation' },
  { key: 'approved', label: 'Live' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'invited', label: 'Invited (no reply yet)' },
  { key: 'all', label: 'All' },
];

function Stars({ rating }: { rating: number | null }) {
  if (!rating) return <span className="muted">—</span>;
  return (
    <span style={{ color: '#f5a623', letterSpacing: 1 }}>
      {'★'.repeat(rating)}
      <span style={{ color: '#d7d7d7' }}>{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

export function AdminReviews() {
  const [tab, setTab] = useState('pending');
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.get<{ reviews: AdminReview[]; counts: Record<string, number> }>(`/admin/reviews?status=${tab}`)
      .then((r) => { setReviews(r.reviews); setCounts(r.counts); })
      .catch((e) => setError(e?.message ?? 'Could not load reviews'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(r: AdminReview, status: 'approved' | 'rejected' | 'pending', notify = false) {
    setBusyId(r.id); setError(null);
    try {
      await api.patch(`/admin/reviews/${r.id}`, {
        status,
        reply: replies[r.id] !== undefined ? replies[r.id] : undefined,
        notify,
      });
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not update the review');
    } finally { setBusyId(null); }
  }

  async function toggleFeatured(r: AdminReview) {
    setBusyId(r.id);
    try {
      await api.patch(`/admin/reviews/${r.id}/feature`, { featured: !r.featured });
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not update');
    } finally { setBusyId(null); }
  }

  async function copyLink(r: AdminReview) {
    try {
      const { url } = await api.get<{ url: string | null }>(`/admin/reviews/${r.id}/link`);
      if (url) { void navigator.clipboard?.writeText(url); alert('Review link copied.'); }
      else alert('Set your public site URL in Settings → Store first.');
    } catch (e: any) { alert(e?.message ?? 'Could not get the link'); }
  }

  return (
    <div>
      <div className="spread" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '.75rem' }}>
        <h1 style={{ margin: 0 }}>Reviews</h1>
        <span className="muted" style={{ fontSize: '.85rem' }}>
          Requests are emailed automatically when an order is delivered. Nothing appears on the
          site until you approve it.
        </span>
      </div>

      <div className="row" style={{ gap: '.4rem', flexWrap: 'wrap', margin: '1.25rem 0' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`btn ${tab === t.key ? '' : 'secondary'}`}
            style={{ padding: '.35rem .75rem', fontSize: '.9rem' }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {counts[t.key] != null && t.key !== 'all' && (
              <span style={{ marginLeft: '.4rem', opacity: .8 }}>({counts[t.key]})</span>
            )}
          </button>
        ))}
      </div>

      {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && reviews.length === 0 && (
        <p className="muted">
          {tab === 'pending'
            ? 'Nothing waiting on you — reviews land here as customers submit them.'
            : 'No reviews in this view yet.'}
        </p>
      )}

      <div style={{ display: 'grid', gap: '1rem' }}>
        {reviews.map((r) => (
          <div key={r.id} className="admin-card">
            <div className="spread" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '.5rem' }}>
              <div>
                <Stars rating={r.rating} />
                {r.title && <span style={{ fontWeight: 700, marginLeft: '.6rem' }}>{r.title}</span>}
                {r.featured && (
                  <span className="badge" style={{ background: 'var(--brand)', color: '#fff', marginLeft: '.5rem', fontSize: '.7rem' }}>
                    Featured
                  </span>
                )}
                <div className="muted" style={{ fontSize: '.85rem', marginTop: '.2rem' }}>
                  {r.customerName || 'Anonymous'} · {r.email}
                  {r.order && (
                    <> · <Link to={`/admin/orders/${r.order.id}`}>{r.order.number}</Link> ({formatMoney(r.order.totalCents)})</>
                  )}
                </div>
              </div>
              <div className="muted" style={{ fontSize: '.8rem', textAlign: 'right' }}>
                {r.submittedAt
                  ? `Submitted ${new Date(r.submittedAt).toLocaleString()}`
                  : `Invited ${new Date(r.requestedAt).toLocaleString()}`}
                <div style={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.05em', marginTop: '.15rem' }}>
                  {r.status}
                </div>
              </div>
            </div>

            {r.body && (
              <p style={{ whiteSpace: 'pre-wrap', margin: '.75rem 0 0', lineHeight: 1.6 }}>{r.body}</p>
            )}
            {!r.body && r.status === 'invited' && (
              <p className="muted" style={{ margin: '.75rem 0 0' }}>
                The customer hasn't filled this in yet.
              </p>
            )}

            {r.status !== 'invited' && (
              <div style={{ marginTop: '.9rem' }}>
                <label style={{ fontSize: '.85rem' }}>Public reply (optional)</label>
                <textarea
                  rows={2}
                  defaultValue={r.reply ?? ''}
                  onChange={(e) => setReplies((m) => ({ ...m, [r.id]: e.target.value }))}
                  placeholder="Thanks for the kind words — glad the foil turned out well!"
                />
              </div>
            )}

            <div className="row" style={{ gap: '.5rem', flexWrap: 'wrap', marginTop: '.75rem' }}>
              {r.status !== 'approved' && r.rating != null && (
                <button className="btn" disabled={busyId === r.id} onClick={() => decide(r, 'approved', true)}>
                  {busyId === r.id ? '…' : 'Approve & publish'}
                </button>
              )}
              {r.status !== 'rejected' && r.rating != null && (
                <button
                  className="btn secondary"
                  style={{ color: '#b91c1c', borderColor: '#b91c1c' }}
                  disabled={busyId === r.id}
                  onClick={() => decide(r, 'rejected')}
                >
                  Reject
                </button>
              )}
              {r.status === 'approved' && (
                <>
                  <button className="btn secondary" disabled={busyId === r.id} onClick={() => toggleFeatured(r)}>
                    {r.featured ? 'Unfeature' : 'Feature'}
                  </button>
                  <button className="btn secondary" disabled={busyId === r.id} onClick={() => decide(r, 'pending')}>
                    Unpublish
                  </button>
                </>
              )}
              <button className="btn secondary" onClick={() => copyLink(r)}>Copy review link</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
