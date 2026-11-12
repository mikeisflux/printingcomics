import importedCatalogRows from './data/philbo-july-oct-2026.json' with { type: 'json' };
import philviews14Rows from './data/philviews-14-august-november-2026.json' with { type: 'json' };
import philviews15Rows from './data/philviews-15-september-december-2026.json' with { type: 'json' };
import importedPublisherContacts from './data/publisher-contacts.json' with { type: 'json' };
import { getTitleCatalogAvailability, isTitlePublished } from './lib/catalog-workflow.js';
import { formatInvitationMailingAddress, isExternalInvitationUser, missingInvitationProfileFields, normalizeInvitationProfile } from './lib/invitation-profile.js';

export const INVENTORY_COMMISSION_RATE = 0.15;

export const ROLE_IDS = Object.freeze({
  MOOS: 'moos', ADMIN: 'admin', PREFLIGHT: 'preflight', PUBLISHER: 'publisher', RETAILER: 'retailer'
});

export const ROLE_LABELS = Object.freeze({
  moos: 'MO.OS Access', admin: 'Admin', preflight: 'Print Production / Preflight', publisher: 'Publisher', retailer: 'Retailer'
});

export const PERMISSIONS = Object.freeze({
  STAFF_MANAGE: 'staff.manage', AUDIT_ALL: 'audit.view.all', SYSTEM_SETTINGS: 'system.settings',
  USERS_MANAGE: 'users.manage', TITLES_MANAGE: 'titles.manage', CYCLES_MANAGE: 'cycles.manage',
  ORDERS_MANAGE: 'orders.manage', PURCHASE_ORDERS: 'purchase_orders.manage', PRODUCTION_MANAGE: 'production.manage',
  INVENTORY_MANAGE: 'inventory.manage', RETURNS_MANAGE: 'returns.manage', FINANCIALS_MANAGE: 'financials.manage',
  EXPORT_COMPANY: 'exports.company', EXPORT_CATALOG: 'exports.catalog', POD_PRICING: 'pod.pricing',
  PREFLIGHT_REVIEW: 'preflight.review', PREFLIGHT_CONTACTS: 'preflight.contacts',
  PUBLISHER_SELF: 'publisher.self', RETAILER_SELF: 'retailer.self'
});

const ALL_PERMISSIONS = Object.values(PERMISSIONS);
const ROLE_PERMISSIONS = Object.freeze({
  moos: ALL_PERMISSIONS,
  admin: [PERMISSIONS.STAFF_MANAGE, PERMISSIONS.USERS_MANAGE, PERMISSIONS.TITLES_MANAGE, PERMISSIONS.CYCLES_MANAGE, PERMISSIONS.ORDERS_MANAGE,
    PERMISSIONS.PURCHASE_ORDERS, PERMISSIONS.PRODUCTION_MANAGE, PERMISSIONS.INVENTORY_MANAGE, PERMISSIONS.RETURNS_MANAGE,
    PERMISSIONS.FINANCIALS_MANAGE, PERMISSIONS.EXPORT_COMPANY, PERMISSIONS.EXPORT_CATALOG, PERMISSIONS.POD_PRICING],
  preflight: [PERMISSIONS.PREFLIGHT_REVIEW, PERMISSIONS.PREFLIGHT_CONTACTS],
  publisher: [PERMISSIONS.PUBLISHER_SELF],
  retailer: [PERMISSIONS.RETAILER_SELF]
});

const normalizeRole = role => ({ 'super-admin': 'moos', 'print-admin': 'preflight', pod: 'publisher' }[role] || role);
export const isProtectedDemoEnvironment = () => {
  const location = window.location || {};
  const hostname = String(location.hostname || '');
  const isGoDaddyBeta = hostname.endsWith('.airoapp.ai');
  return ['localhost', '127.0.0.1'].includes(hostname) || location.protocol === 'file:' || hostname.startsWith('beta.') || isGoDaddyBeta;
};
export const getEffectivePermissions = user => {
  if (!user) return [];
  const role = normalizeRole(user.role);
  if (role === ROLE_IDS.MOOS) return ALL_PERMISSIONS;
  const base = new Set(ROLE_PERMISSIONS[role] || []);
  Object.entries(user.permissionOverrides || {}).forEach(([permission, enabled]) => enabled ? base.add(permission) : base.delete(permission));
  return Array.from(base);
};
export const hasPermission = (user, permission) => getEffectivePermissions(user).includes(permission);

const readCollection = (key, fallback = []) => JSON.parse(localStorage.getItem(key)) || fallback;
const writeCollection = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const authEvent = () => window.dispatchEvent(new CustomEvent('philbo:auth-change'));
const safeUser = user => {
  if (!user) return null;
  const { passwordHash, temporaryPassword, ...safe } = user;
  return safe;
};
const normalizeCoverImageUrl = value => {
  const source = String(value || '').trim();
  if (!source || !source.includes('drive.google.com')) return source;
  const fileIdMatch = source.match(/\/file\/d\/([^/?#]+)/i) || source.match(/[?&]id=([^&#]+)/i) || source.match(/\/d\/([^/?#]+)/i);
  if (!fileIdMatch?.[1]) return source;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileIdMatch[1])}&sz=w1200`;
};
const normalizeStoredCoverImageUrls = () => {
  const titles = readCollection('philbo_titles');
  let changed = false;
  titles.forEach(title => {
    const normalized = normalizeCoverImageUrl(title.coverUrl);
    if (normalized && normalized !== title.coverUrl) {
      title.coverUrl = normalized;
      changed = true;
    }
  });
  if (changed) writeCollection('philbo_titles', titles);
};
const isAccountActive = user => Boolean(user && user.approved && !['suspended', 'locked', 'revoked'].includes(user.accountStatus));
const requireActor = (permission, actor = null) => {
  const current = actor || db.getCurrentUser();
  if (!isAccountActive(current) || !hasPermission(current, permission)) throw new Error('You do not have permission to perform this action.');
  return current;
};
const appendAudit = ({ action, recordType, recordId, previousValue = null, newValue = null, notes = '', actor = null }) => {
  const user = actor || db.getCurrentUser();
  const log = readCollection('philbo_audit_log');
  log.push({ auditId: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, dateTime: new Date().toISOString(),
    userId: user?.uid || 'system', user: user?.email || user?.companyName || 'System', userName: user?.contactName || user?.primaryContact || user?.companyName || user?.email || 'System', role: normalizeRole(user?.role || 'system'),
    action, recordType, recordId, previousValue, newValue, notes, sessionId: user?.sessionId || null,
    ipAddress: null });
  writeCollection('philbo_audit_log', log);
};

// Firebase & Firestore mock using localStorage to make the app work instantly
// without needing any backend configuration or APIs, but easily replaceable.

const SEED_CYCLES = [
  { cycleId: 'cycle_1', catalogDate: '2025-07-01', focDate: '2025-09-01', releaseDate: '2025-10-15', cycleName: 'July 1, 2025 Catalog • September 1, 2025 FOC • October 15, 2025 In-Store', status: 'Released', publisherOpen: false, retailerOpen: false, adminNotes: 'Archived default', history: [] },
  { cycleId: 'cycle_2', catalogDate: '2025-08-01', focDate: '2025-10-01', releaseDate: '2025-11-12', cycleName: 'August 1, 2025 Catalog • October 1, 2025 FOC • November 12, 2025 In-Store', status: 'Released', publisherOpen: false, retailerOpen: false, adminNotes: 'Archived default', history: [] },
  { cycleId: 'cycle_3', catalogDate: '2025-09-01', focDate: '2025-11-01', releaseDate: '2025-12-17', cycleName: 'September 1, 2025 Catalog • November 1, 2025 FOC • December 17, 2025 In-Store', status: 'Archived', publisherOpen: false, retailerOpen: false, sourceAvailable: false, importSkipped: true, adminNotes: 'CSV unavailable — historical import intentionally skipped', history: [] },
  { cycleId: 'cycle_4', catalogDate: '2025-10-01', focDate: '2025-12-01', releaseDate: '2026-01-14', cycleName: 'October 1, 2025 Catalog • December 1, 2025 FOC • January 14, 2026 In-Store', status: 'Released', publisherOpen: false, retailerOpen: false, adminNotes: 'Archived default', history: [] },
  { cycleId: 'cycle_5', catalogDate: '2025-11-01', focDate: '2026-01-01', releaseDate: '2026-02-11', cycleName: 'November 1, 2025 Catalog • January 1, 2026 FOC • February 11, 2026 In-Store', status: 'Released', publisherOpen: false, retailerOpen: false, adminNotes: 'Archived default', history: [] },
  { cycleId: 'cycle_6', catalogDate: '2025-12-01', focDate: '2026-02-01', releaseDate: '2026-03-11', cycleName: 'December 1, 2025 Catalog • February 1, 2026 FOC • March 11, 2026 In-Store', status: 'Released', publisherOpen: false, retailerOpen: false, adminNotes: 'Archived default', history: [] },
  { cycleId: 'cycle_7', catalogDate: '2026-01-01', focDate: '2026-03-01', releaseDate: '2026-04-15', cycleName: 'January 1, 2026 Catalog • March 1, 2026 FOC • April 15, 2026 In-Store', status: 'Released', publisherOpen: false, retailerOpen: false, adminNotes: 'Archived default', history: [] },
  { cycleId: 'cycle_8', catalogDate: '2026-02-01', focDate: '2026-04-01', releaseDate: '2026-05-13', cycleName: 'February 1, 2026 Catalog • April 1, 2026 FOC • May 13, 2026 In-Store', status: 'Released', publisherOpen: false, retailerOpen: false, adminNotes: 'Archived default', history: [] },
  { cycleId: 'cycle_9', catalogDate: '2026-03-01', focDate: '2026-05-01', releaseDate: '2026-06-17', cycleName: 'March 1, 2026 Catalog • May 1, 2026 FOC • June 17, 2026 In-Store', status: 'Released', publisherOpen: false, retailerOpen: false, adminNotes: 'Archived default', history: [] },
  { cycleId: 'cycle_10', catalogDate: '2026-04-01', focDate: '2026-06-01', releaseDate: '2026-07-15', cycleName: 'April 1, 2026 Catalog • June 1, 2026 FOC • July 15, 2026 In-Store', status: 'Released', publisherOpen: false, retailerOpen: false, adminNotes: 'Archived default', history: [] },
  { cycleId: 'cycle_11', catalogDate: '2026-05-01', focDate: '2026-07-01', releaseDate: '2026-08-12', cycleName: 'May 1, 2026 Catalog • July 1, 2026 FOC • August 12, 2026 In-Store', status: 'FOC Locked', publisherOpen: false, retailerOpen: false, adminNotes: 'Passes FOC date', history: [] },
  { cycleId: 'cycle_12', catalogDate: '2026-06-01', focDate: '2026-08-01', releaseDate: '2026-09-16', cycleName: 'June 1, 2026 Catalog • August 1, 2026 FOC • September 16, 2026 In-Store', status: 'Open for Retailer Ordering', publisherOpen: false, retailerOpen: true, adminNotes: 'Ordering open', history: [] },
  { cycleId: 'cycle_13', catalogDate: '2026-07-01', focDate: '2026-09-01', releaseDate: '2026-10-14', cycleName: 'PHILVIEWS #13 • July 1, 2026 Catalog • September 1, 2026 FOC • October 14, 2026 In-Store', status: 'Open for Retailer Ordering', publisherOpen: false, retailerOpen: true, catalogCoverUrl: '/assets/catalogs/philviews-13-july-october-2026.webp', catalogPdfUrl: 'https://philbodistribution.com/s/July_Oct_Catalog2026__fin-ljfk.pdf', adminNotes: 'Live Philviews #13 catalog', history: [] },
  { cycleId: 'cycle_14', catalogDate: '2026-08-01', focDate: '2026-10-01', releaseDate: '2026-11-11', cycleName: 'PHILVIEWS #14 • August 1, 2026 Catalog • October 1, 2026 FOC • November 11, 2026 In-Store', status: 'Open for Retailer Ordering', publisherOpen: false, retailerOpen: true, catalogCoverUrl: '/assets/catalogs/philviews-14-august-november-2026.webp', catalogPdfUrl: 'https://philbodistribution.com/s/August_NovCatalog_2026sml.pdf', catalogPublishedAt: '2026-08-01T12:00:00.000Z', adminNotes: 'Live Philviews #14 catalog', history: [] },
  { cycleId: 'cycle_15', catalogDate: '2026-09-01', focDate: '2026-11-01', releaseDate: '2026-12-16', cycleName: 'PHILVIEWS #15 • September 1, 2026 Catalog • November 1, 2026 FOC • December 16, 2026 In-Store', status: 'Open for Retailer Ordering', publisherOpen: false, retailerOpen: true, catalogCoverUrl: '/assets/catalogs/philviews-15-september-december-2026.webp', catalogPdfUrl: 'https://philbodistribution.com/s/SEPT2026-Dec2026_linksm.pdf', catalogPublishedAt: '2026-09-01T12:00:00.000Z', adminNotes: 'Live Philviews #15 catalog', history: [] },
  { cycleId: 'cycle_16', catalogDate: '2026-10-01', focDate: '2026-12-01', releaseDate: '2027-01-13', cycleName: 'October 1, 2026 Catalog • December 1, 2026 FOC • January 13, 2027 In-Store', status: 'Upcoming', publisherOpen: false, retailerOpen: false, adminNotes: 'Seeded upcoming', history: [] },
  { cycleId: 'cycle_17', catalogDate: '2026-11-01', focDate: '2027-01-01', releaseDate: '2027-02-10', cycleName: 'November 1, 2026 Catalog • January 1, 2027 FOC • February 10, 2027 In-Store', status: 'Upcoming', publisherOpen: false, retailerOpen: false, adminNotes: 'Seeded upcoming', history: [] },
  { cycleId: 'cycle_18', catalogDate: '2026-12-01', focDate: '2027-02-01', releaseDate: '2027-03-17', cycleName: 'December 1, 2026 Catalog • February 1, 2027 FOC • March 17, 2027 In-Store', status: 'Upcoming', publisherOpen: false, retailerOpen: false, adminNotes: 'Seeded upcoming', history: [] }
];

const SEED_USERS = [
  {
    uid: 'admin1',
    email: 'mauramariepowers@gmail.com',
    role: 'admin',
    companyName: 'Philbo Operations',
    approved: true
  },
  {
    uid: 'preflight1',
    email: 'preflight@philbo.com',
    role: 'preflight',
    companyName: 'Philbo Print Production',
    approved: true,
    accountStatus: 'active'
  },
  {
    uid: 'admin2',
    email: 'operations@philbo.com',
    role: 'admin',
    companyName: 'Philbo Operations Admin',
    approved: true,
    accountStatus: 'active'
  },
  {
    uid: 'pub1',
    email: 'creator@indycomics.com',
    role: 'publisher',
    companyName: 'Indy Comic Press',
    commissionRate: 0.10, // 10% commission model
    approved: true
  },
  {
    uid: 'pub2',
    email: 'scifi@cosmicpress.com',
    role: 'publisher',
    companyName: 'Cosmic Press',
    commissionRate: 0.05, // 5% commission model
    approved: true
  },
  {
    uid: 'ret1',
    email: 'comics@metropolisbooks.com',
    role: 'retailer',
    companyName: 'Metropolis Comics',
    tier: 'Tier II', // Tier II starts at 45% discount
    totalCycleSpend: 380, // Total cycle spending
    returnsUsed: 2,
    returnCreditBalance: 25.00, // Seed return credit balance
    approved: true,
    shippingName: 'Clark Kent',
    shippingAddress1: '321 Daily Planet Way',
    shippingAddress2: '',
    shippingCity: 'Metropolis',
    shippingState: 'IL',
    shippingZip: '62960',
    shippingCountry: 'US',
    taxId: '12-3456789',
    resaleCertificateFileName: 'metropolis_resale_cert.pdf'
  },
  {
    uid: 'ret2',
    email: 'games@gothamreads.com',
    role: 'retailer',
    companyName: 'Gotham Reads & Games',
    tier: 'Tier I', // Tier I starts at 40% discount
    totalCycleSpend: 120,
    returnsUsed: 0,
    returnCreditBalance: 0.00,
    approved: true,
    shippingName: 'Bruce Wayne',
    shippingAddress1: '1007 Mountain Drive',
    shippingAddress2: 'Wayne Manor',
    shippingCity: 'Gotham',
    shippingState: 'NJ',
    shippingZip: '07001',
    shippingCountry: 'US',
    taxId: '98-7654321',
    resaleCertificateFileName: 'gotham_resale_cert.pdf'
  },
  {
    uid: 'poddemo1',
    email: 'podcustomer@philbo.com',
    role: 'pod',
    companyName: 'Bright Star Creative',
    approved: true,
    accountType: 'Philbo POD Customer',
    isPodClient: true,
    podProjectAccess: true,
    firstName: 'Jamie',
    lastName: 'Rivera',
    phone: '555-010-2026',
    customerType: 'Independent Creator',
    expectedQuantity: '100–250 copies',
    shippingName: 'Jamie Rivera',
    shippingAddress1: '125 Creator Way',
    shippingAddress2: 'Studio 4',
    shippingCity: 'Columbus',
    shippingState: 'OH',
    shippingZip: '43215',
    shippingCountry: 'US',
    roleProfiles: {
      pod: {
        customerType: 'Independent Creator',
        expectedQuantity: '100–250 copies',
        shippingAddress1: '125 Creator Way',
        shippingAddress2: 'Studio 4',
        shippingCity: 'Columbus',
        shippingState: 'OH',
        shippingZip: '43215'
      }
    }
  }
];

const SEED_TITLES = [
  {
    titleId: 'title2',
    cycleId: 'cycle_11',
    publisherId: 'pub1',
    publisherName: 'Indy Comic Press',
    title: 'Ghost Hunt #3',
    description: 'The spectral investigators trace the entity back to an abandoned printing press. Paranormal noir.',
    msrp: 3.99,
    coverUrl: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?q=80&w=400&auto=format&fit=crop',
    catalogDate: '2026-05-01',
    focDate: '2026-07-01',
    focLocked: true,
    releaseDate: '2026-08-12',
    status: 'Live',
    barcode: '74470025881002',
    seriesName: 'Ghost Hunt',
    issueNumber: '3',
    language: 'English',
    coverDescription: 'B&W Sketch Variant',
    variantNumber: 'B',
    bookFormat: 'Single Issue',
    seriesType: 'Ongoing',
    seriesCode: 'GHSTHNT',
    seriesFrequency: 'Monthly',
    ageRange: 'Mature',
    pageCount: 32,
    bisac1: 'CGN004050',
    bisac2: 'CGN000000',
    bisac3: 'CGN000000',
    synopsis: 'Spectral gumshoe noir inside a haunted print shop.',
    reprint: 'No',
    printingNumber: 1,
    writer: 'Arthur Pendelton',
    artist: 'Gavin Lee',
    coverArtist: 'Gavin Lee',
    colorProfile: 'B&W',
    width: 6.625,
    height: 10.25,
    weight: 2.7,
    availableForReorder: 'No',
    interiorPdfName: 'ghost_hunt_3_interior.pdf',
    coverArtPdfName: 'ghost_hunt_3_cover.pdf',
    podOption: true
  }
];

const SEED_ORDERS = [];

const SEED_POD_ORDERS = [
  {
    podOrderId: 'POD-1001',
    customerId: 'poddemo1',
    customerName: 'Bright Star Creative',
    customerEmail: 'podcustomer@philbo.com',
    productType: 'self-cover-comics',
    productName: 'Comic Books',
    projectTitle: 'Nova Patrol #1',
    quantity: 100,
    comicSize: '6.625" x 10.25"',
    pageCount: 24,
    interiorColor: 'color',
    interiorPaper: '60# Lynx Super Smooth Text',
    coverType: '70# Gloss Cover',
    requestedSpecifications: '',
    proofPreference: 'Digital proof',
    variants: 1,
    additionalInformation: 'Demo project for reviewing the POD customer workflow.',
    artworkFileName: 'nova-patrol-print-files.pdf',
    pricingSchedule: 'public',
    unitPrice: 2.60,
    baseSubtotal: 260,
    subtotal: 260,
    pricingStatus: 'Public Price Confirmed',
    shippingStatus: 'Shipping Quote Required',
    paymentStatus: 'Not Yet Invoiced',
    status: 'Submitted for Review',
    submittedAt: '2026-07-22T15:30:00.000Z',
    history: [{ date: '2026-07-22T15:30:00.000Z', user: 'podcustomer@philbo.com', action: 'Demo POD order submitted' }],
    demoRecord: true
  },
  {
    podOrderId: 'POD-1002',
    customerId: 'poddemo1',
    customerName: 'Bright Star Creative',
    customerEmail: 'podcustomer@philbo.com',
    productType: 'art-prints',
    productName: 'Art Prints',
    projectTitle: 'Convention Character Prints',
    quantity: 150,
    comicSize: null,
    pageCount: null,
    interiorColor: null,
    interiorPaper: null,
    requestedSpecifications: 'Finished size: 11 x 17\nFull-color art prints.',
    proofPreference: 'Digital proof',
    variants: 0,
    additionalInformation: 'Needed for a fall convention.',
    artworkFileName: 'convention-print-art.zip',
    unitPrice: null,
    subtotal: null,
    pricingStatus: 'Quote Review',
    shippingStatus: 'Shipping Quote Required',
    paymentStatus: 'Not Yet Invoiced',
    status: 'Quote Requested',
    submittedAt: '2026-07-23T13:15:00.000Z',
    history: [{ date: '2026-07-23T13:15:00.000Z', user: 'podcustomer@philbo.com', action: 'Demo POD quote requested' }],
    demoRecord: true
  }
];

const SEED_RETURNS = [
  {
    returnId: 'RET-5001',
    retailerId: 'ret1',
    retailerName: 'Metropolis Comics',
    titleId: 'title2',
    titleName: 'Ghost Hunt #3',
    qty: 2,
    reason: 'Shelf wear / damaged cover art',
    status: 'approved',
    date: '2026-07-01T10:15:00.000Z'
  }
];

const SEED_INVENTORY = [
  { inventoryId: 'inv-placeholder-2', philboId: 'GHSTHNT-81002', titleId: 'title2', title: 'INVENTORY PLACEHOLDER — Ghost Hunt #3', publisherName: 'Indy Comic Press', fulfillmentMethod: 'Philbo POD', onHand: 64, reserved: 18, damaged: 2, publisherOwned: 5, incoming: 40, reorderLevel: 25, location: 'Sample Shelf A-02', lastAdjustedAt: '2026-07-12T12:05:00.000Z', placeholder: true },
  { inventoryId: 'inv-placeholder-4', philboId: 'PHIL101426-1201', titleId: 'title-import-phil101426-1201', title: 'INVENTORY PLACEHOLDER — SAVAGE The War', publisherName: '10 Ton Press', fulfillmentMethod: 'Publisher Fulfilled', onHand: 22, reserved: 8, damaged: 0, publisherOwned: 0, incoming: 50, reorderLevel: 15, location: 'Sample Shelf B-02', lastAdjustedAt: '2026-07-12T12:15:00.000Z', placeholder: true },
  { inventoryId: 'inv-placeholder-5', philboId: 'PHIL101426-1207', titleId: 'title-import-phil101426-1207', title: 'INVENTORY PLACEHOLDER — THE LYCAN #1', publisherName: 'ABLAZE Publishing', fulfillmentMethod: 'Publisher Fulfilled', onHand: 15, reserved: 10, damaged: 1, publisherOwned: 0, incoming: 100, reorderLevel: 20, location: 'Sample Shelf C-01', lastAdjustedAt: '2026-07-12T12:20:00.000Z', placeholder: true }
];

const IMPORT_PUBLISHER_ALIASES = {
  'ablaze': 'ABLAZE Publishing',
  'ablaze publishing': 'ABLAZE Publishing',
  'star cross comic': 'Star Cross Comics',
  'star cross comics': 'Star Cross Comics'
};

const CONTACT_PUBLISHER_ALIASES = {
  '10 ton press': 'ORCA Comics / Previously 10 Ton Press',
  'ablaze': 'ABLAZE Publishing',
  'aloha comics': 'Aloha Comics',
  'grok! comics': 'Grok! Comics',
  'heroic publishing inc.': 'Heroic Publishing Inc',
  'new pain productions': 'New Pain Pro',
  'studio chikara': 'Studio Chikara and First Comics',
  'get yoour medz': 'Get Your Medz',
  'get your medz': 'Get Your Medz',
  'crooked comix': 'Crooked Comix, LLC',
  'crooked comix, llc': 'Crooked Comix, LLC'
};

const companyKey = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

// Former distribution partners remain linked to their historical catalog titles,
// but must never be activated or invited as current Publisher accounts.
const INACTIVE_HISTORICAL_PUBLISHERS = new Set([
  'adventcomics',
  'monarchcomics',
  'monarchcomicsllc',
  'secondsight',
  'secondsightpublishing',
  'studiochikara',
  'studiochikaraandfirstcomics'
]);

const isInactiveHistoricalPublisher = value => INACTIVE_HISTORICAL_PUBLISHERS.has(companyKey(value));

const markPublisherHistoricalOnly = publisher => {
  if (!publisher || !isInactiveHistoricalPublisher(publisher.companyName)) return false;
  publisher.approved = false;
  publisher.accountStatus = 'suspended';
  publisher.isInvitationPending = false;
  publisher.invitationStatus = 'Historical publisher — inactive';
  publisher.formerPublisher = true;
  publisher.historicalOnly = true;
  return true;
};

function importBundledCatalog() {
  const users = JSON.parse(localStorage.getItem('philbo_users')) || [];
  const titles = JSON.parse(localStorage.getItem('philbo_titles')) || [];
  const getValue = (row, name) => {
    const key = Object.keys(row).find(item => item.trim().toLowerCase() === name.trim().toLowerCase());
    return key ? String(row[key] ?? '').trim() : '';
  };
  const getExactValue = (row, name) => String(row[name] ?? '').trim();
  const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let usersChanged = false;
  let titlesChanged = false;

  importedCatalogRows.forEach((row, index) => {
    const sourcePublisher = getValue(row, 'Publisher');
    const canonicalPublisher = IMPORT_PUBLISHER_ALIASES[sourcePublisher.toLowerCase()] || sourcePublisher;
    let publisher = users.find(user => user.role === 'publisher' && user.companyName.trim().toLowerCase() === canonicalPublisher.toLowerCase());
    if (!publisher) {
      publisher = {
        uid: `pub-import-${slug(canonicalPublisher)}`,
        email: '',
        role: 'publisher',
        companyName: canonicalPublisher,
        sourcePublisherNames: [sourcePublisher],
        commissionRate: null,
        commissionHistory: [],
        approved: false,
        isInvitationPending: true,
        invitationStatus: 'Needs Email',
        importedCatalogAccount: true
      };
      users.push(publisher);
      usersChanged = true;
    } else if (!publisher.sourcePublisherNames?.includes(sourcePublisher)) {
      publisher.sourcePublisherNames = [...(publisher.sourcePublisherNames || []), sourcePublisher];
      usersChanged = true;
    }

    if (markPublisherHistoricalOnly(publisher)) usersChanged = true;

    const philboId = getValue(row, 'Philbo ID');
    if (!philboId || titles.some(title => title.philboId === philboId)) return;
    const priceRaw = getValue(row, 'Price');
    const weightPounds = Number.parseFloat(getValue(row, 'Weight (in POUNDS)'));
    const seriesCode = getValue(row, 'Series Code');
    titles.push({
      titleId: `title-import-${philboId.toLowerCase()}`,
      philboId,
      sourcePhilboId: philboId,
      legacyPhilboId: true,
      publisherId: publisher.uid,
      publisherName: canonicalPublisher,
      sourcePublisherName: sourcePublisher,
      barcode: getValue(row, 'Barcode / UPC / EAN'),
      title: getValue(row, 'Title'),
      catalogDisplayTitle: getExactValue(row, 'Series Name'),
      seriesName: getExactValue(row, 'Series Name '),
      issueNumber: getValue(row, 'Issue Number'),
      variantNumber: getValue(row, 'Variant Number'),
      coverDescription: getValue(row, 'Cover Description'),
      catalogDate: '2026-07-01',
      focDate: '2026-09-01',
      releaseDate: '2026-10-14',
      originalCatalogDate: getValue(row, 'Catalog Date'),
      originalFocDate: getValue(row, 'FOC'),
      originalReleaseDate: getValue(row, 'In Store'),
      cycleId: 'cycle_13',
      msrp: Number.parseFloat(priceRaw.replace(/[^0-9.]/g, '')) || 0,
      priceRaw,
      language: getValue(row, 'Language'),
      bookFormat: getValue(row, 'Book Format'),
      seriesType: getValue(row, 'Type of Series'),
      seriesCode,
      seriesCodeRequiredForFutureId: !seriesCode,
      seriesFrequency: getValue(row, 'Series Frequency'),
      ageRange: getValue(row, 'Media Rating / Age Range'),
      pageCount: Number.parseInt(getValue(row, 'Page Count'), 10) || null,
      bisac1: getValue(row, 'BISAC CODE #1'),
      bisac2: getValue(row, 'BISAC CODE 2'),
      bisac3: getValue(row, 'BISAC CODE 3'),
      description: getValue(row, 'Description of Issue /book'),
      synopsis: getValue(row, 'Brief Synopsis of Book'),
      reprint: getValue(row, 'Reprint'),
      printingNumber: Number.parseInt(getValue(row, 'Printing'), 10) || null,
      writer: getValue(row, 'Writer'),
      artist: getValue(row, 'Artist'),
      coverArtist: getValue(row, 'Cover Artist'),
      colorProfile: getValue(row, 'Color / B&W'),
      widthInches: Number.parseFloat(getValue(row, 'Width')) || null,
      heightInches: Number.parseFloat(getValue(row, 'Height')) || null,
      weightPounds: Number.isFinite(weightPounds) ? weightPounds : null,
      weightOunces: Number.isFinite(weightPounds) ? weightPounds * 16 : null,
      availableForReorder: getValue(row, 'Reorder'),
      coverUrl: normalizeCoverImageUrl(getValue(row, 'Downloadable Cover Image')),
      fulfillmentMethod: '',
      status: 'Draft',
      focLocked: false,
      importedCatalogRecord: true,
      importBatchId: 'Philbo_July_Oct2026',
      sourceRowNumber: index + 2,
      rawCsvData: { ...row },
      history: [{
        date: '2026-07-12T00:00:00.000Z',
        user: 'Catalog Import',
        action: 'Existing title imported as Draft',
        notes: 'Legacy PHILBO ID preserved. Publisher and dates normalized using approved import rules.'
      }]
    });
    titlesChanged = true;
  });

  if (usersChanged) localStorage.setItem('philbo_users', JSON.stringify(users));
  if (titlesChanged) localStorage.setItem('philbo_titles', JSON.stringify(titles));
  localStorage.setItem('philbo_catalog_import_summary', JSON.stringify({
    importBatchId: 'Philbo_July_Oct2026',
    sourceRows: importedCatalogRows.length,
    totalImportedTitles: titles.filter(title => title.importBatchId === 'Philbo_July_Oct2026').length,
    importedPublishers: users.filter(user => user.importedCatalogAccount).length,
    lastCheckedAt: new Date().toISOString()
  }));
}

function importCurrentPhilviewsCatalogs() {
  const migrationKey = 'philbo_import_current_philviews_14_15_v1';
  if (localStorage.getItem(migrationKey)) return;

  const users = readCollection('philbo_users');
  const titles = readCollection('philbo_titles');
  const cycles = readCollection('philbo_catalog_cycles');
  const importedAt = new Date().toISOString();
  const batches = [
    ['cycle_14', philviews14Rows],
    ['cycle_15', philviews15Rows]
  ];
  let createdTitles = 0;
  let createdPublishers = 0;

  batches.forEach(([cycleId, rows]) => {
    rows.forEach(row => {
      const publisherName = String(row.publisherName || '').trim();
      let publisher = users.find(user => normalizeRole(user.role) === ROLE_IDS.PUBLISHER && companyKey(user.companyName) === companyKey(publisherName));
      if (!publisher && publisherName) {
        publisher = {
          uid: `pub-current-${companyKey(publisherName)}`,
          email: '',
          role: ROLE_IDS.PUBLISHER,
          roles: [ROLE_IDS.PUBLISHER],
          companyName: publisherName,
          approved: false,
          accountStatus: 'active',
          isInvitationPending: true,
          invitationStatus: 'Needs Email',
          importedCatalogAccount: true,
          sessionVersion: 1,
          permissionOverrides: {},
          internalNotes: []
        };
        users.push(publisher);
        createdPublishers += 1;
      }

      const existing = titles.find(title => title.titleId === row.titleId || String(title.philboId || '').toLowerCase() === String(row.philboId || '').toLowerCase());
      if (existing) return;
      titles.push({
        ...row,
        publisherId: publisher?.uid || '',
        approvedAt: importedAt,
        approvedBy: 'Current Catalog Test Import',
        publishedAt: importedAt,
        publishedBy: 'Current Catalog Test Import'
      });
      createdTitles += 1;
    });

    const cycle = cycles.find(candidate => candidate.cycleId === cycleId);
    if (!cycle) return;
    const publishedIds = titles
      .filter(title => title.cycleId === cycleId && isTitlePublished(title.status))
      .map(title => title.titleId);
    cycle.catalogPublishedTitleIds = Array.from(new Set(publishedIds));
    cycle.catalogPublicationVersion = Math.max(1, Number(cycle.catalogPublicationVersion || 0));
    cycle.catalogPublishedAt = cycle.catalogPublishedAt || importedAt;
    cycle.catalogPublishedBy = cycle.catalogPublishedBy || 'Current Catalog Test Import';
    cycle.retailerOpen = true;
    cycle.retailerDownloadEnabled = true;
    cycle.status = 'Open for Retailer Ordering';
  });

  writeCollection('philbo_users', users);
  writeCollection('philbo_titles', titles);
  writeCollection('philbo_catalog_cycles', cycles);
  localStorage.setItem(migrationKey, JSON.stringify({
    importedAt,
    createdTitles,
    createdPublishers,
    cycleCounts: Object.fromEntries(batches.map(([cycleId, rows]) => [cycleId, rows.length]))
  }));
}

function restoreBundledCatalogToJulyTestCycle() {
  const migrationKey = 'philbo_restore_72_imported_titles_to_cycle_13_2026_08_29';
  if (localStorage.getItem(migrationKey)) return;

  const titles = readCollection('philbo_titles');
  const targetCycle = readCollection('philbo_catalog_cycles').find(cycle => cycle.cycleId === 'cycle_13');
  if (!targetCycle) return;

  const migratedAt = new Date().toISOString();
  let movedCount = 0;
  titles.forEach(title => {
    const isBundledSeptemberTitle = title.importedCatalogRecord && (
      title.importBatchId === 'Philbo_July_Oct2026' ||
      title.importBatchId === 'Philbo_Sept_Dec2026'
    );
    if (!isBundledSeptemberTitle || title.cycleId === targetCycle.cycleId) return;

    const previousCycleId = title.cycleId;
    title.originalImportBatchId = title.originalImportBatchId || title.importBatchId;
    title.importBatchId = 'Philbo_July_Oct2026';
    title.cycleId = targetCycle.cycleId;
    title.catalogDate = targetCycle.catalogDate;
    title.focDate = targetCycle.focDate;
    title.releaseDate = targetCycle.releaseDate;
    title.focLocked = false;
    title.updatedAt = migratedAt;
    title.history = [
      ...(title.history || []),
      {
        date: migratedAt,
        user: 'System Catalog Correction',
        action: 'Catalog test placement restored by Admin direction',
        notes: `Moved from ${previousCycleId || 'unassigned'} to cycle_13 for cross-portal testing: July 1, 2026 Catalog; September 1, 2026 FOC; October 14, 2026 In-Store.`
      }
    ];
    movedCount += 1;
  });

  if (movedCount) {
    writeCollection('philbo_titles', titles);
    appendAudit({
      action: 'Imported catalog titles restored to July test cycle',
      recordType: 'catalog_cycle_migration',
      recordId: 'cycle_15_to_cycle_13',
      previousValue: { cycleId: 'cycle_15' },
      newValue: { cycleId: 'cycle_13', movedCount },
      notes: 'One-time local prototype test placement authorized by Admin.',
      actor: { uid: 'system', email: 'System Catalog Correction', role: 'system' }
    });
  }
  const importSummary = JSON.parse(localStorage.getItem('philbo_catalog_import_summary') || '{}');
  localStorage.setItem('philbo_catalog_import_summary', JSON.stringify({
    ...importSummary,
    importBatchId: 'Philbo_July_Oct2026',
    totalImportedTitles: titles.filter(title => title.importBatchId === 'Philbo_July_Oct2026').length,
    testCycleId: targetCycle.cycleId,
    testCycleRestoredAt: migratedAt
  }));
  localStorage.setItem(migrationKey, JSON.stringify({ movedCount, migratedAt }));
}

function activateCurrentPhilviewsCatalogCycles() {
  const migrationKey = 'philbo_activate_current_philviews_14_15_2026_09_16';
  if (localStorage.getItem(migrationKey)) return;

  const activatedAt = new Date().toISOString();
  const cycles = readCollection('philbo_catalog_cycles');
  const currentPhilviews = new Map([
    ['cycle_13', SEED_CYCLES.find(cycle => cycle.cycleId === 'cycle_13')],
    ['cycle_14', SEED_CYCLES.find(cycle => cycle.cycleId === 'cycle_14')],
    ['cycle_15', SEED_CYCLES.find(cycle => cycle.cycleId === 'cycle_15')]
  ]);
  const updatedCycleIds = [];

  cycles.forEach(cycle => {
    const official = currentPhilviews.get(cycle.cycleId);
    if (!official) return;
    cycle.cycleName = official.cycleName;
    cycle.catalogDate = official.catalogDate;
    cycle.focDate = official.focDate;
    cycle.releaseDate = official.releaseDate;
    cycle.status = official.status;
    cycle.publisherOpen = false;
    cycle.retailerOpen = true;
    cycle.retailerDownloadEnabled = true;
    cycle.catalogPublicationSuppressed = false;
    cycle.catalogPublishedAt = cycle.catalogPublishedAt || official.catalogPublishedAt || activatedAt;
    cycle.catalogCoverUrl = official.catalogCoverUrl;
    cycle.catalogPdfUrl = official.catalogPdfUrl;
    cycle.adminNotes = official.adminNotes;
    cycle.history = [
      ...(cycle.history || []),
      {
        date: activatedAt,
        user: 'System Catalog Correction',
        action: `PHILVIEWS #${cycle.cycleId.replace('cycle_', '')} catalog details synchronized`,
        notes: 'Admin confirmed this is a current retailer-ordering catalog, not an archived historical cycle.'
      }
    ];
    updatedCycleIds.push(cycle.cycleId);
  });

  if (updatedCycleIds.length) writeCollection('philbo_catalog_cycles', cycles);
  localStorage.setItem(migrationKey, JSON.stringify({ activatedAt, cycleIds: updatedCycleIds }));
}

