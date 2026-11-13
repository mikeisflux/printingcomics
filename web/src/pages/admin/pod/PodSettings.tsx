/**
 * /admin/pod/settings — the programme's rules: tiers, commissions, retailer
 * shipping and minimum, page-count rules, the words on the public page.
 */
import { useEffect, useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { api } from '../../../api/client';
import { money } from '../../../lib/pod';
import { TierLadder, errText, useFlash, useLoad } from '../../../components/pod/ui';

interface Settings {
  enabled: boolean; programName: string; intro: string; tiers: { name: string; minCents: number; discountBps: number }[]; commissionBpsPrintedByUs: number; commissionBpsPartnerShips: number; commissionBpsConsignment: number; returnAllowanceByTier: number[]; publishersSelfAssignBarcodes: boolean; retailerMinOrderCents: number;
  retailerShipping: { mode: 'billed_later' | 'flat'; flatCents: number }; retailerTerms: string; publisherTerms: string; notifyEmail: string; pageCountStep: number; minPageCount: number; maxPageCount: number;
}

export function PodSettings() {
  const { data, reload } = useLoad<{ settings: Settings }>('/admin/pod/settings');
  const { show, node } = useFlash();
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setS(data.settings); }, [data]);
  if (!s) return <p className="dim">Loading…</p>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const tier = (i: number, patch: Partial<Settings['tiers'][number]>) => set('tiers', s.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const save = async () => { setBusy(true); try { await api.put('/admin/pod/settings', { settings: s }); show('Settings saved'); await reload(); } catch (e) { show(errText(e), true); } finally { setBusy(false); } };
  const dollars = (c: number) => (c / 100).toFixed(2);
  return (
    <>
      {node}
      <div className="toolbar"><div><h2 className="display-md" style={{ margin: 0 }}>Programme settings</h2><div className="dim" style={{ fontSize: '.88rem' }}>Tiers and commissions apply to new orders and new FOC locks; nothing already locked changes.</div></div><button className="pbtn primary" disabled={busy} onClick={() => void save()}><Save size={16} /> {busy ? 'Saving…' : 'Save settings'}</button></div>
      <div className="split">
        <div className="stack">
          <div className="panel">
            <div className="panel-head"><h3>Retailer tiers</h3><button className="pbtn soft xs" onClick={() => set('tiers', [...s.tiers, { name: `Tier ${s.tiers.length + 1}`, minCents: (s.tiers[s.tiers.length - 1]?.minCents ?? 0) + 15000, discountBps: Math.min(9000, (s.tiers[s.tiers.length - 1]?.discountBps ?? 4000) + 500) }])}><Plus size={12} /> Add tier</button></div>
            <p className="dim" style={{ fontSize: '.86rem', marginTop: 0 }}>The tier is picked by the order's total at cover price. Every line gets the same discount off cover.</p>
            <table className="ptable"><thead><tr><th>Name</th><th>From (order at cover, $)</th><th>Discount %</th><th></th></tr></thead><tbody>
              {s.tiers.map((t, i) => <tr key={i}><td><input className="inp" value={t.name} onChange={(e) => tier(i, { name: e.target.value })} /></td><td><input className="inp mono" type="number" step="1" min={0} value={dollars(t.minCents)} onChange={(e) => tier(i, { minCents: Math.round(Number(e.target.value) * 100) })} /></td><td><input className="inp mono" type="number" step="0.5" min={0} max={99} value={t.discountBps / 100} onChange={(e) => tier(i, { discountBps: Math.round(Number(e.target.value) * 100) })} /></td><td><button className="pbtn ghost xs" disabled={s.tiers.length <= 1} onClick={() => set('tiers', s.tiers.filter((_, j) => j !== i))}><Trash2 size={12} /></button></td></tr>)}
            </tbody></table>
            <div style={{ marginTop: '1rem' }}><TierLadder tiers={[...s.tiers].sort((a, b) => a.minCents - b.minCents)} /></div>
          </div>
          <div className="grid cols-2">
            <div className="panel"><h3>Commission</h3><p className="dim" style={{ fontSize: '.84rem', marginTop: 0 }}>Our share of wholesale, in percent. A publisher can have its own rate (Payouts → Set commission).</p>
              <div className="field"><label>When we print &amp; ship</label><div className="row"><input className="inp mono" type="number" step="0.5" min={0} max={99} style={{ width: 100 }} value={s.commissionBpsPrintedByUs / 100} onChange={(e) => set('commissionBpsPrintedByUs', Math.round(Number(e.target.value) * 100))} /><span>%</span></div><span className="hint">Printing is charged on top, per copy, at our public price.</span></div>
              <div className="field" style={{ marginTop: '.75rem' }}><label>When the publisher ships</label><div className="row"><input className="inp mono" type="number" step="0.5" min={0} max={99} style={{ width: 100 }} value={s.commissionBpsPartnerShips / 100} onChange={(e) => set('commissionBpsPartnerShips', Math.round(Number(e.target.value) * 100))} /><span>%</span></div></div>
              <div className="field" style={{ marginTop: '.75rem' }}><label>Consignment (we ship from their stock)</label><div className="row"><input className="inp mono" type="number" step="0.5" min={0} max={99} style={{ width: 100 }} value={s.commissionBpsConsignment / 100} onChange={(e) => set('commissionBpsConsignment', Math.round(Number(e.target.value) * 100))} /><span>%</span></div><span className="hint">Covers receiving, storage, shortages and handling.</span></div></div>
            <div className="panel"><h3>Returns &amp; barcodes</h3>
              <div className="field"><label>Return allowance per order, copies, by tier</label><div className="row">{s.tiers.map((t, i) => <span key={t.name} className="row" style={{ gap: '.3rem' }}><span className="dim" style={{ fontSize: '.8rem' }}>{t.name}</span><input className="inp mono" type="number" min={0} style={{ width: 70 }} value={s.returnAllowanceByTier[i] ?? 0} onChange={(e) => { const a = [...s.returnAllowanceByTier]; a[i] = Number(e.target.value); set('returnAllowanceByTier', a); }} /></span>)}</div><span className="hint">Unsold returns a shop may claim on one order. Damage claims are not limited.</span></div>
              <label className="switch" style={{ marginTop: '.9rem' }}><input type="checkbox" checked={s.publishersSelfAssignBarcodes} onChange={(e) => set('publishersSelfAssignBarcodes', e.target.checked)} /> Publishers may take a barcode from the shared pool themselves</label></div>
            <div className="panel"><h3>Retailer orders</h3>
              <div className="field"><label>Minimum order (at cover, $; 0 = none)</label><input className="inp mono" type="number" step="1" min={0} value={dollars(s.retailerMinOrderCents)} onChange={(e) => set('retailerMinOrderCents', Math.round(Number(e.target.value) * 100))} /></div>
              <div className="field" style={{ marginTop: '.75rem' }}><label>Shipping</label><div className="seg"><button className={s.retailerShipping.mode === 'billed_later' ? 'on' : ''} onClick={() => set('retailerShipping', { ...s.retailerShipping, mode: 'billed_later' })}>Billed at cost when shipped</button><button className={s.retailerShipping.mode === 'flat' ? 'on' : ''} onClick={() => set('retailerShipping', { ...s.retailerShipping, mode: 'flat' })}>Flat per order</button></div>{s.retailerShipping.mode === 'flat' && <div className="row" style={{ marginTop: '.5rem' }}><span>$</span><input className="inp mono" type="number" step="0.01" min={0} style={{ width: 120 }} value={dollars(s.retailerShipping.flatCents)} onChange={(e) => set('retailerShipping', { ...s.retailerShipping, flatCents: Math.round(Number(e.target.value) * 100) })} /></div>}<span className="hint">Billed-at-cost orders are placed with $0 shipping; add the real cost as an order adjustment when it ships.</span></div></div>
            <div className="panel"><h3>Page counts</h3><p className="dim" style={{ fontSize: '.84rem', marginTop: 0 }}>What a listing's interior may be; preflight checks the PDF against it.</p>
              <div className="form-grid"><div className="field"><label>Multiple of</label><input className="inp mono" type="number" min={1} value={s.pageCountStep} onChange={(e) => set('pageCountStep', Number(e.target.value))} /></div><div className="field"><label>Minimum</label><input className="inp mono" type="number" min={1} value={s.minPageCount} onChange={(e) => set('minPageCount', Number(e.target.value))} /></div><div className="field"><label>Maximum</label><input className="inp mono" type="number" min={1} value={s.maxPageCount} onChange={(e) => set('maxPageCount', Number(e.target.value))} /></div></div></div>
            <div className="panel"><h3>Notifications</h3><div className="field"><label>Staff email for applications &amp; submissions</label><input className="inp" type="email" value={s.notifyEmail} onChange={(e) => set('notifyEmail', e.target.value)} placeholder="blank = the store email" /></div>
              <label className="switch" style={{ marginTop: '1rem' }}><input type="checkbox" checked={s.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Programme open (public page shows applications)</label></div>
          </div>
        </div>
        <div className="stack">
          <div className="panel accent"><h3>Words on the public page</h3>
            <div className="field"><label>Programme name</label><input className="inp" value={s.programName} onChange={(e) => set('programName', e.target.value)} /></div>
            <div className="field" style={{ marginTop: '.75rem' }}><label>Intro</label><textarea className="inp" rows={4} value={s.intro} onChange={(e) => set('intro', e.target.value)} /></div>
            <div className="field" style={{ marginTop: '.75rem' }}><label>Retailer terms</label><textarea className="inp" rows={4} value={s.retailerTerms} onChange={(e) => set('retailerTerms', e.target.value)} /><span className="hint">Shown on the page, in the ordering portal and on order emails.</span></div>
            <div className="field" style={{ marginTop: '.75rem' }}><label>Publisher terms</label><textarea className="inp" rows={4} value={s.publisherTerms} onChange={(e) => set('publisherTerms', e.target.value)} /></div>
          </div>
          <div className="panel" style={{ background: 'var(--p-ink)', color: '#fff', borderColor: 'transparent' }}><h3>Example</h3><p className="tight" style={{ color: 'var(--p-text-inv-dim)', fontSize: '.88rem' }}>A shop orders {money(30000)} at cover → {[...s.tiers].sort((a, b) => a.minCents - b.minCents).filter((t) => 30000 >= t.minCents).pop()?.name}: pays {money(Math.round(30000 * (10000 - ([...s.tiers].sort((a, b) => a.minCents - b.minCents).filter((t) => 30000 >= t.minCents).pop()?.discountBps ?? 0)) / 10000))}. On a {money(499)} comic we print, the publisher gets {money(Math.round(499 * (10000 - ([...s.tiers].sort((a, b) => a.minCents - b.minCents).filter((t) => 30000 >= t.minCents).pop()?.discountBps ?? 0)) / 10000) * (10000 - s.commissionBpsPrintedByUs) / 10000)} per copy before printing.</p></div>
        </div>
      </div>
    </>
  );
}
