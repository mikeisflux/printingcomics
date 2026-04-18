import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

function Page({ title, intro, children }: { title: string; intro?: string; children?: ReactNode }) {
  return (
    <div className="container" style={{ padding: '3rem 1rem', maxWidth: 860 }}>
      <h1>{title}</h1>
      {intro && <p className="muted" style={{ fontSize: '1.1rem' }}>{intro}</p>}
      {children}
    </div>
  );
}

export function Crowdfunding() {
  return (
    <Page
      title="Crowdfunding"
      intro="Run a comic-book campaign with full printing, fulfillment, and shipping support from Printing Comics."
    >
      <p>
        Our crowdfunding program is designed for independent creators who want one partner for the
        entire lifecycle — from pre-launch cover mockups through post-campaign shipping.
      </p>
      <ul>
        <li>Free printing quotes and sample packs before your launch</li>
        <li>Discounted per-unit pricing on campaign tiers</li>
        <li>Integrated fulfillment — we print, pick, pack, and ship</li>
        <li>Dedicated project manager for the duration of the campaign</li>
      </ul>
      <p style={{ marginTop: '2rem' }}>
        <Link to="/contact" className="btn">Talk to our crowdfunding team</Link>
      </p>
    </Page>
  );
}

export function About() {
  return (
    <Page
      title="About Printing Comics"
      intro="Printing Comics is a creator-owned print shop dedicated exclusively to comic books, graphic novels, manga, and zines."
    >
      <p>
        We were founded by independent creators who were frustrated with print brokers that treated
        comics as an afterthought. Today we run a full in-house print floor with offset and digital
        presses tuned for comic-book stock, registration, and bindery.
      </p>
      <p>
        Whether you're printing a 24-page floppy, a 400-page omnibus, a magazine-sized art book, or a
        zine stapled in an afternoon — we'll match the paper, ink, and finishing to what your story
        needs.
      </p>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms &amp; Conditions">
      <p>
        These terms govern all orders placed with Printing Comics. Placing an order constitutes
        acceptance of these terms.
      </p>
      <h3>Proofs &amp; files</h3>
      <p>
        Customers are responsible for supplying print-ready files meeting the specifications
        published in our <Link to="/resources/file-prep">File Prep</Link> guide. Reprints required
        due to file errors are not covered.
      </p>
      <h3>Turnaround</h3>
      <p>
        Stated production times begin after proof approval. Shipping is separate and provided by
        the carrier selected at checkout.
      </p>
      <h3>Payment</h3>
      <p>
        Orders are paid in full at time of order via PayPal or credit card. We don't charge until
        capture at order placement.
      </p>
      <h3>Returns</h3>
      <p>
        Custom-printed items are non-returnable. If we make a material error on your order, we'll
        reprint at no charge.
      </p>
    </Page>
  );
}

export function Contact() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg(null);
    try {
      const r = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, subject: subject || undefined, message, website }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({ error: 'Failed' }))).error);
      setStatus('ok');
      setName(''); setEmail(''); setSubject(''); setMessage('');
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message ?? 'Send failed');
    }
  }

  return (
    <Page
      title="Contact us"
      intro="We usually respond within one business day."
    >
      {status === 'ok' ? (
        <div className="admin-card" style={{ background: '#d4f5dc', border: '1px solid #166534' }}>
          <h3 style={{ marginTop: 0 }}>Thanks — we got it.</h3>
          <p style={{ margin: 0 }}>We'll be in touch shortly at the email you provided.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="admin-card">
          <div className="grid-2">
            <div>
              <label>Your name</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label>Email</label>
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <label>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Optional" />
          <label>Message</label>
          <textarea rows={6} required value={message} onChange={(e) => setMessage(e.target.value)} />

          {/* Honeypot — hidden from real users, tempting to bots */}
          <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
            <label>Website (leave blank)</label>
            <input
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          {errorMsg && <div className="error">{errorMsg}</div>}
          <div className="row" style={{ marginTop: '1rem', alignItems: 'center' }}>
            <button className="btn" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Send message'}
            </button>
            <span className="muted" style={{ fontSize: '.85rem' }}>
              Or email <a href="mailto:hello@printingcomics.com">hello@printingcomics.com</a>
            </span>
          </div>
        </form>
      )}
      <p style={{ marginTop: '1.5rem' }}>
        For live status on an existing order, log in and visit
        {' '}<Link to="/account/orders">your orders</Link>.
      </p>
    </Page>
  );
}

export function Media() {
  return (
    <Page
      title="CWS Media"
      intro="Articles, interviews, and production videos from the Printing Comics studio."
    >
      <p className="muted">Media library coming soon. Until then, follow us on your favorite channel in the footer.</p>
    </Page>
  );
}

export function SamplePack() {
  return (
    <Page
      title="Sample pack"
      intro="Order a free sample pack to see and feel our paper stocks, cover finishes, and binding options before you commit to a run."
    >
      <p>
        The sample pack includes printed swatches of every interior paper, all four cover
        laminations, UV and foil samples, and a saddle-stitch / perfect-bound mini-binder so you
        can see the spine styles in person.
      </p>
      <p style={{ marginTop: '2rem' }}>
        <Link to="/contact" className="btn">Request a sample pack</Link>
      </p>
    </Page>
  );
}

export function MakeAComic() {
  return (
    <Page
      title="Make a comic"
      intro="A crash course in taking an idea from script to printed book."
    >
      <p>
        We've compiled our favorite articles, tools, and templates for working comic makers —
        covering script format, thumbnails, lettering, color prepress, and final file export.
      </p>
      <p style={{ marginTop: '1rem' }}>
        <Link to="/resources/templates" className="btn secondary">Download templates</Link>
      </p>
    </Page>
  );
}

export function FilePrep() {
  return (
    <Page
      title="File prep"
      intro="How to build PDFs that print cleanly on our presses."
    >
      <ul>
        <li>300 dpi raster at final trim size, plus 0.125&quot; bleed on all four sides</li>
        <li>CMYK color only — convert RGB artwork before export</li>
        <li>Embed all fonts, or outline them before export</li>
        <li>Single PDF for interior, single PDF for cover (front-spine-back as one spread)</li>
        <li>Flatten transparency to avoid blend-mode shifts</li>
      </ul>
    </Page>
  );
}

export function Templates() {
  return (
    <Page
      title="Templates"
      intro="Grab our Photoshop, Illustrator, and Clip Studio templates for every trim size we print."
    >
      <p className="muted">Template downloads are attached to each product page. Pick the product that matches your trim size, then click &quot;Download template&quot; on the left column.</p>
    </Page>
  );
}

export function Faq() {
  const items: { q: string; a: string }[] = [
    { q: 'What is your minimum order quantity?', a: 'As low as 1 for graphic novels and 25 for saddle-stitched comics.' },
    { q: 'How long does production take?', a: 'Typical production is 10–15 business days after proof approval. Rush options are available at checkout.' },
    { q: 'Can I see a proof before printing?', a: 'Yes — you\'ll receive a digital proof within 2 business days. We don\'t print until you approve.' },
    { q: 'Do you ship internationally?', a: 'Yes. Rates calculate at checkout based on your shipping address.' },
  ];
  return (
    <Page title="FAQ">
      {items.map((it, i) => (
        <div key={i} style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ marginBottom: '.25rem' }}>{it.q}</h3>
          <p style={{ margin: 0 }}>{it.a}</p>
        </div>
      ))}
    </Page>
  );
}