function activateSeptemberFirstLegacyCatalog() {
  // v2 refreshes browsers that previously marked the titles Live before the
  // authoritative catalog snapshot and downloadable CSV record were complete.
  const migrationKey = 'philbo_activate_foc_2026_09_01_catalog_v2';
  if (localStorage.getItem(migrationKey)) return;

  const targetFocDate = '2026-09-01';
  const activatedAt = new Date().toISOString();
  const titles = readCollection('philbo_titles');
  const cycles = readCollection('philbo_catalog_cycles');
  const exportHistory = readCollection('philbo_catalog_export_history');
  const matchingTitles = titles.filter(title => title.focDate === targetFocDate);
  const matchingCycleIds = new Set(matchingTitles.map(title => title.cycleId).filter(Boolean));

  matchingTitles.forEach(title => {
    const previousStatus = title.status;
    title.status = 'Live';
    title.focLocked = false;
    title.approvedAt = title.approvedAt || activatedAt;
    title.approvedBy = title.approvedBy || 'System September Legacy Catalog Activation';
    title.publishedAt = title.publishedAt || activatedAt;
    title.publishedBy = title.publishedBy || 'System September Legacy Catalog Activation';
    title.updatedAt = activatedAt;
    if (previousStatus !== 'Live') {
      title.history = [
        ...(title.history || []),
        {
          date: activatedAt,
          user: 'System September Legacy Catalog Activation',
          action: `Legacy September FOC title activated from ${previousStatus || 'unknown'} to Live`,
          notes: 'Scoped correction: every title with FOC 2026-09-01 belongs in the live retailer catalog.'
        }
      ];
    }
  });

  cycles.forEach(cycle => {
    if (!matchingCycleIds.has(cycle.cycleId)) return;
    const cycleTitleIds = matchingTitles.filter(title => title.cycleId === cycle.cycleId).map(title => title.titleId);
    cycle.status = 'Open for Retailer Ordering';
    cycle.publisherOpen = false;
    cycle.retailerOpen = true;
    cycle.retailerDownloadEnabled = true;
    cycle.catalogPublicationSuppressed = false;
    cycle.catalogPublishedAt = activatedAt;
    cycle.catalogPublishedBy = 'System September Legacy Catalog Activation';
    cycle.catalogPublicationVersion = Number(cycle.catalogPublicationVersion || 0) + 1;
    cycle.catalogPublishedTitleIds = cycleTitleIds;
    cycle.history = [
      ...(cycle.history || []),
      {
        date: activatedAt,
        user: 'System September Legacy Catalog Activation',
        action: 'September 1 FOC legacy catalog activated',
        notes: `${cycleTitleIds.length} matching title${cycleTitleIds.length === 1 ? '' : 's'} made Live and synchronized to the retailer catalog snapshot.`
      }
    ];

    exportHistory.unshift({
      cycleId: cycle.cycleId,
      filename: `Philbo_Catalog_${(cycle.releaseDate || cycle.catalogDate || '').slice(0, 7) || cycle.cycleId}_FOC_${cycle.focDate || 'unscheduled'}.csv`,
      generatedAt: activatedAt,
      generatedBy: 'system',
      tier: 'Retailer-specific at download',
      titleCount: cycleTitleIds.length,
      catalogPublicationVersion: cycle.catalogPublicationVersion,
      automaticPublication: true,
      legacyCatalogReconciliation: true
    });
  });

  if (matchingTitles.length) {
    writeCollection('philbo_titles', titles);
    writeCollection('philbo_catalog_cycles', cycles);
    writeCollection('philbo_catalog_export_history', exportHistory);
    appendAudit({
      action: 'September 1 FOC legacy catalog activated',
      recordType: 'catalog_cycle_migration',
      recordId: targetFocDate,
      newValue: { titleCount: matchingTitles.length, cycleIds: [...matchingCycleIds] },
      notes: 'One-time scoped legacy correction. Future publisher submissions still require normal review and approval.',
      actor: { uid: 'system', email: 'System September Legacy Catalog Activation', role: 'system' }
    });
  }
  localStorage.setItem(migrationKey, JSON.stringify({ activatedAt, titleCount: matchingTitles.length, cycleIds: [...matchingCycleIds] }));
}

function unlockSeptemberFirstOctoberFourteenthCatalog() {
  const migrationKey = 'philbo_unlock_2026_09_01_foc_2026_10_14_release_v1';
  if (localStorage.getItem(migrationKey)) return;

  const unlockedAt = new Date().toISOString();
  const titles = readCollection('philbo_titles');
  const cycles = readCollection('philbo_catalog_cycles');
  const matchingTitles = titles.filter(title => title.focDate === '2026-09-01' && title.releaseDate === '2026-10-14');
  const matchingCycleIds = new Set(matchingTitles.map(title => title.cycleId).filter(Boolean));

  matchingTitles.forEach(title => {
    title.focLocked = false;
    title.focOverrideOpen = true;
    title.updatedAt = unlockedAt;
    title.history = [
      ...(title.history || []),
      {
        date: unlockedAt,
        user: 'System Ordering Window Override',
        action: 'FOC ordering window reopened',
        notes: 'Admin-authorized override for titles with September 1, 2026 FOC and October 14, 2026 in-store date.'
      }
    ];
  });

  cycles.forEach(cycle => {
    if (!matchingCycleIds.has(cycle.cycleId) || cycle.focDate !== '2026-09-01' || cycle.releaseDate !== '2026-10-14') return;
    cycle.status = 'Open for Retailer Ordering';
    cycle.publisherOpen = false;
    cycle.retailerOpen = true;
    cycle.focOverrideOpen = true;
    cycle.adminNotes = 'Ordering window manually reopened for all September 1 FOC / October 14 in-store titles.';
  });

  writeCollection('philbo_titles', titles);
  writeCollection('philbo_catalog_cycles', cycles);
  appendAudit({
    action: 'Catalog ordering window manually reopened',
    recordType: 'catalog_cycle_override',
    recordId: 'foc_2026-09-01_release_2026-10-14',
    newValue: { titleCount: matchingTitles.length, cycleIds: [...matchingCycleIds], focOverrideOpen: true },
    notes: 'Scoped to the September 1, 2026 FOC and October 14, 2026 in-store date pair.',
    actor: { uid: 'system', email: 'System Ordering Window Override', role: 'system' }
  });
  localStorage.setItem(migrationKey, JSON.stringify({ unlockedAt, titleCount: matchingTitles.length, cycleIds: [...matchingCycleIds] }));
}

function archiveOrcaLegacyTitles() {
  const migrationKey = 'philbo_archive_orca_legacy_10_ton_titles_v1';
  if (localStorage.getItem(migrationKey)) return;

  const archivedAt = new Date().toISOString();
  const titles = readCollection('philbo_titles');
  const matchingTitles = titles.filter(title => ['10tonpress', 'orcacomicspreviously10tonpress'].includes(companyKey(title.publisherName)));

  matchingTitles.forEach(title => {
    const previousStatus = title.status;
    title.status = 'Archived';
    title.historicalOnly = true;
    title.focLocked = true;
    title.focOverrideOpen = false;
    title.availableForReorder = 'No';
    title.updatedAt = archivedAt;
    if (previousStatus !== 'Archived') {
      title.history = [
        ...(title.history || []),
        {
          date: archivedAt,
          user: 'System Publisher Transition',
          action: `Legacy title archived from ${previousStatus || 'unknown'}`,
          notes: 'ORCA Comics remains eligible for an active Publisher account, but previously submitted 10 Ton Press books are historical and unavailable for ordering.'
        }
      ];
    }
  });

  if (matchingTitles.length) writeCollection('philbo_titles', titles);
  localStorage.setItem(migrationKey, JSON.stringify({ archivedAt, titleCount: matchingTitles.length }));
}

function publishDueRetailerCatalogs() {
  const cycles = readCollection('philbo_catalog_cycles');
  const titles = readCollection('philbo_titles');
  const exportHistory = readCollection('philbo_catalog_export_history');
  const today = new Date();
  const publishedAt = today.toISOString();
  let cyclesChanged = false;
  let historyChanged = false;

  cycles.forEach(cycle => {
    const catalogDate = new Date(`${cycle.catalogDate}T00:00:00`);
    const focDate = new Date(`${cycle.focDate}T23:59:59`);
    const isCatalogWindow = catalogDate <= today && today <= focDate;
    const approvedTitles = titles.filter(title => title.cycleId === cycle.cycleId && isTitlePublished(title.status));
    if (!isCatalogWindow || !approvedTitles.length || cycle.catalogPublicationSuppressed || cycle.catalogPublishedAt) return;

    cycle.status = 'Open for Retailer Ordering';
    cycle.publisherOpen = false;
    cycle.retailerOpen = true;
    cycle.retailerDownloadEnabled = true;
    cycle.catalogPublishedAt = publishedAt;
    cycle.catalogPublishedBy = 'System Catalog Date Publisher';
    cycle.catalogPublicationVersion = 1;
    cycle.catalogPublishedTitleIds = approvedTitles.map(title => title.titleId);
    cycle.history = [
      ...(cycle.history || []),
      {
        date: publishedAt,
        user: 'System Catalog Date Publisher',
        action: 'Retailer catalog published automatically',
        notes: `${approvedTitles.length} approved title${approvedTitles.length === 1 ? '' : 's'} published for retailer ordering and CSV download.`
      }
    ];
    cyclesChanged = true;

    const filename = `Philbo_Catalog_${(cycle.releaseDate || cycle.catalogDate || '').slice(0, 7) || cycle.cycleId}_FOC_${cycle.focDate || 'unscheduled'}.csv`;
    exportHistory.unshift({
      cycleId: cycle.cycleId,
      filename,
      generatedAt: publishedAt,
      generatedBy: 'system',
      tier: 'Retailer-specific at download',
      titleCount: approvedTitles.length,
      catalogPublicationVersion: 1,
      automaticPublication: true
    });
    historyChanged = true;
  });

  if (cyclesChanged) writeCollection('philbo_catalog_cycles', cycles);
  if (historyChanged) writeCollection('philbo_catalog_export_history', exportHistory);
}

function synchronizeCatalogPublicationForTitle(title, actor = null) {
  if (!title?.cycleId) return { published: false, reason: 'No Catalog Cycle is assigned.' };
  const cycles = readCollection('philbo_catalog_cycles');
  const titles = readCollection('philbo_titles');
  const cycleIndex = cycles.findIndex(cycle => cycle.cycleId === title.cycleId);
  if (cycleIndex < 0) return { published: false, reason: 'The assigned Catalog Cycle was not found.' };

  const cycle = cycles[cycleIndex];
  const now = new Date();
  const catalogDate = new Date(`${cycle.catalogDate}T00:00:00`);
  const focDate = new Date(`${cycle.focDate}T23:59:59`);
  const publicationWindowOpen = catalogDate <= now && now <= focDate;
  const alreadyPublished = Boolean(cycle.catalogPublishedAt || cycle.retailerOpen);
  if (!publicationWindowOpen && !alreadyPublished) {
    return { published: false, reason: `${cycle.cycleName} has not reached its catalog publication date.`, cycle };
  }
  if (now > focDate || ['FOC Locked', 'Released', 'Archived'].includes(cycle.status)) {
    return { published: false, reason: `${cycle.cycleName} is FOC locked.`, cycle };
  }

  const approvedTitles = titles.filter(candidate => candidate.cycleId === cycle.cycleId && isTitlePublished(candidate.status));
  if (!approvedTitles.length && !alreadyPublished) {
    return { published: false, reason: `${cycle.cycleName} has no approved catalog titles.`, cycle };
  }

  const publishedAt = now.toISOString();
  const nextVersion = Number(cycle.catalogPublicationVersion || 0) + 1;
  const updatedCycle = {
    ...cycle,
    status: 'Open for Retailer Ordering',
    publisherOpen: false,
    retailerOpen: true,
    retailerDownloadEnabled: true,
    catalogPublicationSuppressed: false,
    catalogPublishedAt: publishedAt,
    catalogPublishedBy: actor?.uid || actor?.email || 'System Catalog Synchronizer',
    catalogPublicationVersion: nextVersion,
    catalogPublishedTitleIds: approvedTitles.map(candidate => candidate.titleId),
    history: [
      ...(cycle.history || []),
      {
        date: publishedAt,
        user: actor?.email || actor?.companyName || 'System Catalog Synchronizer',
        action: cycle.catalogPublishedAt ? 'Catalog synchronized after title decision' : 'Retailer catalog published after title approval',
        notes: `${approvedTitles.length} approved title${approvedTitles.length === 1 ? '' : 's'} now power the public catalog, retailer catalog, and canonical CSV.`
      }
    ]
  };
  cycles[cycleIndex] = updatedCycle;
  writeCollection('philbo_catalog_cycles', cycles);

  const exportHistory = readCollection('philbo_catalog_export_history');
  exportHistory.unshift({
    cycleId: cycle.cycleId,
    filename: `Philbo_Catalog_${(cycle.releaseDate || cycle.catalogDate || '').slice(0, 7) || cycle.cycleId}_FOC_${cycle.focDate || 'unscheduled'}.csv`,
    generatedAt: publishedAt,
    generatedBy: actor?.uid || 'system',
    tier: 'Retailer-specific at download',
    titleCount: approvedTitles.length,
    catalogPublicationVersion: nextVersion,
    automaticTitleSynchronization: true
  });
  writeCollection('philbo_catalog_export_history', exportHistory);
  return { published: true, cycle: updatedCycle, titleCount: approvedTitles.length, version: nextVersion };
}

function repairActiveCatalogPublicationSnapshots() {
  const migrationKey = 'philbo_reconcile_active_catalog_snapshots_2026_09_01';
  // This is intentionally rechecked on every prototype startup. Older browser
  // data can gain an approved title after the original one-time migration ran;
  // the comparison below is idempotent and writes only when the snapshot differs.
  const cycles = readCollection('philbo_catalog_cycles');
  const titles = readCollection('philbo_titles');
  const repairedAt = new Date().toISOString();
  let repairedCount = 0;

  cycles.forEach(cycle => {
    if (!cycle.retailerOpen && !cycle.catalogPublishedAt) return;
    if (['FOC Locked', 'Released', 'Archived'].includes(cycle.status)) return;
    const approvedTitleIds = titles
      .filter(title => title.cycleId === cycle.cycleId && isTitlePublished(title.status))
      .map(title => title.titleId)
      .sort();
    const snapshotTitleIds = [...(cycle.catalogPublishedTitleIds || [])].sort();
    if (JSON.stringify(approvedTitleIds) === JSON.stringify(snapshotTitleIds)) return;

    cycle.catalogPublishedTitleIds = approvedTitleIds;
    cycle.catalogPublicationVersion = Number(cycle.catalogPublicationVersion || 0) + 1;
    cycle.catalogPublishedAt = repairedAt;
    cycle.catalogPublishedBy = 'System Catalog Reconciler';
    cycle.retailerOpen = true;
    cycle.retailerDownloadEnabled = true;
    cycle.status = 'Open for Retailer Ordering';
    cycle.history = [
      ...(cycle.history || []),
      {
        date: repairedAt,
        user: 'System Catalog Reconciler',
        action: 'Active catalog snapshot reconciled',
        notes: `Reconciled the single catalog snapshot to ${approvedTitleIds.length} approved title${approvedTitleIds.length === 1 ? '' : 's'} after approval synchronization repair.`
      }
    ];
    repairedCount += 1;
  });

  if (repairedCount) writeCollection('philbo_catalog_cycles', cycles);
  localStorage.setItem(migrationKey, JSON.stringify({ repairedAt, repairedCount }));
}

