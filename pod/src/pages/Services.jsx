import React from 'react';

export default function Services({ onNavigate }) {
  const assetPath = (path) => `${window.location.protocol === 'file:' ? './public/assets' : '/assets'}/${path}`;
  const [videoFailed, setVideoFailed] = React.useState(false);
  return (
    <div className="pod-public-page animate-fade-in">
      <section className="pod-public-hero">
        <div className={`pod-flyby-wrap${videoFailed ? ' video-failed' : ''}`}>
          {!videoFailed && (
            <video
              className="pod-flyby-animation"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster={assetPath('brand/philbo-pod-green.png')}
              onCanPlay={(event) => event.currentTarget.play().catch(() => {})}
              onError={() => setVideoFailed(true)}
              aria-label="Animated Print on Demand logo"
            >
              <source src={assetPath('video/philbo-pod-flyby.mp4')} type="video/mp4" />
              <source src={assetPath('video/philbo-pod-flyby.mov')} type="video/quicktime" />
            </video>
          )}
          <img className="pod-flyby-static" src={assetPath('brand/philbo-pod-green.png')} alt="Print on Demand" />
        </div>
        <span className="audience-eyebrow">APPROVED ACCOUNT SERVICE</span>
        <h1>Create More. Ship Less.</h1>
        <p>Print comic projects, convention copies, campaign rewards, and restocks without committing to unnecessary inventory.</p>
        <div className="audience-actions">
          <button className="btn btn-primary pod-apply-button" onClick={() => onNavigate('apply-pod')}>SUBMIT FOR A QUOTE</button>
          <button className="btn btn-secondary" onClick={() => onNavigate('login')}>EXISTING POD CUSTOMER LOGIN</button>
        </div>
      </section>

      <section className="pod-public-notice">
        <strong>Account approval is required.</strong>
        <p>File uploads, project requests, quotes, account pricing, and production orders are available through an approved account.</p>
      </section>

      <section className="audience-benefits pod-public-benefits">
        {[
          ['Print what the project needs', 'Support short runs, retailer demand, publisher copies, conventions, crowdfunding campaigns, and ongoing restocks.'],
          ['Files stay connected', 'Cover and interior files move through review, corrections, approval, production, and version history in one workflow.'],
          ['Know the costs before release', 'Printing, additional copies, and estimated shipping are presented before a production request is approved.'],
          ['Production status stays visible', 'Track requests from quote and file review through print-ready, production, packing, and shipment.'],
          ['Repeat projects stay simple', 'Keep project specifications, file notes, quotes, and order history together so reprints and restocks are easier to request.'],
          ['Real support when details matter', 'Questions, corrections, approvals, and production updates stay connected to the project instead of getting lost across separate emails.']
        ].map(([title, copy]) => <article className="audience-benefit" key={title}><span className="audience-check">✓</span><div><h2>{title}</h2><p>{copy}</p></div></article>)}
      </section>

      <section className="pod-spec-section">
        <div><span className="audience-eyebrow">STARTING FILE SPECIFICATIONS</span><h2>Prepare clean, production-ready files.</h2><p>Final specifications may vary by project and quote. These are the current standard-comic starting points.</p></div>
        <div className="pod-spec-grid">
          <div><strong>Standard Trim</strong><span>6.625 × 10.25 inches</span></div>
          <div><strong>Bleed</strong><span>0.125 inches on outer edges</span></div>
          <div><strong>Resolution</strong><span>300 DPI or higher</span></div>
          <div><strong>Color</strong><span>CMYK production files</span></div>
          <div><strong>Interior</strong><span>Flattened print-ready PDF</span></div>
          <div><strong>Safety Margin</strong><span>0.25 inches from trim</span></div>
        </div>
      </section>

      <section className="audience-process">
        <span className="audience-eyebrow">HOW A POD QUOTE WORKS</span>
        <h2>Approval first. Production second.</h2>
        <div className="audience-steps">
          {['Submit your company, project, quantity, page-count, and fulfillment information for a quote.', 'Your request is reviewed and priced.', 'If you move forward, create a password from the portal invitation.', 'Upload files, approve production, and follow the project through the POD portal.'].map((step, index) => <div key={step}><strong>{index + 1}</strong><p>{step}</p></div>)}
        </div>
      </section>

      <section className="audience-final-cta">
        <h2>Ready to discuss a print project?</h2>
        <p>Submit your project details for specification review and a custom quote.</p>
        <div className="audience-actions"><button className="btn btn-primary pod-apply-button" onClick={() => onNavigate('apply-pod')}>SUBMIT FOR A QUOTE</button><button className="btn btn-secondary" onClick={() => onNavigate('login')}>POD CUSTOMER LOGIN</button></div>
      </section>
    </div>
  );
}
