/**
 * /admin/pod/payouts — what each publisher is owed, their ledger, and the
 * statements that sweep it up: generate → issue (emails) → mark paid.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HandCoins, Send, Check, Ban, Plus } from 'lucide-react';
import { api } from '../../../api/client';
import { money, dateShort, dateTime, pct, STATEMENT_STATUS, type PodEvent } from '../../../lib/pod';
import { Avatar, Drawer, Empty, Events, Kpi, Pill, TonePill, errText, useFlash, useLoad } from '../../../components/pod/ui';
import { useOverview } from './PodLayout';

interface Summary { grossCents: number; commissionCents: number; printingCents: number; creditsCents: number; adjustmentCents: number; payoutsCents: number; netCents: number; unassignedCents: number }
interface PartnerRow { id: string; name: string; slug: string; contactEmail: string | null; commissionBps: number | null; summary: Summary }
interface Statement { id: string; number: string; status: string; periodStart: string; periodEnd: string; grossCents: number; commissionCents: number; printingCents: number; creditsCents: number; adjustmentCents: number; netCents: number; issuedAt: string | null; paidAt: string | null; paymentMethod: string | null; paymentRef: string | null; notes: string | null; lines: { kind: string; amountCents: number; description: string; title: string | null; catalogKey: string | null; cycle: string | null; at: string }[]; partner: { id: string; name: string; contactEmail?: string | null }; cycle: { id?: string; name: string } | null }
interface Entry { id: string; kind: string; amountCents: number; description: string; createdAt: string; actorName: string | null; listing: { catalogKey: string; title: string } | null; cycle: { name: string } | null; statement: { id: string; number: string; status: string } | null }

export function PodPayouts() {
  const [params, setParams] = useSearchParams();
  const partnerId = params.get('partner');
  const statementId = params.get('statement');
  const { data, reload } = useLoad<{ partners: PartnerRow[]; statements: Statement[]; paymentMethods: { key: string; label: string }[]; kinds: Record<string, string> }>('/admin/pod/payouts');
  const { data: ledger, reload: reloadLedger } = useLoad<{ entries: Entry[]; summary: Summary }>(partnerId ? `/admin/pod/payouts/${partnerId}/ledger` : null, [partnerId]);
  const { data: stDetail, reload: reloadStatement } = useLoad<{ statement: Statement; events: PodEvent[] }>(statementId ? `/admin/pod/payouts/statements/${statementId}` : null, [statementId]);
  const { data: cycles } = useLoad<{ cycles: { id: string; name: string; status: string }[] }>('/admin/pod/cycles');
  const { reloadOverview } = useOverview();
  const { show, node } = useFlash();
  const [busy, setBusy] = useState(false);
  const [adj, setAdj] = useState({ amount: '', description: '' });
  const [gen, setGen] = useState({ cycleId: '', notes: '' });
  const [pay, setPay] = useState({ method: 'bank', reference: '' });
  const [commission, setCommission] = useState('');
  const partner = data?.partners.find((p) => p.id === partnerId) ?? null;
  const all = (data?.partners ?? []).reduce((s, p) => ({ owed: s.owed + p.summary.unassignedCents, gross: s.gross + p.summary.grossCents, paid: s.paid - p.summary.payoutsCents, commission: s.commission - p.summary.commissionCents }), { owed: 0, gross: 0, paid: 0, commission: 0 });
  const refreshAll = async () => { await Promise.all([reload(), reloadLedger(), reloadStatement()]); void reloadOverview(); };
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); show(ok); await refreshAll(); } catch (e) { show(errText(e), true); } finally { setBusy(false); } };
  const s = stDetail?.statement;
  return (
    <>
      {node}
      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <Kpi label="Owed to publishers" value={money(all.owed)} sub="not yet on a statement" tone="hot" />
        <Kpi label="Wholesale sales" value={money(all.gross)} sub="all publishers, all time" />
        <Kpi label="Our commission" value={money(all.commission)} sub="earned on wholesale" />
        <Kpi label="Paid out" value={money(all.paid)} sub={`${data?.statements.filter((x) => x.status === 'PAID').length ?? 0} paid statements`} dark />
      </div>
      <div className="split" style={{ gridTemplateColumns: 'minmax(300px, .8fr) minmax(0, 1.4fr)' }}>
        <div className="panel flush">
          <div className="panel-head" style={{ padding: '1rem 1rem 0' }}><h3>Publishers</h3></div>
          {!data ? <p className="dim" style={{ padding: '1rem' }}>Loading…</p> : data.partners.length === 0 ? <div style={{ padding: '1rem' }}><Empty title="Nothing to pay yet" body="Ledger entries appear when a cycle locks at FOC." /></div> : (
            <table className="ptable"><tbody>{data.partners.map((p) => <tr key={p.id} className="click" onClick={() => setParams({ partner: p.id })} style={partnerId === p.id ? { background: 'rgba(124,92,255,.07)' } : undefined}><td><span className="row" style={{ gap: '.6rem' }}><Avatar name={p.name} /><span><b>{p.name}</b><div className="dim" style={{ fontSize: '.76rem' }}>{p.commissionBps != null ? `${pct(p.commissionBps)} commission` : 'default commission'} · {money(p.summary.grossCents)} sold</div></span></span></td><td className="num mono"><b>{money(p.summary.unassignedCents)}</b><div className="dim" style={{ fontSize: '.74rem' }}>owed</div></td></tr>)}</tbody></table>
          )}
          <div className="panel-head" style={{ padding: '1.25rem 1rem 0' }}><h3>Statements</h3></div>
          {data && data.statements.length === 0 && <p className="dim" style={{ padding: '0 1rem 1rem', fontSize: '.88rem' }}>None yet.</p>}
          {data && data.statements.length > 0 && <table className="ptable"><tbody>{data.statements.map((x) => <tr key={x.id} className="click" onClick={() => setParams({ ...(partnerId ? { partner: partnerId } : {}), statement: x.id })}><td><b>{x.number}</b><div className="dim" style={{ fontSize: '.76rem' }}>{x.partner.name}{x.cycle ? ` · ${x.cycle.name}` : ''}</div></td><td className="num mono">{money(x.netCents)}</td><td><TonePill map={STATEMENT_STATUS} status={x.status} /></td></tr>)}</tbody></table>}
        </div>
        <div className="stack">
          {!partner ? <Empty title="Pick a publisher" body="Their ledger, adjustments and statements appear here." /> : (
            <>
              <div className="panel">
                <div className="between"><div className="row" style={{ gap: '.75rem' }}><Avatar name={partner.name} lg /><div><h3 style={{ margin: 0 }}>{partner.name}</h3><div className="dim" style={{ fontSize: '.84rem' }}>{partner.contactEmail ?? 'no contact email'}</div></div></div>
                  <div className="row"><input className="inp" style={{ width: 110 }} placeholder={`bps (${partner.commissionBps ?? 'default'})`} value={commission} onChange={(e) => setCommission(e.target.value)} /><button className="pbtn soft sm" disabled={busy} onClick={() => void run(() => api.patch(`/admin/pod/publishers/${partner.id}`, { commissionBps: commission === '' ? null : Number(commission) }), 'Commission saved')}>Set commission</button></div></div>
                {ledger && (
                  <div className="grid cols-4" style={{ marginTop: '1rem' }}>
                    <div><div className="eyebrow">Sales</div><div className="display-md mono">{money(ledger.summary.grossCents)}</div></div>
                    <div><div className="eyebrow">Commission</div><div className="display-md mono">{money(ledger.summary.commissionCents)}</div></div>
                    <div><div className="eyebrow">Printing</div><div className="display-md mono">{money(ledger.summary.printingCents)}</div></div>
                    <div><div className="eyebrow">Owed now</div><div className="display-md mono" style={{ color: 'var(--p-violet)' }}>{money(ledger.summary.unassignedCents)}</div></div>
                  </div>
                )}
              </div>
              <div className="grid cols-2">
                <div className="panel accent"><h3><HandCoins size={16} /> Generate a statement</h3><p className="dim" style={{ fontSize: '.84rem', margin: '.25rem 0 .75rem' }}>Sweeps every ledger entry not yet on a statement (optionally one cycle's) into an immutable statement.</p>
                  <div className="field"><label>Cycle (optional)</label><select value={gen.cycleId} onChange={(e) => setGen((x) => ({ ...x, cycleId: e.target.value }))}><option value="">Everything outstanding</option>{(cycles?.cycles ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                  <div className="field" style={{ marginTop: '.5rem' }}><label>Notes on the statement</label><input value={gen.notes} onChange={(e) => setGen((x) => ({ ...x, notes: e.target.value }))} /></div>
                  <button className="pbtn primary sm" style={{ marginTop: '.75rem' }} disabled={busy || !ledger?.summary.unassignedCents} onClick={() => void run(() => api.post('/admin/pod/payouts/statements', { partnerId: partner.id, cycleId: gen.cycleId || null, notes: gen.notes || null }), 'Draft statement created')}><Plus size={14} /> Create draft</button></div>
                <div className="panel"><h3>Adjustment</h3><p className="dim" style={{ fontSize: '.84rem', margin: '.25rem 0 .75rem' }}>Positive adds to what we owe; negative deducts. Goes on the next statement.</p>
                  <div className="field"><label>Amount (USD, +/−)</label><input type="number" step="0.01" value={adj.amount} onChange={(e) => setAdj((x) => ({ ...x, amount: e.target.value }))} /></div>
                  <div className="field" style={{ marginTop: '.5rem' }}><label>Reason</label><input value={adj.description} onChange={(e) => setAdj((x) => ({ ...x, description: e.target.value }))} placeholder="Damaged copies reprinted at our cost" /></div>
                  <button className="pbtn soft sm" style={{ marginTop: '.75rem' }} disabled={busy || !Number(adj.amount) || !adj.description.trim()} onClick={() => void run(() => api.post(`/admin/pod/payouts/${partner.id}/ledger`, { amountCents: Math.round(Number(adj.amount) * 100), description: adj.description }).then(() => setAdj({ amount: '', description: '' })), 'Adjustment added')}>Add adjustment</button></div>
              </div>
              <div className="panel flush"><div className="panel-head" style={{ padding: '1rem 1rem 0' }}><h3>Ledger</h3></div>
                {!ledger ? <p className="dim" style={{ padding: '1rem' }}>Loading…</p> : ledger.entries.length === 0 ? <p className="dim" style={{ padding: '0 1rem 1rem' }}>No entries yet.</p> : (
                  <div className="scroll-x" style={{ maxHeight: 420, overflowY: 'auto' }}><table className="ptable"><thead><tr><th>When</th><th>Kind</th><th>Entry</th><th>Statement</th><th className="num">Amount</th></tr></thead><tbody>
                    {ledger.entries.map((e) => <tr key={e.id}><td className="dim" style={{ whiteSpace: 'nowrap' }}>{dateTime(e.createdAt)}</td><td><Pill tone={e.kind === 'SALE' ? 'green' : e.kind === 'PAYOUT' ? 'violet' : e.kind === 'ADJUSTMENT' ? 'amber' : 'slate'}>{data?.kinds[e.kind] ?? e.kind}</Pill></td><td style={{ fontSize: '.86rem' }}>{e.description}{e.listing && <div className="dim" style={{ fontSize: '.74rem' }}>{e.listing.title} <span className="key">{e.listing.catalogKey}</span></div>}</td><td className="dim" style={{ fontSize: '.8rem' }}>{e.statement ? <button className="pbtn ghost xs" onClick={() => setParams({ partner: partner.id, statement: e.statement!.id })}>{e.statement.number}</button> : e.kind === 'PAYOUT' ? '' : <span style={{ color: 'var(--p-violet)' }}>pending</span>}</td><td className="num mono" style={e.amountCents < 0 ? { color: '#c81e24' } : undefined}>{money(e.amountCents)}</td></tr>)}
                  </tbody></table></div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <Drawer open={Boolean(statementId)} onClose={() => setParams(partnerId ? { partner: partnerId } : {})} title={s ? `Statement ${s.number}` : 'Statement'} width={720}>
        {s && (
          <>
            <div className="row" style={{ marginBottom: '1rem' }}><TonePill map={STATEMENT_STATUS} status={s.status} /><span className="dim">{s.partner.name} · {dateShort(s.periodStart)} – {dateShort(s.periodEnd)}{s.cycle ? ` · ${s.cycle.name}` : ''}</span></div>
            <div className="row" style={{ marginBottom: '1rem' }}>
              {s.status === 'DRAFT' && <button className="pbtn glow sm" disabled={busy} onClick={() => void run(() => api.post(`/admin/pod/payouts/statements/${s.id}/issue`), 'Issued and emailed')}><Send size={14} /> Issue &amp; email</button>}
              {(s.status === 'ISSUED' || s.status === 'DRAFT') && <span className="row"><select className="inp" style={{ width: 'auto' }} value={pay.method} onChange={(e) => setPay((x) => ({ ...x, method: e.target.value }))}>{(data?.paymentMethods ?? []).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select><input className="inp" style={{ width: 160 }} placeholder="Reference" value={pay.reference} onChange={(e) => setPay((x) => ({ ...x, reference: e.target.value }))} /><button className="pbtn primary sm" disabled={busy} onClick={() => void run(() => api.post(`/admin/pod/payouts/statements/${s.id}/mark-paid`, pay), 'Marked paid')}><Check size={14} /> Mark paid</button></span>}
              {s.status !== 'PAID' && s.status !== 'VOID' && <button className="pbtn ghost sm" disabled={busy} onClick={() => { if (confirm('Void this statement and release its ledger entries?')) void run(() => api.post(`/admin/pod/payouts/statements/${s.id}/void`), 'Voided'); }}><Ban size={14} /> Void</button>}
            </div>
            <div className="panel tight" style={{ marginBottom: '1rem' }}>
              <div className="money-row"><span>Wholesale sales</span><b className="mono">{money(s.grossCents)}</b></div>
              <div className="money-row"><span>Commission</span><b className="mono" style={{ color: '#c81e24' }}>{money(s.commissionCents)}</b></div>
              <div className="money-row"><span>Printing</span><b className="mono" style={{ color: '#c81e24' }}>{money(s.printingCents)}</b></div>
              {s.creditsCents !== 0 && <div className="money-row"><span>Return credits</span><b className="mono">{money(s.creditsCents)}</b></div>}
              {s.adjustmentCents !== 0 && <div className="money-row"><span>Adjustments</span><b className="mono">{money(s.adjustmentCents)}</b></div>}
              <div className="money-row total"><span>Net payout</span><b className="mono">{money(s.netCents)}</b></div>
              {s.status === 'PAID' && <p className="dim" style={{ fontSize: '.84rem' }}>Paid {dateShort(s.paidAt)} by {s.paymentMethod}{s.paymentRef ? ` · ${s.paymentRef}` : ''}</p>}
            </div>
            <div className="panel flush" style={{ marginBottom: '1rem' }}><table className="ptable"><thead><tr><th>Date</th><th>Entry</th><th className="num">Amount</th></tr></thead><tbody>{s.lines.map((ln, i) => <tr key={i}><td className="dim" style={{ whiteSpace: 'nowrap' }}>{dateShort(ln.at)}</td><td style={{ fontSize: '.86rem' }}>{ln.description}</td><td className="num mono" style={ln.amountCents < 0 ? { color: '#c81e24' } : undefined}>{money(ln.amountCents)}</td></tr>)}</tbody></table></div>
            <div className="panel"><h3>History</h3><div style={{ marginTop: '.5rem' }}><Events events={stDetail?.events ?? []} /></div></div>
          </>
        )}
      </Drawer>
    </>
  );
}