function importBundledPublisherContacts() {
  const users = readCollection('philbo_users');
  let created = 0;
  let updated = 0;
  let reviewNeeded = 0;

  importedPublisherContacts.forEach(response => {
    const sourceName = String(response.publisherName || '').trim();
    if (!sourceName) return;
    const canonicalName = CONTACT_PUBLISHER_ALIASES[sourceName.toLowerCase()] || sourceName;
    const responseEmails = [response.publisherEmail, response.formResponseEmail, response.ccEmail1, response.ccEmail2]
      .map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
    let publisher = users.find(user => normalizeRole(user.role) === ROLE_IDS.PUBLISHER && companyKey(user.companyName) === companyKey(canonicalName));
    let matchedByEmail = false;
    if (!publisher && responseEmails.length) {
      publisher = users.find(user => normalizeRole(user.role) === ROLE_IDS.PUBLISHER &&
        [user.email, user.publisherEmail, user.ccEmail1, user.ccEmail2].map(value => String(value || '').trim().toLowerCase()).some(email => email && responseEmails.includes(email)));
      matchedByEmail = Boolean(publisher);
    }
    if (!publisher) {
      publisher = {
        uid: `pub-contact-${companyKey(canonicalName) || Math.random().toString(36).slice(2, 8)}`,
        email: response.publisherEmail || response.formResponseEmail || '',
        role: ROLE_IDS.PUBLISHER,
        roles: [ROLE_IDS.PUBLISHER],
        companyName: canonicalName,
        approved: true,
        accountStatus: 'active',
        commissionRate: null,
        commissionHistory: [],
        isInvitationPending: true,
        invitationStatus: 'Needs Email',
        importedPublisherContactAccount: true,
        sessionVersion: 1,
        permissionOverrides: {},
        internalNotes: []
      };
      users.push(publisher);
      created += 1;
    } else {
      updated += 1;
    }

    publisher.sourcePublisherNames = Array.from(new Set([...(publisher.sourcePublisherNames || []), sourceName]));
    publisher.contactImportResponses = publisher.contactImportResponses || [];
    if (!publisher.contactImportResponses.some(item => item.sourceRowNumber === response.sourceRowNumber)) {
      publisher.contactImportResponses.push({ ...response });
    }

    const incomingTime = Date.parse(response.timestamp || '') || 0;
    const currentTime = Date.parse(publisher.contactProfileUpdatedAt || '') || 0;
    // The bundled form is seed data. Once a publisher or Admin saves the live
    // profile, reopening the app must never replace that work with the CSV copy.
    if (!publisher.profileManuallyUpdatedAt && (!publisher.contactProfileUpdatedAt || incomingTime >= currentTime)) {
      publisher.publisherLogoUrl = response.publisherLogoUrl || publisher.publisherLogoUrl || '';
      publisher.mailingAddress = response.mailingAddress || publisher.mailingAddress || '';
      publisher.primaryPhone = response.primaryPhone || publisher.primaryPhone || '';
      publisher.publisherEmail = response.publisherEmail || publisher.publisherEmail || publisher.email || '';
      publisher.ccEmail1 = response.ccEmail1 || '';
      publisher.ccEmail2 = response.ccEmail2 || '';
      publisher.outsidePrinter = response.outsidePrinter || '';
      publisher.contactName = response.contactName || publisher.contactName || '';
      publisher.secondaryPhoneAndContact = response.secondaryPhoneAndContact || '';
      publisher.facebookGroupStatus = response.facebookGroupStatus || '';
      publisher.formResponseEmail = response.formResponseEmail || '';
      publisher.contactProfileUpdatedAt = response.timestamp || publisher.contactProfileUpdatedAt || '';
      if (!publisher.email) publisher.email = response.publisherEmail || response.formResponseEmail || '';
    }

    if (matchedByEmail && companyKey(publisher.companyName) !== companyKey(canonicalName)) {
      publisher.contactImportReviewNeeded = true;
      publisher.contactImportReviewNotes = Array.from(new Set([...(publisher.contactImportReviewNotes || []), `CSV name "${sourceName}" matched ${publisher.companyName} by email.`]));
      reviewNeeded += 1;
    }

    markPublisherHistoricalOnly(publisher);
  });

  writeCollection('philbo_users', users);
  writeCollection('philbo_publisher_contact_import_summary', {
    sourceRows: importedPublisherContacts.length,
    createdPublishers: created,
    matchedOrUpdatedResponses: updated,
    reviewNeeded,
    lastCheckedAt: new Date().toISOString()
  });
}

function migrateOrcaPublisherAccount() {
  const users = readCollection('philbo_users');
  const publisher = users.find(user => normalizeRole(user.role) === ROLE_IDS.PUBLISHER &&
    ['10tonpress', 'orcacomicspreviously10tonpress'].includes(companyKey(user.companyName)));
  if (!publisher) return;

  publisher.companyName = 'ORCA Comics / Previously 10 Ton Press';
  publisher.sourcePublisherNames = Array.from(new Set([...(publisher.sourcePublisherNames || []), '10 Ton Press']));
  publisher.approved = true;
  publisher.accountStatus = 'active';
  publisher.isInvitationPending = true;
  publisher.invitationStatus = publisher.email ? 'Ready to Invite' : 'Needs Email';
  publisher.formerPublisher = false;
  publisher.historicalOnly = false;
  writeCollection('philbo_users', users);
}

const isClosedFocCycle = cycle => Boolean(cycle && ['FOC Locked', 'Released', 'Archived'].includes(cycle.status) && !cycle.retailerOpen);

function finalizePurchaseOrdersForCycle(cycleId, actor = null) {
  const cycles = readCollection('philbo_catalog_cycles');
  const cycle = cycles.find(item => item.cycleId === cycleId);
  if (!isClosedFocCycle(cycle)) throw new Error('Purchase Orders are created only after the Catalog Cycle FOC is closed.');
  const stored = readCollection('philbo_purchase_orders');
  const existing = stored.filter(po => po.cycleId === cycleId && po.status === 'Official');
  if (existing.length) return existing;

  const titles = readCollection('philbo_titles');
  const users = readCollection('philbo_users');
  const orders = readCollection('philbo_orders').filter(order => order.paymentStatus === 'paid');
  const grouped = {};
  orders.forEach(order => (order.items || []).forEach(item => {
    const title = titles.find(record => record.titleId === item.titleId);
    if (!title || title.cycleId !== cycleId) return;
    const publisherId = title.publisherId || item.publisherId;
    if (!publisherId) return;
    grouped[publisherId] ||= {};
    grouped[publisherId][title.titleId] ||= {
      titleId: title.titleId, philboId: title.philboId || '', barcode: title.barcode || '', title: title.title || item.titleName,
      qty: 0, msrp: Number(item.msrp || title.msrp || 0), msrpTotal: 0, wholesaleTotal: 0
    };
    const line = grouped[publisherId][title.titleId];
    const qty = Number(item.qty || 0);
    line.qty += qty;
    line.msrpTotal += qty * Number(item.msrp || title.msrp || 0);
    line.wholesaleTotal += qty * Number(item.wholesalePrice || 0);
  }));

  const revision = stored.filter(po => po.cycleId === cycleId).reduce((max, po) => Math.max(max, Number(po.revision || 0)), 0) + 1;
  const createdAt = new Date().toISOString();
  const official = Object.entries(grouped).map(([publisherId, titleMap], publisherIndex) => {
    const publisher = users.find(user => user.uid === publisherId) || {};
    const commissionRate = Number(publisher.commissionRate ?? 0.10);
    let msrpTotal = 0; let wholesaleTotal = 0; let totalCommission = 0;
    const items = Object.values(titleMap).map(line => {
      const commission = line.msrpTotal * commissionRate;
      const netDue = line.wholesaleTotal - commission;
      msrpTotal += line.msrpTotal; wholesaleTotal += line.wholesaleTotal; totalCommission += commission;
      return { ...line, averageWholesalePrice: line.qty ? line.wholesaleTotal / line.qty : 0, wholesalePrice: line.qty ? line.wholesaleTotal / line.qty : 0, lineTotal: line.wholesaleTotal, commission, netDue };
    });
    const publisherCode = String(publisher.companyName || publisherId).replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8) || `PUB${publisherIndex + 1}`;
    return {
      poNumber: `PHILBO-PO-${cycle.focDate}-${publisherCode}-R${String(revision).padStart(2, '0')}`,
      cycleId, cycleName: cycle.cycleName, catalogDate: cycle.catalogDate, focDate: cycle.focDate, releaseDate: cycle.releaseDate,
      targetReleaseMonth: String(cycle.releaseDate || '').slice(0, 7), publisherId, publisherName: publisher.companyName || 'Unknown Publisher',
      poDate: createdAt.slice(0, 10), finalizedAt: createdAt, revision, status: 'Official', items,
      totalUnits: items.reduce((sum, item) => sum + item.qty, 0), msrpTotal: Number(msrpTotal.toFixed(2)),
      wholesaleTotal: Number(wholesaleTotal.toFixed(2)), totalCommission: Number(totalCommission.toFixed(2)),
      netDueToPublisher: Number((wholesaleTotal - totalCommission).toFixed(2)), commissionRate: `${commissionRate * 100}%`
    };
  });
  writeCollection('philbo_purchase_orders', [...stored, ...official]);
  official.forEach(po => appendAudit({ action: 'Purchase Order finalized after FOC close', recordType: 'purchase_order', recordId: po.poNumber, newValue: po, notes: `Catalog Cycle ${cycleId}`, actor }));
  return official;
}

function voidPurchaseOrdersForCycle(cycleId, actor = null) {
  const stored = readCollection('philbo_purchase_orders');
  let changed = false;
  stored.forEach(po => {
    if (po.cycleId === cycleId && po.status === 'Official') {
      po.status = 'Voided — FOC Reopened'; po.voidedAt = new Date().toISOString(); changed = true;
      appendAudit({ action: 'Purchase Order voided because FOC reopened', recordType: 'purchase_order', recordId: po.poNumber, previousValue: 'Official', newValue: po.status, actor });
    }
  });
  if (changed) writeCollection('philbo_purchase_orders', stored);
}

// Initialize database
function initDb() {
  let resetNeeded = false;
  try {
    const usersStr = localStorage.getItem('philbo_users');
    if (usersStr) {
      const users = JSON.parse(usersStr);
      // If the schema is missing new attributes, trigger a reset
      if (users.length > 0 && users.some(u => u.role === 'retailer' && (u.returnCreditBalance === undefined || u.taxId === undefined))) {
        resetNeeded = true;
      }
    }

    const titlesStr = localStorage.getItem('philbo_titles');
    if (titlesStr) {
      const titles = JSON.parse(titlesStr);
      // Reset if titles do not have the extended columns (e.g. barcode)
      if (titles.length > 0 && titles.some(t => t.barcode === undefined)) {
        resetNeeded = true;
      }
    }
  } catch (e) {
    resetNeeded = true;
  }

  if (resetNeeded || !localStorage.getItem('philbo_users')) {
    localStorage.setItem('philbo_users', JSON.stringify(SEED_USERS));
  }
  if (resetNeeded || !localStorage.getItem('philbo_titles')) {
    localStorage.setItem('philbo_titles', JSON.stringify(SEED_TITLES));
  }
  if (resetNeeded || !localStorage.getItem('philbo_catalog_cycles')) {
    localStorage.setItem('philbo_catalog_cycles', JSON.stringify(SEED_CYCLES));
  }

  // One-time correction: the official schedule is defined by the catalog cycle.
  // Older saved title records contained placeholder dates that could disagree
  // with the cycle selected for the book.
  const officialScheduleMigrationKey = 'philbo_official_cycle_schedule_2026_07_21';
  if (!localStorage.getItem(officialScheduleMigrationKey)) {
    try {
      const cycles = JSON.parse(localStorage.getItem('philbo_catalog_cycles')) || [];
      const officialCyclesById = new Map(SEED_CYCLES.map(cycle => [cycle.cycleId, cycle]));
      cycles.forEach(cycle => {
        const official = officialCyclesById.get(cycle.cycleId);
        if (!official) return;
        cycle.catalogDate = official.catalogDate;
        cycle.focDate = official.focDate;
        cycle.releaseDate = official.releaseDate;
        cycle.cycleName = official.cycleName;
      });
      localStorage.setItem('philbo_catalog_cycles', JSON.stringify(cycles));

      const cyclesById = new Map(cycles.map(cycle => [cycle.cycleId, cycle]));
      const titles = JSON.parse(localStorage.getItem('philbo_titles')) || [];
      titles.forEach(title => {
        const cycle = cyclesById.get(title.cycleId);
        if (!cycle) return;
        const datesChanged = title.catalogDate !== cycle.catalogDate || title.focDate !== cycle.focDate || title.releaseDate !== cycle.releaseDate;
        title.catalogDate = cycle.catalogDate;
        title.focDate = cycle.focDate;
        title.releaseDate = cycle.releaseDate;
        title.focLocked = isClosedFocCycle(cycle);
        if (datesChanged) {
          title.history = [
            ...(title.history || []),
            {
              date: new Date().toISOString(),
              user: 'System Schedule Correction',
              action: 'Book dates synchronized to official catalog cycle',
              notes: `Catalog ${cycle.catalogDate}; FOC ${cycle.focDate}; store release ${cycle.releaseDate}.`
            }
          ];
        }
      });
      localStorage.setItem('philbo_titles', JSON.stringify(titles));
      localStorage.setItem(officialScheduleMigrationKey, new Date().toISOString());
    } catch (e) {
      console.error('Official catalog schedule migration failed:', e);
    }
  }

  // Older browser-storage snapshots may predate one or more demo accounts.
  // Restore missing demo records without replacing real users or their changes.
  try {
    const users = JSON.parse(localStorage.getItem('philbo_users')) || [];
    let usersUpdated = false;
    SEED_USERS.forEach(seedUser => {
      const existingIndex = users.findIndex(user => user.uid === seedUser.uid || user.email?.toLowerCase() === seedUser.email.toLowerCase());
      if (existingIndex === -1) {
        users.push({ ...seedUser });
        usersUpdated = true;
        return;
      }
      const existing = users[existingIndex];
      const requiredDemoFields = [
        'role', 'companyName', 'approved', 'tier', 'totalCycleSpend', 'returnsUsed', 'returnCreditBalance',
        'accountType', 'isPodClient', 'podProjectAccess', 'firstName', 'lastName', 'customerType',
        'expectedQuantity', 'shippingName', 'shippingAddress1', 'shippingAddress2', 'shippingCity',
        'shippingState', 'shippingZip', 'shippingCountry', 'roleProfiles'
      ];
      requiredDemoFields.forEach(field => {
        if (existing[field] === undefined && seedUser[field] !== undefined) {
          existing[field] = seedUser[field];
          usersUpdated = true;
        }
      });
    });
    if (usersUpdated) localStorage.setItem('philbo_users', JSON.stringify(users));
  } catch (e) {
    console.error('Demo account migration failed:', e);
  }

  // Schema migrations for workflow and audit features
  try {
    const users = JSON.parse(localStorage.getItem('philbo_users')) || [];
    let usersUpdated = false;
    users.forEach(u => {
      const originalRole = u.role;
      if (u.uid === 'admin1' || u.role === 'super-admin') u.role = ROLE_IDS.MOOS;
      else u.role = normalizeRole(u.role);
      u.roles = Array.from(new Set((u.roles || [originalRole]).map(normalizeRole)));
      if (u.uid === 'admin1') {
        u.roles = [ROLE_IDS.MOOS];
        u.email = 'mauramariepowers@gmail.com';
      }
      if (originalRole === 'pod') {
        u.accountType = u.accountType || 'Philbo POD Customer';
        u.isPodClient = true;
        u.podProjectAccess = u.podProjectAccess !== false;
      }
      if (!u.accountStatus) u.accountStatus = 'active';
      if (u.sessionVersion === undefined) u.sessionVersion = 1;
      if (!u.permissionOverrides) u.permissionOverrides = {};
      if (!u.internalNotes) u.internalNotes = [];
      usersUpdated = true;
      if (u.role === 'publisher' && !u.commissionHistory) {
        u.commissionHistory = [];
        usersUpdated = true;
      }
    });
    if (usersUpdated) {
      localStorage.setItem('philbo_users', JSON.stringify(users));
    }

    const titles = JSON.parse(localStorage.getItem('philbo_titles')) || [];
    let titlesUpdated = false;
    titles.forEach(t => {
      const seededTitle = SEED_TITLES.find(seed => seed.titleId === t.titleId);
      if (seededTitle && t.status?.toLowerCase() === 'approved') {
        t.status = 'Live';
        t.cycleId = t.cycleId || seededTitle.cycleId;
        titlesUpdated = true;
      }
      if (!t.status) {
        t.status = 'Live'; // default for seeded ones
        titlesUpdated = true;
      }
      if (!t.history) {
        t.history = [
          {
            date: new Date().toISOString(),
            user: 'System Seed',
            action: 'Admin approved and published title',
            notes: 'Initial database seeding.'
          }
        ];
        titlesUpdated = true;
      }
    });
    if (titlesUpdated) {
      localStorage.setItem('philbo_titles', JSON.stringify(titles));
    }
  } catch (e) {
    console.error("Migration failed:", e);
  }
  if (resetNeeded || !localStorage.getItem('philbo_orders')) {
    localStorage.setItem('philbo_orders', JSON.stringify(SEED_ORDERS));
  } else {
    const orders = JSON.parse(localStorage.getItem('philbo_orders')) || [];
    let ordersUpdated = false;
    orders.forEach(order => {
      if (/^PO-\d+$/i.test(order.orderId || '')) {
        order.orderId = order.orderId.replace(/^PO-/i, 'SO-');
        ordersUpdated = true;
      }
    });
    if (ordersUpdated) localStorage.setItem('philbo_orders', JSON.stringify(orders));
  }
  if (resetNeeded || !localStorage.getItem('philbo_returns')) {
    localStorage.setItem('philbo_returns', JSON.stringify(SEED_RETURNS));
  } else {
    const returns = JSON.parse(localStorage.getItem('philbo_returns')) || [];
    SEED_RETURNS.filter(item => item.placeholder && !returns.some(existing => existing.returnId === item.returnId)).forEach(item => returns.push(item));
    localStorage.setItem('philbo_returns', JSON.stringify(returns));
  }
  if (!localStorage.getItem('philbo_inventory')) {
    localStorage.setItem('philbo_inventory', JSON.stringify(SEED_INVENTORY));
  }
  if (!localStorage.getItem('philbo_pod_orders')) {
    localStorage.setItem('philbo_pod_orders', JSON.stringify(SEED_POD_ORDERS));
  } else {
    const podOrders = JSON.parse(localStorage.getItem('philbo_pod_orders')) || [];
    SEED_POD_ORDERS.filter(seed => !podOrders.some(order => order.podOrderId === seed.podOrderId))
      .forEach(seed => podOrders.push({ ...seed }));
    localStorage.setItem('philbo_pod_orders', JSON.stringify(podOrders));
  }
  if (!localStorage.getItem('philbo_audit_log')) writeCollection('philbo_audit_log', []);
  if (!localStorage.getItem('philbo_operational_notes')) writeCollection('philbo_operational_notes', []);
  if (!localStorage.getItem('philbo_production_orders')) writeCollection('philbo_production_orders', []);
  if (!localStorage.getItem('philbo_purchase_orders')) writeCollection('philbo_purchase_orders', []);

  // Remove the retired prototype catalog titles and every local demo record
  // that referred to them, while preserving unrelated lines in mixed orders.
  const retiredPrototypeCleanupKey = 'philbo_retired_prototype_titles_2026_09_16';
  if (!localStorage.getItem(retiredPrototypeCleanupKey)) {
    try {
      const retiredTitleIds = new Set(['title1', 'title3']);
      writeCollection('philbo_titles', readCollection('philbo_titles').filter(title => !retiredTitleIds.has(title.titleId)));
      writeCollection('philbo_returns', readCollection('philbo_returns').filter(item => !retiredTitleIds.has(item.titleId)));
      writeCollection('philbo_inventory', readCollection('philbo_inventory').filter(item => !retiredTitleIds.has(item.titleId)));
      writeCollection('philbo_production_orders', readCollection('philbo_production_orders').filter(item => !retiredTitleIds.has(item.titleId)));

      const cleanItemRecords = collection => collection
        .map(record => {
          const itemField = Array.isArray(record.items) ? 'items' : (Array.isArray(record.lines) ? 'lines' : null);
          if (!itemField) return record;
          const items = record[itemField].filter(item => !retiredTitleIds.has(item.titleId));
          if (items.length === record[itemField].length) return record;
          const msrpTotal = items.reduce((sum, item) => sum + (Number(item.msrp || 0) * Number(item.qty || item.quantity || 0)), 0);
          const netTotal = items.reduce((sum, item) => sum + (Number(item.wholesalePrice || item.lineTotal || 0) * Number(item.qty || item.quantity || 0)), 0);
          return { ...record, [itemField]: items, msrpTotal, netTotal, discountTotal: Math.max(0, msrpTotal - netTotal) };
        })
        .filter(record => !Array.isArray(record.items) || record.items.length > 0)
        .filter(record => !Array.isArray(record.lines) || record.lines.length > 0);
      writeCollection('philbo_orders', cleanItemRecords(readCollection('philbo_orders')));
      writeCollection('philbo_purchase_orders', cleanItemRecords(readCollection('philbo_purchase_orders')));

      const cycles = readCollection('philbo_catalog_cycles').map(cycle => ({
        ...cycle,
        catalogPublishedTitleIds: Array.isArray(cycle.catalogPublishedTitleIds)
          ? cycle.catalogPublishedTitleIds.filter(titleId => !retiredTitleIds.has(titleId))
          : cycle.catalogPublishedTitleIds
      }));
      writeCollection('philbo_catalog_cycles', cycles);

      readCollection('philbo_users').forEach(user => {
        const cartKey = `philbo_cart_${user.uid}`;
        const cart = JSON.parse(localStorage.getItem(cartKey) || '{}');
        let changed = false;
        retiredTitleIds.forEach(titleId => {
          if (Object.hasOwn(cart, titleId)) {
            delete cart[titleId];
            changed = true;
          }
        });
        if (changed) localStorage.setItem(cartKey, JSON.stringify(cart));
      });

      localStorage.setItem(retiredPrototypeCleanupKey, new Date().toISOString());
    } catch (error) {
      console.error('Retired prototype title cleanup failed:', error);
    }
  }

  importBundledCatalog();
  restoreBundledCatalogToJulyTestCycle();
  activateCurrentPhilviewsCatalogCycles();
  importCurrentPhilviewsCatalogs();
  activateSeptemberFirstLegacyCatalog();
  unlockSeptemberFirstOctoberFourteenthCatalog();
  archiveOrcaLegacyTitles();
  publishDueRetailerCatalogs();
  repairActiveCatalogPublicationSnapshots();
  normalizeStoredCoverImageUrls();
  importBundledPublisherContacts();
  migrateOrcaPublisherAccount();
  readCollection('philbo_catalog_cycles').filter(isClosedFocCycle).forEach(cycle => {
    finalizePurchaseOrdersForCycle(cycle.cycleId, { uid: 'system', email: 'System FOC Migration', role: 'system' });
  });
}

initDb();

