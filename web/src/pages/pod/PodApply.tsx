/**
 * /print-on-demand/apply — two doors in: publishers (a partner application
 * staff approve into a Partner with a portal login) and comic shops (a
 * Retailer application staff approve into a wholesale account).
 */
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Store, CheckCircle2, ArrowRight } from 'lucide-react';
import { api } from '../../api/client';
import { useSeo } from '../../lib/seo';
import { useAuth } from '../../store/auth';
import { errText } from '../../components/pod/ui';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

export function PodApply() {
  const [params, setParams] = useSearchParams();
  const as = params.get('as') === 'retailer' ? 'retailer' : 'publisher';
  useSeo({ title: as === 'retailer' ? 'Open a Wholesale Account — Print On Demand' : 'Apply as a Publisher — Print On Demand', description: 'Join the Printing Comics Print On Demand programme as a publisher or a comic shop.' }, [as]);
  return (
    <div className="pod">
      <section className="hero-dark" style={{ padding: '3rem 0 2rem' }}>
        <div className="grain" />
        <div className="container">
          <div className="eyebrow rise"><Link to="/print-on-demand" style={{ textDecoration: 'none' }}>Print On Demand</Link> · Apply</div>
          <h1 className="display-lg rise rise-1" style={{ marginTop: '.4rem' }}>{as === 'retailer' ? 'Open a wholesale account' : 'List your titles with us'}</h1>
          <div className="seg rise rise-2" style={{ marginTop: '1.25rem', background: 'rgba(255,255,255,.08)', borderColor: 'rgba(255,255,255,.14)' }}>
            <button className={as === 'publisher' ? 'on' : ''} style={as === 'publisher' ? { background: '#fff', color: '#0b0d14' } : { color: '#cfd2e6' }} onClick={() => setParams({ as: 'publisher' })}><BookOpen size={14} /> I'm a publisher</button>
            <button className={as === 'retailer' ? 'on' : ''} style={as === 'retailer' ? { background: '#fff', color: '#0b0d14' } : { color: '#cfd2e6' }} onClick={() => setParams({ as: 'retailer' })}><Store size={14} /> I run a comic shop</button>
          </div>
        </div>
      </section>
      <section className="container" style={{ padding: '2rem 1.25rem 4rem', maxWidth: 1000 }}>
        {as === 'retailer' ? <RetailerForm /> : <PublisherForm />}
      </section>
    </div>
  );
}

function Done({ title, body, cta }: { title: string; body: string; cta?: { to: string; label: string } }) {
  return (
    <div className="panel rise" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
      <CheckCircle2 size={44} style={{ color: 'var(--p-green)' }} />
      <h2 className="display-md" style={{ marginTop: '.75rem' }}>{title}</h2>
      <p className="dim" style={{ maxWidth: '50ch', margin: '.5rem auto 1.5rem' }}>{body}</p>
      {cta && <Link to={cta.to} className="pbtn primary">{cta.label} <ArrowRight size={16} /></Link>}
    </div>
  );
}

function PublisherForm() {
  const { user } = useAuth();
  const [f, setF] = useState({ name: '', contactName: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '', contactEmail: user?.email ?? '', website: '', titles: '', message: '', fulfillment: 'PRINTED_BY_US' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api.post('/pod/apply/publisher', f); setDone(true); } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
  };
  if (done) return <Done title="Application received" body="We read every application ourselves and reply within two business days. When you're approved you get a portal login by email, and you can start listing right away." cta={{ to: '/print-on-demand/catalog', label: 'Browse the catalog meanwhile' }} />;
  return (
    <form onSubmit={submit} className="split" style={{ gridTemplateColumns: '1.3fr .7fr' }}>
      <div className="panel rise stack" style={{ gap: '1rem' }}>
        <div><h2 className="display-md">About your imprint</h2><p className="dim tight" style={{ fontSize: '.9rem' }}>Tell us who you are and what you publish. Nothing here is binding.</p></div>
        <div className="form-grid">
          <div className="field span-2"><label>Publisher / imprint name</label><input required value={f.name} onChange={set('name')} placeholder="Midnight Press" /></div>
          <div className="field"><label>Your name</label><input required value={f.contactName} onChange={set('contactName')} /></div>
          <div className="field"><label>Email</label><input required type="email" value={f.contactEmail} onChange={set('contactEmail')} /></div>
          <div className="field span-2"><label>Website or social</label><input value={f.website} onChange={set('website')} placeholder="https://" /></div>
          <div className="field span-2"><label>Titles you'd list first</label><textarea rows={3} value={f.titles} onChange={set('titles')} placeholder="Series, issue numbers, formats, roughly how many a month" /></div>
          <div className="field span-2"><label>How would you fulfil?</label>
            <div className="seg">
              {[['PRINTED_BY_US', 'You print & ship for me'], ['PARTNER_SHIPS', 'I ship from my own stock'], ['BOTH', 'Some of each']].map(([k, l]) => <button type="button" key={k} className={f.fulfillment === k ? 'on' : ''} onClick={() => setF((x) => ({ ...x, fulfillment: k! }))}>{l}</button>)}
            </div>
          </div>
          <div className="field span-2"><label>Anything else</label><textarea rows={3} value={f.message} onChange={set('message')} /></div>
        </div>
        {err && <div className="notice bad">{err}</div>}
        <div className="row"><button className="pbtn glow" disabled={busy}>{busy ? 'Sending…' : 'Send my application'}</button><span className="dim" style={{ fontSize: '.82rem' }}>Already approved? <Link to="/login?redirect=/publisher">Sign in to the publisher portal</Link></span></div>
      </div>
      <aside className="stack rise rise-1">
        <div className="panel accent"><h3>What happens next</h3><ol style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem', color: 'var(--p-text-dim)', fontSize: '.92rem', display: 'grid', gap: '.4rem' }}><li>We review the application and reply by email.</li><li>You get a portal login and list your first titles.</li><li>Each listing is reviewed; PDFs are preflighted on upload.</li><li>Approved titles go live in the next catalog.</li></ol></div>
        <div className="panel"><h3>What you'll need</h3><ul style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem', color: 'var(--p-text-dim)', fontSize: '.92rem', display: 'grid', gap: '.4rem' }}><li>Cover image (JPG/PNG) for the catalog</li><li>Cover and interior PDFs with 0.125" bleed</li><li>Cover price, page count, trim size</li><li>A UPC if you have one (we can work without)</li></ul><Link to="/resources/file-prep" className="pbtn soft sm" style={{ marginTop: '.75rem' }}>File prep guide</Link></div>
      </aside>
    </form>
  );
}

