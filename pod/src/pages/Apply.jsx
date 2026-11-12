import React, { useState } from 'react';
import { db } from '../firebase-mock';
import LogoIcon from './LogoIcon';
import { isProductionBackendEnabled } from '../lib/supabase';
import { submitPortalApplication } from '../lib/backend';

const normalizeWebsite = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (!parsed.hostname || !parsed.hostname.includes('.')) throw new Error('Please enter a website such as defshogun.com.');
  return parsed.toString();
};

export default function Apply({ onNavigate, initialRole = 'retailer' }) {
  const [role, setRole] = useState(initialRole);
  
  // Common Registration States
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [website, setWebsite] = useState('');
  const [subscribeNews, setSubscribeNews] = useState(false);
  const [phoneCountryCode, setPhoneCountryCode] = useState('+1');
  const [phoneNumber, setPhoneNumber] = useState('');
  
  // Mailing Address (For Retailers)
  const [shippingAddress1, setShippingAddress1] = useState('');
  const [shippingAddress2, setShippingAddress2] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingState, setShippingState] = useState('');
  const [shippingZip, setShippingZip] = useState('');
  const [shippingCountry, setShippingCountry] = useState('US');

  // Retailer Specific Business Details
  const [yearsInBusiness, setYearsInBusiness] = useState('');
  const [salesChannels, setSalesChannels] = useState([]);
  const [taxId, setTaxId] = useState('');
  const [resaleCertificate, setResaleCertificate] = useState(null);

  // Publisher Specific Submission Package States
  const [publisherLogoFile, setPublisherLogoFile] = useState(null);
  const [publisherLogoPreview, setPublisherLogoPreview] = useState('');
  const [coverLetterFile, setCoverLetterFile] = useState(null);
  const [bookPdfFile, setBookPdfFile] = useState(null);
  const [scheduleFile, setScheduleFile] = useState(null);
  const [marketingPlanFile, setMarketingPlanFile] = useState(null);
  const [companyInfoText, setCompanyInfoText] = useState('');

  // POD Account Details
  const [customerType, setCustomerType] = useState('Publisher');
  const [projectTypes, setProjectTypes] = useState('Comic books');
  const [expectedQuantity, setExpectedQuantity] = useState('');
  const [pageCountRange, setPageCountRange] = useState('');
  const [printingFrequency, setPrintingFrequency] = useState('Occasional projects');
  const [fulfillmentNeeds, setFulfillmentNeeds] = useState('');

  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const channelOptions = ['Online', 'Brick and Mortar', 'Conventions', 'Whatnot', 'Other'];
  const FILE_SIZE_LIMIT_MB = 50;
  const LOGO_SIZE_LIMIT_MB = 1;

  const handleChannelToggle = (channel) => {
    setSalesChannels(prev => 
      prev.includes(channel) 
        ? prev.filter(c => c !== channel) 
        : [...prev, channel]
    );
  };

  const handleFileChange = (e, setFileState) => {
    const file = e.target.files[0];
    if (!file) return;

    // 50MB Cap Validation
    if (file.size > FILE_SIZE_LIMIT_MB * 1024 * 1024) {
      setError(`File "${file.name}" exceeds the maximum limit of ${FILE_SIZE_LIMIT_MB}MB.`);
      e.target.value = ''; // Reset input
      return;
    }

    setError('');
    setFileState(file);
  };

  const handlePublisherLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Publisher logo must be a PNG, JPG, WEBP, GIF, or SVG image.');
      e.target.value = '';
      return;
    }
    if (file.size > LOGO_SIZE_LIMIT_MB * 1024 * 1024) {
      setError(`Publisher logo exceeds the maximum limit of ${LOGO_SIZE_LIMIT_MB}MB.`);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPublisherLogoFile(file);
      setPublisherLogoPreview(String(reader.result || ''));
      setError('');
    };
    reader.onerror = () => setError('The Publisher logo could not be read. Please choose another image.');
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Common validations
    if (!email || !companyName || !firstName || !lastName || !phoneNumber || (role !== 'pod' && !website)) {
      setError('Please fill in all required fields marked with an asterisk (*).');
      return;
    }

    let normalizedWebsite = '';
    try {
      normalizedWebsite = normalizeWebsite(website);
    } catch (websiteError) {
      setError(websiteError.message || 'Please enter a valid website.');
      return;
    }

    let registerPayload = {
      firstName,
      lastName,
      website: normalizedWebsite,
      subscribeNews,
      phone: `${phoneCountryCode} ${phoneNumber}`
    };

    if (role === 'retailer') {
      // Retailer validations
      if (!shippingAddress1 || !shippingCity || !shippingState || !shippingZip || !yearsInBusiness || salesChannels.length === 0 || !taxId || !resaleCertificate) {
        setError('Please fill out all required shipping address, tax ID, and resale certificate fields.');
        return;
      }

      registerPayload = {
        ...registerPayload,
        shippingName: `${firstName} ${lastName}`,
        shippingAddress1,
        shippingAddress2,
        shippingCity,
        shippingState,
        shippingZip,
        shippingCountry,
        yearsInBusiness,
        salesChannels,
        taxId,
        resaleCertificateFileName: resaleCertificate.name
      };
    } else if (role === 'publisher') {
      // Publisher validations (no resale certificate required)
      if (!publisherLogoFile || !coverLetterFile || !bookPdfFile || !scheduleFile || !marketingPlanFile) {
        setError('Please upload your Publisher logo and all required submission files (Cover Letter, Book PDF, Schedule, Marketing Plan).');
        return;
      }

      registerPayload = {
        ...registerPayload,
        publisherLogoFileName: publisherLogoFile.name,
        publisherLogoSize: `${(publisherLogoFile.size / (1024 * 1024)).toFixed(1)}MB`,
        publisherLogoType: publisherLogoFile.type,
        publisherLogoDataUrl: publisherLogoPreview,
        coverLetterFileName: coverLetterFile.name,
        bookPdfFileName: bookPdfFile.name,
        scheduleFileName: scheduleFile.name,
        marketingPlanFileName: marketingPlanFile.name,
        companyInfoText,
        // Tag to let the system know this was routed through Google Drive Uplink
        storageUplink: 'Google Drive Cloud Storage',
        coverLetterSize: `${(coverLetterFile.size / (1024 * 1024)).toFixed(1)}MB`,
        bookPdfSize: `${(bookPdfFile.size / (1024 * 1024)).toFixed(1)}MB`,
        scheduleSize: `${(scheduleFile.size / (1024 * 1024)).toFixed(1)}MB`,
        marketingPlanSize: `${(marketingPlanFile.size / (1024 * 1024)).toFixed(1)}MB`
      };
    } else {
      if (!shippingAddress1 || !shippingCity || !shippingState || !shippingZip || !customerType || !projectTypes || !expectedQuantity || !pageCountRange || !fulfillmentNeeds) {
        setError('Please complete the POD project, shipping, and expected-production fields.');
        return;
      }
      registerPayload = {
        ...registerPayload,
        customerType,
        projectTypes,
        expectedQuantity,
        pageCountRange,
        printingFrequency,
        fulfillmentNeeds,
        shippingName: `${firstName} ${lastName}`,
        shippingAddress1,
        shippingAddress2,
        shippingCity,
        shippingState,
        shippingZip,
        shippingCountry,
        applicationType: 'POD Account'
      };
    }

    setBusy(true);
    try {
      if (isProductionBackendEnabled && window.location.hash !== '#demo') {
        await submitPortalApplication({ role, email, companyName, firstName, lastName, phone: registerPayload.phone, website: normalizedWebsite, applicationData: registerPayload });
      } else {
        db.register(email, companyName, role, registerPayload);
      }
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'An error occurred during application.');
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="animate-fade-in" style={{ padding: '80px 20px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <div className="glass-panel" style={{ padding: '50px 40px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '25px' }}>
            <LogoIcon size={70} />
          </div>
          <h2 style={{ color: role === 'pod' ? 'var(--pod-green)' : 'var(--gold-primary)', marginBottom: '15px' }}>{role === 'pod' ? 'Quote Request Submitted!' : 'Application Submitted!'}</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '30px' }}>
            {role === 'pod' ? <>Thank you. The quote request for <strong style={{ color: '#fff' }}>{companyName}</strong> has been registered.</> : <>Thank you. Your request for a <strong style={{ color: '#fff' }}>{role}</strong> account for <strong style={{ color: '#fff' }}>{companyName}</strong> has been registered.</>}
            {role === 'publisher' && (
              <span style={{ display: 'block', marginTop: '15px', color: 'var(--green-primary)', fontWeight: '500' }}>
                ✓ Your submission package was recorded. A secure file-upload step will be provided during review.
              </span>
            )}
          </p>
          {!isProductionBackendEnabled && <div style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.2)', padding: '15px', borderRadius: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '30px' }}>
            Demo mode: sign in as Admin to inspect and approve this application.
          </div>}
          <button className={`btn btn-primary ${role === 'pod' ? 'pod-selected' : ''}`} onClick={() => onNavigate('home')}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`animate-fade-in ${role === 'pod' ? 'pod-application' : ''}`} style={{ padding: '60px 20px', maxWidth: role === 'publisher' ? '1200px' : '900px', margin: '0 auto', transition: 'max-width 0.3s ease' }}>
      <div style={{ display: 'grid', gridTemplateColumns: role === 'publisher' ? 'repeat(auto-fit, minmax(400px, 1fr))' : '1fr', gap: '30px', alignItems: 'start' }}>
        
        {/* Left Column: Publisher Submission Guide */}
        {role === 'publisher' && (
          <div className="glass-panel" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '25px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ color: 'var(--gold-primary)', fontSize: '1.3rem', borderBottom: '1px solid var(--border-glow)', paddingBottom: '10px', margin: 0, letterSpacing: '0.05em' }}>
              📖 PUBLISHER SUBMISSION GUIDE
            </h2>
            
            <div style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.2)', padding: '15px', borderRadius: '6px', fontSize: '0.82rem', lineHeight: '1.5' }}>
              <strong style={{ color: 'var(--gold-primary)', display: 'block', marginBottom: '5px' }}>⚠️ DISTRIBUTION SCOPE NOTICE</strong>
              This guide is designed for publishers of <strong>printed material</strong> (comic books, graphic novels, art books, etc.). It is <strong>not intended</strong> for manufacturers of games, toys, movies, novelties, or similar merchandise (contact: contact@philboentertainment.com).
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <strong style={{ color: '#fff', fontSize: '0.9rem' }}>🤝 WHO WE ARE & WHAT WE DO</strong>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5', margin: 0 }}>
                We distribute English-language comic books, graphic novels, and related pop culture merchandise to retailers. Finished printed materials are solicited and distributed based on preorders from the monthly catalog.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <strong style={{ color: '#fff', fontSize: '0.9rem' }}>🎯 WHAT WE ARE LOOKING FOR</strong>
              <ul style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', paddingLeft: '18px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li>Regularly offering multiple titles to the direct market (mini-series on case-by-case approval).</li>
                <li>Robust marketing and outreach plans to drive retailer catalog preorders.</li>
                <li>Established relationships with printers and solid industry knowledge.</li>
                <li>Financial resources to support a product line for 1-2 years.</li>
              </ul>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <strong style={{ color: '#fff', fontSize: '0.9rem' }}>📦 SUBMISSION CHECKLIST</strong>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0 }}>
                Please prepare the following files to upload in the form on the right:
              </p>
              <ul style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', paddingLeft: '18px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li><strong>Cover Letter:</strong> Introducing yourself and your company.</li>
                <li><strong>Digital Copies:</strong> Completed print-ready PDFs of books to distribute.</li>
                <li><strong>Production Outline:</strong> 6- to 12-month release schedule.</li>
                <li><strong>Marketing Plan:</strong> Detail how you will drive shop preorders.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Right Column: Form Container */}
        <div className="glass-panel" style={{ padding: '40px 30px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '10px' }}>{role === 'pod' ? 'REQUEST A POD QUOTE' : 'PORTAL APPLICATION'}</h2>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.95rem', marginBottom: '30px' }}>
          {role === 'pod' ? 'Tell us about your print project and we will prepare the next step.' : 'Join the network. Submit your application details below.'}
        </p>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid var(--red-primary)', color: '#ff8a8a', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontSize: '0.9rem' }}>
            ✕ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Role selection tab */}
          <div className="application-role-selector">
            <button
              type="button"
              className={`btn ${role === 'retailer' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setRole('retailer')}
            >
              I am a Retailer
            </button>
            <button
              type="button"
              className={`btn ${role === 'publisher' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setRole('publisher')}
            >
              I am a Publisher
            </button>
            <button
              type="button"
              className={`btn ${role === 'pod' ? 'btn-primary pod-selected' : 'btn-secondary'}`}
              onClick={() => setRole('pod')}
            >
              I need Print on Demand
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            
            {/* Common Contact Details Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <strong style={{ color: 'var(--gold-primary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-glow)', paddingBottom: '8px' }}>
                👤 CONTACT INFORMATION
              </strong>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">First Name *</label>
                  <input type="text" className="form-input" placeholder="Clark" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Last Name *</label>
                  <input type="text" className="form-input" placeholder="Kent" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{role === 'publisher' ? 'Publishing House Name *' : 'Company / Studio Name *'}</label>
                <input type="text" className="form-input" placeholder={role === 'publisher' ? 'Indy Comic Press' : role === 'pod' ? 'Creator or Studio Name' : 'Metropolis Comics'} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Website {role === 'pod' ? '(Optional)' : '*'}</label>
                  <input type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" className="form-input" placeholder="defshogun.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Email Address *</label>
                  <input type="email" className="form-input" placeholder="comics@metropolisbooks.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Phone *</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select 
                    className="form-select" 
                    style={{ width: '90px', background: 'var(--bg-deep)' }}
                    value={phoneCountryCode}
                    onChange={(e) => setPhoneCountryCode(e.target.value)}
                  >
                    <option value="+1">US (+1)</option>
                    <option value="+44">UK (+44)</option>
                    <option value="+1-CAD">CA (+1)</option>
                    <option value="+61">AU (+61)</option>
                  </select>
                  <input type="tel" className="form-input" style={{ flex: 1 }} placeholder="(555) 000-0000" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                <input 
                  type="checkbox" 
                  id="subscribeNews" 
                  checked={subscribeNews} 
                  onChange={(e) => setSubscribeNews(e.target.checked)} 
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <label htmlFor="subscribeNews" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  Sign up for news and updates
                </label>
              </div>
            </div>

            {/* Role-Specific Workflows */}
            {role === 'retailer' ? (
              <>
                {/* Mailing Address Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <strong style={{ color: 'var(--gold-primary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-glow)', paddingBottom: '8px' }}>
                    📬 MAILING ADDRESS
                  </strong>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Address Line 1 *</label>
                    <input type="text" className="form-input" placeholder="Street Address, P.O. box" value={shippingAddress1} onChange={(e) => setShippingAddress1(e.target.value)} />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Address Line 2</label>
                    <input type="text" className="form-input" placeholder="Apartment, suite, unit, etc." value={shippingAddress2} onChange={(e) => setShippingAddress2(e.target.value)} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '15px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">City *</label>
                      <input type="text" className="form-input" placeholder="Metropolis" value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">State *</label>
                      <input type="text" className="form-input" placeholder="IL" value={shippingState} onChange={(e) => setShippingState(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Zip Code *</label>
                      <input type="text" className="form-input" placeholder="62960" value={shippingZip} onChange={(e) => setShippingZip(e.target.value)} />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Country</label>
                    <select 
                      className="form-select" 
                      style={{ background: 'var(--bg-deep)' }}
                      value={shippingCountry} 
                      onChange={(e) => setShippingCountry(e.target.value)}
                    >
                      <option value="US">United States</option>
                      <option value="CA">Canada</option>
                      <option value="UK">United Kingdom</option>
                    </select>
                  </div>
                </div>

                {/* Business Verification Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <strong style={{ color: 'var(--gold-primary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-glow)', paddingBottom: '8px' }}>
                    ⚖️ BUSINESS VERIFICATION
                  </strong>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Years in Business *</label>
                    <input type="number" className="form-input" placeholder="e.g. 5" value={yearsInBusiness} onChange={(e) => setYearsInBusiness(e.target.value)} />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>Sales Channels (Select all that apply) *</label>
                    <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                      {channelOptions.map(option => (
                        <div key={option} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input 
                            type="checkbox" 
                            id={`channel-${option}`} 
                            checked={salesChannels.includes(option)} 
                            onChange={() => handleChannelToggle(option)}
                            style={{ cursor: 'pointer' }}
                          />
                          <label htmlFor={`channel-${option}`} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>{option}</label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Tax ID / EIN *</label>
                    <input type="text" className="form-input" placeholder="e.g. 12-3456789" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Resale Certificate (PDF / Image) *</label>
                    <input 
                      type="file" 
                      accept=".pdf,.png,.jpg,.jpeg" 
                      style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}
                      onChange={(e) => handleFileChange(e, setResaleCertificate)}
                    />
                    {resaleCertificate && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--green-primary)', display: 'block', marginTop: '4px' }}>
                        ✓ Attached resale certificate file: {resaleCertificate.name}
                      </span>
                    )}
                  </div>
                </div>
              </>
            ) : role === 'publisher' ? (
              // Publisher submission package wizard
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <strong style={{ color: 'var(--gold-primary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-glow)', paddingBottom: '8px' }}>
                    🏢 PUBLISHER BRAND
                  </strong>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Publisher Logo (PNG / JPG / WEBP / GIF / SVG) *</label>
                    <input type="file" accept="image/*,.svg" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }} onChange={handlePublisherLogoChange} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '5px' }}>Maximum {LOGO_SIZE_LIMIT_MB}MB. This logo will be reviewed with the application and used for the Publisher profile.</span>
                  </div>
                  {publisherLogoPreview && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glow)', borderRadius: '6px' }}>
                      <img src={publisherLogoPreview} alt="Publisher logo preview" style={{ width: '90px', height: '70px', objectFit: 'contain', background: '#fff', borderRadius: '4px', padding: '6px' }} />
                      <div><strong style={{ color: 'var(--green-primary)' }}>✓ Logo attached</strong><div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{publisherLogoFile?.name}</div></div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <strong style={{ color: 'var(--gold-primary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-glow)', paddingBottom: '8px' }}>
                    📦 SUBMISSION PACKAGE FILES
                  </strong>
                  
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(212,175,55,0.05)', padding: '10px 12px', borderRadius: '4px', borderLeft: '3px solid var(--gold-primary)', marginBottom: '5px' }}>
                    ☁️ <strong>Google Drive secure integration enabled:</strong> Large documents and PDF comic issues are uploaded directly to our cloud storage workspace to conserve network server memory. Maximum size limit is <strong>{FILE_SIZE_LIMIT_MB}MB</strong> per file.
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Cover Letter (PDF / Doc) *</label>
                    <input 
                      type="file" 
                      accept=".pdf,.docx,.doc" 
                      style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}
                      onChange={(e) => handleFileChange(e, setCoverLetterFile)}
                    />
                    {coverLetterFile && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--green-primary)', display: 'block', marginTop: '4px' }}>
                        ✓ Attached: {coverLetterFile.name} ({(coverLetterFile.size / 1024).toFixed(0)} KB)
                      </span>
                    )}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Digital Sample Book (Complete PDF) *</label>
                    <input 
                      type="file" 
                      accept=".pdf" 
                      style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}
                      onChange={(e) => handleFileChange(e, setBookPdfFile)}
                    />
                    {bookPdfFile && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--green-primary)', display: 'block', marginTop: '4px' }}>
                        ✓ Attached: {bookPdfFile.name} ({(bookPdfFile.size / (1024*1024)).toFixed(1)} MB)
                      </span>
                    )}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">6- to 12-Month Release Schedule Outline *</label>
                    <input 
                      type="file" 
                      accept=".pdf,.xlsx,.xls,.docx,.doc" 
                      style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}
                      onChange={(e) => handleFileChange(e, setScheduleFile)}
                    />
                    {scheduleFile && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--green-primary)', display: 'block', marginTop: '4px' }}>
                        ✓ Attached: {scheduleFile.name} ({(scheduleFile.size / 1024).toFixed(0)} KB)
                      </span>
                    )}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Detailed Marketing & Outreach Plan *</label>
                    <input 
                      type="file" 
                      accept=".pdf,.docx,.doc" 
                      style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}
                      onChange={(e) => handleFileChange(e, setMarketingPlanFile)}
                    />
                    {marketingPlanFile && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--green-primary)', display: 'block', marginTop: '4px' }}>
                        ✓ Attached: {marketingPlanFile.name} ({(marketingPlanFile.size / 1024).toFixed(0)} KB)
                      </span>
                    )}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Company Information & Future Plans (Optional)</label>
                    <textarea 
                      className="form-input" 
                      rows="4" 
                      style={{ padding: '10px', fontSize: '0.85rem' }} 
                      placeholder="Enter details about your studio, future printing specs, or additional comments here..."
                      value={companyInfoText}
                      onChange={(e) => setCompanyInfoText(e.target.value)}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <strong style={{ color: 'var(--pod-green)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--pod-green)', paddingBottom: '8px' }}>PRINT ON DEMAND NEEDS</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Customer Type *</label><select className="form-select" value={customerType} onChange={(e) => setCustomerType(e.target.value)}><option>Publisher</option><option>Creator</option><option>Retailer</option><option>Convention Vendor</option><option>Other</option></select></div>
                    <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Printing Frequency *</label><select className="form-select" value={printingFrequency} onChange={(e) => setPrintingFrequency(e.target.value)}><option>One-time project</option><option>Occasional projects</option><option>Monthly</option><option>Ongoing / frequent</option></select></div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">What do you expect to print? *</label><input className="form-input" value={projectTypes} onChange={(e) => setProjectTypes(e.target.value)} placeholder="Comic books, graphic novels, convention editions..." /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Expected Quantities *</label><input className="form-input" value={expectedQuantity} onChange={(e) => setExpectedQuantity(e.target.value)} placeholder="Example: 50–250 copies" /></div>
                    <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Approximate Page Counts *</label><input className="form-input" value={pageCountRange} onChange={(e) => setPageCountRange(e.target.value)} placeholder="Example: 24–48 pages" /></div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Printing, Shipping & Fulfillment Needs *</label><textarea className="form-textarea" rows="4" value={fulfillmentNeeds} onChange={(e) => setFulfillmentNeeds(e.target.value)} placeholder="Tell us about printing, direct shipping, Kickstarter rewards, convention copies, retailer restocks, or other needs." /></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <strong style={{ color: 'var(--pod-green)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--pod-green)', paddingBottom: '8px' }}>PRIMARY SHIPPING ADDRESS</strong>
                  <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Address Line 1 *</label><input className="form-input" value={shippingAddress1} onChange={(e) => setShippingAddress1(e.target.value)} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Address Line 2</label><input className="form-input" value={shippingAddress2} onChange={(e) => setShippingAddress2(e.target.value)} /></div>
                  <div className="pod-application-address-row">
                    <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">City *</label><input className="form-input" value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} /></div>
                    <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">State *</label><input className="form-input" value={shippingState} onChange={(e) => setShippingState(e.target.value)} /></div>
                    <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">ZIP *</label><input className="form-input" value={shippingZip} onChange={(e) => setShippingZip(e.target.value)} /></div>
                  </div>
                </div>
              </>
            )}

          </div>

          <button type="submit" disabled={busy} className={`btn btn-primary ${role === 'pod' ? 'pod-selected' : ''}`} style={{ width: '100%', marginTop: '35px' }}>
            {busy ? 'Submitting…' : role === 'pod' ? 'Submit for a Quote' : 'Submit Application Details'}
          </button>
        </form>
      </div>
    </div>
  </div>
);
}
