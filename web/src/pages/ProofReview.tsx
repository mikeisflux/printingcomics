import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { ProofDecision, type DecisionProof } from '../components/ProofDecision';
import { useAuth } from '../store/auth';

/**
 * The page behind the older per-proof email links (/proof/<token>). It still
 * works — nobody's saved email should dead-end — but reviewing now lives in
 * the account, where every proof for an order sits together, and this page
 * says so.
 */

interface ProofResponse {
  proof: DecisionProof & { kind?: string | null; token?: string };
  order: { number: string; items: { name: string; quantity: number }[] };
  terms: string;
}

const PAGE_STYLE = { padding: '2rem 0', maxWidth: 760 } as const;

export function ProofReview() {
  const { token } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState<ProofResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); setNotFound(true); return; }
    let active = true;
    setLoading(true);
    api.get<ProofResponse>(`/proofing/proof/${token}`)
      .then((r) => { if (active) { setData(r); setLoading(false); } })
      .catch((e) => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setLoadError(e instanceof Error ? e.message : 'Could not load your proof.');
        setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  if (loading) return <div className="container" style={PAGE_STYLE}>Loading your proof…</div>;

  if (notFound) {
    return (
      <div className="container" style={PAGE_STYLE}>
        <h1>We couldn't find that proof</h1>
        <p className="muted">
          This link may have expired. Every proof for your orders is in your account — sign in with the email you ordered with.
        </p>
        <Link to="/login?redirect=/account/proofs" className="btn">Go to my proofs</Link>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="container" style={PAGE_STYLE}>
        <div className="error">{loadError ?? 'Something went wrong loading your proof.'}</div>
        <Link to="/" className="btn secondary">Back to home</Link>
      </div>
    );
  }

  const { proof, order, terms } = data;

  return (
    <div className="container" style={PAGE_STYLE}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '.75rem' }}>
        <h1 style={{ margin: 0 }}>{proof.kindLabel ?? 'Proof'} for order {order.number}</h1>
        <span className="badge" style={{ background: 'var(--brand)', color: '#fff', fontSize: '.8rem', padding: '.3rem .6rem' }}>
          {proof.kindLabel ?? 'Proof'} v{proof.version}
        </span>
      </div>
      {(proof.slotLabel ?? proof.itemName) && (
        <p className="muted" style={{ margin: '.35rem 0 0', fontWeight: 600 }}>{proof.slotLabel ?? `Item: ${proof.itemName}`}</p>
      )}

      <div style={{ margin: '1.25rem 0', padding: '1rem 1.25rem', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderLeft: '4px solid var(--brand)', borderRadius: 'var(--radius)' }}>
        <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Nothing goes to print until you approve every proof on this order.</div>
        <div className="muted" style={{ marginTop: '.35rem', fontSize: '.9rem' }}>
          All of this order's proofs are together in your account —{' '}
          <Link to={user ? `/account/proofs?order=${encodeURIComponent(order.number)}` : `/login?redirect=${encodeURIComponent(`/account/proofs?order=${order.number}`)}`}>
            review them there
          </Link>{' '}
          and you'll never have to hunt through emails.
        </div>
      </div>

      <ProofDecision
        proof={proof}
        terms={terms}
        token={token}
        approve={(name) => api.post(`/proofing/proof/${token}/approve`, { name, acceptTerms: true })}
        requestChanges={(note) => api.post(`/proofing/proof/${token}/changes`, { note })}
      />

      <div className="admin-card">
        <h3 style={{ marginTop: 0 }}>What's in this order</h3>
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {order.items.map((it, i) => <li key={i}>{it.name} <span className="muted">× {it.quantity}</span></li>)}
        </ul>
      </div>

      <p className="muted" style={{ marginTop: '1.5rem', fontSize: '.85rem' }}>
        Questions about your proof? Reply to the email we sent you and we'll help.
      </p>
    </div>
  );
}
