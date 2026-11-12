import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase-mock';
import { getTitleStatusLabel, isTitlePendingReview, isTitlePublished } from '../lib/catalog-workflow';
import { buildAdminAttentionQueue } from '../lib/attention-center';
import PurchaseOrderDocument from './PurchaseOrderDocument';
import CatalogProductDetail from './CatalogProductDetail';
import CatalogPrintPreview from '../components/CatalogPrintPreview';
import CatalogCoverBuilder from '../components/CatalogCoverBuilder';
import { loadAdminReturns, reviewAdminReturn } from '../lib/backend';

export default function AdminPortal({ user, activeSection = 'dashboard', setActiveSection, onAttentionChange }) {
  const currentHour = new Date().getHours();
  const timeGreeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';
  const getRowValue = (row, colName) => {
    if (!row) return '';
    const keys = Object.keys(row);
    const matchedKey = keys.find(k => k.trim().toLowerCase() === colName.trim().toLowerCase());
    return matchedKey ? row[matchedKey] : '';
  };

  const [usersList, setUsersList] = useState(() => db.getUsers());
  const [cyclesList, setCyclesList] = useState(() => db.getCatalogCycles());
  const [unmatchedTitles, setUnmatchedTitles] = useState([]);
  const [cycleYearFilter, setCycleYearFilter] = useState('All');
  const [cycleStatusFilter, setCycleStatusFilter] = useState('All');
  const [expandedCycleId, setExpandedCycleId] = useState(null);
  const [showHistoricalCycles, setShowHistoricalCycles] = useState(false);
  
  // States for new cycle creator
  const [newCycleName, setNewCycleName] = useState('');
  const [newCycleCatalogDate, setNewCycleCatalogDate] = useState('');
  const [newCycleFocDate, setNewCycleFocDate] = useState('');
  const [newCycleReleaseDate, setNewCycleReleaseDate] = useState('');
  const [newCycleNotes, setNewCycleNotes] = useState('');
  const [titlesList, setTitlesList] = useState(() => db.getTitles());
  const [selectedTitleIds, setSelectedTitleIds] = useState([]);
  const [catalogDisplayTitle, setCatalogDisplayTitle] = useState(null);

  // Publisher and Admin demos can be open in separate tabs. Keep the Admin
  // review queue synchronized with title submissions saved in browser storage.
  React.useEffect(() => {
    const refreshSubmittedTitles = () => {
      try {
        setTitlesList(db.getTitles(user));
      } catch (refreshError) {
        console.warn('Unable to refresh Admin title submissions:', refreshError);
      }
    };
    const handleStorageChange = event => {
      if (!event.key || event.key === 'philbo_titles') refreshSubmittedTitles();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshSubmittedTitles();
    };

    refreshSubmittedTitles();
    window.addEventListener('focus', refreshSubmittedTitles);
    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', refreshSubmittedTitles);
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, activeSection]);

  React.useEffect(() => {
    const res = db.matchExistingTitlesToCycles();
    setUnmatchedTitles(res.unmatched || []);
  }, [titlesList]);
  const [returnsList, setReturnsList] = useState(() => user.authProvider === 'supabase' ? [] : db.getReturns());
  const [ordersList] = useState(() => db.getOrders());
  const [podOrdersList] = useState(() => db.getPodOrders(user));
  const [productionOrdersList, setProductionOrdersList] = useState(() => {
    try { return db.getProductionOrders(user); } catch { return []; }
  });
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('All');
  const [selectedSalesOrder, setSelectedSalesOrder] = useState(null);
  const [inventoryList, setInventoryList] = useState(() => db.getInventory());

  React.useEffect(() => {
    if (user.authProvider !== 'supabase') return undefined;
    let active = true;
    const refreshLiveReturns = () => loadAdminReturns()
      .then(items => { if (active) setReturnsList(items); })
      .catch(error => { if (active) setToast(error.message || 'Return requests could not be loaded.'); });
    refreshLiveReturns();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshLiveReturns();
    };
    window.addEventListener('focus', refreshLiveReturns);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      active = false;
      window.removeEventListener('focus', refreshLiveReturns);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user.authProvider]);
  
  // Tab states: 'approvals' | 'titles' | 'returns' | 'pos' | 'reports'
  const [activeTab, setActiveTab] = useState('approvals');
  
  // PO generation state
  const [generatedPOs, setGeneratedPOs] = useState(() => db.generatePurchaseOrders());
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState(null);

  // Search/Filters
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [clientRoleFilter, setClientRoleFilter] = useState('all');

  // Inline approval configurations state
  const [approvalConfigs, setApprovalConfigs] = useState({});

  // Hovered state for SVG Donut chart
  const [hoveredSegment, setHoveredSegment] = useState(null);

  // Selected title for PDF preview modal
  const [selectedPreviewTitle, setSelectedPreviewTitle] = useState(null);
  const [previewPage, setPreviewPage] = useState(1);

  // Official POs are filtered by Catalog Cycle ID, never generated by loose dates.
  const [targetCycleId, setTargetCycleId] = useState('');

  // Selected approved retailer profile for info modal
  const [selectedRetailerProfile, setSelectedRetailerProfile] = useState(null);

  // Advanced workflow states
  const [reviewNotes, setReviewNotes] = useState('');
  const [overrideFocDate, setOverrideFocDate] = useState('');
  const [overrideFulfillment, setOverrideFulfillment] = useState('Philbo POD');
  const [overridePhilboId, setOverridePhilboId] = useState('');
  const [adminTitleEdits, setAdminTitleEdits] = useState({});

  // CSV Import States
  const [csvRows, setCsvRows] = useState([]);
  const [importReport, setImportReport] = useState(null);
  const [importError, setImportError] = useState('');

  // Feedback Toast state
  const [toast, setToast] = useState(null);
  const [approvalInvitation, setApprovalInvitation] = useState(null);
  const [catalogPreview, setCatalogPreview] = useState(null);
  const [catalogPrintCycleId, setCatalogPrintCycleId] = useState('');
  const [catalogTemplateCycleId, setCatalogTemplateCycleId] = useState('');
  const [catalogBuilderCycleId, setCatalogBuilderCycleId] = useState('');
  const [catalogCompilation, setCatalogCompilation] = useState(null);
  const [exportHistory, setExportHistory] = useState(() => db.getCatalogExportHistory(user));
  const [operationsNotes, setOperationsNotes] = useState(() => db.getOperationalNotes(user));
  const [operationsNoteContext, setOperationsNoteContext] = useState('general');
  const [operationsNoteStatus, setOperationsNoteStatus] = useState('Pending');
  const [operationsNoteText, setOperationsNoteText] = useState('');
  const [operationsNoteMessage, setOperationsNoteMessage] = useState('');
  const [recentActivity, setRecentActivity] = useState(() => db.getAuditLog(user).slice(0, 12));

  React.useEffect(() => {
    if (activeSection !== 'dashboard') return;
    setOperationsNotes(db.getOperationalNotes(user));
    setRecentActivity(db.getAuditLog(user).slice(0, 12));
    try { setProductionOrdersList(db.getProductionOrders(user)); } catch { setProductionOrdersList([]); }
  }, [activeSection, user]);

  // Action Handlers
  const handleToggleSubmissions = (cycleId, currentState) => {
    db.updateCatalogCycle(cycleId, { publisherOpen: !currentState }, user.email, `Submissions toggled to ${!currentState}`);
    setCyclesList(db.getCatalogCycles());
    setGeneratedPOs(db.generatePurchaseOrders());
    setToast('Catalog cycle submissions updated!');
    setTimeout(() => setToast(null), 3000);
  };

  const handleToggleOrdering = (cycleId, currentState) => {
    db.updateCatalogCycle(cycleId, {
      retailerOpen: !currentState,
      catalogPublicationSuppressed: currentState ? true : false
    }, user.email, `Retailer ordering toggled to ${!currentState}`);
    setCyclesList(db.getCatalogCycles());
    setToast('Catalog cycle ordering updated!');
    setTimeout(() => setToast(null), 3000);
  };

  const handlePublishCatalog = cycleId => {
    try {
      const result = db.publishCatalogCycle(cycleId, user);
      setCyclesList(db.getCatalogCycles());
      setExportHistory(db.getCatalogExportHistory(user));
      setToast(`Catalog version ${result.version} published with ${result.titleCount} approved title${result.titleCount === 1 ? '' : 's'}. Retailer catalog and CSV downloads are now live.`);
    } catch (error) {
      setToast(error.message || 'The retailer catalog could not be published.');
    }
    setTimeout(() => setToast(null), 5000);
  };

  const handleToggleCycleBooks = cycleId => {
    if (expandedCycleId === cycleId) {
      setExpandedCycleId(null);
      return;
    }
    setExpandedCycleId(cycleId);
    window.setTimeout(() => {
      const catalogView = document.getElementById(`catalog-cycle-books-${cycleId}`);
      catalogView?.focus({ preventScroll: true });
      catalogView?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const handleToggleLock = (cycleId, currentStatus) => {
    const nextStatus = currentStatus === 'FOC Locked' ? 'Open for Retailer Ordering' : 'FOC Locked';
    db.updateCatalogCycle(cycleId, { 
      status: nextStatus, 
      publisherOpen: nextStatus !== 'FOC Locked',
      retailerOpen: nextStatus === 'Open for Retailer Ordering'
    }, user.email, `Lock toggled to ${nextStatus}`);
    setCyclesList(db.getCatalogCycles());
    setGeneratedPOs(db.generatePurchaseOrders());
    setToast(`Catalog cycle FOC lock toggled to: ${nextStatus}!`);
    setTimeout(() => setToast(null), 3000);
  };

  const handleCatalogCsvDownload = (cycleId, includeAllTierPrices = false) => {
    try {
      const result = db.generateCatalogCsv(cycleId, user, { includeAllTierPrices });
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = includeAllTierPrices ? result.filename.replace('.csv', '_ADMIN_ALL_TIERS.csv') : result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportHistory(db.getCatalogExportHistory(user));
      setToast(`Generated ${result.titleCount} Live catalog rows.`);
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast(err.message || 'Catalog export failed.');
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleCatalogCsvPreview = (cycleId) => {
    try {
      setCatalogPreview(db.generateCatalogCsv(cycleId, user, { recordHistory: false }));
    } catch (err) {
      setToast(err.message || 'Catalog preview failed.');
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleAllCatalogCsvDownload = () => {
    try {
      const result = db.generateAllCatalogCsv(user, { includeAllTierPrices: true });
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportHistory(db.getCatalogExportHistory(user));
      setToast(`Exported ${result.titleCount} approved titles across all cycles.`);
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast(err.message || 'All-cycle export failed.');
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleToggleRetailerDownload = (cycleId, currentState) => {
    db.updateCatalogCycle(cycleId, { retailerDownloadEnabled: !currentState }, user.email, `Retailer CSV download ${!currentState ? 'enabled' : 'disabled'}`);
    setCyclesList(db.getCatalogCycles());
  };

  const handleCreateCycle = (e) => {
    e.preventDefault();
    if (!newCycleName || !newCycleCatalogDate || !newCycleFocDate || !newCycleReleaseDate) {
      alert('Please fill out all fields to create a Catalog Cycle.');
      return;
    }
    
    const cycles = JSON.parse(localStorage.getItem('philbo_catalog_cycles')) || [];
    const newId = 'cycle_' + Date.now();
    const newCycle = {
      cycleId: newId,
      cycleName: `${newCycleName} FOC • Catalog opens ${newCycleCatalogDate} • In stores ${newCycleReleaseDate}`,
      catalogDate: newCycleCatalogDate,
      focDate: newCycleFocDate,
      releaseDate: newCycleReleaseDate,
      status: 'Upcoming',
      publisherOpen: true,
      retailerOpen: false,
      adminNotes: newCycleNotes,
      history: [
        {
          date: new Date().toISOString(),
          user: user.email,
          action: 'Cycle created manually by Admin',
          notes: newCycleNotes
        }
      ]
    };
    cycles.push(newCycle);
    localStorage.setItem('philbo_catalog_cycles', JSON.stringify(cycles));
    setCyclesList(db.getCatalogCycles());
    
    // Clear fields
    setNewCycleName('');
    setNewCycleCatalogDate('');
    setNewCycleFocDate('');
    setNewCycleReleaseDate('');
    setNewCycleNotes('');
    setToast('New Catalog Cycle seeded!');
    setTimeout(() => setToast(null), 3000);
  };

  const handleAssignTitleCycle = (titleId, cycleId) => {
    const success = db.assignTitleCycleManually(titleId, cycleId, user.email);
    if (success) {
      setTitlesList(db.getTitles());
      setToast('Historic title assigned to Catalog Cycle successfully!');
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleInventoryFieldChange = (inventoryId, field, value) => {
    setInventoryList(current => current.map(item => {
      if (item.inventoryId !== inventoryId) return item;
      const updated = { ...item, [field]: value };
      updated.available = Math.max(0, Number(updated.onHand || 0) - Number(updated.reserved || 0) - Number(updated.damaged || 0) - Number(updated.publisherOwned || 0));
      return updated;
    }));
  };

  const handleInventoryFieldSave = (inventoryId, field, value) => {
    try {
      db.updateInventory(inventoryId, { [field]: value }, user.email);
      setInventoryList(db.getInventory());
      setToast('Inventory adjustment saved.');
      setTimeout(() => setToast(null), 1800);
    } catch (err) {
      setToast(err.message || 'Inventory adjustment failed.');
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleOpenInventoryTitle = (inventoryItem) => {
    const titleRecord = titlesList.find(title => title.titleId === inventoryItem.titleId || title.philboId === inventoryItem.philboId);
    if (!titleRecord) {
      setToast('The linked catalog title could not be found.');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    openTitleReview(titleRecord);
  };

  const handleOpenSalesOrder = orderOrId => {
    const order = typeof orderOrId === 'string'
      ? ordersList.find(item => item.orderId === orderOrId)
      : orderOrId;
    if (!order) {
      setToast('The retailer sales order could not be found.');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setSelectedRetailerProfile(null);
    setSelectedSalesOrder(order);
  };

  const handleApproveUser = (uid, settings) => {
    const result = db.approveUser(uid, settings);
    setUsersList(db.getUsers());
    setGeneratedPOs(db.generatePurchaseOrders());
    if (result?.invitation) setApprovalInvitation(result.invitation);
    setToast(result?.linkedToExistingAccount ? 'Role approved and added to the existing account.' : 'Client approved successfully!');
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreateAccountInvitation = uid => {
    const result = db.createExternalAccountInvitation(uid);
    setUsersList(db.getUsers());
    setApprovalInvitation(result.invitation);
    setToast('One-time login created. Open the email draft to send it.');
    setTimeout(() => setToast(null), 3000);
  };

  const handleExternalAccountStatus = (account, nextStatus) => {
    const accountType = account.isPodClient ? 'POD account' : account.role === 'publisher' ? 'publisher' : 'retailer';
    if (nextStatus === 'suspended' && !window.confirm(`Place ${account.companyName} on hold?\n\nThey will be signed out immediately and will not be able to sign in until the account is reactivated.`)) return;
    if (nextStatus === 'revoked' && !window.confirm(`Archive ${account.companyName}?\n\nThey will lose portal access immediately. Their titles, orders, and account history will be preserved, and an administrator can reactivate the account later.`)) return;
    const note = nextStatus === 'active'
      ? `${accountType} access restored by Administrator.`
      : nextStatus === 'suspended'
        ? `${accountType} placed on hold by Administrator.`
        : `${accountType} archived by Administrator. Historical records retained.`;
    const updated = db.updateExternalAccountStatus(account.uid, nextStatus, note);
    setUsersList(db.getUsers());
    if (selectedRetailerProfile?.uid === account.uid) setSelectedRetailerProfile(updated);
    setToast(nextStatus === 'active' ? `${account.companyName} can access the portal again.` : nextStatus === 'suspended' ? `${account.companyName} is now on hold and cannot sign in.` : `${account.companyName} has been archived and cannot sign in.`);
    setTimeout(() => setToast(null), 4000);
  };

  const handlePodTaxReview = (account, decision) => {
    const action = decision === 'approved' ? 'approve' : 'reject';
    if (!window.confirm(`${action === 'approve' ? 'Approve' : 'Reject'} the resale certificate for ${account.companyName}?${action === 'approve' ? '\n\nThis will mark the POD account tax-exempt.' : '\n\nTax will continue to apply until a corrected certificate is approved.'}`)) return;
    const updated = db.reviewPodResaleCertificate(account.uid, decision);
    setUsersList(db.getUsers());
    setSelectedRetailerProfile(updated);
    setToast(action === 'approve' ? `${account.companyName} is now approved for tax-exempt treatment.` : `${account.companyName}'s resale certificate was rejected.`);
    setTimeout(() => setToast(null), 4000);
  };

  const accountStatusLabel = account => account.accountStatus === 'suspended'
    ? 'On Hold'
    : account.accountStatus === 'revoked'
      ? 'Archived'
      : account.isInvitationPending
        ? 'Invitation Pending'
        : 'Active';
  const accountStatusBadge = account => account.accountStatus === 'suspended' || account.accountStatus === 'revoked'
    ? 'badge-red'
    : account.isInvitationPending
      ? 'badge-gold'
      : 'badge-green';

  const buildApprovalInvitationMessage = invitation => {
    const loginUrl = `${window.location.origin}${window.location.pathname}`;
    const accountLabel = invitation.isPodClient ? 'POD Account' : invitation.role === 'retailer' ? 'Retailer' : invitation.role === 'publisher' ? 'Publisher' : 'Philbo';
    return `Hello ${invitation.companyName || 'there'},\n\nYour ${accountLabel} Portal account has been approved.\n\nSign in: ${loginUrl}\nLogin email: ${invitation.email}\nOne-time password: ${invitation.temporaryPassword}\n\nOn your first sign-in, you must complete all required contact and mailing information before creating your secure password.\n\nWelcome to Philbo Distribution!`;
  };

  const handleApproveTitle = (titleId) => {
    const result = db.approveTitle(titleId);
    setTitlesList(db.getTitles());
    if (result?.catalogSynchronization?.published) {
      setCyclesList(db.getCatalogCycles());
      setExportHistory(db.getCatalogExportHistory(user));
    }
    setToast(result?.catalogSynchronization?.published
      ? `Title approved. ${result.catalogSynchronization.cycle.cycleName} version ${result.catalogSynchronization.version} now contains ${result.catalogSynchronization.titleCount} title${result.catalogSynchronization.titleCount === 1 ? '' : 's'} everywhere.`
      : `Title approved, but it is not in a published catalog yet. ${result?.catalogSynchronization?.reason || 'Check its assigned Catalog Cycle.'}`);
    setTimeout(() => setToast(null), 3000);
  };

  const handleUpdateTitleStatus = (titleId, newStatus, notes = '', overrides = {}) => {
    const result = db.updateTitleStatus(titleId, newStatus, user.email, notes, overrides);
    setTitlesList(db.getTitles());
    if (result?.catalogSynchronization?.published) {
      setCyclesList(db.getCatalogCycles());
      setExportHistory(db.getCatalogExportHistory(user));
    }
    // Update active modal title if open
    const updated = db.getTitles().find(t => t.titleId === titleId);
    if (selectedPreviewTitle && selectedPreviewTitle.titleId === titleId) {
      setSelectedPreviewTitle(updated);
    }
    const statusMessage = newStatus === 'Approved' && result?.catalogSynchronization?.published
      ? `Approved and synchronized to ${result.catalogSynchronization.cycle.cycleName} version ${result.catalogSynchronization.version}. Public, retailer, and CSV now use the same ${result.catalogSynchronization.titleCount} title${result.catalogSynchronization.titleCount === 1 ? '' : 's'}.`
      : newStatus === 'Approved'
        ? `Approved, but not yet public: ${result?.catalogSynchronization?.reason || 'the assigned Catalog Cycle has not been published.'}`
      : newStatus === 'Live'
        ? 'Catalog listing is now live for public and retailer viewing.'
        : `Title status successfully updated to ${newStatus}!`;
    setToast(statusMessage);
    setTimeout(() => setToast(null), 3000);
  };

  const isBulkApprovableTitle = title => !isTitlePublished(title.status) && !['Archived', 'Rejected'].includes(title.status);
  const bulkApprovableTitles = titlesList.filter(isBulkApprovableTitle);
  const selectedBulkTitles = bulkApprovableTitles.filter(title => selectedTitleIds.includes(title.titleId));
  const allBulkApprovableSelected = bulkApprovableTitles.length > 0 && selectedBulkTitles.length === bulkApprovableTitles.length;

  const toggleBulkTitleSelection = titleId => {
    setSelectedTitleIds(current => current.includes(titleId)
      ? current.filter(id => id !== titleId)
      : [...current, titleId]);
  };

  const toggleAllBulkTitles = () => {
    setSelectedTitleIds(allBulkApprovableSelected ? [] : bulkApprovableTitles.map(title => title.titleId));
  };

  const handleBulkApproveTitles = () => {
    if (!selectedBulkTitles.length) return;
    if (!window.confirm(`Approve ${selectedBulkTitles.length} selected title${selectedBulkTitles.length === 1 ? '' : 's'}?\n\nEach title will retain its own approval history and will synchronize to its assigned catalog cycle.`)) return;

    let approvedCount = 0;
    let synchronizedCount = 0;
    const failures = [];
    selectedBulkTitles.forEach(title => {
      try {
        const result = db.updateTitleStatus(
          title.titleId,
          'Approved',
          user.email,
          'Bulk approved by Administrator from the Master Comic Books Database.'
        );
        approvedCount += 1;
        if (result?.catalogSynchronization?.published) synchronizedCount += 1;
      } catch (error) {
        failures.push(`${title.title}: ${error.message}`);
      }
    });

    setTitlesList(db.getTitles(user));
    setCyclesList(db.getCatalogCycles());
    setExportHistory(db.getCatalogExportHistory(user));
    setSelectedTitleIds([]);
    setToast(failures.length
      ? `${approvedCount} title${approvedCount === 1 ? '' : 's'} approved; ${failures.length} could not be approved. ${failures[0]}`
      : `${approvedCount} title${approvedCount === 1 ? '' : 's'} approved. ${synchronizedCount} catalog synchronization${synchronizedCount === 1 ? '' : 's'} completed.`);
    setTimeout(() => setToast(null), 6000);
  };

  const openTitleReview = title => {
    setSelectedPreviewTitle(title);
    setPreviewPage(1);
    setOverrideFocDate(title.focDate || '');
    setOverrideFulfillment(title.fulfillmentMethod === 'Publisher Fulfilled' ? 'Inventory' : (title.fulfillmentMethod || 'Philbo POD'));
    setOverridePhilboId(title.philboId || '');
    setReviewNotes(title.reviewNotes || '');
    setAdminTitleEdits({
      title: title.title || '', issueNumber: title.issueNumber || '', variantNumber: title.variantNumber || 'A',
      coverDescription: title.coverDescription || '', bookFormat: title.bookFormat || '', genre: title.genre || '',
      ageRange: title.ageRange || '', seriesFrequency: title.seriesFrequency || '', pageCount: title.pageCount || '',
      msrp: title.msrp || '', colorProfile: title.colorProfile || '', width: title.width || '', height: title.height || '',
      writer: title.writer || '', artist: title.artist || '', coverArtist: title.coverArtist || '',
      description: title.description || '', coverUrl: title.coverUrl || '', additionalImage1: title.additionalImage1 || '',
      additionalImage2: title.additionalImage2 || '', publisherLogoUrl: title.publisherLogoUrl || '',
      incentiveRatio: title.incentiveRatio || '', incentiveRules: title.incentiveRules || '', cycleId: title.cycleId || ''
    });
  };

  const saveAdminReviewEdits = () => {
    if (!selectedPreviewTitle) return null;
    const updated = db.editTitle(
      selectedPreviewTitle.titleId,
      { ...selectedPreviewTitle, ...adminTitleEdits, pageCount: Number(adminTitleEdits.pageCount), msrp: Number(adminTitleEdits.msrp) },
      selectedPreviewTitle.status,
      user.email
    );
    setTitlesList(db.getTitles());
    setSelectedPreviewTitle(updated);
    return updated;
  };

  const decideTitleReview = newStatus => {
    if (['Changes Requested', 'Rejected'].includes(newStatus) && !reviewNotes.trim()) {
      setToast(newStatus === 'Changes Requested' ? 'Add a revision note for the publisher before sending this back.' : 'Add a rejection reason before rejecting this solicitation.');
      setTimeout(() => setToast(null), 3500);
      return;
    }
    const saved = saveAdminReviewEdits();
    if (!saved) return;
    const overrides = { focDate: overrideFocDate, fulfillmentMethod: overrideFulfillment, philboId: overridePhilboId };
    handleUpdateTitleStatus(saved.titleId, newStatus, reviewNotes, overrides);
    setSelectedPreviewTitle(null);
  };

  const handleOverrideFoc = (titleId, newFocDate) => {
    if (!newFocDate) return;
    const titles = db.getTitles();
    const idx = titles.findIndex(t => t.titleId === titleId);
    if (idx > -1) {
      const prev = titles[idx];
      titles[idx] = {
        ...prev,
        focDate: newFocDate,
        history: [
          ...(prev.history || []),
          {
            date: new Date().toISOString(),
            user: user.email,
            action: 'FOC date changed',
            notes: `FOC override to: ${newFocDate} (previous: ${prev.focDate}).`
          }
        ]
      };
      localStorage.setItem('philbo_titles', JSON.stringify(titles));
      setTitlesList(titles);
      setSelectedPreviewTitle(titles[idx]);
      setToast('FOC date successfully overridden by Administrator!');
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleToggleFoc = (titleId) => {
    db.toggleFocLock(titleId);
    setTitlesList(db.getTitles());
  };

  const handleApproveReturn = async (returnId) => {
    try {
      if (user.authProvider === 'supabase') {
        await reviewAdminReturn(returnId, 'approved');
        setReturnsList(await loadAdminReturns());
      } else {
        db.approveReturn(returnId);
        setReturnsList(db.getReturns());
        setUsersList(db.getUsers()); // Returns count changed
      }
      setToast('Return authorized and credit applied once.');
    } catch (error) {
      setToast(error.message || 'The return could not be approved.');
    }
    setTimeout(() => setToast(null), 3000);
  };

  const handleRejectReturn = async (returnId) => {
    try {
      if (user.authProvider === 'supabase') {
        await reviewAdminReturn(returnId, 'rejected');
        setReturnsList(await loadAdminReturns());
      } else {
        db.rejectReturn(returnId);
        setReturnsList(db.getReturns());
      }
      setToast('Return request rejected. Its reserved allowance is available again.');
    } catch (error) {
      setToast(error.message || 'The return could not be rejected.');
    }
    setTimeout(() => setToast(null), 3000);
  };

  const handleExportPirateShipCSV = (ordersToExport) => {
    const headers = [
      'Name',
      'Company',
      'Address 1',
      'Address 2',
      'City',
      'State',
      'Zip',
      'Country',
      'Email',
      'Reference ID',
      'Package Weight (oz)',
      'Length (in)',
      'Width (in)',
      'Height (in)'
    ];

    const rows = ordersToExport.map(order => {
      const allUsers = db.getUsers();
      const retailerUser = allUsers.find(u => u.uid === order.retailerId) || {};
      
      let totalWeightOz = 0;
      order.items.forEach(item => {
        const titleRecord = titlesList.find(t => t.titleId === item.titleId) || {};
        const unitWeight = parseFloat(titleRecord.weight) || 2.8;
        totalWeightOz += unitWeight * item.qty;
      });

      const totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);
      let length = 12;
      let width = 9;
      let height = 2;
      if (totalQty > 20) {
        height = 6;
      }

      const shippingName = retailerUser.shippingName || retailerUser.companyName || 'Recipient';
      const shippingAddress1 = retailerUser.shippingAddress1 || '123 Retailer St';
      const shippingAddress2 = retailerUser.shippingAddress2 || '';
      const shippingCity = retailerUser.shippingCity || 'City';
      const shippingState = retailerUser.shippingState || 'State';
      const shippingZip = retailerUser.shippingZip || 'Zip';
      const shippingCountry = retailerUser.shippingCountry || 'US';
      const email = retailerUser.email || '';

      return [
        `"${shippingName.replace(/"/g, '""')}"`,
        `"${(retailerUser.companyName || '').replace(/"/g, '""')}"`,
        `"${shippingAddress1.replace(/"/g, '""')}"`,
        `"${shippingAddress2.replace(/"/g, '""')}"`,
        `"${shippingCity.replace(/"/g, '""')}"`,
        `"${shippingState.replace(/"/g, '""')}"`,
        `"${shippingZip.replace(/"/g, '""')}"`,
        `"${shippingCountry.replace(/"/g, '""')}"`,
        `"${email.replace(/"/g, '""')}"`,
        `"${order.orderId}"`,
        totalWeightOz.toFixed(2),
        length,
        width,
        height
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `pirateship_labels_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setToast(`Exported ${ordersToExport.length} label record(s) for Pirate Ship!`);
    setTimeout(() => setToast(null), 3500);
  };

  // Filter queues
  const pendingUsers = usersList.filter(u => !u.approved); const pendingPublishers = pendingUsers.filter(u => u.role === 'publisher' && !u.isPodClient); const pendingRetailers = pendingUsers.filter(u => u.role === 'retailer'); const pendingPodUsers = pendingUsers.filter(u => u.isPodClient);
  const pendingTitles = titlesList.filter(t => isTitlePendingReview(t.status));
  const approvedRetailers = usersList
    .filter(account => account.approved && (account.role === 'retailer' || (account.roles || []).includes('retailer')))
    .map(account => ({ ...account, ...(account.roleProfiles?.retailer || {}), uid: account.uid, email: account.email, role: 'retailer', approved: true }));
  const getPublisherTitles = publisher => titlesList.filter(title =>
    title.publisherId === publisher.uid ||
    title.publisherId === publisher.organizationId ||
    String(title.publisherName || '').trim().toLowerCase() === String(publisher.companyName || '').trim().toLowerCase()
  );
  const publisherDirectory = usersList
    .filter(publisher => publisher.role === 'publisher' && !publisher.isPodClient)
    .filter(publisher => publisher.approved || publisher.isInvitationPending || publisher.importedCatalogAccount || getPublisherTitles(publisher).length > 0);
  const pendingReturns = returnsList.filter(r => r.status === 'pending');
  const pendingSalesOrders = ordersList.filter(order => ['pending', 'new', 'processing'].includes(String(order.status || '').toLowerCase()));
  const pendingPodOrders = podOrdersList.filter(order => ['Submitted for Review', 'Quote Requested', 'Submitted for Production Review', 'On Hold — Print Files Required'].includes(order.status));
  const lowInventoryItems = inventoryList.filter(item => Number(item.available ?? item.onHand ?? 0) <= Number(item.reorderLevel || 0));
  const operationsQueue = React.useMemo(() => buildAdminAttentionQueue({
    users: usersList,
    titles: titlesList,
    returns: returnsList,
    orders: ordersList,
    podOrders: podOrdersList,
    inventory: inventoryList,
    productionOrders: productionOrdersList,
    cycles: cyclesList,
    unmatchedTitles
  }), [usersList, titlesList, returnsList, ordersList, podOrdersList, inventoryList, productionOrdersList, cyclesList, unmatchedTitles]);
  const totalPendingOperations = operationsQueue.reduce((sum, item) => sum + item.count, 0);
  const activeOperationsQueue = operationsQueue.filter(item => item.count > 0);
  React.useEffect(() => {
    onAttentionChange?.(operationsQueue);
  }, [onAttentionChange, operationsQueue]);
  const operationsNoteOptions = [
    { key: 'general', label: 'General Operations' },
    ...operationsQueue.map(item => ({ key: item.key, label: item.label }))
  ];
  const refreshOperationalTracking = () => {
    setOperationsNotes(db.getOperationalNotes(user));
    setRecentActivity(db.getAuditLog(user).slice(0, 12));
  };
  const handleAddOperationsNote = event => {
    event.preventDefault();
    try {
      const selectedContext = operationsNoteOptions.find(option => option.key === operationsNoteContext) || operationsNoteOptions[0];
      db.addOperationalNote({ contextId: selectedContext.key, contextLabel: selectedContext.label, status: operationsNoteStatus, note: operationsNoteText });
      setOperationsNoteText('');
      setOperationsNoteMessage('Follow-up note saved.');
      refreshOperationalTracking();
    } catch (error) {
      setOperationsNoteMessage(error.message || 'The note could not be saved.');
    }
  };
  const handleOperationsNoteStatus = (noteId, status) => {
    try {
      db.updateOperationalNoteStatus(noteId, status);
      setOperationsNoteMessage('Follow-up status updated.');
      refreshOperationalTracking();
    } catch (error) {
      setOperationsNoteMessage(error.message || 'The follow-up status could not be updated.');
    }
  };
  const orderStatuses = Array.from(new Set(ordersList.map(order => order.status).filter(Boolean)));
  const filteredOrders = ordersList.filter(order => {
    const search = orderSearchTerm.trim().toLowerCase();
    const matchesSearch = !search || [
      order.orderId,
      order.retailerName,
      ...(order.items || []).flatMap(item => [item.titleName, item.title])
    ].some(value => String(value || '').toLowerCase().includes(search));
    const matchesStatus = orderStatusFilter === 'All' || order.status === orderStatusFilter;
    return matchesSearch && matchesStatus;
  });
  const selectedSalesOrderRetailer = selectedSalesOrder
    ? usersList.find(account => account.uid === selectedSalesOrder.retailerId)
    : null;
  const selectedSalesOrderCopies = selectedSalesOrder
    ? (selectedSalesOrder.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0)
    : 0;

  // Math for dashboard stats
  let totalSalesMSRP = 0;
  let totalSalesWholesale = 0;
  let totalPhilboCommissions = 0;

  ordersList.forEach(order => {
    totalSalesMSRP += order.msrpTotal;
    totalSalesWholesale += order.netTotal;
    
    order.items.forEach(item => {
      const pubUser = usersList.find(u => u.uid === item.publisherId) || { commissionRate: 0.10 };
      const itemMsrpLine = item.qty * item.msrp;
      totalPhilboCommissions += (itemMsrpLine * pubUser.commissionRate);
    });
  });

  const netPublisherPayTotal = totalSalesWholesale - totalPhilboCommissions;

  // Donut chart math parameters
  const chartRadius = 40;
  const chartCircumference = 2 * Math.PI * chartRadius; // ~251.327
  const publisherShare = totalSalesWholesale > 0 ? (netPublisherPayTotal / totalSalesWholesale) : 0.8;
  const commissionShare = totalSalesWholesale > 0 ? (totalPhilboCommissions / totalSalesWholesale) : 0.2;

  const publisherStroke = `${publisherShare * chartCircumference} ${chartCircumference}`;
  const commissionStroke = `${commissionShare * chartCircumference} ${chartCircumference}`;
  const commissionOffset = `-${publisherShare * chartCircumference}`;

  // Local config initialization helper
  const getApprovalConfig = (uid, role) => {
    if (approvalConfigs[uid]) return approvalConfigs[uid];
    const defaultVal = role === 'retailer' ? { tier: 'Tier I' } : role === 'publisher' ? { commissionRate: 10 } : {};
    return defaultVal;
  };

  const setApprovalConfigField = (uid, field, val) => {
    setApprovalConfigs(prev => ({
      ...prev,
      [uid]: {
        ...getApprovalConfig(uid),
        [field]: val
      }
    }));
  };

  // Simulated PO Export function
  const handleExportPO = (po) => {
    const headers = 'SKU,Comic Title,Quantity,MSRP,Wholesale Price,Line Total,Commission,Net Due\n';
    const rows = po.items.map(item => 
      `${item.sku},"${item.title.replace(/"/g, '""')}",${item.qty},${item.msrp},${item.wholesalePrice},${item.lineTotal},${item.commission},${item.netDue}`
    ).join('\n');
    
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(headers + rows);
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `PurchaseOrder_${po.poNumber}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setToast(`Purchase Order ${po.poNumber} successfully exported to CSV!`);
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <div className="admin-portal-root" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* Toast Notification */}
      {toast && (
        <div className="portal-toast" role="status" aria-live="polite">
          <span className="portal-toast-icon">⚡</span><span className="portal-toast-message">{toast}</span>
        </div>
      )}

      {/* Tab Contents Wrapper */}
      <div className="admin-tab-content">

        {/* Main Dashboard Section */}
        {activeSection === 'dashboard' && (
        <div className="admin-dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          {/* Header Greeting */}
          <div className="admin-dashboard-intro">
            <h2 style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#fff', letterSpacing: '0.02em', textTransform: 'none' }}>{timeGreeting}, Maura.</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>Here’s what needs your attention today.</p>
          </div>

          {/* Primary Admin shortcuts */}
          <div className="glass-panel admin-quick-actions-panel admin-quick-actions-top" style={{ padding: '16px 20px' }}>
            <h3 style={{ fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--text-secondary)', margin: 0 }}>QUICK ACTIONS</h3>
            <div>
              <button className="btn btn-secondary" onClick={() => setActiveSection('publishers')}>Add Publisher</button>
              <button className="btn btn-secondary" onClick={() => setActiveSection('retailers')}>Add Retailer</button>
              <button className="btn btn-secondary" onClick={() => setActiveSection('catalog')}>Submit Title</button>
              <button className="btn btn-secondary" onClick={() => setActiveSection('purchase-orders')}>Generate POs</button>
            </div>
          </div>

          {/* 4 Metric Cards Row */}
          <div className="admin-dashboard-metrics" style={{ display: 'grid' }}>
            <div className="glass-panel admin-dashboard-metric" style={{ padding: '20px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Orders Today</span>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff', marginTop: '6px' }}>{ordersList.length + 12}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--green-primary)', marginTop: '4px', fontWeight: '500' }}>↑ 18% vs yesterday</span>
            </div>
            <div className="glass-panel admin-dashboard-metric" style={{ padding: '20px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Revenue</span>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--gold-primary)', marginTop: '6px' }}>${totalSalesWholesale.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--green-primary)', marginTop: '4px', fontWeight: '500' }}>↑ 24% vs yesterday</span>
            </div>
            <div className="glass-panel admin-dashboard-metric" style={{ padding: '20px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Books Shipping</span>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff', marginTop: '6px' }}>
                {ordersList.reduce((acc, o) => acc + o.items.reduce((sum, i) => sum + i.qty, 0), 0)}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Across active orders</span>
            </div>
            <div className="glass-panel admin-dashboard-metric" style={{ padding: '20px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Inventory Alerts</span>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff', marginTop: '6px' }}>
                {lowInventoryItems.length}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--red-primary)', marginTop: '4px', fontWeight: '500' }}>Low stock detected</span>
            </div>
          </div>

          {/* 2-Column Split */}
          <div className="admin-dashboard-workspace">
            {/* Left Column: Recent Orders */}
            <div className="glass-panel admin-recent-orders-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-secondary)', margin: 0 }}>RECENT ORDERS</h3>
                <span onClick={() => setActiveSection('orders')} style={{ fontSize: '0.75rem', color: 'var(--gold-primary)', cursor: 'pointer', fontWeight: '600' }}>View All →</span>
              </div>
              <div className="admin-recent-orders-list">
                {ordersList.slice(0, 5).map(o => {
                  const totalQty = o.items.reduce((sum, i) => sum + i.qty, 0);
                  return (
                    <article className="admin-recent-order-row" key={o.orderId}>
                      <div className="admin-recent-order-identity">
                        <button type="button" className="table-link-button" style={{ fontFamily: 'monospace' }} onClick={() => { setActiveSection('orders'); handleOpenSalesOrder(o); }}>{o.orderId}</button>
                        <small>{o.retailerName}</small>
                      </div>
                      <div className="admin-recent-order-stat"><small>Items</small><strong>{totalQty}</strong></div>
                      <div className="admin-recent-order-stat"><small>Total</small><strong>${o.netTotal.toFixed(2)}</strong></div>
                      <span className="badge badge-green admin-recent-order-status">{o.status}</span>
                    </article>
                  );
                })}
                {!ordersList.length && <p className="operations-empty-state">No recent orders.</p>}
              </div>
            </div>

            {/* Right Column: Needs Attention & Quick Actions */}
            <div className="admin-dashboard-secondary" style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Operations Queue */}
              <div className="glass-panel operations-queue-panel">
                <div className="operations-queue-header">
                  <div>
                    <h3>NEEDS ATTENTION</h3>
                    <p>Only work that currently requires an Admin action.</p>
                  </div>
                  <span className={`operations-queue-total ${totalPendingOperations ? 'has-pending' : ''}`}>{totalPendingOperations}</span>
                </div>
                <div className="operations-queue-list">
                  {activeOperationsQueue.map(item => (
                    <button
                      type="button"
                      key={item.key}
                      className={`operations-queue-item ${item.count ? 'has-pending' : ''} ${item.tone === 'pod' ? 'pod-queue-item' : ''} ${item.tone === 'critical' ? 'critical-queue-item' : ''}`}
                      onClick={() => setActiveSection(item.section)}
                    >
                      <span className="operations-queue-dot"></span>
                      <span className="operations-queue-copy"><strong>{item.label}</strong><small>{item.count ? `${item.count} ${item.detail}` : 'Nothing waiting'}</small></span>
                      <span className="operations-queue-count">{item.count}</span>
                      <span className="operations-queue-arrow">→</span>
                    </button>
                  ))}
                </div>
                {!activeOperationsQueue.length && <div className="operations-queue-clear">✓ Nothing requires attention right now.</div>}
              </div>
            </div>
          </div>

          <div className="admin-tracking-grid">
            <section className="glass-panel operations-notes-panel">
              <div className="operations-tracking-heading">
                <div>
                  <h3>FOLLOW-UP NOTES</h3>
                  <p>Leave the next step, assign a working status, and keep the whole Admin team current.</p>
                </div>
                <span>{operationsNotes.filter(note => note.status !== 'Complete').length} open</span>
              </div>
              <form className="operations-note-form" onSubmit={handleAddOperationsNote}>
                <label>
                  Workstream
                  <select className="form-input" value={operationsNoteContext} onChange={event => setOperationsNoteContext(event.target.value)}>
                    {operationsNoteOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  Status
                  <select className="form-input" value={operationsNoteStatus} onChange={event => setOperationsNoteStatus(event.target.value)}>
                    {['Pending', 'In Progress', 'Waiting', 'Complete'].map(status => <option key={status}>{status}</option>)}
                  </select>
                </label>
                <label className="operations-note-text-field">
                  Note / next step
                  <textarea className="form-input" rows="3" value={operationsNoteText} onChange={event => setOperationsNoteText(event.target.value)} placeholder="Example: Waiting on corrected cover file from publisher." />
                </label>
                <button type="submit" className="btn btn-primary">Save Follow-Up Note</button>
              </form>
              {operationsNoteMessage && <p className="operations-note-message" role="status">{operationsNoteMessage}</p>}
              <div className="operations-notes-list">
                {operationsNotes.slice(0, 12).map(note => (
                  <article className={`operations-note-card status-${String(note.status).toLowerCase().replace(/\s+/g, '-')}`} key={note.noteId}>
                    <div>
                      <strong>{note.contextLabel}</strong>
                      <p>{note.note}</p>
                      <small>{note.authorName || note.authorEmail} · {String(note.authorRole || 'admin').replace('_', ' ')} · {new Date(note.createdAt).toLocaleString()}</small>
                    </div>
                    <select aria-label={`Status for ${note.contextLabel}`} value={note.status} onChange={event => handleOperationsNoteStatus(note.noteId, event.target.value)}>
                      {['Pending', 'In Progress', 'Waiting', 'Complete'].map(status => <option key={status}>{status}</option>)}
                    </select>
                  </article>
                ))}
                {!operationsNotes.length && <p className="operations-empty-state">No follow-up notes yet. Add the first one above.</p>}
              </div>
            </section>

            <section className="glass-panel recent-activity-panel">
              <div className="operations-tracking-heading">
                <div>
                  <h3>RECENT ACTIVITY</h3>
                  <p>Who changed what, across the connected portals.</p>
                </div>
              </div>
              <div className="recent-activity-list">
                {recentActivity.slice(0, 10).map(item => (
                  <article key={item.auditId}>
                    <span className="recent-activity-dot" />
                    <div>
                      <strong>{item.action}</strong>
                      <p>{item.recordType}{item.recordId ? ` · ${item.recordId}` : ''}</p>
                      <small>{item.userName || item.user || 'System'} · {String(item.role || 'system').replace('_', ' ')} · {new Date(item.dateTime).toLocaleString()}</small>
                    </div>
                  </article>
                ))}
                {!recentActivity.length && <p className="operations-empty-state">No recorded activity yet.</p>}
              </div>
            </section>
          </div>

          {/* Upcoming Releases covers */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '15px' }}>UPCOMING RELEASES</h3>
            <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '10px' }}>
              {titlesList.slice(0, 6).map(title => (
                <div key={title.titleId} style={{ minWidth: '150px', width: '150px', background: 'rgba(0,0,0,0.15)', border: '1px solid #26292d', borderRadius: '6px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ width: '100%', height: '180px', background: '#08090b', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <span style={{ fontSize: '3rem' }}>📖</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title.title}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>MSRP: ${title.msrp}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {activeSection === 'orders' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '18px', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ color: 'var(--gold-primary)', fontSize: '1.25rem', marginBottom: '6px' }}>RETAILER SALES ORDERS</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.5, maxWidth: '720px' }}>
                  Every order submitted by a retailer appears here. Open an order to review its books, quantities, wholesale prices, payment status, and retailer details.
                </p>
              </div>
              {ordersList.length > 0 && (
                <button className="btn btn-secondary" onClick={() => handleExportPirateShipCSV(filteredOrders)} disabled={filteredOrders.length === 0}>
                  Export {filteredOrders.length === ordersList.length ? 'All' : 'Filtered'} Orders
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '14px' }}>
            <div className="glass-panel" style={{ padding: '18px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', letterSpacing: '0.05em' }}>TOTAL ORDERS</span>
              <strong style={{ display: 'block', fontSize: '1.6rem', color: '#fff', marginTop: '5px' }}>{ordersList.length}</strong>
            </div>
            <div className="glass-panel" style={{ padding: '18px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', letterSpacing: '0.05em' }}>BOOKS ORDERED</span>
              <strong style={{ display: 'block', fontSize: '1.6rem', color: '#fff', marginTop: '5px' }}>{ordersList.reduce((sum, order) => sum + (order.items || []).reduce((qty, item) => qty + Number(item.qty || 0), 0), 0)}</strong>
            </div>
            <div className="glass-panel" style={{ padding: '18px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', letterSpacing: '0.05em' }}>WHOLESALE SALES</span>
              <strong style={{ display: 'block', fontSize: '1.6rem', color: 'var(--green-primary)', marginTop: '5px' }}>${ordersList.reduce((sum, order) => sum + Number(order.netTotal || 0), 0).toFixed(2)}</strong>
            </div>
            <div className="glass-panel" style={{ padding: '18px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', letterSpacing: '0.05em' }}>AWAITING PROCESSING</span>
              <strong style={{ display: 'block', fontSize: '1.6rem', color: 'var(--amber-warning)', marginTop: '5px' }}>{ordersList.filter(order => ['pending', 'new', 'processing'].includes(String(order.status || '').toLowerCase())).length}</strong>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(170px, 240px)', gap: '12px', marginBottom: '18px' }}>
              <input
                className="form-input"
                value={orderSearchTerm}
                onChange={event => setOrderSearchTerm(event.target.value)}
                placeholder="Search order number, retailer, or book..."
                aria-label="Search sales orders"
              />
              <select className="form-input" value={orderStatusFilter} onChange={event => setOrderStatusFilter(event.target.value)} aria-label="Filter orders by status">
                <option value="All">All statuses</option>
                {orderStatuses.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>

            {ordersList.length === 0 ? (
              <div style={{ padding: '42px 20px', textAlign: 'center', border: '1px dashed var(--border-glow)', borderRadius: '8px' }}>
                <div style={{ fontSize: '2rem', marginBottom: '10px' }}>🧾</div>
                <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '6px' }}>No retailer orders have been placed yet</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Orders will appear automatically when a retailer submits and pays for an order from their portal.</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', padding: '24px 0', textAlign: 'center' }}>No orders match that search or status.</p>
            ) : (
              <div className="table-container">
                <table className="premium-table" style={{ minWidth: '900px' }}>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Date Placed</th>
                      <th>Retailer</th>
                      <th style={{ textAlign: 'center' }}>Titles</th>
                      <th style={{ textAlign: 'center' }}>Copies</th>
                      <th style={{ textAlign: 'right' }}>Wholesale Total</th>
                      <th style={{ textAlign: 'center' }}>Payment</th>
                      <th style={{ textAlign: 'center' }}>Order Status</th>
                      <th style={{ textAlign: 'right' }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map(order => {
                      const retailer = usersList.find(account => account.uid === order.retailerId);
                      const itemCount = (order.items || []).length;
                      const copyCount = (order.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
                      return (
                        <React.Fragment key={order.orderId}>
                          <tr>
                            <td><button type="button" className="table-link-button" style={{ fontFamily: 'monospace' }} onClick={() => handleOpenSalesOrder(order)}>{order.orderId}</button></td>
                            <td>{order.date ? new Date(order.date).toLocaleString() : '—'}</td>
                            <td><strong>{order.retailerName || retailer?.companyName || 'Unknown retailer'}</strong><div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: '2px' }}>{retailer?.email || ''}</div></td>
                            <td style={{ textAlign: 'center' }}>{itemCount}</td>
                            <td style={{ textAlign: 'center' }}>{copyCount}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>${Number(order.netTotal || 0).toFixed(2)}</td>
                            <td style={{ textAlign: 'center' }}><span className="badge badge-green">{order.paymentStatus || 'unknown'}</span></td>
                            <td style={{ textAlign: 'center' }}><span className="badge badge-gold">{order.status || 'pending'}</span></td>
                            <td style={{ textAlign: 'right' }}><button type="button" className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.72rem' }} onClick={() => handleOpenSalesOrder(order)}>View Order</button></td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

        {/* Approvals tab */}
        {(activeSection === 'publishers' || activeSection === 'retailers' || activeSection === 'pod-accounts') && (
          <>
          {approvalInvitation && (
            <div className="glass-panel animate-fade-in" style={{ padding: '26px', marginBottom: '24px', border: '1px solid var(--green-primary)', background: 'rgba(16,185,129,0.07)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
                <div>
                  <span className="badge badge-green" style={{ marginBottom: '8px' }}>ACCOUNT APPROVED</span>
                  <h3 style={{ color: '#fff', fontSize: '1.15rem', marginBottom: '6px' }}>{approvalInvitation.isPodClient ? 'POD Account' : approvalInvitation.role === 'retailer' ? 'Retailer' : approvalInvitation.role === 'publisher' ? 'Publisher' : 'Account'} invitation is ready</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.5 }}>Send this one-time login information to <strong style={{ color: '#fff' }}>{approvalInvitation.companyName}</strong>. They must complete all required contact and mailing information before creating their password.</p>
                </div>
                <button type="button" className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.72rem' }} onClick={() => setApprovalInvitation(null)}>Done</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px', marginTop: '18px' }}>
                <div style={{ padding: '13px', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', border: '1px solid var(--border-glow)' }}><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.68rem', marginBottom: '4px' }}>LOGIN EMAIL</span><strong style={{ color: '#fff', overflowWrap: 'anywhere' }}>{approvalInvitation.email}</strong></div>
                <div style={{ padding: '13px', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', border: '1px solid var(--border-glow)' }}><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.68rem', marginBottom: '4px' }}>ONE-TIME PASSWORD</span><strong style={{ color: 'var(--gold-primary)', fontFamily: 'monospace', letterSpacing: '0.04em' }}>{approvalInvitation.temporaryPassword}</strong></div>
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }}>
                <button type="button" className="btn btn-primary" onClick={() => { navigator.clipboard.writeText(buildApprovalInvitationMessage(approvalInvitation)); setToast('Invitation copied.'); setTimeout(() => setToast(null), 2000); }}>Copy Invitation</button>
                <a className="btn btn-secondary" href={`mailto:${approvalInvitation.email}?subject=${encodeURIComponent(`Your Philbo ${approvalInvitation.isPodClient ? 'POD Account' : approvalInvitation.role === 'retailer' ? 'Retailer' : 'Publisher'} Portal account is approved`)}&body=${encodeURIComponent(buildApprovalInvitationMessage(approvalInvitation))}`}>Open Email Draft</a>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '13px' }}>Automatic email delivery will replace this manual send step when the production email service is connected.</p>
            </div>
          )}
          <div className="glass-panel" style={{ padding: '30px' }}>
            <h3 style={{ marginBottom: '20px', color: activeSection === 'pod-accounts' ? 'var(--pod-green)' : 'var(--gold-primary)', fontSize: '1.2rem' }}>{activeSection === 'pod-accounts' ? 'PENDING POD QUOTE REQUESTS' : `PENDING ${activeSection === 'publishers' ? 'PUBLISHER' : 'RETAILER'} REGISTRATIONS`}</h3>
            {(activeSection === 'publishers' ? pendingPublishers : activeSection === 'retailers' ? pendingRetailers : pendingPodUsers).length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{activeSection === 'pod-accounts' ? 'No pending quote requests currently.' : 'No pending applications currently.'}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {(activeSection === 'publishers' ? pendingPublishers : activeSection === 'retailers' ? pendingRetailers : pendingPodUsers).map(u => {
                  const conf = getApprovalConfig(u.uid, u.role);
                  return (
                    <div key={u.uid} style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glow)', padding: '20px', borderRadius: '8px', gap: '15px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#fff' }}>{u.companyName}</span>
                            <span className={`badge ${u.role === 'retailer' ? 'badge-secondary' : !u.isPodClient && u.role === 'publisher' ? 'badge-gold' : ''}`} style={u.isPodClient ? { color: 'var(--pod-green)', border: '1px solid var(--pod-green)', background: 'var(--pod-green-glow)' } : {}}>{u.isPodClient && !u.approved ? 'POD Quote Request' : u.isPodClient ? 'POD Account' : u.role}</span>
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Email: {u.email}</div>
                          {u.role === 'retailer' && (
                            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.15)', padding: '15px', borderRadius: '6px', border: '1px solid var(--border-glow)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <div><strong>👤 Contact Name:</strong> {u.firstName} {u.lastName}</div>
                                <div><strong>📞 Phone Number:</strong> {u.phone || 'N/A'}</div>
                                <div><strong>🌐 Website:</strong> <a href={u.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-primary)', textDecoration: 'underline' }}>{u.website || 'N/A'}</a></div>
                                <div><strong>📅 Years in Business:</strong> {u.yearsInBusiness || 'N/A'} years</div>
                                <div style={{ gridColumn: 'span 2' }}><strong>📢 Sales Channels:</strong> {(u.salesChannels || []).join(', ') || 'N/A'}</div>
                              </div>
                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', marginTop: '4px' }}>
                                <strong>📍 Mailing Address:</strong> {u.shippingName} | {u.shippingAddress1}{u.shippingAddress2 ? ` ${u.shippingAddress2}` : ''}, {u.shippingCity}, {u.shippingState} {u.shippingZip}
                              </div>
                              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', marginTop: '4px' }}>
                                <div><strong>⚖️ Tax ID / EIN:</strong> <span style={{ color: 'var(--gold-primary)', fontFamily: 'monospace' }}>{u.taxId || 'N/A'}</span></div>
                                <div><strong>📄 Resale Certificate:</strong> <span style={{ color: 'var(--green-primary)' }}>{u.resaleCertificateFileName || 'N/A'}</span> (Ready for verification)</div>
                                {u.subscribeNews && <div style={{ color: 'var(--gold-primary)', fontWeight: 'bold', marginLeft: '10px' }}>✓ News Subscriber</div>}
                              </div>
                            </div>
                          )}
                          {u.role === 'publisher' && !u.isPodClient && (
                            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.15)', padding: '15px', borderRadius: '6px', border: '1px solid var(--border-glow)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr)', gap: '16px', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ width: '110px', height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: u.publisherLogoDataUrl ? '#fff' : 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glow)', borderRadius: '6px', overflow: 'hidden' }}>
                                  {u.publisherLogoDataUrl ? <img src={u.publisherLogoDataUrl} alt={`${u.companyName} logo`} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '7px' }} /> : <span style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.7rem', padding: '8px' }}>{u.publisherLogoUrl ? 'Logo stored as an external file link' : 'Logo not collected on this application'}</span>}
                                </div>
                                <div>
                                  <strong style={{ color: '#fff', fontSize: '1rem' }}>{u.companyName || 'Company name not provided'}</strong>
                                  <div style={{ marginTop: '5px' }}><strong>Logo file:</strong> {u.publisherLogoFileName || 'Not provided (legacy application)'} {u.publisherLogoSize ? `(${u.publisherLogoSize})` : ''}</div>
                                  <div><strong>Application ID:</strong> <span style={{ fontFamily: 'monospace' }}>{u.uid}</span></div>
                                  <div><strong>Submitted:</strong> {u.createdAt ? new Date(u.createdAt).toLocaleString() : 'Date not recorded on legacy application'}</div>
                                </div>
                              </div>
                              <strong style={{ color: 'var(--gold-primary)', marginTop: '6px' }}>CONTACT & COMPANY INFORMATION</strong>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '8px' }}>
                                <div><strong>👤 Primary Contact:</strong> {u.contactName || [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Not provided'}</div>
                                <div><strong>📞 Phone Number:</strong> {u.primaryPhone || u.phone || 'Not provided'}</div>
                                <div><strong>✉️ Publisher Email:</strong> <a href={`mailto:${u.publisherEmail || u.email}`} style={{ color: 'var(--gold-primary)', textDecoration: 'underline' }}>{u.publisherEmail || u.email || 'Not provided'}</a></div>
                                <div><strong>✉️ CC Contacts:</strong> {[u.ccEmail1, u.ccEmail2].filter(Boolean).join(', ') || 'None provided'}</div>
                                <div><strong>🌐 Website:</strong> {u.website ? <a href={u.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-primary)', textDecoration: 'underline' }}>{u.website}</a> : 'Not provided'}</div>
                                <div><strong>🖨️ Outside Printer:</strong> {u.outsidePrinter || 'Philbo / not provided'}</div>
                                <div style={{ gridColumn: '1 / -1' }}><strong>📍 Mailing Address:</strong> {u.mailingAddress || 'Not provided'}</div>
                                {u.publisherLogoUrl && <div style={{ gridColumn: '1 / -1' }}><strong>Publisher Logo:</strong> <a href={u.publisherLogoUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--gold-primary)', textDecoration: 'underline' }}>Open submitted logo file</a></div>}
                                <div><strong>📰 News & Updates:</strong> {u.subscribeNews ? 'Subscribed' : 'Not subscribed'}</div>
                                <div><strong>☁️ File Storage:</strong> <span style={{ color: u.storageUplink ? 'var(--green-primary)' : 'var(--text-muted)', fontWeight: 'bold' }}>{u.storageUplink || 'Not recorded'}</span></div>
                              </div>
                              
                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', marginTop: '4px' }}>
                                <strong style={{ color: 'var(--gold-primary)' }}>📦 SUBMISSION FILES:</strong>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
                                  {[['Cover Letter', u.coverLetterFileName, u.coverLetterSize], ['Sample Book PDF', u.bookPdfFileName, u.bookPdfSize], ['Schedule Outline', u.scheduleFileName, u.scheduleSize], ['Marketing Plan', u.marketingPlanFileName, u.marketingPlanSize]].map(([label, fileName, fileSize]) => (
                                    <div key={label} style={{ padding: '9px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: `1px solid ${fileName ? 'rgba(70,180,110,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
                                      <strong>📁 {label}:</strong> <span style={{ color: fileName ? '#fff' : 'var(--red-primary)' }}>{fileName || 'Not provided'}</span> {fileSize && <span>({fileSize})</span>}
                                      {fileName && <span style={{ color: 'var(--green-primary)', cursor: 'pointer', textDecoration: 'underline', marginLeft: '5px' }} onClick={() => alert(`Simulating fetch from secure Google Drive folder: ${fileName}`)}>[🔗 Open file]</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', marginTop: '4px' }}>
                                <strong>📝 Publisher Statement / Additional Information:</strong>
                                <p style={{ margin: '4px 0 0 0', color: u.companyInfoText ? 'var(--text-secondary)' : 'var(--text-muted)', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{u.companyInfoText || 'No additional information was submitted.'}</p>
                              </div>
                            </div>
                          )}
                          {u.isPodClient && (
                            <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '9px', fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--pod-green-glow)', padding: '15px', borderRadius: '6px', border: '1px solid var(--pod-green)' }}>
                              <div><strong>Contact:</strong> {u.firstName} {u.lastName}</div><div><strong>Phone:</strong> {u.phone || 'N/A'}</div>
                              <div><strong>Customer Type:</strong> {u.customerType || 'N/A'}</div><div><strong>Frequency:</strong> {u.printingFrequency || 'N/A'}</div>
                              <div><strong>Projects:</strong> {u.projectTypes || 'N/A'}</div><div><strong>Quantities:</strong> {u.expectedQuantity || 'N/A'}</div>
                              <div><strong>Page Counts:</strong> {u.pageCountRange || 'N/A'}</div><div><strong>Ship To:</strong> {u.shippingCity}, {u.shippingState} {u.shippingZip}</div>
                              <div style={{ gridColumn: '1 / -1' }}><strong>Fulfillment Needs:</strong> {u.fulfillmentNeeds || 'N/A'}</div>
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Created: Just Now</span>
                      </div>

                      {/* Approval configurations */}
                      <div style={{ background: 'rgba(0,0,0,0.25)', padding: '15px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                        {u.role === 'retailer' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            <span>📋 Standard Retailer Account (Volume Discounts: 40% - 50%)</span>
                          </div>
                        ) : u.role === 'publisher' && !u.isPodClient ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <label className="form-label" style={{ margin: 0 }}>Custom Commission Rate (%):</label>
                            <input 
                              type="number"
                              className="form-input"
                              style={{ padding: '6px 12px', fontSize: '0.85rem', width: '90px', background: 'var(--bg-deep)' }}
                              value={conf.commissionRate}
                              onChange={(e) => setApprovalConfigField(u.uid, 'commissionRate', parseInt(e.target.value) || 10)}
                            />
                          </div>
                        ) : <div style={{ color: 'var(--pod-green)', fontSize: '0.85rem', fontWeight: '600' }}>Approved POD account · Project access enabled after invitation setup</div>}

                        <button 
                          className="btn btn-primary" 
                          style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                          onClick={() => {
                            if (u.role === 'retailer') {
                              handleApproveUser(u.uid, { tier: conf.tier });
                            } else if (u.role === 'publisher' && !u.isPodClient) {
                              handleApproveUser(u.uid, { commissionRate: conf.commissionRate / 100 });
                            } else {
                              handleApproveUser(u.uid, { podProjectAccess: true });
                            }
                          }}
                        >
                          Complete Approval
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </>
        )}

        {activeSection === 'retailers' && (
          <div className="glass-panel" style={{ padding: '30px', marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <div>
                <h3 style={{ color: 'var(--gold-primary)', fontSize: '1.2rem', marginBottom: '6px' }}>APPROVED RETAILER DIRECTORY</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>Approved retailers remain here permanently. Open a profile to review the store, contact details, tax and shipping information, account status, and complete order history.</p>
              </div>
              <input
                type="search"
                className="form-input"
                placeholder="Search approved retailers..."
                value={clientSearchTerm}
                onChange={event => setClientSearchTerm(event.target.value)}
                style={{ width: 'min(320px, 100%)', padding: '9px 12px' }}
              />
            </div>
            <div className="table-container">
              <table className="premium-table" style={{ minWidth: '980px' }}>
                <thead>
                  <tr><th>Retailer</th><th>Contact</th><th>Account</th><th style={{ textAlign: 'center' }}>Discount</th><th style={{ textAlign: 'center' }}>Orders</th><th style={{ textAlign: 'center' }}>Copies</th><th style={{ textAlign: 'right' }}>Order Value</th><th style={{ textAlign: 'right' }}>Credit</th><th style={{ textAlign: 'right' }}>Profile</th></tr>
                </thead>
                <tbody>
                  {approvedRetailers
                    .filter(retailer => [retailer.companyName, retailer.email, retailer.firstName, retailer.lastName].some(value => String(value || '').toLowerCase().includes(clientSearchTerm.toLowerCase())))
                    .map(retailer => {
                      const retailerOrders = ordersList.filter(order => order.retailerId === retailer.uid);
                      const copiesOrdered = retailerOrders.reduce((sum, order) => sum + (order.items || []).reduce((lineSum, item) => lineSum + Number(item.qty || 0), 0), 0);
                      const orderValue = retailerOrders.reduce((sum, order) => sum + Number(order.netTotal || 0), 0);
                      const invitationLabel = accountStatusLabel(retailer);
                      return (
                        <tr key={retailer.uid}>
                          <td><button type="button" className="table-link-button" onClick={() => setSelectedRetailerProfile(retailer)}>{retailer.companyName}</button><div className="pull-code-secondary">Approved {retailer.approvedAt ? new Date(retailer.approvedAt).toLocaleDateString() : 'account'}</div></td>
                          <td><strong>{[retailer.firstName, retailer.lastName].filter(Boolean).join(' ') || retailer.shippingName || 'Contact not recorded'}</strong><div className="pull-code-secondary">{retailer.email}</div></td>
                          <td><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '7px' }}><span className={`badge ${accountStatusBadge(retailer)}`}>{invitationLabel}</span>{retailer.isInvitationPending && retailer.accountStatus !== 'suspended' && retailer.accountStatus !== 'revoked' && <button type="button" className="btn btn-secondary" style={{ padding: '5px 8px', fontSize: '0.68rem', whiteSpace: 'nowrap' }} onClick={() => handleCreateAccountInvitation(retailer.uid)}>Create Password Email</button>}</div></td>
                          <td style={{ textAlign: 'center' }}><span className={`badge ${retailer.tier === 'Tier III' ? 'badge-gold' : retailer.tier === 'Tier II' ? 'badge-silver' : 'badge-secondary'}`}>{retailer.tier === 'Tier III' ? '50%' : retailer.tier === 'Tier II' ? '45%' : '40%'}</span></td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>{retailerOrders.length}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>{copiesOrdered}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>${orderValue.toFixed(2)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--green-primary)', fontWeight: 700 }}>${Number(retailer.returnCreditBalance || 0).toFixed(2)}</td>
                          <td><div className="table-action-group"><button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => setSelectedRetailerProfile(retailer)}>View Retailer</button></div></td>
                        </tr>
                      );
                    })}
                  {!approvedRetailers.some(retailer => [retailer.companyName, retailer.email, retailer.firstName, retailer.lastName].some(value => String(value || '').toLowerCase().includes(clientSearchTerm.toLowerCase()))) && (
                    <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No approved retailers match this search.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSection === 'publishers' && (
          <div className="glass-panel" style={{ padding: '30px', marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <div>
                <h3 style={{ color: 'var(--gold-primary)', fontSize: '1.2rem', marginBottom: '6px' }}>PUBLISHER DIRECTORY</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>Every publisher represented in the system stays visible here, including publishers imported from catalog CSVs who have not activated a portal account. Open any publisher to see all active and inactive title records.</p>
              </div>
              <input
                type="search"
                className="form-input"
                placeholder="Search all publishers..."
                value={clientSearchTerm}
                onChange={event => setClientSearchTerm(event.target.value)}
                style={{ width: 'min(320px, 100%)', padding: '9px 12px' }}
              />
            </div>
            <div className="table-container">
              <table className="premium-table">
                <thead>
                  <tr><th>Publisher</th><th>Contact</th><th>Account</th><th style={{ textAlign: 'center' }}>All Titles</th><th style={{ textAlign: 'center' }}>Live</th><th style={{ textAlign: 'center' }}>In Progress</th><th style={{ textAlign: 'center' }}>Past / Archived</th><th style={{ textAlign: 'right' }}>Profile</th></tr>
                </thead>
                <tbody>
                  {publisherDirectory
                    .filter(publisher => [publisher.companyName, publisher.email, publisher.publisherEmail].some(value => String(value || '').toLowerCase().includes(clientSearchTerm.toLowerCase())))
                    .map(publisher => {
                      const publisherTitles = getPublisherTitles(publisher);
                      const liveCount = publisherTitles.filter(title => isTitlePublished(title.status)).length;
                      const archivedCount = publisherTitles.filter(title => title.status === 'Archived').length;
                      const inProgressCount = publisherTitles.length - liveCount - archivedCount;
                      return (
                        <tr key={publisher.uid}>
                          <td><button type="button" className="table-link-button" onClick={() => setSelectedRetailerProfile(publisher)}>{publisher.companyName}</button></td>
                          <td><strong>{publisher.contactName || [publisher.firstName, publisher.lastName].filter(Boolean).join(' ') || 'Contact not recorded'}</strong><div className="pull-code-secondary">{publisher.publisherEmail || publisher.email}</div></td>
                          <td><span className={`badge ${accountStatusBadge(publisher)}`}>{accountStatusLabel(publisher)}</span></td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>{publisherTitles.length}</td>
                          <td style={{ textAlign: 'center', color: 'var(--green-primary)', fontWeight: 700 }}>{liveCount}</td>
                          <td style={{ textAlign: 'center', color: 'var(--gold-primary)', fontWeight: 700 }}>{inProgressCount}</td>
                          <td style={{ textAlign: 'center' }}>{archivedCount}</td>
                          <td><div className="table-action-group"><button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => setSelectedRetailerProfile(publisher)}>View Publisher</button></div></td>
                        </tr>
                      );
                    })}
                  {!publisherDirectory.some(publisher => [publisher.companyName, publisher.email, publisher.publisherEmail].some(value => String(value || '').toLowerCase().includes(clientSearchTerm.toLowerCase()))) && (
                    <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No publishers match this search.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSection === 'pod-accounts' && usersList.some(u => u.approved && u.isPodClient) && (
          <div className="glass-panel" style={{ padding: '30px', marginTop: '24px' }}>
            <h3 style={{ marginBottom: '18px', color: 'var(--pod-green)', fontSize: '1.1rem' }}>APPROVED POD ACCOUNTS</h3>
            <div className="table-container"><table className="premium-table"><thead><tr><th>Company</th><th>Contact</th><th>Customer Type</th><th>Expected Quantities</th><th>Tax Status</th><th>Status</th><th style={{ textAlign: 'right' }}>Account Actions</th></tr></thead><tbody>
              {usersList.filter(u => u.approved && u.isPodClient).map(u => { const pod = u; return <tr key={u.uid}><td><button type="button" className="table-link-button" onClick={() => setSelectedRetailerProfile(u)}>{u.companyName}</button></td><td>{u.email}</td><td>{pod.customerType || 'N/A'}</td><td>{pod.expectedQuantity || 'N/A'}</td><td><span className={`badge pod-tax-status pod-tax-${String(u.resaleCertificateStatus || 'not-submitted').toLowerCase().replace(/\s+/g, '-')}`}>{u.taxExempt ? 'Tax Exempt' : u.resaleCertificateStatus || 'Not Submitted'}</span></td><td><span className={`badge ${accountStatusBadge(u)}`}>{accountStatusLabel(u)}</span></td><td><div className="table-action-group">{u.isInvitationPending && u.accountStatus !== 'suspended' && u.accountStatus !== 'revoked' && <button type="button" className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.7rem' }} onClick={() => handleCreateAccountInvitation(u.uid)}>Create Password Email</button>}<button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => setSelectedRetailerProfile(u)}>View POD Account</button></div></td></tr>; })}
            </tbody></table></div>
          </div>
        )}

        {activeSection === 'pod-accounts' && (
          <div className="glass-panel" style={{ padding: '30px', marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '14px', flexWrap: 'wrap', marginBottom: '18px' }}>
              <div><h3 style={{ color: 'var(--pod-green)', fontSize: '1.1rem' }}>POD ORDERS & QUOTE REQUESTS</h3><p style={{ color: 'var(--text-secondary)', fontSize: '.78rem', marginTop: '5px' }}>Comic Books use the 2026 public price sheet. Art Prints remain Coming Soon while their ordering workflow is finalized.</p></div>
              <span className="badge" style={{ color: 'var(--pod-green)', border: '1px solid var(--pod-green)', background: 'var(--pod-green-glow)' }}>{pendingPodOrders.length} waiting</span>
            </div>
            {!podOrdersList.length ? <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>No POD orders have been submitted yet.</p> : (
              <div className="table-container"><table className="premium-table" style={{ minWidth: '900px' }}><thead><tr><th>POD Order</th><th>Submitted</th><th>Customer</th><th>Project</th><th>Product</th><th style={{ textAlign: 'center' }}>Qty</th><th style={{ textAlign: 'right' }}>Printing</th><th>Status</th></tr></thead><tbody>
                {podOrdersList.map(order => <tr key={order.podOrderId}><td><code>{order.podOrderId}</code>{order.sourcePurchaseOrder && <div className="pull-code-secondary">From {order.sourcePurchaseOrder}</div>}</td><td>{new Date(order.submittedAt).toLocaleString()}</td><td><strong>{order.customerName}</strong><div className="pull-code-secondary">{order.customerEmail}</div></td><td>{order.projectTitle}</td><td>{order.productName}</td><td style={{ textAlign: 'center', fontWeight: 700 }}>{order.quantity}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{order.subtotal != null ? `$${order.subtotal.toFixed(2)}` : 'Quote required'}</td><td><span className="badge badge-gold">{order.status}</span></td></tr>)}
              </tbody></table></div>
            )}
          </div>
        )}

        {/* Titles / Catalog tab */}
        {activeSection === 'catalog' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* CSV Importer Panel */}
            <div className="glass-panel" style={{ padding: '30px' }}>
              <h3 style={{ marginBottom: '10px', color: 'var(--gold-primary)', fontSize: '1.2rem' }}>📥 CSV CATALOG BULK IMPORTER & INVITE MANAGER</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
                Upload the target catalog CSV to detect metadata columns, assign publisher accounts, flag warning duplicates, and generate publisher invitations.
              </p>

              {/* Step 1: Upload CSV file */}
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
                <input 
                  type="file" 
                  accept=".csv" 
                  style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-glow)', fontSize: '0.85rem', color: '#fff' }}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                      const text = evt.target.result;
                      const lines = text.split(/\r\n|\n/);
                      if (lines.length === 0) return;
                      
                      const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim());
                      
                      const parsed = [];
                      for (let i = 1; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (!line) continue;
                        
                        const row = [];
                        let inQuotes = false;
                        let start = 0;
                        for (let j = 0; j < line.length; j++) {
                          if (line[j] === '"') {
                            inQuotes = !inQuotes;
                          } else if (line[j] === ',' && !inQuotes) {
                            row.push(line.substring(start, j).replace(/^["']|["']$/g, '').trim());
                            start = j + 1;
                          }
                        }
                        row.push(line.substring(start).replace(/^["']|["']$/g, '').trim());
                        
                        const obj = {};
                        headers.forEach((h, idx) => {
                          obj[h] = row[idx] || '';
                        });
                        parsed.push(obj);
                      }
                      
                      setCsvRows(parsed);
                      setImportReport(null);
                      setImportError('');
                    };
                    reader.readAsText(file);
                  }}
                />

                {csvRows.length > 0 && (
                  <button 
                    className="btn btn-primary"
                    style={{ padding: '10px 20px', fontSize: '0.85rem' }}
                    onClick={() => {
                      const result = db.importCsvTitles(csvRows, user.email);
                      setTitlesList(db.getTitles());
                      setUsersList(db.getUsers());
                      setImportReport(result);
                      setCsvRows([]);
                    }}
                  >
                    🚀 Run Import & Generate Invitations ({csvRows.length} Rows)
                  </button>
                )}

                {csvRows.length > 0 && (
                  <button 
                    className="btn btn-secondary"
                    onClick={() => setCsvRows([])}
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Import summary status report */}
              {importReport && (
                <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid var(--green-primary)', padding: '25px', borderRadius: '8px', fontSize: '0.88rem', marginBottom: '20px' }}>
                  <strong style={{ color: 'var(--green-primary)', display: 'block', marginBottom: '12px', fontSize: '1rem' }}>✓ CSV IMPORT COMPLETED SUCCESSFULLY</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                    <div>Successfully imported: <strong>{importReport.importedCount} titles</strong></div>
                    <div>Updated existing titles: <strong>{importReport.updatedCount} titles</strong></div>
                    <div>New Publisher accounts: <strong>{importReport.createdPublishers.length} created</strong></div>
                  </div>
                  
                  {importReport.createdPublishers.length > 0 && (
                    <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px' }}>
                      <strong style={{ color: 'var(--gold-primary)', display: 'block', marginBottom: '8px' }}>🔑 PENDING PUBLISHER CREDENTIAL INVITATIONS:</strong>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '10px' }}>
                        Provide these credentials to new publishers so they can securely access their catalog and complete password setup on first login.
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                        {importReport.createdPublishers.map((pub, idx) => (
                          <div key={idx} style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glow)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                            <div>
                              <strong>{pub.companyName}</strong>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Login Email: {pub.email}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.75rem', background: '#332b1a', border: '1px solid var(--gold-primary)', color: 'var(--gold-primary)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                                Temp Password: {pub.tempPassword}
                              </span>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                                onClick={() => {
                                  navigator.clipboard.writeText(`Welcome to Philbo Portal! Log in at the portal using your email "${pub.email}" and temp password "${pub.tempPassword}" to setup your account.`);
                                  alert('Invitation credentials copied to clipboard!');
                                }}
                              >
                                Copy Invite
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {importReport.errorsList.length > 0 && (
                    <div style={{ marginTop: '15px' }}>
                      <strong style={{ color: 'var(--red-primary)', display: 'block', marginBottom: '6px' }}>Warnings / Failures ({importReport.errorsList.length}):</strong>
                      <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {importReport.errorsList.map((err, idx) => (
                          <div key={idx} style={{ padding: '6px', background: 'rgba(239,68,68,0.05)', borderRadius: '4px', border: '1px solid rgba(239,68,68,0.2)' }}>
                            <span style={{ color: '#ffb3b3' }}>{err}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Pre-import layout review columns and matching indicators */}
              {csvRows.length > 0 && (
                <div style={{ marginTop: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--gold-primary)' }}>PRE-IMPORT DETECTED COLUMNS & VERIFICATION:</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Detected {Object.keys(csvRows[0]).length} columns in CSV</span>
                  </div>

                  {/* Columns detected banner */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '15px', background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '6px', border: '1px solid #292c31', maxHeight: '80px', overflowY: 'auto' }}>
                    {Object.keys(csvRows[0]).map((h, idx) => (
                      <span key={idx} style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', borderRadius: '4px' }}>
                        {h}
                      </span>
                    ))}
                  </div>

                  <div className="table-container" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                    <table className="premium-table">
                      <thead>
                        <tr>
                          <th>Row #</th>
                          <th>Title</th>
                          <th>Publisher</th>
                          <th>Barcode</th>
                          <th>PHILBO ID Check</th>
                          <th>Account Match Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(0, 15).map((row, idx) => {
                          const pubName = (getRowValue(row, 'Publisher') || '').trim();
                          const barcodeVal = (getRowValue(row, 'Barcode / UPC / EAN') || '').trim();
                          const seriesVal = (getRowValue(row, 'Series Code') || '').trim() || 'GEN';
                          const titleVal = (getRowValue(row, 'Title') || '').trim();
                          
                          const matchedPub = usersList.find(u => u.role === 'publisher' && u.companyName.toLowerCase() === pubName.toLowerCase());
                          const idCheck = db.generatePhilboId(seriesVal, barcodeVal);
                          const isDuplicate = titlesList.some(t => t.barcode === barcodeVal || t.philboId === idCheck);

                          return (
                            <tr key={idx}>
                              <td>{idx + 1}</td>
                              <td>{titleVal}</td>
                              <td>{pubName}</td>
                              <td style={{ fontFamily: 'monospace' }}>{barcodeVal}</td>
                              <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{idCheck || 'N/A'}</td>
                              <td>
                                {matchedPub ? (
                                  <span style={{ color: 'var(--green-primary)' }}>✓ Existing Account</span>
                                ) : (
                                  <span style={{ color: 'var(--gold-primary)', fontWeight: '500' }}>➕ Auto-Invite Pending</span>
                                )}
                                {isDuplicate && (
                                  <span style={{ color: 'var(--red-primary)', marginLeft: '10px', fontSize: '0.72rem' }}>⚠️ Duplicate update</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {csvRows.length > 15 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>Showing first 15 preview rows...</span>
                  )}
                </div>
              )}
            </div>
            
            {/* Pending Approvals */}
            <div className="glass-panel" style={{ padding: '30px' }}>
              <h3 style={{ marginBottom: '8px', color: 'var(--gold-primary)', fontSize: '1.2rem' }}>NEW SOLICITATIONS REQUIRING REVIEW <span className="badge badge-gold">{pendingTitles.length}</span></h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '20px' }}>Approval publishes this same authoritative record to the website, retailer catalog, catalog export, and CSV. Print-ready production files remain a later Preflight step.</p>
              {pendingTitles.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>No pending comic submissions.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {pendingTitles.map(t => (
                    <div key={t.titleId} style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glow)', padding: '20px', borderRadius: '8px', gap: '20px', flexWrap: 'wrap' }}>
                      <img src={t.coverUrl} alt={t.title} style={{ width: '80px', height: '120px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-glow)' }} />
                      <div style={{ flex: 1, minWidth: '280px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                          <div>
                            <h4 style={{ color: '#fff', fontSize: '1.1rem' }}>{t.title}</h4>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0' }}>
                              Publisher: <strong style={{ color: 'var(--gold-primary)' }}>{t.publisherName}</strong> | MSRP: ${t.msrp.toFixed(2)}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.8rem' }} onClick={() => openTitleReview(t)}>
                              🔍 Preview Catalog Page
                            </button>
                            <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.8rem' }} onClick={() => openTitleReview(t)}>
                              🔍 Review Listing
                            </button>
                          </div>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '10px 0', lineHeight: '1.4' }}>{t.description}</p>
                        
                        {/* Production file availability is informational during catalog review. */}
                        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px 18px', borderRadius: '6px', border: '1px solid var(--border-glow)', display: 'flex', gap: '20px', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                          <div><strong style={{ color: 'var(--text-secondary)' }}>Catalog Cycle:</strong> {cyclesList.find(cycle => cycle.cycleId === t.cycleId)?.cycleName || 'Unassigned'}</div>
                          <div><strong style={{ color: 'var(--text-secondary)' }}>FOC:</strong> {t.focDate || 'Missing'}</div>
                          <div><strong style={{ color: 'var(--text-secondary)' }}>In-Store:</strong> {t.releaseDate || 'Missing'}</div>
                          <div>📄 <strong style={{ color: 'var(--text-secondary)' }}>Interior print PDF:</strong> {t.interiorPdfName && t.interiorPdfName !== 'N/A' ? t.interiorPdfName : 'Not submitted yet (optional)'}</div>
                          <div>🖼️ <strong style={{ color: 'var(--text-secondary)' }}>Catalog cover image:</strong> {t.coverArtFileName || t.coverArtPdfName || 'Missing'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Master Comics Database */}
            <div className="glass-panel master-comics-panel" style={{ padding: '30px', marginBottom: '30px' }}>
              <div className="master-comics-heading">
                <div>
                  <h3>MASTER COMIC BOOKS DATABASE</h3>
                  <p>Select Draft, Pending Review, or Needs Revision titles for a controlled batch approval.</p>
                </div>
                <div className="master-comics-bulk-actions">
                  <span>{selectedBulkTitles.length} selected</span>
                  <button type="button" className="btn btn-secondary" disabled={!selectedBulkTitles.length} onClick={() => setSelectedTitleIds([])}>CLEAR</button>
                  <button type="button" className="btn btn-primary" disabled={!selectedBulkTitles.length} onClick={handleBulkApproveTitles}>APPROVE SELECTED</button>
                </div>
              </div>
              <div className="table-container">
                <table className="premium-table master-comics-table">
                  <thead>
                    <tr>
                      <th>
                        <label className="master-title-select master-title-select-all">
                          <input
                            type="checkbox"
                            checked={allBulkApprovableSelected}
                            disabled={!bulkApprovableTitles.length}
                            onChange={toggleAllBulkTitles}
                            aria-label="Select all titles eligible for approval"
                          />
                          <span>Comic Title</span>
                        </label>
                      </th>
                      <th>Publisher</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                      <th style={{ textAlign: 'center' }}>FOC Date</th>
                      <th style={{ textAlign: 'center' }}>Release Date</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {titlesList.map(t => (
                      <tr key={t.titleId}>
                        <td data-label="Comic Title" style={{ fontWeight: '600' }}>
                          <label className="master-title-select">
                            <input
                              type="checkbox"
                              checked={selectedTitleIds.includes(t.titleId)}
                              disabled={!isBulkApprovableTitle(t)}
                              onChange={() => toggleBulkTitleSelection(t.titleId)}
                              aria-label={`Select ${t.title} for approval`}
                            />
                            <span>{t.title}</span>
                          </label>
                        </td>
                        <td data-label="Publisher" style={{ color: 'var(--text-secondary)' }}>{t.publisherName}</td>
                        <td data-label="Status" style={{ textAlign: 'center' }}>
                          <span className={`badge ${
                            isTitlePublished(t.status) ? 'badge-green' :
                            t.status === 'Approved' ? 'badge-gold' :
                            isTitlePendingReview(t.status) ? 'badge-secondary' :
                            t.status === 'Changes Requested' ? 'badge-red' : 'badge-muted'
                          }`} style={{ fontSize: '0.65rem', padding: '2px 8px' }}>
                            {getTitleStatusLabel(t.status)}
                          </span>
                        </td>
                        <td data-label="FOC Date" style={{ textAlign: 'center' }}>{t.focDate}</td>
                        <td data-label="Release Date" style={{ textAlign: 'center' }}>{t.releaseDate}</td>
                        <td data-label="Actions" style={{ textAlign: 'right' }}>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 10px', fontSize: '0.7rem' }} 
                            onClick={() => openTitleReview(t)}
                          >
                            🔍 Review Listing
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* FOC Locking Control */}
            <div className="glass-panel" style={{ padding: '30px' }}>
              <h3 style={{ marginBottom: '8px', fontSize: '1.2rem' }}>FINAL ORDER CUTOFF (FOC) LOCKS</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5, marginBottom: '20px' }}>
                Approved listings are already published from the authoritative product record. Use these controls only to manage the FOC ordering window or review the listing.
              </p>
              <div className="table-container">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Comic Title</th>
                      <th>Publisher</th>
                      <th style={{ textAlign: 'center' }}>Catalog Status</th>
                      <th style={{ textAlign: 'center' }}>FOC Date</th>
                      <th style={{ textAlign: 'center' }}>FOC Lock Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {titlesList.filter(t => isTitlePublished(t.status)).map(t => (
                      <tr key={t.titleId}>
                        <td>
                          <button type="button" className="table-link-button" onClick={() => handleOpenInventoryTitle(t)}>{t.title}</button>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{t.publisherName}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge badge-green">
                            {getTitleStatusLabel(t.status)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>{t.focDate}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`badge ${t.focLocked ? 'badge-red' : 'badge-green'}`}>
                            {t.focLocked ? '🔒 Locked' : '🔓 Open'}
                          </span>
                        </td>
                        <td>
                          <div className="table-action-group">
                            <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => handleOpenInventoryTitle(t)}>
                              View Listing
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', borderColor: t.focLocked ? 'var(--green-primary)' : 'var(--red-primary)', color: t.focLocked ? 'var(--green-primary)' : 'var(--red-primary)' }}
                              onClick={() => handleToggleFoc(t.titleId)}
                            >
                              {t.focLocked ? 'Unlock FOC' : 'Lock FOC'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* 2B. CATALOG CYCLES CONTROL TAB */}
        {activeSection === 'cycles' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* Summary counters */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
              <div className="glass-panel" style={{ padding: '20px' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Active Cycles</span>
                <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--gold-primary)', display: 'block', marginTop: '6px' }}>
                  {cyclesList.filter(c => c.status !== 'Archived' && c.status !== 'Released').length}
                </span>
              </div>
              <div className="glass-panel" style={{ padding: '20px' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Open for Ordering</span>
                <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--green-primary)', display: 'block', marginTop: '6px' }}>
                  {cyclesList.filter(c => c.retailerOpen).length}
                </span>
              </div>
              <div className="glass-panel" style={{ padding: '20px' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Unresolved Historic Books</span>
                <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: unmatchedTitles.length > 0 ? 'var(--red-primary)' : 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                  {unmatchedTitles.length}
                </span>
              </div>
            </div>

            {/* Mismatch Historic Titles manually resolution preview */}
            {unmatchedTitles.length > 0 && (
              <div className="glass-panel" style={{ padding: '25px', borderColor: 'var(--red-primary)', background: 'rgba(168,75,75,0.02)' }}>
                <h3 style={{ color: 'var(--red-primary)', marginBottom: '10px', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ⚠️ UNRESOLVED HISTORIC BOOK RECORDS ({unmatchedTitles.length})
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '15px' }}>
                  These books from the initial catalog import do not match any standard Catalog Cycle. Please manually re-allocate them to their correct FOC Cycle.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                  {unmatchedTitles.map(t => (
                    <div key={t.titleId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', background: 'rgba(0,0,0,0.15)', border: '1px solid #292c31', borderRadius: '6px', fontSize: '0.8rem', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <strong>{t.title}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          MSRP: ${t.msrp.toFixed(2)} | FOC: {t.focDate} | Release: {t.releaseDate}
                        </div>
                      </div>
                      <div>
                        <select 
                          className="form-select"
                          style={{ padding: '4px 6px', fontSize: '0.75rem', width: '220px' }}
                          onChange={(e) => handleAssignTitleCycle(t.titleId, e.target.value)}
                          defaultValue=""
                        >
                          <option value="" disabled>-- Assign Cycle --</option>
                          {cyclesList.map(c => (
                            <option key={c.cycleId} value={c.cycleId}>{c.cycleName.slice(0, 45)}...</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Filter and Cycles grid list */}
            <div className="glass-panel" style={{ padding: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>DISTRIBUTION CATALOG CYCLES</h3>
                
                <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" onClick={() => setShowHistoricalCycles(current => !current)}>
                    {showHistoricalCycles ? 'Hide Historical Cycles' : 'Show Historical Cycles'}
                  </button>
                  <button className="btn btn-primary" onClick={handleAllCatalogCsvDownload}>Export All Cycles</button>
                  <select className="form-select" style={{ padding: '6px 10px', fontSize: '0.8rem' }} value={cycleStatusFilter} onChange={(e) => setCycleStatusFilter(e.target.value)}>
                    <option value="All">All Statuses</option>
                    <option value="Upcoming">Upcoming</option>
                    <option value="Open for Publisher Submission">Publisher Open</option>
                    <option value="Open for Retailer Ordering">Retailer Open</option>
                    <option value="FOC Locked">FOC Locked</option>
                    <option value="Released">Released</option>
                    <option value="Archived">Archived</option>
                  </select>
                  <select className="form-select" style={{ padding: '6px 10px', fontSize: '0.8rem' }} value={cycleYearFilter} onChange={(e) => setCycleYearFilter(e.target.value)}>
                    <option value="All">All Years</option>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                    <option value="2027">2027</option>
                  </select>
                </div>
              </div>

              <div className="table-container">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Cycle Name / Linked Dates</th>
                      <th>Linked Titles</th>
                      <th>Linked Orders</th>
                      <th style={{ textAlign: 'center' }}>Submissions</th>
                      <th style={{ textAlign: 'center' }}>Ordering</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cyclesList
                      .filter(c => showHistoricalCycles || c.catalogDate >= '2026-07-01')
                      .filter(c => cycleStatusFilter === 'All' || c.status === cycleStatusFilter)
                      .filter(c => cycleYearFilter === 'All' || c.focDate.startsWith(cycleYearFilter))
                      .map(c => {
                        const linkedCycleTitles = titlesList.filter(t => t.cycleId === c.cycleId);
                        const linkedTitlesCount = linkedCycleTitles.length;
                        const liveTitlesCount = linkedCycleTitles.filter(t => isTitlePublished(t.status)).length;
                        const lastExport = exportHistory.find(item => item.cycleId === c.cycleId);
                        let linkedOrdersCount = 0;
                        ordersList.forEach(o => {
                          const hasItemInCycle = o.items.some(i => {
                            const titleItem = titlesList.find(t => t.titleId === i.titleId);
                            return titleItem && titleItem.cycleId === c.cycleId;
                          });
                          if (hasItemInCycle) linkedOrdersCount += 1;
                        });

                        const isExpanded = expandedCycleId === c.cycleId;
                        return (
                          <React.Fragment key={c.cycleId}>
                          <tr>
                            <td>
                              <strong style={{ color: '#fff', fontSize: '0.85rem' }}>{c.cycleName}</strong>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                Cat: {c.catalogDate} | FOC: {c.focDate} | Release: {c.releaseDate}
                              </div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                Last generated: {lastExport ? new Date(lastExport.generatedAt).toLocaleString() : 'Never'}
                              </div>
                            </td>
                            <td>
                              <button
                                type="button"
                                className={`catalog-cycle-books-button ${isExpanded ? 'is-expanded' : ''}`}
                                onClick={() => handleToggleCycleBooks(c.cycleId)}
                                aria-expanded={isExpanded}
                              >
                                <strong>{linkedTitlesCount} books</strong>
                                <span>{liveTitlesCount} Approved/exportable</span>
                                <small>{isExpanded ? 'Hide books ↑' : 'View books ↓'}</small>
                              </button>
                            </td>
                            <td><strong>{linkedOrdersCount} orders</strong></td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{ color: c.publisherOpen ? 'var(--green-primary)' : 'var(--text-muted)' }}>
                                {c.publisherOpen ? '● Open' : '○ Closed'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{ color: c.retailerOpen ? 'var(--green-primary)' : 'var(--text-muted)' }}>
                                {c.retailerOpen ? '● Open' : '○ Closed'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className={`badge ${
                                c.status === 'Released' ? 'badge-green' :
                                c.status === 'FOC Locked' ? 'badge-red' :
                                c.status.startsWith('Open') ? 'badge-gold' : 'badge-muted'
                              }`} style={{ fontSize: '0.65rem' }}>
                                {c.status}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div className="catalog-cycle-actions">
                                <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => handleToggleSubmissions(c.cycleId, c.publisherOpen)}>
                                  Submissions
                                </button>
                                <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => handleToggleOrdering(c.cycleId, c.retailerOpen)}>
                                  {c.retailerOpen ? 'Close Ordering' : 'Ordering'}
                                </button>
                                <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => handlePublishCatalog(c.cycleId)}>
                                  {c.catalogPublishedAt ? 'Republish Catalog' : 'Publish Catalog'}
                                </button>
                                <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', borderColor: c.status === 'FOC Locked' ? 'var(--green-primary)' : 'var(--red-primary)' }} onClick={() => handleToggleLock(c.cycleId, c.status)}>
                                  {c.status === 'FOC Locked' ? 'Unlock' : 'Lock early'}
                                </button>
                                <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => handleCatalogCsvPreview(c.cycleId)}>
                                  CSV Preview
                                </button>
                                <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => setCatalogPrintCycleId(c.cycleId)} disabled={!liveTitlesCount}>
                                  Linked PDF Preview
                                </button>
                                <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => setCatalogTemplateCycleId(c.cycleId)} disabled={!liveTitlesCount}>
                                  Solicit Template
                                </button>
                                <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => setCatalogBuilderCycleId(c.cycleId)} disabled={!liveTitlesCount}>
                                  Make Catalog
                                </button>
                                <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => handleCatalogCsvDownload(c.cycleId, true)}>
                                  Admin All Tiers
                                </button>
                                <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', color: c.retailerDownloadEnabled === false ? 'var(--red-primary)' : 'var(--green-primary)' }} onClick={() => handleToggleRetailerDownload(c.cycleId, c.retailerDownloadEnabled !== false)}>
                                  {c.retailerDownloadEnabled === false ? 'Enable CSV' : 'Disable CSV'}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="catalog-cycle-expanded-row">
                              <td colSpan="7">
                                <section
                                  id={`catalog-cycle-books-${c.cycleId}`}
                                  className="catalog-cycle-title-drawer"
                                  tabIndex="-1"
                                  aria-label={`Books in ${c.cycleName}`}
                                >
                                  <div className="catalog-cycle-title-drawer-heading">
                                    <div>
                                      <span>BOOKS ASSIGNED TO THIS CATALOG</span>
                                      <h4>{c.cycleName}</h4>
                                    </div>
                                    <div className="catalog-cycle-title-drawer-summary">
                                      <strong>{linkedTitlesCount} total</strong>
                                      <button type="button" className="btn btn-secondary" onClick={() => setExpandedCycleId(null)}>Close Catalog View</button>
                                    </div>
                                  </div>
                                  {linkedCycleTitles.length ? (
                                    <div className="catalog-cycle-title-list">
                                      {linkedCycleTitles.map(title => (
                                        <article key={title.titleId}>
                                          <div className="catalog-cycle-title-name"><strong>{title.title}</strong><small>{title.publisherName || 'Publisher not recorded'}</small></div>
                                          <div><small>Status</small><span className={`badge ${isTitlePublished(title.status) ? 'badge-green' : 'badge-muted'}`}>{getTitleStatusLabel(title.status)}</span></div>
                                          <div><small>PHILBO ID</small><strong>{title.philboId || 'Not assigned'}</strong></div>
                                          <div><small>FOC</small><strong>{title.focDate || c.focDate}</strong></div>
                                          <div><small>In-store</small><strong>{title.releaseDate || c.releaseDate}</strong></div>
                                          <button type="button" className="btn btn-secondary" onClick={() => setCatalogDisplayTitle(title)}>View Catalog Page</button>
                                        </article>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="operations-empty-state">No books are currently assigned to this catalog cycle.</p>
                                  )}
                                </section>
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '25px' }}>
              <h3 style={{ color: 'var(--gold-primary)', fontSize: '1rem', marginBottom: '15px' }}>CATALOG EXPORT HISTORY</h3>
              {exportHistory.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No catalog exports generated yet.</p>
              ) : (
                <div className="table-container">
                  <table className="premium-table">
                    <thead><tr><th>Generated</th><th>Cycle</th><th>File</th><th>Titles</th><th>Pricing</th><th>Generated By</th></tr></thead>
                    <tbody>
                      {exportHistory.slice(0, 50).map((item, index) => (
                        <tr key={`${item.generatedAt}-${index}`}>
                          <td>{new Date(item.generatedAt).toLocaleString()}</td>
                          <td>{item.cycleId}</td>
                          <td>{item.filename}</td>
                          <td>{item.titleCount}</td>
                          <td>{item.allTierPrices ? 'All tiers (Admin)' : item.tier}</td>
                          <td>{item.generatedBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Create Future Catalog Cycles form panel */}
            <div className="glass-panel" style={{ padding: '30px', maxWidth: '600px' }}>
              <h3 style={{ marginBottom: '15px', color: 'var(--gold-primary)', fontSize: '1.1rem' }}>➕ CREATE FUTURE CATALOG CYCLE</h3>
              <form onSubmit={handleCreateCycle} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div className="form-group">
                  <label className="form-label">Cycle Tag Name *</label>
                  <input type="text" className="form-input" placeholder="e.g. December 1, 2026 FOC" value={newCycleName} onChange={(e) => setNewCycleName(e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                  <div className="form-group">
                    <label className="form-label">Catalog Date *</label>
                    <input type="date" className="form-input" value={newCycleCatalogDate} onChange={(e) => setNewCycleCatalogDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">FOC Date *</label>
                    <input type="date" className="form-input" value={newCycleFocDate} onChange={(e) => setNewCycleFocDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Release Date *</label>
                    <input type="date" className="form-input" value={newCycleReleaseDate} onChange={(e) => setNewCycleReleaseDate(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Internal notes</label>
                  <input type="text" className="form-input" placeholder="Notes..." value={newCycleNotes} onChange={(e) => setNewCycleNotes(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                  Save & Initialize Cycle
                </button>
              </form>
            </div>

          </div>
        )}

        {catalogPreview && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div className="glass-panel" style={{ width: 'min(1000px, 96vw)', maxHeight: '90vh', overflow: 'auto', padding: '25px' }}>
              <div className="catalog-preview-header" style={{ marginBottom: '15px' }}>
                <div><h3 style={{ color: 'var(--gold-primary)', fontSize: '1rem' }}>CSV PREVIEW</h3><p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{catalogPreview.filename} • {catalogPreview.titleCount} approved titles</p></div>
                <button className="btn btn-secondary" onClick={() => setCatalogPreview(null)}>Close</button>
              </div>
              <pre style={{ background: '#08090b', border: '1px solid #26292d', padding: '15px', overflow: 'auto', whiteSpace: 'pre', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                {catalogPreview.csv.split('\r\n').slice(0, 11).join('\n')}{catalogPreview.titleCount > 10 ? '\n… Preview limited to first 10 rows' : ''}
              </pre>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '15px' }}>
                <button className="btn btn-primary" onClick={() => { handleCatalogCsvDownload(catalogPreview.cycle.cycleId); setCatalogPreview(null); }}>Download This CSV</button>
              </div>
            </div>
          </div>
        )}


        {/* Return Authorizations tab */}
        {activeSection === 'returns' && (
          <div className="glass-panel" style={{ padding: '30px' }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--gold-primary)', fontSize: '1.2rem' }}>PENDING RETURN REQUESTS</h3>
            {pendingReturns.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>No return requests pending authorization.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {pendingReturns.map(r => (
                  <div key={r.returnId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glow)', padding: '20px', borderRadius: '8px', flexWrap: 'wrap', gap: '15px' }}>
                    <div>
                      {r.placeholder && <span className="badge badge-gold" style={{ fontSize: '0.58rem', marginBottom: '6px' }}>Return Placeholder</span>}
                      <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#fff' }}>
                        {r.retailerName} requested returns for <span style={{ color: 'var(--gold-primary)' }}>{r.titleName}</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Return Count: <strong style={{ color: 'var(--red-primary)' }}>{r.qty} copies</strong>{r.orderId ? ` | Order: ${r.orderId}` : ''} | Reason: "{r.reason}"
                      </div>
                      {r.requestedCredit != null && <div style={{ fontSize: '0.78rem', color: 'var(--green-primary)', marginTop: '5px' }}>Requested retailer credit: ${Number(r.requestedCredit).toFixed(2)}</div>}
                      {r.adminNotes && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '5px' }}>{r.adminNotes}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn btn-danger" style={{ padding: '8px 12px', fontSize: '0.8rem' }} onClick={() => handleRejectReturn(r.returnId)}>
                        Reject
                      </button>
                      <button className="btn btn-primary" style={{ padding: '8px 12px', fontSize: '0.8rem' }} onClick={() => handleApproveReturn(r.returnId)}>
                        Approve Return
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* POs Generator tab */}
        {activeSection === 'purchase-orders' && (
          <div className="glass-panel" style={{ padding: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
              <div>
                <h3 style={{ color: 'var(--gold-primary)', fontSize: '1.2rem' }}>GENERATED PUBLISHER PURCHASE ORDERS</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>Official Publisher POs are frozen automatically when the assigned Catalog Cycle FOC closes. Open-cycle sales remain live estimates and do not create a PO.</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', background: 'rgba(0,0,0,0.2)', padding: '10px 15px', borderRadius: '6px', border: '1px solid var(--border-glow)' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>Catalog Cycle:</label>
                  <select 
                    value={targetCycleId} 
                    onChange={(e) => {
                      const cycleId = e.target.value;
                      setTargetCycleId(cycleId);
                      setGeneratedPOs(db.getPurchaseOrders(user, cycleId ? { cycleId } : {}));
                    }}
                    style={{ background: 'var(--bg-deep)', color: '#fff', border: '1px solid var(--border-glow)', padding: '4px 10px', borderRadius: '4px', fontSize: '0.85rem', outline: 'none' }}
                  >
                    <option value="">All finalized Catalog Cycles</option>
                    {cyclesList.filter(cycle => ['FOC Locked', 'Released', 'Archived'].includes(cycle.status)).map(cycle => <option key={cycle.cycleId} value={cycle.cycleId}>{cycle.cycleName}</option>)}
                  </select>
                </div>
              </div>
              <button 
                className="btn btn-secondary" 
                style={{ borderColor: 'var(--green-primary)', color: 'var(--green-primary)', fontSize: '0.8rem' }}
                onClick={() => alert('Simulated export of PO records to QuickBooks Online & Google Sheets Calculation engine successful!')}
              >
                📤 Sync to QuickBooks & Sheets
              </button>
            </div>

            {generatedPOs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>No official Purchase Orders exist for this selection. A PO appears only after its Catalog Cycle FOC is closed and the Publisher has recorded sales.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                {generatedPOs.map(po => (
                  <div key={po.poNumber} style={{ border: '1px solid var(--border-glow)', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                    
                    {/* PO Header banner */}
                    <div style={{ padding: '15px 20px', background: 'rgba(212,175,55,0.05)', borderBottom: '1px solid var(--border-glow)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <strong style={{ color: 'var(--gold-primary)', fontSize: '1.05rem' }}>{po.poNumber}</strong>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginLeft: '12px' }}>Publisher: <strong>{po.publisherName}</strong></span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginLeft: '15px' }}>PO Date: <strong style={{ color: 'var(--gold-primary)' }}>{po.poDate}</strong></span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginLeft: '15px' }}>Release Month: <strong style={{ color: 'var(--green-primary)' }}>{po.targetReleaseMonth}</strong></span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '0.85rem' }}>
                          Commission Rate: <span className="badge badge-gold" style={{ fontSize: '0.7rem' }}>{po.commissionRate}</span>
                        </span>
                        <button 
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.7rem', borderColor: 'var(--gold-primary)', color: 'var(--gold-primary)' }}
                          onClick={() => handleExportPO(po)}
                        >
                          📥 Export CSV
                        </button>
                        <button className="btn btn-primary" style={{ padding: '5px 11px', fontSize: '0.7rem' }} onClick={() => setSelectedPurchaseOrder(po)}>Open Actual PO</button>
                      </div>
                    </div>

                    {/* PO items details */}
                    <div style={{ padding: '20px' }}>
                      <div className="table-container" style={{ border: 'none', background: 'transparent' }}>
                        <table className="premium-table">
                          <thead>
                            <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                              <th style={{ padding: '10px 15px' }}>Comic Details</th>
                              <th style={{ padding: '10px 15px', textAlign: 'center' }}>Qty</th>
                              <th style={{ padding: '10px 15px', textAlign: 'right' }}>MSRP</th>
                              <th style={{ padding: '10px 15px', textAlign: 'right' }}>Wholesale</th>
                              <th style={{ padding: '10px 15px', textAlign: 'right' }}>Line Total</th>
                              <th style={{ padding: '10px 15px', textAlign: 'right' }}>Philbo Comm (MSRP)</th>
                              <th style={{ padding: '10px 15px', textAlign: 'right' }}>Net Due</th>
                            </tr>
                          </thead>
                          <tbody>
                            {po.items.map((item, idx) => (
                              <tr key={idx}>
                                <td style={{ padding: '12px 15px', fontWeight: '500' }}>{item.title}</td>
                                <td style={{ padding: '12px 15px', textAlign: 'center' }}>{item.qty}</td>
                                <td style={{ padding: '12px 15px', textAlign: 'right' }}>${item.msrp.toFixed(2)}</td>
                                <td style={{ padding: '12px 15px', textAlign: 'right' }}>${item.wholesalePrice.toFixed(2)}</td>
                                <td style={{ padding: '12px 15px', textAlign: 'right' }}>${item.lineTotal.toFixed(2)}</td>
                                <td style={{ padding: '12px 15px', textAlign: 'right', color: 'var(--red-primary)' }}>-${item.commission.toFixed(2)}</td>
                                <td style={{ padding: '12px 15px', textAlign: 'right', color: 'var(--green-primary)', fontWeight: 'bold' }}>${item.netDue.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* PO Net Summary box */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '15px' }}>
                        <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glow)', padding: '15px', borderRadius: '6px', width: '320px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>MSRP Value:</span>
                            <span>${po.msrpTotal.toFixed(2)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Wholesale Invoice Value:</span>
                            <span>${po.wholesaleTotal.toFixed(2)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Philbo commission cut:</span>
                            <span style={{ color: 'var(--gold-primary)' }}>-${po.totalCommission.toFixed(2)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', marginTop: '4px' }}>
                            <span style={{ color: '#fff' }}>Publisher Net Payout:</span>
                            <span style={{ color: 'var(--green-primary)', fontSize: '1rem' }}>${po.netDueToPublisher.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reports / Database tab */}
        {activeSection === 'analytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* Search & Filter Bar */}
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Search clients by company name or email..." 
                style={{ flex: 1, minWidth: '240px', padding: '10px' }}
                value={clientSearchTerm}
                onChange={(e) => setClientSearchTerm(e.target.value)}
              />
/* Filters handled by sidebar categories */
            </div>

            {/* Retailers list */}
            {(clientRoleFilter === 'all' || activeSection === 'retailers') && (
              <div className="glass-panel" style={{ padding: '30px' }}>
                <h3 style={{ marginBottom: '20px', color: 'var(--gold-primary)', fontSize: '1.2rem' }}>RETAILER CLIENTS LIST</h3>
                <div className="table-container">
                  <table className="premium-table">
                    <thead>
                      <tr>
                        <th>Retailer / Company</th>
                        <th>Email Contact</th>
                        <th style={{ textAlign: 'center' }}>Active Discount</th>
                        <th style={{ textAlign: 'right' }}>Credit Balance</th>
                        <th style={{ textAlign: 'right' }}>Cycle Spending</th>
                        <th style={{ textAlign: 'center' }}>Returns Used</th>
                        <th style={{ textAlign: 'right' }}>Profile</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersList
                        .filter(u => u.role === 'retailer' && u.approved)
                        .filter(u => 
                          u.companyName.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                          u.email.toLowerCase().includes(clientSearchTerm.toLowerCase())
                        )
                        .map(u => (
                          <tr key={u.uid}>
                            <td style={{ fontWeight: '500' }}>{u.companyName}</td>
                            <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span className={`badge ${u.tier === 'Tier III' ? 'badge-gold' : u.tier === 'Tier II' ? 'badge-silver' : 'badge-secondary'}`}>
                                {u.tier === 'Tier III' ? '50%' : u.tier === 'Tier II' ? '45%' : '40%'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', color: 'var(--green-primary)', fontWeight: 'bold' }}>
                              ${(u.returnCreditBalance || 0).toFixed(2)}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>${u.totalCycleSpend.toFixed(2)}</td>
                            <td style={{ textAlign: 'center', color: 'var(--red-primary)' }}>{u.returnsUsed}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '4px 10px', fontSize: '0.7rem' }}
                                onClick={() => setSelectedRetailerProfile(u)}
                              >
                                🔍 View Info
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Publishers list */}
            {(clientRoleFilter === 'all' || activeSection === 'publishers') && (
              <div className="glass-panel" style={{ padding: '30px' }}>
                <h3 style={{ marginBottom: '20px', color: 'var(--gold-primary)', fontSize: '1.2rem' }}>PUBLISHER PARTNERS LIST</h3>
                <div className="table-container">
                  <table className="premium-table">
                    <thead>
                      <tr>
                        <th>Publisher / House</th>
                        <th>Email Contact</th>
                        <th style={{ textAlign: 'center' }}>Commission Cut</th>
                        <th style={{ textAlign: 'right' }}>Titles Listed</th>
                        <th style={{ textAlign: 'right' }}>Profile</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersList
                        .filter(u => u.role === 'publisher' && u.approved)
                        .filter(u => 
                          u.companyName.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                          u.email.toLowerCase().includes(clientSearchTerm.toLowerCase())
                        )
                        .map(u => {
                          const titlesCount = titlesList.filter(t => t.publisherId === u.uid).length;
                          return (
                            <tr key={u.uid}>
                              <td style={{ fontWeight: '500' }}>{u.companyName}</td>
                              <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                              <td style={{ textAlign: 'center', color: 'var(--gold-primary)', fontWeight: 'bold' }}>
                                {((u.commissionRate || 0.10) * 100)}% of MSRP
                              </td>
                              <td style={{ textAlign: 'right', paddingRight: '30px' }}>{titlesCount}</td>
                              <td style={{ textAlign: 'right' }}>
                                <button 
                                  className="btn btn-secondary" 
                                  style={{ padding: '4px 10px', fontSize: '0.7rem' }}
                                  onClick={() => setSelectedRetailerProfile(u)}
                                >
                                  🔍 View Info
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Shipping tab */}
        {activeSection === 'inventory' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            <div className="glass-panel" style={{ padding: '22px', borderColor: 'var(--amber-warning)' }}>
              <span className="badge badge-gold" style={{ marginBottom: '10px' }}>Sample Data Only</span>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--gold-primary)', marginBottom: '8px' }}>INVENTORY PLACEHOLDERS</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                These five records demonstrate the planned inventory layout. They are not real stock and do not affect orders, payouts, purchase orders, production orders, or retailer availability.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px' }}>
              <div className="glass-panel" style={{ padding: '18px' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>SAMPLE TITLES</span><strong style={{ display: 'block', fontSize: '1.6rem', color: 'var(--gold-primary)', marginTop: '4px' }}>{inventoryList.length}</strong></div>
              <div className="glass-panel" style={{ padding: '18px' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>ON HAND</span><strong style={{ display: 'block', fontSize: '1.6rem', marginTop: '4px' }}>{inventoryList.reduce((sum, item) => sum + item.onHand, 0)}</strong></div>
              <div className="glass-panel" style={{ padding: '18px' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>AVAILABLE</span><strong style={{ display: 'block', fontSize: '1.6rem', color: 'var(--green-primary)', marginTop: '4px' }}>{inventoryList.reduce((sum, item) => sum + item.available, 0)}</strong></div>
              <div className="glass-panel" style={{ padding: '18px' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>INCOMING</span><strong style={{ display: 'block', fontSize: '1.6rem', color: 'var(--amber-warning)', marginTop: '4px' }}>{inventoryList.reduce((sum, item) => sum + item.incoming, 0)}</strong></div>
            </div>

            <div className="table-container">
              <table className="premium-table" style={{ tableLayout: 'fixed', minWidth: '1180px', fontSize: '0.72rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: '210px', padding: '10px 8px' }}>Placeholder Title</th><th style={{ width: '120px', padding: '10px 8px' }}>Publisher</th><th style={{ width: '95px', padding: '10px 8px' }}>Method</th><th style={{ width: '105px', padding: '10px 8px' }}>Location</th><th style={{ width: '75px', padding: '10px 8px', textAlign: 'center' }}>On Hand</th><th style={{ width: '75px', padding: '10px 8px', textAlign: 'center' }}>Reserved</th><th style={{ width: '75px', padding: '10px 8px', textAlign: 'center' }}>Damaged</th><th style={{ width: '90px', padding: '10px 8px', textAlign: 'center' }}>Publisher Copies</th><th style={{ width: '75px', padding: '10px 8px', textAlign: 'center' }}>Available</th><th style={{ width: '75px', padding: '10px 8px', textAlign: 'center' }}>Incoming</th><th style={{ width: '80px', padding: '10px 8px', textAlign: 'center' }}>Reorder Level</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryList.map(item => (
                    <tr key={item.inventoryId}>
                      <td style={{ padding: '9px 8px', whiteSpace: 'normal', lineHeight: 1.3 }}><button type="button" onClick={() => handleOpenInventoryTitle(item)} style={{ background: 'none', border: 0, padding: 0, color: 'var(--gold-primary)', font: 'inherit', fontWeight: 700, textAlign: 'left', cursor: 'pointer', textDecoration: 'underline' }}>{item.title}</button><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '3px' }}>{item.philboId}</div></td>
                      <td style={{ padding: '9px 8px', whiteSpace: 'normal' }}>{item.publisherName}</td>
                      <td style={{ padding: '9px 8px', whiteSpace: 'normal' }}>{item.fulfillmentMethod}</td>
                      <td style={{ padding: '9px 8px' }}><input className="form-input" value={item.location} onChange={(e) => handleInventoryFieldChange(item.inventoryId, 'location', e.target.value)} onBlur={(e) => handleInventoryFieldSave(item.inventoryId, 'location', e.target.value)} style={{ width: '100%', padding: '5px 6px', fontSize: '0.68rem' }} /></td>
                      {['onHand', 'reserved', 'damaged', 'publisherOwned'].map(field => (
                        <td key={field} style={{ padding: '9px 6px', textAlign: 'center' }}><input type="number" min="0" className="form-input" value={item[field]} onChange={(e) => handleInventoryFieldChange(item.inventoryId, field, e.target.value)} onBlur={(e) => handleInventoryFieldSave(item.inventoryId, field, e.target.value)} style={{ width: '58px', padding: '5px 4px', textAlign: 'center', fontSize: '0.7rem' }} /></td>
                      ))}
                      <td style={{ padding: '9px 6px', textAlign: 'center' }}><strong style={{ color: item.available <= Number(item.reorderLevel) ? 'var(--red-primary)' : 'var(--green-primary)', fontSize: '0.8rem' }}>{item.available}</strong></td>
                      {['incoming', 'reorderLevel'].map(field => (
                        <td key={field} style={{ padding: '9px 6px', textAlign: 'center' }}><input type="number" min="0" className="form-input" value={item[field]} onChange={(e) => handleInventoryFieldChange(item.inventoryId, field, e.target.value)} onBlur={(e) => handleInventoryFieldSave(item.inventoryId, field, e.target.value)} style={{ width: '58px', padding: '5px 4px', textAlign: 'center', fontSize: '0.7rem' }} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSection === 'fulfillment' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ color: 'var(--gold-primary)', fontSize: '1.1rem', marginBottom: '6px' }}>OFFICIAL CYCLE PURCHASE ORDERS</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '16px' }}>These are the finalized Publisher documents created after FOC close. Open-cycle sales are intentionally excluded.</p>
              {generatedPOs.filter(po => po.status === 'Official').length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No official Purchase Orders are ready for fulfillment.</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '10px' }}>{generatedPOs.filter(po => po.status === 'Official').map(po => <button key={po.poNumber} className="btn btn-secondary" style={{ padding: '12px', justifyContent: 'space-between', textAlign: 'left' }} onClick={() => setSelectedPurchaseOrder(po)}><span><strong style={{ display: 'block', color: 'var(--gold-primary)' }}>{po.poNumber}</strong><small>{po.publisherName} · {po.totalUnits} units</small></span><span>Open PO →</span></button>)}</div>}
            </div>
            
            {/* Pirate Ship walk-through guide */}
            <div className="glass-panel" style={{ padding: '30px' }}>
              <h3 style={{ color: 'var(--gold-primary)', fontSize: '1.2rem', marginBottom: '15px' }}>
                🚢 PIRATE SHIP INTEGRATION FLOW (CSV BATCH SHIPPING)
              </h3>
              
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '20px' }}>
                Pirate Ship supports spreadsheet imports which lets you batch print shipping labels without manually typing each address. 
                Our platform automatically compiles addresses, weights, and packaging dimensions.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glow)', padding: '15px', borderRadius: '6px' }}>
                  <strong style={{ color: 'var(--gold-primary)', display: 'block', fontSize: '0.85rem' }}>Step 1: Export CSV</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                    Click "Export All Orders" below to download the compiled label spreadsheet file.
                  </span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glow)', padding: '15px', borderRadius: '6px' }}>
                  <strong style={{ color: 'var(--gold-primary)', display: 'block', fontSize: '0.85rem' }}>Step 2: Upload to Pirate Ship</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                    Log into Pirate Ship, navigate to <strong>Import Grid</strong>, and upload the exported CSV file.
                  </span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glow)', padding: '15px', borderRadius: '6px' }}>
                  <strong style={{ color: 'var(--gold-primary)', display: 'block', fontSize: '0.85rem' }}>Step 3: Map & Verify</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                    Pirate Ship will map columns like name, zip code, and weight automatically. Verify details.
                  </span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glow)', padding: '15px', borderRadius: '6px' }}>
                  <strong style={{ color: 'var(--gold-primary)', display: 'block', fontSize: '0.85rem' }}>Step 4: Batch Print</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                    Purchase and download all labels as a single PDF. Paste onto boxes and ship!
                  </span>
                </div>
              </div>
            </div>

            {/* Pending Shipments Table */}
            <div className="glass-panel" style={{ padding: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                <h3 style={{ color: 'var(--gold-primary)', fontSize: '1.1rem' }}>PENDING SHIPMENTS & ORDER WEIGHTS</h3>
                {ordersList.length > 0 && (
                  <button className="btn btn-primary" onClick={() => handleExportPirateShipCSV(ordersList)}>
                    📥 Export All Orders for Pirate Ship
                  </button>
                )}
              </div>

              {ordersList.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>No orders found needing shipment.</p>
              ) : (
                <div className="table-container">
                  <table className="premium-table">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>Retailer Store</th>
                        <th>Recipient</th>
                        <th>Shipping Address</th>
                        <th style={{ textAlign: 'center' }}>Total Copies</th>
                        <th style={{ textAlign: 'right' }}>Calculated Weight</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersList.map(order => {
                        const allUsers = db.getUsers();
                        const retailerUser = allUsers.find(u => u.uid === order.retailerId) || {};
                        const totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);
                        
                        // Calculate weight
                        let totalWeightOz = 0;
                        order.items.forEach(item => {
                          const titleRecord = titlesList.find(t => t.titleId === item.titleId) || {};
                          const unitWeight = parseFloat(titleRecord.weight) || 2.8;
                          totalWeightOz += unitWeight * item.qty;
                        });

                        const weightText = totalWeightOz >= 16 
                          ? `${(totalWeightOz / 16).toFixed(2)} lbs (${totalWeightOz.toFixed(0)} oz)` 
                          : `${totalWeightOz.toFixed(1)} oz`;

                        const fullAddress = retailerUser.shippingAddress1 
                          ? `${retailerUser.shippingAddress1}, ${retailerUser.shippingAddress2 ? retailerUser.shippingAddress2 + ', ' : ''}${retailerUser.shippingCity}, ${retailerUser.shippingState} ${retailerUser.shippingZip}`
                          : '123 Retailer St, City, State Zip';

                        return (
                          <tr key={order.orderId}>
                            <td><button type="button" className="table-link-button" style={{ fontFamily: 'monospace' }} onClick={() => handleOpenSalesOrder(order)}>{order.orderId}</button></td>
                            <td>{retailerUser.companyName || 'Metropolis Comics'}</td>
                            <td>{retailerUser.shippingName || 'Clark Kent'}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {fullAddress}
                            </td>
                            <td style={{ textAlign: 'center' }}>{totalQty}</td>
                            <td style={{ textAlign: 'right', fontWeight: '500' }}>{weightText}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                                onClick={() => handleExportPirateShipCSV([order])}
                              >
                                Export Label CSV
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

      {selectedPurchaseOrder && <PurchaseOrderDocument purchaseOrder={selectedPurchaseOrder} onClose={() => setSelectedPurchaseOrder(null)} />}

      {catalogDisplayTitle && (
        <CatalogProductDetail
          title={catalogDisplayTitle}
          onClose={() => setCatalogDisplayTitle(null)}
          viewerRole="public"
        />
      )}

      {/* Interactive Title Preview Modal */}
      {selectedPreviewTitle && (
        <div className="admin-title-preview-overlay">
          <div className="admin-title-preview-modal glass-panel animate-fade-in">
            
            {/* Modal Header */}
            <div className="admin-title-modal-header" style={{ borderBottom: '1px solid var(--border-glow)', paddingBottom: '15px', marginBottom: '20px' }}>
              <div>
                <span className="badge badge-gold" style={{ marginBottom: '5px' }}>Catalog listing review</span>
                <h3 style={{ color: '#fff', fontSize: '1.25rem', textTransform: 'uppercase' }}>Preview: {selectedPreviewTitle.title}</h3>
              </div>
              <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => setSelectedPreviewTitle(null)}>
                ✕ Close
              </button>
            </div>

            {/* Modal Content Grid */}
            <div className="admin-title-preview-grid">
              
              {/* Left Column: Comic Cover Art & Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', gap: '15px', background: 'rgba(0,0,0,0.15)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-glow)' }}>
                  <img 
                    src={selectedPreviewTitle.coverUrl || 'https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?q=80&w=400&auto=format&fit=crop'} 
                    alt={selectedPreviewTitle.title} 
                    style={{ width: '100px', height: '150px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-glow)' }}
                  />
                  <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center' }}>
                    <div><strong>Title:</strong> {selectedPreviewTitle.title}</div>
                    <div><strong>Publisher:</strong> <span style={{ color: 'var(--gold-primary)' }}>{selectedPreviewTitle.publisherName}</span></div>
                    <div><strong>Writer:</strong> {selectedPreviewTitle.writer || 'N/A'}</div>
                    <div><strong>Artist:</strong> {selectedPreviewTitle.artist || 'N/A'}</div>
                    <div><strong>Cover Artist:</strong> {selectedPreviewTitle.coverArtist || 'N/A'}</div>
                  </div>
                </div>

                {/* Group 1: Book Info */}
                <div style={{ background: 'rgba(255,255,255,0.01)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-glow)', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <strong style={{ color: 'var(--gold-primary)', borderBottom: '1px solid var(--border-glow)', paddingBottom: '4px', display: 'block', marginBottom: '4px' }}>📖 SERIES & FORMAT SPECS</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div><strong>Series Name:</strong> {selectedPreviewTitle.seriesName || 'N/A'}</div>
                    <div><strong>Series Code:</strong> {selectedPreviewTitle.seriesCode || 'N/A'}</div>
                    <div><strong>Issue Number:</strong> #{selectedPreviewTitle.issueNumber || 'N/A'}</div>
                    <div><strong>Variant Letter:</strong> {selectedPreviewTitle.variantNumber || 'A'}</div>
                    <div><strong>Format:</strong> {selectedPreviewTitle.bookFormat}</div>
                    <div><strong>Series Type:</strong> {selectedPreviewTitle.seriesType}</div>
                    <div><strong>Frequency:</strong> {selectedPreviewTitle.seriesFrequency || 'Monthly'}</div>
                    <div><strong>Age Rating:</strong> {selectedPreviewTitle.ageRange}</div>
                  </div>
                </div>

                {/* Group 2: Dimensions & Page count */}
                <div style={{ background: 'rgba(255,255,255,0.01)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-glow)', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <strong style={{ color: 'var(--gold-primary)', borderBottom: '1px solid var(--border-glow)', paddingBottom: '4px', display: 'block', marginBottom: '4px' }}>📐 PRINTING & DIMENSIONS</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div><strong>MSRP Price:</strong> ${selectedPreviewTitle.msrp.toFixed(2)}</div>
                    <div><strong>Page Count:</strong> {selectedPreviewTitle.pageCount} pages</div>
                    <div><strong>Color Spec:</strong> {selectedPreviewTitle.colorProfile}</div>
                    <div><strong>Dimensions:</strong> {selectedPreviewTitle.width}" x {selectedPreviewTitle.height}"</div>
                    <div><strong>Weight:</strong> {selectedPreviewTitle.weight} oz</div>
                    <div><strong>Reorderable:</strong> {selectedPreviewTitle.availableForReorder}</div>
                    <div><strong>Reprint:</strong> {selectedPreviewTitle.reprint} (Printing #{selectedPreviewTitle.printingNumber})</div>
                  </div>
                </div>
              </div>

              {/* Right Column: Catalog-facing metadata and cover preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {/* Group 3: Codes & Language */}
                <div style={{ background: 'rgba(255,255,255,0.01)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-glow)', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <strong style={{ color: 'var(--gold-primary)', borderBottom: '1px solid var(--border-glow)', paddingBottom: '4px', display: 'block', marginBottom: '4px' }}>🏷️ DISTRIBUTIONS & CODES</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ gridColumn: 'span 2' }}><strong>Barcode / UPC / EAN:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedPreviewTitle.barcode || 'N/A'}</span></div>
                    <div><strong>Language:</strong> {selectedPreviewTitle.language || 'English'}</div>
                    <div><strong>FOC Date:</strong> {selectedPreviewTitle.focDate}</div>
                    <div style={{ gridColumn: 'span 2' }}><strong>Variant Description:</strong> {selectedPreviewTitle.coverDescription || 'N/A'}</div>
                    <div style={{ gridColumn: 'span 2' }}><strong>BISAC Codes:</strong> {selectedPreviewTitle.bisac1 || 'N/A'}{selectedPreviewTitle.bisac2 ? `, ${selectedPreviewTitle.bisac2}` : ''}{selectedPreviewTitle.bisac3 ? `, ${selectedPreviewTitle.bisac3}` : ''}</div>
                  </div>
                </div>

                {/* Production files are not required for catalog approval. */}
                <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glow)', padding: '15px', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <strong style={{ color: 'var(--gold-primary)' }}>PRODUCTION FILE STATUS · NOT PART OF CATALOG APPROVAL</strong>
                  <div>📄 <strong style={{ color: 'var(--text-secondary)' }}>Interior print PDF:</strong> {selectedPreviewTitle.interiorPdfName && selectedPreviewTitle.interiorPdfName !== 'N/A' ? selectedPreviewTitle.interiorPdfName : 'Not submitted yet'}</div>
                  <div>🖼️ <strong style={{ color: 'var(--text-secondary)' }}>High-res cover source:</strong> {selectedPreviewTitle.coverArtFileName || selectedPreviewTitle.coverArtPdfName || 'Not uploaded'}</div>
                  <div style={{ color: 'var(--text-muted)', marginTop: '4px' }}>The Preflight team reviews print files later, before the title is sent to production.</div>
                </div>

                {/* Simulated PDF Panel Render Box */}
                <div style={{ background: '#1c1c24', border: '2px solid #2d2d3a', borderRadius: '8px', padding: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', minHeight: '220px', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: '10px', left: '10px', right: '10px', bottom: '10px', border: '1px dashed rgba(212,175,55,0.25)', pointerEvents: 'none' }}>
                    <span style={{ fontSize: '0.6rem', color: 'rgba(212,175,55,0.4)', position: 'absolute', top: '2px', left: '4px' }}>Bleed Guide (0.125")</span>
                  </div>

                  <span className="badge badge-secondary" style={{ fontSize: '0.65rem' }}>CATALOG COVER PREVIEW</span>
                  
                  <div style={{ width: '120px', height: '175px', border: '1px solid var(--border-glow)', background: '#0e0e12', display: 'flex', position: 'relative' }}>
                    <img src={selectedPreviewTitle.coverUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="catalog cover preview" />
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', textAlign: 'center' }}>This image represents the title in the public and retailer catalogs.</div>
                </div>
              </div>

            </div>

            <div className="glass-panel" style={{ padding: '18px', marginTop: '18px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ color: 'var(--gold-primary)' }}>AUTHORITATIVE LISTING METADATA</strong>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '3px' }}>Corrections saved here flow to every downstream listing and export.</p>
                </div>
                <button className="btn btn-secondary" type="button" onClick={() => { saveAdminReviewEdits(); setToast('Review edits saved to the authoritative product record.'); }}>Save Review Edits</button>
              </div>
              <div className="admin-title-review-grid">
                {[
                  ['title', 'Title'], ['issueNumber', 'Issue / Volume'], ['variantNumber', 'Cover / Variant'],
                  ['coverDescription', 'Cover Description'], ['bookFormat', 'Product Type / Format'], ['genre', 'Genre'],
                  ['ageRange', 'Rating'], ['seriesFrequency', 'Frequency'], ['pageCount', 'Page Count'],
                  ['msrp', 'MSRP'], ['colorProfile', 'Color / B&W'], ['writer', 'Writer(s)'],
                  ['artist', 'Artist(s)'], ['coverArtist', 'Cover Artist(s)'], ['width', 'Trim Width'],
                  ['height', 'Trim Height'], ['incentiveRatio', 'Incentive Ratio'], ['incentiveRules', 'Incentive Rules'],
                  ['coverUrl', 'Cover Image URL'], ['additionalImage1', 'Additional Image 1'],
                  ['additionalImage2', 'Additional Image 2'], ['publisherLogoUrl', 'Publisher Logo URL']
                ].map(([field, label]) => (
                  <label className="form-group" key={field}>
                    <span className="form-label">{label}</span>
                    <input className="form-input" value={adminTitleEdits[field] ?? ''} onChange={event => setAdminTitleEdits(current => ({ ...current, [field]: event.target.value }))} />
                  </label>
                ))}
                <label className="form-group">
                  <span className="form-label">Catalog Cycle</span>
                  <select className="form-select" value={adminTitleEdits.cycleId || ''} onChange={event => setAdminTitleEdits(current => ({ ...current, cycleId: event.target.value }))}>
                    {cyclesList.map(cycle => <option key={cycle.cycleId} value={cycle.cycleId}>{cycle.cycleName}</option>)}
                  </select>
                </label>
                <label className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <span className="form-label">Solicitation Copy</span>
                  <textarea className="form-input" rows="5" value={adminTitleEdits.description || ''} onChange={event => setAdminTitleEdits(current => ({ ...current, description: event.target.value }))} />
                </label>
              </div>
            </div>

            {/* FOC Overrides & Internal Review notes */}
            <div className="admin-title-review-grid">
              <div style={{ background: 'rgba(255,255,255,0.01)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-glow)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <strong style={{ color: 'var(--gold-primary)', display: 'block', fontSize: '0.8rem' }}>⚙️ ADMIN OVERRIDES</strong>
                
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.7rem' }}>FOC Date Override</label>
                  <input
                    type="date"
                    className="form-input"
                    style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                    value={overrideFocDate}
                    onChange={(e) => setOverrideFocDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.7rem' }}>Fulfillment Override</label>
                  <select
                    className="form-select"
                    style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                    value={overrideFulfillment}
                    onChange={(e) => setOverrideFulfillment(e.target.value)}
                  >
                    <option value="Inventory">Inventory</option>
                    <option value="Philbo POD">Philbo POD</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.7rem' }}>PHILBO ID Override</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                    value={overridePhilboId}
                    onChange={(e) => setOverridePhilboId(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.01)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-glow)' }}>
                <strong style={{ color: 'var(--gold-primary)', display: 'block', marginBottom: '8px', fontSize: '0.8rem' }}>✍️ INTERNAL REVIEW FEEDBACK / NOTES</strong>
                <textarea
                  className="form-input"
                  style={{ width: '100%', height: '180px', fontSize: '0.8rem', padding: '8px', resize: 'none' }}
                  placeholder="Enter changes requested details or internal review comments..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Audit History Logs */}
            <div style={{ background: 'rgba(255,255,255,0.01)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-glow)', marginBottom: '20px', fontSize: '0.8rem' }}>
              <strong style={{ color: 'var(--gold-primary)', display: 'block', marginBottom: '10px' }}>📜 TITLE AUDIT TRAIL LOGS</strong>
              {(!selectedPreviewTitle.history || selectedPreviewTitle.history.length === 0) ? (
                <div style={{ color: 'var(--text-muted)' }}>No audit events recorded for this book.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                  {selectedPreviewTitle.history.map((h, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px', background: 'rgba(0,0,0,0.15)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.02)' }}>
                      <div>
                        <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }}>[{h.user}]</span>{' '}
                        <span>{h.action}</span>
                        {h.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '8px', marginTop: '2px' }}>Note: {h.notes}</div>}
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(h.date).toLocaleDateString()} {new Date(h.date).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.35)', color: 'var(--text-secondary)', padding: '11px 14px', borderRadius: '6px', marginBottom: '14px', fontSize: '0.78rem', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--gold-primary)' }}>Approval is the trigger:</strong> Approving publishes this authoritative record to the public catalog, retailer catalog, and CSV. It does not approve production print files.
            </div>
            <div className="admin-title-modal-actions" style={{ borderTop: '1px solid var(--border-glow)', paddingTop: '15px' }}>
              <div className="admin-title-action-group">
                <button 
                  className="btn btn-secondary" 
                  style={{ borderColor: 'var(--red-primary)', color: 'var(--red-primary)' }} 
                  onClick={() => decideTitleReview('Changes Requested')}
                >
                  Needs Revision
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={() => decideTitleReview('Approved')}
                >
                  Approve
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ borderColor: 'var(--red-primary)', color: 'var(--red-primary)' }}
                  onClick={() => decideTitleReview('Rejected')}
                >
                  Reject
                </button>
              </div>

              <div className="admin-title-action-group">
                {selectedPreviewTitle.status === 'Live' && (
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => {
                      handleUpdateTitleStatus(selectedPreviewTitle.titleId, 'Approved', 'Removed from live catalog by Administrator.');
                      setSelectedPreviewTitle(null);
                    }}
                  >
                    Take Offline
                  </button>
                )}
                <button 
                  className="btn btn-secondary" 
                  onClick={() => {
                    handleUpdateTitleStatus(selectedPreviewTitle.titleId, 'Archived', 'Archived by Administrator.');
                    setSelectedPreviewTitle(null);
                  }}
                >
                  Archive
                </button>
                <button className="btn btn-primary" onClick={() => setSelectedPreviewTitle(null)}>
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Retailer Sales Order Detail Modal */}
      {selectedSalesOrder && createPortal(
        <div className="admin-profile-overlay portal-modal-typography">
          <div className="admin-profile-modal sales-order-detail-modal glass-panel animate-fade-in">
            <div className="profile-modal-header" style={{ borderBottom: '1px solid var(--border-glow)', paddingBottom: '15px', marginBottom: '20px' }}>
              <div>
                <span className="badge badge-gold" style={{ marginBottom: '5px' }}>Retailer Sales Order</span>
                <h3 style={{ color: '#fff', fontSize: '1.35rem', fontFamily: 'monospace' }}>{selectedSalesOrder.orderId}</h3>
              </div>
              <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => setSelectedSalesOrder(null)}>✕ Close</button>
            </div>

            <div className="sales-order-summary-grid">
              <div className="sales-order-info-card">
                <span>ORDER PLACED</span>
                <strong>{selectedSalesOrder.date ? new Date(selectedSalesOrder.date).toLocaleString() : 'Date not recorded'}</strong>
              </div>
              <div className="sales-order-info-card">
                <span>RETAILER</span>
                <strong>{selectedSalesOrder.retailerName || selectedSalesOrderRetailer?.companyName || 'Unknown retailer'}</strong>
                <small>{selectedSalesOrderRetailer?.email || 'Email not recorded'}</small>
              </div>
              <div className="sales-order-info-card">
                <span>PAYMENT</span>
                <strong>{selectedSalesOrder.paymentStatus || 'Unknown'}</strong>
                <small>${Number(selectedSalesOrder.netTotal || 0).toFixed(2)} order total</small>
              </div>
              <div className="sales-order-info-card">
                <span>FULFILLMENT STATUS</span>
                <strong>{selectedSalesOrder.status || 'Pending'}</strong>
                <small>{(selectedSalesOrder.items || []).length} title{(selectedSalesOrder.items || []).length === 1 ? '' : 's'} · {selectedSalesOrderCopies} copies</small>
              </div>
            </div>

            <div className="sales-order-section">
              <strong className="sales-order-section-title">RETAILER & SHIPPING INFORMATION</strong>
              <div className="sales-order-contact-grid">
                <div><span>Company</span><strong>{selectedSalesOrderRetailer?.companyName || selectedSalesOrder.retailerName || 'Not recorded'}</strong></div>
                <div><span>Contact</span><strong>{[selectedSalesOrderRetailer?.firstName, selectedSalesOrderRetailer?.lastName].filter(Boolean).join(' ') || selectedSalesOrderRetailer?.shippingName || 'Not recorded'}</strong></div>
                <div><span>Email</span><strong>{selectedSalesOrderRetailer?.email || 'Not recorded'}</strong></div>
                <div><span>Phone</span><strong>{selectedSalesOrderRetailer?.phone || selectedSalesOrderRetailer?.mobilePhone || 'Not recorded'}</strong></div>
                <div className="sales-order-address"><span>Ship To</span><strong>{[
                  selectedSalesOrderRetailer?.shippingName,
                  selectedSalesOrderRetailer?.shippingAddress1,
                  selectedSalesOrderRetailer?.shippingAddress2,
                  [selectedSalesOrderRetailer?.shippingCity, selectedSalesOrderRetailer?.shippingState, selectedSalesOrderRetailer?.shippingZip].filter(Boolean).join(', ').replace(/, ([^,]+)$/, ' $1'),
                  selectedSalesOrderRetailer?.shippingCountry
                ].filter(Boolean).join('\n') || 'Shipping address not recorded'}</strong></div>
              </div>
            </div>

            <div className="sales-order-section">
              <strong className="sales-order-section-title">BOOKS ORDERED</strong>
              <div className="table-container">
                <table className="premium-table sales-order-lines-table">
                  <thead><tr><th>Book</th><th>Publisher</th><th>Catalog / FOC</th><th style={{ textAlign: 'center' }}>Qty</th><th style={{ textAlign: 'right' }}>Wholesale Each</th><th style={{ textAlign: 'right' }}>Line Total</th></tr></thead>
                  <tbody>
                    {(selectedSalesOrder.items || []).map((item, index) => {
                      const title = titlesList.find(record => record.titleId === item.titleId);
                      const publisher = usersList.find(account => account.uid === item.publisherId);
                      const cycle = cyclesList.find(record => record.cycleId === title?.cycleId);
                      return (
                        <tr key={`${selectedSalesOrder.orderId}-${item.titleId || index}`}>
                          <td><strong>{item.titleName || item.title || title?.title || 'Untitled'}</strong><div className="pull-code-secondary">{title?.philboId || title?.barcode || 'ID not recorded'}</div></td>
                          <td>{publisher?.companyName || title?.publisherName || '—'}</td>
                          <td>{cycle?.cycleName || title?.cycleId || 'Unassigned'}<div className="pull-code-secondary">FOC: {title?.focDate || cycle?.focDate || 'TBA'}</div></td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>{Number(item.qty || 0)}</td>
                          <td style={{ textAlign: 'right' }}>${Number(item.wholesalePrice || 0).toFixed(2)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>${(Number(item.qty || 0) * Number(item.wholesalePrice || 0)).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="sales-order-totals">
                <div><span>MSRP total</span><strong>${Number(selectedSalesOrder.msrpTotal || 0).toFixed(2)}</strong></div>
                <div><span>Retailer discount</span><strong>−${Number(selectedSalesOrder.discountTotal || 0).toFixed(2)}</strong></div>
                {Number(selectedSalesOrder.couponDiscount || 0) > 0 && <div><span>Coupon {selectedSalesOrder.couponCode || ''}</span><strong>−${Number(selectedSalesOrder.couponDiscount).toFixed(2)}</strong></div>}
                {Number(selectedSalesOrder.creditApplied || 0) > 0 && <div><span>Credit applied</span><strong>−${Number(selectedSalesOrder.creditApplied).toFixed(2)}</strong></div>}
                <div className="sales-order-grand-total"><span>Paid total</span><strong>${Number(selectedSalesOrder.netTotal || 0).toFixed(2)}</strong></div>
              </div>
            </div>

            <div className="sales-order-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => handleExportPirateShipCSV([selectedSalesOrder])}>Export Shipping Record</button>
              <button type="button" className="btn btn-primary" onClick={() => setSelectedSalesOrder(null)}>Done</button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Approved Retailer / Publisher Profile Detail Modal */}
      {selectedRetailerProfile && createPortal(
        <div className="admin-profile-overlay portal-modal-typography">
          <div className="admin-profile-modal glass-panel animate-fade-in">
            
            <div className="profile-modal-header" style={{ borderBottom: '1px solid var(--border-glow)', paddingBottom: '15px', marginBottom: '20px' }}>
              <div>
                <span className="badge badge-gold" style={{ marginBottom: '5px' }}>
                  {selectedRetailerProfile.isPodClient ? 'POD Account' : selectedRetailerProfile.role === 'publisher' ? 'Publisher' : 'Retailer'} Profile
                </span>
                <h3 style={{ color: '#fff', fontSize: '1.2rem', textTransform: 'uppercase' }}>{selectedRetailerProfile.companyName}</h3>
              </div>
              <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => setSelectedRetailerProfile(null)}>
                ✕ Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontSize: '0.85rem' }}>
              <div className="account-access-control">
                <div>
                  <strong>PORTAL ACCESS</strong>
                  <p>On Hold and Archived accounts are signed out immediately and cannot sign in. Historical records are preserved.</p>
                </div>
                <span className={`badge ${accountStatusBadge(selectedRetailerProfile)}`}>{accountStatusLabel(selectedRetailerProfile)}</span>
                <div className="account-access-actions">
                  {selectedRetailerProfile.accountStatus === 'suspended' || selectedRetailerProfile.accountStatus === 'revoked' ? (
                    <button type="button" className="btn btn-primary" onClick={() => handleExternalAccountStatus(selectedRetailerProfile, 'active')}>Reactivate Account</button>
                  ) : (
                    <button type="button" className="btn btn-secondary" onClick={() => handleExternalAccountStatus(selectedRetailerProfile, 'suspended')}>Place on Hold</button>
                  )}
                  {selectedRetailerProfile.accountStatus !== 'revoked' && (
                    <button type="button" className="btn btn-danger" onClick={() => handleExternalAccountStatus(selectedRetailerProfile, 'revoked')}>Archive Account</button>
                  )}
                </div>
              </div>
              
              {/* Contact Info */}
              <div style={{ background: 'rgba(255,255,255,0.01)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-glow)' }}>
                <strong style={{ color: 'var(--gold-primary)', display: 'block', marginBottom: '10px' }}>👤 CONTACT INFORMATION</strong>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div><strong>First Name:</strong> {selectedRetailerProfile.firstName || 'N/A'}</div>
                  <div><strong>Last Name:</strong> {selectedRetailerProfile.lastName || 'N/A'}</div>
                  <div><strong>Email:</strong> {selectedRetailerProfile.email}</div>
                  <div><strong>Phone:</strong> {selectedRetailerProfile.phone || 'N/A'}</div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <strong>Website:</strong> <a href={selectedRetailerProfile.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-primary)', textDecoration: 'underline' }}>{selectedRetailerProfile.website || 'N/A'}</a>
                  </div>
                </div>
              </div>

              {/* RETAILER SPECIFIC SECTIONS */}
              {selectedRetailerProfile.role === 'retailer' && (
                <>
                  {/* Shipping/Mailing Info */}
                  <div style={{ background: 'rgba(255,255,255,0.01)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-glow)' }}>
                    <strong style={{ color: 'var(--gold-primary)', display: 'block', marginBottom: '10px' }}>📬 MAILING / SHIPPING ADDRESS</strong>
                    <div>
                      <strong>Recipient:</strong> {selectedRetailerProfile.shippingName || `${selectedRetailerProfile.firstName || 'Clark'} ${selectedRetailerProfile.lastName || 'Kent'}`}
                    </div>
                    <div style={{ marginTop: '5px' }}>
                      {selectedRetailerProfile.shippingAddress1}<br />
                      {selectedRetailerProfile.shippingAddress2 && <>{selectedRetailerProfile.shippingAddress2}<br /></>}
                      {selectedRetailerProfile.shippingCity}, {selectedRetailerProfile.shippingState} {selectedRetailerProfile.shippingZip}<br />
                      {selectedRetailerProfile.shippingCountry === 'US' ? 'United States' : selectedRetailerProfile.shippingCountry}
                    </div>
                  </div>

                  {/* Tax & Business Details */}
                  <div style={{ background: 'rgba(255,255,255,0.01)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-glow)' }}>
                    <strong style={{ color: 'var(--gold-primary)', display: 'block', marginBottom: '10px' }}>⚖️ BUSINESS & TAX DETAILS</strong>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div><strong>Years in Business:</strong> {selectedRetailerProfile.yearsInBusiness || 'N/A'} years</div>
                      <div><strong>Sales Channels:</strong> {(selectedRetailerProfile.salesChannels || []).join(', ') || 'N/A'}</div>
                      <div><strong>Tax ID / EIN:</strong> <span style={{ fontFamily: 'monospace', color: 'var(--gold-primary)' }}>{selectedRetailerProfile.taxId || 'N/A'}</span></div>
                      <div><strong>Resale Certificate:</strong> <span style={{ color: 'var(--green-primary)' }}>{selectedRetailerProfile.resaleCertificateFileName || 'N/A'}</span></div>
                    </div>
                  </div>

                  {/* Operational Stats */}
                  <div style={{ background: 'rgba(255,255,255,0.01)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-glow)' }}>
                    <strong style={{ color: 'var(--gold-primary)', display: 'block', marginBottom: '10px' }}>📊 PORTAL FINANCIALS</strong>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div><strong>Current Discount Level:</strong> {selectedRetailerProfile.tier === 'Tier III' ? '50%' : selectedRetailerProfile.tier === 'Tier II' ? '45%' : '40%'}</div>
                      <div><strong>Cycle Spending:</strong> ${Number(selectedRetailerProfile.totalCycleSpend || 0).toFixed(2)}</div>
                      <div><strong>Credit Balance:</strong> <span style={{ color: 'var(--green-primary)', fontWeight: 'bold' }}>${(selectedRetailerProfile.returnCreditBalance || 0).toFixed(2)}</span></div>
                      <div><strong>Returns Authorized:</strong> {selectedRetailerProfile.returnsUsed || 0}</div>
                    </div>
                  </div>

                  {(() => {
                    const retailerOrders = ordersList.filter(order => order.retailerId === selectedRetailerProfile.uid);
                    const totalCopies = retailerOrders.reduce((sum, order) => sum + (order.items || []).reduce((lineSum, item) => lineSum + Number(item.qty || 0), 0), 0);
                    const totalValue = retailerOrders.reduce((sum, order) => sum + Number(order.netTotal || 0), 0);
                    return (
                      <div style={{ background: 'rgba(255,255,255,0.01)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-glow)' }}>
                        <strong style={{ color: 'var(--gold-primary)', display: 'block', marginBottom: '6px' }}>🧾 COMPLETE ORDER HISTORY</strong>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', marginBottom: '12px', lineHeight: 1.45 }}>{retailerOrders.length} order{retailerOrders.length === 1 ? '' : 's'} · {totalCopies} copies · ${totalValue.toFixed(2)} total wholesale value.</p>
                        <div className="table-container">
                          <table className="premium-table" style={{ minWidth: '720px' }}>
                            <thead><tr><th>Sales Order</th><th>Date Placed</th><th style={{ textAlign: 'center' }}>Titles</th><th style={{ textAlign: 'center' }}>Copies</th><th style={{ textAlign: 'right' }}>Total</th><th>Payment</th><th>Status</th><th></th></tr></thead>
                            <tbody>
                              {retailerOrders.map(order => {
                                const copies = (order.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
                                return <tr key={order.orderId}><td><button type="button" className="table-link-button" style={{ fontFamily: 'monospace' }} onClick={() => handleOpenSalesOrder(order)}>{order.orderId}</button></td><td>{order.date ? new Date(order.date).toLocaleString() : '—'}</td><td style={{ textAlign: 'center' }}>{(order.items || []).length}</td><td style={{ textAlign: 'center' }}>{copies}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>${Number(order.netTotal || 0).toFixed(2)}</td><td><span className="badge badge-green">{order.paymentStatus || 'unknown'}</span></td><td><span className="badge badge-gold">{order.status || 'pending'}</span></td><td><button type="button" className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.7rem' }} onClick={() => handleOpenSalesOrder(order)}>View Sales Order</button></td></tr>;
                              })}
                              {!retailerOrders.length && <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>This retailer has not placed an order yet.</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

              {/* PUBLISHER SPECIFIC SECTIONS */}
              {selectedRetailerProfile.isPodClient && (
                <div style={{ background: 'var(--pod-green-glow)', padding: '15px', borderRadius: '8px', border: '1px solid var(--pod-green)' }}>
                  <strong style={{ color: 'var(--pod-green)', display: 'block', marginBottom: '10px' }}>POD ACCOUNT DETAILS</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px', lineHeight: 1.5 }}>
                    <div><strong>Customer Type:</strong> {selectedRetailerProfile.customerType || 'N/A'}</div>
                    <div><strong>Printing Frequency:</strong> {selectedRetailerProfile.printingFrequency || 'N/A'}</div>
                    <div><strong>Expected Quantities:</strong> {selectedRetailerProfile.expectedQuantity || 'N/A'}</div>
                    <div><strong>Page Counts:</strong> {selectedRetailerProfile.pageCountRange || 'N/A'}</div>
                    <div style={{ gridColumn: '1 / -1' }}><strong>Project Types:</strong> {selectedRetailerProfile.projectTypes || 'N/A'}</div>
                    <div style={{ gridColumn: '1 / -1' }}><strong>Fulfillment Needs:</strong> {selectedRetailerProfile.fulfillmentNeeds || 'N/A'}</div>
                    <div><strong>Tax Treatment:</strong> {selectedRetailerProfile.taxExempt ? 'Tax Exempt' : 'Tax Applies'}</div>
                    <div><strong>Certificate Status:</strong> {selectedRetailerProfile.resaleCertificateStatus || 'Not Submitted'}</div>
                    <div><strong>Certificate Number:</strong> {selectedRetailerProfile.resaleCertificateNumber || 'N/A'}</div>
                    <div><strong>Issuing State:</strong> {selectedRetailerProfile.resaleCertificateState || 'N/A'}</div>
                    <div><strong>Expiration:</strong> {selectedRetailerProfile.resaleCertificateExpiration || 'N/A'}</div>
                    <div><strong>Certificate File:</strong> {selectedRetailerProfile.resaleCertificateFileName || 'Not submitted'}</div>
                    {selectedRetailerProfile.resaleCertificateFileName && <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
                      <button type="button" className="btn pod-primary-button" style={{ marginTop: 0 }} onClick={() => handlePodTaxReview(selectedRetailerProfile, 'approved')}>Approve Tax Exemption</button>
                      <button type="button" className="btn btn-danger" onClick={() => handlePodTaxReview(selectedRetailerProfile, 'rejected')}>Reject Certificate</button>
                    </div>}
                  </div>
                </div>
              )}

              {selectedRetailerProfile.role === 'publisher' && !selectedRetailerProfile.isPodClient && (
                <>
                  <div style={{ background: 'rgba(255,255,255,0.01)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-glow)' }}>
                    <strong style={{ color: 'var(--gold-primary)', display: 'block', marginBottom: '10px' }}>🏢 COMPANY PROFILE</strong>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', lineHeight: 1.5 }}>
                      <div><strong>Primary Contact:</strong> {selectedRetailerProfile.contactName || [selectedRetailerProfile.firstName, selectedRetailerProfile.lastName].filter(Boolean).join(' ') || 'N/A'}</div>
                      <div><strong>Primary Phone:</strong> {selectedRetailerProfile.primaryPhone || selectedRetailerProfile.phone || 'N/A'}</div>
                      <div><strong>Publisher Email:</strong> {selectedRetailerProfile.publisherEmail || selectedRetailerProfile.email || 'N/A'}</div>
                      <div><strong>Form Response Email:</strong> {selectedRetailerProfile.formResponseEmail || 'N/A'}</div>
                      <div><strong>CC Email 1:</strong> {selectedRetailerProfile.ccEmail1 || 'N/A'}</div>
                      <div><strong>CC Email 2:</strong> {selectedRetailerProfile.ccEmail2 || 'N/A'}</div>
                      <div style={{ gridColumn: '1 / -1' }}><strong>Secondary Phone & Contact:</strong> {selectedRetailerProfile.secondaryPhoneAndContact || 'N/A'}</div>
                      <div style={{ gridColumn: '1 / -1', whiteSpace: 'pre-wrap' }}><strong>Mailing Address:</strong> {selectedRetailerProfile.mailingAddress || 'N/A'}</div>
                      <div style={{ gridColumn: '1 / -1', whiteSpace: 'pre-wrap' }}><strong>Outside Printer / Printing Provider:</strong> {selectedRetailerProfile.outsidePrinter || 'Philbo / not provided'}</div>
                      <div><strong>Facebook Group:</strong> {selectedRetailerProfile.facebookGroupStatus || 'N/A'}</div>
                      <div><strong>Imported Responses:</strong> {(selectedRetailerProfile.contactImportResponses || []).length || 'None'}</div>
                      {selectedRetailerProfile.publisherLogoUrl && <div style={{ gridColumn: '1 / -1' }}><strong>Publisher Logo:</strong> <a href={selectedRetailerProfile.publisherLogoUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--gold-primary)', textDecoration: 'underline' }}>Open logo file</a></div>}
                      {selectedRetailerProfile.contactImportReviewNeeded && <div style={{ gridColumn: '1 / -1', color: 'var(--red-primary)', fontWeight: 700 }}>NEEDS ADMIN REVIEW: {(selectedRetailerProfile.contactImportReviewNotes || []).join(' ')}</div>}
                    </div>
                  </div>

                  {(() => {
                    const publisherTitles = [...getPublisherTitles(selectedRetailerProfile)].sort((left, right) => {
                      const dateDifference = String(right.catalogDate || right.focDate || '').localeCompare(String(left.catalogDate || left.focDate || ''));
                      return dateDifference || String(left.title || '').localeCompare(String(right.title || ''));
                    });
                    const liveCount = publisherTitles.filter(title => isTitlePublished(title.status)).length;
                    const archivedCount = publisherTitles.filter(title => title.status === 'Archived').length;
                    const inactiveCount = publisherTitles.length - liveCount;
                    return (
                      <div style={{ background: 'rgba(255,255,255,0.01)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-glow)' }}>
                        <strong style={{ color: 'var(--gold-primary)', display: 'block', marginBottom: '6px' }}>📚 COMPLETE TITLE HISTORY</strong>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', marginBottom: '12px', lineHeight: 1.45 }}>{publisherTitles.length} total title record{publisherTitles.length === 1 ? '' : 's'} · {liveCount} active/live · {inactiveCount} not active · {archivedCount} archived/past. Drafts, listings under review, approved listings, live books, and archived books all remain visible here.</p>
                        <div className="table-container">
                          <table className="premium-table publisher-title-history-table" style={{ minWidth: '1180px' }}>
                            <thead><tr><th>Book</th><th>Identifiers</th><th>Status</th><th>Catalog</th><th>FOC</th><th>In Store</th><th>Format</th><th style={{ textAlign: 'right' }}>MSRP</th><th></th></tr></thead>
                            <tbody>
                              {publisherTitles.map(title => {
                                const cycle = cyclesList.find(item => item.cycleId === title.cycleId);
                                const isActive = isTitlePublished(title.status);
                                return (
                                  <tr key={title.titleId}>
                                    <td><div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '230px' }}>{title.coverUrl ? <img src={title.coverUrl} alt="" style={{ width: '38px', height: '56px', objectFit: 'cover', border: '1px solid var(--border-glow)', flex: '0 0 auto' }} /> : <div style={{ width: '38px', height: '56px', border: '1px solid var(--border-glow)', background: 'rgba(255,255,255,0.03)', flex: '0 0 auto' }} />}<div><button type="button" className="table-link-button" onClick={() => { setSelectedRetailerProfile(null); handleOpenInventoryTitle(title); }}>{title.title}</button><div className="pull-code-secondary">{[title.seriesName, title.issueNumber ? `Issue ${title.issueNumber}` : '', title.variantNumber ? `Variant ${title.variantNumber}` : ''].filter(Boolean).join(' · ') || 'Single title'}</div></div></div></td>
                                    <td><code>{title.philboId || 'Pending PHILBO ID'}</code><div className="pull-code-secondary">{title.barcode || 'No UPC / ISBN / EAN'}</div></td>
                                    <td><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '5px' }}><span className={`badge ${isActive ? 'badge-green' : title.status === 'Archived' || title.status === 'Changes Requested' || title.status === 'Rejected' ? 'badge-red' : 'badge-gold'}`}>{getTitleStatusLabel(title.status)}</span><span style={{ color: isActive ? 'var(--green-primary)' : 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{isActive ? 'Active' : 'Not Active'}</span></div></td>
                                    <td>{title.catalogDate || cycle?.catalogDate || 'TBA'}<div className="pull-code-secondary">{cycle?.cycleName || title.catalogCycleName || title.cycleId || 'Unassigned'}</div></td>
                                    <td>{title.focDate || 'TBA'}</td>
                                    <td>{title.releaseDate || 'TBA'}</td>
                                    <td>{title.bookFormat || 'Not recorded'}<div className="pull-code-secondary">{title.pageCount ? `${title.pageCount} pages` : 'Page count not recorded'}</div></td>
                                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{Number(title.msrp || 0) > 0 ? `$${Number(title.msrp).toFixed(2)}` : 'TBA'}</td>
                                    <td><button type="button" className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.7rem' }} onClick={() => { setSelectedRetailerProfile(null); handleOpenInventoryTitle(title); }}>View Listing</button></td>
                                  </tr>
                                );
                              })}
                              {!publisherTitles.length && <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No title records are associated with this publisher yet.</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                  {/* Commission Cut Administration */}
                  <div style={{ background: 'rgba(255,255,255,0.01)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-glow)' }}>
                    <strong style={{ color: 'var(--gold-primary)', display: 'block', marginBottom: '10px' }}>💰 COMMISSION RATE CONTROL</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <label style={{ color: 'var(--text-secondary)' }}>Assign Cut:</label>
                      <select
                        style={{ padding: '8px 16px', background: 'var(--bg-deep)', border: '1px solid var(--border-glow)', borderRadius: '6px', color: '#fff' }}
                        value={selectedRetailerProfile.commissionRate || 0.10}
                        onChange={(e) => {
                          const updated = db.updatePublisherCommission(selectedRetailerProfile.uid, e.target.value, user.email);
                          setUsersList(db.getUsers());
                          setSelectedRetailerProfile(updated);
                          setToast('Publisher commission rate successfully updated!');
                          setTimeout(() => setToast(null), 3000);
                        }}
                      >
                        <option value="0.05">5% Commission Rate</option>
                        <option value="0.10">10% Commission Rate</option>
                      </select>
                    </div>
                  </div>

                  {/* Commission History Logs */}
                  <div style={{ background: 'rgba(255,255,255,0.01)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-glow)' }}>
                    <strong style={{ color: 'var(--gold-primary)', display: 'block', marginBottom: '10px' }}>📜 COMMISSION CHANGE LOGS</strong>
                    {(!selectedRetailerProfile.commissionHistory || selectedRetailerProfile.commissionHistory.length === 0) ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No historical commission changes recorded.</div>
                    ) : (
                      <div className="table-container" style={{ border: 'none' }}>
                        <table className="premium-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th style={{ textAlign: 'center' }}>Prev</th>
                              <th style={{ textAlign: 'center' }}>New</th>
                              <th>Admin User</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedRetailerProfile.commissionHistory.map((h, i) => (
                              <tr key={i}>
                                <td>{new Date(h.date).toLocaleDateString()}</td>
                                <td style={{ textAlign: 'center' }}>{(h.prevRate * 100).toFixed(0)}%</td>
                                <td style={{ textAlign: 'center', color: 'var(--gold-primary)', fontWeight: 'bold' }}>{(h.newRate * 100).toFixed(0)}%</td>
                                <td>{h.adminUser}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}

            </div>

            <div style={{ borderTop: '1px solid var(--border-glow)', paddingTop: '15px', display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn btn-primary" onClick={() => setSelectedRetailerProfile(null)}>
                Done
              </button>
            </div>

          </div>
        </div>
      , document.body)}
      {catalogPrintCycleId && (
        <CatalogPrintPreview
          cycle={cyclesList.find(cycle => cycle.cycleId === catalogPrintCycleId)}
          titles={titlesList.filter(title => title.cycleId === catalogPrintCycleId && isTitlePublished(title.status))}
          onClose={() => setCatalogPrintCycleId('')}
        />
      )}
      {catalogTemplateCycleId && (() => {
        const cycleTitles = titlesList.filter(title => title.cycleId === catalogTemplateCycleId && isTitlePublished(title.status));
        const representativeTitle = cycleTitles.find(title => title.coverUrl && title.publisherLogoUrl && title.interiorImageUrl && title.description) || cycleTitles[0];
        return (
          <CatalogPrintPreview
            cycle={cyclesList.find(cycle => cycle.cycleId === catalogTemplateCycleId)}
            titles={representativeTitle ? [representativeTitle] : []}
            templateOnly
            onClose={() => setCatalogTemplateCycleId('')}
          />
        );
      })()}
      {catalogBuilderCycleId && (() => {
        const cycle = cyclesList.find(item => item.cycleId === catalogBuilderCycleId);
        const cycleTitles = titlesList.filter(title => title.cycleId === catalogBuilderCycleId && isTitlePublished(title.status));
        return (
          <CatalogCoverBuilder
            cycle={cycle}
            titles={cycleTitles}
            canCompile={user.role === 'moos'}
            onClose={() => setCatalogBuilderCycleId('')}
            onCompile={coverDraft => {
              setCatalogCompilation({ cycleId: catalogBuilderCycleId, coverDraft });
              setCatalogBuilderCycleId('');
            }}
          />
        );
      })()}
      {catalogCompilation && (
        <CatalogPrintPreview
          cycle={cyclesList.find(cycle => cycle.cycleId === catalogCompilation.cycleId)}
          titles={titlesList.filter(title => title.cycleId === catalogCompilation.cycleId && isTitlePublished(title.status))}
          coverDraft={catalogCompilation.coverDraft}
          onClose={() => setCatalogCompilation(null)}
        />
      )}
    </div>
  </div>
);
}
