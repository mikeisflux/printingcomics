import React, { useState, useEffect } from 'react';
import { CalendarDays, ClipboardList, FileText, LockKeyhole, PlusCircle, Upload, User } from 'lucide-react';
import { db } from '../firebase-mock';
import { loadPublisherCatalogCycles, loadPublisherTitles, savePublisherTitle, submitPublisherTitleForReview } from '../lib/backend';
import { uploadTitleFileToDrive } from '../lib/drive-upload';
import { getTitleStatusLabel, isTitlePendingReview, isTitlePublished } from '../lib/catalog-workflow';
import { validatePageCountForFormat } from '../lib/title-validation';
import { inspectInteriorPdf, REQUIRED_BLEED_INCHES } from '../lib/pdf-preflight';
import PurchaseOrderDocument from './PurchaseOrderDocument';
import CatalogProductDetail from './CatalogProductDetail';

const Icon = ({ name, size = 16, color = 'currentColor', style = {} }) => {
  const icons = {
    'clipboard-list': ClipboardList,
    'calendar-days': CalendarDays,
    'file-text': FileText,
    'lock-keyhole': LockKeyhole,
    'plus-circle': PlusCircle,
    upload: Upload,
    user: User
  };
  const LucideIcon = icons[name];
  return LucideIcon
    ? <LucideIcon size={size} color={color} strokeWidth={2} style={style} aria-hidden="true" />
    : null;
};

const PUBLISHER_POD_PRICING = {
  bw: { 20: 2.25, 24: 2.35, 28: 2.45, 32: 2.55, 36: 2.65, 40: 2.75, 44: 2.85, 48: 2.95, 52: 3.05, 56: 3.15, 60: 3.25, 64: 3.35, 68: 3.45, 72: 3.55, 76: 3.65, 80: 3.75 },
  color: { 20: 2.25, 24: 2.35, 28: 2.45, 32: 2.55, 36: 2.65, 40: 2.75, 44: 2.85, 48: 2.95, 52: 3.05, 56: 3.15, 60: 3.25, 64: 3.35, 68: 3.45, 72: 3.55, 76: 3.65, 80: 3.75 }
};

const defaultPodDeadline = () => {
  const date = new Date();
  date.setDate(date.getDate() + 21);
  return date.toISOString().slice(0, 10);
};

const formatScheduleDate = (value) => {
  if (!value) return 'TBA';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
};

const isSkippedCatalogCycle = (cycle) => (
  cycle?.importSkipped === true
  || cycle?.sourceAvailable === false
  || cycle?.catalogDate === '2025-09-01'
);

const createCoverThumbnail = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('The cover image could not be read. Please choose another JPG or PNG.'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('The cover image could not be processed. Please choose another JPG or PNG.'));
    image.onload = () => {
      const maxWidth = 480;
      const maxHeight = 720;
      const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('The cover thumbnail could not be created.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      resolve(canvas.toDataURL(outputType, 0.86));
    };
    image.src = String(reader.result || '');
  };
  reader.readAsDataURL(file);
});

const createPublisherLogoPreview = (file) => new Promise((resolve, reject) => {
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    reject(new Error('Please choose a JPG or PNG logo.'));
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    reject(new Error('The logo must be 5 MB or smaller.'));
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => reject(new Error('The logo could not be read. Please choose another file.'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('The logo could not be processed. Please choose another JPG or PNG.'));
    image.onload = () => {
      if (Math.max(image.width, image.height) < 600) {
        reject(new Error('Please upload a higher-resolution logo: its longest side must be at least 600 pixels (2 inches at 300 DPI).'));
        return;
      }

      const maxSide = 1200;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('The logo preview could not be created.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      resolve({
        dataUrl: canvas.toDataURL(outputType, 0.9),
        width: image.width,
        height: image.height
      });
    };
    image.src = String(reader.result || '');
  };
  reader.readAsDataURL(file);
});