export const db = {
  getInventory: () => {
    const inventory = JSON.parse(localStorage.getItem('philbo_inventory')) || [];
    return inventory.map(item => ({
      ...item,
      available: Math.max(0, Number(item.onHand || 0) - Number(item.reserved || 0) - Number(item.damaged || 0) - Number(item.publisherOwned || 0))
    }));
  },

  updateInventory: (inventoryId, changes, userName) => {
    const inventory = JSON.parse(localStorage.getItem('philbo_inventory')) || [];
    const index = inventory.findIndex(item => item.inventoryId === inventoryId);
    if (index < 0) throw new Error('Inventory record not found.');
    const numericFields = ['onHand', 'reserved', 'damaged', 'publisherOwned', 'incoming', 'reorderLevel'];
    const safeChanges = {};
    Object.entries(changes).forEach(([field, value]) => {
      if (numericFields.includes(field)) safeChanges[field] = Math.max(0, Number(value) || 0);
      if (field === 'location') safeChanges.location = String(value || '').trim();
    });
    const previous = inventory[index];
    inventory[index] = {
      ...previous,
      ...safeChanges,
      lastAdjustedAt: new Date().toISOString(),
      adjustmentHistory: [
        ...(previous.adjustmentHistory || []),
        { date: new Date().toISOString(), user: userName, changes: safeChanges }
      ]
    };
    localStorage.setItem('philbo_inventory', JSON.stringify(inventory));
    return db.getInventory().find(item => item.inventoryId === inventoryId);
  },

  // Catalog Cycles Management
  getCatalogCycles: () => {
    // Automatic Locking: Check if any open/upcoming cycles have passed their FOC Date
    const cycles = JSON.parse(localStorage.getItem('philbo_catalog_cycles')) || [];
    const now = new Date();
    let updated = false;
    const automaticallyLockedCycleIds = [];
    
    const updatedCycles = cycles.map(c => {
      // If FOC Date is in the past, and it is not already locked or released, lock it!
      const focDateTime = new Date(c.focDate + 'T23:59:59');
      if (now > focDateTime && c.status !== 'FOC Locked' && c.status !== 'Released' && c.status !== 'Archived') {
        c.status = 'FOC Locked';
        c.publisherOpen = false;
        c.retailerOpen = false;
        c.history = [
          ...(c.history || []),
          {
            date: now.toISOString(),
            user: 'System Lock Engine',
            action: 'FOC Cycle Locked Automatically',
            notes: 'Current date and time passed FOC cut-off.'
          }
        ];
        updated = true;
        automaticallyLockedCycleIds.push(c.cycleId);
      }
      return c;
    });
    
    if (updated) {
      localStorage.setItem('philbo_catalog_cycles', JSON.stringify(updatedCycles));
      automaticallyLockedCycleIds.forEach(cycleId => finalizePurchaseOrdersForCycle(cycleId, { uid: 'system', email: 'System FOC Lock Engine', role: 'system' }));
    }
    return updatedCycles;
  },

  updateCatalogCycle: (cycleId, cycleData, userName, notes = '') => {
    const cycles = JSON.parse(localStorage.getItem('philbo_catalog_cycles')) || [];
    const index = cycles.findIndex(c => c.cycleId === cycleId);
    if (index > -1) {
      const prev = cycles[index];
      const updated = {
        ...prev,
        ...cycleData,
        history: [
          ...(prev.history || []),
          {
            date: new Date().toISOString(),
            user: userName,
            action: `Admin modified cycle specifications`,
            notes: notes || `Status updated to: ${cycleData.status || prev.status}`
          }
        ]
      };
      cycles[index] = updated;
      localStorage.setItem('philbo_catalog_cycles', JSON.stringify(cycles));
      if (!isClosedFocCycle(prev) && isClosedFocCycle(updated)) finalizePurchaseOrdersForCycle(cycleId, db.getCurrentUser());
      if (isClosedFocCycle(prev) && !isClosedFocCycle(updated)) voidPurchaseOrdersForCycle(cycleId, db.getCurrentUser());
      return updated;
    }
  },

  publishCatalogCycle: (cycleId, requestingUser = db.getCurrentUser()) => {
    const actor = requireActor(PERMISSIONS.CYCLES_MANAGE, requestingUser);
    const cycles = readCollection('philbo_catalog_cycles');
    const titles = readCollection('philbo_titles');
    const cycleIndex = cycles.findIndex(cycle => cycle.cycleId === cycleId);
    if (cycleIndex < 0) throw new Error('Catalog Cycle not found.');

    const cycle = cycles[cycleIndex];
    const approvedTitles = titles.filter(title => title.cycleId === cycleId && isTitlePublished(title.status));
    if (!approvedTitles.length) {
      throw new Error('This catalog has no Approved, Scheduled, or Live books. Approve at least one book before publishing it to retailers.');
    }

    const publishedAt = new Date().toISOString();
    const nextVersion = Number(cycle.catalogPublicationVersion || 0) + 1;
    const updated = {
      ...cycle,
      status: 'Open for Retailer Ordering',
      publisherOpen: false,
      retailerOpen: true,
      retailerDownloadEnabled: true,
      catalogPublicationSuppressed: false,
      catalogPublishedAt: publishedAt,
      catalogPublishedBy: actor.uid || actor.email,
      catalogPublicationVersion: nextVersion,
      catalogPublishedTitleIds: approvedTitles.map(title => title.titleId),
      history: [
        ...(cycle.history || []),
        {
          date: publishedAt,
          user: actor.email || actor.companyName || 'Philbo Admin',
          action: nextVersion === 1 ? 'Retailer catalog published' : 'Retailer catalog republished',
          notes: `${approvedTitles.length} approved title${approvedTitles.length === 1 ? '' : 's'} included in catalog version ${nextVersion}. Retailer CSV and order-form downloads enabled.`
        }
      ]
    };
    cycles[cycleIndex] = updated;
    writeCollection('philbo_catalog_cycles', cycles);

    const filename = `Philbo_Catalog_${(updated.releaseDate || updated.catalogDate || '').slice(0, 7) || updated.cycleId}_FOC_${updated.focDate || 'unscheduled'}.csv`;
    const exportHistory = readCollection('philbo_catalog_export_history');
    exportHistory.unshift({
      cycleId,
      filename,
      generatedAt: publishedAt,
      generatedBy: actor.uid,
      tier: 'Retailer-specific at download',
      titleCount: approvedTitles.length,
      catalogPublicationVersion: nextVersion,
      catalogPublication: true
    });
    writeCollection('philbo_catalog_export_history', exportHistory);
    appendAudit({
      action: nextVersion === 1 ? 'Retailer catalog published' : 'Retailer catalog republished',
      recordType: 'catalog_cycle',
      recordId: cycleId,
      previousValue: { retailerOpen: cycle.retailerOpen, catalogPublicationVersion: cycle.catalogPublicationVersion || 0 },
      newValue: { retailerOpen: true, catalogPublicationVersion: nextVersion, titleCount: approvedTitles.length },
      notes: `Published ${approvedTitles.length} approved titles to retailer catalog and CSV downloads.`,
      actor
    });
    return { cycle: updated, titleCount: approvedTitles.length, filename, version: nextVersion };
  },

  // Match existing titles to seeded cycles
  matchExistingTitlesToCycles: () => {
    const titles = JSON.parse(localStorage.getItem('philbo_titles')) || [];
    const cycles = JSON.parse(localStorage.getItem('philbo_catalog_cycles')) || [];
    
    let matchedCount = 0;
    let unmatched = [];
    
    titles.forEach(t => {
      // Find matching cycle where FOC and release dates match exactly
      const matched = cycles.find(c => c.focDate === t.focDate);
      if (matched) {
        if (!t.cycleId) {
          t.cycleId = matched.cycleId;
          matchedCount += 1;
        }
      } else {
        if (!t.cycleId) {
          unmatched.push(t);
        }
      }
    });
    
    if (matchedCount > 0) {
      localStorage.setItem('philbo_titles', JSON.stringify(titles));
    }
    return { matchedCount, unmatched };
  },

  assignTitleCycleManually: (titleId, cycleId, userName) => {
    const titles = JSON.parse(localStorage.getItem('philbo_titles')) || [];
    const cycles = JSON.parse(localStorage.getItem('philbo_catalog_cycles')) || [];
    
    const titleIdx = titles.findIndex(t => t.titleId === titleId);
    const cycle = cycles.find(c => c.cycleId === cycleId);
    
    if (titleIdx > -1 && cycle) {
      titles[titleIdx].cycleId = cycleId;
      titles[titleIdx].focDate = cycle.focDate;
      titles[titleIdx].releaseDate = cycle.releaseDate;
      titles[titleIdx].catalogDate = cycle.catalogDate;
      titles[titleIdx].history = [
        ...(titles[titleIdx].history || []),
        {
          date: new Date().toISOString(),
          user: userName,
          action: 'Manually assigned catalog cycle',
          notes: `Cycle ID: ${cycleId}`
        }
      ];
      localStorage.setItem('philbo_titles', JSON.stringify(titles));
      return true;
    }
    return false;
  },

  // PHILBO ID auto-generation
  generatePhilboId: (seriesCode, barcode) => {
    if (!seriesCode || !barcode) return '';
    const cleanCode = seriesCode.replace(/\s+/g, '').toUpperCase();
    const cleanBarcode = barcode.replace(/\s+/g, '');
    const lastFive = cleanBarcode.slice(-5);
    return `${cleanCode}-${lastFive}`;
  },
  // Authentication Mock
  getCurrentUser: () => {
    const userStr = sessionStorage.getItem('philbo_current_user');
    if (!userStr) return null;
    const sessionUser = JSON.parse(userStr);
    const stored = readCollection('philbo_users').find(user => user.uid === sessionUser.uid);
    if (!stored || !isAccountActive(stored) || Number(sessionUser.sessionVersion || 1) !== Number(stored.sessionVersion || 1)) {
      sessionStorage.removeItem('philbo_current_user');
      return null;
    }
    const storedRole = normalizeRole(stored.role);
    const requestedRole = normalizeRole(sessionUser.role);
    const allowedRoles = (stored.roles || [storedRole]).map(normalizeRole);
    const activeRole = storedRole === ROLE_IDS.MOOS ? ROLE_IDS.MOOS : (allowedRoles.includes(requestedRole) ? requestedRole : storedRole);
    return { ...safeUser(stored), role: activeRole, sessionId: sessionUser.sessionId };
  },

  importCsvTitles: (csvRows, adminEmail) => {
    const titles = JSON.parse(localStorage.getItem('philbo_titles')) || [];
    const users = JSON.parse(localStorage.getItem('philbo_users')) || [];
    const cycles = JSON.parse(localStorage.getItem('philbo_catalog_cycles')) || [];
    
    let importedCount = 0;
    let updatedCount = 0;
    let createdPublishers = [];
    let errorsList = [];
    
    csvRows.forEach((row, index) => {
      try {
        const getVal = (colName) => {
          const keys = Object.keys(row);
          const matchedKey = keys.find(k => k.trim().toLowerCase() === colName.trim().toLowerCase());
          return matchedKey ? row[matchedKey] : '';
        };

        const rawPublisher = getVal('Publisher');
        if (!rawPublisher) {
          errorsList.push(`Row ${index + 1}: Missing publisher name.`);
          return;
        }

        const trimmedPublisher = rawPublisher.trim();
        let publisher = users.find(u => u.role === 'publisher' && u.companyName.toLowerCase() === trimmedPublisher.toLowerCase());
        
        if (!publisher) {
          const tempEmail = `contact@${trimmedPublisher.toLowerCase().replace(/[^a-z0-9]/g, '') || 'publisher'}.com`;
          publisher = users.find(u => u.email.toLowerCase() === tempEmail.toLowerCase());
          
          if (!publisher) {
            const tempPassword = `Invite-${Math.random().toString(36).slice(-8)}`;
            publisher = {
              uid: 'user_pub_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
              email: tempEmail,
              role: 'publisher',
              companyName: trimmedPublisher,
              commissionRate: 0.10,
              approved: true,
              isInvitationPending: true,
              temporaryPassword: tempPassword,
              passwordHash: tempPassword,
              commissionHistory: [],
              totalCycleSpend: 0,
              returnsUsed: 0,
              returnCreditBalance: 0
            };
            users.push(publisher);
            createdPublishers.push({
              companyName: trimmedPublisher,
              email: tempEmail,
              tempPassword
            });
          }
        }

        const barcode = (getVal('Barcode / UPC / EAN') || '').trim();
        const titleText = (getVal('Title') || '').trim();
        const seriesCode = (getVal('Series Code') || '').trim() || 'GEN';
        const msrpVal = parseFloat((getVal('Price') || '0').replace(/[^0-9.]/g, '')) || 0;

        if (!titleText) {
          errorsList.push(`Row ${index + 1}: Missing title name.`);
          return;
        }

        const generatedId = db.generatePhilboId(seriesCode, barcode);
        const philboId = (getVal('Philbo ID') || '').trim() || generatedId;

        const rawFoc = getVal('FOC');
        let matchedCycle = cycles.find(c => c.focDate === rawFoc);
        if (!matchedCycle) {
          matchedCycle = cycles.find(c => c.publisherOpen) || cycles[0];
        }

        let existingIdx = titles.findIndex(t => t.barcode === barcode || (t.philboId === philboId && t.philboId));
        const coverImageSource = [
          'Downloadable Cover Image URL',
          'Downloadable Cover Image',
          'Cover Image URL',
          'Cover Image',
          'Cover URL'
        ].map(getVal).find(value => String(value || '').trim());
        const importedCoverUrl = normalizeCoverImageUrl(coverImageSource);
        const existingCoverUrl = existingIdx > -1 ? normalizeCoverImageUrl(titles[existingIdx].coverUrl) : '';
        
        const titleData = {
          philboId,
          publisherId: publisher.uid,
          publisherName: publisher.companyName,
          title: titleText,
          barcode,
          msrp: msrpVal,
          catalogDate: matchedCycle ? matchedCycle.catalogDate : (getVal('Catalog Date') || '2026-07-01'),
          focDate: matchedCycle ? matchedCycle.focDate : (rawFoc || '2026-07-20'),
          releaseDate: matchedCycle ? matchedCycle.releaseDate : (getVal('In Store') || '2026-08-15'),
          cycleId: matchedCycle ? matchedCycle.cycleId : 'cycle_13',
          seriesName: (getVal('Series Name') || '').trim() || titleText,
          issueNumber: (getVal('Issue Number') || '1').trim(),
          language: (getVal('Language') || 'English').trim(),
          coverDescription: (getVal('Cover Description') || '').trim(),
          variantNumber: (getVal('Variant Number') || 'A').trim(),
          bookFormat: (getVal('Book Format') || 'Single Issue').trim(),
          seriesType: (getVal('Type of Series') || 'Ongoing').trim(),
          seriesCode,
          seriesFrequency: (getVal('Series Frequency') || 'Monthly').trim(),
          ageRange: (getVal('Media Rating / Age Range') || 'Teen').trim(),
          pageCount: parseInt(getVal('Page Count')) || 32,
          bisac1: (getVal('BISAC CODE #1') || 'CGN004030').trim(),
          bisac2: (getVal('BISAC CODE 2') || '').trim(),
          bisac3: (getVal('BISAC CODE 3') || '').trim(),
          description: (getVal('Description of Issue /book') || '').trim(),
          synopsis: (getVal('Brief Synopsis of Book') || '').trim() || titleText,
          reprint: (getVal('Reprint') || 'No').trim(),
          printingNumber: parseInt(getVal('Printing')) || 1,
          writer: (getVal('Writer') || '').trim(),
          artist: (getVal('Artist') || '').trim(),
          coverArtist: (getVal('Cover Artist') || '').trim(),
          colorProfile: (getVal(' Color / B&W') || 'Color').trim(),
          width: parseFloat(getVal('Width')) || 6.625,
          height: parseFloat(getVal('Height')) || 10.25,
          weight: parseFloat(getVal('Weight (in POUNDS)')) || 0.175,
          availableForReorder: (getVal('Reorder') || 'Yes').trim(),
          coverUrl: importedCoverUrl || existingCoverUrl || 'https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?q=80&w=400&auto=format&fit=crop',
          status: 'Draft',
          focLocked: matchedCycle ? (matchedCycle.status === 'FOC Locked') : false,
          history: [
            {
              date: new Date().toISOString(),
              user: adminEmail,
              action: 'CSV Imported successfully',
              notes: `Seeded via bulk file import.`
            }
          ]
        };

        if (existingIdx > -1) {
          titles[existingIdx] = {
            ...titles[existingIdx],
            ...titleData,
            titleId: titles[existingIdx].titleId,
            status: titles[existingIdx].status
          };
          updatedCount += 1;
        } else {
          titleData.titleId = 'title_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
          titles.push(titleData);
          importedCount += 1;
        }
      } catch (err) {
        errorsList.push(`Row ${index + 1}: ${err.message}`);
      }
    });

    localStorage.setItem('philbo_users', JSON.stringify(users));
    localStorage.setItem('philbo_titles', JSON.stringify(titles));

    return {
      importedCount,
      updatedCount,
      createdPublishers,
      errorsList
    };
  },

  setPassword: (uid, password) => {
    const actor = db.getCurrentUser();
    if (!actor || (actor.uid !== uid && !hasPermission(actor, PERMISSIONS.STAFF_MANAGE))) throw new Error('Password changes are limited to the signed-in account or MO.OS.');
    if (String(password || '').length < 12) throw new Error('Passwords must contain at least 12 characters.');
    const users = JSON.parse(localStorage.getItem('philbo_users')) || [];
    const idx = users.findIndex(u => u.uid === uid);
    if (idx > -1) {
      if (users[idx].isInvitationPending && isExternalInvitationUser(users[idx])) {
        const missingFields = missingInvitationProfileFields(users[idx]);
        if (missingFields.length) throw new Error(`Complete the required account information before creating a password: ${missingFields.join(', ')}.`);
      }
      users[idx].passwordHash = password;
      users[idx].isInvitationPending = false;
      users[idx].passwordResetRequired = false;
      if (users[idx].temporaryPassword) {
        delete users[idx].temporaryPassword;
      }
      localStorage.setItem('philbo_users', JSON.stringify(users));
      
      const curr = sessionStorage.getItem('philbo_current_user');
      if (curr && JSON.parse(curr).uid === uid) {
        sessionStorage.setItem('philbo_current_user', JSON.stringify(users[idx]));
      }
      return true;
    }
    return false;
  },

  completeInvitationProfile: (uid, profile = {}) => {
    const actor = db.getCurrentUser();
    if (!actor || actor.uid !== uid) throw new Error('You may only complete your own invitation profile.');
    if (!isExternalInvitationUser(actor)) throw new Error('This account does not require a customer invitation profile.');
    const normalized = normalizeInvitationProfile(profile);
    const missingFields = missingInvitationProfileFields(normalized);
    if (missingFields.length) throw new Error(`Complete all required information: ${missingFields.join(', ')}.`);
    const users = readCollection('philbo_users');
    const index = users.findIndex(user => user.uid === uid);
    if (index < 0) throw new Error('Invited account not found.');
    users[index] = {
      ...users[index],
      ...normalized,
      contactName: `${normalized.firstName} ${normalized.lastName}`.trim(),
      phone: normalized.primaryPhone,
      mailingAddress: formatInvitationMailingAddress(normalized),
      invitationProfileCompletedAt: new Date().toISOString()
    };
    writeCollection('philbo_users', users);
    sessionStorage.setItem('philbo_current_user', JSON.stringify({ ...actor, ...safeUser(users[index]) }));
    appendAudit({
      action: 'Invitation profile completed',
      recordType: 'user',
      recordId: uid,
      newValue: { requiredFieldsComplete: true },
      actor
    });
    authEvent();
    return safeUser(users[index]);
  },


  login: (email, password, audience = 'any') => {
    const users = JSON.parse(localStorage.getItem('philbo_users')) || [];
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (user) {
      const userRole = normalizeRole(user.role);
      const isInternal = [ROLE_IDS.MOOS, ROLE_IDS.ADMIN, ROLE_IDS.PREFLIGHT].includes(userRole);
      if ((audience === 'staff' && !isInternal) || (audience === 'customer' && isInternal)) throw new Error('Invalid email or password.');
      if (!user.approved) {
        throw new Error('Your application is pending administrator approval.');
      }
      if (user.accountStatus === 'suspended') throw new Error('This account is currently on hold. Contact Philbo Distribution for assistance.');
      if (user.accountStatus === 'locked') throw new Error('This account is locked. Contact the MO.OS owner.');
      if (user.accountStatus === 'revoked') throw new Error('This account has been archived and can no longer sign in. Contact Philbo Distribution for assistance.');
      if (user.isInvitationPending && !user.passwordHash) throw new Error('Your secure account invitation has not been delivered yet. Ask MO.OS to resend the invitation.');
      if (isInternal && !user.passwordHash) throw new Error('Secure staff password setup is required before this account can sign in.');
      
      if (user.passwordHash && password !== user.passwordHash) {
        throw new Error('Invalid email or password.');
      }
      
      user.lastLoginAt = new Date().toISOString();
      user.lastActivityAt = user.lastLoginAt;
      user.role = normalizeRole(user.role);
      user.sessionVersion = user.sessionVersion || 1;
      const sessionUser = { ...safeUser(user), sessionId: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
      const userIndex = users.findIndex(item => item.uid === user.uid);
      users[userIndex] = user;
      writeCollection('philbo_users', users);
      sessionStorage.setItem('philbo_current_user', JSON.stringify(sessionUser));
      appendAudit({ action: 'Account login', recordType: 'user', recordId: user.uid, actor: sessionUser });
      return sessionUser;
    } else {
      throw new Error('Invalid email or password.');
    }
  },

  bootstrapLocalMoos: (email, password) => {
    const location = window.location || {};
    const localOnly = ['localhost', '127.0.0.1'].includes(location.hostname) || location.protocol === 'file:';
    if (!localOnly) throw new Error('First-time owner setup is available only from the local prototype.');
    if (String(password || '').length < 12) throw new Error('Please use at least 12 characters for your password.');
    const users = readCollection('philbo_users');
    const index = users.findIndex(user => user.uid === 'admin1' && normalizeRole(user.role) === ROLE_IDS.MOOS && user.email.toLowerCase() === String(email || '').trim().toLowerCase());
    if (index < 0) throw new Error('That email is not authorized for MO.OS ownership.');
    if (users[index].passwordHash) throw new Error('Your MO.OS password is already configured. Sign in above or use password recovery.');
    users[index].passwordHash = password;
    users[index].isInvitationPending = false;
    users[index].passwordResetRequired = false;
    users[index].sessionVersion = Number(users[index].sessionVersion || 1) + 1;
    users[index].ownerPasswordConfiguredAt = new Date().toISOString();
    writeCollection('philbo_users', users);
    appendAudit({ action: 'Local MO.OS owner password configured', recordType: 'user', recordId: users[index].uid, actor: safeUser(users[index]) });
    return db.login(users[index].email, password, 'staff');
  },

  loginLocalDemo: (demoType, password) => {
    if (!isProtectedDemoEnvironment()) throw new Error('Demo Access is available only in the local prototype or protected beta site.');
    const allowedDemoAccounts = {
      prepress: { uid: 'preflight1', password: 'Demo-Prepress-2026!' },
      admin: { uid: 'admin2', password: 'Mo-2026!' },
      publisher: { uid: 'pub1', password: 'Demo-pub26!' },
      pod: { uid: 'poddemo1', password: 'Demo-pod26!' },
      retailer: { uid: 'ret1', password: 'Demo-retail26!' }
    };
    const demoAccount = allowedDemoAccounts[demoType];
    if (!demoAccount) throw new Error('That demo role is not available.');
    if (password !== demoAccount.password) throw new Error('Incorrect demo password.');
    const users = readCollection('philbo_users');
    const index = users.findIndex(user => user.uid === demoAccount.uid);
    if (index < 0 || !isAccountActive(users[index]) || !users[index].approved) throw new Error('That demo account is unavailable.');
    users[index].lastLoginAt = new Date().toISOString();
    users[index].lastActivityAt = users[index].lastLoginAt;
    users[index].sessionVersion = users[index].sessionVersion || 1;
    writeCollection('philbo_users', users);
    const sessionUser = { ...safeUser(users[index]), role: normalizeRole(users[index].role), sessionId: `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
    sessionStorage.setItem('philbo_current_user', JSON.stringify(sessionUser));
    appendAudit({ action: 'Local demo login', recordType: 'user', recordId: users[index].uid, actor: sessionUser });
    return sessionUser;
  },

  logout: () => {
    sessionStorage.removeItem('philbo_current_user');
  },

  register: (email, companyName, role, registerData = {}) => {
    const requestedPodAccount = role === 'pod';
    role = normalizeRole(role);
    if (requestedPodAccount) registerData = { ...registerData, accountType: 'Philbo POD Customer', isPodClient: true };
    const users = JSON.parse(localStorage.getItem('philbo_users'));
    const existingAccount = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.approved);
    const existingRoles = existingAccount ? (existingAccount.roles || [existingAccount.role]) : [];
    if (existingRoles.includes(role) || users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.role === role && !u.approved)) {
      throw new Error(`An application or account for this email already exists for the ${role} role.`);
    }

    const newUser = {
      uid: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      email,
      role,
      roles: [role],
      companyName,
      approved: false, // Must be approved by admin
      createdAt: new Date().toISOString(),
      totalCycleSpend: 0,
      returnsUsed: 0,
      returnCreditBalance: 0,
      ...registerData
    };
    if (existingAccount) newUser.linkedAccountUid = existingAccount.uid;

    if (role === 'retailer') {
      newUser.tier = 'Tier I';
    } else if (role === 'publisher') {
      newUser.commissionRate = 0.10; // Default to 10%
    }
    if (registerData.accountType === 'Philbo POD Customer' || registerData.isPodClient) {
      newUser.accountType = 'Philbo POD Customer';
      newUser.podProjectAccess = false;
      newUser.isPodClient = true;
    }

    users.push(newUser);
    localStorage.setItem('philbo_users', JSON.stringify(users));
    return newUser;
  },

  // Users Management
  getUsers: (requestingUser = db.getCurrentUser()) => {
    const users = readCollection('philbo_users');
    if (!requestingUser) return [];
    const role = normalizeRole(requestingUser.role);
    if (role === ROLE_IDS.MOOS) return users.map(safeUser);
    if (role === ROLE_IDS.ADMIN) return users.filter(user => ![ROLE_IDS.MOOS, ROLE_IDS.ADMIN, ROLE_IDS.PREFLIGHT].includes(normalizeRole(user.role)) || user.uid === requestingUser.uid).map(safeUser);
    if (role === ROLE_IDS.PREFLIGHT) {
      const contactIds = new Set(ensureProductionOrders().flatMap(order => [order.publisherId, order.customerId]).filter(Boolean));
      return users.filter(user => contactIds.has(user.uid)).map(user => ({
      uid: user.uid, role: normalizeRole(user.role), companyName: user.companyName, primaryContact: user.primaryContact || user.contactName,
        email: user.publisherEmail || user.email, phone: user.mobilePhone || user.officePhone || user.primaryPhone || user.phone || '',
        preferredContactMethod: user.preferredContactMethod
    }));
    }
    return users.filter(user => user.uid === requestingUser.uid).map(safeUser);
  },
  
  approveUser: (uid, settings = {}) => {
    const users = JSON.parse(localStorage.getItem('philbo_users'));
    const userIndex = users.findIndex(u => u.uid === uid);
    if (userIndex > -1) {
      const application = users[userIndex];
      if (application.linkedAccountUid) {
        const primaryIndex = users.findIndex(u => u.uid === application.linkedAccountUid);
        if (primaryIndex > -1) {
          const primary = users[primaryIndex];
          primary.roles = Array.from(new Set([...(primary.roles || [primary.role]), application.role]));
          primary.roleProfiles = { ...(primary.roleProfiles || {}), [application.role]: { ...application, approved: true, linkedAccountUid: undefined } };
          if (settings.tier) primary.tier = settings.tier;
          if (settings.commissionRate) primary.commissionRate = parseFloat(settings.commissionRate);
          if (application.isPodClient) { primary.podProjectAccess = true; primary.isPodClient = true; }
          users.splice(userIndex, 1);
          localStorage.setItem('philbo_users', JSON.stringify(users));
          return { user: safeUser(primary), invitation: null, linkedToExistingAccount: true };
        }
      }
      const needsInvitation = !users[userIndex].passwordHash;
      const temporaryPassword = needsInvitation
        ? `Philbo-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
        : users[userIndex].temporaryPassword;
      users[userIndex].approved = true;
      users[userIndex].approvedAt = new Date().toISOString();
      users[userIndex].isInvitationPending = needsInvitation || Boolean(users[userIndex].isInvitationPending);
      if (needsInvitation) {
        users[userIndex].temporaryPassword = temporaryPassword;
        users[userIndex].passwordHash = temporaryPassword;
        users[userIndex].passwordResetRequired = true;
        users[userIndex].invitationStatus = 'Ready to Send';
        users[userIndex].invitationCreatedAt = new Date().toISOString();
      }
      if (settings.tier) users[userIndex].tier = settings.tier;
      if (settings.commissionRate) users[userIndex].commissionRate = parseFloat(settings.commissionRate);
      if (users[userIndex].isPodClient) users[userIndex].podProjectAccess = true;
      localStorage.setItem('philbo_users', JSON.stringify(users));
      
      // Update session if it is the current user
      const curr = sessionStorage.getItem('philbo_current_user');
      if (curr && JSON.parse(curr).uid === uid) {
        sessionStorage.setItem('philbo_current_user', JSON.stringify(users[userIndex]));
      }
      return {
        user: safeUser(users[userIndex]),
        invitation: needsInvitation ? {
          email: users[userIndex].email,
          companyName: users[userIndex].companyName,
          role: users[userIndex].role,
          isPodClient: Boolean(users[userIndex].isPodClient),
          accountType: users[userIndex].accountType,
          temporaryPassword,
          createdAt: users[userIndex].invitationCreatedAt
        } : null,
        linkedToExistingAccount: false
      };
    }
    throw new Error('Account application not found.');
  },

  createExternalAccountInvitation: (uid) => {
    const users = readCollection('philbo_users');
    const userIndex = users.findIndex(user => user.uid === uid);
    if (userIndex < 0) throw new Error('Approved account not found.');
    const account = users[userIndex];
    if (!account.approved || !['retailer', 'publisher'].includes(normalizeRole(account.role))) throw new Error('Only approved retailer or publisher accounts can receive this invitation.');
    const temporaryPassword = `Philbo-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    account.temporaryPassword = temporaryPassword;
    account.passwordHash = temporaryPassword;
    account.passwordResetRequired = true;
    account.isInvitationPending = true;
    account.invitationStatus = 'Ready to Send';
    account.invitationCreatedAt = new Date().toISOString();
    writeCollection('philbo_users', users);
    return {
      user: safeUser(account),
      invitation: {
        email: account.email,
        companyName: account.companyName,
        role: normalizeRole(account.role),
        isPodClient: Boolean(account.isPodClient),
        accountType: account.accountType,
        temporaryPassword,
        createdAt: account.invitationCreatedAt
      }
    };
  },

  // Titles Management
  getTitles: () => {
    const titles = JSON.parse(localStorage.getItem('philbo_titles')) || [];
    const cycles = JSON.parse(localStorage.getItem('philbo_catalog_cycles')) || [];
    return titles.map(t => {
      const cycle = cycles.find(c => c.cycleId === t.cycleId);
      if (cycle) {
        return {
          ...t,
          focLocked: cycle.status === 'FOC Locked' || cycle.status === 'Released' || cycle.status === 'Archived' || t.focLocked
        };
      }
      return t;
    });
  },
  
  submitTitle: (titleData, publisherId, publisherName) => {
    const titles = JSON.parse(localStorage.getItem('philbo_titles'));
    const submittedPageCount = Number(titleData.pageCount);
    if (!Number.isInteger(submittedPageCount) || submittedPageCount <= 0 || submittedPageCount % 4 !== 0) {
      throw new Error('Page count must be a positive whole number divisible by 4 for saddle-stitch binding.');
    }
    const submittedCoverArtName = String(titleData.coverArtFileName || '').trim();
    if (submittedCoverArtName && !/\.(jpe?g|png)$/i.test(submittedCoverArtName)) {
      throw new Error('High-resolution cover art must be a JPG or PNG image. PDF files are not accepted.');
    }
    
    // Auto-generate PHILBO ID
    const generatedId = db.generatePhilboId(titleData.seriesCode, titleData.barcode);
    
    // Duplication Check
    if (titles.some(t => t.philboId === generatedId)) {
      throw new Error(`Duplicate PHILBO ID detected: "${generatedId}". Submission halted.`);
    }

    // Get dates from cycleId
    const cycles = JSON.parse(localStorage.getItem('philbo_catalog_cycles')) || [];
    const matchedCycle = cycles.find(c => c.cycleId === titleData.cycleId);
    if (!matchedCycle) {
      throw new Error("A valid Catalog Cycle selection is required for book submissions.");
    }
    
    // Check if FOC locked
    if (matchedCycle.status === 'FOC Locked' && publisherId !== 'admin1') {
      throw new Error("Submission blocked: selected Catalog Cycle is locked.");
    }

    const newTitle = {
      titleId: 'title_' + Date.now(),
      philboId: generatedId,
      cycleId: titleData.cycleId,
      publisherId,
      publisherName,
      title: titleData.title,
      description: titleData.description,
      msrp: parseFloat(titleData.msrp),
      coverUrl: titleData.coverUrl || 'https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?q=80&w=400&auto=format&fit=crop',
      focDate: matchedCycle.focDate,
      focLocked: matchedCycle.status === 'FOC Locked',
      releaseDate: matchedCycle.releaseDate,
      catalogDate: matchedCycle.catalogDate,
      status: titleData.status || 'Draft',
      submittedAt: titleData.status === 'Submitted for Review' ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reviewNotes: '',
      history: [
        {
          date: new Date().toISOString(),
          user: publisherName,
          action: `Publisher created book record in ${titleData.status || 'Draft'} state.`,
          notes: `PHILBO ID generated as: ${generatedId}`
        }
      ],
      interiorPdfName: titleData.interiorPdfName,
      filePreflight: titleData.filePreflight || null,
      coverArtFileName: titleData.coverArtFileName || titleData.coverArtPdfName || '',
      podOption: titleData.podOption || false,
      fulfillmentMethod: titleData.fulfillmentMethod || 'Philbo POD',

      // Extended fields
      barcode: titleData.barcode || '',
      seriesName: titleData.seriesName || '',
      issueNumber: titleData.issueNumber || '',
      language: titleData.language || 'English',
      coverDescription: titleData.coverDescription || '',
      variantNumber: titleData.variantNumber || 'A',
      bookFormat: titleData.bookFormat || 'Single Issue',
      seriesType: titleData.seriesType || 'Ongoing',
      seriesCode: titleData.seriesCode || '',
      seriesFrequency: titleData.seriesFrequency || 'Monthly',
      ageRange: titleData.ageRange || 'Teen',
      pageCount: submittedPageCount,
      bisac1: titleData.bisac1 || '',
      bisac2: titleData.bisac2 || '',
      bisac3: titleData.bisac3 || '',
      synopsis: titleData.synopsis || '',
      reprint: titleData.reprint || 'No',
      printingNumber: parseInt(titleData.printingNumber) || 1,
      writer: titleData.writer || '',
      artist: titleData.artist || '',
      coverArtist: titleData.coverArtist || '',
      colorProfile: titleData.colorProfile || 'Color',
      width: parseFloat(titleData.width) || 6.625,
      height: parseFloat(titleData.height) || 10.25,
      weight: parseFloat(titleData.weight) || 2.8,
      availableForReorder: titleData.availableForReorder || 'Yes',
      genre: titleData.genre || '',
      additionalImage1: titleData.additionalImage1 || '',
      additionalImage2: titleData.additionalImage2 || '',
      publisherLogoUrl: titleData.publisherLogoUrl || '',
      incentiveRatio: titleData.incentiveRatio || '',
      incentiveRules: titleData.incentiveRules || ''
    };
    titles.push(newTitle);
    localStorage.setItem('philbo_titles', JSON.stringify(titles));
    return newTitle;
  },

  approveTitle: (titleId) => {
    const titles = JSON.parse(localStorage.getItem('philbo_titles'));
    const titleIndex = titles.findIndex(t => t.titleId === titleId);
    if (titleIndex > -1) {
      if (titles[titleIndex].historicalOnly) {
        throw new Error('Historical titles must be reviewed and converted to an active solicitation before publication.');
      }
      const approvedAt = new Date().toISOString();
      const actor = db.getCurrentUser();
      titles[titleIndex] = {
        ...titles[titleIndex],
        status: 'Approved',
        approvedAt,
        approvedBy: actor?.uid || actor?.email || '',
        publishedAt: approvedAt,
        publishedBy: actor?.uid || actor?.email || '',
        updatedAt: approvedAt
      };
      localStorage.setItem('philbo_titles', JSON.stringify(titles));
      return {
        ...titles[titleIndex],
        catalogSynchronization: synchronizeCatalogPublicationForTitle(titles[titleIndex], actor)
      };
    }
  },

  toggleFocLock: (titleId) => {
    const titles = JSON.parse(localStorage.getItem('philbo_titles'));
    const titleIndex = titles.findIndex(t => t.titleId === titleId);
    if (titleIndex > -1) {
      titles[titleIndex].focLocked = !titles[titleIndex].focLocked;
      localStorage.setItem('philbo_titles', JSON.stringify(titles));
    }
  },

  // Retailer Pricing calculation based on Tier
  getRetailerDiscount: (tier) => {
    if (tier === 'Tier III') return 0.50; // 50%
    if (tier === 'Tier II') return 0.45; // 45%
    return 0.40; // Tier I - 40%
  },

  getReturnAllowance: (tier) => {
    if (tier === 'Tier III') return 8;
    if (tier === 'Tier II') return 4;
    return 2; // Tier I
  },

  // Orders Management
  getOrders: () => JSON.parse(localStorage.getItem('philbo_orders')),

  validateRetailerCoupon: (rawCode, orderSubtotal = 0) => {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) return { valid: false, message: 'Enter a coupon code first.', discountAmount: 0 };
    const coupons = JSON.parse(localStorage.getItem('philbo_retailer_coupons') || '[]');
    const coupon = coupons.find(item => String(item.code || '').trim().toUpperCase() === code);
    if (!coupon || coupon.active === false) return { valid: false, message: 'That coupon code is not recognized.', discountAmount: 0 };
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return { valid: false, message: 'That coupon code has expired.', discountAmount: 0 };

    const subtotal = Math.max(0, Number(orderSubtotal) || 0);
    const minimumSubtotal = Math.max(0, Number(coupon.minimumSubtotal) || 0);
    if (subtotal < minimumSubtotal) {
      return { valid: false, message: `This coupon requires a $${minimumSubtotal.toFixed(2)} minimum order.`, discountAmount: 0 };
    }

    const rawValue = Math.max(0, Number(coupon.value) || 0);
    const isPercent = coupon.type === 'percent';
    const percentage = isPercent ? Math.min(1, rawValue > 1 ? rawValue / 100 : rawValue) : 0;
    const discountAmount = Math.min(subtotal, isPercent ? subtotal * percentage : rawValue);
    return {
      valid: discountAmount > 0,
      code,
      type: isPercent ? 'percent' : 'fixed',
      value: rawValue,
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      label: isPercent ? `${(percentage * 100).toFixed(0)}% off` : `$${discountAmount.toFixed(2)} off`,
      message: discountAmount > 0 ? '' : 'This coupon does not have a discount configured.'
    };
  },

  placeOrder: (retailerId, retailerName, cartItems, currentTier, useCredit = false, couponCode = '', paymentStatus = 'paid') => {
    const orders = JSON.parse(localStorage.getItem('philbo_orders'));
    const discount = db.getRetailerDiscount(currentTier);
    
    let msrpTotal = 0;
    let netTotal = 0;
    
    const items = cartItems.map(item => {
      const wholesalePrice = parseFloat((item.msrp * (1 - discount)).toFixed(2));
      const lineMsrp = item.msrp * item.qty;
      const lineNet = wholesalePrice * item.qty;
      msrpTotal += lineMsrp;
      netTotal += lineNet;

      return {
        titleId: item.titleId,
        titleName: item.title,
        qty: item.qty,
        msrp: item.msrp,
        wholesalePrice,
        publisherId: item.publisherId
      };
    });

    const discountTotal = parseFloat((msrpTotal - netTotal).toFixed(2));
    netTotal = parseFloat(netTotal.toFixed(2));
    msrpTotal = parseFloat(msrpTotal.toFixed(2));
    const couponQuote = couponCode ? db.validateRetailerCoupon(couponCode, netTotal) : { valid: false, discountAmount: 0 };
    if (couponCode && !couponQuote.valid) throw new Error(couponQuote.message || 'Coupon code is no longer valid.');
    const couponDiscount = couponQuote.valid ? couponQuote.discountAmount : 0;
    netTotal = parseFloat(Math.max(0, netTotal - couponDiscount).toFixed(2));

    let creditApplied = 0;
    const users = JSON.parse(localStorage.getItem('philbo_users'));
    const userIndex = users.findIndex(u => u.uid === retailerId);
    
    if (userIndex > -1 && useCredit) {
      const balance = users[userIndex].returnCreditBalance || 0;
      creditApplied = Math.min(balance, netTotal);
      users[userIndex].returnCreditBalance = parseFloat((balance - creditApplied).toFixed(2));
      netTotal = parseFloat((netTotal - creditApplied).toFixed(2));
    }

    // Validate the authoritative product record and its Catalog Cycle window.
    const titlesList = JSON.parse(localStorage.getItem('philbo_titles')) || [];
    const cyclesList = JSON.parse(localStorage.getItem('philbo_catalog_cycles')) || [];
    items.forEach(item => {
      const titleObj = titlesList.find(t => t.titleId === item.titleId);
      if (!titleObj) throw new Error(`Order Failed: ${item.title} is no longer available.`);
      const cycle = cyclesList.find(candidate => candidate.cycleId === titleObj.cycleId);
      const availability = getTitleCatalogAvailability(titleObj, cycle);
      if (!availability.orderable) {
        throw new Error(`Order Failed: ${item.title} is not currently orderable (${availability.orderingStatus}).`);
      }
    });

    const newOrder = {
      orderId: 'SO-' + (orders.length + 1002),
      retailerId,
      retailerName,
      items,
      msrpTotal,
      discountTotal,
      couponCode: couponQuote.valid ? couponQuote.code : '',
      couponDiscount,
      netTotal,
      creditApplied,
      paymentStatus,
      status: 'pending',
      date: new Date().toISOString()
    };

    orders.push(newOrder);
    localStorage.setItem('philbo_orders', JSON.stringify(orders));

    // Update retailer total spending cycle and check for tier upgrade
    if (userIndex > -1) {
      const newSpend = parseFloat((users[userIndex].totalCycleSpend + netTotal).toFixed(2));
      users[userIndex].totalCycleSpend = newSpend;
      
      users[userIndex].tier = currentTier;

      localStorage.setItem('philbo_users', JSON.stringify(users));

      // Update current user session
      const curr = sessionStorage.getItem('philbo_current_user');
      if (curr) {
        const parsed = JSON.parse(curr);
        parsed.totalCycleSpend = newSpend;
        parsed.tier = currentTier;
        parsed.returnCreditBalance = users[userIndex].returnCreditBalance;
        sessionStorage.setItem('philbo_current_user', JSON.stringify(parsed));
      }
    }

    return newOrder;
  },

  // Returns Management
  getReturns: () => JSON.parse(localStorage.getItem('philbo_returns')),

  getReturnAllowanceSummary: (retailerId) => {
    const returns = JSON.parse(localStorage.getItem('philbo_returns'));
    const users = db.getUsers();
    const user = users.find(u => u.uid === retailerId);
    if (!user) throw new Error('Retailer account not found.');
    const maxReturns = db.getReturnAllowance(user.tier);
    const approved = Math.max(0, Number(user.returnsUsed) || 0);
    const pending = returns
      .filter(item => item.retailerId === retailerId && ['pending', 'requested'].includes(String(item.status || '').toLowerCase()))
      .reduce((total, item) => total + (Number(item.qty) || 0), 0);
    return { tier: user.tier || 'Tier I', maximum: maxReturns, approved, pending, remaining: Math.max(0, maxReturns - approved - pending) };
  },

  getEligibleReturnItems: (retailerId) => {
    const orders = JSON.parse(localStorage.getItem('philbo_orders') || '[]');
    const returns = JSON.parse(localStorage.getItem('philbo_returns') || '[]');
    const titles = JSON.parse(localStorage.getItem('philbo_titles') || '[]');
    return orders
      .filter(order => order.retailerId === retailerId && String(order.paymentStatus || '').toLowerCase() === 'paid' && String(order.status || '').toLowerCase() !== 'cancelled')
      .flatMap(order => (order.items || []).map(item => {
        const alreadyRequested = returns
          .filter(ret => ret.retailerId === retailerId && ret.orderId === order.orderId && ret.titleId === item.titleId && !['rejected', 'denied'].includes(String(ret.status || '').toLowerCase()))
          .reduce((total, ret) => total + (Number(ret.qty) || 0), 0);
        const purchasedQty = Math.max(0, Number(item.qty) || 0);
        const title = titles.find(candidate => candidate.titleId === item.titleId);
        const explicitlyNonReturnable = title?.returnable === false || /non[- ]?returnable/i.test(String(title?.returnableStatus || ''));
        return {
          key: `${order.orderId}::${item.titleId}`,
          orderId: order.orderId,
          orderDate: order.date,
          titleId: item.titleId,
          titleName: item.titleName || item.title || title?.title || 'Untitled',
          purchasedQty,
          alreadyRequested,
          availableQty: explicitlyNonReturnable ? 0 : Math.max(0, purchasedQty - alreadyRequested),
          unitCredit: Math.max(0, Number(item.wholesalePrice) || 0),
          returnable: !explicitlyNonReturnable
        };
      }))
      .filter(item => item.availableQty > 0)
      .sort((a, b) => new Date(b.orderDate || 0) - new Date(a.orderDate || 0));
  },

  requestReturn: (retailerId, retailerName, orderId, titleId, qty, reason) => {
    const returns = JSON.parse(localStorage.getItem('philbo_returns') || '[]');
    const quantity = Number(qty);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Return quantity must be a whole number of at least 1.');
    const cleanReason = String(reason || '').trim();
    if (!cleanReason) throw new Error('Please provide a reason for the return.');
    const eligibleItem = db.getEligibleReturnItems(retailerId).find(item => item.orderId === orderId && item.titleId === titleId);
    if (!eligibleItem) throw new Error('That book is not eligible for return. Select a paid purchase with remaining returnable copies.');
    if (quantity > eligibleItem.availableQty) throw new Error(`Only ${eligibleItem.availableQty} purchased cop${eligibleItem.availableQty === 1 ? 'y is' : 'ies are'} still eligible for return.`);
    const allowance = db.getReturnAllowanceSummary(retailerId);
    if (quantity > allowance.remaining) {
      throw new Error(`Return limit exceeded. ${allowance.tier} allows ${allowance.maximum} copies; ${allowance.approved} approved and ${allowance.pending} pending leave ${allowance.remaining} available.`);
    }
    const nextNumber = returns.reduce((maximum, item) => {
      const number = Number(String(item.returnId || '').replace(/\D/g, ''));
      return Number.isFinite(number) ? Math.max(maximum, number) : maximum;
    }, 5001) + 1;
    const requestedCredit = parseFloat((eligibleItem.unitCredit * quantity).toFixed(2));

    const newReturn = {
      returnId: `RET-${nextNumber}`,
      retailerId,
      retailerName,
      orderId,
      titleId,
      titleName: eligibleItem.titleName,
      qty: quantity,
      reason: cleanReason,
      unitCredit: eligibleItem.unitCredit,
      requestedCredit,
      status: 'pending',
      date: new Date().toISOString()
    };

    returns.push(newReturn);
    localStorage.setItem('philbo_returns', JSON.stringify(returns));
    return newReturn;
  },

  approveReturn: (returnId) => {
    const returns = JSON.parse(localStorage.getItem('philbo_returns') || '[]');
    const returnIndex = returns.findIndex(r => r.returnId === returnId);
    if (returnIndex < 0) throw new Error('Return request not found.');
    const currentStatus = String(returns[returnIndex].status || '').toLowerCase();
    if (!['pending', 'requested'].includes(currentStatus)) throw new Error(`This return was already ${currentStatus || 'reviewed'}.`);
    const users = JSON.parse(localStorage.getItem('philbo_users') || '[]');
    const rUid = returns[returnIndex].retailerId;
    const userIndex = users.findIndex(u => u.uid === rUid);
    if (userIndex < 0) throw new Error('Retailer account not found.');
    const quantity = Number(returns[returnIndex].qty) || 0;
    const fallbackItem = (JSON.parse(localStorage.getItem('philbo_orders') || '[]')
      .find(order => order.orderId === returns[returnIndex].orderId)?.items || [])
      .find(item => item.titleId === returns[returnIndex].titleId);
    const unitCredit = Math.max(0, Number(returns[returnIndex].unitCredit ?? fallbackItem?.wholesalePrice) || 0);
    const creditGained = parseFloat((Number(returns[returnIndex].requestedCredit) || unitCredit * quantity).toFixed(2));
    const reviewedAt = new Date().toISOString();
    const actor = db.getCurrentUser();
    returns[returnIndex] = {
      ...returns[returnIndex],
      status: 'approved',
      unitCredit,
      requestedCredit: creditGained,
      approvedCredit: creditGained,
      reviewedAt,
      reviewedBy: actor?.uid || actor?.email || '',
      creditedAt: reviewedAt
    };
    users[userIndex].returnsUsed = (Number(users[userIndex].returnsUsed) || 0) + quantity;
    users[userIndex].returnCreditBalance = parseFloat(((Number(users[userIndex].returnCreditBalance) || 0) + creditGained).toFixed(2));
    localStorage.setItem('philbo_users', JSON.stringify(users));
    localStorage.setItem('philbo_returns', JSON.stringify(returns));
    const curr = sessionStorage.getItem('philbo_current_user');
    if (curr && JSON.parse(curr).uid === rUid) {
      const parsed = JSON.parse(curr);
      parsed.returnsUsed = users[userIndex].returnsUsed;
      parsed.returnCreditBalance = users[userIndex].returnCreditBalance;
      sessionStorage.setItem('philbo_current_user', JSON.stringify(parsed));
    }
    return returns[returnIndex];
  },

  rejectReturn: (returnId) => {
    const returns = JSON.parse(localStorage.getItem('philbo_returns') || '[]');
    const returnIndex = returns.findIndex(r => r.returnId === returnId);
    if (returnIndex < 0) throw new Error('Return request not found.');
    const currentStatus = String(returns[returnIndex].status || '').toLowerCase();
    if (!['pending', 'requested'].includes(currentStatus)) throw new Error(`This return was already ${currentStatus || 'reviewed'}.`);
    const actor = db.getCurrentUser();
    returns[returnIndex] = {
      ...returns[returnIndex],
      status: 'rejected',
      reviewedAt: new Date().toISOString(),
      reviewedBy: actor?.uid || actor?.email || ''
    };
    localStorage.setItem('philbo_returns', JSON.stringify(returns));
    return returns[returnIndex];
  },

  getPurchaseOrders: (requestingUser = db.getCurrentUser(), filters = {}) => {
    if (!requestingUser) throw new Error('Authentication required.');
    const role = normalizeRole(requestingUser.role);
    let purchaseOrders = readCollection('philbo_purchase_orders');
    if (role === ROLE_IDS.PUBLISHER) purchaseOrders = purchaseOrders.filter(po => po.publisherId === requestingUser.uid && po.status === 'Official');
    else if (![ROLE_IDS.MOOS, ROLE_IDS.ADMIN].includes(role)) throw new Error('Purchase Order access denied.');
    if (filters.cycleId) purchaseOrders = purchaseOrders.filter(po => po.cycleId === filters.cycleId);
    if (filters.targetReleaseMonth) purchaseOrders = purchaseOrders.filter(po => po.targetReleaseMonth === filters.targetReleaseMonth);
    return purchaseOrders.sort((a, b) => new Date(b.finalizedAt || b.poDate) - new Date(a.finalizedAt || a.poDate));
  },

  // Compatibility name retained for existing portal components. This is now a
  // read-only query and never creates a PO while an FOC is open.
  generatePurchaseOrders: (targetReleaseMonth) => db.getPurchaseOrders(db.getCurrentUser(), targetReleaseMonth ? { targetReleaseMonth } : {}),

  finalizePurchaseOrders: (cycleId) => {
    const actor = requireActor(PERMISSIONS.PURCHASE_ORDERS);
    return finalizePurchaseOrdersForCycle(cycleId, actor);
  },

  getPublisherLiveSales: (requestingUser = db.getCurrentUser()) => {
    if (!requestingUser || normalizeRole(requestingUser.role) !== ROLE_IDS.PUBLISHER) throw new Error('Publisher access required.');
    const titles = readCollection('philbo_titles').filter(title => title.publisherId === requestingUser.uid);
    const cycles = readCollection('philbo_catalog_cycles');
    const orders = readCollection('philbo_orders').filter(order => order.paymentStatus === 'paid');
    return titles.map(title => {
      const cycle = cycles.find(item => item.cycleId === title.cycleId);
      let quantity = 0; let msrpValue = 0; let wholesaleValue = 0;
      orders.forEach(order => (order.items || []).forEach(item => {
        if (item.titleId !== title.titleId) return;
        quantity += Number(item.qty || 0); msrpValue += Number(item.qty || 0) * Number(item.msrp || title.msrp || 0);
        wholesaleValue += Number(item.qty || 0) * Number(item.wholesalePrice || 0);
      }));
      return { titleId: title.titleId, title: title.title, philboId: title.philboId, cycleId: title.cycleId,
        cycleName: cycle?.cycleName || 'Unassigned Cycle', focDate: cycle?.focDate || title.focDate,
        focStatus: isClosedFocCycle(cycle) ? 'FOC Closed' : 'Live — Subject to Change', quantity,
        msrpValue: Number(msrpValue.toFixed(2)), wholesaleValue: Number(wholesaleValue.toFixed(2)) };
    });
  },

  // Edit book metadata or status
  editTitle: (titleId, titleData, status, userName) => {
    const titles = JSON.parse(localStorage.getItem('philbo_titles'));
    const titleIndex = titles.findIndex(t => t.titleId === titleId);
    if (titleIndex > -1) {
      const prev = titles[titleIndex];
      
      // Find chosen cycle details
      const cycles = JSON.parse(localStorage.getItem('philbo_catalog_cycles')) || [];
      const matchedCycle = cycles.find(c => c.cycleId === titleData.cycleId);
      
      // Enforce FOC, ID, Series Code lock controls after Approval
      const isApprovedOrLive = isTitlePublished(prev.status);
      const isAdmin = hasPermission(db.getCurrentUser(), PERMISSIONS.TITLES_MANAGE);
      
      if (isApprovedOrLive && !isAdmin) {
        throw new Error('Approved catalog records cannot be changed silently. Ask Philbo Admin to review the requested update.');
      }

      if (matchedCycle && matchedCycle.status === 'FOC Locked' && !isAdmin) {
        throw new Error('Catalog Cycle FOC Date is locked. No further modifications permitted.');
      }

      // Re-generate Philbo ID if draft
      const generatedId = db.generatePhilboId(titleData.seriesCode, titleData.barcode);
      
      // Duplication Check
      if (titles.some(t => t.philboId === generatedId && t.titleId !== titleId)) {
        throw new Error(`Duplicate PHILBO ID detected: "${generatedId}".`);
      }

      const prevStatus = prev.status;
      const nextStatus = status || prevStatus;
      
      const auditMsg = prevStatus !== nextStatus 
        ? `Publisher edited title and updated status to: ${nextStatus}.`
        : `Publisher updated metadata.`;

      const updatedTitle = {
        ...prev,
        ...titleData,
        philboId: generatedId,
        // Override with auto-filled dates from cycle
        focDate: matchedCycle ? matchedCycle.focDate : prev.focDate,
        releaseDate: matchedCycle ? matchedCycle.releaseDate : prev.releaseDate,
        catalogDate: matchedCycle ? matchedCycle.catalogDate : prev.catalogDate,
        status: nextStatus,
        submittedAt: nextStatus === 'Submitted for Review' ? new Date().toISOString() : prev.submittedAt,
        updatedAt: new Date().toISOString(),
        history: [
          ...(prev.history || []),
          {
            date: new Date().toISOString(),
            user: userName,
            action: auditMsg,
            notes: `PHILBO ID: ${generatedId}`
          }
        ]
      };
      titles[titleIndex] = updatedTitle;
      localStorage.setItem('philbo_titles', JSON.stringify(titles));
      return updatedTitle;
    }
  },

  // Update book status (Admin approval control workflow)
  updateTitleStatus: (titleId, newStatus, userName, notes = '', overrides = {}) => {
    const titles = JSON.parse(localStorage.getItem('philbo_titles'));
    const titleIndex = titles.findIndex(t => t.titleId === titleId);
    if (titleIndex > -1) {
      const prev = titles[titleIndex];
      const prevStatus = prev.status;
      
      let focLocked = prev.focLocked;
      if (newStatus === 'Live' && new Date(prev.focDate) < new Date()) {
        focLocked = true;
      }

      const changedAt = new Date().toISOString();
      const approvalFields = newStatus === 'Approved' ? {
        approvedAt: changedAt,
        approvedBy: db.getCurrentUser()?.uid || userName,
        // Approval makes the record eligible for its single Catalog Cycle
        // publication snapshot; the catalog synchronizer controls visibility.
        publishedAt: changedAt,
        publishedBy: db.getCurrentUser()?.uid || userName
      } : {};
      const rejectionFields = newStatus === 'Rejected' ? {
        rejectedAt: changedAt,
        rejectedBy: db.getCurrentUser()?.uid || userName
      } : {};

      const updated = {
        ...prev,
        status: newStatus,
        focLocked,
        reviewNotes: ['Changes Requested', 'Rejected'].includes(newStatus) ? notes : (prev.reviewNotes || ''),
        updatedAt: changedAt,
        ...approvalFields,
        ...rejectionFields,
        ...overrides, // Admins can override FOC, Fulfillment, or ID
        history: [
          ...(prev.history || []),
          {
            date: new Date().toISOString(),
            user: userName,
            action: `Status changed from ${prevStatus} to ${newStatus}`,
            notes: notes || 'Admin update.'
          }
        ]
      };

      if (overrides.philboId && titles.some(t => t.philboId === overrides.philboId && t.titleId !== titleId)) {
        throw new Error(`Duplicate PHILBO ID detected: "${overrides.philboId}". Override blocked.`);
      }

      if (overrides.fulfillmentMethod === 'Inventory') {
        db.applyInventoryFulfillmentCommission(prev.publisherId, prev.publisherName);
      }

      titles[titleIndex] = updated;
      localStorage.setItem('philbo_titles', JSON.stringify(titles));
      const actor = db.getCurrentUser();
      const catalogSynchronization = synchronizeCatalogPublicationForTitle(titles[titleIndex], actor);
      return { ...titles[titleIndex], catalogSynchronization };
    }
  },

  // Update publisher commission rate and save history log
  updatePublisherCommission: (uid, newRate, adminName) => {
    const users = JSON.parse(localStorage.getItem('philbo_users'));
    const userIndex = users.findIndex(u => u.uid === uid);
    if (userIndex > -1) {
      const prev = users[userIndex];
      const prevRate = prev.commissionRate || 0.10;
      
      const historyItem = {
        date: new Date().toISOString(),
        prevRate,
        newRate: parseFloat(newRate),
        adminUser: adminName
      };

      users[userIndex] = {
        ...prev,
        commissionRate: parseFloat(newRate),
        commissionHistory: [...(prev.commissionHistory || []), historyItem]
      };
      localStorage.setItem('philbo_users', JSON.stringify(users));

      // Update session if needed
      const curr = sessionStorage.getItem('philbo_current_user');
      if (curr && JSON.parse(curr).uid === uid) {
        sessionStorage.setItem('philbo_current_user', JSON.stringify(users[userIndex]));
      }
      return users[userIndex];
    }
  },

  applyInventoryFulfillmentCommission: (uid, publisherName) => {
    const users = JSON.parse(localStorage.getItem('philbo_users')) || [];
    const userIndex = users.findIndex(user => user.uid === uid && user.role === 'publisher');
    if (userIndex < 0) throw new Error('Publisher account not found.');
    const publisher = users[userIndex];
    const previousRate = Number(publisher.commissionRate || 0);
    const effectiveRate = INVENTORY_COMMISSION_RATE;
    users[userIndex] = {
      ...publisher,
      commissionRate: effectiveRate,
      inventoryFulfillmentUsed: true,
      inventoryCommissionAppliedAt: new Date().toISOString(),
      commissionHistory: [
        ...(publisher.commissionHistory || []),
        {
          date: new Date().toISOString(),
          prevRate: previousRate,
          newRate: effectiveRate,
          adminUser: 'System fulfillment rule',
          triggeredBy: publisherName,
          reason: 'Publisher selected Inventory fulfillment and acknowledged the account-wide 15% distribution rate for receiving, storage, shortages, damages, late arrivals, and inventory handling.'
        }
      ]
    };
    localStorage.setItem('philbo_users', JSON.stringify(users));
    const currentSession = sessionStorage.getItem('philbo_current_user');
    if (currentSession && JSON.parse(currentSession).uid === uid) {
      sessionStorage.setItem('philbo_current_user', JSON.stringify(users[userIndex]));
    }
    return users[userIndex];
  },

  getCatalogOrderingStatus: (cycle, title = null) => {
    const today = new Date();
    const focDate = new Date(`${cycle.focDate}T23:59:59`);
    const daysToFoc = Math.ceil((focDate - today) / 86400000);
    if (cycle.status === 'Archived' || cycle.status === 'Released') {
      return title && title.availableForReorder === 'Yes' ? 'Reorder Available' : 'Archived';
    }
    if (cycle.status === 'FOC Locked' || !cycle.retailerOpen || focDate < today) return 'FOC Locked';
    if (cycle.retailerOpen && daysToFoc >= 0 && daysToFoc <= 7) return 'Closing Soon';
    if (cycle.retailerOpen) return 'Open for Ordering';
    return 'Upcoming';
  },

  getRetailerCatalogDownloads: (requestingUser) => {
    const allowed = requestingUser && (
      ((requestingUser.role === 'retailer') && requestingUser.approved) ||
      requestingUser.role === 'admin' || requestingUser.role === 'moos'
    );
    if (!allowed) throw new Error('An approved retailer or administrator account is required.');

    const cycles = JSON.parse(localStorage.getItem('philbo_catalog_cycles')) || [];
    const titles = JSON.parse(localStorage.getItem('philbo_titles')) || [];
    return cycles.map(cycle => {
      const publishedTitleIds = new Set(Array.isArray(cycle.catalogPublishedTitleIds) ? cycle.catalogPublishedTitleIds : []);
      const publishedTitles = titles.filter(title =>
        title.cycleId === cycle.cycleId &&
        isTitlePublished(title.status) &&
        publishedTitleIds.has(title.titleId)
      );
      const timestamps = publishedTitles.flatMap(title => (title.history || []).map(item => item.date)).filter(Boolean).sort();
      return {
        ...cycle,
        titleCount: publishedTitles.length,
        orderingStatus: db.getCatalogOrderingStatus(cycle),
        downloadEnabled: cycle.retailerDownloadEnabled !== false,
        lastUpdated: timestamps[timestamps.length - 1] || cycle.updatedAt || cycle.createdAt || cycle.catalogDate
      };
    });
  },

  generateCatalogCsv: (cycleId, requestingUser, options = {}) => {
    const isAdmin = requestingUser && (requestingUser.role === 'admin' || requestingUser.role === 'moos');
    const isApprovedRetailer = requestingUser && requestingUser.role === 'retailer' && requestingUser.approved;
    if (!isAdmin && !isApprovedRetailer) throw new Error('Catalog CSV access denied.');

    const cycles = JSON.parse(localStorage.getItem('philbo_catalog_cycles')) || [];
    const titles = JSON.parse(localStorage.getItem('philbo_titles')) || [];
    const cycle = cycles.find(item => item.cycleId === cycleId);
    if (!cycle) throw new Error('Catalog Cycle not found.');
    if (!isAdmin && cycle.retailerDownloadEnabled === false) throw new Error('Retailer download is disabled for this cycle.');

    const tier = isApprovedRetailer ? (requestingUser.tier || 'Tier I') : (options.tier || 'Tier I');
    const discount = db.getRetailerDiscount(tier);
    const publishedTitleIds = new Set(Array.isArray(cycle.catalogPublishedTitleIds) ? cycle.catalogPublishedTitleIds : []);
    const publishedTitles = titles.filter(title =>
      title.cycleId === cycleId &&
      isTitlePublished(title.status) &&
      publishedTitleIds.has(title.titleId)
    );
    const headers = [
      'Quantity','PHILBO ID','Publisher','UPC / Barcode / EAN','Title','Series Name','Issue Number','Variant Number','Cover Description',
      'Catalog Release Date','FOC Date','In-Store Date','MSRP','Retailer Wholesale Price','Retailer Discount Tier',
      'Book Format','Series Type','Genre','Series Frequency','Language','Age Rating','Page Count','Color or Black and White',
      'Writer','Artist','Cover Artist','Brief Synopsis','Full Description','BISAC Code 1','BISAC Code 2','BISAC Code 3',
      'Reprint','Printing Number','Width','Height','Weight','Available for Reorder','Downloadable Cover Image URL',
      'Additional Image 1','Additional Image 2','Publisher Logo','Incentive Ratio','Incentive Rules',
      'Approved','Orderable','Status','Created At','Updated At','Ordering Status','FOC Lock Status','Fulfillment Method'
    ];
    if (isAdmin && options.includeAllTierPrices) {
      headers.push('Tier I Wholesale','Tier II Wholesale','Tier III Wholesale');
    }

    const rows = publishedTitles.map(title => {
      const msrp = Number(title.msrp || 0);
      const row = [
        '', title.philboId || '', title.publisherName || '', title.barcode || '', title.title || '', title.seriesName || '',
        title.issueNumber || '', title.variantNumber || '', title.coverDescription || '', cycle.catalogDate || '', cycle.focDate || '',
        cycle.releaseDate || '', msrp.toFixed(2), (msrp * (1 - discount)).toFixed(2), tier, title.bookFormat || '',
        title.seriesType || '', title.genre || '', title.seriesFrequency || '', title.language || '', title.ageRange || '', title.pageCount ?? '',
        title.colorProfile || '', title.writer || '', title.artist || '', title.coverArtist || '', title.synopsis || '',
        title.description || '', title.bisac1 || '', title.bisac2 || '', title.bisac3 || '', title.reprint || '',
        title.printingNumber ?? '', title.widthInches ?? title.width ?? '', title.heightInches ?? title.height ?? '',
        title.weightPounds ?? title.weight ?? '', title.availableForReorder || '', title.coverUrl || '',
        title.additionalImage1 || '', title.additionalImage2 || '', title.publisherLogoUrl || '', title.incentiveRatio || '', title.incentiveRules || '',
        'Yes', getTitleCatalogAvailability(title, cycle).orderable ? 'Yes' : 'No', title.status || '', title.createdAt || '', title.updatedAt || '',
        getTitleCatalogAvailability(title, cycle).orderingStatus, getTitleCatalogAvailability(title, cycle).focLocked ? 'Locked' : 'Open', title.fulfillmentMethod || ''
      ];
      if (isAdmin && options.includeAllTierPrices) {
        row.push((msrp * 0.60).toFixed(2), (msrp * 0.55).toFixed(2), (msrp * 0.50).toFixed(2));
      }
      return row;
    });

    const escapeCsv = value => {
      const text = String(value ?? '');
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\r\n');
    const month = (cycle.releaseDate || cycle.catalogDate || '').slice(0, 7) || cycle.cycleId;
    const filename = `${isApprovedRetailer ? 'Philbo_Order_Ready_Catalog' : 'Philbo_Catalog'}_${month}_FOC_${cycle.focDate || 'unscheduled'}.csv`;

    if (options.recordHistory !== false) {
      const history = JSON.parse(localStorage.getItem('philbo_catalog_export_history')) || [];
      history.push({ cycleId, filename, generatedAt: new Date().toISOString(), generatedBy: requestingUser.uid, tier, titleCount: rows.length, adminExport: isAdmin, allTierPrices: Boolean(options.includeAllTierPrices) });
      localStorage.setItem('philbo_catalog_export_history', JSON.stringify(history));
    }
    return { filename, csv, titleCount: rows.length, cycle, tier };
  },

  generateRetailerOrderFormCsv: (cycleId, requestingUser) => {
    const isApprovedRetailer = requestingUser && requestingUser.role === 'retailer' && requestingUser.approved;
    const isAdmin = requestingUser && (requestingUser.role === 'admin' || requestingUser.role === 'moos');
    if (!isApprovedRetailer && !isAdmin) throw new Error('Order-form CSV access denied.');

    const cycles = JSON.parse(localStorage.getItem('philbo_catalog_cycles')) || [];
    const titles = JSON.parse(localStorage.getItem('philbo_titles')) || [];
    const cycle = cycles.find(item => item.cycleId === cycleId);
    if (!cycle) throw new Error('Catalog Cycle not found.');
    if (!isAdmin && cycle.retailerDownloadEnabled === false) throw new Error('Retailer download is disabled for this cycle.');

    const tier = isApprovedRetailer ? (requestingUser.tier || 'Tier I') : 'Tier I';
    const discount = db.getRetailerDiscount(tier);
    const publishedTitleIds = new Set(Array.isArray(cycle.catalogPublishedTitleIds) ? cycle.catalogPublishedTitleIds : []);
    const orderableTitles = titles.filter(title =>
      title.cycleId === cycleId &&
      isTitlePublished(title.status) &&
      publishedTitleIds.has(title.titleId) &&
      getTitleCatalogAvailability(title, cycle).orderable
    );
    const headers = ['Product Code','UPC / ISBN / EAN','Title','Publisher','FOC Date','In-Store Date','MSRP','Your Wholesale Price','Qty'];
    const rows = orderableTitles.map(title => {
      const msrp = Number(title.msrp || 0);
      return [
        title.philboId || title.barcode || title.isbn || title.upc || title.ean || '',
        title.barcode || title.isbn || title.upc || title.ean || '',
        title.title || '', title.publisherName || '', cycle.focDate || title.focDate || '',
        cycle.releaseDate || title.releaseDate || '', msrp.toFixed(2), (msrp * (1 - discount)).toFixed(2), ''
      ];
    });
    const escapeCsv = value => {
      const text = String(value ?? '');
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\r\n');
    const month = (cycle.catalogDate || cycle.releaseDate || '').slice(0, 7) || cycle.cycleId;
    return {
      filename: `Philbo_Order_Form_${month}_${tier.replace(/\s+/g, '_')}.csv`,
      csv,
      titleCount: rows.length,
      cycle,
      tier
    };
  },

  getCatalogExportHistory: (requestingUser) => {
    const isAdmin = requestingUser && (requestingUser.role === 'admin' || requestingUser.role === 'moos');
    if (!isAdmin) throw new Error('Administrator access required.');
    return (JSON.parse(localStorage.getItem('philbo_catalog_export_history')) || []).sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
  },

  generateAllCatalogCsv: (requestingUser, options = {}) => {
    const isAdmin = requestingUser && (requestingUser.role === 'admin' || requestingUser.role === 'moos');
    if (!isAdmin) throw new Error('Administrator access required.');
    const cycles = JSON.parse(localStorage.getItem('philbo_catalog_cycles')) || [];
    let combinedHeader = '';
    const combinedRows = [];
    let titleCount = 0;
    cycles.forEach(cycle => {
      const result = db.generateCatalogCsv(cycle.cycleId, requestingUser, { ...options, recordHistory: false });
      const lines = result.csv.split('\r\n');
      if (!combinedHeader) combinedHeader = `Catalog Cycle ID,Catalog Cycle Name,${lines[0]}`;
      lines.slice(1).filter(Boolean).forEach(line => {
        const cycleName = `"${String(cycle.cycleName || '').replace(/"/g, '""')}"`;
        combinedRows.push(`${cycle.cycleId},${cycleName},${line}`);
      });
      titleCount += result.titleCount;
    });
    const filename = `Philbo_Catalog_All_Cycles_${new Date().toISOString().slice(0, 10)}.csv`;
    const csv = [combinedHeader, ...combinedRows].join('\r\n');
    if (options.recordHistory !== false) {
      const history = JSON.parse(localStorage.getItem('philbo_catalog_export_history')) || [];
      history.push({ cycleId: 'ALL', filename, generatedAt: new Date().toISOString(), generatedBy: requestingUser.uid, tier: 'Admin', titleCount, adminExport: true, allTierPrices: Boolean(options.includeAllTierPrices) });
      localStorage.setItem('philbo_catalog_export_history', JSON.stringify(history));
    }
    return { filename, csv, titleCount };
  }
};

