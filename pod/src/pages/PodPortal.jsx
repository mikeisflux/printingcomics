import React, { useMemo, useState } from 'react';
import { db } from '../firebase-mock';

const PUBLIC_COMIC_PRICING = {
  bw: { 20: 2.10, 24: 2.20, 28: 2.30, 32: 2.40, 36: 2.50, 40: 2.60, 44: 2.70, 48: 2.80, 52: 2.90, 56: 3.00, 60: 3.10, 64: 3.20, 68: 3.30, 72: 3.40, 76: 3.50, 80: 3.60 },
  color: { 20: 2.50, 24: 2.60, 28: 2.70, 32: 2.80, 36: 2.90, 40: 3.00, 44: 3.10, 48: 3.20, 52: 3.30, 56: 3.40, 60: 3.50, 64: 3.60, 68: 3.70, 72: 3.80, 76: 3.90, 80: 4.00 }
};

const CROWDFUNDING_COMIC_PRICING = {
  bw: { 20: 3.25, 24: 3.35, 28: 3.45, 32: 3.55, 36: 3.65, 40: 3.65, 44: 3.75, 48: 3.85, 52: 3.95, 56: 4.05, 60: 4.15, 64: 4.25, 68: 4.35, 72: 4.45, 76: 4.55, 80: 4.65 },
  color: { 20: 3.25, 24: 3.35, 28: 3.45, 32: 3.55, 36: 3.65, 40: 3.65, 44: 3.75, 48: 3.85, 52: 3.95, 56: 4.05, 60: 4.15, 64: 4.25, 68: 4.35, 72: 4.45, 76: 4.55, 80: 4.65 }
};

const COMIC_PRICING = { public: PUBLIC_COMIC_PRICING, crowdfunding: CROWDFUNDING_COMIC_PRICING };

const INTERIOR_STOCKS = ['60# Lynx Super Smooth Text'];
const COVER_STOCKS = ['70# Gloss Cover', '60# Matte Cover', '80# Super Smooth Sketch Cover'];

const PRODUCTS = [
  { id: 'self-cover-comics', name: 'Comic Books', description: 'One comic product with all interior-paper and cover-stock options in one place.', longDescription: 'Choose the project type, interior paper, and cover stock for one standard comic-book order. Page count includes the cover. Pricing updates automatically for public POD or crowdfunding fulfillment.', active: true, priced: true, visual: 'comic' },
  { id: 'art-prints', name: 'Art Prints', description: 'Coming soon on 130# cover: 11″ × 17″ for $1.15 each or 6″ × 9″ for $0.62 each.', active: false, priced: true, visual: 'print' },
  { id: 'business-cards', name: 'Business Cards', description: 'Professional cards for creators and studios.', active: false, visual: 'cards' },
  { id: 'trading-cards', name: 'Trading Cards', description: 'Collectible cards and promotional sets.', active: false, visual: 'trading' }
];

const INITIAL_FORM = {
  projectTitle: '',
  quantity: 100,
  pricingSchedule: 'public',
  pageCount: 24,
  interiorColor: 'color',
  interiorPaper: INTERIOR_STOCKS[0],
  coverType: COVER_STOCKS[0],
  finishedSize: '',
  proofPreference: 'Digital proof',
  variants: 0,
  usePhilboPodLogo: false,
  requestedSpecifications: '',
  additionalInformation: '',
  artworkFileName: ''
};

