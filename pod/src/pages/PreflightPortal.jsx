import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase-mock';

const STATUSES = ['Files Not Submitted', 'Files Received', 'Under Review', 'Changes Required', 'Replacement Requested', 'Approved for Production', 'On Hold'];

export default function PreflightPortal({ user, activeSection }) {
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState('');
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [noteText, setNoteText] = useState('');

  const refresh = () => setOrders(db.getProductionOrders(user));
  useEffect(refresh, []);

  const counts = useMemo(() => ({
    awaiting: orders.filter(order => ['Files Received', 'Under Review'].includes(order.overallPreflightStatus)).length,
    changes: orders.filter(order => ['Changes Required', 'Replacement Requested'].includes(order.overallPreflightStatus)).length,
    missing: orders.filter(order => order.coverFileStatus === 'Files Not Submitted' || order.interiorFileStatus === 'Files Not Submitted').length,
    ready: orders.filter(order => order.overallPreflightStatus === 'Ready to Print').length,
    approved: orders.filter(order => order.overallPreflightStatus === 'Approved for Production').length,
    hold: orders.filter(order => order.overallPreflightStatus === 'On Hold').length
  }), [orders]);

  const selectedJob = orders.find(order => order.productionOrderId === selectedJobId) || null;
  const formatDateTime = value => value ? new Date(value).toLocaleString() : 'Not recorded';
  const formatDate = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString() : 'Not set';

  const update = (id, type, status) => {
    try {
      db.updatePreflightReview(id, type, status);
      setMessage(`${type === 'cover' ? 'Cover' : 'Interior'} status updated by ${user.contactName || user.companyName || user.email}.`);
      refresh();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const addNote = event => {
    event.preventDefault();
    try {
      db.addProductionNote(selectedJobId, noteText);
      setNoteText('');
      setMessage('Team note saved with your name and timestamp.');
      refresh();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const markReady = productionOrderId => {
    try {
      db.markProductionReady(productionOrderId);
      setMessage('Production job marked Ready to Print.');
      refresh();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const cards = [
    ['Files awaiting review', counts.awaiting],
    ['Files requiring changes', counts.changes],
    ['Jobs missing files', counts.missing],
    ['Ready for production', counts.ready],
    ['Recently approved', counts.approved],
    ['On Hold', counts.hold]
  ];

  if (activeSection === 'my-activity') {
    return (
      <div className="animate-fade-in">
        <h1>My Activity</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Every production change made while you are signed in is recorded here.</p>
        <div className="glass-panel preflight-activity-list">
          {db.getAuditLog(user).map(item => (
            <article key={item.auditId}>
              <strong>{item.action}</strong> · {item.recordId}
              {item.notes && <p>{item.notes}</p>}
              <small>{item.userName || item.user} · {new Date(item.dateTime).toLocaleString()}</small>
            </article>
          ))}
        </div>
      </div>
    );
  }

  if (activeSection === 'account') {
    return <div><h1>Account</h1><div className="glass-panel" style={{ padding: '20px' }}><strong>{user.companyName || user.email}</strong><p>{user.email}</p><span className="badge badge-gold">Print Production / Preflight</span></div></div>;
  }

  const filtered = activeSection === 'approved-files'
    ? orders.filter(order => ['Approved for Production', 'Ready to Print'].includes(order.overallPreflightStatus))
    : orders;

  return (
    <div className="animate-fade-in preflight-workspace">
      <h1>{activeSection === 'dashboard' ? 'Print Production / Preflight' : activeSection === 'production-orders' ? 'Production Jobs' : activeSection.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join(' ')}</h1>
      <p className="preflight-privacy-note">File-only workspace. Customer contact is limited to the contact attached to each production job. Retailers, order quantities, pricing, payments, and financial records are excluded.</p>
      {message && <div className="glass-panel preflight-message" role="status">{message}</div>}

      {activeSection === 'dashboard' && <div className="preflight-metric-grid">{cards.map(([label, number]) => <div className="glass-panel" key={label}><strong>{number}</strong><span>{label}</span></div>)}</div>}

      {selectedJob && (
        <section className="glass-panel preflight-notes-panel">
          <div className="preflight-notes-heading">
            <div><span>PRODUCTION TEAM NOTES</span><h2>{selectedJob.title}</h2><p>{selectedJob.productionOrderId} · Deadline {formatDate(selectedJob.productionDeadline)}</p></div>
            <button type="button" className="btn btn-secondary" onClick={() => setSelectedJobId(null)}>Close</button>
          </div>
          <form onSubmit={addNote}>
            <label htmlFor="production-team-note">Add a note for everyone working on this file</label>
            <textarea id="production-team-note" className="form-input" rows="3" value={noteText} onChange={event => setNoteText(event.target.value)} placeholder="Example: New interior PDF received; reviewing page 18 correction." />
            <button type="submit" className="btn btn-primary">Add Team Note</button>
          </form>
          <div className="preflight-notes-list">
            {[...(selectedJob.notes || [])].reverse().map((note, index) => (
              <article key={note.noteId || `${note.date}-${index}`}>
                <div><strong>{note.userName || note.user || 'System'}</strong><span>{String(note.role || 'production').replace('_', ' ')}</span></div>
                <p>{note.text || note.notes || `${note.fileType || 'File'} status changed to ${note.status}.`}</p>
                <small>{formatDateTime(note.date)}</small>
              </article>
            ))}
            {!selectedJob.notes?.length && <p className="operations-empty-state">No notes yet for this production job.</p>}
          </div>
        </section>
      )}

      <div className="glass-panel preflight-table-panel">
        <table>
          <thead><tr><th>File Job</th><th>Title / PHILBO ID</th><th>Order Placed</th><th>Deadline</th><th>Customer Contact</th><th>Cover File</th><th>Interior File</th><th>Overall</th><th>Team Notes</th><th>Production</th></tr></thead>
          <tbody>
            {filtered.map(order => {
              const contact = order.customerContact || {};
              return (
                <tr key={order.productionOrderId}>
                  <td>{order.productionOrderId}</td>
                  <td><strong>{order.title}</strong><br />{order.philboId || '—'}</td>
                  <td>{formatDateTime(order.orderPlacedAt)}</td>
                  <td>{formatDate(order.productionDeadline)}</td>
                  <td><strong>{contact.companyName || 'Not recorded'}</strong>{contact.contactName && <><br />{contact.contactName}</>}{contact.email && <><br /><a href={`mailto:${contact.email}`}>{contact.email}</a></>}{contact.phone && <><br /><a href={`tel:${contact.phone}`}>{contact.phone}</a></>}</td>
                  <td><select className="form-input" value={order.coverFileStatus} onChange={event => update(order.productionOrderId, 'cover', event.target.value)}>{STATUSES.map(status => <option key={status}>{status}</option>)}</select>{order.coverFileName && <button className="btn btn-secondary preflight-file-button" onClick={() => db.recordFileAccess(order.productionOrderId, 'cover', 'opened')}>Open cover</button>}</td>
                  <td><select className="form-input" value={order.interiorFileStatus} onChange={event => update(order.productionOrderId, 'interior', event.target.value)}>{STATUSES.map(status => <option key={status}>{status}</option>)}</select>{order.interiorFileName && <button className="btn btn-secondary preflight-file-button" onClick={() => db.recordFileAccess(order.productionOrderId, 'interior', 'opened')}>Open interior</button>}</td>
                  <td><span className="badge badge-gold">{order.overallPreflightStatus}</span></td>
                  <td><button type="button" className="btn btn-secondary" onClick={() => setSelectedJobId(order.productionOrderId)}>Notes ({order.notes?.length || 0})</button></td>
                  <td><button className="btn btn-primary" onClick={() => markReady(order.productionOrderId)}>Ready to Print</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && <p className="operations-empty-state">No production file jobs match this view.</p>}
      </div>
    </div>
  );
}
