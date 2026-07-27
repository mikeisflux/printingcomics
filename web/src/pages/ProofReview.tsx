import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';

interface ProofItem {
  name: string;
  quantity: number;
}

interface Proof {
  id: string;
  version: number;
  status: 'pending' | 'approved' | 'changes_requested';
  kind?: string | null;
  kindLabel?: string | null;
  itemName?: string | null;
  message: string | null;
  decisionNote: string | null;
  approvedName: string | null;
  decidedAt: string | null;
  fileUrl: string;
  fileName: string;
}

interface ProofOrder {
  number: string;
  items: ProofItem[];
}

interface ProofResponse {
  proof: Proof;
  order: ProofOrder;
  terms: string;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const PAGE_STYLE = { padding: '2rem 0', maxWidth: 760 } as const;
const GREEN_CARD = { background: '#d4f5dc', border: '1px solid #166534' } as const;

export function ProofReview() {
  const { token } = useParams();

  const [data, setData] = useState<ProofResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // What the customer did during this session on a pending proof.
  const [outcome, setOutcome] = useState<'approved' | 'changes' | null>(null);

  // Approve panel state
  const [name, setName] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Request-changes panel state
  const [note, setNote] = useState('');
  const [changesBusy, setChangesBusy] = useState(false);
  const [changesError, setChangesError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    let active = true;
    setLoading(true);
    api
      .get<ProofResponse>(`/proofing/proof/${token}`)
      .then((r) => {
        if (!active) return;
        setData(r);
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 404) {
          setNotFound(true);
        } else {
          setLoadError(e instanceof Error ? e.message : 'Could not load your proof.');
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function approve() {
    if (!token) return;
    setApproveError(null);
    setApproveBusy(true);
    try {
      await api.post<{ ok: true }>(`/proofing/proof/${token}/approve`, {
        name: name.trim(),
        acceptTerms: true,
      });
      setOutcome('approved');
    } catch (e) {
      setApproveError(e instanceof Error ? e.message : 'Could not approve the proof. Please try again.');
    } finally {
      setApproveBusy(false);
    }
  }

  async function requestChanges() {
    if (!token) return;
    setChangesError(null);
    setChangesBusy(true);
    try {
      await api.post<{ ok: true }>(`/proofing/proof/${token}/changes`, {
        note: note.trim(),
      });
      setOutcome('changes');
    } catch (e) {
      setChangesError(e instanceof Error ? e.message : 'Could not send your request. Please try again.');
    } finally {
      setChangesBusy(false);
    }
  }

  if (loading) {
    return <div className="container" style={PAGE_STYLE}>Loading your proof…</div>;
  }

  if (notFound) {
    return (
      <div className="container" style={PAGE_STYLE}>
        <h1>We couldn't find that proof</h1>
        <p className="muted">
          This proofing link may have expired or already been used. If you think this is a
          mistake, just reply to the email we sent you and we'll get you a fresh link.
        </p>
        <Link to="/" className="btn secondary">Back to home</Link>
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

  const showApproved = outcome === 'approved' || proof.status === 'approved';
  const showChangesRequested = outcome === 'changes' || proof.status === 'changes_requested';
  const showPending = proof.status === 'pending' && outcome === null;

  const approverName =
    proof.approvedName ?? (outcome === 'approved' && name.trim() !== '' ? name.trim() : null);
  const approvedAt = proof.decidedAt ?? (outcome === 'approved' ? new Date().toISOString() : null);
  const changeSummary = outcome === 'changes' ? note.trim() : proof.decisionNote;

  return (
    <div className="container" style={PAGE_STYLE}>
      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '.75rem' }}>
        <h1 style={{ margin: 0 }}>{proof.kindLabel ?? 'Proof'} for order {order.number}</h1>
        <span
          className="badge"
          style={{ background: 'var(--brand)', color: '#fff', fontSize: '.8rem', padding: '.3rem .6rem' }}
        >
          {proof.kindLabel ?? 'Proof'} v{proof.version}
        </span>
      </div>
      {proof.itemName && (
        <p className="muted" style={{ margin: '.35rem 0 0', fontWeight: 600 }}>
          Item: {proof.itemName}
        </p>
      )}

      {/* Reassurance notice */}
      <div
        style={{
          margin: '1.25rem 0',
          padding: '1rem 1.25rem',
          background: 'var(--bg-alt)',
          border: '1px solid var(--border)',
          borderLeft: '4px solid var(--brand)',
          borderRadius: 'var(--radius)',
          fontWeight: 700,
          fontSize: '1.05rem',
        }}
      >
        Nothing goes to print until you approve this proof.
      </div>

      {/* Staff note */}
      {proof.message && (
        <div className="admin-card" style={{ background: 'var(--bg-alt)' }}>
          <div
            className="muted"
            style={{ fontSize: '.75rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.03em' }}
          >
            A note from our team
          </div>
          <p style={{ margin: '.35rem 0 0', whiteSpace: 'pre-wrap' }}>{proof.message}</p>
        </div>
      )}

      {/* PDF preview */}
      <div className="admin-card">
        <iframe
          src={proof.fileUrl}
          title="Your proof"
          style={{
            width: '100%',
            height: 600,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}
        />
        <div className="row" style={{ marginTop: '.85rem', flexWrap: 'wrap' }}>
          <a className="btn secondary" href={proof.fileUrl} target="_blank" rel="noopener noreferrer">
            Open the proof in a new tab
          </a>
          <a className="btn secondary" href={proof.fileUrl} download={proof.fileName}>
            Download proof
          </a>
        </div>
      </div>

      {/* Order items */}
      <div className="admin-card">
        <h3 style={{ marginTop: 0 }}>What's in this order</h3>
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {order.items.map((it, i) => (
            <li key={i}>
              {it.name} <span className="muted">× {it.quantity}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Approved confirmation */}
      {showApproved && (
        <div className="admin-card" style={GREEN_CARD}>
          <div className="row" style={{ gap: '.6rem', alignItems: 'flex-start' }}>
            <span aria-hidden style={{ fontSize: '1.5rem', lineHeight: 1 }}>✓</span>
            <h3 style={{ margin: 0, color: '#166534' }}>
              {outcome === 'approved'
                ? 'Proof approved — thank you! Your order is cleared for production.'
                : 'This proof has been approved'}
            </h3>
          </div>
          {(approverName || approvedAt) && (
            <p style={{ margin: '.6rem 0 0' }}>
              {approverName && <>Approved by <strong>{approverName}</strong></>}
              {approverName && approvedAt ? ' ' : null}
              {approvedAt && <>on {formatDateTime(approvedAt)}</>}.
            </p>
          )}
          {outcome === 'approved' && (
            <p className="muted" style={{ margin: '.5rem 0 0' }}>
              We'll be in touch as your order moves into production.
            </p>
          )}
        </div>
      )}

      {/* Changes requested */}
      {showChangesRequested && (
        <div className="admin-card" style={{ borderLeft: '4px solid var(--brand)' }}>
          <h3 style={{ marginTop: 0 }}>
            {outcome === 'changes'
              ? "Thanks — we'll revise your proof and send a new version."
              : "Changes requested — we're revising your proof"}
          </h3>
          {changeSummary && (
            <>
              <div
                className="muted"
                style={{ fontSize: '.75rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.03em' }}
              >
                Your requested changes
              </div>
              <p style={{ margin: '.35rem 0 0', whiteSpace: 'pre-wrap' }}>{changeSummary}</p>
            </>
          )}
        </div>
      )}

      {/* Decision panels (only while pending) */}
      {showPending && (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {/* Approve */}
          <div className="admin-card" style={{ margin: 0 }}>
            <h2 style={{ marginTop: 0 }}>Approve this proof</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Please review every page carefully. Once you approve, your order goes to print exactly
              as shown here.
            </p>

            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-alt)',
                padding: '1rem',
                maxHeight: 260,
                overflowY: 'auto',
                fontSize: '.9rem',
                whiteSpace: 'pre-wrap',
              }}
            >
              {terms}
            </div>

            <p style={{ fontWeight: 700, margin: '1rem 0 0' }}>
              Backed by our 100% Damage Replacement Guarantee.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void approve();
              }}
            >
              <label style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', fontWeight: 500 }}>
                <input
                  type="checkbox"
                  required
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  style={{ width: 'auto', marginTop: '.25rem' }}
                />
                <span>I have reviewed the proof and accept these terms</span>
              </label>

              <label htmlFor="approver-name">Your full name</label>
              <input
                id="approver-name"
                type="text"
                required
                value={name}
                placeholder="e.g. Jane Doe"
                onChange={(e) => setName(e.target.value)}
              />

              {approveError && <div className="error">{approveError}</div>}

              <button
                className="btn"
                type="submit"
                style={{ marginTop: '1rem' }}
                disabled={approveBusy || !acceptTerms || name.trim() === ''}
              >
                {approveBusy ? 'Approving…' : 'Approve proof'}
              </button>
            </form>
          </div>

          {/* Request changes */}
          <div className="admin-card" style={{ margin: 0 }}>
            <h2 style={{ marginTop: 0 }}>Need changes?</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Tell us what to fix and we'll revise your proof — nothing prints until you're happy
              with it.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void requestChanges();
              }}
            >
              <label htmlFor="change-note">What would you like us to change?</label>
              <textarea
                id="change-note"
                required
                rows={5}
                value={note}
                placeholder="Describe the changes you'd like…"
                onChange={(e) => setNote(e.target.value)}
              />

              {changesError && <div className="error">{changesError}</div>}

              <button
                className="btn secondary"
                type="submit"
                style={{ marginTop: '1rem' }}
                disabled={changesBusy || note.trim() === ''}
              >
                {changesBusy ? 'Sending…' : 'Request changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      <p className="muted" style={{ marginTop: '1.5rem', fontSize: '.85rem' }}>
        Questions about your proof? Just reply to the email we sent you and we'll help.
      </p>
    </div>
  );
}
