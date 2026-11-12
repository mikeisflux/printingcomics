import React from 'react';

export default function PublisherGuide({ onNavigate }) {
  return (
    <div className="animate-fade-in" style={{ padding: '60px 20px', maxWidth: '900px', margin: '0 auto' }}>
      
      {/* Page Header */}
      <div style={{ textAlign: 'center', marginBottom: '50px' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '15px' }}>
          PUBLISHER <span className="gold-text">SUBMISSION GUIDE</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxStyle: '650px', margin: '0 auto', lineHeight: '1.6' }}>
          Everything you need to know about distributing your print books with Philbo Distribution.
        </p>
      </div>

      {/* Scope / Restriction Notice Alert Banner */}
      <div 
        style={{ 
          background: 'rgba(212,175,55,0.05)', 
          border: '1px solid rgba(212,175,55,0.2)', 
          padding: '20px 25px', 
          borderRadius: '8px', 
          marginBottom: '40px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '10px' 
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--gold-primary)', fontWeight: 'bold', fontSize: '1.05rem' }}>
          ⚠️ IMPORTANT DISTRIBUTION SCOPE
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0, lineHeight: '1.6' }}>
          This guide is designed for publishers of <strong>printed material</strong> (comic books, graphic novels, art books, etc.). It is <strong>not intended</strong> for manufacturers of games, toys, movies, novelties, or similar merchandise.
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0, lineHeight: '1.6' }}>
          If you are a manufacturer of merchandise, games, or toys, please contact us directly at{' '}
          <a href="mailto:contact@philboentertainment.com" style={{ color: 'var(--gold-primary)', fontWeight: 'bold', textDecoration: 'underline' }}>
            contact@philboentertainment.com
          </a>.
        </p>
      </div>

      {/* Main Info Columns */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
        
        {/* Section 1: Who We Are */}
        <div className="glass-panel" style={{ padding: '40px' }}>
          <h2 style={{ color: 'var(--gold-primary)', fontSize: '1.4rem', marginBottom: '20px', borderBottom: '1px solid var(--border-glow)', paddingBottom: '10px', letterSpacing: '0.05em' }}>
            🤝 WHO WE ARE & WHAT WE DO
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', lineHeight: '1.7', color: 'var(--text-secondary)' }}>
            <p style={{ fontSize: '1.05rem', color: '#fff', fontWeight: '500' }}>
              Philbo Distribution is a new distributor of English-language comic books, graphic novels, and related pop culture merchandise for comic shops and specialty retailers.
            </p>
            
            <p>
              We do <strong>not</strong> publish comic books. Instead, we solicit and distribute finished printed materials to our retailer network.
            </p>

            <p>
              We produce a monthly catalog, used by retailers and consumers to place preorders.
            </p>

            <p>
              These preorders determine how many units we order from publishers. Once the product is shipped to our location, Philbo fulfills retailer preorders on your behalf.
            </p>
          </div>
        </div>

        {/* Section 1b: What We Are Looking For */}
        <div className="glass-panel" style={{ padding: '40px' }}>
          <h2 style={{ color: 'var(--gold-primary)', fontSize: '1.4rem', marginBottom: '20px', borderBottom: '1px solid var(--border-glow)', paddingBottom: '10px', letterSpacing: '0.05em' }}>
            🎯 WHAT WE ARE LOOKING FOR
          </h2>
          
          <ul style={{ color: 'var(--text-secondary)', lineHeight: '1.8', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '15px', fontSize: '0.95rem' }}>
            <li>
              <strong style={{ color: '#fff' }}>Ongoing Series & Projects:</strong> Regularly offering multiple titles to the direct market. We will accept a limited amount of mini-series and short-term projects on a case-by-case basis to be reviewed and approved by the owner.
            </li>
            <li>
              <strong style={{ color: '#fff' }}>Outreach & Marketing:</strong> Robust marketing and outreach plans to drive preorders.
            </li>
            <li>
              <strong style={{ color: '#fff' }}>Production Pipelines:</strong> Established relationships with printers for timely delivery.
            </li>
            <li>
              <strong style={{ color: '#fff' }}>Industry Knowledge:</strong> Clear understanding of publishing and print-production fundamentals.
            </li>
            <li>
              <strong style={{ color: '#fff' }}>Sales History:</strong> Prior retail or direct sales experience in comic books and pop culture.
            </li>
            <li>
              <strong style={{ color: '#fff' }}>Financial Health:</strong> Sufficient financial resources to support a product line for 1-2 years.
            </li>
          </ul>
        </div>

        {/* Section 1c: Submission Package Checklist */}
        <div className="glass-panel" style={{ padding: '40px' }}>
          <h2 style={{ color: 'var(--gold-primary)', fontSize: '1.4rem', marginBottom: '20px', borderBottom: '1px solid var(--border-glow)', paddingBottom: '10px', letterSpacing: '0.05em' }}>
            📦 WHAT TO INCLUDE IN YOUR SUBMISSION PACKAGE
          </h2>
          
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '20px', lineHeight: '1.6' }}>
            To submit your line for distribution approval, please prepare a submission package containing:
          </p>

          <ul style={{ color: 'var(--text-secondary)', lineHeight: '1.8', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '15px', fontSize: '0.95rem' }}>
            <li>
              <strong style={{ color: '#fff' }}>Cover Letter:</strong> Introducing yourself, your background, and your publishing company.
            </li>
            <li>
              <strong style={{ color: '#fff' }}>Digital Copies:</strong> Completed digital copies (PDFs) of all books you wish to distribute immediately.
            </li>
            <li>
              <strong style={{ color: '#fff' }}>Product Information Sheets:</strong> Completed sheets detailing product specifications for each title (see templates/spec specifications on our services page).
            </li>
            <li>
              <strong style={{ color: '#fff' }}>Production Schedule:</strong> An outline or schedule covering the next 6 to 12 months of releases.
            </li>
            <li>
              <strong style={{ color: '#fff' }}>Detailed Marketing Plan:</strong> Specifically outlining how you will drive customers to comic shops to preorder your product from the <strong>PHILBO CATALOG</strong>.
            </li>
            <li>
              <strong style={{ color: '#fff' }}>Additional Info:</strong> Any other relevant company background, press kits, or future portfolio plans.
            </li>
          </ul>
        </div>

        {/* Section 2: Distribution Cycle Steps */}
        <div className="glass-panel" style={{ padding: '40px' }}>
          <h2 style={{ color: 'var(--gold-primary)', fontSize: '1.4rem', marginBottom: '25px', borderBottom: '1px solid var(--border-glow)', paddingBottom: '10px', letterSpacing: '0.05em' }}>
            ⚙️ THE DISTRIBUTION WORKFLOW
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
            
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '6px', border: '1px solid var(--border-glow)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '10px' }}>1️⃣</div>
              <h4 style={{ color: '#fff', marginBottom: '8px' }}>Solicitation</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5', margin: 0 }}>
                Publishers submit print specifications and metadata 2 months before release.
              </p>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '6px', border: '1px solid var(--border-glow)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '10px' }}>2️⃣</div>
              <h4 style={{ color: '#fff', marginBottom: '8px' }}>Preordering</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5', margin: 0 }}>
                Retailers place orders based on the monthly solicitation catalog.
              </p>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '6px', border: '1px solid var(--border-glow)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '10px' }}>3️⃣</div>
              <h4 style={{ color: '#fff', marginBottom: '8px' }}>Fulfillment</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5', margin: 0 }}>
                Once printed books arrive, we pack, route, and ship them to shops.
              </p>
            </div>

          </div>
        </div>

        {/* Section 3: Call to Action */}
        <div style={{ textAlign: 'center', marginTop: '20px', marginBottom: '40px' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
            Ready to list your upcoming titles on our platform?
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
            <button className="btn btn-primary" onClick={() => onNavigate('apply')}>
              Apply for Account
            </button>
            <button className="btn btn-secondary" onClick={() => onNavigate('services')}>
              View Specifications
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