export const SECTION_PERMISSIONS = Object.freeze({
  moos: ['dashboard','catalog','cycles','publishers','retailers','pod-accounts','orders','purchase-orders','inventory','fulfillment','returns','analytics','settings','moos-access'],
  admin: ['dashboard','catalog','cycles','publishers','retailers','pod-accounts','orders','purchase-orders','inventory','fulfillment','returns','analytics','settings','moos-access'],
  preflight: ['dashboard','preflight-queue','production-orders','file-review','approved-files','my-activity','account'],
  publisher: ['dashboard','titles','submit-title','title-files','marketing-assets','purchase-orders','production-orders','sales','payments','profile','resources','support','pod-projects'],
  retailer: ['dashboard','retailer-catalog','catalog-downloads','current-order','order-history','shipments','retailer-returns','profile']
});
export const canAccessSection = (user, section) => Boolean(user && (SECTION_PERMISSIONS[normalizeRole(user.role)] || []).includes(section));

// Security boundary for the browser-storage prototype. Every caller receives only
// the records its role may retrieve; UI filtering is not treated as authorization.
const originalGetTitles = db.getTitles.bind(db);
const originalGetOrders = db.getOrders.bind(db);
const originalGetReturns = db.getReturns.bind(db);
const originalGetInventory = db.getInventory.bind(db);
db.getTitles = (requestingUser = db.getCurrentUser()) => {
  const titles = originalGetTitles();
  const cycles = readCollection('philbo_catalog_cycles');
  const role = normalizeRole(requestingUser?.role);
  if (role === ROLE_IDS.MOOS || role === ROLE_IDS.ADMIN) return titles;
  if (role === ROLE_IDS.PUBLISHER) return titles.filter(title => title.publisherId === requestingUser.uid);
  if (role === ROLE_IDS.PREFLIGHT) return titles.filter(title => title.fulfillmentMethod === 'POD' || title.usesPhilboPod || title.podRequired || title.podOption).map(title => {
    const { wholesalePrice, commissionRate, publisherPayout, revenue, profit, margin, internalNotes,
      productionQuantity, quantity, orderQuantity, printQuantity, retailerId, retailerName, ...productionTitle } = title;
    return productionTitle;
  });
  return titles
    .filter(title => {
      if (!isTitlePublished(title.status)) return false;
      const cycle = cycles.find(candidate => candidate.cycleId === title.cycleId);
      if (!cycle) return false;
      return Array.isArray(cycle.catalogPublishedTitleIds) && cycle.catalogPublishedTitleIds.includes(title.titleId);
    })
    .map(title => {
      const cycle = cycles.find(candidate => candidate.cycleId === title.cycleId);
      return { ...title, ...getTitleCatalogAvailability(title, cycle) };
    });
};
db.getPublicTitles = () => {
  const cycles = readCollection('philbo_catalog_cycles');
  return originalGetTitles()
    .filter(title => {
      if (!isTitlePublished(title.status)) return false;
      const cycle = cycles.find(candidate => candidate.cycleId === title.cycleId);
      if (!cycle) return false;
      return Array.isArray(cycle.catalogPublishedTitleIds) && cycle.catalogPublishedTitleIds.includes(title.titleId);
    })
    .map(title => {
      const cycle = cycles.find(candidate => candidate.cycleId === title.cycleId);
      return { ...title, ...getTitleCatalogAvailability(title, cycle) };
    });
};
db.getOrders = (requestingUser = db.getCurrentUser()) => {
  const orders = originalGetOrders();
  const role = normalizeRole(requestingUser?.role);
  if (role === ROLE_IDS.MOOS || role === ROLE_IDS.ADMIN) return orders;
  if (role === ROLE_IDS.RETAILER) return orders.filter(order => order.retailerId === requestingUser.uid);
  if (role === ROLE_IDS.PUBLISHER) return orders.map(order => ({
    orderId: order.orderId, date: order.date, paymentStatus: order.paymentStatus,
    items: (order.items || []).filter(item => item.publisherId === requestingUser.uid).map(({ retailerId, retailerName, ...item }) => item)
  })).filter(order => order.items.length);
  return [];
};
db.getReturns = (requestingUser = db.getCurrentUser()) => {
  const returns = originalGetReturns();
  const role = normalizeRole(requestingUser?.role);
  if (role === ROLE_IDS.MOOS || role === ROLE_IDS.ADMIN) return returns;
  if (role === ROLE_IDS.RETAILER) return returns.filter(item => item.retailerId === requestingUser.uid);
  return [];
};
db.getInventory = (requestingUser = db.getCurrentUser()) => {
  const inventory = originalGetInventory();
  const role = normalizeRole(requestingUser?.role);
  if (role === ROLE_IDS.MOOS || role === ROLE_IDS.ADMIN) return inventory;
  if (role === ROLE_IDS.PUBLISHER) return inventory.filter(item => item.publisherId === requestingUser.uid || item.publisherName === requestingUser.companyName);
  return [];
};