function RetailerForm() {
  const { user } = useAuth();
  const [f, setF] = useState({ name: '', contactName: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '', contactEmail: user?.email ?? '', phone: '', website: '', line1: '', line2: '', city: '', region: '', postalCode: '', resaleCertNumber: '', resaleCertState: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api.post('/pod/apply/retailer', { name: f.name, contactName: f.contactName, contactEmail: f.contactEmail, phone: f.phone, website: f.website, address: { line1: f.line1, line2: f.line2, city: f.city, region: f.region, postalCode: f.postalCode, country: 'US' }, resaleCertNumber: f.resaleCertNumber, resaleCertState: f.resaleCertState, message: f.message });
      setDone(true);
    } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
  };
  if (done) return <Done title="Application received" body="We check shop applications within two business days. Once you're approved you get a sign-in link by email and the current catalog opens to you at wholesale." cta={{ to: '/print-on-demand/catalog', label: 'See the catalog' }} />;
  return (
    <form onSubmit={submit} className="split" style={{ gridTemplateColumns: '1.3fr .7fr' }}>
      <div className="panel rise stack" style={{ gap: '1rem' }}>
        <div><h2 className="display-md">About your shop</h2><p className="dim tight" style={{ fontSize: '.9rem' }}>Where books ship, who to talk to, and your resale certificate if you have it handy.</p></div>
        <div className="form-grid">
          <div className="field span-2"><label>Shop name</label><input required value={f.name} onChange={set('name')} placeholder="Fourth Wall Comics" /></div>
          <div className="field"><label>Your name</label><input required value={f.contactName} onChange={set('contactName')} /></div>
          <div className="field"><label>Email</label><input required type="email" value={f.contactEmail} onChange={set('contactEmail')} /></div>
          <div className="field"><label>Phone</label><input value={f.phone} onChange={set('phone')} /></div>
          <div className="field"><label>Website or social</label><input value={f.website} onChange={set('website')} placeholder="https://" /></div>
          <div className="field span-2"><label>Ship-to address</label><input required value={f.line1} onChange={set('line1')} placeholder="Street" /></div>
          <div className="field span-2"><input value={f.line2} onChange={set('line2')} placeholder="Suite, unit (optional)" aria-label="Address line 2" /></div>
          <div className="field"><label>City</label><input required value={f.city} onChange={set('city')} /></div>
          <div className="field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
            <div className="field"><label>State</label><select required value={f.region} onChange={set('region')}><option value="">—</option>{US_STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label>ZIP</label><input required value={f.postalCode} onChange={set('postalCode')} /></div>
          </div>
          <div className="field"><label>Resale certificate # <span className="dim">optional</span></label><input value={f.resaleCertNumber} onChange={set('resaleCertNumber')} /></div>
          <div className="field"><label>Certificate state</label><select value={f.resaleCertState} onChange={set('resaleCertState')}><option value="">—</option>{US_STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="field span-2"><label>Anything else</label><textarea rows={3} value={f.message} onChange={set('message')} placeholder="How many indie titles you rack a month, what your customers ask for…" /></div>
        </div>
        {err && <div className="notice bad">{err}</div>}
        <div className="row"><button className="pbtn hot" disabled={busy}>{busy ? 'Sending…' : 'Apply for a wholesale account'}</button><span className="dim" style={{ fontSize: '.82rem' }}>Already approved? <Link to="/login?redirect=/retailer">Sign in to order</Link></span></div>
      </div>
      <aside className="stack rise rise-1">
        <div className="panel accent"><h3>How ordering works</h3><ol style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem', color: 'var(--p-text-dim)', fontSize: '.92rem', display: 'grid', gap: '.4rem' }}><li>A new catalog opens each month.</li><li>Order online, or download the sheet and upload it back.</li><li>Change anything until the final order cutoff.</li><li>One shipment lands for the in-store date; shipping billed at cost.</li></ol></div>
        <div className="panel"><h3>Discounts</h3><p className="dim tight" style={{ fontSize: '.92rem' }}>Set by the order's total at cover price: 40% off to start, 45% and 50% as the order grows. Every title in the order gets the same discount.</p></div>
      </aside>
    </form>
  );
}
