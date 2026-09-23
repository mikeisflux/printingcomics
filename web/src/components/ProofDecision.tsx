import { useState } from 'react';
import { PdfPreview } from './PdfPreview';

/**
 * One proof: the rendered pages, the staff note, and the customer's decision
 * (approve with name + terms, or request changes). Used on the account
 * Proofs page and the order page, and by the older emailed-link page — each
 * passes its own `approve` / `requestChanges` calls.
 */

export interface DecisionProof {
  id: string;
  version: number;
  status: 'pending' | 'approved' | 'changes_requested' | string;
  kindLabel?: string | null;
  slotLabel?: string | null;
  itemTitle?: string | null;
  itemName?: string | null;
  message: string | null;
  decisionNote: string | null;
  approvedName: string | null;
  decidedAt: string | null;
  mediaId: string;
  fileUrl: string;
  fileName: string;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const GREEN_CARD = { background: '#d4f5dc', border: '1px solid #166534' } as const;

export function ProofDecision({
  proof, terms, token, approve, requestChanges, compact = false, onDecided,
}: {
  proof: DecisionProof;
  terms: string;
  /** Emailed-link review: the token that authorises the preview. Signed-in users pass none. */
  token?: string;
  approve: (name: string) => Promise<unknown>;
  requestChanges: (note: string) => Promise<unknown>;
  /** Smaller preview, for lists of several proofs. */
  compact?: boolean;
  onDecided?: (outcome: 'approved' | 'changes') => void;
}) {
  const [outcome, setOutcome] = useState<'approved' | 'changes' | null>(null);
  const [name, setName] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [changesBusy, setChangesBusy] = useState(false);
  const [changesError, setChangesError] = useState<string | null>(null);
  const [showChanges, setShowChanges] = useState(false);

  const showApproved = outcome === 'approved' || proof.status === 'approved';
  const showChangesRequested = outcome === 'changes' || proof.status === 'changes_requested';
  const showPending = proof.status === 'pending' && outcome === null;
  const approverName = proof.approvedName ?? (outcome === 'approved' && name.trim() !== '' ? name.trim() : null);
  const approvedAt = proof.decidedAt ?? (outcome === 'approved' ? new Date().toISOString() : null);
  const changeSummary = outcome === 'changes' ? note.trim() : proof.decisionNote;

  async function doApprove() {
    setApproveError(null); setApproveBusy(true);
    try { await approve(name.trim()); setOutcome('approved'); onDecided?.('approved'); }
    catch (e) { setApproveError(e instanceof Error ? e.message : 'Could not approve the proof. Please try again.'); }
    finally { setApproveBusy(false); }
  }
  async function doChanges() {
    setChangesError(null); setChangesBusy(true);
    try { await requestChanges(note.trim()); setOutcome('changes'); onDecided?.('changes'); }
    catch (e) { setChangesError(e instanceof Error ? e.message : 'Could not send your request. Please try again.'); }
    finally { setChangesBusy(false); }
  }

  return (
    <div>
      {proof.message && (
        <div className="admin-card" style={{ background: 'var(--bg-alt)' }}>
          <div className="muted" style={{ fontSize: '.75rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.03em' }}>A note from our team</div>
          <p style={{ margin: '.35rem 0 0', whiteSpace: 'pre-wrap' }}>{proof.message}</p>
        </div>
      )}

      {/* Pages rendered on the server — browser PDF viewers show print PDFs as black. */}
      <div className="admin-card">
        <PdfPreview mediaId={proof.mediaId} token={token} fileUrl={proof.fileUrl} fileName={proof.fileName} maxHeight={compact ? 520 : 760} />
      </div>

      {showApproved && (
        <div className="admin-card" style={GREEN_CARD}>
          <div className="row" style={{ gap: '.6rem', alignItems: 'flex-start' }}>
            <span aria-hidden style={{ fontSize: '1.5rem', lineHeight: 1 }}>✓</span>
            <h3 style={{ margin: 0, color: '#166534' }}>{outcome === 'approved' ? 'Approved — thank you!' : 'This proof has been approved'}</h3>
          </div>
          {(approverName || approvedAt) && (
            <p style={{ margin: '.6rem 0 0' }}>
              {approverName && <>Approved by <strong>{approverName}</strong></>}
              {approverName && approvedAt ? ' ' : null}
              {approvedAt && <>on {formatDateTime(approvedAt)}</>}.
            </p>
          )}
        </div>
      )}

      {showChangesRequested && (
        <div className="admin-card" style={{ borderLeft: '4px solid var(--brand)' }}>
          <h3 style={{ marginTop: 0 }}>{outcome === 'changes' ? "Thanks — we'll revise this proof and post a new version here." : "Changes requested — we're revising this proof"}</h3>
          {changeSummary && (
            <>
              <div className="muted" style={{ fontSize: '.75rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.03em' }}>Your requested changes</div>
              <p style={{ margin: '.35rem 0 0', whiteSpace: 'pre-wrap' }}>{changeSummary}</p>
            </>
          )}
        </div>
      )}

      {showPending && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="admin-card" style={{ margin: 0 }}>
            <h3 style={{ marginTop: 0 }}>Approve this proof</h3>
            <p className="muted" style={{ marginTop: 0 }}>Look at every page. Once you approve, it prints exactly as shown.</p>
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-alt)', padding: '1rem', maxHeight: 180, overflowY: 'auto', fontSize: '.85rem', whiteSpace: 'pre-wrap' }}>
              {terms}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void doApprove(); }}>
              <label style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', fontWeight: 500, marginTop: '.75rem' }}>
                <input type="checkbox" required checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} style={{ width: 'auto', marginTop: '.25rem' }} />
                <span>I have reviewed the proof and accept these terms</span>
              </label>
              <label htmlFor={`approver-${proof.id}`}>Your full name</label>
              <input id={`approver-${proof.id}`} type="text" required value={name} placeholder="e.g. Jane Doe" onChange={(e) => setName(e.target.value)} />
              {approveError && <div className="error">{approveError}</div>}
              <div className="row" style={{ gap: '.6rem', marginTop: '.75rem', flexWrap: 'wrap' }}>
                <button className="btn" type="submit" disabled={approveBusy || !acceptTerms || name.trim() === ''}>
                  {approveBusy ? 'Approving…' : 'Approve proof'}
                </button>
                <button className="btn secondary" type="button" onClick={() => setShowChanges((v) => !v)}>
                  {showChanges ? 'Never mind' : 'Something needs changing'}
                </button>
              </div>
            </form>
          </div>

          {showChanges && (
            <div className="admin-card" style={{ margin: 0 }}>
              <h3 style={{ marginTop: 0 }}>What should we change?</h3>
              <form onSubmit={(e) => { e.preventDefault(); void doChanges(); }}>
                <textarea id={`change-${proof.id}`} required rows={4} value={note} placeholder="Describe the changes you'd like…" onChange={(e) => setNote(e.target.value)} />
                {changesError && <div className="error">{changesError}</div>}
                <button className="btn secondary" type="submit" style={{ marginTop: '.75rem' }} disabled={changesBusy || note.trim() === ''}>
                  {changesBusy ? 'Sending…' : 'Request changes'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
