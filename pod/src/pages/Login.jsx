import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { db, isProtectedDemoEnvironment } from '../firebase-mock';
import { isProductionBackendEnabled } from '../lib/supabase';
import { completeExternalInvitationProfile, finishInvitationPassword, restorePortalSession, sendPasswordReset, signInToPortal } from '../lib/backend';
import { buildInvitationProfile, isExternalInvitationUser, missingInvitationProfileFields } from '../lib/invitation-profile';

function PasswordInput({ ariaLabel, wrapperStyle, ...inputProps }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input-wrap" style={wrapperStyle}>
      <input {...inputProps} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="password-visibility-toggle"
        aria-label={`${visible ? 'Hide' : 'Show'} ${ariaLabel || 'password'}`}
        aria-pressed={visible}
        onClick={() => setVisible(value => !value)}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export default function Login({ onLoginSuccess, onNavigate, staffOnly = false }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [tempUser, setTempUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOwnerSetup, setShowOwnerSetup] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerPasswordConfirm, setOwnerPasswordConfirm] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [invitationProfile, setInvitationProfile] = useState(() => buildInvitationProfile());
  const audience = staffOnly ? 'staff' : 'customer';
  const localPrototype = ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.protocol === 'file:';
  const demoEnvironment = isProtectedDemoEnvironment();
  const realBackend = isProductionBackendEnabled && window.location.hash !== '#demo';
  const completingSecureLink = realBackend && (new URLSearchParams(window.location.search).has('set_password') || window.location.hash === '#set-password');

  useEffect(() => {
    if (!completingSecureLink) return;
    let active = true;
    setSetupLoading(true);
    restorePortalSession()
      .then(user => {
        if (!active) return;
        if (!user) throw new Error('This secure invitation has expired. Ask Philbo to send a new invitation.');
        setTempUser(user);
        setInvitationProfile(buildInvitationProfile(user));
      })
      .catch(err => active && setError(err.message || 'The secure invitation could not be opened.'))
      .finally(() => active && setSetupLoading(false));
    return () => { active = false; };
  }, [completingSecureLink]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      const user = realBackend ? await signInToPortal(email, password, audience) : db.login(email, password, audience);
      if (user.isInvitationPending || user.passwordResetRequired) {
        setTempUser(user);
        setInvitationProfile(buildInvitationProfile(user));
        setShowSetupPassword(true);
      } else {
        onLoginSuccess(user);
      }
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  const requiresInvitationProfile = Boolean(tempUser && isExternalInvitationUser(tempUser) && !tempUser.invitationAcceptedAt && (tempUser.isInvitationPending || completingSecureLink));
  const missingProfileFields = requiresInvitationProfile ? missingInvitationProfileFields(invitationProfile) : [];
  const invitationProfileComplete = missingProfileFields.length === 0;
  const setInvitationField = (field, value) => {
    setInvitationProfile(current => ({ ...current, [field]: value }));
    setError('');
  };

  if ((showSetupPassword && tempUser) || completingSecureLink) {
    if (setupLoading || (completingSecureLink && !tempUser && !error)) {
      return (
        <div className="animate-fade-in" style={{ padding: '60px 20px', maxWidth: '560px', margin: '0 auto' }}>
          <div className="glass-panel" style={{ padding: '40px 30px', textAlign: 'center' }}>
            <h2 style={{ marginBottom: '10px', color: 'var(--gold-primary)' }}>OPENING YOUR INVITATION</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Loading your secure account setup…</p>
          </div>
        </div>
      );
    }
    return (
      <div className="animate-fade-in" style={{ padding: '60px 20px', maxWidth: requiresInvitationProfile ? '780px' : '500px', margin: '0 auto' }}>
        <div className="glass-panel" style={{ padding: '40px 30px' }}>
          <h2 style={{ marginBottom: '10px', color: 'var(--gold-primary)' }}>COMPLETE YOUR INVITATION</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '25px' }}>
            {tempUser ? <>Welcome, <strong>{tempUser.companyName}</strong>. </> : null}
            {requiresInvitationProfile
              ? 'Complete every required contact and mailing field. Password setup will unlock when the information is complete.'
              : 'Choose a private password to finish setting up your account.'}
          </p>
          {error && <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid var(--red-primary)', color: '#ff8a8a', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontSize: '0.9rem' }}>✕ {error}</div>}
          <form onSubmit={async (event) => {
            event.preventDefault();
            setError('');
            if (requiresInvitationProfile && !invitationProfileComplete) return setError(`Complete all required information: ${missingProfileFields.join(', ')}.`);
            if (newPassword.length < 12) return setError('Please use at least 12 characters for your new password.');
            if (newPassword !== confirmPassword) return setError('Passwords do not match.');
            setBusy(true);
            try {
              if (realBackend) {
                if (requiresInvitationProfile) await completeExternalInvitationProfile(invitationProfile);
                await finishInvitationPassword(newPassword);
                const user = await restorePortalSession();
                if (!user) throw new Error('Your secure link has expired. Request a new password email.');
                window.history.replaceState({}, '', `${window.location.pathname}#${staffOnly ? 'staff' : ''}`);
                onLoginSuccess(user);
              } else {
                if (requiresInvitationProfile) db.completeInvitationProfile(tempUser.uid, invitationProfile);
                db.setPassword(tempUser.uid, newPassword);
                onLoginSuccess(db.login(tempUser.email, newPassword, audience));
              }
            } catch (err) {
              setError(err.message || 'The password could not be saved.');
            } finally {
              setBusy(false);
            }
          }}>
            {requiresInvitationProfile && (
              <>
                <div style={{ padding: '14px', border: '1px solid var(--border-glow)', borderRadius: '7px', background: 'rgba(255,255,255,0.025)', marginBottom: '20px' }}>
                  <span className="form-label" style={{ display: 'block' }}>ACCOUNT</span>
                  <strong style={{ color: '#fff' }}>{tempUser.companyName}</strong>
                  <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.82rem', overflowWrap: 'anywhere', marginTop: '3px' }}>{tempUser.email}</span>
                </div>
                <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '14px' }}>REQUIRED CONTACT INFORMATION</h3>
                <div className="invitation-profile-grid">
                  <div className="form-group"><label className="form-label" htmlFor="invitation-first-name">First Name *</label><input id="invitation-first-name" className="form-input" required value={invitationProfile.firstName} onChange={event => setInvitationField('firstName', event.target.value)} /></div>
                  <div className="form-group"><label className="form-label" htmlFor="invitation-last-name">Last Name *</label><input id="invitation-last-name" className="form-input" required value={invitationProfile.lastName} onChange={event => setInvitationField('lastName', event.target.value)} /></div>
                  <div className="form-group"><label className="form-label" htmlFor="invitation-job-title">Job Title</label><input id="invitation-job-title" className="form-input" value={invitationProfile.jobTitle} onChange={event => setInvitationField('jobTitle', event.target.value)} /></div>
                  <div className="form-group"><label className="form-label" htmlFor="invitation-phone">Primary Phone *</label><input id="invitation-phone" type="tel" className="form-input" required value={invitationProfile.primaryPhone} onChange={event => setInvitationField('primaryPhone', event.target.value)} /></div>
                </div>
                <h3 style={{ color: '#fff', fontSize: '1rem', margin: '24px 0 14px' }}>REQUIRED MAILING ADDRESS</h3>
                <div className="invitation-profile-grid">
                  <div className="form-group invitation-profile-wide"><label className="form-label" htmlFor="invitation-address-1">Street Address *</label><input id="invitation-address-1" className="form-input" autoComplete="address-line1" required value={invitationProfile.addressLine1} onChange={event => setInvitationField('addressLine1', event.target.value)} /></div>
                  <div className="form-group invitation-profile-wide"><label className="form-label" htmlFor="invitation-address-2">Suite, Unit, or Building</label><input id="invitation-address-2" className="form-input" autoComplete="address-line2" value={invitationProfile.addressLine2} onChange={event => setInvitationField('addressLine2', event.target.value)} /></div>
                  <div className="form-group"><label className="form-label" htmlFor="invitation-city">City *</label><input id="invitation-city" className="form-input" autoComplete="address-level2" required value={invitationProfile.city} onChange={event => setInvitationField('city', event.target.value)} /></div>
                  <div className="form-group"><label className="form-label" htmlFor="invitation-state">State / Province *</label><input id="invitation-state" className="form-input" autoComplete="address-level1" required value={invitationProfile.stateProvince} onChange={event => setInvitationField('stateProvince', event.target.value)} /></div>
                  <div className="form-group"><label className="form-label" htmlFor="invitation-postal">ZIP / Postal Code *</label><input id="invitation-postal" className="form-input" autoComplete="postal-code" required value={invitationProfile.postalCode} onChange={event => setInvitationField('postalCode', event.target.value)} /></div>
                  <div className="form-group"><label className="form-label" htmlFor="invitation-country">Country *</label><input id="invitation-country" className="form-input" autoComplete="country-name" required value={invitationProfile.country} onChange={event => setInvitationField('country', event.target.value)} /></div>
                </div>
                {!invitationProfileComplete && <p role="status" style={{ color: 'var(--gold-primary)', fontSize: '0.78rem', lineHeight: 1.5, marginTop: '16px' }}>Password setup is locked. Still needed: {missingProfileFields.join(', ')}.</p>}
              </>
            )}
            {(!requiresInvitationProfile || invitationProfileComplete) && (
              <div style={{ borderTop: requiresInvitationProfile ? '1px solid var(--border-glow)' : 'none', marginTop: requiresInvitationProfile ? '24px' : 0, paddingTop: requiresInvitationProfile ? '24px' : 0 }}>
                <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '14px' }}>CREATE YOUR PASSWORD</h3>
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <PasswordInput ariaLabel="new password" id="invitation-new-password" name="new-password" autoComplete="new-password" className="form-input" placeholder="At least 12 characters" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                </div>
                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label className="form-label">Confirm Password</label>
                  <PasswordInput ariaLabel="password confirmation" id="invitation-confirm-password" name="confirm-password" autoComplete="new-password" className="form-input" placeholder="Repeat your password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                </div>
                <button type="submit" disabled={busy} className="btn btn-primary" style={{ width: '100%', marginTop: '20px' }}>{busy ? 'Saving…' : requiresInvitationProfile ? 'Save Information, Set Password & Log In' : 'Set Password & Log In'}</button>
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ padding: '60px 20px', maxWidth: '500px', margin: '0 auto' }}>
      {demoEnvironment && (
        <aside className="login-demo-callout" aria-label="Demo access notice">
          <div>
            <strong>USING A DEMO PASSWORD?</strong>
            <span>Access via the Demo Access button—not Account Login.</span>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => { window.location.hash = 'demo'; onNavigate('demo-access'); }}>GET DEMO ACCESS</button>
        </aside>
      )}
      <div className="glass-panel" style={{ padding: '40px 30px' }}>
        <div className="badge badge-gold" style={{ marginBottom: '12px' }}>{staffOnly ? 'PRIVATE STAFF ACCESS' : 'CUSTOMER ACCESS'}</div>
        <h2 style={{ marginBottom: '10px' }}>{staffOnly ? 'STAFF SIGN IN' : 'ACCOUNT LOGIN'}</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '25px' }}>
          {staffOnly
            ? 'Authorized MO.OS, Admin, and Print Production staff only.'
            : 'Retailers, publishers, and POD customers can sign in to their approved account here.'}
        </p>
        {error && <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid var(--red-primary)', color: '#ff8a8a', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontSize: '0.9rem' }}>✕ {error}</div>}
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input id={staffOnly ? 'staff-email' : 'customer-email'} name="email" type="email" className="form-input" autoComplete="username" placeholder={staffOnly ? 'Your authorized staff email' : 'Your account email'} value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="form-group" style={{ marginTop: '10px' }}>
            <label className="form-label">Password</label>
            <PasswordInput ariaLabel={staffOnly ? 'staff password' : 'account password'} id={staffOnly ? 'staff-password' : 'customer-password'} name="password" className="form-input" autoComplete="current-password" placeholder="••••••••••••" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <button type="submit" disabled={busy} className="btn btn-primary" style={{ width: '100%', marginTop: '20px', marginBottom: '12px' }}>{busy ? 'Signing in…' : staffOnly ? 'Enter Staff Workspace' : 'Access Portal'}</button>
        </form>
        {realBackend && <button type="button" className="btn btn-secondary" style={{ width:'100%', marginBottom:'20px' }} onClick={async()=>{
          setError(''); setResetSent(false);
          if (!email) return setError('Enter your email address first, then choose password help.');
          setBusy(true);
          try { await sendPasswordReset(email); setResetSent(true); } catch (err) { setError(err.message); } finally { setBusy(false); }
        }}>Email Me a Password Link</button>}
        {resetSent && <p style={{ color:'var(--green-primary)', fontSize:'.82rem', textAlign:'center' }}>If that email belongs to an active account, a secure password link is on its way.</p>}
        {staffOnly ? (
          <>
            <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Use the secure invitation sent to your authorized staff email for first-time setup.</p>
            {localPrototype && !realBackend && <div style={{ borderTop:'1px solid var(--border-glow)', marginTop:'20px', paddingTop:'18px' }}>
              {!showOwnerSetup ? (
                <button className="btn btn-secondary" style={{ width:'100%' }} onClick={()=>{ setError(''); setShowOwnerSetup(true); }}>First time? Set up my MO.OS password</button>
              ) : (
                <form onSubmit={(event)=>{
                  event.preventDefault();
                  setError('');
                  if (ownerPassword !== ownerPasswordConfirm) return setError('The MO.OS passwords do not match.');
                  try { onLoginSuccess(db.bootstrapLocalMoos(ownerEmail, ownerPassword)); } catch (err) { setError(err.message); }
                }}>
                  <h3 style={{ marginBottom:'8px' }}>LOCAL OWNER SETUP</h3>
                  <p style={{ color:'var(--text-muted)', fontSize:'.76rem' }}>This appears only on your local prototype and works once. Your password is stored locally and is never added to GitHub.</p>
                  <input id="owner-email" name="email" className="form-input" type="email" autoComplete="username" placeholder="Your MO.OS email" value={ownerEmail} onChange={event=>setOwnerEmail(event.target.value)} />
                  <PasswordInput ariaLabel="owner password" id="owner-new-password" name="new-password" className="form-input" autoComplete="new-password" placeholder="Create password — 12+ characters" value={ownerPassword} onChange={event=>setOwnerPassword(event.target.value)} wrapperStyle={{ marginTop:'10px' }} />
                  <PasswordInput ariaLabel="owner password confirmation" id="owner-confirm-password" name="confirm-password" className="form-input" autoComplete="new-password" placeholder="Confirm password" value={ownerPasswordConfirm} onChange={event=>setOwnerPasswordConfirm(event.target.value)} wrapperStyle={{ marginTop:'10px' }} />
                  <button className="btn btn-primary" type="submit" style={{ width:'100%', marginTop:'12px' }}>Create Password & Enter MO.OS</button>
                </form>
              )}
            </div>}
          </>
        ) : (
          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Don’t have an account? <span style={{ color: 'var(--gold-primary)', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => onNavigate('apply')}>Apply here</span></p>
        )}
      </div>
    </div>
  );
}
