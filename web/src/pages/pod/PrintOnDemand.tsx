/**
 * /print-on-demand — the program's front door. Publishers list books,
 * comic shops order them at wholesale, we print and ship each cycle.
 */
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Store, Sparkles, Printer, Truck, HandCoins, FileCheck, Calendar, ShieldCheck, LogIn } from 'lucide-react';
import { useSeo } from '../../lib/seo';
import { useAuth } from '../../store/auth';
import { money, pct, type PublicSettings } from '../../lib/pod';
import { CoverCard, Countdown, CycleTimeline, Pill, TierLadder, useLoad } from '../../components/pod/ui';

interface Landing {
  settings: PublicSettings;
  cycle: { id: string; slug: string; name: string; catalogDate: string; focDate: string; inStoreDate: string; orderingOpen: boolean } | null;
  nextCycle: { id: string; name: string; catalogDate: string; focDate: string; inStoreDate: string } | null;
  stats: { live: number; publishers: number; retailers: number };
  featured: { listingId: string; catalogKey: string; title: string; issueNumber: string | null; publisher: string; msrpCents: number; coverImageUrl: string | null }[];
}

export function PrintOnDemand() {
  useSeo({ title: 'Print On Demand for Publishers & Comic Shops — Printing Comics', description: 'List your comics with Printing Comics, sell them to comic shops at wholesale, and let us print and ship every order. Monthly catalog, no minimums, no inventory.', image: '/og-print-on-demand.png' });
  const { data } = useLoad<Landing>('/pod');
  const { user } = useAuth();
  const s = data?.settings;
  const cycle = data?.cycle;
  const featured = data?.featured ?? [];
  const marquee = featured.length ? [...featured, ...featured] : [];

  return (
    <div className="pod">
      {/* ---------------------------------------------------------------- Hero */}
      <section className="hero-dark hero-pod">
        <div className="grain" />
        <div className="container">
          <div className="hero-grid">
            <div>
              <div className="eyebrow rise">Print On Demand · for publishers &amp; comic shops</div>
              <h1 className="display-xl rise rise-1" style={{ marginTop: '.75rem' }}>
                Your comics,<br /><span className="grad-text">in every shop,</span><br />printed one at a time.
              </h1>
              <p className="lead rise rise-2" style={{ marginTop: '1.25rem' }}>{s?.intro ?? 'List your comics with us, sell them to comic shops at wholesale, and let us print and ship every order. No minimums, no inventory, one monthly catalog.'}</p>
              <div className="row rise rise-3" style={{ marginTop: '1.75rem', gap: '.75rem' }}>
                <Link to={user?.partner ? '/publisher' : '/print-on-demand/apply?as=publisher'} className="pbtn glow"><BookOpen size={18} /> {user?.partner ? 'Open my publisher portal' : 'List your titles'}</Link>
                <Link to={user?.retailer ? '/retailer' : '/print-on-demand/apply?as=retailer'} className="pbtn ghost"><Store size={18} /> {user?.retailer ? 'Order wholesale' : 'Open a wholesale account'}</Link>
                <Link to="/print-on-demand/catalog" className="pbtn ghost" style={{ border: 0 }}>Browse the catalog <ArrowRight size={16} /></Link>
              </div>
              <div className="stat-strip rise rise-4">
                <div className="st"><b className="mono">{data ? data.stats.live : '—'}</b><span>Titles live</span></div>
                <div className="st"><b className="mono">{data ? data.stats.publishers : '—'}</b><span>Publishers</span></div>
                <div className="st"><b className="mono">{data ? data.stats.retailers : '—'}</b><span>Comic shops</span></div>
                {s && <div className="st"><b className="mono">{pct(s.tiers[s.tiers.length - 1]?.discountBps ?? 5000)}</b><span>Top wholesale discount</span></div>}
              </div>
            </div>
            <div className="rise rise-2">
            <div className="glass" style={{ padding: '1.5rem' }}>
              {cycle ? (
                <>
                  <div className="between" style={{ marginBottom: '.5rem' }}>
                    <div><div className="eyebrow">Current catalog</div><div className="display-md" style={{ marginTop: '.2rem' }}>{cycle.name}</div></div>
                    {cycle.orderingOpen ? <Pill tone="green" live>Ordering open</Pill> : <Pill tone="amber">FOC passed</Pill>}
                  </div>
                  <CycleTimeline catalogDate={cycle.catalogDate} focDate={cycle.focDate} inStoreDate={cycle.inStoreDate} compact />
                  {cycle.orderingOpen && <div style={{ marginTop: '1.25rem' }}><Countdown to={cycle.focDate} label="Final order cutoff in" /></div>}
                  <div className="row" style={{ marginTop: '1.25rem' }}>
                    <Link to={`/print-on-demand/catalog?cycle=${cycle.slug}`} className="pbtn primary sm" style={{ background: '#fff', color: '#0b0d14' }}>See what's in it <ArrowRight size={14} /></Link>
                  </div>
                </>
              ) : data?.nextCycle ? (
                <>
                  <div className="eyebrow">Next catalog</div>
                  <div className="display-md" style={{ marginTop: '.2rem' }}>{data.nextCycle.name}</div>
                  <p className="dim" style={{ margin: '.5rem 0 1rem' }}>Open to publishers now. Shops order from the catalog date until final order cutoff.</p>
                  <CycleTimeline catalogDate={data.nextCycle.catalogDate} focDate={data.nextCycle.focDate} inStoreDate={data.nextCycle.inStoreDate} compact />
                </>
              ) : (
                <>
                  <div className="eyebrow">How a cycle runs</div>
                  <div className="display-md" style={{ marginTop: '.2rem' }}>Catalog → FOC → in store</div>
                  <p className="dim" style={{ margin: '.5rem 0 0' }}>Publishers list by the catalog date, shops order until the final order cutoff, books print and ship for the in-store date. The first cycle is being set up now.</p>
                </>
              )}
            </div>
            <div className="grid cols-2" style={{ marginTop: '1rem', gap: '.75rem' }}>
              <Link to={user?.partner ? '/publisher' : '/login?redirect=/publisher'} className="pbtn glow" style={{ justifyContent: 'center' }} data-testid="publisher-login"><LogIn size={16} /> {user?.partner ? 'Open publisher portal' : 'Publisher login'}</Link>
              <Link to={user?.retailer ? '/retailer' : '/login?redirect=/retailer'} className="pbtn hot" style={{ justifyContent: 'center' }} data-testid="retailer-login"><LogIn size={16} /> {user?.retailer ? 'Open wholesale ordering' : 'Retailer login'}</Link>
            </div>
            <p className="dim" style={{ fontSize: '.8rem', textAlign: 'center', margin: '.6rem 0 0' }}>New here? <Link to="/print-on-demand/apply?as=publisher" style={{ color: '#fff' }}>Apply as a publisher</Link> · <Link to="/print-on-demand/apply?as=retailer" style={{ color: '#fff' }}>Open a wholesale account</Link></p>
            </div>
          </div>
        </div>
        {marquee.length > 0 && (
          <div className="marquee" style={{ marginTop: '3.5rem' }} aria-hidden="true">
            <div className="marquee-track">
              {marquee.map((f, i) => (
                <CoverCard key={`${f.listingId}-${i}`} to={`/print-on-demand/catalog/${f.catalogKey}`} url={f.coverImageUrl} title={f.title} sub={f.publisher} price={money(f.msrpCents)} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ----------------------------------------------------------- Two doors */}
      <section className="section container">
        <div className="two-doors">
          <Link to={user?.partner ? '/publisher' : '/print-on-demand/apply?as=publisher'} className="door pub rise">
            <BookOpen className="big-ic" size={40} />
            <div className="eyebrow" style={{ color: 'var(--p-cyan)' }}>Publishers &amp; creators</div>
            <h3>List once. Sell to every shop.</h3>
            <p>Set your cover price, upload the print files, pick a catalog. We take wholesale orders from comic shops, print to the exact count, ship, and pay you out each cycle.</p>
            <ul>
              <li>No print minimums, no inventory, no fulfillment</li>
              <li>Keep {s ? `${(100 - s.commissionBpsPrintedByUs / 100).toFixed(0)}%` : '95%'} of wholesale when we print &amp; ship{s ? `, ${(100 - s.commissionBpsPartnerShips / 100).toFixed(0)}% when you ship` : ''}</li>
              <li>Automatic preflight on every PDF before it reaches the press</li>
              <li>A statement every cycle: units, wholesale, printing, your payout</li>
            </ul>
            <span className="pbtn glow" style={{ alignSelf: 'flex-start', marginTop: '.5rem' }}>{user?.partner ? 'Open the publisher portal' : 'Apply as a publisher'} <ArrowRight size={16} /></span>
          </Link>
          <Link to={user?.retailer ? '/retailer' : '/print-on-demand/apply?as=retailer'} className="door shop rise rise-1">
            <Store className="big-ic" size={40} />
            <div className="eyebrow" style={{ color: 'var(--p-magenta)' }}>Comic shops</div>
            <h3>Indie books at real wholesale.</h3>
            <p>One catalog a month, one order, one shipment. Order what your racks need; the discount climbs with the size of the order, up to {s ? pct(s.tiers[s.tiers.length - 1]?.discountBps ?? 5000) : '50%'} off cover.</p>
            <ul>
              <li>Tiered discounts on every order, no account minimum</li>
              <li>Change your order freely until final order cutoff</li>
              <li>Download the catalog as a spreadsheet, upload it back as your order</li>
              <li>Retailer incentive covers earned automatically</li>
            </ul>
            <span className="pbtn hot" style={{ alignSelf: 'flex-start', marginTop: '.5rem' }}>{user?.retailer ? 'Order wholesale' : 'Open a wholesale account'} <ArrowRight size={16} /></span>
          </Link>
        </div>
      </section>

      {/* ---------------------------------------------------------- How it works */}
      <section className="section" style={{ background: 'var(--p-paper)' }}>
        <div className="container">
          <div className="section-head">
            <div><div className="eyebrow">How it works</div><h2 className="display-lg">One cycle, start to finish</h2></div>
            <p className="lead" style={{ maxWidth: '38ch' }}>Every month runs on the same three dates: catalog, final order cutoff, in store.</p>
          </div>
          <div className="howit">
            <div className="hs rise"><Calendar size={20} style={{ color: 'var(--p-violet)' }} /><b>Publishers list by the catalog date</b><span>Title, cover, price, print files. We review every listing and run the PDFs through preflight.</span></div>
            <div className="hs rise rise-1"><Store size={20} style={{ color: 'var(--p-violet)' }} /><b>Shops order until FOC</b><span>The catalog opens to retailers at wholesale. Orders can change right up to the final order cutoff.</span></div>
            <div className="hs rise rise-2"><Printer size={20} style={{ color: 'var(--p-violet)' }} /><b>We print the exact count</b><span>At FOC every title becomes a production run. Publisher-shipped titles get a purchase order instead.</span></div>
            <div className="hs rise rise-3"><Truck size={20} style={{ color: 'var(--p-violet)' }} /><b>Books land for the in-store date</b><span>Each shop gets one shipment. Publishers get a statement and a payout for the cycle.</span></div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Wholesale tiers */}
      {s && (
        <section className="section container">
          <div className="section-head">
            <div><div className="eyebrow">Wholesale tiers</div><h2 className="display-lg">The more you rack, the deeper the discount</h2></div>
            <p className="lead" style={{ maxWidth: '40ch' }}>Tiers are set by the order's total at cover price. Every title in the order gets the same discount.</p>
          </div>
          <TierLadder tiers={s.tiers} />
          <div className="grid cols-3" style={{ marginTop: '1.5rem' }}>
            <div className="panel"><Truck size={20} style={{ color: 'var(--p-violet)' }} /><h3 style={{ marginTop: '.5rem' }}>Shipping</h3><p className="dim tight" style={{ fontSize: '.92rem' }}>{s.retailerShipping.mode === 'flat' ? `A flat ${money(s.retailerShipping.flatCents)} per order.` : 'Billed at cost when your order ships, one box per cycle.'}</p></div>
            <div className="panel"><FileCheck size={20} style={{ color: 'var(--p-violet)' }} /><h3 style={{ marginTop: '.5rem' }}>Terms</h3><p className="dim tight" style={{ fontSize: '.92rem' }}>{s.retailerTerms}</p></div>
            <div className="panel"><ShieldCheck size={20} style={{ color: 'var(--p-violet)' }} /><h3 style={{ marginTop: '.5rem' }}>Resale certificate</h3><p className="dim tight" style={{ fontSize: '.92rem' }}>Upload yours once in the portal and we stop charging sales tax where it applies.</p></div>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- Publisher economics */}
      {s && (
        <section className="section hero-dark" style={{ padding: 'clamp(2.5rem, 6vw, 5rem) 0' }}>
          <div className="grain" />
          <div className="container">
            <div className="grid cols-2" style={{ alignItems: 'center', gap: '3rem' }}>
              <div>
                <div className="eyebrow">For publishers</div>
                <h2 className="display-lg" style={{ marginTop: '.5rem' }}>You set the price.<br />We do the rest.</h2>
                <p className="lead" style={{ marginTop: '1rem' }}>{s.publisherTerms}</p>
                <div className="row" style={{ marginTop: '1.5rem' }}>
                  <Link to={user?.partner ? '/publisher' : '/print-on-demand/apply?as=publisher'} className="pbtn glow"><Sparkles size={16} /> {user?.partner ? 'Open the publisher portal' : 'Apply as a publisher'}</Link>
                  <Link to="/print-on-demand/handbook" className="pbtn ghost">Publisher handbook</Link>
                  <Link to="/resources/file-prep" className="pbtn ghost">File prep guide</Link>
                </div>
              </div>
              <div className="grid cols-2">
                <div className="glass" style={{ padding: '1.25rem' }}><HandCoins size={22} style={{ color: 'var(--p-lime)' }} /><div className="display-md mono" style={{ marginTop: '.5rem' }}>{pct(s.commissionBpsPrintedByUs)}</div><div className="dim" style={{ fontSize: '.85rem' }}>Our commission when we print &amp; ship your title. Printing is charged per copy at our public price.</div></div>
                <div className="glass" style={{ padding: '1.25rem' }}><Truck size={22} style={{ color: 'var(--p-cyan)' }} /><div className="display-md mono" style={{ marginTop: '.5rem' }}>{pct(s.commissionBpsPartnerShips)}</div><div className="dim" style={{ fontSize: '.85rem' }}>Our commission when you ship from your own stock on a purchase order we send you.</div></div>
                <div className="glass" style={{ padding: '1.25rem' }}><FileCheck size={22} style={{ color: 'var(--p-magenta)' }} /><div className="display-md" style={{ marginTop: '.5rem' }}>Preflight</div><div className="dim" style={{ fontSize: '.85rem' }}>Trim, bleed, spreads and page count checked the moment a PDF lands; a human checks the rest.</div></div>
                <div className="glass" style={{ padding: '1.25rem' }}><Calendar size={22} style={{ color: 'var(--p-amber)' }} /><div className="display-md" style={{ marginTop: '.5rem' }}>Monthly</div><div className="dim" style={{ fontSize: '.85rem' }}>A statement and payout every cycle: units, wholesale, commission, printing, net.</div></div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- FAQ */}
      <section className="section container" style={{ maxWidth: 860 }}>
        <div className="eyebrow">Questions</div>
        <h2 className="display-lg" style={{ marginBottom: '1rem' }}>The short answers</h2>
        <div className="faq">
          <details><summary>What does it cost a publisher to list?</summary><p>Nothing up front. We earn a commission on wholesale sales, and when we print your title the printing is charged per copy against your payout at our public price. If nothing sells, you owe nothing.</p></details>
          <details><summary>Who sets the cover price?</summary><p>You do. Shops buy at a discount off that cover price, by tier. Your payout is the wholesale total less our commission and any printing.</p></details>
          <details><summary>Can a shop change its order?</summary><p>Yes, freely, until the final order cutoff. After FOC the order is final: we print to the count and the publisher is paid on it.</p></details>
          <details><summary>What file checks do you run?</summary><p>Every cover and interior PDF is checked for opening, page count, consistent page size, two-page spreads, trim size and bleed the moment it is uploaded. Fonts, color and resolution are checked by a person before press.</p></details>
          <details><summary>Do you carry inventory?</summary><p>No. Each cycle prints exactly what shops ordered plus any extra copies the publisher adds on. Publisher-shipped titles never touch our warehouse.</p></details>
          <details><summary>I already print with Printing Comics. Is this different?</summary><p>Yes. The store prints your run for you. Print On Demand sells your book to shops for you, then prints it. Many publishers do both.</p></details>
        </div>
        <div className="row" style={{ marginTop: '2rem', justifyContent: 'center' }}>
          <Link to="/print-on-demand/apply?as=publisher" className="pbtn primary">Apply as a publisher</Link>
          <Link to="/print-on-demand/apply?as=retailer" className="pbtn hot">Open a wholesale account</Link>
          <Link to="/contact" className="pbtn ghost">Ask us anything</Link>
        </div>
      </section>
    </div>
  );
}
