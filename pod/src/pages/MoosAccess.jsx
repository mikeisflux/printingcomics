import React, { useEffect, useState } from 'react';
import { db, PERMISSIONS, ROLE_LABELS, getEffectivePermissions } from '../firebase-mock';
import { listInternalStaff, runAdminAccessAction, updateOwnPassword } from '../lib/backend';

export default function MoosAccess({ user }) {
  const isOwner = user.role === 'moos';
  const [staff, setStaff] = useState([]);
  const [audit, setAudit] = useState([]);
  const [form, setForm] = useState({ companyName: '', email: '', role: 'preflight' });
  const [message, setMessage] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const realBackend = user.authProvider === 'supabase';
  const refresh = async () => {
    try {
      setStaff(realBackend ? await listInternalStaff() : db.getInternalStaff());
      setAudit(!realBackend && isOwner ? db.getAuditLog(user) : []);
    } catch (error) { setMessage(error.message); }
  };
  useEffect(() => { refresh(); }, []);
  const run = async action => { try { await action(); setMessage('Access change saved immediately.'); await refresh(); } catch (error) { setMessage(error.message); } };
  const permissions = Object.values(PERMISSIONS).filter(permission => !['staff.manage','audit.view.all','system.settings'].includes(permission));

  return <div className="animate-fade-in">
    <div style={{ display:'flex', justifyContent:'space-between', gap:'20px', alignItems:'flex-start', marginBottom:'24px' }}>
      <div><span className="badge badge-gold">{isOwner ? 'MO.OS OWNER' : 'ADMIN TEAM ACCESS'}</span><h1 style={{ margin:'8px 0 5px' }}>Internal Staff Access</h1><p style={{ color:'var(--text-secondary)', margin:0 }}>{isOwner ? 'Create and control Admin and Print Production / Preflight access. Your MO.OS account remains the protected owner.' : 'Invite and manage Print Production / Preflight team members. Admin accounts and MO.OS owner controls are protected.'}</p></div>
    </div>
    {message && <div className="glass-panel" style={{ padding:'12px 16px', marginBottom:'18px', color:'var(--gold-primary)' }}>{message}</div>}
    {isOwner && <div className="glass-panel" style={{ padding:'20px', marginBottom:'22px' }}>
      <h3>SECURE MY MO.OS LOGIN</h3>
      <p style={{ color:'var(--text-secondary)', fontSize:'.82rem' }}>Your protected owner login email is <strong>{user.email}</strong>. Set a private password before signing out of the current prototype session.</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:'12px' }}>
        <input className="form-input" type="password" placeholder="Current password (if already set)" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/>
        <input className="form-input" type="password" placeholder="New password — 12+ characters" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/>
        <input className="form-input" type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/>
        <button className="btn btn-primary" onClick={()=>{
          if (newPassword !== confirmPassword) return setMessage('The new passwords do not match.');
          run(async()=> realBackend ? updateOwnPassword(newPassword) : db.changeOwnPassword(currentPassword, newPassword));
        }}>Set Password & Sign Out</button>
      </div>
    </div>}
    <div className="glass-panel" style={{ padding:'20px', marginBottom:'22px' }}>
      <h3>ADD INTERNAL STAFF</h3>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:'12px' }}>
        <input className="form-input" placeholder="Name" value={form.companyName} onChange={e=>setForm({...form,companyName:e.target.value})}/>
        <input className="form-input" type="email" placeholder="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
        <select className="form-input" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="preflight">Print Production / Preflight</option>{isOwner && <option value="admin">Admin</option>}</select>
        <button className="btn btn-primary" onClick={()=>run(async()=>{
          if (realBackend) await runAdminAccessAction({ action:'invite_staff', email:form.email, displayName:form.companyName, role:form.role });
          else db.createInternalStaff(form);
          setForm({companyName:'',email:'',role:'preflight'});
        })}>Create Invitation</button>
      </div>
      <p style={{ color:'var(--text-muted)', fontSize:'.78rem', marginBottom:0 }}>No readable password is created. The invited staff member must choose a password.</p>
    </div>
    <div style={{ display:'grid', gap:'18px' }}>
      {staff.map(member => {
        const canManage = isOwner ? member.role !== 'moos' : member.role === 'preflight';
        return <div key={member.uid} className="glass-panel" style={{ padding:'20px', borderColor:member.role==='moos'?'var(--gold-primary)':undefined }}>
        <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'space-between', gap:'12px' }}>
          <div><strong>{member.companyName || member.email}</strong><div style={{ color:'var(--text-secondary)', fontSize:'.8rem' }}>{member.email} · {ROLE_LABELS[member.role] || member.role}</div><div style={{ fontSize:'.75rem', marginTop:'4px', color:member.accountStatus==='active'?'#8fd694':'#ff7c7c' }}>{(member.accountStatus || 'active').toUpperCase()} · Last login: {member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString() : 'Never'}</div></div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
            {isOwner && member.role !== 'moos' && !realBackend && <select className="form-input" style={{ width:'210px' }} value={member.role} onChange={e=>run(()=>db.updateInternalStaff(member.uid,{role:e.target.value}))}><option value="admin">Admin</option><option value="preflight">Print Production / Preflight</option></select>}
            {canManage && member.accountStatus !== 'active' && <button className="btn btn-secondary" onClick={()=>run(()=>realBackend ? runAdminAccessAction({action:'restore_user',userId:member.uid}) : db.updateInternalStaff(member.uid,{accountStatus:'active'}))}>Restore</button>}
            {canManage && member.accountStatus === 'active' && <button className="btn btn-secondary" onClick={()=>run(()=>realBackend ? runAdminAccessAction({action:'suspend_user',userId:member.uid}) : db.updateInternalStaff(member.uid,{accountStatus:'suspended'}))}>Suspend</button>}
            {canManage && !realBackend && <button className="btn btn-danger" onClick={()=>run(()=>db.updateInternalStaff(member.uid,{accountStatus:'locked',revokeSessions:true}))}>Lock Now</button>}
            {canManage && !realBackend && <button className="btn btn-secondary" onClick={()=>run(()=>db.updateInternalStaff(member.uid,{revokeSessions:true}))}>Revoke Sessions</button>}
            {canManage && <button className="btn btn-secondary" onClick={()=>run(()=>realBackend ? runAdminAccessAction({action:'send_password_reset',email:member.email}) : db.updateInternalStaff(member.uid,{passwordResetRequired:true,revokeSessions:true}))}>Send Password Email</button>}
            {canManage && !realBackend && <button className="btn btn-secondary" onClick={()=>run(()=>db.resendInternalInvitation(member.uid))}>Resend Invite</button>}
            {isOwner && member.role !== 'moos' && !realBackend && <button className="btn btn-danger" onClick={()=>{ if(window.confirm('Transfer MO.OS ownership to this person? Your account will become Admin and your active sessions will be revoked.')) run(()=>db.transferPlatformOwnership(member.uid)); }}>Transfer Ownership</button>}
          </div>
        </div>
        {isOwner && member.role !== 'moos' && !realBackend && <details style={{ marginTop:'16px' }}><summary style={{ cursor:'pointer', color:'var(--gold-primary)' }}>Individual permissions</summary><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:'8px', marginTop:'12px' }}>{permissions.map(permission => {
          const enabled = getEffectivePermissions(member).includes(permission);
          return <label key={permission} style={{ fontSize:'.78rem', display:'flex', gap:'8px', alignItems:'center' }}><input type="checkbox" checked={enabled} onChange={e=>run(()=>db.updateInternalStaff(member.uid,{permissionOverrides:{[permission]:e.target.checked}}))}/>{permission} <span style={{color:'var(--text-muted)'}}>{member.permissionOverrides?.[permission]===undefined?'(role default)':''}</span></label>;
        })}</div></details>}
        {canManage && !realBackend && <div style={{ display:'flex', gap:'8px', marginTop:'14px' }}><input className="form-input" id={`note-${member.uid}`} placeholder="Add protected internal note"/><button className="btn btn-secondary" onClick={()=>{const el=document.getElementById(`note-${member.uid}`); run(()=>db.updateInternalStaff(member.uid,{},el.value)); el.value='';}}>Add Note</button></div>}
      </div>})}
    </div>
    {isOwner && <div className="glass-panel" style={{ padding:'20px', marginTop:'24px', overflowX:'auto' }}><h3>PROTECTED AUDIT LOG</h3><table style={{ width:'100%', fontSize:'.78rem' }}><thead><tr><th>Date & time</th><th>User / role</th><th>Action</th><th>Record</th><th>Notes</th></tr></thead><tbody>{audit.slice(0,100).map(item=><tr key={item.auditId}><td>{new Date(item.dateTime).toLocaleString()}</td><td>{item.user}<br/><span style={{color:'var(--text-muted)'}}>{ROLE_LABELS[item.role]||item.role}</span></td><td>{item.action}</td><td>{item.recordType}: {item.recordId}</td><td>{item.notes||'—'}</td></tr>)}</tbody></table></div>}
  </div>;
}