db.updatePublisherProfile = (uid, changes = {}) => {
  const actor = db.getCurrentUser();
  if (!actor || !isAccountActive(actor)) throw new Error('Please sign in again before saving this profile.');
  const actorRole = normalizeRole(actor.role);
  const editingOwnProfile = actorRole === ROLE_IDS.PUBLISHER && actor.uid === uid && hasPermission(actor, PERMISSIONS.PUBLISHER_SELF);
  const managingPublisher = [ROLE_IDS.MOOS, ROLE_IDS.ADMIN].includes(actorRole) && hasPermission(actor, PERMISSIONS.USERS_MANAGE);
  if (!editingOwnProfile && !managingPublisher) throw new Error('You may only edit your own publisher company profile.');

  const users = readCollection('philbo_users');
  const index = users.findIndex(user => user.uid === uid && normalizeRole(user.role) === ROLE_IDS.PUBLISHER);
  if (index < 0) throw new Error('Publisher account not found.');
  const previous = { ...users[index] };
  const editableFields = [
    'publisherLogoUrl', 'publisherLogoFileName', 'mailingAddress', 'primaryPhone', 'publisherEmail',
    'ccEmail1', 'ccEmail2', 'outsidePrinter', 'contactName',
    'secondaryPhoneAndContact', 'facebookGroupStatus', 'formResponseEmail'
  ];
  const safeChanges = {};
  editableFields.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(changes, field)) safeChanges[field] = String(changes[field] ?? '').trim();
  });
  users[index] = { ...users[index], ...safeChanges, profileManuallyUpdatedAt: new Date().toISOString() };
  writeCollection('philbo_users', users);
  appendAudit({
    action: 'Publisher company profile updated',
    recordType: 'user',
    recordId: uid,
    previousValue: Object.fromEntries(editableFields.map(field => [field, previous[field] || ''])),
    newValue: Object.fromEntries(editableFields.map(field => [field, users[index][field] || ''])),
    actor
  });
  if (actor.uid === uid) {
    const session = JSON.parse(sessionStorage.getItem('philbo_current_user') || 'null');
    if (session) sessionStorage.setItem('philbo_current_user', JSON.stringify({ ...session, ...safeUser(users[index]) }));
  }
  authEvent();
  return safeUser(users[index]);
};

db.updatePodProfile = (changes = {}) => {
  const actor = db.getCurrentUser();
  if (!actor || !isAccountActive(actor) || !actor.isPodClient) throw new Error('Please sign in to an approved POD account before saving this profile.');
  const users = readCollection('philbo_users');
  const index = users.findIndex(user => user.uid === actor.uid && user.isPodClient);
  if (index < 0) throw new Error('POD account not found.');

  const editableFields = ['resaleCertificateNumber', 'resaleCertificateState', 'resaleCertificateExpiration'];
  const previous = { ...users[index] };
  const safeChanges = {};
  editableFields.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(changes, field)) safeChanges[field] = String(changes[field] ?? '').trim();
  });
  const certificateFileName = String(changes.resaleCertificateFileName || '').trim();
  if (certificateFileName) {
    if (!/\.(pdf|png|jpe?g)$/i.test(certificateFileName)) throw new Error('Upload the resale certificate as a PDF, PNG, JPG, or JPEG file.');
    safeChanges.resaleCertificateFileName = certificateFileName;
    safeChanges.resaleCertificateFileSize = Math.max(0, Number(changes.resaleCertificateFileSize) || 0);
    safeChanges.resaleCertificateStatus = 'Pending Review';
    safeChanges.taxExempt = false;
    safeChanges.resaleCertificateSubmittedAt = new Date().toISOString();
    safeChanges.resaleCertificateReviewedAt = '';
    safeChanges.resaleCertificateReviewNotes = '';
  }
  users[index] = { ...users[index], ...safeChanges, profileManuallyUpdatedAt: new Date().toISOString() };
  writeCollection('philbo_users', users);
  appendAudit({
    action: certificateFileName ? 'POD resale certificate submitted' : 'POD company profile updated',
    recordType: 'user',
    recordId: actor.uid,
    previousValue: {
      resaleCertificateFileName: previous.resaleCertificateFileName || '',
      resaleCertificateStatus: previous.resaleCertificateStatus || 'Not Submitted',
      taxExempt: Boolean(previous.taxExempt)
    },
    newValue: {
      resaleCertificateFileName: users[index].resaleCertificateFileName || '',
      resaleCertificateStatus: users[index].resaleCertificateStatus || 'Not Submitted',
      taxExempt: Boolean(users[index].taxExempt)
    },
    actor
  });
  const session = JSON.parse(sessionStorage.getItem('philbo_current_user') || 'null');
  if (session) sessionStorage.setItem('philbo_current_user', JSON.stringify({ ...session, ...safeUser(users[index]) }));
  authEvent();
  return safeUser(users[index]);
};

