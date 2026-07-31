import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

interface PublicReview {
  id: string;
  customerName: string;
  rating: number;
  title: string | null;
  body: string | null;
  reply: string | null;
  submittedAt: string | null;
  featured: boolean;
}

function StarRow({ rating, size = 18 }: { rating: number; size?: number }) {
  return (
    <div aria-label={`${rating} out of 5 stars`} style={{ color: '#f5a623', fontSize: size, lineHeight: 1 }}>
      {'★'.repeat(rating)}
      <span style={{ color: '#d7d7d7' }}>{'★'.repeat(5 - rating)}</span>
    </div>
  );
}

/**
 * Approved customer reviews, auto-advancing. Renders nothing at all when
 * there are no approved reviews yet, so a new store never shows an empty
 * "what customers say" band.
 */
export function ReviewSlider() {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [summary, setSummary] = useState<{ average: number | null; count: number }>({ average: null, count: 0 });
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    void api
      .get<{ reviews: PublicReview[]; average: number | null; count: number }>('/reviews?limit=12')
      .then((r) => {
        setReviews(r.reviews ?? []);
        setSummary({ average: r.average, count: r.count });
      })
      .catch(() => setReviews([]));
  }, []);

  useEffect(() => {
    if (paused || reviews.length < 2) return;
    timer.current = window.setInterval(() => setIndex((i) => (i + 1) % reviews.length), 7000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [paused, reviews.length]);

  if (reviews.length === 0) return null;

  const current = reviews[Math.min(index, reviews.length - 1)]!;
  const go = (n: number) => setIndex(((n % reviews.length) + reviews.length) % reviews.length);

  return (
    <section
      style={{ background: 'var(--bg-alt)', padding: '3.5rem 0' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="container" style={{ maxWidth: 820, textAlign: 'center' }}>
        <div
          className="muted"
          style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.12em', fontWeight: 700 }}
        >
          What creators say
        </div>
        {summary.average != null && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.6rem', margin: '.6rem 0 0' }}>
            <StarRow rating={Math.round(summary.average)} size={22} />
            <strong style={{ fontSize: '1.05rem' }}>{summary.average.toFixed(1)}</strong>
            <span className="muted" style={{ fontSize: '.9rem' }}>
              from {summary.count} review{summary.count === 1 ? '' : 's'}
            </span>
          </div>
        )}

        <div
          style={{
            position: 'relative',
            marginTop: '1.75rem',
            minHeight: 210,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* key on id so each slide re-runs the fade-in */}
          <blockquote key={current.id} className="pc-review-slide" style={{ margin: 0, padding: '0 2.5rem' }}>
            <StarRow rating={current.rating} size={20} />
            {current.title && (
              <div style={{ fontWeight: 700, fontSize: '1.25rem', margin: '.6rem 0 .35rem' }}>{current.title}</div>
            )}
            {current.body && (
              <p style={{ fontSize: '1.05rem', lineHeight: 1.65, margin: '.35rem 0 .75rem' }}>“{current.body}”</p>
            )}
            <footer className="muted" style={{ fontSize: '.9rem' }}>
              — {current.customerName}
              {current.submittedAt && (
                <span> · {new Date(current.submittedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
              )}
            </footer>
            {current.reply && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '.6rem 1rem',
                  background: '#fff',
                  borderLeft: '3px solid var(--brand)',
                  borderRadius: 6,
                  textAlign: 'left',
                  fontSize: '.9rem',
                }}
              >
                <strong>Printing Comics:</strong> {current.reply}
              </div>
            )}
          </blockquote>

          {reviews.length > 1 && (
            <>
              <button
                aria-label="Previous review"
                onClick={() => go(index - 1)}
                className="pc-review-arrow"
                style={{ left: 0 }}
              >
                ‹
              </button>
              <button
                aria-label="Next review"
                onClick={() => go(index + 1)}
                className="pc-review-arrow"
                style={{ right: 0 }}
              >
                ›
              </button>
            </>
          )}
        </div>

        {reviews.length > 1 && (
          <div style={{ display: 'flex', gap: '.4rem', justifyContent: 'center', marginTop: '1.25rem' }}>
            {reviews.map((r, i) => (
              <button
                key={r.id}
                aria-label={`Show review ${i + 1}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                style={{
                  width: i === index ? 22 : 8,
                  height: 8,
                  borderRadius: 4,
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  background: i === index ? 'var(--brand)' : 'var(--border)',
                  transition: 'width .25s, background .25s',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
