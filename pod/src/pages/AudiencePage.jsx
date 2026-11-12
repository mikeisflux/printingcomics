import React from 'react';

const pageContent = {
  retailer: {
    eyebrow: 'FOR COMIC SHOPS & SPECIALTY RETAILERS',
    title: 'Independent Comic Books Worth Putting on the Shelf.',
    intro: 'Browse the catalog at MSRP, then use an approved retailer account to access wholesale pricing, place orders, download catalog data, manage returns, and review invoices.',
    accent: 'red',
    benefits: [
      ['Tiered wholesale pricing', 'Retailer discounts are based on cycle spend: 40% under $100, 45% from $101–$250, and 50% at $251 and above.'],
      ['No minimum order', 'Order the books that fit your store. Retailers prepay and receive their account-specific pricing after approval.'],
      ['One catalog workflow', 'Browse current and upcoming cycles, see FOC status, download retailer CSVs, and order from the same approved title records.'],
      ['Returns that match your tier', 'Tier I receives a 2-book allowance, Tier II receives 4 books, and Tier III receives 8 books.'],
      ['Invoices and order history', 'Review your own orders, invoices, shipment status, credits, and packing information without exposing another account’s data.'],
      ['Built for real shops', 'Standing orders, reorders, marketing assets, and responsive support help make independent books easier to carry.']
    ],
    steps: ['Submit a retailer application and resale documentation.', 'Your business and account information are reviewed.', 'Create your password from the secure invitation.', 'Browse live titles, see your tier pricing, and order while FOC is open.'],
    applyLabel: 'APPLY TO BE A RETAILER',
    loginLabel: 'RETAILER LOGIN',
    applyPage: 'apply-retailer'
  },
  publisher: {
    eyebrow: 'FOR INDEPENDENT COMIC PUBLISHERS',
    title: 'Bring Your Books to Retailers Without Losing the Thread.',
    intro: 'Submit titles, select catalog cycles, upload files, track approvals, view purchase orders, follow production, and monitor sales from one publisher account.',
    accent: 'gold',
    benefits: [
      ['Connected catalog submissions', 'Create titles, save drafts, select an open Catalog Cycle, upload assets, and submit the complete record for review.'],
      ['Approval stays separate from publishing', 'Every title is reviewed. Approved titles become public only when Admin schedules or publishes them Live.'],
      ['POD or inventory fulfillment', 'Choose Print on Demand or send finished inventory. Inventory fulfillment requires acknowledgement and places the Publisher account at the 15% distribution rate.'],
      ['Purchase and production orders', 'Publisher-fulfilled demand creates a Purchase Order. Print-on-demand fulfillment creates a Production Order.'],
      ['Transparent sales and payouts', 'View sales, commissions, production deductions, payout statements, and the status of each title.'],
      ['Resources in one place', 'Access the Publisher Handbook now, with print templates, file specifications, and additional resources added here later.']
    ],
    steps: ['Submit the publisher application and review package.', 'Your company and proposed publishing line are reviewed.', 'Create your password after approval.', 'Your titles, files, catalog cycles, purchase orders, and reporting stay connected in the Publisher Portal.'],
    applyLabel: 'APPLY TO BE A PUBLISHER',
    loginLabel: 'PUBLISHER LOGIN',
    applyPage: 'apply-publisher'
  }
};

export default function AudiencePage({ type, onNavigate }) {
  const content = pageContent[type];
  return (
    <div className={`audience-page audience-${content.accent} animate-fade-in`}>
      <section className="audience-hero">
        <span className="audience-eyebrow">{content.eyebrow}</span>
        <h1>{content.title}</h1>
        <p>{content.intro}</p>
        <div className="audience-actions">
          <button className="btn btn-primary" onClick={() => onNavigate(content.applyPage)}>{content.applyLabel}</button>
          <button className="btn btn-secondary" onClick={() => onNavigate('login')}>{content.loginLabel}</button>
        </div>
      </section>

      <section className="audience-benefits">
        {content.benefits.map(([title, copy]) => (
          <article className="audience-benefit" key={title}>
            <span className="audience-check">✓</span>
            <div><h2>{title}</h2><p>{copy}</p></div>
          </article>
        ))}
      </section>

      <section className="audience-process">
        <span className="audience-eyebrow">HOW IT WORKS</span>
        <h2>A clear path from application to active account.</h2>
        <div className="audience-steps">
          {content.steps.map((step, index) => <div key={step}><strong>{index + 1}</strong><p>{step}</p></div>)}
        </div>
      </section>

      <section className="audience-final-cta">
        <h2>Ready to work with us?</h2>
        <p>Applications are reviewed before account access is issued. Approval never happens automatically.</p>
        <div className="audience-actions">
          <button className="btn btn-primary" onClick={() => onNavigate(content.applyPage)}>APPLY TO GET STARTED</button>
          <button className="btn btn-secondary" onClick={() => onNavigate('login')}>EXISTING ACCOUNT LOGIN</button>
          {type === 'publisher' && <a className="btn btn-secondary" href={`${window.location.protocol === 'file:' ? './public/assets' : '/assets'}/resources/philbo-publisher-handbook.pdf`} target="_blank" rel="noreferrer">PUBLISHER HANDBOOK</a>}
        </div>
      </section>
    </div>
  );
}