db.reviewPodResaleCertificate = (uid, decision, notes = '') => {
  const actor = requireActor(PERMISSIONS.USERS_MANAGE);
  const normalizedDecision = String(decision || '').toLowerCase();
  if (!['approved', 'rejected'].includes(normalizedDecision)) throw new Error('Choose Approved or Rejected.');
  const users = readCollection('philbo_users');
  const index = users.findIndex(user => user.uid === uid && user.isPodClient);
  if (index < 0) throw new Error('POD account not found.');
  if (!users[index].resaleCertificateFileName) throw new Error('This POD account has not submitted a resale certificate.');
  const previous = {
    resaleCertificateStatus: users[index].resaleCertificateStatus || 'Pending Review',
    taxExempt: Boolean(users[index].taxExempt)
  };
  users[index] = {
    ...users[index],
    resaleCertificateStatus: normalizedDecision === 'approved' ? 'Approved' : 'Rejected',
    taxExempt: normalizedDecision === 'approved',
    resaleCertificateReviewedAt: new Date().toISOString(),
    resaleCertificateReviewedBy: actor.email,
    resaleCertificateReviewNotes: String(notes || '').trim()
  };
  writeCollection('philbo_users', users);
  appendAudit({
    action: normalizedDecision === 'approved' ? 'POD resale certificate approved' : 'POD resale certificate rejected',
    recordType: 'user',
    recordId: uid,
    previousValue: previous,
    newValue: {
      resaleCertificateStatus: users[index].resaleCertificateStatus,
      taxExempt: users[index].taxExempt
    },
    notes: users[index].resaleCertificateReviewNotes,
    actor
  });
  return safeUser(users[index]);
};

db.updateRetailerProfile = (uid, changes = {}) => {
  const actor = db.getCurrentUser();
  if (!actor || !isAccountActive(actor)) throw new Error('Please sign in again before saving this profile.');
  const actorRole = normalizeRole(actor.role);
  const editingOwnProfile = actorRole === ROLE_IDS.RETAILER && actor.uid === uid;
  const managingRetailer = [ROLE_IDS.MOOS, ROLE_IDS.ADMIN].includes(actorRole) && hasPermission(actor, PERMISSIONS.USERS_MANAGE);
  if (!editingOwnProfile && !managingRetailer) throw new Error('You may only edit your own store information.');

  const users = readCollection('philbo_users');
  const index = users.findIndex(account => account.uid === uid && normalizeRole(account.role) === ROLE_IDS.RETAILER);
  if (index < 0) throw new Error('Retailer account not found.');
  const editableFields = [
    'companyName', 'contactName', 'primaryPhone', 'website',
    'shippingAddress1', 'shippingAddress2', 'shippingCity', 'shippingState', 'shippingZip', 'shippingCountry',
    'taxId', 'resaleCertificateNumber', 'resaleCertificateState', 'resaleCertificateExpiration'
  ];
  const previous = { ...users[index] };
  const safeChanges = {};
  editableFields.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(changes, field)) safeChanges[field] = String(changes[field] ?? '').trim();
  });
  if (!safeChanges.companyName || !safeChanges.primaryPhone || !safeChanges.shippingAddress1 || !safeChanges.shippingCity || !safeChanges.shippingState || !safeChanges.shippingZip || !safeChanges.shippingCountry) {
    throw new Error('Complete the store name, phone, and full brick-and-mortar address before saving.');
  }
  if (safeChanges.website && !/^https?:\/\//i.test(safeChanges.website)) safeChanges.website = `https://${safeChanges.website}`;
  const certificateFileName = String(changes.resaleCertificateFileName || '').trim();
  if (certificateFileName) {
    if (!/\.(pdf|png|jpe?g)$/i.test(certificateFileName)) throw new Error('Upload the resale certificate as a PDF, PNG, JPG, or JPEG file.');
    safeChanges.resaleCertificateFileName = certificateFileName;
    safeChanges.resaleCertificateFileSize = Math.max(0, Number(changes.resaleCertificateFileSize) || 0);
    safeChanges.resaleCertificateStatus = 'Pending Review';
    safeChanges.taxExempt = false;
    safeChanges.resaleCertificateSubmittedAt = new Date().toISOString();
  }
  users[index] = { ...users[index], ...safeChanges, profileManuallyUpdatedAt: new Date().toISOString() };
  writeCollection('philbo_users', users);
  appendAudit({
    action: certificateFileName ? 'Retailer store profile and resale certificate updated' : 'Retailer store profile updated',
    recordType: 'user',
    recordId: uid,
    previousValue: Object.fromEntries([...editableFields, 'resaleCertificateFileName', 'resaleCertificateStatus'].map(field => [field, previous[field] || ''])),
    newValue: Object.fromEntries([...editableFields, 'resaleCertificateFileName', 'resaleCertificateStatus'].map(field => [field, users[index][field] || ''])),
    actor
  });
  if (actor.uid === uid) {
    const session = JSON.parse(sessionStorage.getItem('philbo_current_user') || 'null');
    if (session) sessionStorage.setItem('philbo_current_user', JSON.stringify({ ...session, ...safeUser(users[index]) }));
  }
  authEvent();
  return safeUser(users[index]);
};

db.updateRetailerPublisherFollows = (publisherKeys = []) => {
  const actor = requireActor(PERMISSIONS.RETAILER_SELF);
  if (normalizeRole(actor.role) !== ROLE_IDS.RETAILER) throw new Error('Only retailer accounts can follow publishers.');

  const users = readCollection('philbo_users');
  const index = users.findIndex(user => user.uid === actor.uid);
  if (index < 0) throw new Error('Retailer account not found.');
  const previous = Array.isArray(users[index].followedPublisherKeys) ? users[index].followedPublisherKeys : [];
  const followedPublisherKeys = Array.from(new Set(
    (Array.isArray(publisherKeys) ? publisherKeys : [])
      .map(key => String(key || '').trim())
      .filter(Boolean)
  ));
  users[index] = {
    ...users[index],
    followedPublisherKeys,
    publisherFollowsUpdatedAt: new Date().toISOString()
  };
  writeCollection('philbo_users', users);
  appendAudit({
    action: 'Retailer publisher follows updated',
    recordType: 'user',
    recordId: actor.uid,
    previousValue: previous,
    newValue: followedPublisherKeys,
    actor
  });
  const session = JSON.parse(sessionStorage.getItem('philbo_current_user') || 'null');
  if (session) sessionStorage.setItem('philbo_current_user', JSON.stringify({ ...session, ...safeUser(users[index]) }));
  authEvent();
  return safeUser(users[index]);
};

db.changeOwnPassword = (currentPassword, newPassword) => {
  const actor = db.getCurrentUser();
  if (!actor || !isAccountActive(actor)) throw new Error('Please sign in again before changing your password.');
  if (String(newPassword || '').length < 12) throw new Error('Use at least 12 characters for the new password.');

  const users = readCollection('philbo_users');
  const index = users.findIndex(user => user.uid === actor.uid);
  if (index < 0) throw new Error('Account not found.');
  if (users[index].passwordHash && users[index].passwordHash !== currentPassword) {
    throw new Error('The current password is incorrect.');
  }

  users[index].passwordHash = newPassword;
  users[index].passwordResetRequired = false;
  users[index].sessionVersion = Number(users[index].sessionVersion || 1) + 1;
  writeCollection('philbo_users', users);
  sessionStorage.removeItem('philbo_current_user');
  appendAudit({
    action: 'Account password changed',
    recordType: 'user',
    recordId: actor.uid,
    notes: 'All existing sessions were revoked.',
    actor
  });
  authEvent();
  return true;
};

