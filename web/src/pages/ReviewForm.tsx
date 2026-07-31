import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';

interface ReviewInvite {
  review: {
    status: 'invited' | 'pending' | 'approved' | 'rejected';
    rating: number | null;
    title: string | null;
    body: string | null;
    customerName: string | null;
    submittedAt: string | null;
    reply: string | null;
  };
  order: { number: string; items: { name: string; quantity: number }[] } | null;
}

const PAGE = { padding: '2.5rem 0', maxWidth: 640 } as const;

function Stars({ value, onChange, size = 40 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  return (
    <div style={{ display: 'flex', gap: '.25rem' }} role={onChange ? 'radiogroup' : undefined} aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          aria-pressed={value === n}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          onClick={() => onChange?.(n)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: onChange ? 'pointer' : 'default',
            fontSize: size,
            lineHeight: 1,
            color: n <= active ? '#f5a623' : '#d7d7d7',
            transition: 'color .12s, transform .12s',
            transform: onChange && n <= active ? 'scale(1.05)' : 'scale(1)',
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function ReviewForm() {
  const { token } = useParams();
  const [params] = useSearchParams();

  const [data, setData] = useState<ReviewInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Stars in the email deep-link a rating, so arriving pre-rated is normal.
  const [rating, setRating] = useState(Number(params.get('rating')) || 0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setLoading(false); setNotFound(true); return; }
    let active = true;
    api.get<ReviewInvite>(`/reviews/${token}`)
      .then((r) => {
        if (!active) return;
        setData(r);
        setName(r.review.customerName ?? '');
        if (r.review.rating) setRating(r.review.rating);
        if (r.review.title) setTitle(r.review.title);
        if (r.review.body) setBody(r.review.body);
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(e instanceof Error ? e.message : 'Could not load this review link.');
        setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  async function submit() {
    if (!token || rating < 1) return;
    setBusy(true); setError(null);
    try {
      await api.post(`/reviews/${token}`, {
        rating,
        title: title.trim() || undefined,
        body: body.trim() || undefined,
        customerName: name.trim() || undefined,
      });
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'Could not submit your review.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="container" style={PAGE}>Loading…</div>;

  if (notFound) {
    return (
      <div className="container" style={PAGE}>
        <h1>We couldn't find that review link</h1>
        <p className="muted">It may have expired or already been used. If you'd still like to leave feedback, just reply to any email from us.</p>
        <Link to="/" className="btn secondary">Back to home</Link>
      </div>
    );
  }

  const already = data && (data.review.status === 'approved' || data.review.status === 'rejected');

  if (done || already) {
    return (
      <div className="container" style={PAGE}>
        <div className="admin-card" style={{ background: '#d4f5dc', border: '1px solid #166534' }}>
          <h1 style={{ marginTop: 0, color: '#166534' }}>
            {data?.review.status === 'approved' ? 'Your review is live' : 'Thank you!'}
          </h1>
          <p style={{ marginBottom: 0 }}>
            {data?.review.status === 'approved'
              ? 'Thanks again — your review is published on our site.'
              : 'Your review has been sent to our team. We read every one, and it will appear on the site shortly.'}
          </p>
          {data?.review.reply && (
            <blockquote style={{ borderLeft: '3px solid #166534', margin: '1rem 0 0', padding: '.25rem 1rem' }}>
              {data.review.reply}
            </blockquote>
          )}
        </div>
        <div style={{ marginTop: '1.25rem' }}>
          <Link to="/" className="btn">Back to the shop</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={PAGE}>
      <h1 style={{ marginBottom: '.25rem' }}>How did we do?</h1>
      {data?.order && (
        <p className="muted" style={{ marginTop: 0 }}>
          Order {data.order.number}
          {data.order.items.length > 0 && ` · ${data.order.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}`}
        </p>
      )}

      <div className="admin-card" style={{ marginTop: '1.5rem' }}>
        <label style={{ fontWeight: 600 }}>Your rating *</label>
        <div style={{ margin: '.5rem 0 1.25rem' }}>
          <Stars value={rating} onChange={setRating} />
        </div>

        <label>Headline (optional)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="e.g. Beautiful print quality"
        />

        <label style={{ marginTop: '.75rem' }}>Your review (optional)</label>
        <textarea
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          placeholder="How were the colors, the paper, the turnaround? Anything you'd tell another creator?"
        />

        <label style={{ marginTop: '.75rem' }}>Name shown with your review</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Jane Doe" />
        <p className="muted" style={{ fontSize: '.8rem', marginTop: '.35rem' }}>
          We only ever publish a first name and last initial — never your full name or email.
        </p>

        {error && <div className="error" style={{ marginTop: '.75rem' }}>{error}</div>}

        <div style={{ marginTop: '1.25rem' }}>
          <button className="btn" onClick={submit} disabled={busy || rating < 1}>
            {busy ? 'Sending…' : 'Submit review'}
          </button>
          {rating < 1 && (
            <span className="muted" style={{ marginLeft: '.75rem', fontSize: '.85rem' }}>
              Pick a star rating to continue.
            </span>
          )}
        </div>
      </div>

      <p className="muted" style={{ fontSize: '.85rem', marginTop: '1rem' }}>
        Reviews are checked by our team before they appear on the site. If something went wrong with
        your order, replying to our email gets it fixed faster.
      </p>
    </div>
  );
}

export { Stars };
