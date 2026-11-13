/**
 * /distribution/handbook — the Printing Comics Publisher Handbook: how
 * the program works, what we need from a publisher, file preparation
 * (deferring to our templates and file-prep pages for the specs), the
 * catalog procedure, money, and account rules. Printable.
 */
import { Link } from 'react-router-dom';
import { Printer, BookOpen, FileCheck, Calendar, HandCoins, ShieldCheck, Barcode as BarcodeIcon, Truck, Download } from 'lucide-react';
import { useSeo } from '../../lib/seo';
import { money, pct, type PublicSettings } from '../../lib/pod';
import { useLoad } from '../../components/pod/ui';

export function PublisherHandbook() {
  useSeo({ image: '/og-distribution.png', title: 'Publisher Handbook — Distribution — Printing Comics', description: 'How to list, submit and sell comics through the Printing Comics Distribution program: policies, submissions, file preparation, catalog procedure, payouts and account rules.' });
  const { data } = useLoad<{ settings: PublicSettings }>('/pod');
  const s = data?.settings;
  const top = s ? s.tiers[s.tiers.length - 1]! : null;
  const H = ({ id, icon, children }: { id: string; icon: React.ReactNode; children: React.ReactNode }) => <h2 id={id} className="display-md" style={{ marginTop: '2.5rem', display: 'flex', alignItems: 'center', gap: '.6rem' }}>{icon}{children}</h2>;
  return (
    <div className="pod">
      <section className="hero-dark" style={{ padding: '3rem 0 2rem' }}>
        <div className="grain" />
        <div className="container between" style={{ alignItems: 'flex-end' }}>
          <div><div className="eyebrow rise"><Link to="/distribution" style={{ textDecoration: 'none' }}>Distribution</Link> · Publisher handbook</div><h1 className="display-lg rise rise-1" style={{ marginTop: '.4rem' }}>The Printing Comics<br /><span className="grad-text">Publisher Handbook</span></h1><p className="lead rise rise-2" style={{ marginTop: '.75rem' }}>Everything a publisher needs to list with us, get files through preflight, sell to shops and get paid. Updated as the program changes; the version on this page is always current.</p></div>
          <button className="pbtn ghost rise rise-2" onClick={() => window.print()}><Download size={16} /> Print / save as PDF</button>
        </div>
      </section>
      <div className="container" style={{ padding: '1.5rem 1.25rem 4rem', maxWidth: 960 }}>
        <nav className="panel tight" style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginBottom: '1rem' }}>
          {[['how', '1. How it works'], ['account', '2. Your account'], ['listing', '3. Listing a title'], ['files', '4. Files & preflight'], ['barcodes', '5. Barcodes & catalog ids'], ['catalog', '6. The catalog cycle'], ['fulfillment', '7. Fulfillment options'], ['money', '8. Money & payouts'], ['returns', '9. Returns & damages'], ['rules', '10. Rules']].map(([id, l]) => <a key={id} href={`#${id}`} className="chip" style={{ textDecoration: 'none' }}>{l}</a>)}
        </nav>

        <H id="how" icon={<Printer size={22} style={{ color: 'var(--p-violet)' }} />}>1. How the program works</H>
        <p>Distribution is Printing Comics' program for independent publishers. You list a book with us; it goes into a monthly catalog; comic shops order it at wholesale; we print exactly what was ordered (or you ship it, or we ship from stock you consign to us); the books land in shops for the in-store date; you get a statement and a payout. There are no print minimums, no listing fees and no inventory to carry when we print.</p>
        <div className="howit" style={{ marginTop: '1rem' }}>
          <div className="hs"><b>List by the catalog date</b><span>Metadata, cover image, price, print files.</span></div>
          <div className="hs"><b>Shops order until FOC</b><span>Final order cutoff is when quantities freeze.</span></div>
          <div className="hs"><b>We print to the count</b><span>Or send you a purchase order to ship.</span></div>
          <div className="hs"><b>You get paid</b><span>A statement per cycle, net of commission and printing.</span></div>
        </div>

        <H id="account" icon={<ShieldCheck size={22} style={{ color: 'var(--p-violet)' }} />}>2. Your account</H>
        <ul>
          <li>Apply from the <Link to="/distribution/apply?as=publisher">Distribution page</Link>. We reply within two business days and send a portal sign-in link; you set your own password on first login.</li>
          <li>One publisher account can have several logins. Ask us, or an existing login can invite colleagues from Company profile.</li>
          <li>Keep your <Link to="/publisher/assets">company profile</Link> current: contact, mailing address, payout method, logo. Your logo and bio show on your public publisher page and next to your titles.</li>
          <li>Accounts on hold cannot submit; listings stay in place. Write to us to sort out any hold.</li>
        </ul>

        <H id="listing" icon={<BookOpen size={22} style={{ color: 'var(--p-violet)' }} />}>3. Listing a title</H>
        <p>One listing per sellable cover. A variant cover is its own listing (use <em>Duplicate as variant</em> on the dashboard). Each listing needs:</p>
        <ul>
          <li><b>The book:</b> title, series, issue number, cover description, format, series code (3–6 letters), UPC.</li>
          <li><b>Specs &amp; price:</b> cover price (shops buy at a discount off it), page count (a multiple of {s?.pageCountStep ?? 4}, {s?.minPageCount ?? 8}–{s?.maxPageCount ?? 200}), trim size, color or black &amp; white, fulfillment method.</li>
          <li><b>Copy &amp; credits:</b> synopsis (shown to shops and readers), description, writer, artist, cover artist, genres, rating.</li>
          <li><b>Catalog &amp; rules:</b> which catalog cycle, incentive ratio for retailer-incentive covers, whether shops may reorder.</li>
          <li><b>Files:</b> a cover image for the catalog, and for titles we print a cover PDF and an interior PDF.</li>
        </ul>
        <p>Submit when the readiness list on the listing is all green. We review within a few days: approve, request changes (you get our notes by email and on the listing), or decline. Approved and live listings are locked; write to us for changes, and print files can still be replaced.</p>

        <H id="files" icon={<FileCheck size={22} style={{ color: 'var(--p-violet)' }} />}>4. Files &amp; preflight</H>
        <p>Build files on our templates and follow our file-prep guide; both are the same ones every Printing Comics customer uses:</p>
        <div className="row" style={{ margin: '.5rem 0 1rem' }}><Link to="/resources/templates" className="pbtn primary sm">Print templates</Link><Link to="/resources/file-prep" className="pbtn soft sm">File prep guide</Link></div>
        <p>The moment a PDF lands we check that it opens, is not password-protected, has the right page count (interiors a multiple of {s?.pageCountStep ?? 4}; covers four pages or a wrap), uses one page size throughout, has no two-page spreads, matches the listed trim, and carries 0.125" bleed. Failures are listed on the file with what to fix. A person then confirms fonts, color, resolution and flattening before press. Every upload is a new version; older versions stay and can be restored from <Link to="/publisher/files">Files</Link>.</p>

        <H id="barcodes" icon={<BarcodeIcon size={22} style={{ color: 'var(--p-violet)' }} />}>5. Barcodes &amp; catalog ids</H>
        <p>Every cover needs its own UPC. Use your own, or take one of ours from the listing page ("Get a barcode"): we hold blocks and can reserve a batch for you. The scannable image is downloadable from the listing and from <Link to="/publisher/barcodes">Barcodes</Link>. Your catalog id is your series code plus the last five digits of the UPC (for example <span className="key">SAV-92708</span>); it is what shops type to order and it is fixed once the listing is live.</p>

        <H id="catalog" icon={<Calendar size={22} style={{ color: 'var(--p-violet)' }} />}>6. The catalog cycle</H>
        <ul>
          <li><b>Catalog date:</b> listings for the cycle are due; the catalog publishes and opens to shops.</li>
          <li><b>Final order cutoff (FOC):</b> shop orders freeze. We raise production runs and purchase orders and the cycle's sales land in your ledger.</li>
          <li><b>In-store date:</b> books are in shops.</li>
        </ul>
        <p>You pick the cycle on the listing; the dates come with it. Shops may change their order freely until FOC, so quantities you see before then are live, not final.</p>

        <H id="fulfillment" icon={<Truck size={22} style={{ color: 'var(--p-violet)' }} />}>7. Fulfillment options</H>
        <ul>
          <li><b>Printed &amp; shipped by Printing Comics</b> — commission {s ? pct(s.commissionBpsPrintedByUs) : '5%'}; printing charged per copy at our public price.</li>
          <li><b>Shipped by the publisher</b> — commission {s ? pct(s.commissionBpsPartnerShips) : '10%'}; after FOC you get a purchase order with ship-to addresses; acknowledge it and mark it shipped in the portal.</li>
          <li><b>Consignment</b> — you send stock to us, we store and ship it; commission {s ? pct(s.commissionBpsConsignment) : '15%'} covers receiving, storage and handling.</li>
        </ul>
        <p>You can also order printed copies of any approved title for yourself from <Link to="/publisher/print-orders">Print copies</Link>; they are priced at our public rate and charged against your next payout.</p>

        <H id="money" icon={<HandCoins size={22} style={{ color: 'var(--p-violet)' }} />}>8. Money &amp; payouts</H>
        <p>Shops buy at a tier discount off your cover price{top ? ` (up to ${pct(top.discountBps)} on orders from ${money(top.minCents)} at cover)` : ''}. Your ledger records every sale, our commission, printing and any return credits as they happen; <Link to="/publisher/statements">Sales &amp; payouts</Link> shows what is pending. After each cycle we issue a statement that sweeps those entries up and pay the net by the method on your profile. Set your cover price with printing in mind: at the top tier, after commission, it must clear our per-copy print price or you would owe us on every sale; the listing page warns you.</p>

        <H id="returns" icon={<FileCheck size={22} style={{ color: 'var(--p-violet)' }} />}>9. Returns &amp; damages</H>
        <p>Shops may claim damaged, misprinted or wrong copies on any shipped order, and return unsold copies within a small allowance per order set by their tier{s ? ` (${s.returnAllowanceByTier.join(' / ')} copies)` : ''}. Approved claims are credited to the shop and charged to the publisher's ledger at the wholesale price of the copies.</p>

        <H id="rules" icon={<ShieldCheck size={22} style={{ color: 'var(--p-violet)' }} />}>10. Rules</H>
        <ul>
          <li>You hold the rights to everything you list, including the cover and any licensed art, and you are responsible for the content.</li>
          <li>Listings must be complete and truthful; a cover price cannot change after a catalog publishes.</li>
          <li>Purchase orders must ship by the in-store date; tell us as soon as you know of a delay.</li>
          <li>We may decline or remove a listing that does not meet these rules or our printing standards.</li>
          <li>{s?.publisherTerms}</li>
        </ul>
        <div className="notice info" style={{ marginTop: '2rem' }}>Questions? Write to us from the <Link to="/contact">contact page</Link>; publishers signed in can also reply to any email we sent.</div>
      </div>
    </div>
  );
}
