/**
 * /admin/pod/preflight — the production-file desk. Jobs, files, automatic
 * checks, approve/reject per file. No prices, no quantities, no money: it is
 * the one Print On Demand screen a prepress contractor can be given alone.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScanLine, Check, XCircle, RefreshCw, FileWarning } from 'lucide-react';
import { api } from '../../../api/client';
import { dateShort, PRODUCTION_STATUS, type PodEvent, type PreflightResult } from '../../../lib/pod';
import { DaysLeft, Drawer, Empty, Events, Kpi, Pill, PreflightReport, TonePill, errText, useFlash, useLoad } from '../../../components/pod/ui';

interface JobFile { id: string | null; kind: string; kindLabel: string; version?: number; reviewStatus?: string; note?: string | null; preflight?: PreflightResult | null; createdAt?: string; media?: { id: string; url: string; originalName: string; size: number }; missing?: boolean }
interface Job { id: string; number: string; status: string; deadline: string | null; notes: string | null; createdAt: string; cycle: { name: string; inStoreDate: string } | null; listing: { id: string; catalogKey: string; title: string; issueNumber: string | null; coverDescription: string | null; format: string; pageCount: number | null; trimWidthIn: number | null; trimHeightIn: number | null; interiorColor: string | null; status: string; publisher: string }; files: JobFile[] }

export function PodPreflight() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const openId = params.get('open');
  const { data, reload } = useLoad<{ jobs: Job[]; counts: Record<string, number> }>(`/admin/pod/preflight?status=${status}`, [status]);
  const { data: detail, reload: reloadDetail } = useLoad<{ job: Job; events: PodEvent[] }>(openId ? `/admin/pod/preflight/${openId}` : null, [openId]);
  const { show, node } = useFlash();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [mine, setMine] = useState(false);
  const { data: myActivity } = useLoad<{ events: PodEvent[] }>(mine ? '/admin/pod/preflight/me/activity' : null, [mine]);
  const counts = data?.counts ?? {};
  const job = detail?.job ?? data?.jobs.find((j) => j.id === openId) ?? null;
  const act = async (path: string, body?: unknown) => { setBusy(path); try { await api.post(`/admin/pod/preflight/${job!.id}/${path}`, body); show('Done'); await Promise.all([reload(), reloadDetail()]); } catch (e) { show(errText(e), true); } finally { setBusy(null); } };
  const problems = (j: Job) => j.files.filter((f) => f.missing || f.reviewStatus === 'rejected' || f.preflight?.status === 'changes_required').length;
  return (
    <>
      {node}
      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <Kpi label="Jobs waiting" value={(counts.FILES_NEEDED ?? 0) + (counts.PREFLIGHT ?? 0)} sub="files to check" tone="hot" />
        <Kpi label="Need files" value={counts.FILES_NEEDED ?? 0} sub="missing or rejected" />
        <Kpi label="Approved for press" value={counts.APPROVED ?? 0} sub="both files signed off" />
        <Kpi label="Done" value={counts.DONE ?? 0} sub="all time" dark />
      </div>
      <div className="toolbar"><div><h2 className="display-md" style={{ margin: 0 }}><ScanLine size={22} style={{ verticalAlign: '-4px' }} /> Preflight desk</h2><div className="dim" style={{ fontSize: '.88rem' }}>Open a job, read the automatic checks, open the PDFs, approve or reject each file. Both approved → the job is cleared for press.</div></div>
        <div className="row"><div className="seg"><button className={status === 'open' ? 'on' : ''} onClick={() => setParams({ status: 'open' })}>Open</button><button className={status === 'APPROVED' ? 'on' : ''} onClick={() => setParams({ status: 'APPROVED' })}>Approved</button><button className={status === 'all' ? 'on' : ''} onClick={() => setParams({ status: 'all' })}>All</button></div><button className={`pbtn ${mine ? 'primary' : 'ghost'} sm`} onClick={() => setMine(!mine)}>My activity</button></div></div>
      {mine && <div className="panel" style={{ marginBottom: '1rem' }}><div className="panel-head"><h3>My activity</h3></div><Events events={myActivity?.events ?? []} /></div>}
      <div className="panel flush scroll-x">
        {!data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : data.jobs.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="Nothing to check" body="Jobs arrive when a catalog locks at FOC or staff raise a run." /></div> : (
          <table className="ptable"><thead><tr><th>Job</th><th>Title</th><th>Publisher</th><th>Spec</th><th>Cover</th><th>Interior</th><th>Deadline</th><th>Status</th></tr></thead><tbody>
            {data.jobs.map((j) => {
              const cell = (f: JobFile | undefined) => !f || f.missing ? <Pill tone="rose">missing</Pill> : f.reviewStatus === 'approved' ? <Pill tone="green">approved</Pill> : f.reviewStatus === 'rejected' || f.preflight?.status === 'changes_required' ? <Pill tone="red">{f.preflight?.failed ? `${f.preflight.failed} fail` : 'rejected'}</Pill> : <Pill tone="amber">check</Pill>;
              return (
                <tr key={j.id} className="click" onClick={() => setParams({ status, open: j.id })}>
                  <td><b>{j.number}</b>{problems(j) > 0 && <FileWarning size={14} style={{ color: '#c81e24', marginLeft: '.4rem', verticalAlign: '-2px' }} />}</td>
                  <td>{j.listing.title}{j.listing.issueNumber ? ` #${j.listing.issueNumber}` : ''}<div className="dim" style={{ fontSize: '.76rem' }}><span className="key">{j.listing.catalogKey}</span>{j.listing.coverDescription ? ` · ${j.listing.coverDescription}` : ''}</div></td>
                  <td>{j.listing.publisher}</td>
                  <td className="dim" style={{ fontSize: '.84rem' }}>{j.listing.pageCount}pp · {j.listing.trimWidthIn}×{j.listing.trimHeightIn}" · {j.listing.interiorColor === 'bw' ? 'B&W' : 'color'}</td>
                  <td>{cell(j.files.find((f) => f.kind === 'cover'))}</td><td>{cell(j.files.find((f) => f.kind === 'interior'))}</td>
                  <td>{dateShort(j.deadline)} <DaysLeft to={j.deadline} /></td><td><TonePill map={PRODUCTION_STATUS} status={j.status} /></td>
                </tr>
              );
            })}
          </tbody></table>
        )}
      </div>
      <Drawer open={Boolean(job)} onClose={() => setParams({ status })} title={job?.number ?? ''} width={760}>
        {job && (
          <>
            <div className="row" style={{ marginBottom: '1rem' }}><TonePill map={PRODUCTION_STATUS} status={job.status} /><span className="dim">{job.listing.title}{job.listing.issueNumber ? ` #${job.listing.issueNumber}` : ''} · {job.listing.publisher}{job.cycle ? ` · ${job.cycle.name}` : ''}{job.deadline ? ` · due ${dateShort(job.deadline)}` : ''}</span></div>
            <dl className="spec panel tight" style={{ marginBottom: '1rem' }}><dt>Trim</dt><dd>{job.listing.trimWidthIn} × {job.listing.trimHeightIn} in (+0.125" bleed each side)</dd><dt>Pages</dt><dd>{job.listing.pageCount} interior</dd><dt>Interior</dt><dd>{job.listing.interiorColor === 'bw' ? 'Black & white' : 'Full color'}</dd><dt>Format</dt><dd>{job.listing.format}</dd>{job.notes && <><dt>Notes</dt><dd>{job.notes}</dd></>}</dl>
            {job.files.map((f) => (
              <div key={f.kind} className="panel tight" style={{ marginBottom: '.75rem' }}>
                <div className="between"><b>{f.kindLabel}</b>{f.missing ? <Pill tone="rose">Missing — publisher must upload</Pill> : <Pill tone={f.reviewStatus === 'approved' ? 'green' : f.reviewStatus === 'rejected' ? 'red' : 'amber'}>{f.reviewStatus} · v{f.version}</Pill>}</div>
                {!f.missing && f.media && (
                  <>
                    <div className="row" style={{ margin: '.5rem 0', justifyContent: 'space-between' }}><a href={f.media.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }} onClick={() => void api.post(`/admin/pod/preflight/${job.id}/files/${f.id}/opened`).catch(() => undefined)}>{f.media.originalName}</a><span className="dim" style={{ fontSize: '.8rem' }}>{(f.media.size / 1048576).toFixed(1)} MB · uploaded {dateShort(f.createdAt)}</span></div>
                    {f.note && <div className="notice warn" style={{ marginBottom: '.5rem', padding: '.5rem .75rem' }}>{f.note}</div>}
                    <PreflightReport result={f.preflight ?? null} />
                    <div className="row" style={{ marginTop: '.6rem' }}>
                      {f.reviewStatus !== 'approved' && <button className="pbtn glow xs" disabled={busy !== null} onClick={() => void act(`files/${f.id}/review`, { status: 'approved' })}><Check size={12} /> Approve file</button>}
                      {f.reviewStatus !== 'rejected' && <button className="pbtn danger xs" disabled={busy !== null} onClick={() => { const n = window.prompt('What must the publisher fix? (they see this note)'); if (n !== null) void act(`files/${f.id}/review`, { status: 'rejected', note: n }); }}><XCircle size={12} /> Reject file</button>}
                      <button className="pbtn ghost xs" disabled={busy !== null} onClick={() => void act(`files/${f.id}/preflight`)}><RefreshCw size={12} /> Re-run checks</button>
                    </div>
                  </>
                )}
              </div>
            ))}
            <div className="panel" style={{ marginBottom: '1rem' }}><h3>Team note</h3><p className="dim" style={{ fontSize: '.82rem', margin: '.25rem 0 .5rem' }}>For everyone working on this file: what you checked, what to watch.</p><textarea className="inp" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /><button className="pbtn soft sm" style={{ marginTop: '.5rem' }} disabled={!note.trim() || busy !== null} onClick={() => { const text = note; setNote(''); void act('notes', { text }); }}>Add note</button></div>
            <div className="panel"><h3>History</h3><div style={{ marginTop: '.5rem' }}><Events events={detail?.events ?? []} /></div></div>
          </>
        )}
      </Drawer>
    </>
  );
}