export default function PodPortal({ user, activeSection = 'dashboard', setActiveSection }) {
  const [podProfile, setPodProfile] = useState(() => ({ ...user, ...(user.roleProfiles?.pod || {}) }));
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [orders, setOrders] = useState(() => db.getPodOrders(user));
  const [message, setMessage] = useState('');
  const [certificateForm, setCertificateForm] = useState(() => ({
    resaleCertificateNumber: user.resaleCertificateNumber || '',
    resaleCertificateState: user.resaleCertificateState || '',
    resaleCertificateExpiration: user.resaleCertificateExpiration || '',
    resaleCertificateFileName: '',
    resaleCertificateFileSize: 0
  }));
  const [profileMessage, setProfileMessage] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const selectedProduct = PRODUCTS.find(product => product.id === selectedProductId);

  const price = useMemo(() => {
    if (selectedProductId !== 'self-cover-comics') return { unitPrice: null, baseSubtotal: null, discountAmount: null, subtotal: null };
    const unitPrice = COMIC_PRICING[form.pricingSchedule]?.[form.interiorColor]?.[Number(form.pageCount)] || 0;
    const baseSubtotal = Number((unitPrice * Math.max(1, Number(form.quantity) || 0)).toFixed(2));
    const discountAmount = form.usePhilboPodLogo ? Number((baseSubtotal * 0.05).toFixed(2)) : 0;
    return { unitPrice, baseSubtotal, discountAmount, subtotal: Number((baseSubtotal - discountAmount).toFixed(2)) };
  }, [selectedProductId, form.pricingSchedule, form.interiorColor, form.pageCount, form.quantity, form.usePhilboPodLogo]);

  const updateForm = (field, value) => setForm(previous => ({ ...previous, [field]: value }));
  const chooseProduct = product => {
    if (!product.active) return;
    setSelectedProductId(product.id);
    setForm(INITIAL_FORM);
    setMessage('');
    window.setTimeout(() => document.querySelector('.pod-order-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const submitOrder = event => {
    event.preventDefault();
    try {
      const requestedSpecifications = selectedProduct.id === 'art-prints'
        ? [`Finished size: ${form.finishedSize}`, form.requestedSpecifications.trim()].filter(Boolean).join('\n')
        : form.requestedSpecifications;
      const order = db.submitPodOrder({
        ...form,
        interiorPaper: selectedProduct.id === 'self-cover-comics' ? form.interiorPaper : null,
        coverType: selectedProduct.id === 'self-cover-comics' ? form.coverType : null,
        requestedSpecifications,
        productType: selectedProduct.id,
        productName: selectedProduct.name
      });
      setOrders(db.getPodOrders(user));
      setMessage(`${order.podOrderId} submitted successfully. ${order.subtotal != null ? `Printing subtotal: $${order.subtotal.toFixed(2)}.` : 'Philbo will prepare the price quote.'}`);
      setForm(INITIAL_FORM);
      setSelectedProductId(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setMessage(error.message);
    }
  };

  const openOrdering = () => {
    setActiveSection('pod-projects');
    setSelectedProductId(null);
  };

  const saveCertificate = event => {
    event.preventDefault();
    setProfileMessage('');
    try {
      const updated = db.updatePodProfile(certificateForm);
      setPodProfile(current => ({ ...current, ...updated }));
      setCertificateForm(current => ({ ...current, resaleCertificateFileName: '', resaleCertificateFileSize: 0 }));
      setProfileMessage(certificateForm.resaleCertificateFileName
        ? 'Resale certificate submitted for Philbo review. Tax will continue to apply until it is approved.'
        : 'Tax information saved.');
      const fileInput = event.currentTarget.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';
    } catch (error) {
      setProfileMessage(error.message || 'The tax information could not be saved.');
    }
  };

  const changePassword = () => {
    setPasswordMessage('');
    if (newPassword.length < 12) {
      setPasswordMessage('Use at least 12 characters for the new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage('The new passwords do not match.');
      return;
    }
    try {
      db.changeOwnPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Password changed. For security, please sign in again with the new password.');
    } catch (error) {
      setPasswordMessage(error.message || 'The password could not be changed.');
    }
  };

  return (
    <div className="pod-portal animate-fade-in">
      {message && <div className="pod-order-message" role="status">{message}</div>}

      {activeSection === 'dashboard' && (
        <div className="pod-account-dashboard">
          <section className="pod-account-hero">
            <div>
              <span className="pod-kicker">PHILBO PRINT ON DEMAND</span>
              <h2>Print the project you need. No crowded estimate form.</h2>
              <p>Choose a product, configure the essentials, review the price or quote status, and submit the project directly from your approved POD account.</p>
              <button className="btn pod-primary-button" onClick={openOrdering}>Start a POD Order</button>
            </div>
            <div className="pod-account-status">
              <span className="badge pod-approved-badge">Account Approved</span>
              <strong>{user.companyName}</strong>
              <small>{orders.length} POD order{orders.length === 1 ? '' : 's'} submitted</small>
            </div>
          </section>

          <div className="pod-dashboard-grid">
            <button className="glass-panel pod-dashboard-action" onClick={openOrdering}><strong>Order Printing</strong><span>Choose a product and submit specifications</span></button>
            <button className="glass-panel pod-dashboard-action" onClick={() => setActiveSection('pod-projects')}><strong>Orders & Quotes</strong><span>Review submitted projects and status</span></button>
            <button className="glass-panel pod-dashboard-action" onClick={() => setActiveSection('profile')}><strong>Company Profile</strong><span>Review account and shipping information</span></button>
          </div>
        </div>
      )}

      {activeSection === 'pod-projects' && (
        <div className="pod-ordering-page">
          <header className="pod-ordering-header">
            <span className="pod-kicker">POD PRODUCTS</span>
            <h2>What are you printing?</h2>
            <p>Comic Books are available now with public price-sheet pricing. Art Prints and additional products will open as their production workflows are finalized.</p>
          </header>

          <div className="pod-product-grid">
            {PRODUCTS.map(product => (
              <button
                type="button"
                key={product.id}
                className={`pod-product-card ${product.active ? 'is-active' : 'is-coming-soon'} ${selectedProductId === product.id ? 'is-selected' : ''}`}
                onClick={() => chooseProduct(product)}
                disabled={!product.active}
              >
                <div className={`pod-product-visual pod-product-${product.visual}`} aria-hidden="true"><span></span></div>
                <div className="pod-product-card-copy">
                  <span className={`pod-product-status ${product.active ? '' : 'coming'}`}>{product.active ? product.priced ? 'Instant pricing' : 'Quote pricing' : 'Coming soon'}</span>
                  <strong>{product.name}</strong>
                  <p>{product.description}</p>
                  <span className="pod-product-action">{product.active ? 'Configure →' : 'Coming Soon'}</span>
                </div>
              </button>
            ))}
          </div>

          {selectedProduct && (
            <form className="pod-order-builder" onSubmit={submitOrder}>
              <div className="pod-order-builder-heading">
                <div><span className="pod-kicker">NEW POD ORDER</span><h3>{selectedProduct.name}</h3><p>{selectedProduct.longDescription || (selectedProduct.priced ? 'Public price-sheet pricing updates as you configure the comic.' : 'Submit the project specifications and Philbo will return a price quote before production.')}</p></div>
                <button type="button" className="btn btn-secondary" onClick={() => setSelectedProductId(null)}>Choose Another Product</button>
              </div>

              <div className="pod-order-builder-layout">
                <div className="pod-order-form-panel">
                  <div className="pod-order-step">
                    <span className="pod-step-number">1</span>
                    <div><strong>Project</strong><small>Name the project and tell us how many copies you need.</small></div>
                  </div>
                  <div className="pod-form-grid">
                    <label className="pod-field pod-field-wide"><span>Project title *</span><input className="form-input" required value={form.projectTitle} onChange={event => updateForm('projectTitle', event.target.value)} placeholder="Example: The Last Spark #2" /></label>
                    <label className="pod-field"><span>Quantity *</span><input className="form-input" type="number" min="1" required value={form.quantity} onChange={event => updateForm('quantity', event.target.value)} /></label>
                    {selectedProduct.id === 'self-cover-comics' && <label className="pod-field"><span>Project type *</span><select className="form-select" value={form.pricingSchedule} onChange={event => updateForm('pricingSchedule', event.target.value)}><option value="public">Standard / public POD</option><option value="crowdfunding">Crowdfunding fulfillment</option></select></label>}
                    {selectedProduct.id === 'art-prints' ? (
                      <label className="pod-field"><span>Finished size *</span><input className="form-input" required value={form.finishedSize} onChange={event => updateForm('finishedSize', event.target.value)} placeholder="Example: 11″ × 17″" /></label>
                    ) : (
                      <label className="pod-field"><span>Variants</span><select className="form-select" value={form.variants} onChange={event => updateForm('variants', event.target.value)}><option value="0">No variants</option><option value="1">1 variant</option><option value="2">2 variants</option><option value="3">3 variants</option></select></label>
                    )}
                  </div>

                  <div className="pod-order-step">
                    <span className="pod-step-number">2</span>
                    <div><strong>Specifications</strong><small>Select only the choices that apply to this product.</small></div>
                  </div>

                  {selectedProduct.id === 'self-cover-comics' ? (
                    <>
                      <div className="pod-form-grid">
                        <label className="pod-field"><span>Page count, including cover *</span><select className="form-select" value={form.pageCount} onChange={event => updateForm('pageCount', event.target.value)}>{Object.keys(PUBLIC_COMIC_PRICING.bw).map(pages => <option key={pages} value={pages}>{pages} pages</option>)}</select></label>
                        <label className="pod-field"><span>Interior printing *</span><select className="form-select" value={form.interiorColor} onChange={event => updateForm('interiorColor', event.target.value)}><option value="color">Full color</option><option value="bw">Black & white / grayscale</option></select></label>
                        <label className="pod-field"><span>Interior pages *</span><select className="form-select" value={form.interiorPaper} onChange={event => updateForm('interiorPaper', event.target.value)}>{INTERIOR_STOCKS.map(stock => <option key={stock} value={stock}>{stock}</option>)}</select></label>
                        <div className="pod-fixed-spec"><span>Comic size</span><strong>6.625″ × 10.25″</strong><small>Current standard size</small></div>
                        <label className="pod-field"><span>Cover stock *</span><select className="form-select" value={form.coverType} onChange={event => updateForm('coverType', event.target.value)}>{COVER_STOCKS.map(stock => <option key={stock} value={stock}>{stock}{stock === '60# Matte Cover' ? ' — ★ Favorite' : ''}</option>)}</select></label>
                      </div>
                      <div className="pod-spread-note"><strong>PLEASE BE SURE TO CALCULATE YOUR SPREADS FOR THE CORRECT PAGES</strong><span>The page count includes the cover. In a 24-page PDF, the true center two-page spread is PDF pages 12–13. Any other two-page spread should begin on an even-numbered left page and continue onto the following odd-numbered right page.</span></div>
                      <div className="pod-ad-requirement"><strong>Inside back cover requirement</strong><span>Public price-sheet pricing requires one Philbo POD advertisement on the inside back cover.</span></div>
                      <div className="pod-template-download">
                        <img src="/assets/brand/philbo-dragon-3d.png" alt="" />
                        <div><strong>Start with the official Philbo comic template</strong><span>True 6.875″ × 10.5″ full-bleed canvas at 300 DPI, with clearly marked trim and safe areas.</span></div>
                        <div className="pod-template-actions"><a className="btn btn-secondary" href="/downloads/Philbo-POD-standard-comic-template.pdf" download>Download PDF</a><a className="btn btn-secondary" href="/downloads/Philbo-POD-standard-comic-template-300dpi.png" download>Download PNG</a></div>
                      </div>
                    </>
                  ) : (
                    <div className="pod-quote-specifications">
                      <label className="pod-field pod-field-wide"><span>{selectedProduct.id === 'art-prints' ? 'Additional print instructions' : 'Page count, color, and finishing details *'}</span><textarea className="form-textarea" required={selectedProduct.id !== 'art-prints'} rows="4" value={form.requestedSpecifications} onChange={event => updateForm('requestedSpecifications', event.target.value)} placeholder={selectedProduct.id === 'art-prints' ? 'Optional: color, finishing, deadline, or intended use.' : 'Tell us the page count, interior color, and any finishing requirements.'} /></label>
                    </div>
                  )}

                  <label className={`pod-logo-discount ${form.usePhilboPodLogo ? 'is-selected' : ''}`}>
                    <input type="checkbox" checked={form.usePhilboPodLogo} onChange={event => updateForm('usePhilboPodLogo', event.target.checked)} />
                    <span className="pod-logo-discount-preview"><img src="/assets/brand/philbo-pod-discount-logo.png" alt="Philbo Print on Demand logo" /></span>
                    <span className="pod-logo-discount-copy"><strong>Add the Philbo POD logo and save 5%</strong><small>Allow the Philbo Print on Demand logo to appear on the finished project. The 5% discount applies to the entire printing subtotal.</small></span>
                    <span className="pod-logo-discount-value">−5%</span>
                  </label>

                  <div className="pod-order-step">
                    <span className="pod-step-number">3</span>
                    <div><strong>Files & review</strong><small>Attach the current artwork or submit the order and provide files afterward.</small></div>
                  </div>
                  <div className="pod-form-grid">
                    <label className="pod-field"><span>Proof preference</span><select className="form-select" value={form.proofPreference} onChange={event => updateForm('proofPreference', event.target.value)}><option>Digital proof</option><option>Printed proof</option><option>No proof requested</option></select></label>
                    <label className="pod-field pod-file-field"><span>Artwork file</span><input type="file" accept=".pdf,.zip" onChange={event => updateForm('artworkFileName', event.target.files?.[0]?.name || '')} /><small>{form.artworkFileName || 'PDF or ZIP. Large-file upload instructions can be provided after submission.'}</small></label>
                    <label className="pod-field pod-field-wide"><span>Additional information</span><textarea className="form-textarea" rows="4" value={form.additionalInformation} onChange={event => updateForm('additionalInformation', event.target.value)} placeholder="Deadlines, packaging, shipping destinations, convention dates, or anything else we should know." /></label>
                  </div>
                </div>

                <aside className="pod-order-summary">
                  <span className="pod-kicker">ORDER SUMMARY</span>
                  <h4>{selectedProduct.name}</h4>
                  <dl>
                    <div><dt>Quantity</dt><dd>{Math.max(1, Number(form.quantity) || 0).toLocaleString()}</dd></div>
                    {selectedProduct.id === 'self-cover-comics' && <><div><dt>Pricing</dt><dd>{form.pricingSchedule === 'crowdfunding' ? 'Crowdfunding fulfillment' : 'Standard / public POD'}</dd></div><div><dt>Pages</dt><dd>{form.pageCount}</dd></div><div><dt>Interior</dt><dd>{form.interiorColor === 'color' ? 'Full color' : 'Black & white / grayscale'}</dd></div><div><dt>Paper</dt><dd>{form.interiorPaper}</dd></div><div><dt>Cover</dt><dd>{form.coverType}</dd></div></>}
                    {selectedProduct.id === 'art-prints' && <div><dt>Finished size</dt><dd>{form.finishedSize || 'Not entered'}</dd></div>}
                    {selectedProduct.id === 'self-cover-comics' && <div><dt>Comic size</dt><dd>6.625″ × 10.25″</dd></div>}
                    <div><dt>Philbo POD logo</dt><dd>{form.usePhilboPodLogo ? 'Included · 5% savings' : 'Not included'}</dd></div>
                    <div><dt>Proof</dt><dd>{form.proofPreference}</dd></div>
                  </dl>
                  {price.unitPrice != null ? (
                    <div className="pod-price-total">
                      <div><span>Price per copy</span><strong>${price.unitPrice.toFixed(2)}</strong></div>
                      {form.usePhilboPodLogo && <><div><span>Printing subtotal</span><strong>${price.baseSubtotal.toFixed(2)}</strong></div><div className="pod-logo-discount-line"><span>Philbo POD logo discount (5%)</span><strong>−${price.discountAmount.toFixed(2)}</strong></div></>}
                      <div className="pod-price-grand"><span>Printing subtotal</span><strong>${price.subtotal.toFixed(2)}</strong></div>
                      <small>{form.pricingSchedule === 'crowdfunding' ? 'Crowdfunding packing, shipping, and applicable taxes are confirmed after order review.' : 'Shipping and applicable taxes are calculated after order review.'}</small>
                    </div>
                  ) : (
                    <div className="pod-quote-summary"><strong>Quote required</strong><p>Philbo will review the specifications and send pricing before the order enters production.{form.usePhilboPodLogo ? ' Your 5% Philbo POD logo discount will be applied to the final printing quote.' : ''}</p></div>
                  )}
                  <button className="btn pod-primary-button pod-submit-order" type="submit">{selectedProduct.priced ? 'Submit POD Order' : 'Request Price Quote'}</button>
                </aside>
              </div>
            </form>
          )}

          <section className="pod-order-history">
            <div><span className="pod-kicker">YOUR ACCOUNT</span><h3>Orders & quote requests</h3></div>
            {!orders.length ? <p className="pod-empty-orders">No POD orders have been submitted yet.</p> : (
              <div className="pod-order-history-list">
                {orders.map(order => (
                  <article key={order.podOrderId} className="pod-order-history-card">
                    <div><span>{order.podOrderId}</span><strong>{order.projectTitle}</strong><small>{order.productName} · {order.quantity} copies · {new Date(order.submittedAt).toLocaleString()}</small></div>
                    <div><span className="badge pod-order-status">{order.status}</span><strong>{order.subtotal != null ? `$${order.subtotal.toFixed(2)}` : 'Quote pending'}</strong><small>{order.paymentStatus}</small></div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {activeSection === 'profile' && (
        <div className="pod-profile-page">
          <section className="glass-panel pod-profile-panel">
            <span className="pod-kicker">COMPANY DETAILS</span>
            <h2>POD ACCOUNT PROFILE</h2>
            <div className="pod-profile-grid">
              <div><span>Company</span><strong>{user.companyName}</strong></div>
              <div><span>Email</span><strong>{user.email}</strong></div>
              <div><span>Customer Type</span><strong>{podProfile.customerType || 'Not provided'}</strong></div>
              <div><span>Expected Quantities</span><strong>{podProfile.expectedQuantity || 'Not provided'}</strong></div>
              <div className="pod-profile-wide"><span>Shipping Address</span><strong>{[podProfile.shippingAddress1, podProfile.shippingAddress2, [podProfile.shippingCity, podProfile.shippingState, podProfile.shippingZip].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Not provided'}</strong></div>
            </div>
          </section>

          <form className="glass-panel pod-profile-panel" onSubmit={saveCertificate}>
            <span className="pod-kicker">SALES TAX</span>
            <div className="pod-profile-heading">
              <div><h2>RESALE CERTIFICATE</h2><p>Optional. Submit a current resale certificate if this POD account may qualify for tax-exempt printing purchases.</p></div>
              <span className={`badge pod-tax-status pod-tax-${String(podProfile.resaleCertificateStatus || 'not-submitted').toLowerCase().replace(/\s+/g, '-')}`}>{podProfile.resaleCertificateStatus || 'Not Submitted'}</span>
            </div>
            <div className="pod-profile-form-grid">
              <label className="pod-field"><span>Certificate number</span><input className="form-input" value={certificateForm.resaleCertificateNumber} onChange={event => setCertificateForm(current => ({ ...current, resaleCertificateNumber: event.target.value }))} /></label>
              <label className="pod-field"><span>Issuing state</span><input className="form-input" maxLength="2" placeholder="OH" value={certificateForm.resaleCertificateState} onChange={event => setCertificateForm(current => ({ ...current, resaleCertificateState: event.target.value.toUpperCase() }))} /></label>
              <label className="pod-field"><span>Expiration date</span><input className="form-input" type="date" value={certificateForm.resaleCertificateExpiration} onChange={event => setCertificateForm(current => ({ ...current, resaleCertificateExpiration: event.target.value }))} /></label>
              <label className="pod-field pod-file-field"><span>Certificate file</span><input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={event => {
                const file = event.target.files?.[0];
                setCertificateForm(current => ({ ...current, resaleCertificateFileName: file?.name || '', resaleCertificateFileSize: file?.size || 0 }));
              }} /><small>{certificateForm.resaleCertificateFileName || podProfile.resaleCertificateFileName || 'PDF, PNG, JPG, or JPEG'}</small></label>
            </div>
            {podProfile.resaleCertificateFileName && <div className="pod-certificate-current"><strong>Current certificate</strong><span>{podProfile.resaleCertificateFileName}</span><small>{podProfile.taxExempt ? 'Approved—eligible for tax-exempt treatment.' : podProfile.resaleCertificateStatus === 'Rejected' ? 'Rejected—tax remains applicable. Upload a corrected certificate for another review.' : 'Tax remains applicable until Philbo approves the certificate.'}</small></div>}
            {profileMessage && <div className={`pod-profile-message ${profileMessage.includes('submitted') || profileMessage.includes('saved') ? 'success' : 'error'}`} role="status">{profileMessage}</div>}
            <button className="btn pod-primary-button" type="submit">Save Tax Information</button>
          </form>

          <section className="glass-panel pod-profile-panel">
            <span className="pod-kicker">ACCOUNT SECURITY</span>
            <h2>CHANGE PASSWORD</h2>
            <p className="pod-profile-description">Use at least 12 characters. Changing the password signs this account out everywhere.</p>
            <div className="pod-profile-form-grid">
              <label className="pod-field"><span>Current password</span><input className="form-input" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
              <label className="pod-field"><span>New password</span><input className="form-input" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
              <label className="pod-field"><span>Confirm new password</span><input className="form-input" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
            </div>
            {passwordMessage && <div className={`pod-profile-message ${passwordMessage.startsWith('Password changed') ? 'success' : 'error'}`} role="status">{passwordMessage}</div>}
            <button className="btn btn-secondary" type="button" onClick={changePassword}>Change Password</button>
          </section>
        </div>
      )}
    </div>
  );
}