export default function PublisherPortal({ user, onSessionUpdate, activeSection = 'dashboard', setActiveSection }) {
  const assetPath = (path) => `${window.location.protocol === 'file:' ? './public/assets' : '/assets'}/${path}`;
  const currentHour = new Date().getHours();
  const timeGreeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';
  const [titles, setTitles] = useState(() => user.authProvider === 'supabase' ? [] : db.getTitles().filter(t => t.publisherId === user.uid));
  const [publisherInventory] = useState(() => db.getInventory().filter(record => record.publisherName === user.companyName));
  const [orders] = useState(() => db.getOrders());
  const [purchaseOrders] = useState(() => db.generatePurchaseOrders().filter(po => po.publisherId === user.uid));
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState(null);
  const [standalonePodOrders, setStandalonePodOrders] = useState(() => db.getPublisherStandalonePodOrders(user));
  const [podOrderMessage, setPodOrderMessage] = useState('');
  const [podOrderForm, setPodOrderForm] = useState(() => ({
    titleId: titles[0]?.titleId || '',
    quantity: 100,
    requestedDeadline: defaultPodDeadline(),
    proofPreference: 'Digital proof',
    usePhilboPodLogo: false,
    publisherShipToAddress: user.mailingAddress || [
      user.shippingName || user.companyName,
      user.shippingAddress1,
      user.shippingAddress2,
      [user.shippingCity, user.shippingState, user.shippingZip].filter(Boolean).join(', '),
      user.shippingCountry
    ].filter(Boolean).join('\n'),
    additionalInformation: ''
  }));
  const [liveSales] = useState(() => db.getPublisherLiveSales(user));
  const [profileForm, setProfileForm] = useState(() => ({
    publisherLogoUrl: user.publisherLogoUrl || '',
    publisherLogoFileName: user.publisherLogoFileName || '',
    mailingAddress: user.mailingAddress || '',
    primaryPhone: user.primaryPhone || user.phone || '',
    publisherEmail: user.publisherEmail || user.email || '',
    ccEmail1: user.ccEmail1 || '',
    ccEmail2: user.ccEmail2 || '',
    outsidePrinter: user.outsidePrinter || '',
    contactName: user.contactName || user.primaryContact || '',
    secondaryPhoneAndContact: user.secondaryPhoneAndContact || '',
    facebookGroupStatus: user.facebookGroupStatus || '',
    formResponseEmail: user.formResponseEmail || ''
  }));
  const [profileMessage, setProfileMessage] = useState('');
  const [logoUploadMessage, setLogoUploadMessage] = useState('');
  const [isLogoProcessing, setIsLogoProcessing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  
  // Step navigation: 1 = Basic Info, 2 = Catalog & Release, 3 = Creators & Description, 4 = Specs, 5 = Files & Media
  const [formStep, setFormStep] = useState(1);

  // Form states - Step 1: Basic Info
  const [title, setTitle] = useState('');
  const [seriesName, setSeriesName] = useState('');
  const [issueNumber, setIssueNumber] = useState('');
  const [variantNumber, setVariantNumber] = useState('A');
  const [coverDescription, setCoverDescription] = useState('');
  const [language, setLanguage] = useState('English');
  const [bookFormat, setBookFormat] = useState('Single Issue');
  const [seriesType, setSeriesType] = useState('Ongoing');
  const [seriesFrequency, setSeriesFrequency] = useState('Monthly');
  const [ageRange, setAgeRange] = useState('Teen');

  // Form states - Step 2: Catalog & Release
  const [catalogDate, setCatalogDate] = useState('2026-07-01');
  const [focDate, setFocDate] = useState('2026-07-20');
  const [releaseDate, setReleaseDate] = useState('2026-08-15');
  const [msrp, setMsrp] = useState('');
  const [availableForReorder, setAvailableForReorder] = useState('Yes');
  const [reprint, setReprint] = useState('No');
  const [printingNumber, setPrintingNumber] = useState('1');

  // Form states - Step 3: Creators & Description
  const [writer, setWriter] = useState('');
  const [artist, setArtist] = useState('');
  const [coverArtist, setCoverArtist] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [description, setDescription] = useState('');
  const [bisac1, setBisac1] = useState('CGN004030');
  const [bisac2, setBisac2] = useState('');
  const [bisac3, setBisac3] = useState('');

  // Form states - Step 4: Specs
  const [seriesCode, setSeriesCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [pageCount, setPageCount] = useState('32');
  const [colorProfile, setColorProfile] = useState('Color');
  const [width, setWidth] = useState('6.625');
  const [height, setHeight] = useState('10.25');
  const [weight, setWeight] = useState('0.175'); // default to lbs
  const [fulfillmentMethod, setFulfillmentMethod] = useState('Philbo POD');

  // Form states - Step 5: Files & Media
  const [coverUrl, setCoverUrl] = useState('');
  const [interiorPdf, setInteriorPdf] = useState(null);
  const [interiorPreflight, setInteriorPreflight] = useState(null);
  const [isInteriorPreflighting, setIsInteriorPreflighting] = useState(false);
  const [coverArtFile, setCoverArtFile] = useState(null);
  const [isCoverThumbnailLoading, setIsCoverThumbnailLoading] = useState(false);
  const [marketingImage, setMarketingImage] = useState(null);
  const [additionalAsset, setAdditionalAsset] = useState(null);
  const [trailerLink, setTrailerLink] = useState('');

  // Catalog Cycles list and selection state
  const [cycles, setCycles] = useState(() => user.authProvider === 'supabase' ? [] : db.getCatalogCycles());
  const [cycleId, setCycleId] = useState('');

  useEffect(() => {
    if (user.authProvider !== 'supabase') return undefined;
    let active = true;
    Promise.all([loadPublisherTitles(user.organizationId), loadPublisherCatalogCycles()])
      .then(([productionTitles, productionCycles]) => {
        if (!active) return;
        setTitles(productionTitles);
        setCycles(productionCycles);
      })
      .catch(loadError => {
        if (active) setError(loadError.message || 'Publisher data could not be loaded.');
      });
    return () => { active = false; };
  }, [user.authProvider, user.organizationId]);

  // Advanced workflow states
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [editingTitleStatus, setEditingTitleStatus] = useState('');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedWebsiteTitle, setSelectedWebsiteTitle] = useState(null);

  // Status & Progress states
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState('');

  // Calculated PHILBO ID
  const [philboId, setPhilboId] = useState('');

  useEffect(() => {
    if (seriesCode || barcode) {
      setPhilboId(db.generatePhilboId(seriesCode, barcode));
    } else {
      setPhilboId('');
    }
  }, [seriesCode, barcode]);

  const handleFulfillmentMethodChange = (nextMethod) => {
    if (nextMethod === 'Inventory' && fulfillmentMethod !== 'Inventory') {
      const confirmed = window.confirm(
        'Selecting Inventory fulfillment changes your Philbo distribution fee to 15% for the entire Publisher account, including POD titles. This covers receiving, storage, shortages, damages, late arrivals, and inventory handling. Switching back to POD will not automatically lower the rate; only Philbo Admin can adjust it. Do you acknowledge and want to continue?'
      );
      if (!confirmed) return;
      try {
        const updatedUser = db.applyInventoryFulfillmentCommission(user.uid, user.companyName);
        if (onSessionUpdate) onSessionUpdate(updatedUser);
      } catch (err) {
        setError(err.message || 'Unable to apply the Inventory fulfillment rule.');
        return;
      }
    }
    setFulfillmentMethod(nextMethod);
  };

  const setPodOrderField = (field, value) => {
    setPodOrderForm(current => ({ ...current, [field]: value }));
    setPodOrderMessage('');
  };

  const submitStandalonePodOrder = (event) => {
    event.preventDefault();
    setPodOrderMessage('');
    try {
      const order = db.submitPublisherStandalonePodOrder(podOrderForm);
      setStandalonePodOrders(db.getPublisherStandalonePodOrders(user));
      setPodOrderMessage(`${order.podOrderId} was submitted. ${order.subtotal == null ? 'Philbo will review the specifications and prepare a quote.' : `Estimated printing: $${order.subtotal.toFixed(2)} before shipping and tax.`}`);
      setPodOrderForm(current => ({ ...current, quantity: 100, requestedDeadline: defaultPodDeadline(), usePhilboPodLogo: false, additionalInformation: '' }));
    } catch (err) {
      setPodOrderMessage(err.message || 'The POD order could not be submitted.');
    }
  };

  // Catalog submission checks. Print-file preflight happens later in production.
  const [currentPreflightStep, setCurrentPreflightStep] = useState(-1);
  const preflightChecks = [
    { label: 'Required catalog fields complete', status: 'pending' },
    { label: 'Catalog cycle and dates assigned', status: 'pending' },
    { label: 'Pricing and distribution codes verified', status: 'pending' },
    { label: 'Customer-facing description checked', status: 'pending' },
    { label: 'Catalog cover image ready', status: 'pending' }
  ];
  const [preflightState, setPreflightState] = useState(preflightChecks);
  const [preflightWarnings, setPreflightWarnings] = useState([]);

  const setProfileField = (field, value) => {
    setProfileForm(current => ({ ...current, [field]: value }));
    setProfileMessage('');
  };

  const saveCompanyProfile = (event) => {
    event.preventDefault();
    try {
      const updatedUser = db.updatePublisherProfile(user.uid, profileForm);
      if (onSessionUpdate) onSessionUpdate(updatedUser);
      setProfileMessage('Company profile saved successfully.');
    } catch (saveError) {
      setProfileMessage(saveError.message || 'The company profile could not be saved.');
    }
  };

  const handlePublisherLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoUploadMessage('');
    setIsLogoProcessing(true);
    try {
      const logo = await createPublisherLogoPreview(file);
      setProfileForm(current => ({
        ...current,
        publisherLogoUrl: logo.dataUrl,
        publisherLogoFileName: file.name
      }));
      setLogoUploadMessage(`${file.name} is ready (${logo.width} × ${logo.height} px). Save the company profile to keep it.`);
    } catch (uploadError) {
      setLogoUploadMessage(uploadError.message || 'The logo could not be prepared.');
      event.target.value = '';
    } finally {
      setIsLogoProcessing(false);
    }
  };

  const handlePasswordChange = () => {
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
      setPasswordMessage('Password changed successfully.');
    } catch (passwordError) {
      setPasswordMessage(passwordError.message || 'The password could not be changed.');
    }
  };

  // Calculate sales stats for this publisher
  let totalUnitsSold = 0;
  let totalMSRPRevenue = 0;
  let totalWholesaleRevenue = 0;
  let totalCommissionDue = 0;

  orders.forEach(order => {
    order.items.forEach(item => {
      if (item.publisherId === user.uid) {
        totalUnitsSold += item.qty;
        totalMSRPRevenue += (item.qty * item.msrp);
        totalWholesaleRevenue += (item.qty * item.wholesalePrice);
        totalCommissionDue += ((item.qty * item.msrp) * user.commissionRate);
      }
    });
  });

  const netPublisherPay = totalWholesaleRevenue - totalCommissionDue;

  // Monthly Sales Line Chart coordinates generator
  const monthlyData = [120, 180, 160, 240, 210, Math.max(140, totalUnitsSold * 3)];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const chartHeight = 80;
  const chartWidth = 280;
  const maxDataVal = 300; 

  const points = monthlyData.map((val, idx) => {
    const x = (idx * (chartWidth / (monthlyData.length - 1)));
    const y = chartHeight - (val / maxDataVal) * (chartHeight - 15);
    return { x, y, val };
  });

  const pointsPath = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = `${points[0].x},${chartHeight} ${pointsPath} ${points[points.length - 1].x},${chartHeight}`;

  // Find best seller
  const titleSales = {};
  orders.forEach(o => o.items.forEach(i => {
    if (i.publisherId === user.uid) {
      titleSales[i.titleName] = (titleSales[i.titleName] || 0) + i.qty;
    }
  }));
  let bestSeller = 'N/A';
  let maxQty = 0;
  Object.keys(titleSales).forEach(k => {
    if (titleSales[k] > maxQty) {
      maxQty = titleSales[k];
      bestSeller = k;
    }
  });

  // Action Helpers
  const handleStartEdit = (item) => {
    setEditingTitleId(item.titleId);
    setEditingTitleStatus(item.status);
    
    // Step 1
    setTitle(item.title || '');
    setCycleId(item.cycleId || '');
    setSeriesName(item.seriesName || '');
    setIssueNumber(item.issueNumber || '');
    setVariantNumber(item.variantNumber || 'A');
    setCoverDescription(item.coverDescription || '');
    setLanguage(item.language || 'English');
    setBookFormat(item.bookFormat || 'Single Issue');
    setSeriesType(item.seriesType || 'Ongoing');
    setSeriesFrequency(item.seriesFrequency || 'Monthly');
    setAgeRange(item.ageRange || 'Teen');

    // Step 2
    setCatalogDate(item.catalogDate || '2026-07-01');
    setFocDate(item.focDate || '2026-07-20');
    setReleaseDate(item.releaseDate || '2026-08-15');
    setMsrp(item.msrp ? item.msrp.toString() : '');
    setAvailableForReorder(item.availableForReorder || 'Yes');
    setReprint(item.reprint || 'No');
    setPrintingNumber(item.printingNumber ? item.printingNumber.toString() : '1');

    // Step 3
    setWriter(item.writer || '');
    setArtist(item.artist || '');
    setCoverArtist(item.coverArtist || '');
    setSynopsis(item.synopsis || '');
    setDescription(item.description || '');
    setBisac1(item.bisac1 || 'CGN004030');
    setBisac2(item.bisac2 || '');
    setBisac3(item.bisac3 || '');

    // Step 4
    setSeriesCode(item.seriesCode || '');
    setBarcode(item.barcode || '');
    setPageCount(item.pageCount ? item.pageCount.toString() : '32');
    setColorProfile(item.colorProfile || 'Color');
    setWidth(item.width ? item.width.toString() : '6.625');
    setHeight(item.height ? item.height.toString() : '10.25');
    setWeight(item.weight ? item.weight.toString() : '0.175');
    setFulfillmentMethod(item.fulfillmentMethod === 'Publisher Fulfilled' ? 'Inventory' : (item.fulfillmentMethod || 'Philbo POD'));

    // Step 5
    setCoverUrl(item.coverUrl || '');
    setTrailerLink(item.trailerLink || '');
    
    setFormStep(1);
    setActiveSection('submit-title');
  };

  const handleCancelEdit = () => {
    setEditingTitleId(null);
    setEditingTitleStatus('');
    
    // Clear all
    setTitle('');
    setCycleId('');
    setSeriesName('');
    setIssueNumber('');
    setVariantNumber('A');
    setCoverDescription('');
    setLanguage('English');
    setBookFormat('Single Issue');
    setSeriesType('Ongoing');
    setSeriesFrequency('Monthly');
    setAgeRange('Teen');
    setCatalogDate('2026-07-01');
    setFocDate('2026-07-20');
    setReleaseDate('2026-08-15');
    setMsrp('');
    setAvailableForReorder('Yes');
    setReprint('No');
    setPrintingNumber('1');
    setWriter('');
    setArtist('');
    setCoverArtist('');
    setSynopsis('');
    setDescription('');
    setBisac1('CGN004030');
    setBisac2('');
    setBisac3('');
    setSeriesCode('');
    setBarcode('');
    setPageCount('32');
    setColorProfile('Color');
    setWidth('6.625');
    setHeight('10.25');
    setWeight('0.175');
    setFulfillmentMethod('Philbo POD');
    setCoverUrl('');
    setInteriorPdf(null);
    setInteriorPreflight(null);
    setIsInteriorPreflighting(false);
    setCoverArtFile(null);
    setIsCoverThumbnailLoading(false);
    setMarketingImage(null);
    setAdditionalAsset(null);
    setTrailerLink('');
    setError('');
  };

  const closeTitleWorkspace = () => {
    setShowPreviewModal(false);
    handleCancelEdit();
    setActiveSection('dashboard');
  };

  useEffect(() => {
    if (activeSection !== 'submit-title' && !showPreviewModal) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') closeTitleWorkspace();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [activeSection, showPreviewModal]);

  useEffect(() => {
    if (!interiorPdf) {
      setInteriorPreflight(null);
      setIsInteriorPreflighting(false);
      return undefined;
    }

    let active = true;
    setIsInteriorPreflighting(true);
    setInteriorPreflight(null);
    inspectInteriorPdf(interiorPdf, { pageCount, width, height })
      .then(report => {
        if (active) setInteriorPreflight(report);
      })
      .catch(() => {
        if (active) setInteriorPreflight({
          status: 'changes-required',
          headline: 'This PDF could not be checked',
          failed: 1,
          warnings: 0,
          checks: [{ id: 'opens', label: 'PDF opens correctly', status: 'fail', detail: 'The file may be damaged, encrypted, or not a valid PDF.' }]
        });
      })
      .finally(() => {
        if (active) setIsInteriorPreflighting(false);
      });

    return () => { active = false; };
  }, [interiorPdf, pageCount, width, height]);

  const handleFileChange = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      setError('File size exceeds the 50MB distribution limit.');
      e.target.value = '';
      return;
    }

    if (type === 'interior') {
      if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
        setError('Only PDF documents are accepted for interior print files.');
        setInteriorPreflight(null);
        e.target.value = '';
        return;
      }
    }

    if (type === 'cover-art') {
      const fileName = file.name.toLowerCase();
      const isJpeg = file.type === 'image/jpeg' || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg');
      const isPng = file.type === 'image/png' || fileName.endsWith('.png');
      if (!isJpeg && !isPng) {
        setError('High-resolution cover art must be a JPG or PNG image. PDF files are not accepted.');
        e.target.value = '';
        return;
      }
    }

    setError('');
    if (type === 'interior') setInteriorPdf(file);
    else if (type === 'cover-art') {
      setCoverArtFile(file);
      setIsCoverThumbnailLoading(true);
      try {
        setCoverUrl(await createCoverThumbnail(file));
      } catch (thumbnailError) {
        setCoverArtFile(null);
        setCoverUrl('');
        setError(thumbnailError.message || 'The cover thumbnail could not be created.');
        e.target.value = '';
      } finally {
        setIsCoverThumbnailLoading(false);
      }
    }
    else if (type === 'marketing') setMarketingImage(file);
    else if (type === 'asset') setAdditionalAsset(file);
  };

  // Step Nav validation
  const validateStep = () => {
    setError('');
    if (formStep === 1) {
      if (!title || !seriesName || !issueNumber) {
        setError('Title, Series Name, and Issue Number are required core fields.');
        return false;
      }
    } else if (formStep === 2) {
      if (!cycleId) {
        setError('Selecting a Catalog Cycle is required.');
        return false;
      }
      if (!msrp) {
        setError('MSRP Price is required.');
        return false;
      }
      if (parseFloat(msrp) <= 0) {
        setError('MSRP price must be a positive number.');
        return false;
      }
    } else if (formStep === 3) {
      if (!synopsis) {
        setError('A brief synopsis of the book is required.');
        return false;
      }
    } else if (formStep === 4) {
      if (!seriesCode || !barcode) {
        setError('Series Code and Barcode/UPC/EAN are required for distribution.');
        return false;
      }
      const pageCountError = validatePageCountForFormat(bookFormat, pageCount);
      if (pageCountError) {
        setError(pageCountError);
        return false;
      }
      const generatedId = db.generatePhilboId(seriesCode, barcode);
      const duplicateSource = user.authProvider === 'supabase' ? titles : db.getTitles();
      const isDuplicate = duplicateSource.some(t => t.philboId === generatedId && t.titleId !== editingTitleId);
      if (isDuplicate) {
        setError(`Duplicate PHILBO ID detected: "${generatedId}". Change Series Code or Barcode.`);
        return false;
      }
    }
    return true;
  };

  const handleNextStep = () => {
    if (validateStep()) {
      setFormStep(prev => prev + 1);
    }
  };

  const handlePrevStep = () => {
    setError('');
    setFormStep(prev => prev - 1);
  };

  const handleSubmitTitle = (status) => {
    setError('');
    setUploadSuccess(false);

    if (!coverArtFile && !editingTitleId) {
      setError('A high-resolution JPG or PNG cover art file is required.');
      return;
    }

    if (isCoverThumbnailLoading || (!coverUrl && !editingTitleId)) {
      setError('Please wait for the cover thumbnail preview to finish processing.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setCurrentPreflightStep(0);
    setPreflightWarnings([]);
    setPreflightState(preflightChecks.map(c => ({ ...c, status: 'pending' })));

    let stepIndex = 0;
    const interval = setInterval(() => {
      setPreflightState(prev => {
        const nextState = [...prev];
        nextState[stepIndex] = { ...nextState[stepIndex], status: 'verified' };
        return nextState;
      });

      if (stepIndex === 4 && !interiorPdf) {
        setPreflightWarnings(['Interior print files have not been submitted. That is okay for catalog review; upload them later in Title Files before production.']);
      }

      stepIndex += 1;
      setCurrentPreflightStep(stepIndex);
      setUploadProgress(Math.floor((stepIndex / preflightChecks.length) * 100));

      if (stepIndex >= preflightChecks.length) {
        clearInterval(interval);
        
        setTimeout(async () => {
          try {
            const existingTitle = editingTitleId ? titles.find(item => item.titleId === editingTitleId) : null;
            const titleDataPayload = {
              title,
              description,
              msrp: parseFloat(msrp),
              coverUrl: coverUrl || 'https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?q=80&w=400&auto=format&fit=crop',
              interiorPdfName: interiorPdf ? interiorPdf.name : (editingTitleId ? 'Preserved' : 'N/A'),
              filePreflight: interiorPreflight || existingTitle?.filePreflight || null,
              coverArtFileName: coverArtFile
                ? coverArtFile.name
                : (titles.find(item => item.titleId === editingTitleId)?.coverArtFileName || titles.find(item => item.titleId === editingTitleId)?.coverArtPdfName || ''),
              focDate,
              releaseDate,
              barcode,
              seriesName,
              issueNumber,
              language,
              coverDescription,
              variantNumber,
              bookFormat,
              seriesType,
              seriesCode,
              seriesFrequency,
              ageRange,
              pageCount: parseInt(pageCount),
              bisac1,
              bisac2,
              bisac3,
              synopsis,
              reprint,
              printingNumber: parseInt(printingNumber),
              writer,
              artist,
              coverArtist,
              colorProfile,
              width: parseFloat(width),
              height: parseFloat(height),
              weight: parseFloat(weight),
              availableForReorder,
              fulfillmentMethod,
              catalogDate,
              trailerLink,
              cycleId
            };

            if (user.authProvider === 'supabase') {
              const savedTitleId = await savePublisherTitle({
                titleId: editingTitleId,
                organizationId: user.organizationId,
                input: titleDataPayload,
                submitForReview: false
              });
              const pendingFiles = [
                ['downloadable_cover', coverArtFile],
                ['interior_print_pdf', interiorPdf],
                ['marketing_image', marketingImage],
                ['additional_asset', additionalAsset]
              ].filter(([, file]) => file);
              for (let fileIndex = 0; fileIndex < pendingFiles.length; fileIndex += 1) {
                const [fileType, file] = pendingFiles[fileIndex];
                await uploadTitleFileToDrive({
                  titleId: savedTitleId,
                  fileType,
                  file,
                  onProgress: fileProgress => {
                    const completed = fileIndex / Math.max(1, pendingFiles.length);
                    const current = fileProgress / 100 / Math.max(1, pendingFiles.length);
                    setUploadProgress(Math.round((completed + current) * 100));
                  }
                });
              }
              if (status === 'Submitted for Review') await submitPublisherTitleForReview(savedTitleId);
              setTitles(await loadPublisherTitles(user.organizationId));
            } else if (editingTitleId) {
              db.editTitle(editingTitleId, titleDataPayload, status, user.companyName);
            } else {
              db.submitTitle({ ...titleDataPayload, status }, user.uid, user.companyName);
              setTitles(db.getTitles().filter(t => t.publisherId === user.uid));
            }

            handleCancelEdit();
            setUploadSuccess(true);
            
            // Go back to dashboard or my titles
            setTimeout(() => {
              setActiveSection('dashboard');
              setUploadSuccess(false);
            }, 2000);

          } catch (err) {
            setError(err.message);
          } finally {
            setIsUploading(false);
          }
        }, 1200);
      }
    }, 900);
  };

  const handleOpenSubmissionPreview = () => {
    setError('');
    if (isCoverThumbnailLoading) {
      setError('Please wait for the cover thumbnail preview to finish processing.');
      return;
    }
    if (!coverUrl) {
      setError('Upload the high-resolution JPG or PNG cover art before opening the website listing preview.');
      return;
    }
    setShowPreviewModal(true);
  };

  // Compile Needs Attention Action items dynamically
  const attentionItems = [];
  titles.forEach(t => {
    if (!t.coverUrl || t.coverUrl.includes('placeholder')) {
      attentionItems.push({
        id: `cover-${t.titleId}`,
        type: 'error',
        label: 'Missing Cover Image File',
        desc: `No cover art found for "${t.title}".`,
        actionText: 'Upload File',
        action: () => handleStartEdit(t)
      });
    }
    if (t.interiorPdfName === 'N/A' || !t.interiorPdfName) {
      attentionItems.push({
        id: `pdf-${t.titleId}`,
        type: 'error',
        label: 'Missing Interior PDF Asset',
        desc: `Print files required for POD check on "${t.title}".`,
        actionText: 'Upload File',
        action: () => handleStartEdit(t)
      });
    }
    if (!t.focDate) {
      attentionItems.push({
        id: `foc-${t.titleId}`,
        type: 'warning',
        label: 'FOC Date Required',
        desc: `A final cutoff date must be assigned to "${t.title}".`,
        actionText: 'Edit Title',
        action: () => handleStartEdit(t)
      });
    }
    if (t.status === 'Changes Requested') {
      attentionItems.push({
        id: `notes-${t.titleId}`,
        type: 'warning',
        label: 'Revision Requested by Philbo',
        desc: `"${t.title}" requires updates: ${t.reviewNotes || 'Check layout guidelines.'}`,
        actionText: 'Review Notes',
        action: () => handleStartEdit(t)
      });
    }
  });

  const selectedPodTitle = titles.find(item => item.titleId === podOrderForm.titleId) || null;
  const selectedPodColor = /b&w|black|gray|grey/i.test(String(selectedPodTitle?.colorProfile || '')) ? 'bw' : 'color';
  const selectedPodUnitPrice = selectedPodTitle ? PUBLISHER_POD_PRICING[selectedPodColor]?.[Number(selectedPodTitle.pageCount)] ?? null : null;
  const selectedPodBaseEstimate = selectedPodUnitPrice == null ? null : Number((selectedPodUnitPrice * Math.max(1, Number(podOrderForm.quantity) || 0)).toFixed(2));
  const selectedPodDiscount = selectedPodBaseEstimate == null || !podOrderForm.usePhilboPodLogo ? 0 : Number((selectedPodBaseEstimate * 0.05).toFixed(2));
  const selectedPodEstimate = selectedPodBaseEstimate == null ? null : Number((selectedPodBaseEstimate - selectedPodDiscount).toFixed(2));
  const selectedPodFilesReady = Boolean(selectedPodTitle && (selectedPodTitle.coverFileName || selectedPodTitle.coverArtFile || selectedPodTitle.coverArtPdfName) && (selectedPodTitle.interiorFileName || selectedPodTitle.interiorPdfFile || selectedPodTitle.interiorPdfName));
  const sortedSchedule = [...cycles].sort((a, b) => String(a.catalogDate).localeCompare(String(b.catalogDate)));
  const todayKey = new Date().toISOString().slice(0, 10);
  const currentScheduleIndex = sortedSchedule.reduce(
    (latestIndex, cycle, index) => cycle.catalogDate <= todayKey ? index : latestIndex,
    0
  );
  const currentSchedule = sortedSchedule[currentScheduleIndex] || null;
  const visibleSchedule = sortedSchedule.slice(currentScheduleIndex, currentScheduleIndex + 4);

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* 1. DASHBOARD OVERVIEW SECTION */}
      {activeSection === 'dashboard' && (
        <div className="publisher-dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* Header */}
          <div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#fff', letterSpacing: '0.02em', textTransform: 'none' }}>
              {timeGreeting}, {user.companyName}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
              Here’s what needs your attention today.
            </p>
          </div>

          {/* 4 Compact Summary Cards */}
          <div className="publisher-dashboard-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Live Titles</span>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff', marginTop: '6px' }}>
                {titles.filter(t => isTitlePublished(t.status)).length}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--green-primary)', marginTop: '4px', fontWeight: '500' }}>Active in distributor catalog</span>
            </div>
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Awaiting Approval</span>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--gold-primary)', marginTop: '6px' }}>
                {titles.filter(t => isTitlePendingReview(t.status)).length}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Pending catalog listing review</span>
            </div>
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Upcoming FOC Dates</span>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff', marginTop: '6px' }}>
                {titles.filter(t => !t.focLocked && new Date(t.focDate) > new Date()).length}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Unconfirmed order cutoffs</span>
            </div>
            <button
              type="button"
              className="glass-panel publisher-dashboard-stat-link"
              onClick={() => setActiveSection('purchase-orders')}
              aria-label={`Open official purchase orders. ${purchaseOrders.length} available.`}
              style={{ padding: '20px', display: 'flex', flexDirection: 'column', position: 'relative' }}
            >
              <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Official Purchase Orders</span>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff', marginTop: '6px' }}>
                {purchaseOrders.length}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Created after Catalog Cycle FOC closes · Open POs →</span>
            </button>
          </div>

          <section className="glass-panel publisher-schedule-panel" aria-labelledby="publisher-schedule-heading">
            <div className="publisher-schedule-heading">
              <div className="publisher-schedule-title">
                <span className="publisher-schedule-icon"><Icon name="calendar-days" size={20} /></span>
                <div>
                  <span>IMPORTANT PUBLISHING DATES</span>
                  <h3 id="publisher-schedule-heading">Catalog &amp; Release Schedule</h3>
                  <p>Use these official dates when planning submissions, retailer ordering, printing, and release announcements.</p>
                </div>
              </div>
              <span className="publisher-schedule-help">FOC is the final retailer order cutoff.</span>
            </div>

            {currentSchedule && (
              <div className="publisher-current-cycle">
                <div className="publisher-current-cycle-label">
                  <span>CURRENT CATALOG CYCLE</span>
                  <strong>{formatScheduleDate(currentSchedule.catalogDate)}</strong>
                </div>
                <div className="publisher-current-cycle-date">
                  <span>Catalog Release</span>
                  <strong>{formatScheduleDate(currentSchedule.catalogDate)}</strong>
                </div>
                <div className="publisher-current-cycle-date foc">
                  <span>FOC Deadline</span>
                  <strong>{formatScheduleDate(currentSchedule.focDate)}</strong>
                </div>
                <div className="publisher-current-cycle-date">
                  <span>In-Store Release</span>
                  <strong>{formatScheduleDate(currentSchedule.releaseDate)}</strong>
                </div>
              </div>
            )}

            <div className="publisher-schedule-table-wrap">
              <table className="publisher-schedule-table">
                <thead>
                  <tr>
                    <th>Catalog Release Date</th>
                    <th>FOC Date</th>
                    <th>Store Release Date</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSchedule.map((cycle, index) => (
                    <tr key={cycle.cycleId} className={[index === 0 ? 'current' : '', isSkippedCatalogCycle(cycle) ? 'skipped' : ''].filter(Boolean).join(' ')}>
                      <td data-label="Catalog Release">{formatScheduleDate(cycle.catalogDate)}{index === 0 && <span className="publisher-schedule-current-tag">Current</span>}{isSkippedCatalogCycle(cycle) && <span className="publisher-schedule-skipped-tag">CSV missing — skipped</span>}</td>
                      <td data-label="FOC Date">{formatScheduleDate(cycle.focDate)}</td>
                      <td data-label="Store Release">{formatScheduleDate(cycle.releaseDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="publisher-full-schedule">
              <summary>View complete schedule ({sortedSchedule.length} catalog cycles)</summary>
              <div className="publisher-schedule-table-wrap">
                <table className="publisher-schedule-table publisher-schedule-table-full">
                  <thead>
                    <tr>
                      <th>Catalog Release Date</th>
                      <th>FOC Date</th>
                      <th>Store Release Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSchedule.map(cycle => (
                      <tr key={`full-${cycle.cycleId}`} className={[cycle.cycleId === currentSchedule?.cycleId ? 'current' : '', isSkippedCatalogCycle(cycle) ? 'skipped' : ''].filter(Boolean).join(' ')}>
                        <td data-label="Catalog Release">{formatScheduleDate(cycle.catalogDate)}{cycle.cycleId === currentSchedule?.cycleId && <span className="publisher-schedule-current-tag">Current</span>}{isSkippedCatalogCycle(cycle) && <span className="publisher-schedule-skipped-tag">CSV missing — skipped</span>}</td>
                        <td data-label="FOC Date">{formatScheduleDate(cycle.focDate)}</td>
                        <td data-label="Store Release">{formatScheduleDate(cycle.releaseDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          {/* Grid Layout: Left 2 columns, Right 1 column */}
          <div className="publisher-dashboard-main-grid">
            
            {/* Left Main Column: Needs Attention & My Titles */}
            <div className="publisher-dashboard-column">
              
              {/* Needs Attention */}
              <div className="glass-panel publisher-dashboard-needs" style={{ padding: '25px' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '15px', letterSpacing: '0.03em' }}>NEEDS ATTENTION</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {attentionItems.length === 0 ? (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>✓ You’re all caught up.</div>
                  ) : (
                    attentionItems.map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: '1px solid #292c31', padding: '12px 18px', borderRadius: '6px', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: item.type === 'error' ? 'var(--red-primary)' : 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{item.type === 'error' ? '🚨' : '⚠️'}</span>
                            {item.label}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '3px' }}>{item.desc}</div>
                        </div>
                        <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={item.action}>
                          {item.actionText}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* My Titles Section (Dashboard View) */}
              <div className="glass-panel publisher-dashboard-titles" style={{ padding: '25px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-secondary)', margin: 0, letterSpacing: '0.03em' }}>MY TITLES</h3>
                  <span onClick={() => setActiveSection('titles')} style={{ fontSize: '0.75rem', color: 'var(--gold-primary)', cursor: 'pointer', fontWeight: '600' }}>View All Titles →</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {titles.slice(0, 4).map(item => (
                    <div key={item.titleId} style={{ display: 'flex', gap: '15px', padding: '15px', background: 'rgba(0,0,0,0.15)', border: '1px solid #292c31', borderRadius: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <img 
                        src={item.coverUrl} 
                        alt={item.title} 
                        onClick={() => setSelectedWebsiteTitle(item)}
                        style={{ width: '50px', height: '75px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #292c31', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                          <span onClick={() => setSelectedWebsiteTitle(item)} style={{ fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(212,175,55,0.45)' }}>{item.title}</span>
                          <span className={`badge ${
                            isTitlePublished(item.status) ? 'badge-green' :
                            item.status === 'Approved' ? 'badge-gold' :
                            isTitlePendingReview(item.status) ? 'badge-secondary' :
                            item.status === 'Changes Requested' ? 'badge-red' : 'badge-muted'
                          }`} style={{ fontSize: '0.65rem' }}>
                            {getTitleStatusLabel(item.status)}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          ID: <strong style={{ color: 'var(--gold-primary)', fontFamily: 'monospace' }}>{item.philboId || 'Generating...'}</strong> | Issue #{item.issueNumber} | Variant {item.variantNumber}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          FOC: {item.focDate} | Release: {item.releaseDate}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => setSelectedWebsiteTitle(item)}>
                          Website Listing
                        </button>
                        {!isTitlePendingReview(item.status) && !isTitlePublished(item.status) && (
                          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => handleStartEdit(item)}>
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Right Main Column: Recent Sales, Open POs & Quick Actions */}
            <div className="publisher-dashboard-column">
              
              {/* Quick Actions */}
              <div className="glass-panel publisher-dashboard-quick-actions" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '15px', letterSpacing: '0.03em' }}>QUICK ACTIONS</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                  <button className="btn btn-secondary" style={{ padding: '8px 10px', fontSize: '0.75rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { handleCancelEdit(); setActiveSection('submit-title'); }}>
                    <Icon name="plus-circle" size={14} /> Submit New Title
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '8px 10px', fontSize: '0.75rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setActiveSection('title-files')}>
                    <Icon name="file-text" size={14} /> Upload Title Files
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '8px 10px', fontSize: '0.75rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setActiveSection('purchase-orders')}>
                    <Icon name="clipboard-list" size={14} /> View Purchase Orders
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '8px 10px', fontSize: '0.75rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setActiveSection('pod-projects')}>
                    <Icon name="file-text" size={14} /> Order POD Printing
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '8px 10px', fontSize: '0.75rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setActiveSection('profile')}>
                    <Icon name="user" size={14} /> Edit Company Profile
                  </button>
                </div>
              </div>

              {/* Recent Sales */}
              <div className="glass-panel" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '12px', letterSpacing: '0.03em' }}>RECENT SALES</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Units Sold:</span>
                    <strong style={{ color: '#fff' }}>{totalUnitsSold} units</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Net Sales:</span>
                    <strong style={{ color: 'var(--green-primary)' }}>${netPublisherPay.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Best Seller:</span>
                    <strong style={{ color: 'var(--gold-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{bestSeller}</strong>
                  </div>
                </div>

                <div style={{ position: 'relative', width: '100%', height: '90px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: '100%', height: '100%' }}>
                    <defs>
                      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--gold-primary)" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="var(--gold-primary)" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <polygon points={areaPath} fill="url(#chartGrad)" />
                    <polyline fill="none" stroke="var(--gold-primary)" strokeWidth="2.5" points={pointsPath} style={{ strokeLinejoin: 'round' }} />
                    {points.map((p, idx) => (
                      <circle key={idx} cx={p.x} cy={p.y} r="4" fill="#08090B" stroke="var(--gold-primary)" strokeWidth="1.5" />
                    ))}
                  </svg>
                </div>
              </div>

              {/* Official Purchase Orders */}
              <div className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-secondary)', margin: 0, letterSpacing: '0.03em' }}>OFFICIAL PURCHASE ORDERS</h3>
                  <span onClick={() => setActiveSection('purchase-orders')} style={{ fontSize: '0.7rem', color: 'var(--gold-primary)', cursor: 'pointer', fontWeight: '600' }}>View All →</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {purchaseOrders.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No official POs yet. Live sales remain visible until the FOC closes.</div>
                  ) : (
                    purchaseOrders.slice(0, 3).map(po => (
                      <div key={po.poNumber} onClick={() => setSelectedPurchaseOrder(po)} style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.15)', border: '1px solid #292c31', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                        <div>
                          <span style={{ fontWeight: 'bold', color: 'var(--gold-primary)' }}>{po.poNumber}</span>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Release: {po.targetReleaseMonth}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 'bold', color: '#fff' }}>${po.netDueToPublisher.toFixed(2)}</span>
                          <div style={{ fontSize: '0.7rem', color: 'var(--green-primary)', marginTop: '2px' }}>Open actual PO →</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* 2. MY TITLES CATALOG VIEW */}
      {activeSection === 'titles' && (
        <div className="glass-panel" style={{ padding: '30px' }}>
          <h3 style={{ borderBottom: '1px solid var(--border-glow)', paddingBottom: '15px', marginBottom: '20px', color: 'var(--gold-primary)', fontSize: '1.2rem' }}>
            YOUR COMPLETE CATALOG ({titles.length})
          </h3>
          {titles.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No titles submitted yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
              {titles.map(item => (
                <div key={item.titleId} style={{ display: 'flex', gap: '15px', padding: '15px', background: 'rgba(0,0,0,0.2)', border: '1px solid #292c31', borderRadius: '8px' }}>
                  <img 
                    src={item.coverUrl} 
                    alt={item.title} 
                    onClick={() => setSelectedWebsiteTitle(item)}
                    style={{ width: '80px', height: '120px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #292c31', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <strong onClick={() => setSelectedWebsiteTitle(item)} style={{ fontSize: '0.9rem', color: '#fff', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(212,175,55,0.45)' }}>{item.title}</strong>
                        <span className={`badge ${
                          isTitlePublished(item.status) ? 'badge-green' :
                          item.status === 'Approved' ? 'badge-gold' :
                          isTitlePendingReview(item.status) ? 'badge-secondary' :
                          item.status === 'Changes Requested' ? 'badge-red' : 'badge-muted'
                        }`} style={{ fontSize: '0.6rem' }}>
                          {getTitleStatusLabel(item.status)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                        PHILBO ID: <strong style={{ color: 'var(--gold-primary)', fontFamily: 'monospace' }}>{item.philboId || 'N/A'}</strong>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Issue #{item.issueNumber} | Variant {item.variantNumber} | MSRP: ${item.msrp.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Cycle: <span style={{ color: '#fff', fontWeight: '500' }}>{
                          cycles.find(c => c.cycleId === item.cycleId)?.cycleName || 'Default Custom Cycle'
                        }</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        FOC Date: <strong style={{ color: item.focLocked ? 'var(--red-primary)' : 'var(--green-primary)' }}>{item.focDate} ({item.focLocked ? 'Locked' : 'Open'})</strong> | Release: {item.releaseDate}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Fulfillment: <strong style={{ color: 'var(--gold-primary)' }}>{item.fulfillmentMethod || 'Publisher Fulfilled'}</strong>
                      </div>
                      {publisherInventory.some(record => record.titleId === item.titleId || record.philboId === item.philboId) && (() => {
                        const inventory = publisherInventory.find(record => record.titleId === item.titleId || record.philboId === item.philboId);
                        return <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '3px' }}>Inventory: <strong style={{ color: 'var(--green-primary)' }}>{inventory.available} available</strong> · {inventory.onHand} on hand · {inventory.incoming} incoming</div>;
                      })()}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.7rem' }} onClick={() => setSelectedWebsiteTitle(item)}>
                        Website Listing
                      </button>
                      {!isTitlePendingReview(item.status) && !isTitlePublished(item.status) ? (
                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.7rem' }} onClick={() => handleStartEdit(item)}>
                          Edit Info
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>🔒 Locked</span>
                      )}
                      <span style={{ fontSize: '0.7rem', color: item.focLocked ? 'var(--red-primary)' : 'var(--green-primary)' }}>
                        {item.focLocked ? '🔒 Locked' : '🔓 Open'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. SUBMIT NEW TITLE PAGE */}
      {activeSection === 'submit-title' && (
        <div id="submit-form-panel" className="glass-panel" style={{ padding: '30px' }}>
          <div className="publisher-title-workspace-header">
            <h3>{editingTitleId ? 'EDIT COMIC SOLICITATION' : 'SUBMIT NEW TITLE'}</h3>
            <button type="button" className="publisher-workspace-close" aria-label="Close title submission and return to Publisher Dashboard" title="Return to Dashboard" onClick={closeTitleWorkspace}>×</button>
          </div>
          
          {editingTitleId && (
            <div style={{ background: 'rgba(198,161,91,0.08)', border: '1px solid var(--gold-primary)', padding: '12px 18px', borderRadius: '6px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem' }}>Editing title: <strong style={{ color: '#fff' }}>{title || 'Untitled'}</strong> (Status: <strong style={{ color: 'var(--gold-primary)' }}>{editingTitleStatus}</strong>)</span>
              <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.7rem' }} onClick={handleCancelEdit}>Cancel Edit</button>
            </div>
          )}

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid var(--red-primary)', color: '#ff8a8a', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontSize: '0.9rem' }}>
              ✕ {error}
            </div>
          )}

          {uploadSuccess && (
            <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid var(--green-primary)', color: '#a5d6a7', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontSize: '0.9rem' }}>
              ✓ Title saved successfully!
            </div>
          )}

          {/* Steps Breadcrumbs */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px', marginBottom: '25px', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span style={{ color: formStep === 1 ? 'var(--gold-primary)' : 'var(--text-muted)' }}>1. Basic Info</span>
            <span style={{ color: formStep === 2 ? 'var(--gold-primary)' : 'var(--text-muted)' }}>2. Catalog</span>
            <span style={{ color: formStep === 3 ? 'var(--gold-primary)' : 'var(--text-muted)' }}>3. Creators</span>
            <span style={{ color: formStep === 4 ? 'var(--gold-primary)' : 'var(--text-muted)' }}>4. Specs</span>
            <span style={{ color: formStep === 5 ? 'var(--gold-primary)' : 'var(--text-muted)' }}>5. Files</span>
          </div>

          <form onSubmit={(e) => e.preventDefault()}>
            
            {/* Step 1: Basic Comic Info */}
            {formStep === 1 && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div className="form-group">
                  <label className="form-label">Publisher House (Read-only)</label>
                  <input type="text" className="form-input" value={user.companyName} disabled style={{ opacity: 0.6 }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Comic Title Name *</label>
                  <input type="text" className="form-input" placeholder="e.g. SAVAGE The War" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Series Name *</label>
                  <input type="text" className="form-input" placeholder="e.g. SAVAGE" value={seriesName} onChange={(e) => setSeriesName(e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div className="form-group">
                    <label className="form-label">Issue Number *</label>
                    <input type="text" className="form-input" placeholder="e.g. 4" value={issueNumber} onChange={(e) => setIssueNumber(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Variant Letter</label>
                    <input type="text" className="form-input" placeholder="e.g. A" value={variantNumber} onChange={(e) => setVariantNumber(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Cover Variant Description</label>
                  <input type="text" className="form-input" placeholder="e.g. Red Foil Variant" value={coverDescription} onChange={(e) => setCoverDescription(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Language</label>
                  <input type="text" className="form-input" value={language} onChange={(e) => setLanguage(e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                  <div className="form-group">
                    <label className="form-label">Book Format *</label>
                    <select className="form-select" value={bookFormat} onChange={(e) => setBookFormat(e.target.value)}>
                      <option value="Single Issue">Single Issue</option>
                      <option value="Trade Paperback (TPB)">Trade Paperback (TPB)</option>
                      <option value="Hardcover (HC)">Hardcover (HC)</option>
                      <option value="Graphic Novel">Graphic Novel</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Series Type *</label>
                    <select className="form-select" value={seriesType} onChange={(e) => setSeriesType(e.target.value)}>
                      <option value="Ongoing">Ongoing Series</option>
                      <option value="Limited / Mini-Series">Limited / Mini-Series</option>
                      <option value="One-shot">One-shot</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Series Frequency</label>
                    <input type="text" className="form-input" placeholder="Monthly" value={seriesFrequency} onChange={(e) => setSeriesFrequency(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Age Guideline *</label>
                  <select className="form-select" value={ageRange} onChange={(e) => setAgeRange(e.target.value)}>
                    <option value="All Ages">All Ages</option>
                    <option value="Teen">Teen (12+)</option>
                    <option value="Teen Plus">Teen Plus (15+)</option>
                    <option value="Mature">Mature (18+)</option>
                  </select>
                </div>
                <button type="button" className="btn btn-primary" style={{ marginTop: '10px' }} onClick={handleNextStep}>
                  Next: Catalog Specs ▶
                </button>
              </div>
            )}

            {/* Step 2: Catalog & Release */}
            {formStep === 2 && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                
                <div className="form-group">
                  <label className="form-label">Select Catalog Cycle *</label>
                  <select
                    className="form-select"
                    value={cycleId}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      setCycleId(selectedId);
                      const matched = cycles.find(c => c.cycleId === selectedId);
                      if (matched) {
                        setCatalogDate(matched.catalogDate);
                        setFocDate(matched.focDate);
                        setReleaseDate(matched.releaseDate);
                      }
                    }}
                    disabled={editingTitleId && editingTitleStatus !== 'Draft' && editingTitleStatus !== 'Changes Requested'}
                  >
                    <option value="">-- Choose an open Catalog Cycle --</option>
                    {cycles.filter(c => c.publisherOpen || c.status === 'Upcoming' || c.cycleId === cycleId).map(c => (
                      <option key={c.cycleId} value={c.cycleId}>
                        {c.cycleName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Read-only summary card */}
                {cycleId && (
                  <div className="glass-panel" style={{ padding: '15px', background: 'rgba(198,161,91,0.04)', borderColor: 'var(--gold-primary)', marginTop: '5px', marginBottom: '10px' }}>
                    <strong style={{ color: 'var(--gold-primary)', fontSize: '0.75rem', display: 'block', marginBottom: '8px', letterSpacing: '0.03em', textTransform: 'uppercase' }}>📅 Linked Cycle Dates</strong>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', fontSize: '0.8rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.7rem' }}>Catalog Opens:</span>
                        <strong>{catalogDate}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.7rem' }}>FOC Date:</span>
                        <strong>{focDate}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.7rem' }}>In-Store Date:</span>
                        <strong>{releaseDate}</strong>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                  <div className="form-group">
                    <label className="form-label">MSRP Price ($ USD) *</label>
                    <input type="number" step="0.01" className="form-input" placeholder="3.99" value={msrp} onChange={(e) => setMsrp(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Available for Reorder *</label>
                    <select className="form-select" value={availableForReorder} onChange={(e) => setAvailableForReorder(e.target.value)}>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Reprint *</label>
                    <select className="form-select" value={reprint} onChange={(e) => setReprint(e.target.value)}>
                      <option value="No">No (1st Print)</option>
                      <option value="Yes">Yes (Reprint)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ maxWidth: '30%' }}>
                  <label className="form-label">Printing Number</label>
                  <input type="number" className="form-input" value={printingNumber} onChange={(e) => setPrintingNumber(e.target.value)} />
                </div>

                <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
                  <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={handlePrevStep}>
                    ◀ Back
                  </button>
                  <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={handleNextStep}>
                    Next: Creators & Desc ▶
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Creators & Description */}
            {formStep === 3 && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                  <div className="form-group">
                    <label className="form-label">Writer Name</label>
                    <input type="text" className="form-input" placeholder="Writer credit" value={writer} onChange={(e) => setWriter(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Artist Name</label>
                    <input type="text" className="form-input" placeholder="Artist credit" value={artist} onChange={(e) => setArtist(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cover Artist</label>
                    <input type="text" className="form-input" placeholder="Cover art credit" value={coverArtist} onChange={(e) => setCoverArtist(e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Brief Synopsis (Catalog Preview) *</label>
                  <input type="text" className="form-input" placeholder="Brief one-sentence pitch..." value={synopsis} onChange={(e) => setSynopsis(e.target.value)} />
                </div>

                <div className="form-group">
                  <label className="form-label">Full Issue Description</label>
                  <textarea className="form-input" style={{ height: '70px' }} placeholder="Enter complete comic solicitation text..." value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                  <div className="form-group">
                    <label className="form-label">BISAC Subject Genre 1 *</label>
                    <input type="text" className="form-input" placeholder="e.g. CGN004030" value={bisac1} onChange={(e) => setBisac1(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">BISAC Subject Genre 2</label>
                    <input type="text" className="form-input" placeholder="e.g. CGN000000" value={bisac2} onChange={(e) => setBisac2(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">BISAC Subject Genre 3</label>
                    <input type="text" className="form-input" placeholder="e.g. CGN004380" value={bisac3} onChange={(e) => setBisac3(e.target.value)} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
                  <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={handlePrevStep}>
                    ◀ Back
                  </button>
                  <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={handleNextStep}>
                    Next: Production Specs ▶
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Production Specifications */}
            {formStep === 4 && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div className="form-group">
                    <label className="form-label">Series Code (Catalog ID seed) *</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. SAV" 
                      value={seriesCode} 
                      onChange={(e) => setSeriesCode(e.target.value)}
                      disabled={editingTitleId && editingTitleStatus !== 'Draft' && editingTitleStatus !== 'Changes Requested'}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">UPC / Barcode / EAN *</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="UPC digits" 
                      value={barcode} 
                      onChange={(e) => setBarcode(e.target.value)}
                      disabled={editingTitleId && editingTitleStatus !== 'Draft' && editingTitleStatus !== 'Changes Requested'}
                    />
                  </div>
                </div>

                {/* PHILBO ID auto-generation display */}
                <div style={{ padding: '12px 18px', background: 'rgba(198,161,91,0.08)', border: '1px solid var(--gold-primary)', borderRadius: '6px', fontSize: '0.85rem' }}>
                  System-Generated PHILBO ID: <strong style={{ color: 'var(--gold-primary)', fontFamily: 'monospace', marginLeft: '6px' }}>{philboId || '(Awaiting specs inputs)'}</strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div className="form-group">
                    <label className="form-label">Page Count *</label>
                    <input type="number" min="4" step="4" className="form-input" placeholder="32" value={pageCount} onChange={(e) => setPageCount(e.target.value)} />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                      Due to the nature of saddle-stitch binding, the total page count must be divisible by 4.
                    </span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Color Specifications *</label>
                    <select className="form-select" value={colorProfile} onChange={(e) => setColorProfile(e.target.value)}>
                      <option value="Color">Full Color</option>
                      <option value="Black & White">Black & White (B&W)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                  <div className="form-group">
                    <label className="form-label">Trim Width (in)</label>
                    <input type="number" step="0.001" className="form-input" value={width} onChange={(e) => setWidth(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Trim Height (in)</label>
                    <input type="number" step="0.001" className="form-input" value={height} onChange={(e) => setHeight(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Weight (lbs)</label>
                    <input type="number" step="0.001" className="form-input" value={weight} onChange={(e) => setWeight(e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Fulfillment Method *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
                    <button type="button" className={fulfillmentMethod === 'Philbo POD' ? 'btn btn-primary pod-method-button' : 'btn btn-secondary'} style={{ padding: '14px', justifyContent: 'flex-start' }} onClick={() => handleFulfillmentMethodChange('Philbo POD')}>
                      Philbo POD
                    </button>
                    <button type="button" className={fulfillmentMethod === 'Inventory' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ padding: '14px', justifyContent: 'flex-start' }} onClick={() => handleFulfillmentMethodChange('Inventory')}>
                      Inventory
                    </button>
                  </div>
                  {fulfillmentMethod === 'Inventory' ? (
                    <div style={{ background: 'rgba(184,132,62,0.12)', border: '1px solid var(--amber-warning)', color: 'var(--text-primary)', padding: '12px 14px', borderRadius: '6px', fontSize: '0.78rem', lineHeight: 1.5 }}>
                      <strong style={{ color: 'var(--amber-warning)' }}>Account-wide 15% distribution fee acknowledged.</strong> Inventory creates additional receiving, storage, shortage, damage, late-arrival, and shipping work. Returning this title to POD will not automatically reduce your account rate. Only Philbo Admin may override it.
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Philbo prints and fulfills this title through the POD workflow.</span>
                  )}
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Current account commission: <strong style={{ color: 'var(--gold-primary)' }}>{((user.commissionRate || 0) * 100).toFixed(0)}%</strong></span>
                </div>

                <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
                  <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={handlePrevStep}>
                    ◀ Back
                  </button>
                  <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={handleNextStep}>
                    Next: Files & Media ▶
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Files and Media */}
            {formStep === 5 && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ border: '1px dashed var(--border-glow)', padding: '15px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', textAlign: 'center' }}>
                  <strong style={{ display: 'block', marginBottom: '8px', color: '#fff', fontSize: '0.85rem' }}>PRINT-READY INTERIOR FILE (.PDF) · OPTIONAL NOW</strong>
                  <input type="file" accept=".pdf" style={{ display: 'block', margin: '10px auto', fontSize: '0.8rem' }} onChange={(e) => handleFileChange(e, 'interior')} />
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>The checker looks for the correct page count, individual pages, consistent trim size, and {REQUIRED_BLEED_INCHES} in bleed. You may still submit the catalog listing before the interior is finished.</span>
                  {interiorPdf && <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--green-primary)' }}>Selected: {interiorPdf.name}</div>}
                </div>

                {isInteriorPreflighting && (
                  <section className="publisher-file-checker is-checking" aria-live="polite">
                    <div className="publisher-file-checker-heading">
                      <span className="publisher-file-checker-spinner" aria-hidden="true" />
                      <div><strong>Checking the interior PDF now…</strong><small>Reading page count, page boxes, trim size, bleed, and page dimensions.</small></div>
                    </div>
                  </section>
                )}

                {interiorPreflight && !isInteriorPreflighting && (
                  <section className={`publisher-file-checker ${interiorPreflight.status}`} aria-live="polite">
                    <div className="publisher-file-checker-heading">
                      <span className="publisher-file-checker-status" aria-hidden="true">{interiorPreflight.status === 'changes-required' ? '!' : '✓'}</span>
                      <div>
                        <strong>{interiorPreflight.headline}</strong>
                        <small>{interiorPreflight.failed} failed · {interiorPreflight.warnings} warning{interiorPreflight.warnings === 1 ? '' : 's'} · Human prepress approval is still required.</small>
                      </div>
                    </div>
                    <div className="publisher-file-checker-results">
                      {interiorPreflight.checks.map(check => (
                        <article key={check.id} className={`publisher-file-check-result ${check.status}`}>
                          <span aria-hidden="true">{check.status === 'pass' ? '✓' : check.status === 'fail' ? '×' : check.status === 'warning' ? '!' : 'i'}</span>
                          <div><strong>{check.label}</strong><p>{check.detail}</p></div>
                        </article>
                      ))}
                    </div>
                    {interiorPreflight.status === 'changes-required' && (
                      <p className="publisher-file-checker-note"><strong>Catalog submission can continue,</strong> but this file will not be considered production-ready until the failed items are corrected and a replacement PDF passes review.</p>
                    )}
                  </section>
                )}

                <div style={{ border: '1px dashed var(--border-glow)', padding: '15px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', textAlign: 'center' }}>
                  <strong style={{ display: 'block', marginBottom: '8px', color: '#fff', fontSize: '0.85rem' }}>CATALOG COVER IMAGE (.JPG OR .PNG) · REQUIRED</strong>
                  <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" style={{ display: 'block', margin: '10px auto', fontSize: '0.8rem' }} onChange={(e) => handleFileChange(e, 'cover-art')} />
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Upload a high-resolution JPG or PNG. PDF files are not accepted for cover art.</span>
                  {coverArtFile && <div style={{ fontSize: '0.8rem', color: 'var(--green-primary)', marginTop: '6px' }}>Selected: {coverArtFile.name}</div>}
                  {isCoverThumbnailLoading && <div style={{ fontSize: '0.75rem', color: 'var(--gold-primary)', marginTop: '8px' }}>Creating catalog thumbnail…</div>}
                  {coverUrl && !isCoverThumbnailLoading && (
                    <img src={coverUrl} alt="Automatic cover thumbnail preview" style={{ display: 'block', width: '120px', maxHeight: '180px', objectFit: 'cover', margin: '12px auto 0', borderRadius: '5px', border: '1px solid var(--border-glow)' }} />
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div style={{ border: '1px dashed var(--border-glow)', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', textAlign: 'center' }}>
                    <strong style={{ display: 'block', marginBottom: '4px', color: '#fff', fontSize: '0.8rem' }}>PROMOTIONAL IMAGES</strong>
                    <input type="file" accept="image/*" style={{ display: 'block', margin: '5px auto', fontSize: '0.75rem' }} onChange={(e) => handleFileChange(e, 'marketing')} />
                    <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>Social graphics, posters, shelf talkers, cover reveals, and retailer-ready images.</span>
                    {marketingImage && <div style={{ fontSize: '0.75rem', color: 'var(--green-primary)' }}>{marketingImage.name}</div>}
                  </div>
                  <div style={{ border: '1px dashed var(--border-glow)', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', textAlign: 'center' }}>
                    <strong style={{ display: 'block', marginBottom: '4px', color: '#fff', fontSize: '0.8rem' }}>PRESS, SAMPLE & CREATOR ASSETS</strong>
                    <input type="file" style={{ display: 'block', margin: '5px auto', fontSize: '0.75rem' }} onChange={(e) => handleFileChange(e, 'asset')} />
                    <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>Sample comic books, press kits, creator bios, character turnarounds, talking points, and media files.</span>
                    {additionalAsset && <div style={{ fontSize: '0.75rem', color: 'var(--green-primary)' }}>{additionalAsset.name}</div>}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Optional Trailer or Video Link</label>
                  <input type="text" className="form-input" placeholder="https://youtube.com/..." value={trailerLink} onChange={(e) => setTrailerLink(e.target.value)} />
                </div>

                {isUploading && (
                  <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glow)', padding: '20px', borderRadius: '8px', marginTop: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.8rem' }}>
                      <strong style={{ color: 'var(--pod-green)' }}>CATALOG SUBMISSION CHECKS</strong>
                      <span>{uploadProgress}%</span>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
                      {preflightState.map((check, index) => (
                        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: currentPreflightStep >= index ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          <span>
                            {check.status === 'verified' ? '✅' : currentPreflightStep === index ? '⚡' : '🔘'}
                          </span>
                          <span>{check.label}</span>
                        </div>
                      ))}
                    </div>

                    {preflightWarnings.length > 0 && (
                      <div style={{ marginTop: '12px', background: 'rgba(212,175,55,0.06)', border: '1px solid var(--gold-primary)', color: 'var(--gold-hover)', padding: '10px', borderRadius: '4px', fontSize: '0.75rem', lineHeight: '1.4' }}>
                        ⚠️ {preflightWarnings[0]}
                      </div>
                    )}

                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginTop: '15px' }}>
                      <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--gold-primary)', transition: 'width 0.2s' }}></div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
                  <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={handlePrevStep} disabled={isUploading}>
                    ◀ Back
                  </button>
                  {isUploading ? (
                    <button type="button" className="btn btn-primary" style={{ flex: 3 }} disabled>
                      Validating catalog listing...
                    </button>
                  ) : (
                    <>
                      <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => handleSubmitTitle('Draft')}>
                        💾 Save Draft
                      </button>
                      <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={handleOpenSubmissionPreview}>
                        👁️ Preview
                      </button>
                      <button type="button" className="btn btn-primary" style={{ flex: 1.2 }} onClick={() => handleSubmitTitle('Submitted for Review')}>
                        🚀 Submit for Catalog Review
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

          </form>
        </div>
      )}

      {/* Preview Modal overlay */}
      {showPreviewModal && (
        <div className="publisher-preview-overlay" role="dialog" aria-modal="true" aria-label="Website listing preview" onClick={(event) => event.stopPropagation()}>
          <div className="publisher-preview-modal glass-panel animate-fade-in" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="publisher-workspace-close publisher-preview-close" aria-label="Close preview and return to Publisher Dashboard" title="Return to Dashboard" onClick={closeTitleWorkspace}>×</button>
            <div style={{ borderBottom: '1px solid var(--border-glow)', paddingBottom: '16px', marginBottom: '24px' }}>
              <span style={{ display: 'block', color: 'var(--gold-primary)', fontSize: '0.72rem', fontWeight: 'bold', letterSpacing: '0.12em', marginBottom: '6px' }}>WEBSITE LISTING PREVIEW</span>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1.35rem' }}>THIS IS HOW YOUR SUBMISSION WILL APPEAR ON THE WEBSITE</h3>
              <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                This listing remains private until Philbo approves and publishes the title Live. Review every detail before submitting.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '30px', alignItems: 'start' }}>
              <div>
                <div style={{ background: '#08090b', border: '1px solid var(--border-glow)', borderRadius: '8px', padding: '14px', minHeight: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={coverUrl} alt={`${title || 'Submitted title'} cover`} style={{ display: 'block', width: '100%', maxWidth: '310px', maxHeight: '470px', objectFit: 'contain', borderRadius: '4px' }} />
                </div>
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="badge badge-gold">PENDING PHILBO APPROVAL</span>
                  <span className="badge badge-muted">{availableForReorder === 'Yes' ? 'REORDER AVAILABLE' : 'STANDARD SOLICITATION'}</span>
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--gold-primary)', fontSize: '0.76rem', fontWeight: 'bold', letterSpacing: '0.1em' }}>{user.companyName}</span>
                <h2 style={{ color: '#fff', fontSize: '1.8rem', lineHeight: 1.1, margin: '8px 0 4px' }}>{title || 'Untitled Submission'}</h2>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '14px' }}>
                  {seriesName || 'Series'} • Issue #{issueNumber || '—'} • Variant {variantNumber || 'Main'}
                </div>
                <strong style={{ display: 'block', color: 'var(--gold-primary)', fontSize: '1.3rem', marginBottom: '16px' }}>${parseFloat(msrp || '0').toFixed(2)} MSRP</strong>

                <div style={{ borderLeft: '3px solid var(--gold-primary)', paddingLeft: '14px', marginBottom: '18px' }}>
                  <strong style={{ display: 'block', color: '#fff', fontSize: '0.78rem', marginBottom: '5px' }}>BRIEF SYNOPSIS</strong>
                  <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>{synopsis || 'No brief synopsis provided.'}</p>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <strong style={{ display: 'block', color: '#fff', fontSize: '0.78rem', marginBottom: '5px' }}>FULL DESCRIPTION</strong>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{description || 'No full description provided.'}</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', borderTop: '1px solid #292c31', borderLeft: '1px solid #292c31' }}>
                  {[
                    ['Writer', writer || '—'],
                    ['Artist', artist || '—'],
                    ['Cover Artist', coverArtist || '—'],
                    ['Cover', coverDescription || '—'],
                    ['Age Rating', ageRange || '—'],
                    ['Language', language || '—'],
                    ['Pages / Format', `${pageCount || '—'} pages / ${bookFormat || '—'}`],
                    ['Color', colorProfile || '—'],
                    ['FOC Date', focDate || 'TBA'],
                    ['In-Store Date', releaseDate || 'TBA'],
                    ['PHILBO ID', philboId || 'Generated after required codes'],
                    ['UPC / ISBN / EAN', barcode || '—']
                  ].map(([label, value]) => (
                    <div key={label} style={{ borderRight: '1px solid #292c31', borderBottom: '1px solid #292c31', padding: '10px 12px', minWidth: 0 }}>
                      <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{label}</span>
                      <strong style={{ display: 'block', color: 'var(--text-primary)', fontSize: '0.78rem', overflowWrap: 'anywhere' }}>{value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '28px', borderTop: '1px solid var(--border-glow)', paddingTop: '22px' }}>
              <h4 style={{ color: 'var(--gold-primary)', fontSize: '0.85rem', letterSpacing: '0.08em', margin: '0 0 14px' }}>COMPLETE LISTING DETAILS</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
                {[
                  ['Catalog Cycle', cycles.find(cycle => cycle.cycleId === cycleId)?.cycleName || 'Not selected'],
                  ['Catalog Date', catalogDate || 'TBA'],
                  ['Series Code', seriesCode || '—'],
                  ['Series Type', seriesType || '—'],
                  ['Frequency', seriesFrequency || '—'],
                  ['Printing', `${reprint === 'Yes' ? 'Reprint' : 'First release'} / Printing ${printingNumber || '—'}`],
                  ['Dimensions', `${width || '—'} × ${height || '—'} in`],
                  ['Weight', `${weight || '—'} lb`],
                  ['BISAC Code 1', bisac1 || '—'],
                  ['BISAC Code 2', bisac2 || '—'],
                  ['BISAC Code 3', bisac3 || '—'],
                  ['Availability', availableForReorder === 'Yes' ? 'Available for reorder' : 'Not available for reorder']
                ].map(([label, value]) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid #292c31', borderRadius: '5px', padding: '10px 12px' }}>
                    <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', marginBottom: '3px' }}>{label}</span>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.76rem', overflowWrap: 'anywhere' }}>{value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '26px', paddingTop: '18px', borderTop: '1px solid var(--border-glow)', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => setShowPreviewModal(false)}>Back to Editing</button>
              <button className="btn btn-primary" onClick={() => { setShowPreviewModal(false); handleSubmitTitle('Submitted for Review'); }}>Confirm & Submit for Catalog Review</button>
            </div>
          </div>
        </div>
      )}

      <CatalogProductDetail
        title={selectedWebsiteTitle}
        onClose={() => setSelectedWebsiteTitle(null)}
        viewerRole="publisher"
      />

      {/* 4. TITLE FILES TAB */}
      {activeSection === 'title-files' && (
        <div className="glass-panel" style={{ padding: '30px' }}>
          <h3 style={{ borderBottom: '1px solid var(--border-glow)', paddingBottom: '15px', marginBottom: '20px', color: 'var(--gold-primary)', fontSize: '1.2rem' }}>
            MANAGE TITLE PRINT ASSETS
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '25px' }}>
            Upload print-ready PDF files for your solicited books. Verify bleed margins and vector fonts preflight.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {titles.map(t => (
              <div key={t.titleId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: 'rgba(0,0,0,0.15)', border: '1px solid #292c31', borderRadius: '8px', flexWrap: 'wrap', gap: '15px' }}>
                <div>
                  <strong style={{ color: '#fff', fontSize: '0.95rem' }}>{t.title}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    PHILBO ID: <span style={{ fontFamily: 'monospace', color: 'var(--gold-primary)' }}>{t.philboId || 'N/A'}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Interior PDF: <span style={{ fontFamily: 'monospace' }}>{t.interiorPdfName || 'N/A'}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Cover Art: <span style={{ fontFamily: 'monospace' }}>{t.coverArtFileName || t.coverArtPdfName || 'N/A'}</span>
                  </div>
                </div>
                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => handleStartEdit(t)}>
                  Replace Files
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. MARKETING ASSETS */}
      {activeSection === 'marketing-assets' && (
        <div className="publisher-marketing-library glass-panel">
          <div className="publisher-marketing-heading">
            <div>
              <span className="badge badge-gold">RETAILER-FACING MEDIA LIBRARY</span>
              <h3>MARKETING ASSETS & SOLICITATION PACKS</h3>
              <p>Give approved retailers, reviewers, and Philbo’s promotional team the materials they need to understand, recommend, and promote your books. Assets stay organized with the matching title and are reviewed by Philbo before retailer access.</p>
            </div>
          </div>

          <div className="publisher-marketing-grid">
            <article><span aria-hidden="true">📖</span><strong>SAMPLES & PREVIEWS</strong><p>Sample comic books, preview PDFs, first-look pages, interior excerpts, ashcans, and digital samplers.</p></article>
            <article><span aria-hidden="true">🎨</span><strong>CHARACTERS & STORY WORLD</strong><p>Character turnarounds, model sheets, character bios, world guides, maps, and approved artwork.</p></article>
            <article><span aria-hidden="true">🎤</span><strong>CREATORS & PRESS</strong><p>Creator bios, headshots, press kits, interview notes, talking points, review quotes, and media contact information.</p></article>
            <article><span aria-hidden="true">📣</span><strong>RETAILER PROMOTION</strong><p>Sell sheets, posters, shelf talkers, social graphics, cover reveals, launch announcements, and event materials.</p></article>
          </div>

          <div className="publisher-marketing-guidance">
            <div><strong>WHERE TO ADD THEM</strong><span>Add promotional images and supporting files in Step 5 when submitting or editing a title. Approved files will be grouped here with that book.</span></div>
            <div><strong>WHAT DOES NOT GO HERE</strong><span>Print-ready interiors and production cover files belong in <b>Title Files</b>, not Marketing Assets.</span></div>
          </div>

          <div className="publisher-marketing-empty">
            <span aria-hidden="true">🗂️</span>
            <strong>No approved marketing packages are listed yet</strong>
            <span>When title-specific assets are submitted and approved, retailers will be able to find and download them from the matching book or publisher.</span>
          </div>
        </div>
      )}

      {/* STANDALONE PUBLISHER POD PRINTING */}
      {activeSection === 'pod-projects' && (
        <div className="publisher-pod-page">
          <header className="publisher-pod-hero">
            <div>
              <span>PHILBO PRINT ON DEMAND</span>
              <h2>Order books outside of a Purchase Order</h2>
              <p>Use this area when you want copies printed for conventions, direct sales, Kickstarter fulfillment, creator copies, restocks, or any project that is separate from a Philbo distribution PO.</p>
            </div>
            <div className="publisher-pod-hero-stat"><strong>{standalonePodOrders.length}</strong><span>Standalone POD order{standalonePodOrders.length === 1 ? '' : 's'}</span></div>
          </header>

          {podOrderMessage && <div className={`publisher-pod-message ${podOrderMessage.includes('was submitted') ? 'success' : 'error'}`} role="status">{podOrderMessage}</div>}

          <form className="publisher-pod-builder" onSubmit={submitStandalonePodOrder}>
            <div className="publisher-pod-builder-main">
              <div className="publisher-pod-section-heading"><span>1</span><div><strong>Choose the book</strong><small>Select one of the titles already connected to your publisher account.</small></div></div>
              {titles.length ? (
                <label className="publisher-pod-field publisher-pod-field-wide">
                  <span>Publisher title *</span>
                  <select className="form-select" required value={podOrderForm.titleId} onChange={event => setPodOrderField('titleId', event.target.value)}>
                    <option value="">Select a title</option>
                    {titles.map(item => <option key={item.titleId} value={item.titleId}>{item.title} {item.philboId ? `· ${item.philboId}` : ''}</option>)}
                  </select>
                </label>
              ) : <div className="publisher-pod-empty">Submit a title before starting a publisher POD order.</div>}

              {selectedPodTitle && (
                <div className="publisher-pod-title-preview">
                  {selectedPodTitle.coverUrl ? <img src={selectedPodTitle.coverUrl} alt={`${selectedPodTitle.title} cover`} /> : <div className="publisher-pod-cover-placeholder">NO COVER</div>}
                  <div><span>{selectedPodTitle.philboId || 'PHILBO ID pending'}</span><strong>{selectedPodTitle.title}</strong><small>{selectedPodTitle.pageCount || '—'} pages · {selectedPodTitle.colorProfile || 'Color'} · {selectedPodTitle.width || 6.625}″ × {selectedPodTitle.height || 10.25}″</small><b className={selectedPodFilesReady ? 'files-ready' : 'files-needed'}>{selectedPodFilesReady ? 'Print files are on file' : 'Print files will be required before production'}</b></div>
                </div>
              )}

              <div className="publisher-pod-section-heading"><span>2</span><div><strong>Quantity and timing</strong><small>These copies are completely separate from retailer orders and distribution quantities.</small></div></div>
              <div className="publisher-pod-form-grid">
                <label className="publisher-pod-field"><span>Copies to print *</span><input className="form-input" type="number" min="1" required value={podOrderForm.quantity} onChange={event => setPodOrderField('quantity', event.target.value)} /></label>
                <label className="publisher-pod-field"><span>Requested delivery date</span><input className="form-input" type="date" value={podOrderForm.requestedDeadline} onChange={event => setPodOrderField('requestedDeadline', event.target.value)} /></label>
                <label className="publisher-pod-field"><span>Proof preference</span><select className="form-select" value={podOrderForm.proofPreference} onChange={event => setPodOrderField('proofPreference', event.target.value)}><option>Digital proof</option><option>Printed proof</option><option>No proof requested</option></select></label>
              </div>

              <label className={`publisher-pod-logo-option ${podOrderForm.usePhilboPodLogo ? 'selected' : ''}`}>
                <input type="checkbox" checked={podOrderForm.usePhilboPodLogo} onChange={event => setPodOrderField('usePhilboPodLogo', event.target.checked)} />
                <img src="/assets/brand/philbo-pod-discount-logo.png" alt="Philbo POD logo" />
                <span><strong>Add the Philbo POD logo and save 5%</strong><small>The logo appears on the finished book and the discount applies to the printing subtotal.</small></span>
                <b>−5%</b>
              </label>

              <div className="publisher-pod-section-heading"><span>3</span><div><strong>Shipping and instructions</strong><small>Tell Philbo where your publisher copies should go.</small></div></div>
              <label className="publisher-pod-field publisher-pod-field-wide"><span>Ship all copies to *</span><textarea className="form-textarea" rows="4" required value={podOrderForm.publisherShipToAddress} onChange={event => setPodOrderField('publisherShipToAddress', event.target.value)} placeholder="Publisher name and complete shipping address" /></label>
              <label className="publisher-pod-field publisher-pod-field-wide"><span>Production notes</span><textarea className="form-textarea" rows="4" value={podOrderForm.additionalInformation} onChange={event => setPodOrderField('additionalInformation', event.target.value)} placeholder="Convention date, packaging requests, variant details, or anything else Philbo should know." /></label>
            </div>

            <aside className="publisher-pod-summary">
              <span>POD ORDER SUMMARY</span>
              <h3>{selectedPodTitle?.title || 'Choose a title'}</h3>
              <dl>
                <div><dt>Copies</dt><dd>{Math.max(1, Number(podOrderForm.quantity) || 0).toLocaleString()}</dd></div>
                <div><dt>Order type</dt><dd>Publisher direct</dd></div>
                <div><dt>Distribution PO</dt><dd>Not connected</dd></div>
                <div><dt>Proof</dt><dd>{podOrderForm.proofPreference}</dd></div>
                <div><dt>Files</dt><dd>{selectedPodFilesReady ? 'On file' : 'Needed'}</dd></div>
              </dl>
              {selectedPodEstimate == null ? (
                <div className="publisher-pod-quote"><strong>Quote review required</strong><small>Philbo will confirm printing, shipping, and tax before production begins.</small></div>
              ) : (
                <div className="publisher-pod-estimate">
                  <div><span>Estimated printing</span><strong>${selectedPodBaseEstimate.toFixed(2)}</strong></div>
                  {podOrderForm.usePhilboPodLogo && <div className="discount"><span>Logo discount</span><strong>−${selectedPodDiscount.toFixed(2)}</strong></div>}
                  <div className="total"><span>Estimated subtotal</span><strong>${selectedPodEstimate.toFixed(2)}</strong></div>
                  <small>Shipping and applicable taxes are confirmed separately. No payment is collected during beta testing.</small>
                </div>
              )}
              <button type="submit" className="btn publisher-pod-submit" disabled={!selectedPodTitle}>Submit POD Print Order</button>
            </aside>
          </form>

          <section className="publisher-pod-history">
            <div className="publisher-pod-history-heading"><div><span>STANDALONE PRINTING</span><h3>Your POD orders</h3></div><small>Orders created from official Purchase Orders remain in the Purchase Orders area.</small></div>
            {!standalonePodOrders.length ? <p>No standalone publisher POD orders have been submitted yet.</p> : (
              <div className="publisher-pod-history-list">{standalonePodOrders.map(order => (
                <article key={order.podOrderId}><div><span>{order.podOrderId}</span><strong>{order.projectTitle}</strong><small>{order.quantity} copies · Submitted {new Date(order.submittedAt).toLocaleString()}</small></div><div><b>{order.status}</b><strong>{order.subtotal == null ? 'Quote review' : `$${Number(order.subtotal).toFixed(2)}`}</strong><small>{order.paymentStatus}</small></div></article>
              ))}</div>
            )}
          </section>
        </div>
      )}

      {/* 6. PURCHASE ORDERS VIEW */}
      {activeSection === 'purchase-orders' && (
        <div className="glass-panel" style={{ padding: '30px' }}>
          <h3 style={{ borderBottom: '1px solid var(--border-glow)', paddingBottom: '15px', marginBottom: '20px', color: 'var(--gold-primary)', fontSize: '1.2rem' }}>
            DISTRIBUTION PURCHASE ORDERS
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '18px' }}>Purchase Orders are official cycle-close documents. During an open FOC, use Sales to monitor live quantities; totals remain subject to change until ordering closes.</p>
          {purchaseOrders.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No purchase orders compiled yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {purchaseOrders.map(po => (
                <div key={po.poNumber} style={{ padding: '20px', background: 'rgba(0,0,0,0.15)', border: '1px solid #292c31', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #292c31', paddingBottom: '10px', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <strong style={{ color: 'var(--gold-primary)', fontSize: '1.05rem' }}>{po.poNumber}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '15px' }}>Date: {new Date(po.poDate).toLocaleDateString()}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><span className="badge badge-green" style={{ fontSize: '0.7rem' }}>{po.status}</span><button className="btn btn-primary" style={{ padding: '6px 11px', fontSize: '0.72rem' }} onClick={() => setSelectedPurchaseOrder(po)}>Open Actual PO</button></div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '15px', fontSize: '0.8rem', marginBottom: '15px' }}>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Wholesale Subtotal</span>
                      <strong style={{ color: '#fff', fontSize: '0.95rem' }}>${po.wholesaleTotal.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Philbo Commission Cut ({po.commissionRate})</span>
                      <strong style={{ color: 'var(--red-primary)', fontSize: '0.95rem' }}>-${po.totalCommission.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Net Due to Publisher</span>
                      <strong style={{ color: 'var(--green-primary)', fontSize: '0.95rem' }}>${po.netDueToPublisher.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Target Release Month</span>
                      <strong style={{ color: '#fff' }}>{po.targetReleaseMonth}</strong>
                    </div>
                  </div>

                  <strong style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>PO ITEMS SUMMARY:</strong>
                  <div className="table-container" style={{ border: 'none' }}>
                    <table className="premium-table">
                      <thead>
                        <tr>
                          <th>Item Name</th>
                          <th style={{ textAlign: 'center' }}>Qty</th>
                          <th style={{ textAlign: 'right' }}>MSRP</th>
                          <th style={{ textAlign: 'right' }}>Net Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {po.items.map((i, idx) => (
                          <tr key={idx}>
                            <td>{i.title}</td>
                            <td style={{ textAlign: 'center' }}>{i.qty}</td>
                            <td style={{ textAlign: 'right' }}>${i.msrp.toFixed(2)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>${i.netDue.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 7. SALES REPORTS */}
      {activeSection === 'sales' && (
        <div className="glass-panel" style={{ padding: '30px' }}>
          <h3 style={{ borderBottom: '1px solid var(--border-glow)', paddingBottom: '15px', marginBottom: '20px', color: 'var(--gold-primary)', fontSize: '1.2rem' }}>
            LIVE SALES BY TITLE
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '18px' }}>Quantities update while ordering is open. They become final and move into an official Purchase Order only when the Catalog Cycle FOC closes.</p>
          <div className="table-container">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Comic Title</th>
                  <th>Catalog Cycle / FOC</th>
                  <th style={{ textAlign: 'center' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>MSRP Total</th>
                  <th style={{ textAlign: 'right' }}>Estimated Net</th>
                </tr>
              </thead>
              <tbody>
                {liveSales.map(item => {
                  const estimatedNet = item.wholesaleValue - (item.msrpValue * Number(user.commissionRate || 0.10));
                  return <tr key={item.titleId}><td style={{ fontWeight: '500' }}>{item.title}<div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.philboId || 'PHILBO ID pending'}</div></td><td><span className={`badge ${item.focStatus === 'FOC Closed' ? 'badge-green' : 'badge-gold'}`} style={{ fontSize: '0.62rem' }}>{item.focStatus}</span><div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>FOC: {item.focDate}</div></td><td style={{ textAlign: 'center' }}>{item.quantity}</td><td style={{ textAlign: 'right' }}>${item.msrpValue.toFixed(2)}</td><td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--green-primary)' }}>${estimatedNet.toFixed(2)}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. PAYMENTS VIEW */}
      {activeSection === 'payments' && (
        <div className="glass-panel" style={{ padding: '30px' }}>
          <h3 style={{ borderBottom: '1px solid var(--border-glow)', paddingBottom: '15px', marginBottom: '20px', color: 'var(--gold-primary)', fontSize: '1.2rem' }}>
            PAYMENT STATEMENTS HISTORY
          </h3>
          <div className="table-container">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Statement Date</th>
                  <th>Transaction Ref</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Amount Paid</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>2026-07-01</td>
                  <td style={{ fontFamily: 'monospace' }}>TXN-90218</td>
                  <td>June 2026 Distribution Payout</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--green-primary)' }}>${(netPublisherPay * 0.8).toFixed(2)}</td>
                  <td style={{ textAlign: 'center' }}><span className="badge badge-green">Paid</span></td>
                </tr>
                <tr>
                  <td>2026-06-01</td>
                  <td style={{ fontFamily: 'monospace' }}>TXN-88129</td>
                  <td>May 2026 Distribution Payout</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--green-primary)' }}>$410.25</td>
                  <td style={{ textAlign: 'center' }}><span className="badge badge-green">Paid</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 9. COMPANY PROFILE */}
      {activeSection === 'profile' && (
        <div className="glass-panel" style={{ padding: 'clamp(20px, 3vw, 34px)', maxWidth: '1050px' }}>
          <h3 style={{ borderBottom: '1px solid var(--border-glow)', paddingBottom: '15px', marginBottom: '20px', color: 'var(--gold-primary)', fontSize: '1.2rem' }}>
            COMPANY PROFILE DETAILS
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, margin: '-5px 0 24px' }}>
            Keep your company, correspondence, and printing contacts current. These details are private operational information and do not appear on public title listings.
          </p>
          <form onSubmit={saveCompanyProfile} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <section>
              <h4 style={{ color: '#fff', marginBottom: '14px', fontSize: '0.9rem', letterSpacing: '0.08em' }}>COMPANY IDENTITY</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '15px' }}>
                <div className="form-group">
                  <label className="form-label">Publisher House Name</label>
                  <input type="text" className="form-input" value={user.companyName || ''} disabled style={{ opacity: 0.6 }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Account Login Email</label>
                  <input type="email" className="form-input" value={user.email || ''} disabled style={{ opacity: 0.6 }} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Publisher Logo <span style={{ color: 'var(--gold-primary)' }}>(Required)</span></label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(240px, 430px)', gap: '20px', alignItems: 'start' }}>
                    <div style={{ border: '1px dashed var(--gold-primary)', borderRadius: '8px', padding: '20px', background: 'rgba(198,161,91,0.04)' }}>
                      <input id="publisher-logo-upload" type="file" accept="image/jpeg,image/png" onChange={handlePublisherLogoUpload} style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0 }} />
                      <label htmlFor="publisher-logo-upload" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <Icon name="upload" size={16} /> {profileForm.publisherLogoUrl ? 'Replace Logo' : 'Upload Logo'}
                      </label>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.55, margin: '12px 0 0' }}>JPG or PNG · maximum 5 MB · longest side at least 600 pixels.</p>
                      {isLogoProcessing && <p style={{ color: 'var(--gold-primary)', fontSize: '0.8rem', marginTop: '10px' }}>Preparing logo…</p>}
                      {logoUploadMessage && <p role="status" style={{ color: logoUploadMessage.includes('ready') ? 'var(--green-primary)' : '#ff7474', fontSize: '0.8rem', lineHeight: 1.5, marginTop: '10px' }}>{logoUploadMessage}</p>}
                      {profileForm.publisherLogoUrl && (
                        <div style={{ marginTop: '16px' }}>
                          <img src={profileForm.publisherLogoUrl} alt="Publisher logo preview" style={{ display: 'block', maxWidth: '260px', maxHeight: '150px', objectFit: 'contain', background: '#fff', borderRadius: '6px', padding: '10px' }} />
                          <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '7px' }}>{profileForm.publisherLogoFileName || 'Current publisher logo'}</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--border-glow)', maxHeight: '420px' }}>
                        <img src={assetPath('resources/publisher-logo-upload-guide.png')} alt="Publisher logo requirements showing horizontal and vertical two-inch examples" style={{ display: 'block', width: '100%', maxWidth: '430px', marginTop: '-105px' }} />
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.45, marginTop: '7px' }}>Examples show acceptable horizontal and vertical proportions at a 2-inch presentation size.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section style={{ borderTop: '1px solid var(--border-glow)', paddingTop: '22px' }}>
              <h4 style={{ color: '#fff', marginBottom: '8px', fontSize: '0.9rem', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="lock-keyhole" size={16} /> PASSWORD & SECURITY</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5, marginBottom: '14px' }}>Change the password used to sign in to this publisher account.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px' }}>
                <div className="form-group">
                  <label className="form-label">Current Password</label>
                  <input type="password" className="form-input" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <input type="password" className="form-input" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm New Password</label>
                  <input type="password" className="form-input" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
                </div>
              </div>
              {passwordMessage && <div role="status" style={{ color: passwordMessage.includes('successfully') ? 'var(--green-primary)' : '#ff7474', fontSize: '0.82rem', marginTop: '12px' }}>{passwordMessage}</div>}
              <button type="button" className="btn btn-secondary" onClick={handlePasswordChange} style={{ marginTop: '14px' }}>Change Password</button>
            </section>

            <section>
              <h4 style={{ color: '#fff', marginBottom: '14px', fontSize: '0.9rem', letterSpacing: '0.08em' }}>CONTACTS & CORRESPONDENCE</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '15px' }}>
                <div className="form-group">
                  <label className="form-label">Primary Contact Name</label>
                  <input type="text" className="form-input" value={profileForm.contactName} onChange={e => setProfileField('contactName', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Publisher Email</label>
                  <input type="email" className="form-input" value={profileForm.publisherEmail} onChange={e => setProfileField('publisherEmail', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Primary Phone</label>
                  <input type="tel" className="form-input" value={profileForm.primaryPhone} onChange={e => setProfileField('primaryPhone', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Secondary Phone & Contact</label>
                  <input type="text" className="form-input" value={profileForm.secondaryPhoneAndContact} onChange={e => setProfileField('secondaryPhoneAndContact', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">CC Email 1</label>
                  <input type="email" className="form-input" value={profileForm.ccEmail1} onChange={e => setProfileField('ccEmail1', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">CC Email 2</label>
                  <input type="email" className="form-input" value={profileForm.ccEmail2} onChange={e => setProfileField('ccEmail2', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Original Form Response Email</label>
                  <input type="email" className="form-input" value={profileForm.formResponseEmail} onChange={e => setProfileField('formResponseEmail', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Facebook Group Status</label>
                  <input type="text" className="form-input" value={profileForm.facebookGroupStatus} onChange={e => setProfileField('facebookGroupStatus', e.target.value)} placeholder="Invited, joined, pending…" />
                </div>
              </div>
            </section>

            <section>
              <h4 style={{ color: '#fff', marginBottom: '14px', fontSize: '0.9rem', letterSpacing: '0.08em' }}>MAILING & PRINTING</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px' }}>
                <div className="form-group">
                  <label className="form-label">Publisher Mailing Address</label>
                  <textarea className="form-input" rows="5" value={profileForm.mailingAddress} onChange={e => setProfileField('mailingAddress', e.target.value)} style={{ resize: 'vertical' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Outside Printer / Printing Provider</label>
                  <textarea className="form-input" rows="5" value={profileForm.outsidePrinter} onChange={e => setProfileField('outsidePrinter', e.target.value)} placeholder="Leave blank if all titles use Philbo Print on Demand." style={{ resize: 'vertical' }} />
                  <small style={{ display: 'block', color: 'var(--text-secondary)', marginTop: '7px', lineHeight: 1.45 }}>Enter the company providing printing services when the title is not printed by Philbo.</small>
                </div>
              </div>
            </section>

            {(user.contactImportResponses || []).length > 1 && (
              <section style={{ borderTop: '1px solid var(--border-glow)', paddingTop: '20px' }}>
                <h4 style={{ color: '#fff', marginBottom: '8px', fontSize: '0.9rem', letterSpacing: '0.08em' }}>IMPORTED RESPONSE HISTORY</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5, margin: 0 }}>
                  {(user.contactImportResponses || []).length} original contact-form responses are preserved for this publisher. The newest response supplied the starting profile; saved changes above are now the active record.
                </p>
              </section>
            )}

            {profileMessage && (
              <div role="status" style={{ color: profileMessage.includes('successfully') ? 'var(--green-primary)' : '#ff7474', fontSize: '0.88rem' }}>
                {profileMessage}
              </div>
            )}
            <button type="submit" className="btn btn-primary" style={{ marginTop: '2px', alignSelf: 'flex-start', minWidth: '190px' }}>
              Save Company Profile
            </button>
          </form>
        </div>
      )}

      {/* 10. SUPPORT DOCUMENTATION */}
      {activeSection === 'support' && (
        <div className="glass-panel" style={{ padding: '30px' }}>
          <h3 style={{ borderBottom: '1px solid var(--border-glow)', paddingBottom: '15px', marginBottom: '20px', color: 'var(--gold-primary)', fontSize: '1.2rem' }}>
            HELP & PUBLISHER SUPPORT
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6' }}>
            Need help submitting your digital preflight proofs? Check out our specs requirements sheet or contact the Philbo pre-press team.
          </p>
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid #292c31', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
            <strong style={{ color: 'var(--gold-primary)', display: 'block', marginBottom: '8px' }}>📞 Pre-press distribution helpline:</strong>
            <span style={{ fontSize: '0.9rem', color: '#fff' }}>support@philbo.com | 1-800-555-COMIC</span>
          </div>
        </div>
      )}

      {/* PUBLISHER RESOURCES */}
      {activeSection === 'resources' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h2 style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)', textTransform: 'none', letterSpacing: '0.02em' }}>Publisher Resources</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '6px', lineHeight: '1.6' }}>Handbooks, specifications, and submission templates for working with Philbo Distribution.</p>
          </div>
          <div className="publisher-resource-grid">
            <article className="glass-panel publisher-resource-card">
              <div className="publisher-resource-icon">PDF</div>
              <div>
                <span className="badge badge-gold">Official Guide</span>
                <h3>Philbo Publisher Handbook</h3>
                <p>Distribution policies, title submission guidance, file preparation, catalog procedures, and publisher account information.</p>
                <div className="publisher-resource-actions">
                  <a className="btn btn-primary" href={assetPath('resources/philbo-publisher-handbook.pdf')} target="_blank" rel="noreferrer">View Handbook</a>
                  <a className="btn btn-secondary" href={assetPath('resources/philbo-publisher-handbook.pdf')} download>Download PDF</a>
                </div>
              </div>
            </article>
            <article className="glass-panel publisher-resource-card coming-soon">
              <div className="publisher-resource-icon">DOC</div>
              <div>
                <span className="badge badge-muted">Coming Soon</span>
                <h3>Templates &amp; File Specifications</h3>
                <p>Cover templates, interior templates, barcode placement guides, and print-ready file checklists will live here.</p>
              </div>
            </article>
          </div>
        </div>
      )}

      {selectedPurchaseOrder && <PurchaseOrderDocument purchaseOrder={selectedPurchaseOrder} onClose={() => setSelectedPurchaseOrder(null)} />}

    </div>
  );
}
