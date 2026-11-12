import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase-mock';
import CatalogProductDetail from './CatalogProductDetail';
import {
  addRetailerOrderLines,
  countRetailerOrderItems,
  getPublisherFollowKey,
  getRetailerOrderMsrpSubtotal,
  getRetailerTierProgress,
  getRetailerTitleKey,
  normalizeQuantityMap
} from '../lib/retailer-order';
import {
  capIncentiveQuantities,
  getIncentiveEligibility,
  validateIncentiveQuantities
} from '../lib/incentive-variants';
import { csvRowsToOrderLines } from '../lib/csv-order';
import { selectCurrentRetailerCatalogCycle } from '../lib/catalog-workflow';
import { loadPublishedCatalogTitles, loadRetailerOrders, loadRetailerPublisherFollows, loadRetailerReturnPortal, setRetailerPublisherFollow, startStripeCheckout, submitRetailerReturn, updateRetailerAccountProfile } from '../lib/backend';
import { runtimeConfig } from '../lib/runtime-config';
import { buildLiveRetailerCatalogCycles, generateLiveRetailerCatalogCsv } from '../lib/retailer-csv';

const normalizeOrderIdentifier = (value) => String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
const getTitleAvailability = title => {
  if (title.availabilityStatus) return String(title.availabilityStatus);
  if (title.unavailable) return 'Unavailable';
  if (title.backorder) return 'Backorder';
  return title.focLocked && !title.availableForReorder ? 'Closed' : 'Available';
};
const getTitleReleaseStatus = title => {
  if (title.releaseStatus) return String(title.releaseStatus);
  if (!title.releaseDate) return 'TBA';
  return new Date(`${title.releaseDate}T23:59:59`) < new Date() ? 'Released' : 'Upcoming';
};
const isTitleReturnable = title => title.returnable !== false && String(title.returnableStatus || title.returnable || 'Returnable').toLowerCase() !== 'non-returnable';
const hasTitlePromotion = title => Boolean(title.promotion || title.promotionName || title.incentiveRatio);
const displayDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBA';
const getCatalogDate = title => title.catalogDate || '';
const startOfToday = () => {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
};
const releaseDateValue = title => title.releaseDate ? new Date(`${title.releaseDate}T12:00:00`) : null;
const isInReleaseWindow = (title, windowValue, today = startOfToday()) => {
  if (windowValue === 'all') return true;
  const releaseDate = releaseDateValue(title);
  if (!releaseDate || releaseDate < today) return false;
  if (windowValue === 'upcoming') return true;
  const days = Number(windowValue);
  const finalDay = new Date(today);
  finalDay.setDate(finalDay.getDate() + Math.max(0, days - 1));
  finalDay.setHours(23, 59, 59, 999);
  return releaseDate <= finalDay;
};
const releaseWindowRange = (days, today = startOfToday()) => {
  const finalDay = new Date(today);
  finalDay.setDate(finalDay.getDate() + days - 1);
  const shortDate = value => value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${shortDate(today)}–${shortDate(finalDay)}`;
};
const retailerProfileFromUser = user => ({
  companyName: user.companyName || '',
  contactName: user.contactName || user.shippingName || '',
  primaryPhone: user.primaryPhone || user.phone || '',
  website: user.website || '',
  shippingAddress1: user.shippingAddress1 || user.addressLine1 || '',
  shippingAddress2: user.shippingAddress2 || user.addressLine2 || '',
  shippingCity: user.shippingCity || user.city || '',
  shippingState: user.shippingState || user.stateProvince || '',
  shippingZip: user.shippingZip || user.postalCode || '',
  shippingCountry: user.shippingCountry || user.country || 'US',
  taxId: user.taxId || '',
  resaleCertificateNumber: user.resaleCertificateNumber || '',
  resaleCertificateState: user.resaleCertificateState || '',
  resaleCertificateExpiration: user.resaleCertificateExpiration || ''
});

export default function RetailerPortal({ user, onSessionUpdate, activeSection = 'dashboard', setActiveSection }) {
  const paymentsEnabled = runtimeConfig.VITE_ENABLE_PAYMENTS === 'true';
  const [titles, setTitles] = useState(() => db.getTitles().map(title => ({
    ...title,
    titleId: getRetailerTitleKey(title)
  })).filter(t =>
    t.coverUrl && 
    t.focDate && 
    t.releaseDate
  ));
  const [orders, setOrders] = useState(() => user.authProvider === 'supabase' ? [] : db.getOrders().filter(o => o.retailerId === user.uid));
  const [returns, setReturns] = useState(() => user.authProvider === 'supabase' ? [] : db.getReturns().filter(r => r.retailerId === user.uid));
  const [liveReturnPortal, setLiveReturnPortal] = useState(null);
  const cartStorageKey = `philbo_cart_${user.uid}`;
  const [cart, setCart] = useState(() => {
    try { return normalizeQuantityMap(JSON.parse(localStorage.getItem(cartStorageKey))); } catch (error) { return {}; }
  });
  const [bulkOrderText, setBulkOrderText] = useState('');
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkOrderFilename, setBulkOrderFilename] = useState('');
  const [fastEntryExpanded, setFastEntryExpanded] = useState(false);
  const [catalogQuantities, setCatalogQuantities] = useState({});
  const [recentlyAddedTitleId, setRecentlyAddedTitleId] = useState('');
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [followedPublisherKeys, setFollowedPublisherKeys] = useState(() =>
    Array.isArray(user.followedPublisherKeys) ? user.followedPublisherKeys : []
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadStatusFilter, setDownloadStatusFilter] = useState('Current');
  const [downloadYearFilter, setDownloadYearFilter] = useState('all');
  const [downloadMonthFilter, setDownloadMonthFilter] = useState('all');
  const [retailerProfileForm, setRetailerProfileForm] = useState(() => retailerProfileFromUser(user));
  const [retailerCertificateFile, setRetailerCertificateFile] = useState(null);
  const [retailerProfileMessage, setRetailerProfileMessage] = useState('');
  const [retailerProfileSaving, setRetailerProfileSaving] = useState(false);
  
  // Advanced Catalog filters
  const [publisherFilter, setPublisherFilter] = useState('all');
  const [focFilter, setFocFilter] = useState('all'); // 'all' | 'open' | 'locked'
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [formatFilter, setFormatFilter] = useState('all');
  const [returnableFilter, setReturnableFilter] = useState('all');
  const [releaseFilter, setReleaseFilter] = useState('all');
  const [catalogDateFilters, setCatalogDateFilters] = useState([]);
  const [focDateFilters, setFocDateFilters] = useState([]);
  const [inStoreDateFilters, setInStoreDateFilters] = useState([]);
  const [promotionFilter, setPromotionFilter] = useState('all');
  const [releasePlanningWindow, setReleasePlanningWindow] = useState('all');
  const [catalogSort, setCatalogSort] = useState('stock');
  const [catalogPage, setCatalogPage] = useState(1);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Return credit toggle state
  const [applyCredit, setApplyCredit] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCouponCode, setAppliedCouponCode] = useState('');
  const [couponMessage, setCouponMessage] = useState('');

  // Return form state
  const [returnSelectionKey, setReturnSelectionKey] = useState('');
  const [returnQty, setReturnQty] = useState('');
  const [returnReason, setReturnReason] = useState('');

  const [isPaying, setIsPaying] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [returnError, setReturnError] = useState('');
  const [returnSuccess, setReturnSuccess] = useState(false);

  // Feedback Toast state
  const [toast, setToast] = useState(null);

  // Selected title details dialog
  const [selectedDetailTitle, setSelectedDetailTitle] = useState(null);
  const [detailQuantity, setDetailQuantity] = useState(1);

  useEffect(() => {
    if (!selectedOrderDetail) return undefined;
    const closeOrderDetailOnEscape = event => {
      if (event.key === 'Escape') setSelectedOrderDetail(null);
    };
    document.addEventListener('keydown', closeOrderDetailOnEscape);
    return () => document.removeEventListener('keydown', closeOrderDetailOnEscape);
  }, [selectedOrderDetail]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (checkout === 'success') {
      setCart({});
      localStorage.removeItem(cartStorageKey);
      setToast({ type: 'success', message: 'Payment received. Your Stripe confirmation and Philbo order record are being finalized.' });
    } else if (checkout === 'cancelled') {
      setToast({ type: 'error', message: 'Checkout was cancelled. Your order was not charged.' });
    }
    if (checkout) {
      params.delete('checkout');
      params.delete('session_id');
      const nextQuery = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`);
    }
  }, [cartStorageKey]);

  useEffect(() => {
    if (user.authProvider !== 'supabase') return undefined;
    let active = true;
    Promise.all([loadPublishedCatalogTitles(), loadRetailerOrders(), loadRetailerReturnPortal(), loadRetailerPublisherFollows()])
      .then(([catalogTitles, retailerOrders, returnPortal, publisherFollows]) => {
        if (!active) return;
        setTitles(catalogTitles.map(title => ({ ...title, titleId: getRetailerTitleKey(title) })));
        setOrders(retailerOrders);
        setLiveReturnPortal(returnPortal);
        setReturns(returnPortal.returns);
        setFollowedPublisherKeys(publisherFollows);
      })
      .catch(error => {
        if (active) setToast(error.message || 'The retailer catalog could not be loaded.');
      });
    return () => { active = false; };
  }, [user.authProvider, user.uid]);

  useEffect(() => {
    if (user.authProvider === 'supabase') return undefined;

    const refreshRetailerCatalog = () => {
      const catalogTitles = db.getTitles(user).map(title => ({
        ...title,
        titleId: getRetailerTitleKey(title)
      })).filter(title => title.focDate && title.releaseDate);
      setTitles(catalogTitles);
      setOrders(db.getOrders(user).filter(order => order.retailerId === user.uid));
      setReturns(db.getReturns(user).filter(ret => ret.retailerId === user.uid));
    };

    const handleStorageChange = event => {
      if (!event.key || ['philbo_titles', 'philbo_catalog_cycles', 'philbo_orders', 'philbo_returns'].includes(event.key)) {
        refreshRetailerCatalog();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshRetailerCatalog();
    };

    refreshRetailerCatalog();
    window.addEventListener('focus', refreshRetailerCatalog);
    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', refreshRetailerCatalog);
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user.authProvider, user.uid, user.role, activeSection]);

  useEffect(() => {
    localStorage.setItem(cartStorageKey, JSON.stringify(cart));
  }, [cart, cartStorageKey]);

  useEffect(() => {
    setFollowedPublisherKeys(Array.isArray(user.followedPublisherKeys) ? user.followedPublisherKeys : []);
  }, [user.followedPublisherKeys]);

  useEffect(() => {
    setCatalogPage(1);
  }, [searchTerm, publisherFilter, focFilter, availabilityFilter, formatFilter, returnableFilter, releaseFilter, catalogDateFilters, focDateFilters, inStoreDateFilters, promotionFilter, releasePlanningWindow, catalogSort]);

  // Reload lists when orders/returns change
  const refreshData = async () => {
    if (user.authProvider === 'supabase') {
      const returnPortal = await loadRetailerReturnPortal();
      setLiveReturnPortal(returnPortal);
      setReturns(returnPortal.returns);
      return;
    }
    setOrders(db.getOrders().filter(o => o.retailerId === user.uid));
    setReturns(db.getReturns().filter(r => r.retailerId === user.uid));
  };

  // Calculate current cart MSRP subtotal to dynamically resolve active tier
  const tempMsrpSubtotal = getRetailerOrderMsrpSubtotal(cart, titles);

  // Resolve active tier based on cart MSRP subtotal, falling back to profile tier if empty
  let activeTier = user.tier || 'Tier I';
  let discount = db.getRetailerDiscount(activeTier);

  if (tempMsrpSubtotal > 0) {
    if (tempMsrpSubtotal >= 251) {
      activeTier = 'Tier III';
      discount = 0.50;
    } else if (tempMsrpSubtotal >= 101) {
      activeTier = 'Tier II';
      discount = 0.45;
    } else {
      activeTier = 'Tier I';
      discount = 0.40;
    }
  }

  const returnAllowance = user.authProvider === 'supabase'
    ? (liveReturnPortal?.allowance || { maximum: db.getReturnAllowance(user.tier), approved: 0, pending: 0, remaining: 0 })
    : db.getReturnAllowanceSummary(user.uid);
  const eligibleReturnItems = user.authProvider === 'supabase' ? (liveReturnPortal?.eligibleItems || []) : db.getEligibleReturnItems(user.uid);
  const selectedReturnItem = eligibleReturnItems.find(item => item.key === returnSelectionKey);
  const returnsRemaining = returnAllowance.remaining;
  const creditBalance = user.authProvider === 'supabase' ? (liveReturnPortal?.creditBalance || 0) : (user.returnCreditBalance || 0);

  const addLinesToCurrentOrder = lines => {
    setCart(previous => {
      const requested = addRetailerOrderLines(previous, lines);
      const next = capIncentiveQuantities(requested, titles);
      const itemCount = countRetailerOrderItems(next);
      localStorage.setItem(cartStorageKey, JSON.stringify(next));
      const capped = lines.some(({ title }) => (requested[getRetailerTitleKey(title)] || 0) !== (next[getRetailerTitleKey(title)] || 0));
      setToast(capped
        ? `Current Order has ${itemCount} item${itemCount === 1 ? '' : 's'}. Incentive-cover quantities were limited to what the qualifying regular copies unlock.`
        : `Current Order now has ${itemCount} item${itemCount === 1 ? '' : 's'}.`);
      return next;
    });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAddToCart = (title, quantity = 1) => {
    if (!getRetailerTitleKey(title)) {
      setToast('This title is missing its ordering ID. Please contact Philbo support.');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    const safeQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);
    const eligibility = getIncentiveEligibility(title, titles, cart);
    if (eligibility) {
      const alreadyOrdered = cart[getRetailerTitleKey(title)] || 0;
      const remaining = Math.max(0, eligibility.maximumQuantity - alreadyOrdered);
      if (!remaining) {
        setToast(`Order ${eligibility.qualifyingQuantity} qualifying regular copies to unlock ${eligibility.awardQuantity} of this special cover.`);
        setTimeout(() => setToast(null), 4000);
        return;
      }
    }
    addLinesToCurrentOrder([{ title, quantity: safeQuantity }]);
    setRecentlyAddedTitleId(title.titleId);
    setTimeout(() => setRecentlyAddedTitleId(previous => previous === title.titleId ? '' : previous), 2200);
  };

  const handleCatalogQuantityChange = (titleId, value) => {
    const quantity = Math.min(999, Math.max(1, Number.parseInt(value, 10) || 1));
    setCatalogQuantities(previous => ({ ...previous, [titleId]: quantity }));
  };

  const handleTogglePublisherFollow = async title => {
    const publisherKey = getPublisherFollowKey(title);
    if (!publisherKey) {
      setToast('This publisher is missing its account ID. Please contact Philbo support.');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    const isFollowing = followedPublisherKeys.includes(publisherKey);
    const next = isFollowing
      ? followedPublisherKeys.filter(key => key !== publisherKey)
      : [...followedPublisherKeys, publisherKey];
    try {
      if (user.authProvider === 'supabase') {
        await setRetailerPublisherFollow(publisherKey, !isFollowing);
        setFollowedPublisherKeys(next);
        setToast(isFollowing ? `No longer following ${title.publisherName}.` : `Following ${title.publisherName}. New listings will appear on your dashboard.`);
        setTimeout(() => setToast(null), 3500);
        return;
      }
      const updatedUser = db.updateRetailerPublisherFollows(next);
      setFollowedPublisherKeys(next);
      onSessionUpdate?.(updatedUser);
      setToast(isFollowing ? `No longer following ${title.publisherName}.` : `Following ${title.publisherName}. New listings will appear on your dashboard.`);
    } catch (error) {
      setToast(error.message || 'Publisher follow could not be updated.');
    }
    setTimeout(() => setToast(null), 3500);
  };

  const handleRetailerProfileChange = event => {
    const { name, value } = event.target;
    setRetailerProfileForm(current => ({ ...current, [name]: value }));
  };

  const handleRetailerProfileSave = async event => {
    event.preventDefault();
    setRetailerProfileSaving(true);
    setRetailerProfileMessage('');
    try {
      const changes = {
        ...retailerProfileForm,
        resaleCertificateFileName: retailerCertificateFile?.name || '',
        resaleCertificateFileSize: retailerCertificateFile?.size || 0
      };
      const updatedUser = user.authProvider === 'supabase'
        ? await updateRetailerAccountProfile(retailerProfileForm, retailerCertificateFile)
        : db.updateRetailerProfile(user.uid, changes);
      setRetailerProfileForm(retailerProfileFromUser(updatedUser));
      setRetailerCertificateFile(null);
      onSessionUpdate?.(updatedUser);
      setRetailerProfileMessage(retailerCertificateFile
        ? 'Store information saved. Your resale certificate is pending review.'
        : 'Store information saved.');
    } catch (error) {
      setRetailerProfileMessage(error.message || 'Store information could not be saved.');
    } finally {
      setRetailerProfileSaving(false);
    }
  };

  const openTitleDetails = item => {
    setDetailQuantity(1);
    setSelectedDetailTitle(item);
  };

  const addDetailTitleToOrder = () => {
    if (!selectedDetailTitle || selectedDetailTitle.focLocked) return;
    const eligibility = getIncentiveEligibility(selectedDetailTitle, titles, cart);
    if (eligibility && eligibility.maximumQuantity < 1) {
      setToast(`Order ${eligibility.qualifyingQuantity} qualifying regular copies to unlock this special cover.`);
      setTimeout(() => setToast(null), 4000);
      return;
    }
    addLinesToCurrentOrder([{ title: selectedDetailTitle, quantity: detailQuantity }]);
    setSelectedDetailTitle(null);
  };

  const handleQtyChange = (titleId, val) => {
    const qty = parseInt(val) || 0;
    setCart(previous => {
      const next = { ...previous };
      if (qty <= 0) delete next[titleId];
      else next[titleId] = qty;
      const capped = capIncentiveQuantities(next, titles);
      localStorage.setItem(cartStorageKey, JSON.stringify(capped));
      return capped;
    });
  };

  const buildBulkPreview = rawLines => {
    const seen = new Set();
    const preview = rawLines.map((entry, index) => {
      const line = typeof entry === 'string' ? entry : '';
      let parts = line ? line.split(/[\t,;]+/).map(part => part.trim()).filter(Boolean) : [];
      if (line && parts.length === 1) parts = line.split(/\s+/).filter(Boolean);
      const possibleQty = typeof entry === 'string' ? (parts.length > 1 ? parts[parts.length - 1] : '1') : String(entry.qty || '');
      const qtyValid = /^\d+$/.test(possibleQty) && Number(possibleQty) > 0;
      const qty = qtyValid ? Math.min(999, Number.parseInt(possibleQty, 10)) : 0;
      const rawCode = typeof entry === 'string'
        ? (/^\d+$/.test(possibleQty) && parts.length > 1 ? parts.slice(0, -1).join('') : parts[0])
        : entry.rawCode;
      const code = normalizeOrderIdentifier(rawCode);
      const match = titles.find(title => [title.philboId, title.barcode, title.isbn, title.upc, title.ean].some(value => normalizeOrderIdentifier(value) === code));
      const duplicate = seen.has(code);
      seen.add(code);
      return {
        line: typeof entry === 'string' ? index + 1 : entry.line,
        rawCode,
        qty,
        title: match || null,
        status: !qtyValid ? 'invalid-qty' : !match ? 'not-found' : duplicate ? 'duplicate' : match.focLocked ? 'locked' : 'valid'
      };
    });
    setBulkPreview(preview);
  };

  const handlePreviewBulkOrder = () => {
    buildBulkPreview(bulkOrderText.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
  };

  const handleCsvOrderUpload = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setToast('Please choose a .csv file.');
      event.target.value = '';
      setTimeout(() => setToast(null), 3000);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const lines = csvRowsToOrderLines(reader.result);
      setBulkOrderFilename(file.name);
      buildBulkPreview(lines);
      if (!lines.length) {
        setToast('No quantities were entered in that catalog CSV. Add quantities, save the file, and upload it again.');
        setTimeout(() => setToast(null), 3000);
      }
    };
    reader.onerror = () => {
      setToast('The CSV could not be read. Please try again.');
      setTimeout(() => setToast(null), 3000);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const addBulkPreviewToCurrentOrder = () => {
    const validRows = bulkPreview.filter(row => row.status === 'valid' && row.title);
    if (!validRows.length) {
      setToast('No valid open titles are ready to add.');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    addLinesToCurrentOrder(validRows.map(row => ({ title: row.title, quantity: row.qty })));
  };

  // Cart math
  let msrpSubtotal = 0;
  let netSubtotal = 0;
  const cartItemsList = [];

  Object.keys(cart).forEach(titleId => {
    const titleObj = titles.find(t => t.titleId === titleId);
    if (titleObj) {
      const qty = cart[titleId];
      const wholesalePrice = parseFloat((titleObj.msrp * (1 - discount)).toFixed(2));
      const lineMsrp = titleObj.msrp * qty;
      const lineNet = wholesalePrice * qty;
      msrpSubtotal += lineMsrp;
      netSubtotal += lineNet;
      
      cartItemsList.push({
        ...titleObj,
        qty,
        wholesalePrice
      });
    }
  });

  const discountTotal = parseFloat((msrpSubtotal - netSubtotal).toFixed(2));
  msrpSubtotal = parseFloat(msrpSubtotal.toFixed(2));

  const couponQuote = appliedCouponCode
    ? db.validateRetailerCoupon(appliedCouponCode, netSubtotal)
    : { valid: false, discountAmount: 0 };
  const couponDiscount = couponQuote.valid ? couponQuote.discountAmount : 0;

  // Return credit deductions
  const afterCouponTotal = Math.max(0, netSubtotal - couponDiscount);
  const creditUsed = applyCredit ? Math.min(creditBalance, afterCouponTotal) : 0;
  const finalNetTotal = parseFloat((afterCouponTotal - creditUsed).toFixed(2));

  const handleApplyCoupon = () => {
    const normalizedCode = couponCode.trim().toUpperCase();
    if (!normalizedCode) {
      setCouponMessage('Enter a coupon code first.');
      return;
    }
    const quote = db.validateRetailerCoupon(normalizedCode, netSubtotal);
    if (!quote.valid) {
      setAppliedCouponCode('');
      setCouponMessage(quote.message || 'That coupon code is not recognized.');
      return;
    }
    setAppliedCouponCode(normalizedCode);
    setCouponMessage(`${normalizedCode} applied: ${quote.label}.`);
  };

  const handleRemoveCoupon = () => {
    setAppliedCouponCode('');
    setCouponCode('');
    setCouponMessage('');
  };

  const handleStripeCheckout = async () => {
    setIsPaying(true);
    setOrderError('');
    try {
      const incentiveErrors = validateIncentiveQuantities(cart, titles);
      if (incentiveErrors.length) throw new Error('One or more special-cover quantities exceed the regular copies that unlock them.');
      if (user.authProvider !== 'supabase') throw new Error('Live checkout requires a real retailer account.');
      const url = await startStripeCheckout({
        items: cartItemsList.map(item => ({ titleId: item.titleId || item.id, quantity: item.qty })),
        applyCredit,
        couponCode: appliedCouponCode
      });
      window.location.assign(url);
    } catch (err) {
      setIsPaying(false);
      setOrderError(err.message || 'Secure checkout could not be opened.');
    }
  };

  const handleBetaOrderSubmit = () => {
    setOrderError('');
    try {
      const incentiveErrors = validateIncentiveQuantities(cart, titles);
      if (incentiveErrors.length) throw new Error('One or more special-cover quantities exceed the regular copies that unlock them.');
      db.placeOrder(user.uid, user.companyName, cartItemsList, activeTier, applyCredit, appliedCouponCode, 'pending');
      setCart({});
      setApplyCredit(false);
      handleRemoveCoupon();
      refreshData();
      const updatedUser = db.getUsers().find(u => u.uid === user.uid);
      onSessionUpdate(updatedUser);
      setToast({ type: 'success', message: 'Beta order submitted. No payment was collected.' });
    } catch (err) {
      setOrderError(err.message || 'The beta order could not be submitted.');
    }
  };

  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    setReturnError('');
    setReturnSuccess(false);

    if (!returnSelectionKey || !returnQty || !returnReason) {
      setReturnError('Please fill out all return fields.');
      return;
    }

    const returnItem = eligibleReturnItems.find(item => item.key === returnSelectionKey);
    if (!returnItem) {
      setReturnError('That purchase is no longer eligible for return. Please choose another order line.');
      return;
    }

    try {
      if (user.authProvider === 'supabase') {
        await submitRetailerReturn({ salesOrderItemId: returnItem.salesOrderItemId, quantity: returnQty, reason: returnReason });
      } else {
        db.requestReturn(user.uid, user.companyName, returnItem.orderId, returnItem.titleId, returnQty, returnReason);
      }
      setReturnQty('');
      setReturnReason('');
      setReturnSelectionKey('');
      setReturnSuccess(true);
      await refreshData();
    } catch (err) {
      setReturnError(err.message || 'Return request failed.');
    }
  };

  // Filtering Logic
  const filteredTitles = titles.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.publisherName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          [t.philboId, t.barcode, t.isbn, t.upc, t.ean].some(value => String(value || '').toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesPublisher = publisherFilter === 'all' || t.publisherName === publisherFilter;
    const matchesFoc = focFilter === 'all' || 
                       (focFilter === 'open' && !t.focLocked) || 
                       (focFilter === 'locked' && t.focLocked);
    
    const availability = getTitleAvailability(t);
    const releaseStatus = getTitleReleaseStatus(t);
    const matchesAvailability = availabilityFilter === 'all' || availability === availabilityFilter;
    const matchesFormat = formatFilter === 'all' || (t.bookFormat || 'Not specified') === formatFilter;
    const matchesReturnable = returnableFilter === 'all' || (returnableFilter === 'returnable' ? isTitleReturnable(t) : !isTitleReturnable(t));
    const matchesRelease = releaseFilter === 'all' || releaseStatus === releaseFilter;
    const matchesCatalogDate = !catalogDateFilters.length || catalogDateFilters.includes(getCatalogDate(t));
    const matchesFocDate = !focDateFilters.length || focDateFilters.includes(t.focDate);
    const matchesInStoreDate = !inStoreDateFilters.length || inStoreDateFilters.includes(t.releaseDate);
    const matchesPromotion = promotionFilter === 'all' || (promotionFilter === 'promoted' ? hasTitlePromotion(t) : !hasTitlePromotion(t));
    const matchesReleasePlanningWindow = isInReleaseWindow(t, releasePlanningWindow);

    return matchesSearch && matchesPublisher && matchesFoc && matchesAvailability && matchesFormat && matchesReturnable && matchesRelease && matchesCatalogDate && matchesFocDate && matchesInStoreDate && matchesPromotion && matchesReleasePlanningWindow;
  }).sort((a, b) => {
    if (releasePlanningWindow !== 'all') return String(a.releaseDate || '9999').localeCompare(String(b.releaseDate || '9999')) || String(a.title || '').localeCompare(String(b.title || ''));
    if (catalogSort === 'publisher') return String(a.publisherName || '').localeCompare(String(b.publisherName || '')) || String(a.title || '').localeCompare(String(b.title || ''));
    if (catalogSort === 'foc') return String(a.focDate || '9999').localeCompare(String(b.focDate || '9999'));
    if (catalogSort === 'in-store') return String(a.releaseDate || '9999').localeCompare(String(b.releaseDate || '9999'));
    if (catalogSort === 'stock') return String(a.philboId || '').localeCompare(String(b.philboId || ''));
    return String(a.title || '').localeCompare(String(b.title || ''));
  });

  // Extract unique publisher names for filter dropdown
  const publishers = Array.from(new Set(titles.map(t => t.publisherName)));
  const formats = Array.from(new Set(titles.map(t => t.bookFormat || 'Not specified'))).sort();
  const availabilityStates = Array.from(new Set(titles.map(getTitleAvailability))).sort();
  const catalogCycles = user.authProvider === 'supabase'
    ? buildLiveRetailerCatalogCycles(titles)
    : db.getCatalogCycles();
  const scheduleDates = (cycleField, titleField) => Array.from(new Set([
    ...catalogCycles.map(cycle => cycle[cycleField]),
    ...titles.map(title => title[titleField])
  ].filter(Boolean))).sort();
  const catalogDates = scheduleDates('catalogDate', 'catalogDate');
  const focDates = scheduleDates('focDate', 'focDate');
  const inStoreDates = scheduleDates('releaseDate', 'releaseDate');
  const toggleDateFilter = (value, setter) => setter(current => current.includes(value) ? current.filter(date => date !== value) : [...current, value]);
  const clearScheduleDates = () => {
    setCatalogDateFilters([]);
    setFocDateFilters([]);
    setInStoreDateFilters([]);
  };
  const resetCatalogFilters = () => {
    setSearchTerm('');
    setPublisherFilter('all');
    setFocFilter('all');
    setAvailabilityFilter('all');
    setFormatFilter('all');
    setReturnableFilter('all');
    setReleaseFilter('all');
    setPromotionFilter('all');
    setReleasePlanningWindow('all');
    setCatalogSort('stock');
    clearScheduleDates();
    setCatalogPage(1);
  };
  const releasePlanningOptions = [
    { value: 'all', label: 'ALL CATALOG TITLES', detail: 'No date limit' },
    { value: '7', label: 'ORDER WEEKLY', detail: releaseWindowRange(7) },
    { value: '14', label: 'ORDER BI-WEEKLY', detail: releaseWindowRange(14) },
    { value: '30', label: 'ORDER MONTHLY', detail: releaseWindowRange(30) },
    { value: 'upcoming', label: 'ALL UPCOMING', detail: 'Every future release' }
  ].map(option => ({ ...option, count: titles.filter(title => isInReleaseWindow(title, option.value)).length }));
  const catalogPageSize = 20;
  const catalogPageCount = Math.max(1, Math.ceil(filteredTitles.length / catalogPageSize));
  const safeCatalogPage = Math.min(catalogPage, catalogPageCount);
  const visibleCatalogTitles = filteredTitles.slice((safeCatalogPage - 1) * catalogPageSize, safeCatalogPage * catalogPageSize);
  const firstVisibleResult = filteredTitles.length ? ((safeCatalogPage - 1) * catalogPageSize) + 1 : 0;
  const lastVisibleResult = Math.min(filteredTitles.length, safeCatalogPage * catalogPageSize);
  const currentOrderItemCount = countRetailerOrderItems(cart);
  const selectedIncentiveEligibility = selectedDetailTitle
    ? getIncentiveEligibility(selectedDetailTitle, titles, cart)
    : null;
  const selectedIncentiveRemaining = selectedIncentiveEligibility
    ? Math.max(0, selectedIncentiveEligibility.maximumQuantity - (cart[getRetailerTitleKey(selectedDetailTitle)] || 0))
    : null;
  const tierProgress = getRetailerTierProgress(tempMsrpSubtotal);
  const followedTitles = titles
    .filter(title => followedPublisherKeys.includes(getPublisherFollowKey(title)))
    .sort((a, b) => new Date(b.submittedAt || b.createdAt || b.updatedAt || b.releaseDate || 0) - new Date(a.submittedAt || a.createdAt || a.updatedAt || a.releaseDate || 0))
    .slice(0, 6);
  const catalogDownloads = user.authProvider === 'supabase'
    ? catalogCycles
    : db.getRetailerCatalogDownloads(user);
  const currentCycle = selectCurrentRetailerCatalogCycle(catalogCycles, titles);
  const currentCatalogTitleCount = titles.filter(title => title.cycleId === currentCycle?.cycleId).length;
  const recentOrders = [...orders].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 4);
  const shipmentOrders = orders.filter(order => order.trackingNumber || ['processing', 'partially_fulfilled', 'fulfilled', 'shipped', 'delivered'].includes(String(order.status || '').toLowerCase()));
  const alertItems = [
    ...returns.filter(item => ['pending', 'requested', 'approved'].includes(String(item.status || '').toLowerCase())).map(item => ({ label: `Return ${item.returnId}`, detail: item.status || 'Pending review', section: 'retailer-returns' })),
    ...orders.filter(order => ['failed', 'past_due'].includes(String(order.paymentStatus || '').toLowerCase())).map(order => ({ label: `Order ${order.orderId}`, detail: `Payment ${order.paymentStatus}`, section: 'order-history' }))
  ];
  const catalogYears = Array.from(new Set(catalogDownloads.map(c => (c.releaseDate || c.catalogDate || '').slice(0, 4)).filter(Boolean))).sort();
  const filteredDownloads = catalogDownloads.filter(cycle => {
    const isArchived = ['Archived', 'Released', 'FOC Locked'].includes(cycle.status);
    const isCurrent = cycle.retailerOpen === true && !isArchived;
    const statusMatch = downloadStatusFilter === 'Archived' ? isArchived :
      downloadStatusFilter === 'Upcoming' ? (!isArchived && !isCurrent) : isCurrent;
    const cycleDate = cycle.releaseDate || cycle.catalogDate || '';
    return statusMatch &&
      (downloadYearFilter === 'all' || cycleDate.startsWith(downloadYearFilter)) &&
      (downloadMonthFilter === 'all' || cycleDate.slice(5, 7) === downloadMonthFilter);
  });

  const handleCatalogDownload = (cycleId) => {
    try {
      const result = user.authProvider === 'supabase'
        ? generateLiveRetailerCatalogCsv({ cycleId, titles, tier: activeTier, discount })
        : db.generateCatalogCsv(cycleId, user);
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setToast(`Downloaded ${result.titleCount} catalog titles for ${result.tier}. Enter quantities in the first column, save, and upload the same CSV from Order Books.`);
      setTimeout(() => setToast(null), 5000);
    } catch (err) {
      setToast(err.message || 'Catalog download failed.');
      setTimeout(() => setToast(null), 3000);
    }
  };

  const TierProgressPrompt = ({ compact = false }) => (
    <div className={`retailer-tier-prompt${compact ? ' retailer-tier-prompt-compact' : ''}`}>
      <div className="retailer-tier-prompt-copy">
        <span className="badge badge-gold">{tierProgress.activeTier} order pricing</span>
        <strong>
          {tierProgress.nextTier
            ? `Add $${tierProgress.amountRemaining.toFixed(2)} to unlock ${tierProgress.nextTier} and get ${(tierProgress.nextDiscount * 100).toFixed(0)}% off this order.`
            : 'Tier III unlocked — your maximum 50% discount is active.'}
        </strong>
        <span>${tempMsrpSubtotal.toFixed(2)} current MSRP value</span>
      </div>
      <div className="retailer-tier-meter" aria-label={`${tierProgress.progressPercent.toFixed(0)}% progress to ${tierProgress.nextTier || 'maximum tier'}`}>
        <span style={{ width: `${tierProgress.progressPercent}%` }} />
      </div>
    </div>
  );

  const CoverThumbnail = ({ title, className = '' }) => (
    <button
      type="button"
      className={`retailer-cover-thumbnail ${className}`.trim()}
      onClick={() => openTitleDetails(title)}
      aria-label={`View all information for ${title.title}${title.variantNumber ? ` variant ${title.variantNumber}` : ''}`}
      title="View complete book information"
    >
      <img src={title.coverUrl} alt="" />
      <span aria-hidden="true">⌕</span>
    </button>
  );

  const openFastEntry = () => {
    setFastEntryExpanded(true);
    setActiveSection?.('retailer-catalog');
    window.setTimeout(() => document.getElementById('retailer-fast-entry')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const bulkOrderPanel = (
    <section id="retailer-fast-entry" className={`glass-panel bulk-order-panel ${fastEntryExpanded ? 'is-expanded' : 'is-collapsed'}`}>
      <div className="bulk-order-heading">
        <div>
          <span className="badge badge-gold">Fast entry</span>
          <h3>BULK ORDER BY PHILBO ID, ISBN, UPC OR EAN</h3>
          <p>{fastEntryExpanded ? 'Paste one code and quantity per line, or upload your completed order-ready Catalog CSV. Valid open titles go directly into your Current Order.' : 'Paste codes or upload a completed Catalog CSV when you need to order quickly.'}</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary bulk-order-expand-button"
          aria-expanded={fastEntryExpanded}
          aria-controls="retailer-fast-entry-content"
          onClick={() => setFastEntryExpanded(expanded => !expanded)}
        >
          <span aria-hidden="true">{fastEntryExpanded ? '−' : '+'}</span>
          {fastEntryExpanded ? 'MINIMIZE FAST ENTRY' : 'EXPAND FAST ENTRY'}
        </button>
      </div>
      {fastEntryExpanded && <div id="retailer-fast-entry-content" className="bulk-order-expanded-content">
      <div className="csv-order-upload">
        <div>
          <span className="badge badge-gold">CSV upload</span>
          <h4>UPLOAD YOUR COMPLETED CATALOG CSV</h4>
          <p>Upload the order-ready Catalog CSV after entering quantities in its Quantity column. Rows without quantities are ignored, and every ordered title is checked before anything is added.</p>
        </div>
        <label className="btn btn-primary csv-order-file-button">
          CHOOSE CSV
          <input type="file" accept=".csv,text/csv" onChange={handleCsvOrderUpload} />
        </label>
        <span className="csv-order-filename">{bulkOrderFilename || 'No file selected'}</span>
      </div>
      <div className="bulk-order-layout">
        <div>
          <textarea className="form-textarea bulk-order-textarea" value={bulkOrderText} onChange={(event) => { setBulkOrderText(event.target.value); setBulkPreview([]); }} placeholder={'PHI121626-201, 4\n9798995292708\t2'} />
          <div className="bulk-order-buttons">
            <button className="btn btn-primary" disabled={!bulkOrderText.trim()} onClick={handlePreviewBulkOrder}>PREVIEW BULK ORDER</button>
            <button className="btn btn-secondary" onClick={() => { setBulkOrderText(''); setBulkPreview([]); }}>CLEAR</button>
          </div>
        </div>
        <aside className="bulk-order-help">
          <strong>Accepted examples</strong>
          <code>PHI121626-201, 4</code>
          <code>9798995292708[TAB]2</code>
          <p>Commas, tabs, semicolons and ordinary spaces are accepted. Leading zeroes are preserved; unknown, duplicate and locked entries remain visible for correction.</p>
        </aside>
      </div>

      {bulkPreview.length > 0 && (
        <div className="bulk-preview-wrap">
          <div className="bulk-preview-summary">
            <strong>{bulkPreview.filter(row => row.status === 'valid').length} ready</strong>
            <span>{bulkPreview.filter(row => row.status === 'locked').length} locked</span>
            <span>{bulkPreview.filter(row => row.status === 'duplicate').length} duplicate</span>
            <span>{bulkPreview.filter(row => row.status === 'not-found').length} not found</span>
            <span>{bulkPreview.filter(row => row.status === 'invalid-qty').length} invalid quantity</span>
          </div>
          <div className="table-container">
            <table className="premium-table bulk-preview-table">
              <thead><tr><th>Line</th><th>Entered Code</th><th>Matched Title</th><th>Qty</th><th>Status</th></tr></thead>
              <tbody>
                {bulkPreview.map(row => (
                  <tr key={`${row.line}-${row.rawCode}`}>
                    <td>{row.line}</td><td><code>{row.rawCode}</code></td><td>{row.title ? <><strong>{row.title.title}</strong><div className="pull-code-secondary">{row.title.philboId}</div></> : '—'}</td><td>{row.qty}</td>
                    <td><span className={`badge ${row.status === 'valid' ? 'badge-green' : row.status === 'locked' ? 'badge-red' : 'badge-gold'}`}>{row.status === 'not-found' ? 'Not Found' : row.status === 'invalid-qty' ? 'Invalid Qty' : row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bulk-order-buttons bulk-preview-actions">
            <button className="btn btn-primary" disabled={!bulkPreview.some(row => row.status === 'valid')} onClick={addBulkPreviewToCurrentOrder}>ADD VALID TITLES TO CURRENT ORDER</button>
          </div>
        </div>
      )}
      </div>}
    </section>
  );

  return (
    <div className={`animate-fade-in retailer-portal-shell${activeSection === 'current-order' ? ' retailer-portal-shell-current-order' : ''}`} style={{ maxWidth: '1440px', margin: '0 auto' }}>
      
      {/* Toast Notification */}
      {toast && (
        <div className={`portal-toast${toast?.type ? ` portal-toast-${toast.type}` : ''}`} role="status" aria-live="polite">
          <span className="portal-toast-icon">⚡</span><span className="portal-toast-message">{typeof toast === 'string' ? toast : toast.message}</span>
        </div>
      )}

      {selectedOrderDetail && createPortal(
        <div className="retailer-order-detail-overlay" role="presentation" onClick={() => setSelectedOrderDetail(null)}>
          <div className="retailer-order-detail-dialog glass-panel" role="dialog" aria-modal="true" aria-labelledby="retailer-order-detail-title" onClick={event => event.stopPropagation()}>
            <button
              type="button"
              className="retailer-order-detail-close"
              aria-label="Close order details"
              title="Close order details"
              onClick={() => setSelectedOrderDetail(null)}
            >
              ×
            </button>
            <div className="retailer-order-detail-heading">
              <div>
                <span className="badge badge-gold">Retailer Sales Order</span>
                <h3 id="retailer-order-detail-title">{selectedOrderDetail.orderId}</h3>
                <p>Placed {selectedOrderDetail.date ? new Date(selectedOrderDetail.date).toLocaleString() : 'date not recorded'}</p>
              </div>
            </div>
            <div className="retailer-order-detail-status">
              <div><span>Order status</span><strong>{selectedOrderDetail.status || 'Pending'}</strong></div>
              <div><span>Payment</span><strong>{selectedOrderDetail.paymentStatus || 'Unknown'}</strong></div>
              <div><span>Total paid</span><strong>${Number(selectedOrderDetail.netTotal || 0).toFixed(2)}</strong></div>
            </div>
            <div className="retailer-order-detail-lines">
              {(selectedOrderDetail.items || []).map((item, index) => {
                const title = titles.find(record => record.titleId === item.titleId);
                return (
                  <div className="retailer-order-detail-line" key={`${selectedOrderDetail.orderId}-${item.titleId || index}`}>
                    <div className="retailer-order-detail-cover-slot">
                      {title?.coverUrl ? <CoverThumbnail title={title} /> : <span aria-label="Cover unavailable">NO COVER</span>}
                    </div>
                    <div className="retailer-order-detail-book">
                      <strong>{item.titleName || item.title || title?.title || 'Untitled'}</strong>
                      <span>{item.publisherName || title?.publisherName || 'Publisher not recorded'} · {item.variantNumber || title?.variantNumber ? `Cover ${item.variantNumber || title.variantNumber}` : item.coverDescription || title?.coverDescription || 'Main cover'}</span>
                    </div>
                    <span className="retailer-order-detail-quantity">{Number(item.qty || 0)} × ${Number(item.wholesalePrice || 0).toFixed(2)}</span>
                    <strong className="retailer-order-detail-line-total">${(Number(item.qty || 0) * Number(item.wholesalePrice || 0)).toFixed(2)}</strong>
                  </div>
                );
              })}
            </div>
            <div className="retailer-order-detail-totals">
              <div><span>MSRP total</span><strong>${Number(selectedOrderDetail.msrpTotal || 0).toFixed(2)}</strong></div>
              <div><span>Wholesale discount</span><strong>−${Number(selectedOrderDetail.discountTotal || 0).toFixed(2)}</strong></div>
              {Number(selectedOrderDetail.couponDiscount || 0) > 0 && <div><span>Coupon {selectedOrderDetail.couponCode || ''}</span><strong>−${Number(selectedOrderDetail.couponDiscount).toFixed(2)}</strong></div>}
              {Number(selectedOrderDetail.creditApplied || 0) > 0 && <div><span>Account credit</span><strong>−${Number(selectedOrderDetail.creditApplied).toFixed(2)}</strong></div>}
              <div className="retailer-order-detail-grand-total"><span>Total paid</span><strong>${Number(selectedOrderDetail.netTotal || 0).toFixed(2)}</strong></div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {activeSection === 'dashboard' && (
        <div className="retailer-dashboard">
          <section className="retailer-kpi-row" aria-label="Retailer account summary">
            <article><span>Current FOC</span><strong>{currentCycle?.focDate ? displayDate(currentCycle.focDate) : 'TBA'}</strong><small>{currentCycle?.cycleName || 'Next ordering deadline'}</small></article>
            <article><span>Current Order</span><strong>{currentOrderItemCount}</strong><small>${tempMsrpSubtotal.toFixed(2)} MSRP · {activeTier}</small></article>
            <article><span>Shipments</span><strong>{shipmentOrders.length}</strong><small>Tracking appears when available</small></article>
          </section>

          <div className="retailer-dashboard-grid">
            <main className="retailer-dashboard-primary">
              <section className="retailer-deadline-panel">
                <div>
                  <span className="retailer-section-kicker">Ordering now</span>
                  <h3>{currentCycle?.cycleName || 'Current catalog cycle'}</h3>
                  <p>FOC {currentCycle?.focDate ? displayDate(currentCycle.focDate) : 'TBA'} · In-store {currentCycle?.releaseDate ? displayDate(currentCycle.releaseDate) : 'TBA'}</p>
                </div>
                <button className="btn btn-primary" type="button" onClick={() => setActiveSection?.('retailer-catalog')}>ORDER BOOKS</button>
              </section>

              <section className="retailer-dashboard-section">
                <div className="retailer-section-heading"><div><span className="retailer-section-kicker">Activity</span><h3>RECENT ORDERS</h3></div><button type="button" onClick={() => setActiveSection?.('order-history')}>View all</button></div>
                {recentOrders.length ? recentOrders.map(order => (
                  <button type="button" className="retailer-dashboard-order" key={order.orderId} onClick={() => setSelectedOrderDetail(order)}>
                    <span><strong>{order.orderId}</strong><small>{order.date ? displayDate(String(order.date).slice(0, 10)) : 'Date not recorded'}</small></span>
                    <span>{order.status || 'Submitted'}</span>
                    <strong>${Number(order.netTotal || 0).toFixed(2)}</strong>
                  </button>
                )) : <div className="retailer-empty-compact">No orders have been placed yet.</div>}
              </section>

              <section className="retailer-dashboard-section">
                <div className="retailer-section-heading"><div><span className="retailer-section-kicker">Discovery</span><h3>NEW FROM PUBLISHERS YOU FOLLOW</h3></div><button type="button" onClick={() => setActiveSection?.('retailer-catalog')}>Browse</button></div>
                {followedTitles.length ? <div className="followed-title-grid">{followedTitles.slice(0, 4).map(item => (
                  <article className="followed-title-card" key={item.titleId}>
                    <img src={item.coverUrl} alt="" />
                    <div><span>{item.publisherName}</span><strong>{item.title}</strong><small>FOC {displayDate(item.focDate)}</small></div>
                    <button className="btn btn-secondary" type="button" onClick={() => openTitleDetails(item)}>VIEW</button>
                  </article>
                ))}</div> : <div className="retailer-empty-compact">Follow a publisher in Order Books to see new listings here.</div>}
              </section>
            </main>

            <aside className="retailer-attention-rail">
              <section><span className="retailer-section-kicker">Invoices / returns / damage</span>{alertItems.length ? alertItems.slice(0, 4).map(item => <button type="button" key={`${item.label}-${item.detail}`} onClick={() => setActiveSection?.(item.section)}><strong>{item.label}</strong><small>{item.detail}</small></button>) : <p>No urgent account alerts.</p>}</section>
              <section><span className="retailer-section-kicker">Account terms</span><strong>{Math.round(discount * 100)}% retailer discount</strong><small>{returnsRemaining} return allowance remaining</small></section>
            </aside>
          </div>
        </div>
      )}

      <div style={{ display: activeSection === 'dashboard' ? 'none' : 'grid', gridTemplateColumns: '1fr', gap: '30px', alignItems: 'flex-start' }}>
        
        {/* Retailer catalog and ordering tools */}
        <div style={{ display: activeSection === 'retailer-catalog' ? 'flex' : 'none', flexDirection: 'column', gap: '30px' }}>

          {activeSection === 'retailer-catalog' && (
            <section className="glass-panel retailer-catalog-identity">
              <div>
                <span className="badge badge-gold">CURRENT RETAILER CATALOG</span>
                <h2>{currentCycle?.cycleName || 'No retailer catalog is currently published'}</h2>
                {currentCycle && <p>Catalog {displayDate(currentCycle.catalogDate)} · FOC {displayDate(currentCycle.focDate)} · In-store {displayDate(currentCycle.releaseDate)}</p>}
              </div>
              <div className="retailer-catalog-identity-count"><strong>{currentCatalogTitleCount}</strong><span>published title{currentCatalogTitleCount === 1 ? '' : 's'}</span></div>
              <button type="button" className="btn btn-secondary" onClick={() => setActiveSection?.('catalog-downloads')}>CATALOG CSV &amp; ORDER FORM</button>
            </section>
          )}

          {activeSection === 'retailer-catalog' && (
            <div className="glass-panel retailer-current-order-strip" style={{ borderColor: currentOrderItemCount ? 'var(--gold-primary)' : 'var(--border-glow)' }}>
              <div>
                <strong style={{ color: currentOrderItemCount ? 'var(--gold-primary)' : '#fff' }}>
                  Current Order: {currentOrderItemCount} item{currentOrderItemCount === 1 ? '' : 's'}
                </strong>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: '3px' }}>Items you add from the catalog or Fast Entry appear here immediately.</div>
              </div>
              <div className="retailer-current-order-actions">
                <button type="button" className="btn btn-secondary" onClick={openFastEntry}>FAST ENTRY / BULK ORDER</button>
                <button type="button" className="btn btn-primary" onClick={() => setActiveSection?.('current-order')}>VIEW CURRENT ORDER</button>
              </div>
            </div>
          )}

          {activeSection === 'retailer-catalog' && <TierProgressPrompt compact />}

          {activeSection === 'retailer-catalog' && bulkOrderPanel}

          <section className="retailer-release-planner" style={{ display: activeSection === 'retailer-catalog' ? 'block' : 'none' }}>
            <div className="retailer-release-planner-heading">
              <div><span>RELEASE PLANNING</span><h3>WHAT’S COMING OUT?</h3></div>
              <p>Choose the schedule that matches how often you place orders. Results use each book’s in-store date.</p>
            </div>
            <div className="retailer-release-planner-options">
              {releasePlanningOptions.map(option => (
                <button
                  type="button"
                  key={option.value}
                  className={releasePlanningWindow === option.value ? 'active' : ''}
                  onClick={() => {
                    setReleasePlanningWindow(option.value);
                    if (option.value !== 'all') setCatalogSort('in-store');
                    setReleaseFilter('all');
                    clearScheduleDates();
                  }}
                >
                  <span>{option.label}</span>
                  <strong>{option.count}</strong>
                  <small>{option.detail}</small>
                </button>
              ))}
            </div>
          </section>
          
          {/* Catalog Search & Filtering */}
          <section className="retailer-ordering-filter-bar" style={{ display: activeSection === 'retailer-catalog' ? 'block' : 'none' }}>
            <h3 className="retailer-product-search-title">PRODUCT SEARCH</h3>
            <div className="retailer-search-grid">
              <label><span>Search Terms</span><input className="form-input" type="search" placeholder="Title, creator, Product ID, ISBN or barcode" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></label>
              <label><span>Publisher</span><select className="form-select" value={publisherFilter} onChange={(e) => setPublisherFilter(e.target.value)}><option value="all">All publishers</option>{publishers.map(pub => <option key={pub} value={pub}>{pub}</option>)}</select></label>
            </div>
            <div className="retailer-search-options">
              <label><span>Released Status</span><select className="form-select" value={releaseFilter} onChange={(e) => setReleaseFilter(e.target.value)}><option value="all">All</option><option value="Upcoming">Upcoming</option><option value="Released">Released</option><option value="TBA">TBA</option></select></label>
              <label><span>Availability Status</span><select className="form-select" value={availabilityFilter} onChange={(e) => setAvailabilityFilter(e.target.value)}><option value="all">All</option>{availabilityStates.map(value => <option key={value}>{value}</option>)}</select></label>
              <label><span>Product Type</span><select className="form-select" value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)}><option value="all">All</option>{formats.map(value => <option key={value}>{value}</option>)}</select></label>
              <label className="retailer-returnable-only"><input type="checkbox" checked={returnableFilter === 'returnable'} onChange={(event) => setReturnableFilter(event.target.checked ? 'returnable' : 'all')} /><span>Returnable Only</span></label>
            </div>
            <div className="retailer-schedule-filter" aria-label="Catalog ordering schedule">
              <div className="retailer-schedule-heading">
                <div><strong>ORDERING SCHEDULE</strong><span>Select one or more dates. Dates selected in different columns work together.</span></div>
                {(catalogDateFilters.length > 0 || focDateFilters.length > 0 || inStoreDateFilters.length > 0) && <button type="button" onClick={clearScheduleDates}>CLEAR DATES</button>}
              </div>
              <div className="retailer-schedule-columns">
                {[
                  ['CATALOG DATES', catalogDates, catalogDateFilters, setCatalogDateFilters],
                  ['FOC DUE DATES', focDates, focDateFilters, setFocDateFilters],
                  ['IN-STORE DATES', inStoreDates, inStoreDateFilters, setInStoreDateFilters]
                ].map(([label, dates, selectedDates, setter]) => (
                  <fieldset key={label}>
                    <legend>{label}</legend>
                    <span>MASTER SCHEDULE</span>
                    <div>
                      {dates.length ? dates.map(value => <label key={value}><input type="checkbox" checked={selectedDates.includes(value)} onChange={() => toggleDateFilter(value, setter)} />{displayDate(value)}</label>) : <small>No dates assigned</small>}
                    </div>
                  </fieldset>
                ))}
              </div>
            </div>
            {showAdvancedFilters && <div className="retailer-filter-advanced">
              <label>FOC status<select className="form-select" value={focFilter} onChange={(e) => setFocFilter(e.target.value)}><option value="all">All</option><option value="open">FOC open</option><option value="locked">FOC locked</option></select></label>
              <label>Promotions<select className="form-select" value={promotionFilter} onChange={(e) => setPromotionFilter(e.target.value)}><option value="all">All</option><option value="promoted">Promotion only</option><option value="standard">Standard</option></select></label>
            </div>}
            <div className="retailer-search-actions">
              <div><button type="button" className="btn btn-primary" onClick={() => setCatalogPage(1)}>SEARCH</button><button type="button" className="retailer-more-filters" onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}>{showAdvancedFilters ? 'HIDE EXTRA FILTERS' : 'MORE FILTERS'}</button></div>
              <button type="button" className="btn btn-secondary" onClick={resetCatalogFilters}>RESET</button>
            </div>
            <div className="retailer-results-summary"><span>Page {safeCatalogPage} of {catalogPageCount} · Results {firstVisibleResult}–{lastVisibleResult} of {filteredTitles.length}</span><label>Sort<select className="form-select" value={catalogSort} onChange={(e) => setCatalogSort(e.target.value)}><option value="stock">Product Code A–Z</option><option value="title">Title A–Z</option><option value="publisher">Publisher A–Z</option><option value="foc">FOC date</option><option value="in-store">In-store date</option></select></label></div>
          </section>

          <section className="retailer-ordering-results" style={{ display: activeSection === 'retailer-catalog' ? 'block' : 'none' }}>
            {visibleCatalogTitles.map(item => {
              const catalogQuantity = catalogQuantities[item.titleId] || 1;
              const publisherFollowed = followedPublisherKeys.includes(getPublisherFollowKey(item));
              const wholesalePrice = Number(item.msrp || 0) * (1 - discount);
              const incentiveEligibility = getIncentiveEligibility(item, titles, cart);
              const incentiveRemaining = incentiveEligibility
                ? Math.max(0, incentiveEligibility.maximumQuantity - (cart[item.titleId] || 0))
                : null;
              const incentiveLocked = incentiveEligibility && incentiveRemaining < 1;
              return <article
                className="retailer-ordering-row"
                key={item.titleId}
                tabIndex="0"
                aria-label={`View all information for ${item.title}`}
                onClick={(event) => {
                  if (event.target.closest('button, input, select, textarea, a, label')) return;
                  openTitleDetails(item);
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
                  event.preventDefault();
                  openTitleDetails(item);
                }}
              >
                <CoverThumbnail title={item} className="retailer-ordering-cover" />
                <div className="retailer-ordering-identity">
                  <div><span>{item.publisherName}</span><button type="button" onClick={() => handleTogglePublisherFollow(item)}>{publisherFollowed ? 'Following' : 'Follow'}</button></div>
                  <h3>{item.title}</h3>
                  <p>Issue {item.issueNumber || '—'} · Cover {item.variantNumber || item.coverDescription || 'Main'} · {item.bookFormat || 'Format not specified'}</p>
                </div>
                <dl className="retailer-ordering-codes"><div><dt>PHILBO Stock #</dt><dd>{item.philboId || '—'}</dd></div><div><dt>ISBN / barcode</dt><dd>{item.isbn || item.barcode || item.upc || item.ean || '—'}</dd></div></dl>
                <dl className="retailer-ordering-dates"><div><dt>FOC</dt><dd>{displayDate(item.focDate)}</dd></div><div><dt>In-store</dt><dd>{displayDate(item.releaseDate)}</dd></div></dl>
                <div className="retailer-ordering-status"><span className={`badge ${item.focLocked || incentiveLocked ? 'badge-red' : 'badge-green'}`}>{incentiveLocked ? 'Incentive Locked' : getTitleAvailability(item)}</span><small>{isTitleReturnable(item) ? 'Returnable' : 'Non-returnable'}</small>{hasTitlePromotion(item) && <small className="retailer-promotion-label">{incentiveEligibility ? `${incentiveEligibility.label} incentive` : 'Promotion'}</small>}</div>
                <div className="retailer-ordering-pricing"><span>MSRP ${Number(item.msrp || 0).toFixed(2)}</span><span>{Math.round(discount * 100)}% discount</span><strong>${wholesalePrice.toFixed(2)}</strong></div>
                <div className="retailer-ordering-actions">
                  <label><span>Qty {(item.focLocked || incentiveLocked) && <span className="retailer-quantity-lock" aria-label="Ordering locked" title={item.focLocked ? 'Final Order Cutoff is locked' : 'Order qualifying regular copies first'}>🔒</span>}</span><input className="form-input" type="number" min="1" max={incentiveEligibility ? Math.max(1, incentiveRemaining) : 999} value={catalogQuantity} onChange={(event) => handleCatalogQuantityChange(item.titleId, event.target.value)} disabled={item.focLocked || incentiveLocked} /></label>
                  <button className="btn btn-primary" type="button" onClick={() => handleAddToCart(item, catalogQuantity)} disabled={item.focLocked || incentiveLocked}>{recentlyAddedTitleId === item.titleId ? 'ADDED' : 'ADD ITEM'}</button>
                  {item.focLocked && <span className="retailer-foc-lock-note"><span aria-hidden="true">🔒</span> FOC LOCKED</span>}
                  {!item.focLocked && incentiveEligibility && <span className="retailer-foc-lock-note">{incentiveLocked ? `Order ${incentiveEligibility.copiesUntilNextUnlock} more regular ${incentiveEligibility.copiesUntilNextUnlock === 1 ? 'copy' : 'copies'} to unlock` : `${incentiveRemaining} special ${incentiveRemaining === 1 ? 'copy' : 'copies'} unlocked`}</span>}
                </div>
              </article>;
            })}
            {!visibleCatalogTitles.length && <div className="retailer-empty-compact">No titles match the selected filters.</div>}
            <nav className="retailer-pagination" aria-label="Order Books pages"><button type="button" className="btn btn-secondary" disabled={safeCatalogPage <= 1} onClick={() => setCatalogPage(page => Math.max(1, page - 1))}>PREVIOUS</button><span>{safeCatalogPage} / {catalogPageCount}</span><button type="button" className="btn btn-secondary" disabled={safeCatalogPage >= catalogPageCount} onClick={() => setCatalogPage(page => Math.min(catalogPageCount, page + 1))}>NEXT</button></nav>
          </section>

        </div>

        {/* Right Column: Cart & Orders / Returns Sidebar */}
        <div style={{ display: (activeSection === 'current-order' || activeSection === 'order-history' || activeSection === 'shipments' || activeSection === 'retailer-returns') ? 'flex' : 'none', flexDirection: 'column', gap: '30px' }}>
          
          {/* Order Cart */}
          <div className="glass-panel current-order-card" style={{ display: activeSection === 'current-order' ? 'block' : 'none' }}>
            <h3 className="current-order-heading">
              CURRENT ORDER
            </h3>

            {cartItemsList.length > 0 && <TierProgressPrompt compact />}

            {cartItemsList.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '20px 0' }}>Cart is empty. Add titles from catalog.</p>
            ) : (
              <div>
                <div className="current-order-items">
                  {cartItemsList.map(item => (
                    <div key={item.titleId} className="current-order-line">
                      <label>
                        <span>Qty</span>
                        <input
                          type="number"
                          className="form-input"
                          min="0"
                          max="999"
                          value={item.qty}
                          onChange={(e) => handleQtyChange(item.titleId, e.target.value)}
                        />
                      </label>
                      <CoverThumbnail title={item} className="current-order-cover-thumbnail" />
                      <div className="current-order-title">
                        <strong>{item.title}</strong>
                        <span>{item.publisherName} · ${item.wholesalePrice.toFixed(2)} each</span>
                      </div>
                      <strong className="current-order-line-total">${(item.wholesalePrice * item.qty).toFixed(2)}</strong>
                    </div>
                  ))}
                </div>

                <div className="current-order-summary">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>MSRP Total:</span>
                    <span>${msrpSubtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Wholesale discount cut:</span>
                    <span style={{ color: 'var(--gold-primary)' }}>-${discountTotal.toFixed(2)}</span>
                  </div>

                  <div className="current-order-coupon">
                    <label htmlFor="retailer-coupon-code">Coupon code</label>
                    <div>
                      <input
                        id="retailer-coupon-code"
                        className="form-input"
                        type="text"
                        value={couponCode}
                        onChange={(event) => {
                          setCouponCode(event.target.value.toUpperCase());
                          if (couponMessage) setCouponMessage('');
                        }}
                        placeholder="Enter code"
                        disabled={Boolean(appliedCouponCode)}
                      />
                      {appliedCouponCode ? (
                        <button type="button" className="btn btn-secondary" onClick={handleRemoveCoupon}>REMOVE</button>
                      ) : (
                        <button type="button" className="btn btn-secondary" onClick={handleApplyCoupon}>APPLY</button>
                      )}
                    </div>
                    {couponMessage && <small className={couponQuote.valid ? 'coupon-message-success' : 'coupon-message-error'}>{couponMessage}</small>}
                  </div>

                  {couponQuote.valid && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--green-primary)' }}>
                      <span>Coupon ({appliedCouponCode}):</span>
                      <span>-${couponDiscount.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Credit Deductions block */}
                  {creditBalance > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(16,185,129,0.05)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(16,185,129,0.2)', gap: '6px', marginTop: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--green-primary)', fontWeight: '500' }}>Apply Return Credit</span>
                        <input 
                          type="checkbox" 
                          checked={applyCredit}
                          onChange={(e) => setApplyCredit(e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Available credit: <strong>${creditBalance.toFixed(2)}</strong>
                      </div>
                      {applyCredit && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--green-primary)' }}>
                          <span>Credit Deducted:</span>
                          <span>-${creditUsed.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.05rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', marginTop: '4px' }}>
                    <span>Amount Due:</span>
                    <span style={{ color: 'var(--green-primary)' }}>${finalNetTotal.toFixed(2)}</span>
                  </div>
                </div>

                {!paymentsEnabled && (
                  <div style={{ padding: '10px 12px', marginBottom: '10px', borderRadius: '6px', background: 'rgba(228,87,80,0.10)', border: '1px solid rgba(228,87,80,0.35)', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    Beta testing mode: this submits the order for review, but no payment information is requested and no money is collected.
                  </div>
                )}

                {orderError && (
                  <div role="alert" style={{ padding: '10px 12px', marginBottom: '10px', borderRadius: '6px', background: 'rgba(228,87,80,0.10)', border: '1px solid rgba(228,87,80,0.35)', color: '#ff8a8a', fontSize: '0.78rem' }}>
                    {orderError}
                  </div>
                )}

                <button 
                  className="btn btn-primary" 
                  style={{ width: '100%' }}
                  onClick={() => paymentsEnabled ? handleStripeCheckout() : handleBetaOrderSubmit()}
                  disabled={isPaying}
                >
                  {paymentsEnabled ? (isPaying ? 'OPENING SECURE CHECKOUT…' : 'PAY SECURELY WITH STRIPE') : 'Submit Beta Order — No Payment'}
                </button>
              </div>
            )}
          </div>

          {/* Returns Request Form */}
          <div className="glass-panel" style={{ padding: '25px', display: activeSection === 'retailer-returns' ? 'block' : 'none' }}>
            <h3 style={{ borderBottom: '1px solid var(--border-glow)', paddingBottom: '12px', marginBottom: '15px', color: 'var(--gold-primary)', fontSize: '1.1rem' }}>
              SUBMIT RETURN REQUEST
            </h3>

            {returnError && (
              <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid var(--red-primary)', color: '#ff8a8a', padding: '8px 12px', borderRadius: '4px', marginBottom: '15px', fontSize: '0.8rem' }}>
                ✕ {returnError}
              </div>
            )}

            {returnSuccess && (
              <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid var(--green-primary)', color: '#a5d6a7', padding: '8px 12px', borderRadius: '4px', marginBottom: '15px', fontSize: '0.8rem' }}>
                ✓ Return request submitted for admin review.
              </div>
            )}

            <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glow)', borderRadius: '6px', padding: '10px 12px', marginBottom: '14px', color: 'var(--text-secondary)', fontSize: '0.76rem' }}>
              <strong style={{ color: '#fff' }}>{returnsRemaining} of {returnAllowance.maximum} copies available</strong>
              <span> · {returnAllowance.approved} approved · {returnAllowance.pending} pending</span>
            </div>

            <form onSubmit={handleReturnSubmit}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label className="form-label">Select a Purchased Book</label>
                <select 
                  className="form-select"
                  value={returnSelectionKey}
                  onChange={(e) => { setReturnSelectionKey(e.target.value); setReturnQty(''); }}
                  style={{ background: 'var(--bg-deep)' }}
                  disabled={!eligibleReturnItems.length}
                >
                  <option value="">{eligibleReturnItems.length ? '-- Choose Paid Order Item --' : '-- No Eligible Purchases --'}</option>
                  {eligibleReturnItems.map(item => (
                    <option key={item.key} value={item.key}>{item.orderId} · {item.titleName} · {item.availableQty} available</option>
                  ))}
                </select>
                <small style={{ display: 'block', marginTop: '5px', color: 'var(--text-muted)' }}>Only copies from paid orders are listed. Final Order Cutoff does not affect returns.</small>
              </div>

              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label className="form-label">Return Quantity</label>
                <input 
                  type="number" 
                  className="form-input" 
                  placeholder="Max allowance check applies"
                  value={returnQty}
                  onChange={(e) => setReturnQty(e.target.value)}
                  min="1"
                  step="1"
                  max={selectedReturnItem ? Math.min(selectedReturnItem.availableQty, returnsRemaining) : undefined}
                  disabled={!selectedReturnItem || returnsRemaining <= 0}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label className="form-label">Reason for Return</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Overstock / damages"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-secondary" 
                style={{ width: '100%', borderColor: 'rgba(228,87,80,0.36)', color: 'var(--gold-primary)', fontSize: '0.8rem' }}
                disabled={returnsRemaining <= 0 || !selectedReturnItem}
              >
                {returnsRemaining <= 0 ? 'No Return Allowance Left' : eligibleReturnItems.length ? 'Submit Return' : 'No Eligible Purchases'}
              </button>
            </form>
          </div>

          {/* Retailer return request history */}
          <div className="glass-panel" style={{ padding: '25px', display: activeSection === 'retailer-returns' ? 'block' : 'none' }}>
            <h3 style={{ borderBottom: '1px solid var(--border-glow)', paddingBottom: '12px', marginBottom: '15px', fontSize: '1.05rem' }}>YOUR RETURN REQUESTS</h3>
            {returns.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No return requests submitted.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {returns.map(item => (
                  <div key={item.returnId} style={{ padding: '12px', border: item.placeholder ? '1px solid var(--amber-warning)' : '1px solid var(--border-glow)', borderRadius: '6px', background: item.placeholder ? 'rgba(184,132,62,0.08)' : 'rgba(0,0,0,0.15)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                      <div>
                        {item.placeholder && <span className="badge badge-gold" style={{ fontSize: '0.58rem', marginBottom: '5px' }}>Return Placeholder</span>}
                        <strong style={{ display: 'block', fontSize: '0.85rem' }}>{item.titleName}</strong>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{item.returnId}{item.orderId ? ` · ${item.orderId}` : ''} · {new Date(item.date).toLocaleDateString()}</span>
                      </div>
                      <span className={`badge ${item.status === 'approved' ? 'badge-green' : item.status === 'rejected' ? 'badge-red' : 'badge-gold'}`}>{item.status}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', marginTop: '8px' }}>Quantity: <strong>{item.qty}</strong></div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', marginTop: '4px' }}>{item.reason}</div>
                    {item.requestedCredit != null && <div style={{ color: 'var(--green-primary)', fontSize: '0.76rem', marginTop: '5px' }}>Requested credit: ${Number(item.requestedCredit).toFixed(2)}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Orders list */}
          <div className="glass-panel" style={{ padding: '25px', display: activeSection === 'order-history' ? 'block' : 'none' }}>
            <h3 style={{ borderBottom: '1px solid var(--border-glow)', paddingBottom: '12px', marginBottom: '15px', fontSize: '1.1rem' }}>
              PAST ORDERS
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '-4px 0 15px' }}>Your complete order, payment, and invoice history is kept together here.</p>
            {orders.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No orders placed yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {orders.map(o => (
                  <button type="button" key={o.orderId} className="retailer-order-history-card" onClick={() => setSelectedOrderDetail(o)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                      <span>Sales Order <u>{o.orderId}</u></span>
                      <span style={{ color: 'var(--green-primary)' }}>${o.netTotal.toFixed(2)}</span>
                    </div>
                    {o.creditApplied > 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--green-primary)', marginTop: '2px' }}>
                        Applied Credit: -${o.creditApplied.toFixed(2)}
                      </div>
                    )}
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{new Date(o.date).toLocaleDateString()}{o.invoiceNumber ? ` · ${o.invoiceNumber}` : ''}</span>
                      <span className="badge badge-green" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>{o.paymentStatus}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <section className="retailer-ledger-panel" style={{ display: activeSection === 'shipments' ? 'block' : 'none' }}>
            <div className="retailer-section-heading"><div><span className="retailer-section-kicker">Fulfillment</span><h3>SHIPMENTS</h3></div></div>
            {shipmentOrders.length ? <div className="retailer-ledger-list">{shipmentOrders.map(order => (
              <article key={`shipment-${order.orderId}`}>
                <div><strong>{order.orderId}</strong><small>{order.carrier || 'Carrier pending'}</small></div>
                <span className="badge badge-green">{order.shipmentStatus || order.status || 'Processing'}</span>
                <strong>{order.trackingNumber || 'Tracking pending'}</strong>
                {order.trackingUrl ? <a className="btn btn-secondary" href={order.trackingUrl} target="_blank" rel="noreferrer">TRACK</a> : <button type="button" className="btn btn-secondary" disabled>TRACK</button>}
              </article>
            ))}</div> : <div className="retailer-empty-compact">No shipments are active. Tracking will appear here when fulfillment begins.</div>}
          </section>

        </div>

      </div>

      {activeSection === 'catalog-downloads' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <section className="catalog-csv-workflow" aria-labelledby="catalog-csv-workflow-title">
            <div className="catalog-csv-workflow-heading">
              <span>CSV ORDERING WORKFLOW</span>
              <h3 id="catalog-csv-workflow-title">FROM CATALOG TO ORDER IN THREE STEPS</h3>
            </div>
            <ol>
              <li><strong>01</strong><span><b>Download</b><small>Choose the order-ready Catalog CSV below.</small></span></li>
              <li><strong>02</strong><span><b>Add quantities</b><small>Enter quantities in the first column. All catalog information is already included.</small></span></li>
              <li><strong>03</strong><span><b>Upload</b><small>Preview every line before ordering.</small></span></li>
            </ol>
            <button type="button" className="btn btn-primary" onClick={openFastEntry}>OPEN FAST ENTRY IN ORDER BOOKS →</button>
          </section>

          <div className="glass-panel catalog-downloads-panel" style={{ padding: '25px' }}>
            <h3 style={{ color: 'var(--gold-primary)', fontSize: '1.1rem', marginBottom: '8px' }}>CATALOG DOWNLOADS</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Each CSV contains every approved title and its complete catalog information, plus wholesale pricing for your assigned {user.tier || 'Tier I'} account tier. Only the Quantity column is intentionally blank.
            </p>
            <div className="catalog-download-filters" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <select className="form-select" value={downloadStatusFilter} onChange={(e) => setDownloadStatusFilter(e.target.value)}>
                <option value="Current">Current</option>
                <option value="Upcoming">Upcoming</option>
                <option value="Archived">Archived</option>
              </select>
              <select className="form-select" value={downloadYearFilter} onChange={(e) => setDownloadYearFilter(e.target.value)}>
                <option value="all">All Years</option>
                {catalogYears.map(year => <option key={year} value={year}>{year}</option>)}
              </select>
              <select className="form-select" value={downloadMonthFilter} onChange={(e) => setDownloadMonthFilter(e.target.value)}>
                <option value="all">All Months</option>
                {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map(month => (
                  <option key={month} value={month}>{month}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-container catalog-download-table-container">
            <table className="premium-table catalog-download-table">
              <thead>
                <tr>
                  <th>Catalog</th><th>Dates</th><th>Titles</th><th>Status</th><th>Last Updated</th><th>Files</th>
                </tr>
              </thead>
              <tbody>
                {filteredDownloads.map(cycle => (
                  <tr key={cycle.cycleId}>
                    <td data-label="Catalog" className="catalog-download-name"><strong>{cycle.cycleName}</strong><div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Version {cycle.catalogPublicationVersion || 1} · {cycle.catalogPublishedAt ? `Published ${new Date(cycle.catalogPublishedAt).toLocaleString()}` : cycle.cycleId}</div></td>
                    <td data-label="Dates" className="catalog-download-dates" style={{ fontSize: '0.78rem' }}><span><b>Catalog</b>{cycle.catalogDate}</span><span><b>FOC</b>{cycle.focDate}</span><span><b>In-store</b>{cycle.releaseDate}</span></td>
                    <td data-label="Titles">{cycle.titleCount}</td>
                    <td data-label="Status"><span className="badge badge-gold">{cycle.orderingStatus}</span></td>
                    <td data-label="Last Updated" style={{ fontSize: '0.78rem' }}>{new Date(cycle.lastUpdated).toLocaleString()}</td>
                    <td data-label="Files" className="catalog-download-actions">
                      {cycle.catalogPdfUrl && <a className="btn btn-secondary" href={cycle.catalogPdfUrl} target="_blank" rel="noreferrer">View Philviews PDF</a>}
                      <button className="btn btn-primary" disabled={!cycle.downloadEnabled} onClick={() => handleCatalogDownload(cycle.cycleId)}>
                        {cycle.downloadEnabled ? 'Download Order-Ready Catalog CSV' : 'Unavailable'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredDownloads.length === 0 && (
                  <tr className="catalog-download-empty-row"><td colSpan="6" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>{downloadStatusFilter === 'Current' ? 'No retailer catalog is currently published. Publish the catalog from Admin → Catalog Cycles.' : 'No catalog cycles match these filters.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'profile' && (
        <section className="retailer-account-panel">
          <div className="retailer-section-heading"><div><span className="retailer-section-kicker">Account</span><h3>STORE INFORMATION</h3><p>Keep your store, contact, tax, and physical-location information current.</p></div></div>
          <form className="retailer-profile-form" onSubmit={handleRetailerProfileSave}>
            <fieldset>
              <legend>STORE &amp; CONTACT</legend>
              <div className="retailer-profile-grid">
                <label className="form-group"><span className="form-label">Store / company name *</span><input className="form-input" name="companyName" autoComplete="organization" required value={retailerProfileForm.companyName} onChange={handleRetailerProfileChange} /></label>
                <label className="form-group"><span className="form-label">Primary contact</span><input className="form-input" name="contactName" autoComplete="name" value={retailerProfileForm.contactName} onChange={handleRetailerProfileChange} /></label>
                <label className="form-group"><span className="form-label">Primary email</span><input className="form-input" type="email" value={user.email || ''} disabled /></label>
                <label className="form-group"><span className="form-label">Phone *</span><input className="form-input" name="primaryPhone" type="tel" autoComplete="tel" required value={retailerProfileForm.primaryPhone} onChange={handleRetailerProfileChange} /></label>
                <label className="form-group retailer-profile-wide"><span className="form-label">Website address</span><input className="form-input" name="website" type="url" inputMode="url" autoComplete="url" placeholder="https://yourcomicshop.com" value={retailerProfileForm.website} onChange={handleRetailerProfileChange} /></label>
              </div>
            </fieldset>

            <fieldset>
              <legend>BRICK-AND-MORTAR ADDRESS</legend>
              <p className="retailer-profile-help">Enter the physical shop location—not only a mailing address.</p>
              <div className="retailer-profile-grid">
                <label className="form-group retailer-profile-wide"><span className="form-label">Street address *</span><input className="form-input" name="shippingAddress1" autoComplete="address-line1" required value={retailerProfileForm.shippingAddress1} onChange={handleRetailerProfileChange} /></label>
                <label className="form-group retailer-profile-wide"><span className="form-label">Suite / unit</span><input className="form-input" name="shippingAddress2" autoComplete="address-line2" value={retailerProfileForm.shippingAddress2} onChange={handleRetailerProfileChange} /></label>
                <label className="form-group"><span className="form-label">City *</span><input className="form-input" name="shippingCity" autoComplete="address-level2" required value={retailerProfileForm.shippingCity} onChange={handleRetailerProfileChange} /></label>
                <label className="form-group"><span className="form-label">State / province *</span><input className="form-input" name="shippingState" autoComplete="address-level1" required value={retailerProfileForm.shippingState} onChange={handleRetailerProfileChange} /></label>
                <label className="form-group"><span className="form-label">ZIP / postal code *</span><input className="form-input" name="shippingZip" autoComplete="postal-code" required value={retailerProfileForm.shippingZip} onChange={handleRetailerProfileChange} /></label>
                <label className="form-group"><span className="form-label">Country *</span><input className="form-input" name="shippingCountry" autoComplete="country-name" required value={retailerProfileForm.shippingCountry} onChange={handleRetailerProfileChange} /></label>
              </div>
            </fieldset>

            <fieldset>
              <legend>TAX &amp; RESALE CERTIFICATE</legend>
              <div className="retailer-profile-tax-heading"><p className="retailer-profile-help">This information is private and is reviewed by Philbo before tax-exempt status is applied.</p><span className={`badge pod-tax-status pod-tax-${String(user.resaleCertificateStatus || 'not-submitted').toLowerCase().replace(/\s+/g, '-')}`}>{user.taxExempt ? 'Tax Exempt' : user.resaleCertificateStatus || 'Not Submitted'}</span></div>
              <div className="retailer-profile-grid">
                <label className="form-group"><span className="form-label">Tax ID / EIN</span><input className="form-input" name="taxId" autoComplete="off" value={retailerProfileForm.taxId} onChange={handleRetailerProfileChange} /></label>
                <label className="form-group"><span className="form-label">Resale certificate number</span><input className="form-input" name="resaleCertificateNumber" value={retailerProfileForm.resaleCertificateNumber} onChange={handleRetailerProfileChange} /></label>
                <label className="form-group"><span className="form-label">Issuing state</span><input className="form-input" name="resaleCertificateState" maxLength="2" placeholder="NY" value={retailerProfileForm.resaleCertificateState} onChange={event => setRetailerProfileForm(current => ({ ...current, resaleCertificateState: event.target.value.toUpperCase() }))} /></label>
                <label className="form-group"><span className="form-label">Expiration date</span><input className="form-input" name="resaleCertificateExpiration" type="date" value={retailerProfileForm.resaleCertificateExpiration} onChange={handleRetailerProfileChange} /></label>
                <label className="form-group retailer-profile-wide retailer-certificate-upload"><span className="form-label">Upload resale certificate</span><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={event => setRetailerCertificateFile(event.target.files?.[0] || null)} /><small>{retailerCertificateFile?.name || user.resaleCertificateFileName || 'PDF, PNG, JPG, or JPEG · maximum 20 MB'}</small></label>
              </div>
            </fieldset>

            <div className="retailer-profile-account-summary">
              <span><small>Retailer tier</small><strong>{user.tier || activeTier}</strong></span>
              <span><small>Wholesale discount</small><strong>{Math.round(discount * 100)}%</strong></span>
              <p>Tier and discount settings are managed by Philbo and cannot be changed here.</p>
            </div>
            {retailerProfileMessage && <p className={`retailer-profile-message ${/could not|complete|upload/i.test(retailerProfileMessage) ? 'is-error' : ''}`} role="status">{retailerProfileMessage}</p>}
            <button type="submit" className="btn btn-primary retailer-profile-save" disabled={retailerProfileSaving}>{retailerProfileSaving ? 'SAVING…' : 'SAVE STORE INFORMATION'}</button>
          </form>
        </section>
      )}

      <CatalogProductDetail
        title={selectedDetailTitle}
        onClose={() => setSelectedDetailTitle(null)}
        viewerRole="retailer"
        retailerTier={activeTier}
        discount={discount}
        quantity={detailQuantity}
        onQuantityChange={setDetailQuantity}
        onAddToOrder={addDetailTitleToOrder}
        orderDisabled={Boolean(selectedDetailTitle?.focLocked || (selectedIncentiveEligibility && selectedIncentiveRemaining < 1))}
        maximumQuantity={selectedIncentiveRemaining ?? undefined}
        orderHelp={selectedIncentiveEligibility
          ? `This is a ${selectedIncentiveEligibility.label} incentive cover. Order ${selectedIncentiveEligibility.qualifyingQuantity} qualifying regular copies for each ${selectedIncentiveEligibility.awardQuantity} special ${selectedIncentiveEligibility.awardQuantity === 1 ? 'copy' : 'copies'}.`
          : undefined}
        publisherFollowed={Boolean(selectedDetailTitle && followedPublisherKeys.includes(getPublisherFollowKey(selectedDetailTitle)))}
        onTogglePublisherFollow={handleTogglePublisherFollow}
      />
    </div>
  );
}
