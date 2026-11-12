import React, { useState } from 'react';
import { db } from '../firebase-mock';

const DEMOS = [
  { id: 'prepress', icon: '🗂️', title: 'Prepress / Print Production', detail: 'Inspect file review, production deadlines, and customer contacts.' },
  { id: 'admin', icon: '🛡️', title: 'Operations Admin', detail: 'Inspect operational tools and Team Access without MO.OS owner authority.' },
  { id: 'publisher', icon: '🎨', title: 'Publisher', detail: 'Inspect title submissions, catalog listings, production files, sales, and statements.' },
  { id: 'pod', icon: '🖨️', title: 'POD Customer', detail: 'Inspect print estimates, projects, quotes, and POD account tools.' },
  { id: 'retailer', icon: '🛒', title: 'Retailer', detail: 'Inspect Order Books, Fast Entry, current ordering, invoices, shipments, and returns.' }
];

export default function DemoAccess({ onLoginSuccess, onNavigateHome }) {
  const [error, setError] = useState('');
  const [passwords, setPasswords] = useState({});
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [focusedPasswords, setFocusedPasswords] = useState({});
  const openDemo = demoType => {
    setError('');
    const enteredPassword = String(passwords[demoType] || '').trim();
    try { onLoginSuccess(db.loginLocalDemo(demoType, enteredPassword)); }
    catch (err) { setError(err.message); }
  };

  return <div className="demo-access-page animate-fade-in">
    <div className="demo-access-panel glass-panel">
      <div className="demo-access-toolbar">
        <button type="button" className="btn btn-secondary" onClick={onNavigateHome}>← Back to Home</button>
      </div>
      <div className="badge badge-gold">PROTECTED BETA ACCESS</div>
      <h1 style={{ margin:'12px 0 6px' }}>DEMO ACCESS</h1>
      <p style={{ color:'var(--text-secondary)', marginTop:0 }}>Choose a workspace to inspect. MO.OS owner access is intentionally excluded.</p>
      <div className="demo-password-help">
        <strong>ENTER DEMO PASSWORDS HERE</strong>
        <span>No email address is needed. Demo passwords will not work on the regular Account Login page.</span>
      </div>
      {error && <div style={{ background:'rgba(239,68,68,.15)', border:'1px solid var(--red-primary)', color:'#ff8a8a', padding:'12px', borderRadius:'6px', margin:'18px 0' }}>✕ {error}</div>}
      <div className="demo-access-grid">
        {DEMOS.map(demo => <div key={demo.id} className="demo-access-card glass-panel">
          <div style={{ fontSize:'1.7rem' }}>{demo.icon}</div>
          <strong style={{ display:'block', color:'var(--gold-primary)', margin:'10px 0 7px', fontSize:'1rem' }}>{demo.title}</strong>
          <span style={{ color:'var(--text-secondary)', fontSize:'.82rem', lineHeight:1.45, display:'block' }}>{demo.detail}</span>
          <div style={{ marginTop:'14px', fontSize:'.72rem', color:'var(--text-muted)' }}>PASSWORD REQUIRED</div>
          <div className="demo-password-field">
            <input aria-label={`${demo.title} demo password`} name={`philbo-${demo.id}-demo-access`} type={visiblePasswords[demo.id] ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" spellCheck="false" data-lpignore="true" data-1p-ignore="true" readOnly={!focusedPasswords[demo.id]} className="form-input" placeholder="Demo password" value={passwords[demo.id] || ''} onFocus={()=>setFocusedPasswords({...focusedPasswords,[demo.id]:true})} onChange={event=>{ setError(''); setPasswords({...passwords,[demo.id]:event.target.value}); }} onKeyDown={event=>{ if(event.key==='Enter') openDemo(demo.id); }} />
            <button type="button" className="demo-password-toggle" aria-label={`${visiblePasswords[demo.id] ? 'Hide' : 'Show'} ${demo.title} demo password`} onClick={()=>setVisiblePasswords({...visiblePasswords,[demo.id]:!visiblePasswords[demo.id]})}>{visiblePasswords[demo.id] ? 'HIDE' : 'SHOW'}</button>
          </div>
          <button type="button" className="demo-enter-button btn btn-primary" onClick={()=>openDemo(demo.id)}>Enter {demo.title}</button>
        </div>)}
      </div>
      <div className="demo-support-note">
        <strong>Demo being dramatic?</strong>
        <span>Uh-oh. Better call Maura: <a href="tel:+15162508417">(516) 250-8417</a></span>
      </div>
      <p style={{ color:'var(--text-muted)', fontSize:'.75rem', marginBottom:0, marginTop:'24px' }}>Demo Access is available only on the local prototype and password-protected beta site. It is disabled on the public production site.</p>
    </div>
  </div>;
}