const lastActiveMoos = (users, targetUid) => users.filter(user => normalizeRole(user.role) === ROLE_IDS.MOOS && isAccountActive(user) && user.uid !== targetUid).length === 0;
db.getInternalStaff = () => {
  const actor = requireActor(PERMISSIONS.STAFF_MANAGE);
  return readCollection('philbo_users').filter(user => [ROLE_IDS.MOOS, ROLE_IDS.ADMIN, ROLE_IDS.PREFLIGHT].includes(normalizeRole(user.role))).map(safeUser);
};
db.createInternalStaff = ({ email, companyName, role }) => {
  const actor = requireActor(PERMISSIONS.STAFF_MANAGE);
  const actorRole = normalizeRole(actor.role);
  role = normalizeRole(role);
  if (![ROLE_IDS.ADMIN, ROLE_IDS.PREFLIGHT].includes(role)) throw new Error('Select Admin or Print Production / Preflight.');
  if (actorRole !== ROLE_IDS.MOOS && role !== ROLE_IDS.PREFLIGHT) throw new Error('Only MO.OS may create another Admin account.');
  const users = readCollection('philbo_users');
  if (users.some(user => user.email.toLowerCase() === email.toLowerCase())) throw new Error('An account already exists for this email.');
  const temporaryPassword = `Invite-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
  const user = { uid: `staff_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, email, companyName, role, roles: [role], approved: true,
    accountStatus: 'active', isInvitationPending: true, passwordResetRequired: true, temporaryPassword, passwordHash: temporaryPassword,
    sessionVersion: 1, permissionOverrides: {}, internalNotes: [], createdAt: new Date().toISOString() };
  users.push(user); writeCollection('philbo_users', users);
  appendAudit({ action: 'Internal account created', recordType: 'user', recordId: user.uid, newValue: safeUser(user), actor });
  authEvent(); return safeUser(user);
};
db.updateInternalStaff = (uid, changes, note = '') => {
  const actor = requireActor(PERMISSIONS.STAFF_MANAGE);
  const users = readCollection('philbo_users');
  const index = users.findIndex(user => user.uid === uid);
  if (index < 0) throw new Error('Internal account not found.');
  const previous = { ...users[index] };
  if (normalizeRole(actor.role) !== ROLE_IDS.MOOS) {
    if (normalizeRole(previous.role) === ROLE_IDS.MOOS) throw new Error('Admins may never change, lock, suspend, or revoke MO.OS.');
    if (normalizeRole(previous.role) === ROLE_IDS.ADMIN) throw new Error('Only MO.OS may manage another Admin account.');
    if (changes.role || changes.permissionOverrides) throw new Error('Only MO.OS may change internal roles or permissions.');
  }
  const targetIsMoos = normalizeRole(previous.role) === ROLE_IDS.MOOS;
  const nextRole = changes.role ? normalizeRole(changes.role) : normalizeRole(previous.role);
  const destructive = ['suspended','locked','revoked'].includes(changes.accountStatus) || nextRole !== ROLE_IDS.MOOS;
  if (targetIsMoos && destructive && lastActiveMoos(users, uid)) throw new Error('The final active MO.OS account is protected and must remain active with full access.');
  if (targetIsMoos && changes.permissionOverrides && Object.values(changes.permissionOverrides).some(value => value === false)) throw new Error('MO.OS permissions cannot be removed.');
  const allowed = {};
  if (changes.accountStatus) allowed.accountStatus = changes.accountStatus;
  if (changes.role) {
    if (![ROLE_IDS.MOOS, ROLE_IDS.ADMIN, ROLE_IDS.PREFLIGHT].includes(nextRole)) throw new Error('Invalid internal role.');
    allowed.role = nextRole; allowed.roles = [nextRole];
  }
  if (changes.permissionOverrides) allowed.permissionOverrides = { ...(previous.permissionOverrides || {}), ...changes.permissionOverrides };
  if (changes.passwordResetRequired !== undefined) allowed.passwordResetRequired = Boolean(changes.passwordResetRequired);
  if (changes.revokeSessions) allowed.sessionVersion = Number(previous.sessionVersion || 1) + 1;
  if (note) allowed.internalNotes = [...(previous.internalNotes || []), { date: new Date().toISOString(), user: actor.email, note }];
  users[index] = { ...previous, ...allowed, lastAccessChangedAt: new Date().toISOString() };
  writeCollection('philbo_users', users);
  const action = changes.revokeSessions ? 'Session revoked' : changes.role ? 'Role changed' : changes.permissionOverrides ? 'Permission changed' : changes.accountStatus === 'suspended' ? 'Internal account suspended' : changes.accountStatus === 'active' ? 'Internal account restored' : 'Internal account updated';
  appendAudit({ action, recordType: 'user', recordId: uid, previousValue: safeUser(previous), newValue: safeUser(users[index]), notes: note, actor });
  authEvent(); return safeUser(users[index]);
};
db.resendInternalInvitation = uid => {
  const actor = requireActor(PERMISSIONS.STAFF_MANAGE); const users = readCollection('philbo_users'); const index = users.findIndex(user => user.uid === uid);
  if (index < 0) throw new Error('Internal account not found.');
  if (normalizeRole(actor.role) !== ROLE_IDS.MOOS && normalizeRole(users[index].role) !== ROLE_IDS.PREFLIGHT) throw new Error('Only MO.OS may manage Admin invitations.');
  const temporaryPassword = `Invite-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
  users[index].isInvitationPending = true; users[index].passwordResetRequired = true; users[index].temporaryPassword = temporaryPassword;
  users[index].passwordHash = temporaryPassword; users[index].sessionVersion = Number(users[index].sessionVersion || 1) + 1;
  users[index].invitationLastSentAt = new Date().toISOString(); writeCollection('philbo_users', users);
  appendAudit({ action: 'Internal invitation resent', recordType: 'user', recordId: uid, actor }); authEvent(); return safeUser(users[index]);
};
db.updateExternalAccountStatus = (uid, accountStatus, note = '') => {
  const actor = requireActor(PERMISSIONS.USERS_MANAGE);
  if (!['active', 'suspended', 'revoked'].includes(accountStatus)) throw new Error('Invalid external account status.');
  const users = readCollection('philbo_users');
  const index = users.findIndex(user => user.uid === uid);
  if (index < 0) throw new Error('Publisher, retailer, or POD account not found.');
  const previous = { ...users[index] };
  const role = normalizeRole(previous.role);
  if (![ROLE_IDS.PUBLISHER, ROLE_IDS.RETAILER].includes(role)) throw new Error('Only publisher, retailer, and POD accounts can be changed here.');

  users[index] = {
    ...previous,
    accountStatus,
    sessionVersion: Number(previous.sessionVersion || 1) + 1,
    lastAccessChangedAt: new Date().toISOString(),
    accessStatusHistory: [
      ...(previous.accessStatusHistory || []),
      {
        date: new Date().toISOString(),
        status: accountStatus,
        user: actor.email,
        note
      }
    ]
  };
  writeCollection('philbo_users', users);
  const action = accountStatus === 'active'
    ? 'External account reactivated'
    : accountStatus === 'suspended'
      ? 'External account placed on hold'
      : 'External account archived';
  appendAudit({
    action,
    recordType: 'user',
    recordId: uid,
    previousValue: safeUser(previous),
    newValue: safeUser(users[index]),
    notes: note,
    actor
  });
  authEvent();
  return safeUser(users[index]);
};
const POD_PUBLIC_PRICING = Object.freeze({
  bw: Object.freeze({ 20: 2.10, 24: 2.20, 28: 2.30, 32: 2.40, 36: 2.50, 40: 2.60, 44: 2.70, 48: 2.80, 52: 2.90, 56: 3.00, 60: 3.10, 64: 3.20, 68: 3.30, 72: 3.40, 76: 3.50, 80: 3.60 }),
  color: Object.freeze({ 20: 2.50, 24: 2.60, 28: 2.70, 32: 2.80, 36: 2.90, 40: 3.00, 44: 3.10, 48: 3.20, 52: 3.30, 56: 3.40, 60: 3.50, 64: 3.60, 68: 3.70, 72: 3.80, 76: 3.90, 80: 4.00 })
});
const POD_DISTRIBUTION_PRICING = Object.freeze({
  bw: Object.freeze({ 20: 2.25, 24: 2.35, 28: 2.45, 32: 2.55, 36: 2.65, 40: 2.75, 44: 2.85, 48: 2.95, 52: 3.05, 56: 3.15, 60: 3.25, 64: 3.35, 68: 3.45, 72: 3.55, 76: 3.65, 80: 3.75 }),
  color: Object.freeze({ 20: 2.25, 24: 2.35, 28: 2.45, 32: 2.55, 36: 2.65, 40: 2.75, 44: 2.85, 48: 2.95, 52: 3.05, 56: 3.15, 60: 3.25, 64: 3.35, 68: 3.45, 72: 3.55, 76: 3.65, 80: 3.75 })
});
const POD_CROWDFUNDING_PRICING = Object.freeze({
  bw: Object.freeze({ 20: 3.25, 24: 3.35, 28: 3.45, 32: 3.55, 36: 3.65, 40: 3.65, 44: 3.75, 48: 3.85, 52: 3.95, 56: 4.05, 60: 4.15, 64: 4.25, 68: 4.35, 72: 4.45, 76: 4.55, 80: 4.65 }),
  color: Object.freeze({ 20: 3.25, 24: 3.35, 28: 3.45, 32: 3.55, 36: 3.65, 40: 3.65, 44: 3.75, 48: 3.85, 52: 3.95, 56: 4.05, 60: 4.15, 64: 4.25, 68: 4.35, 72: 4.45, 76: 4.55, 80: 4.65 })
});
const POD_INTERIOR_STOCKS = Object.freeze(['60# Lynx Super Smooth Text']);
const POD_COVER_STOCKS = Object.freeze(['70# Gloss Cover', '60# Matte Cover', '80# Super Smooth Sketch Cover']);
const isPhilboPodTitle = title => Boolean(title && (
  title.fulfillmentMethod === 'Philbo POD'
  || title.fulfillmentMethod === 'POD'
  || title.usesPhilboPod
  || title.podRequired
  || title.podOption
));
const publisherPodLineDetails = (poItem, title) => {
  const pageCount = Number(title?.pageCount || 0);
  const interiorColor = /b&w|black|gray|grey/i.test(String(title?.colorProfile || '')) ? 'bw' : 'color';
  const unitPrice = POD_DISTRIBUTION_PRICING[interiorColor]?.[pageCount] ?? null;
  const coverFileName = title?.coverFileName || title?.coverArtFile || title?.coverArtPdfName || '';
  const interiorFileName = title?.interiorFileName || title?.interiorPdfFile || title?.interiorPdfName || '';
  return {
    titleId: poItem.titleId,
    title: poItem.title,
    philboId: poItem.philboId || title?.philboId || '',
    retailerQuantity: Math.max(0, Number(poItem.qty || 0)),
    pageCount,
    interiorColor,
    comicSize: `${title?.width || 6.625}\" x ${title?.height || 10.25}\"`,
    coverFileName,
    interiorFileName,
    filesReady: Boolean(coverFileName && interiorFileName),
    unitPrice,
    pricingStatus: unitPrice == null ? 'Quote Review' : 'Estimated from Current POD Pricing'
  };
};
db.getPodOrders = (requestingUser = db.getCurrentUser()) => {
  if (!isAccountActive(requestingUser)) return [];
  const orders = readCollection('philbo_pod_orders');
  const role = normalizeRole(requestingUser.role);
  if ([ROLE_IDS.MOOS, ROLE_IDS.ADMIN].includes(role)) return orders;
  if (requestingUser.isPodClient) return orders.filter(order => order.customerId === requestingUser.uid);
  return [];
};
db.submitPodOrder = orderData => {
  const actor = db.getCurrentUser();
  if (!isAccountActive(actor) || !actor.isPodClient) throw new Error('An approved POD customer account is required.');
  const productType = String(orderData.productType || '');
  if (productType !== 'self-cover-comics') throw new Error('Select an available POD product.');
  const quantity = Math.max(1, Number.parseInt(orderData.quantity, 10) || 0);
  if (!orderData.projectTitle?.trim()) throw new Error('Enter a project title.');

  let unitPrice = null;
  let baseSubtotal = null;
  let discountAmount = null;
  let subtotal = null;
  let pricingStatus = 'Quote Review';
  const usePhilboPodLogo = Boolean(orderData.usePhilboPodLogo);
  if (productType === 'self-cover-comics') {
    const pageCount = Number(orderData.pageCount);
    const interiorColor = orderData.interiorColor === 'color' ? 'color' : 'bw';
    const pricingSchedule = orderData.pricingSchedule === 'crowdfunding' ? 'crowdfunding' : 'public';
    const pricingTable = pricingSchedule === 'crowdfunding' ? POD_CROWDFUNDING_PRICING : POD_PUBLIC_PRICING;
    unitPrice = pricingTable[interiorColor][pageCount];
    if (!unitPrice) throw new Error('Select a supported Comic Books page count.');
    baseSubtotal = Number((unitPrice * quantity).toFixed(2));
    discountAmount = usePhilboPodLogo ? Number((baseSubtotal * 0.05).toFixed(2)) : 0;
    subtotal = Number((baseSubtotal - discountAmount).toFixed(2));
    pricingStatus = pricingSchedule === 'crowdfunding' ? 'Crowdfunding Price Confirmed' : 'Public Price Confirmed';
  }

  const orders = readCollection('philbo_pod_orders');
  const order = {
    podOrderId: `POD-${String(orders.length + 1001).padStart(4, '0')}`,
    customerId: actor.uid,
    customerName: actor.companyName,
    customerEmail: actor.email,
    productType,
    productName: orderData.productName,
    projectTitle: orderData.projectTitle.trim(),
    quantity,
    comicSize: '6.625" x 10.25"',
    pageCount: orderData.pageCount ? Number(orderData.pageCount) : null,
    pricingSchedule: orderData.pricingSchedule === 'crowdfunding' ? 'crowdfunding' : 'public',
    interiorColor: orderData.interiorColor || null,
    interiorPaper: POD_INTERIOR_STOCKS.includes(orderData.interiorPaper) ? orderData.interiorPaper : POD_INTERIOR_STOCKS[0],
    coverType: POD_COVER_STOCKS.includes(orderData.coverType) ? orderData.coverType : POD_COVER_STOCKS[0],
    usePhilboPodLogo,
    discountPercentage: usePhilboPodLogo ? 5 : 0,
    discountAmount,
    requestedSpecifications: String(orderData.requestedSpecifications || '').trim(),
    proofPreference: orderData.proofPreference || 'Digital proof',
    variants: Math.max(0, Number.parseInt(orderData.variants, 10) || 0),
    additionalInformation: String(orderData.additionalInformation || '').trim(),
    artworkFileName: orderData.artworkFileName || '',
    unitPrice,
    baseSubtotal,
    subtotal,
    pricingStatus,
    shippingStatus: 'Shipping Quote Required',
    paymentStatus: 'Not Yet Invoiced',
    status: productType === 'self-cover-comics' ? 'Submitted for Review' : 'Quote Requested',
    submittedAt: new Date().toISOString(),
    history: [{ date: new Date().toISOString(), user: actor.email, action: 'POD order submitted' }]
  };
  orders.push(order);
  writeCollection('philbo_pod_orders', orders);
  appendAudit({ action: 'POD order submitted', recordType: 'pod_order', recordId: order.podOrderId, newValue: order, actor });
  return order;
};
db.transferPlatformOwnership = uid => {
  const actor = requireActor(PERMISSIONS.STAFF_MANAGE); const users = readCollection('philbo_users'); const targetIndex = users.findIndex(user => user.uid === uid); const actorIndex = users.findIndex(user => user.uid === actor.uid);
  if (normalizeRole(actor.role) !== ROLE_IDS.MOOS) throw new Error('Only MO.OS may transfer platform ownership.');
  if (targetIndex < 0 || actorIndex < 0) throw new Error('Ownership transfer account not found.');
  if (![ROLE_IDS.ADMIN, ROLE_IDS.PREFLIGHT].includes(normalizeRole(users[targetIndex].role))) throw new Error('Ownership may be transferred only to active internal staff.');
  if (!isAccountActive(users[targetIndex])) throw new Error('Restore the target account before transferring ownership.');
  const previous = { from: safeUser(users[actorIndex]), to: safeUser(users[targetIndex]) };
  users[targetIndex] = { ...users[targetIndex], role: ROLE_IDS.MOOS, roles: [ROLE_IDS.MOOS], permissionOverrides: {}, ownershipTransferredAt: new Date().toISOString() };
  users[actorIndex] = { ...users[actorIndex], role: ROLE_IDS.ADMIN, roles: [ROLE_IDS.ADMIN], permissionOverrides: {}, sessionVersion: Number(users[actorIndex].sessionVersion || 1) + 1 };
  writeCollection('philbo_users', users); appendAudit({ action: 'Platform ownership transferred', recordType: 'user', recordId: uid, previousValue: previous, newValue: { from: safeUser(users[actorIndex]), to: safeUser(users[targetIndex]) }, actor });
  authEvent(); return safeUser(users[targetIndex]);
};
db.getAuditLog = (requestingUser = db.getCurrentUser()) => {
  if (!requestingUser) throw new Error('Authentication required.');
  const role = normalizeRole(requestingUser.role);
  const log = readCollection('philbo_audit_log').sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
  if ([ROLE_IDS.MOOS, ROLE_IDS.ADMIN].includes(role)) return log;
  if (role === ROLE_IDS.PREFLIGHT) return log.filter(item => item.userId === requestingUser.uid);
  if ([ROLE_IDS.PUBLISHER, ROLE_IDS.RETAILER].includes(role)) return log.filter(item => item.userId === requestingUser.uid);
  throw new Error('Activity history access denied.');
};
db.getOperationalNotes = (requestingUser = db.getCurrentUser()) => {
  if (!requestingUser || !isAccountActive(requestingUser) || ![ROLE_IDS.MOOS, ROLE_IDS.ADMIN].includes(normalizeRole(requestingUser.role))) throw new Error('Administrative note access denied.');
  return readCollection('philbo_operational_notes').sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
};
db.addOperationalNote = ({ contextId, contextLabel, status = 'Pending', note }) => {
  const actor = db.getCurrentUser();
  if (!actor || !isAccountActive(actor) || ![ROLE_IDS.MOOS, ROLE_IDS.ADMIN].includes(normalizeRole(actor.role))) throw new Error('Administrative note access denied.');
  const text = String(note || '').trim();
  if (!text) throw new Error('Write a note before saving.');
  const validStatuses = ['Pending', 'In Progress', 'Waiting', 'Complete'];
  if (!validStatuses.includes(status)) throw new Error('Select a valid follow-up status.');
  const notes = readCollection('philbo_operational_notes');
  const createdAt = new Date().toISOString();
  const entry = {
    noteId: `opsnote_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    contextType: 'admin_queue',
    contextId: String(contextId || 'general'),
    contextLabel: String(contextLabel || 'General Operations'),
    status,
    note: text,
    authorUserId: actor.uid,
    authorEmail: actor.email,
    authorName: actor.contactName || actor.primaryContact || actor.companyName || actor.email,
    authorRole: normalizeRole(actor.role),
    createdAt,
    updatedAt: createdAt
  };
  notes.push(entry);
  writeCollection('philbo_operational_notes', notes);
  appendAudit({ action: 'Operations follow-up note added', recordType: 'operational_note', recordId: entry.noteId, newValue: entry, notes: text, actor });
  return entry;
};
db.updateOperationalNoteStatus = (noteId, status) => {
  const actor = db.getCurrentUser();
  if (!actor || !isAccountActive(actor) || ![ROLE_IDS.MOOS, ROLE_IDS.ADMIN].includes(normalizeRole(actor.role))) throw new Error('Administrative note access denied.');
  const validStatuses = ['Pending', 'In Progress', 'Waiting', 'Complete'];
  if (!validStatuses.includes(status)) throw new Error('Select a valid follow-up status.');
  const notes = readCollection('philbo_operational_notes');
  const index = notes.findIndex(item => item.noteId === noteId);
  if (index < 0) throw new Error('Operations note not found.');
  const previous = { ...notes[index] };
  notes[index] = { ...notes[index], status, updatedAt: new Date().toISOString(), updatedByUserId: actor.uid, updatedByEmail: actor.email, updatedByName: actor.contactName || actor.primaryContact || actor.companyName || actor.email };
  writeCollection('philbo_operational_notes', notes);
  appendAudit({ action: 'Operations follow-up status changed', recordType: 'operational_note', recordId: noteId, previousValue: previous, newValue: notes[index], actor });
  return notes[index];
};

const ensureProductionOrders = () => {
  const existing = readCollection('philbo_production_orders');
  const titles = readCollection('philbo_titles');
  const salesOrders = readCollection('philbo_orders');
  const podTitles = titles.filter(title => title.fulfillmentMethod === 'POD' || title.usesPhilboPod || title.podRequired || title.podOption);
  let changed = false;
  const orderPlacedForTitle = titleId => salesOrders
    .filter(order => (order.items || []).some(item => item.titleId === titleId) && order.date)
    .map(order => order.date)
    .sort()[0] || null;
  existing.forEach(order => {
    if (order.orderPlacedAt) return;
    order.orderPlacedAt = orderPlacedForTitle(order.titleId);
    changed = true;
  });
  podTitles.forEach(title => {
    if (existing.some(order => order.titleId === title.titleId)) return;
    existing.push({ productionOrderId: `PROD-${String(existing.length + 1).padStart(5, '0')}`, titleId: title.titleId, title: title.title,
      philboId: title.philboId, publisherId: title.publisherId, publisherName: title.publisherName, quantityRequired: title.productionQuantity || 0,
      orderPlacedAt: orderPlacedForTitle(title.titleId),
      productionDeadline: title.productionDeadline || title.releaseDate, coverFileName: title.coverFileName || title.coverArtFile || title.coverArtPdfName || '',
      interiorFileName: title.interiorFileName || title.interiorPdfFile || title.interiorPdfName || '', coverFileStatus: title.coverFileName || title.coverArtFile || title.coverArtPdfName ? 'Files Received' : 'Files Not Submitted',
      interiorFileStatus: title.interiorFileName || title.interiorPdfFile || title.interiorPdfName ? 'Files Received' : 'Files Not Submitted', overallPreflightStatus: 'Files Not Submitted',
      specifications: { trimSize: `${title.width || 6.625} × ${title.height || 10.25}`, pageCount: title.pageCount, color: title.colorProfile, bleed: title.bleed || '0.125 in' },
      fileVersions: [], notes: [], history: [] }); changed = true;
  });
  if (changed) writeCollection('philbo_production_orders', existing);
  return existing;
};
db.getPurchaseOrderPodDetails = (poNumber, requestingUser = db.getCurrentUser()) => {
  if (!requestingUser || !isAccountActive(requestingUser)) throw new Error('Authentication required.');
  const role = normalizeRole(requestingUser.role);
  if (![ROLE_IDS.MOOS, ROLE_IDS.ADMIN, ROLE_IDS.PUBLISHER].includes(role)) throw new Error('POD purchase-order access denied.');
  const purchaseOrder = readCollection('philbo_purchase_orders').find(po => po.poNumber === poNumber && po.status === 'Official');
  if (!purchaseOrder) throw new Error('Official Purchase Order not found.');
  if (role === ROLE_IDS.PUBLISHER && purchaseOrder.publisherId !== requestingUser.uid) throw new Error('You may order printing only for your own Purchase Orders.');
  const titles = readCollection('philbo_titles');
  const eligibleItems = (purchaseOrder.items || []).map(item => {
    const title = titles.find(record => record.titleId === item.titleId);
    return isPhilboPodTitle(title) ? publisherPodLineDetails(item, title) : null;
  }).filter(Boolean);
  const requests = readCollection('philbo_pod_orders')
    .filter(order => order.sourcePurchaseOrder === poNumber && order.sourceType === 'publisher_purchase_order')
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  return { purchaseOrder, eligibleItems, latestRequest: requests[0] || null, requests };
};
db.getPublisherStandalonePodOrders = (requestingUser = db.getCurrentUser()) => {
  if (!requestingUser || !isAccountActive(requestingUser) || normalizeRole(requestingUser.role) !== ROLE_IDS.PUBLISHER) return [];
  return readCollection('philbo_pod_orders')
    .filter(order => order.sourceType === 'publisher_standalone' && order.publisherId === requestingUser.uid)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
};
db.submitPublisherStandalonePodOrder = (orderData = {}) => {
  const actor = db.getCurrentUser();
  if (!actor || !isAccountActive(actor) || normalizeRole(actor.role) !== ROLE_IDS.PUBLISHER) throw new Error('An active publisher account is required.');
  const title = readCollection('philbo_titles').find(record => record.titleId === orderData.titleId && record.publisherId === actor.uid);
  if (!title) throw new Error('Select one of your publisher titles.');
  const quantity = Math.max(0, Number.parseInt(orderData.quantity, 10) || 0);
  if (!quantity) throw new Error('Enter the number of copies you want printed.');
  const publisherShipToAddress = String(orderData.publisherShipToAddress || '').trim();
  if (!publisherShipToAddress) throw new Error('Enter the address where these books should be shipped.');

  const line = publisherPodLineDetails({ titleId: title.titleId, title: title.title, philboId: title.philboId, qty: 0 }, title);
  const usePhilboPodLogo = Boolean(orderData.usePhilboPodLogo);
  const baseSubtotal = line.unitPrice == null ? null : Number((line.unitPrice * quantity).toFixed(2));
  const discountAmount = baseSubtotal == null || !usePhilboPodLogo ? 0 : Number((baseSubtotal * 0.05).toFixed(2));
  const subtotal = baseSubtotal == null ? null : Number((baseSubtotal - discountAmount).toFixed(2));
  const orders = readCollection('philbo_pod_orders');
  const createdAt = new Date().toISOString();
  const order = {
    podOrderId: `POD-${String(orders.length + 1001).padStart(4, '0')}`,
    sourceType: 'publisher_standalone',
    sourcePurchaseOrder: null,
    customerId: actor.uid,
    publisherId: actor.uid,
    customerName: actor.companyName,
    customerEmail: actor.publisherEmail || actor.email,
    productType: 'publisher-title-reprint',
    productName: 'Standalone Publisher POD Order',
    projectTitle: title.title,
    titleId: title.titleId,
    philboId: title.philboId || '',
    quantity,
    distributionQuantity: 0,
    publisherExtraQuantity: quantity,
    items: [{ ...line, retailerQuantity: 0, extraCopies: quantity, printQuantity: quantity, lineSubtotal: subtotal }],
    usePhilboPodLogo,
    discountPercentage: usePhilboPodLogo ? 5 : 0,
    discountAmount,
    baseSubtotal,
    subtotal,
    pricingStatus: subtotal == null ? 'Quote Review' : 'Estimate Pending Admin Confirmation',
    proofPreference: orderData.proofPreference || 'Digital proof',
    requestedDeadline: orderData.requestedDeadline || null,
    shippingStatus: 'Publisher Direct Shipment',
    publisherShipToAddress,
    paymentStatus: 'Not Yet Invoiced',
    status: line.filesReady ? 'Submitted for Production Review' : 'On Hold — Print Files Required',
    additionalInformation: String(orderData.additionalInformation || '').trim(),
    submittedAt: createdAt,
    history: [{ date: createdAt, user: actor.email, action: 'Standalone publisher POD order submitted' }]
  };
  orders.push(order);
  writeCollection('philbo_pod_orders', orders);

  const productionOrders = ensureProductionOrders();
  productionOrders.push({
    productionOrderId: `PROD-${String(productionOrders.length + 1).padStart(5, '0')}`,
    linkedPodOrderId: order.podOrderId,
    sourceType: 'publisher_standalone',
    titleId: title.titleId,
    title: title.title,
    philboId: title.philboId || '',
    publisherId: actor.uid,
    publisherName: actor.companyName,
    customerId: actor.uid,
    customerName: actor.companyName,
    customerEmail: actor.publisherEmail || actor.email,
    quantityRequired: quantity,
    retailerQuantity: 0,
    publisherExtraQuantity: quantity,
    publisherShipToAddress,
    orderPlacedAt: createdAt,
    productionDeadline: order.requestedDeadline || title.releaseDate,
    coverFileName: line.coverFileName,
    interiorFileName: line.interiorFileName,
    coverFileStatus: line.coverFileName ? 'Files Received' : 'Files Not Submitted',
    interiorFileStatus: line.interiorFileName ? 'Files Received' : 'Files Not Submitted',
    overallPreflightStatus: line.filesReady ? 'Under Review' : 'Files Not Submitted',
    specifications: { trimSize: line.comicSize, pageCount: line.pageCount, color: title.colorProfile, bleed: title.bleed || '0.125 in' },
    fileVersions: [],
    notes: order.additionalInformation ? [{ date: createdAt, user: actor.email, notes: order.additionalInformation }] : [],
    history: [{ date: createdAt, user: actor.email, action: `Standalone POD order ${order.podOrderId} created` }]
  });
  writeCollection('philbo_production_orders', productionOrders);
  appendAudit({ action: 'Standalone publisher POD order submitted', recordType: 'pod_order', recordId: order.podOrderId, newValue: order, actor });
  return order;
};
db.submitPublisherPodOrder = (poNumber, selections = [], additionalInformation = '', publisherShipToAddress = '') => {
  const actor = db.getCurrentUser();
  if (!actor || !isAccountActive(actor) || normalizeRole(actor.role) !== ROLE_IDS.PUBLISHER) throw new Error('An active publisher account is required.');
  const details = db.getPurchaseOrderPodDetails(poNumber, actor);
  if (!details.eligibleItems.length) throw new Error('This Purchase Order does not contain any titles assigned to Philbo POD.');
  const activeExisting = details.requests.find(order => !['Cancelled', 'Declined'].includes(order.status));
  if (activeExisting) throw new Error(`${activeExisting.podOrderId} is already linked to this Purchase Order.`);

  const selected = selections.filter(selection => selection.selected !== false).map(selection => {
    const eligible = details.eligibleItems.find(item => item.titleId === selection.titleId);
    if (!eligible) throw new Error('A selected title is not eligible for Philbo POD on this Purchase Order.');
    const extraCopies = Math.max(0, Number.parseInt(selection.extraCopies, 10) || 0);
    const printQuantity = eligible.retailerQuantity + extraCopies;
    const lineSubtotal = eligible.unitPrice == null ? null : Number((eligible.unitPrice * printQuantity).toFixed(2));
    return { ...eligible, extraCopies, printQuantity, lineSubtotal };
  });
  if (!selected.length) throw new Error('Select at least one POD title to print.');
  const publisherExtraQuantity = selected.reduce((sum, item) => sum + item.extraCopies, 0);
  const normalizedPublisherShipTo = String(publisherShipToAddress || '').trim();
  if (publisherExtraQuantity > 0 && !normalizedPublisherShipTo) throw new Error('Enter the address where your additional publisher copies should be shipped.');

  const orders = readCollection('philbo_pod_orders');
  const createdAt = new Date().toISOString();
  const allFilesReady = selected.every(item => item.filesReady);
  const estimateComplete = selected.every(item => item.lineSubtotal != null);
  const subtotal = estimateComplete ? Number(selected.reduce((sum, item) => sum + item.lineSubtotal, 0).toFixed(2)) : null;
  const order = {
    podOrderId: `POD-${String(orders.length + 1001).padStart(4, '0')}`,
    sourceType: 'publisher_purchase_order',
    sourcePurchaseOrder: poNumber,
    cycleId: details.purchaseOrder.cycleId,
    customerId: actor.uid,
    publisherId: actor.uid,
    customerName: actor.companyName,
    customerEmail: actor.publisherEmail || actor.email,
    productType: 'publisher-distribution-print-run',
    productName: 'Publisher Distribution Print Run',
    projectTitle: `${details.purchaseOrder.cycleName} distribution printing`,
    quantity: selected.reduce((sum, item) => sum + item.printQuantity, 0),
    distributionQuantity: selected.reduce((sum, item) => sum + item.retailerQuantity, 0),
    publisherExtraQuantity,
    items: selected,
    subtotal,
    pricingStatus: estimateComplete ? 'Estimate Pending Admin Confirmation' : 'Quote Review',
    shippingStatus: 'Philbo Distribution Fulfillment',
    distributionShipTo: 'Philbo Distribution\n27 Barrett Avenue\nBayport, NY 11705',
    publisherShipToAddress: publisherExtraQuantity > 0 ? normalizedPublisherShipTo : '',
    paymentStatus: 'Publisher Settlement Authorization Pending',
    status: allFilesReady ? 'Submitted for Production Review' : 'On Hold — Print Files Required',
    additionalInformation: String(additionalInformation || '').trim(),
    submittedAt: createdAt,
    history: [{ date: createdAt, user: actor.email, action: `POD print request created from ${poNumber}` }]
  };
  orders.push(order);
  writeCollection('philbo_pod_orders', orders);

  const productionOrders = ensureProductionOrders();
  selected.forEach(item => {
    let productionOrder = productionOrders.find(record => record.titleId === item.titleId);
    if (!productionOrder) {
      productionOrder = {
        productionOrderId: `PROD-${String(productionOrders.length + 1).padStart(5, '0')}`,
        titleId: item.titleId,
        title: item.title,
        philboId: item.philboId,
        publisherId: actor.uid,
        publisherName: actor.companyName,
        fileVersions: [],
        notes: [],
        history: []
      };
      productionOrders.push(productionOrder);
    }
    productionOrder.sourcePurchaseOrder = poNumber;
    productionOrder.linkedPodOrderId = order.podOrderId;
    productionOrder.quantityRequired = item.printQuantity;
    productionOrder.retailerQuantity = item.retailerQuantity;
    productionOrder.publisherExtraQuantity = item.extraCopies;
    productionOrder.publisherShipToAddress = item.extraCopies > 0 ? normalizedPublisherShipTo : '';
    productionOrder.productionDeadline = details.purchaseOrder.releaseDate;
    productionOrder.coverFileName = item.coverFileName;
    productionOrder.interiorFileName = item.interiorFileName;
    productionOrder.coverFileStatus = item.coverFileName ? 'Files Received' : 'Files Not Submitted';
    productionOrder.interiorFileStatus = item.interiorFileName ? 'Files Received' : 'Files Not Submitted';
    productionOrder.overallPreflightStatus = item.filesReady ? 'Under Review' : 'Files Not Submitted';
    productionOrder.history = [...(productionOrder.history || []), { date: createdAt, user: actor.email, action: `Production quantity confirmed from ${poNumber}` }];
  });
  writeCollection('philbo_production_orders', productionOrders);
  appendAudit({ action: 'Publisher POD order submitted from Purchase Order', recordType: 'pod_order', recordId: order.podOrderId, newValue: order, notes: poNumber, actor });
  return order;
};
db.getProductionOrders = (requestingUser = db.getCurrentUser()) => {
  if (!requestingUser) throw new Error('Authentication required.');
  const role = normalizeRole(requestingUser.role);
  const orders = ensureProductionOrders();
  if ([ROLE_IDS.MOOS, ROLE_IDS.ADMIN].includes(role)) return orders;
  if (role === ROLE_IDS.PREFLIGHT) {
    const users = readCollection('philbo_users');
    return orders.map(order => {
      const contact = users.find(user => user.uid === order.customerId || user.uid === order.publisherId);
      return {
        productionOrderId: order.productionOrderId,
        titleId: order.titleId,
        title: order.title,
        philboId: order.philboId,
        orderPlacedAt: order.orderPlacedAt || null,
        productionDeadline: order.productionDeadline || null,
        coverFileName: order.coverFileName || '',
        interiorFileName: order.interiorFileName || '',
        coverFileStatus: order.coverFileStatus,
        interiorFileStatus: order.interiorFileStatus,
        overallPreflightStatus: order.overallPreflightStatus,
        specifications: order.specifications || {},
        fileVersions: order.fileVersions || [],
        notes: order.notes || [],
        history: order.history || [],
        customerContact: {
          companyName: contact?.companyName || order.customerName || order.publisherName || 'Not recorded',
          contactName: contact?.primaryContact || contact?.contactName || [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || '',
          email: contact?.publisherEmail || contact?.email || order.customerEmail || '',
          phone: contact?.mobilePhone || contact?.officePhone || contact?.primaryPhone || contact?.phone || ''
        }
      };
    });
  }
  if (role === ROLE_IDS.PUBLISHER) return orders.filter(order => order.publisherId === requestingUser.uid);
  return [];
};
db.updatePreflightReview = (productionOrderId, fileType, status, notes = '') => {
  const actor = requireActor(PERMISSIONS.PREFLIGHT_REVIEW);
  const valid = ['Files Not Submitted','Files Received','Under Review','Changes Required','Replacement Requested','Approved for Production','Ready to Print','On Hold'];
  if (!['cover','interior'].includes(fileType) || !valid.includes(status)) throw new Error('Invalid file review update.');
  const orders = ensureProductionOrders(); const index = orders.findIndex(order => order.productionOrderId === productionOrderId);
  if (index < 0) throw new Error('Production Order not found.');
  const previous = { ...orders[index] }; const field = fileType === 'cover' ? 'coverFileStatus' : 'interiorFileStatus';
  orders[index][field] = status;
  const bothApproved = orders[index].coverFileStatus === 'Approved for Production' && orders[index].interiorFileStatus === 'Approved for Production';
  orders[index].overallPreflightStatus = status === 'On Hold' ? 'On Hold' : bothApproved ? 'Approved for Production' : status;
  const changedAt = new Date().toISOString();
  const actorName = actor.contactName || actor.primaryContact || actor.companyName || actor.email;
  const noteText = String(notes || '').trim() || `${fileType === 'cover' ? 'Cover' : 'Interior'} status changed to ${status}.`;
  orders[index].notes = [...(orders[index].notes || []), {
    noteId: `prodnote_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date: changedAt,
    user: actor.email,
    userName: actorName,
    role: normalizeRole(actor.role),
    type: 'status_change',
    fileType,
    status,
    text: noteText,
    notes: noteText
  }];
  orders[index].history = [...(orders[index].history || []), { date: changedAt, user: actor.email, userName: actorName, role: normalizeRole(actor.role), action: noteText }];
  writeCollection('philbo_production_orders', orders);
  appendAudit({ action: status === 'Approved for Production' ? 'File approved' : status === 'Replacement Requested' ? 'Replacement requested' : status === 'Changes Required' ? 'File rejected' : 'Preflight status changed', recordType: 'production_order', recordId: productionOrderId, previousValue: previous, newValue: orders[index], notes, actor });
  return orders[index];
};
db.addProductionNote = (productionOrderId, note) => {
  const actor = db.getCurrentUser();
  const allowed = actor && isAccountActive(actor) && (hasPermission(actor, PERMISSIONS.PREFLIGHT_REVIEW) || hasPermission(actor, PERMISSIONS.PRODUCTION_MANAGE));
  if (!allowed) throw new Error('Production note access denied.');
  const text = String(note || '').trim();
  if (!text) throw new Error('Write a note before saving.');
  const orders = ensureProductionOrders();
  const index = orders.findIndex(order => order.productionOrderId === productionOrderId);
  if (index < 0) throw new Error('Production Order not found.');
  const createdAt = new Date().toISOString();
  const actorName = actor.contactName || actor.primaryContact || actor.companyName || actor.email;
  const entry = { noteId: `prodnote_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, date: createdAt, user: actor.email, userName: actorName, role: normalizeRole(actor.role), type: 'team_note', text };
  orders[index].notes = [...(orders[index].notes || []), entry];
  orders[index].history = [...(orders[index].history || []), { date: createdAt, user: actor.email, userName: actorName, role: normalizeRole(actor.role), action: `Team note added: ${text}` }];
  writeCollection('philbo_production_orders', orders);
  appendAudit({ action: 'Production team note added', recordType: 'production_order', recordId: productionOrderId, newValue: entry, notes: text, actor });
  return entry;
};
db.markProductionReady = productionOrderId => {
  const actor = requireActor(PERMISSIONS.PREFLIGHT_REVIEW); const orders = ensureProductionOrders(); const index = orders.findIndex(order => order.productionOrderId === productionOrderId);
  if (index < 0) throw new Error('Production Order not found.');
  if (orders[index].coverFileStatus !== 'Approved for Production' || orders[index].interiorFileStatus !== 'Approved for Production') throw new Error('Cover and interior files must both be approved first.');
  const previous = orders[index].overallPreflightStatus;
  const changedAt = new Date().toISOString();
  orders[index].overallPreflightStatus = 'Ready to Print';
  orders[index].history = [...(orders[index].history || []), { date: changedAt, user: actor.email, userName: actor.contactName || actor.primaryContact || actor.companyName || actor.email, role: normalizeRole(actor.role), action: 'Marked Ready to Print.' }];
  writeCollection('philbo_production_orders', orders);
  appendAudit({ action: 'Production file marked ready', recordType: 'production_order', recordId: productionOrderId, previousValue: previous, newValue: 'Ready to Print', actor });
  return orders[index];
};
db.recordFileAccess = (productionOrderId, fileType, action = 'opened') => {
  const actor = requireActor(PERMISSIONS.PREFLIGHT_REVIEW);
  appendAudit({ action: action === 'downloaded' ? 'File downloaded' : 'File opened', recordType: `${fileType}_file`, recordId: productionOrderId, actor });
  return true;
};

const guardMethod = (name, permission, auditAction) => {
  const original = db[name]?.bind(db);
  if (!original) return;
  db[name] = (...args) => {
    const actor = requireActor(permission);
    const result = original(...args);
    const auditValue = ['approveUser', 'createExternalAccountInvitation'].includes(name) && result?.invitation
      ? { ...result, invitation: { ...result.invitation, temporaryPassword: '[REDACTED]' } }
      : result;
    if (auditAction) appendAudit({ action: auditAction, recordType: name, recordId: String(args[0] ?? ''), newValue: auditValue || null, actor });
    return result;
  };
};
guardMethod('updateInventory', PERMISSIONS.INVENTORY_MANAGE, 'Financial record changed');
guardMethod('updateCatalogCycle', PERMISSIONS.CYCLES_MANAGE, 'Catalog Cycle changed');
guardMethod('publishCatalogCycle', PERMISSIONS.CYCLES_MANAGE, 'Retailer Catalog published');
guardMethod('assignTitleCycleManually', PERMISSIONS.CYCLES_MANAGE, 'Title moved between Catalog Cycles');
guardMethod('importCsvTitles', PERMISSIONS.TITLES_MANAGE, 'Data imported');
guardMethod('approveUser', PERMISSIONS.USERS_MANAGE, 'External account approved');
guardMethod('createExternalAccountInvitation', PERMISSIONS.USERS_MANAGE, 'External account invitation created');
guardMethod('approveTitle', PERMISSIONS.TITLES_MANAGE, 'Title approved');
guardMethod('toggleFocLock', PERMISSIONS.CYCLES_MANAGE, 'FOC lock changed');
guardMethod('approveReturn', PERMISSIONS.RETURNS_MANAGE, 'Return approved');
guardMethod('rejectReturn', PERMISSIONS.RETURNS_MANAGE, 'Return rejected');
guardMethod('updateTitleStatus', PERMISSIONS.TITLES_MANAGE, 'Title status changed');
guardMethod('updatePublisherCommission', PERMISSIONS.FINANCIALS_MANAGE, 'Commission formula changed');

const originalSubmitTitle = db.submitTitle.bind(db);
db.submitTitle = (titleData, publisherId, publisherName) => {
  const actor = requireActor(PERMISSIONS.PUBLISHER_SELF);
  if (actor.uid !== publisherId) throw new Error('Publishers may submit titles only for their own account.');
  return originalSubmitTitle(titleData, publisherId, publisherName);
};
const originalEditTitle = db.editTitle.bind(db);
db.editTitle = (titleId, titleData, status, userName) => {
  const actor = db.getCurrentUser(); if (!actor) throw new Error('Authentication required.');
  const currentTitle = readCollection('philbo_titles').find(title => title.titleId === titleId);
  const adminAllowed = hasPermission(actor, PERMISSIONS.TITLES_MANAGE);
  if (!adminAllowed && (!hasPermission(actor, PERMISSIONS.PUBLISHER_SELF) || currentTitle?.publisherId !== actor.uid)) throw new Error('You may edit only titles assigned to your publisher account.');
  const result = originalEditTitle(titleId, titleData, status, adminAllowed ? actor.email : userName);
  appendAudit({ action: 'Title edited', recordType: 'title', recordId: titleId, previousValue: currentTitle, newValue: result, actor });
  return result;
};
const originalPlaceOrder = db.placeOrder.bind(db);
db.placeOrder = (retailerId, ...args) => {
  const actor = requireActor(PERMISSIONS.RETAILER_SELF);
  if (actor.uid !== retailerId) throw new Error('Retailers may place orders only for their own account.');
  return originalPlaceOrder(retailerId, ...args);
};
const originalRequestReturn = db.requestReturn.bind(db);
db.requestReturn = (retailerId, ...args) => {
  const actor = requireActor(PERMISSIONS.RETAILER_SELF);
  if (actor.uid !== retailerId) throw new Error('Retailers may submit returns only for their own account.');
  return originalRequestReturn(retailerId, ...args);
};
const originalGetEligibleReturnItems = db.getEligibleReturnItems.bind(db);
db.getEligibleReturnItems = (retailerId = db.getCurrentUser()?.uid) => {
  const actor = requireActor(PERMISSIONS.RETAILER_SELF);
  if (actor.uid !== retailerId) throw new Error('Retailers may view return eligibility only for their own account.');
  return originalGetEligibleReturnItems(retailerId);
};
const originalGetReturnAllowanceSummary = db.getReturnAllowanceSummary.bind(db);
db.getReturnAllowanceSummary = (retailerId = db.getCurrentUser()?.uid) => {
  const actor = requireActor(PERMISSIONS.RETAILER_SELF);
  if (actor.uid !== retailerId) throw new Error('Retailers may view return allowance only for their own account.');
  return originalGetReturnAllowanceSummary(retailerId);
};
const originalGeneratePurchaseOrders = db.generatePurchaseOrders.bind(db);
db.generatePurchaseOrders = (...args) => {
  const actor = db.getCurrentUser();
  if (!actor || (![ROLE_IDS.MOOS, ROLE_IDS.ADMIN, ROLE_IDS.PUBLISHER].includes(normalizeRole(actor.role)))) throw new Error('Purchase Order access denied.');
  return originalGeneratePurchaseOrders(...args);
};
