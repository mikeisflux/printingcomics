import React, { useMemo, useRef, useState } from 'react';
import { db } from '../firebase-mock';

export default function PurchaseOrderDocument({ purchaseOrder, onClose }) {
  const po = purchaseOrder || {};
  const currentUser = db.getCurrentUser();
  const publisherCanOrder = currentUser?.role === 'publisher' && !currentUser?.isPodClient;
  const assetPath = path => `${window.location.protocol === 'file:' ? './public/assets' : '/assets'}/${path}`;
  const defaultPublisherAddress = currentUser?.mailingAddress || [
    currentUser?.shippingName || currentUser?.companyName,
    currentUser?.shippingAddress1,
    currentUser?.shippingAddress2,
    [currentUser?.shippingCity, currentUser?.shippingState, currentUser?.shippingZip].filter(Boolean).join(', '),
    currentUser?.shippingCountry
  ].filter(Boolean).join('\n');
  const [podDetails, setPodDetails] = useState(() => {
    try { return purchaseOrder ? db.getPurchaseOrderPodDetails(po.poNumber, currentUser) : null; }
    catch { return null; }
  });
  const [showPodOrder, setShowPodOrder] = useState(false);
  const [podSelections, setPodSelections] = useState(() => (podDetails?.eligibleItems || []).map(item => ({ titleId: item.titleId, selected: true, extraCopies: 0 })));
  const [podNotes, setPodNotes] = useState('');
  const [podMessage, setPodMessage] = useState('');
  const [publisherShipToAddress, setPublisherShipToAddress] = useState(defaultPublisherAddress);
  const podWorkflowRef = useRef(null);
  const podEstimate = useMemo(() => (podDetails?.eligibleItems || []).reduce((total, item) => {
    const selection = podSelections.find(entry => entry.titleId === item.titleId);
    if (!selection?.selected || item.unitPrice == null) return total;
    return total + item.unitPrice * (item.retailerQuantity + Math.max(0, Number(selection.extraCopies || 0)));
  }, 0), [podDetails, podSelections]);
  const estimateNeedsReview = (podDetails?.eligibleItems || []).some(item => {
    const selection = podSelections.find(entry => entry.titleId === item.titleId);
    return selection?.selected && item.unitPrice == null;
  });
  const publisherCopiesTotal = useMemo(() => podSelections.reduce((total, selection) => total + (selection.selected ? Math.max(0, Number(selection.extraCopies || 0)) : 0), 0), [podSelections]);
  const setPodSelection = (titleId, changes) => setPodSelections(current => current.map(item => item.titleId === titleId ? { ...item, ...changes } : item));
  const revealPodWorkflow = () => {
    if (!podDetails?.latestRequest) setShowPodOrder(true);
    window.requestAnimationFrame(() => podWorkflowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const submitPodOrder = () => {
    setPodMessage('');
    try {
      const order = db.submitPublisherPodOrder(po.poNumber, podSelections, podNotes, publisherShipToAddress);
      setPodDetails(db.getPurchaseOrderPodDetails(po.poNumber, currentUser));
      setShowPodOrder(false);
      setPodMessage(`${order.podOrderId} was created and linked to this Purchase Order. Status: ${order.status}.`);
    } catch (error) {
      setPodMessage(error.message || 'The POD print request could not be submitted.');
    }
  };
  if (!purchaseOrder) return null;
  return (
    <div className="po-document-overlay" onClick={onClose}>
      <article className="po-document-sheet" role="dialog" aria-modal="true" aria-labelledby="purchase-order-title" onClick={event => event.stopPropagation()}>
        <button type="button" className="po-document-close" onClick={onClose} aria-label="Close Purchase Order">×</button>
        <header className="po-document-header">
          <div className="po-document-rule"><span /></div>
          <img src={assetPath('brand/philbo-logo.png')} alt="Philbo Distribution" className="po-document-logo" />
          <div className="po-document-meta">
            <div><h1 id="purchase-order-title">PURCHASE ORDER</h1><span>As of {po.poDate}</span><strong>PO FOR</strong><p>{po.publisherName}</p></div>
            <div><strong>{po.poNumber}</strong><span>{po.status}</span></div>
          </div>
          <div className="po-document-cycle"><span>Catalog cycle: <strong>{po.cycleName}</strong></span><span>FOC: <strong>{po.focDate}</strong></span><span>Store release: <strong>{po.releaseDate}</strong></span></div>
          {publisherCanOrder && podDetails?.eligibleItems?.length > 0 && (
            <button type="button" className="po-pod-callout" onClick={revealPodWorkflow}>
              <span><strong>Want Philbo to print this order?</strong><small>Add publisher copies too, then ship distribution copies to Philbo and your copies directly to you.</small></span>
              <b>{podDetails.latestRequest ? 'View Linked POD Order →' : 'Add POD Printing →'}</b>
            </button>
          )}
        </header>
        <section className="po-document-body">
          <div className="po-document-table-wrap"><table className="po-document-table"><thead><tr><th>Description</th><th>Qty</th><th>MSRP</th><th>Wholesale Price</th><th>Total Price</th><th>Philbo Commission</th><th>Net Due</th></tr></thead><tbody>{po.items.map(item => <tr key={item.titleId}><td><strong>{item.title}</strong><span>{item.philboId || 'PHILBO ID pending'} · {item.barcode || 'UPC pending'}</span></td><td>{item.qty}</td><td>${Number(item.msrp).toFixed(2)}</td><td>${Number(item.wholesalePrice || item.averageWholesalePrice || 0).toFixed(2)}</td><td>${Number(item.lineTotal).toFixed(2)}</td><td>-${Number(item.commission).toFixed(2)}</td><td><strong>${Number(item.netDue).toFixed(2)}</strong></td></tr>)}</tbody></table></div>

          <div className="po-document-bottom">
            <div className="po-document-ship">
              <strong>SHIP TO ADDRESS</strong>
              <div><b>PHILBO DISTRIBUTION</b><span>27 Barrett Avenue</span><span>Bayport, NY 11705</span></div>
              <strong>ADDITIONAL NOTES:</strong>
              <p>Philbo’s {po.commissionRate} commission is calculated from the full MSRP before the retailer wholesale discount is applied. This PO contains only the copies ordered for distribution.</p>
            </div>
            <div className="po-document-totals">
              <div><span>Total units</span><strong>{po.totalUnits}</strong></div>
              <div><span>Wholesale subtotal</span><strong>${Number(po.wholesaleTotal).toFixed(2)}</strong></div>
              <div><span>Philbo {po.commissionRate}</span><strong>-${Number(po.totalCommission).toFixed(2)}</strong></div>
              <div><span>Total due to Publisher</span><strong>${Number(po.netDueToPublisher).toFixed(2)}</strong></div>
            </div>
          </div>

          {podDetails?.eligibleItems?.length > 0 && (
            <section className="po-pod-workflow" ref={podWorkflowRef}>
              <div className="po-pod-heading">
                <div>
                  <span>PHILBO PRINT ON DEMAND</span>
                  <h2>Add printing to this PO</h2>
                  <p>The official PO quantity belongs to Philbo’s distribution shipment. You may add separate publisher copies and have those shipped directly to you.</p>
                </div>
                {podDetails.latestRequest
                  ? <div className="po-pod-linked-status"><strong>{podDetails.latestRequest.podOrderId}</strong><span>{podDetails.latestRequest.status}</span></div>
                  : publisherCanOrder && <button type="button" className="po-pod-start" onClick={() => setShowPodOrder(current => !current)}>{showPodOrder ? 'Cancel POD Order' : 'Order POD Printing'}</button>}
              </div>

              {podMessage && <div className="po-pod-message">{podMessage}</div>}

              {showPodOrder && !podDetails.latestRequest && (
                <div className="po-pod-order-panel">
                  <div className="po-pod-table-wrap">
                    <table className="po-pod-table">
                      <thead><tr><th>Print</th><th>Title and files</th><th>Distribution copies to Philbo</th><th>Publisher copies shipped to you</th><th>Total print quantity</th><th>Estimated printing</th></tr></thead>
                      <tbody>{podDetails.eligibleItems.map(item => {
                        const selection = podSelections.find(entry => entry.titleId === item.titleId) || { selected: false, extraCopies: 0 };
                        const totalQuantity = item.retailerQuantity + Math.max(0, Number(selection.extraCopies || 0));
                        return <tr key={item.titleId}>
                          <td><input type="checkbox" checked={selection.selected} aria-label={`Print ${item.title}`} onChange={event => setPodSelection(item.titleId, { selected: event.target.checked })} /></td>
                          <td><strong>{item.title}</strong><small>{item.philboId || 'PHILBO ID pending'} · {item.pageCount || '—'} pages · {item.interiorColor === 'bw' ? 'B&W' : 'Full color'}</small><span className={item.filesReady ? 'po-files-ready' : 'po-files-needed'}>{item.filesReady ? 'Files received — preflight review required' : 'Print files required before production'}</span></td>
                          <td><strong>{item.retailerQuantity}</strong><small>Locked from official PO</small></td>
                          <td><input type="number" min="0" step="1" value={selection.extraCopies} disabled={!selection.selected} aria-label={`Extra publisher copies for ${item.title}`} onChange={event => setPodSelection(item.titleId, { extraCopies: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })} /></td>
                          <td><strong>{selection.selected ? totalQuantity : 0}</strong></td>
                          <td><strong>{selection.selected && item.unitPrice != null ? `$${(item.unitPrice * totalQuantity).toFixed(2)}` : selection.selected ? 'Quote review' : '—'}</strong><small>{item.unitPrice != null ? `$${item.unitPrice.toFixed(2)} each` : 'Pricing requires review'}</small></td>
                        </tr>;
                      })}</tbody>
                    </table>
                  </div>
                  <div className="po-pod-order-footer">
                    <div className="po-pod-publisher-shipping">
                      <label>Production notes for Philbo<textarea value={podNotes} onChange={event => setPodNotes(event.target.value)} placeholder="Delivery timing, packaging, or other instructions…" /></label>
                      {publisherCopiesTotal > 0 && <label>Ship my {publisherCopiesTotal} publisher cop{publisherCopiesTotal === 1 ? 'y' : 'ies'} to<textarea required value={publisherShipToAddress} onChange={event => setPublisherShipToAddress(event.target.value)} placeholder="Publisher name and complete shipping address" /></label>}
                      <div className="po-pod-shipment-key"><span><strong>Distribution shipment</strong> → Philbo Distribution, Bayport NY</span><span><strong>Publisher copies</strong> → Your address above</span></div>
                    </div>
                    <div className="po-pod-estimate">
                      <span>Estimated printing</span>
                      <strong>{estimateNeedsReview ? 'Quote review required' : `$${podEstimate.toFixed(2)}`}</strong>
                      <small>Shipping and tax are confirmed separately. Printing is not deducted from your settlement until Philbo confirms the final amount.</small>
                      <button type="button" onClick={submitPodOrder}>Submit Linked POD Order</button>
                    </div>
                  </div>
                </div>
              )}

              {!publisherCanOrder && !podDetails.latestRequest && <p className="po-pod-admin-note">No publisher POD request has been submitted for this PO.</p>}
              {podDetails.latestRequest && <div className="po-pod-request-summary"><span>Distribution copies to Philbo: <strong>{podDetails.latestRequest.distributionQuantity ?? podDetails.latestRequest.quantity}</strong></span><span>Publisher copies shipped separately: <strong>{podDetails.latestRequest.publisherExtraQuantity || 0}</strong></span><span>Estimated printing: <strong>{podDetails.latestRequest.subtotal == null ? 'Quote review' : `$${Number(podDetails.latestRequest.subtotal).toFixed(2)}`}</strong></span><span>Settlement: <strong>{podDetails.latestRequest.paymentStatus}</strong></span>{podDetails.latestRequest.publisherShipToAddress && <span>Publisher ship-to: <strong>{podDetails.latestRequest.publisherShipToAddress}</strong></span>}</div>}
            </section>
          )}
          <p style={{ marginTop: '25px', fontSize: '.7rem', color: '#666' }}>This official Purchase Order was generated when the Catalog Cycle FOC closed. Retailer identities and account information are intentionally excluded.</p>
        </section>
        <footer className="po-document-footer"><button className="btn btn-secondary" onClick={onClose}>Close</button><button className="btn btn-primary" onClick={() => window.print()}>Print PO</button></footer>
      </article>
    </div>
  );
}
