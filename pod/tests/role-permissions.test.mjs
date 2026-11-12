import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
globalThis.CustomEvent = class CustomEvent { constructor(type) { this.type = type; } };
globalThis.window = { location: { hostname: 'localhost', protocol: 'http:' }, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };

const { db, ROLE_IDS, canAccessSection } = await import('../src/firebase-mock.js');
const { isTitlePublished } = await import('../src/lib/catalog-workflow.js');

const inactiveHistoricalPublisherNames = new Set([
  'Advent Comics',
  'Monarch Comics LLC',
  'Second Sight Publishing',
  'Studio Chikara and First Comics'
]);
const inactiveHistoricalPublishers = JSON.parse(localStorage.getItem('philbo_users'))
  .filter(user => inactiveHistoricalPublisherNames.has(user.companyName));
assert.equal(inactiveHistoricalPublishers.length, 4, 'all former publishers remain represented for historical catalog ownership');
inactiveHistoricalPublishers.forEach(publisher => {
  assert.equal(publisher.accountStatus, 'suspended', `${publisher.companyName} cannot access the Publisher portal`);
  assert.equal(publisher.approved, false, `${publisher.companyName} is not an approved active Publisher`);
  assert.equal(publisher.isInvitationPending, false, `${publisher.companyName} will not receive a portal invitation`);
  assert.equal(publisher.historicalOnly, true, `${publisher.companyName} remains available only for historical records`);
});
const orcaPublisherAccount = JSON.parse(localStorage.getItem('philbo_users'))
  .find(user => user.companyName === 'ORCA Comics / Previously 10 Ton Press');
assert.ok(orcaPublisherAccount, 'the renamed ORCA Publisher account exists');
assert.equal(orcaPublisherAccount.accountStatus, 'active', 'ORCA remains an active Publisher account');
assert.equal(orcaPublisherAccount.approved, true, 'ORCA remains eligible for Publisher access');
assert.equal(orcaPublisherAccount.isInvitationPending, true, 'ORCA can receive its Publisher invitation');

const ownerEmail = 'mauramariepowers@gmail.com';
const ownerPassword = 'owner-test-password';
const loginOwner = () => db.login(ownerEmail, ownerPassword, 'staff');
const owner = db.bootstrapLocalMoos(ownerEmail, ownerPassword);
assert.equal(owner.role, ROLE_IDS.MOOS, 'the preserved owner account migrates to MO.OS');
assert.throws(() => db.bootstrapLocalMoos(ownerEmail, 'another-owner-password'), /already configured/i, 'local owner setup can only be used once');
assert.equal(owner.email, ownerEmail, 'MO.OS ownership is tied to Maura’s authorized email');
assert.throws(() => db.login(ownerEmail, ownerPassword, 'customer'), /invalid email or password/i, 'MO.OS cannot enter through the customer login');
assert.throws(() => db.login('comics@metropolisbooks.com', '', 'staff'), /invalid email or password/i, 'Customer accounts cannot enter through staff login');
assert.throws(() => db.updateInternalStaff(owner.uid, { accountStatus: 'suspended' }), /final active MO\.OS/i);
assert.ok(db.getOrders(owner).every(order => /^SO-/i.test(order.orderId)), 'retailer transactions use Sales Order numbers rather than Publisher PO numbers');
assert.throws(() => db.loginLocalDemo('admin', 'wrong-password'), /incorrect demo password/i, 'each local demo requires its own password');
const localDemoAdmin = db.loginLocalDemo('admin', 'Mo-2026!');
assert.equal(localDemoAdmin.role, ROLE_IDS.ADMIN, 'local Demo Access can open the regular Admin workspace');
assert.equal(db.loginLocalDemo('publisher', 'Demo-pub26!').role, ROLE_IDS.PUBLISHER, 'local Demo Access includes the Publisher workspace');
assert.throws(() => db.loginLocalDemo('moos', 'anything'), /not available/i, 'local Demo Access never includes MO.OS');
const localDemoRetailer = db.loginLocalDemo('retailer', 'Demo-retail26!');
assert.equal(canAccessSection(localDemoRetailer, 'invoices'), false, 'retailers use Past Orders instead of a duplicate Invoices section');
const updatedRetailerProfile = db.updateRetailerProfile(localDemoRetailer.uid, {
  companyName: 'Metropolis Comics & Collectibles',
  contactName: 'Clark Kent',
  primaryPhone: '555-010-1938',
  website: 'metropoliscomics.example',
  shippingAddress1: '321 Daily Planet Way',
  shippingAddress2: 'Suite 10',
  shippingCity: 'Metropolis',
  shippingState: 'IL',
  shippingZip: '62960',
  shippingCountry: 'US',
  taxId: '12-3456789',
  resaleCertificateNumber: 'IL-RETAIL-1001',
  resaleCertificateState: 'IL',
  resaleCertificateExpiration: '2027-12-31',
  resaleCertificateFileName: 'updated-resale-certificate.pdf',
  resaleCertificateFileSize: 2048,
  tier: 'Tier III'
});
assert.equal(updatedRetailerProfile.website, 'https://metropoliscomics.example', 'retailers can update their website from Store Information');
assert.equal(updatedRetailerProfile.resaleCertificateStatus, 'Pending Review', 'a replacement retailer resale certificate returns to review');
assert.equal(updatedRetailerProfile.taxExempt, false, 'uploading a replacement certificate does not grant tax exemption automatically');
assert.equal(updatedRetailerProfile.tier, 'Tier II', 'retailers cannot change their own account tier through Store Information');
assert.throws(() => db.updateRetailerProfile('ret2', { companyName: 'Changed by another store' }), /only edit your own/i, 'retailers cannot edit another retailer account');
window.location.hostname = 'philbo.example';
assert.throws(() => db.loginLocalDemo('retailer', 'Demo-retail26!'), /only in the local prototype or protected beta site/i, 'Demo Access is disabled on a public production domain');
window.location.hostname = 'localhost';
const demoPodCustomer = db.login('podcustomer@philbo.com', '');
assert.equal(demoPodCustomer.isPodClient, true, 'Demo Access includes a dedicated POD customer');
assert.equal(demoPodCustomer.role, ROLE_IDS.PUBLISHER, 'POD customer uses the restricted publisher-based account role');
assert.ok(db.getPodOrders(demoPodCustomer).every(order => order.customerId === demoPodCustomer.uid), 'POD demo sees only its own sample projects');
loginOwner();

const officialCycles = new Map(db.getCatalogCycles().map(cycle => [cycle.cycleId, cycle]));
db.getTitles().filter(title => title.cycleId && officialCycles.has(title.cycleId)).forEach(title => {
  const cycle = officialCycles.get(title.cycleId);
  assert.equal(title.catalogDate, cycle.catalogDate, `${title.title} inherits its catalog release date from its cycle`);
  assert.equal(title.focDate, cycle.focDate, `${title.title} inherits its FOC date from its cycle`);
  assert.equal(title.releaseDate, cycle.releaseDate, `${title.title} inherits its store release date from its cycle`);
});
assert.equal(db.getTitles().find(title => title.titleId === 'title2').focDate, '2026-07-01', 'seed books use the official FOC from their assigned cycle');
const bundledDriveCover = db.getTitles().find(title => title.importedCatalogRecord && title.coverUrl?.includes('drive.google.com'));
assert.ok(bundledDriveCover?.coverUrl.includes('/thumbnail?'), 'Google Drive catalog covers use browser-display thumbnail URLs');
const orcaLegacyTitles = db.getTitles().filter(title => title.publisherName === '10 Ton Press');
assert.ok(orcaLegacyTitles.length > 0, '10 Ton Press history remains attached to its legacy catalog records');
orcaLegacyTitles.forEach(title => {
  assert.equal(title.status, 'Archived', `${title.title} remains historical rather than active`);
  assert.equal(title.historicalOnly, true, `${title.title} is explicitly marked historical-only`);
  assert.equal(title.availableForReorder, 'No', `${title.title} cannot be reordered from the active catalog`);
});

const poCycles = JSON.parse(localStorage.getItem('philbo_catalog_cycles'));
poCycles.push({ cycleId: 'cycle_po_test', cycleName: 'PO Test Catalog Cycle', catalogDate: '2026-07-01', focDate: '2026-09-01', releaseDate: '2026-10-14', status: 'Open for Retailer Ordering', publisherOpen: false, retailerOpen: true, history: [] });
localStorage.setItem('philbo_catalog_cycles', JSON.stringify(poCycles));
const poTitles = JSON.parse(localStorage.getItem('philbo_titles'));
poTitles.push({ titleId: 'title_po_test', publisherId: 'pub1', publisherName: 'Indy Comic Press', title: 'PO Workflow Test', philboId: 'POTEST-00001', barcode: '0000000000001', cycleId: 'cycle_po_test', focDate: '2026-09-01', releaseDate: '2026-10-14', msrp: 5, status: 'Live', podOption: true, pageCount: 32, colorProfile: 'Color', coverArtPdfName: 'po-test-cover.pdf', interiorPdfName: 'po-test-interior.pdf' });
localStorage.setItem('philbo_titles', JSON.stringify(poTitles));
const poOrders = JSON.parse(localStorage.getItem('philbo_orders'));
poOrders.push({ orderId: 'order_po_test', retailerId: 'ret1', paymentStatus: 'paid', date: new Date().toISOString(), items: [{ titleId: 'title_po_test', titleName: 'PO Workflow Test', publisherId: 'pub1', qty: 7, msrp: 5, wholesalePrice: 3 }] });
localStorage.setItem('philbo_orders', JSON.stringify(poOrders));
assert.equal(db.getPurchaseOrders(owner, { cycleId: 'cycle_po_test' }).length, 0, 'an open FOC never creates a Purchase Order');
assert.throws(() => db.finalizePurchaseOrders('cycle_po_test'), /only after.*FOC.*closed/i);
db.updateCatalogCycle('cycle_po_test', { status: 'FOC Locked', publisherOpen: false, retailerOpen: false }, owner.email, 'Test FOC close');
const finalizedPo = db.getPurchaseOrders(owner, { cycleId: 'cycle_po_test' });
assert.equal(finalizedPo.length, 1, 'closing the FOC creates one official Publisher PO');
assert.equal(finalizedPo[0].totalUnits, 7, 'the official PO freezes the sold quantity');
assert.equal(finalizedPo[0].publisherId, 'pub1', 'the PO is assigned to the correct Publisher');
const publisherForPodPo = db.loginLocalDemo('publisher', 'Demo-pub26!');
const podPoDetails = db.getPurchaseOrderPodDetails(finalizedPo[0].poNumber, publisherForPodPo);
assert.equal(podPoDetails.eligibleItems.length, 1, 'Philbo POD titles on the PO are available for linked printing');
assert.equal(podPoDetails.eligibleItems[0].retailerQuantity, 7, 'the POD form locks the official retailer quantity from the PO');
const linkedPodOrder = db.submitPublisherPodOrder(finalizedPo[0].poNumber, [{ titleId: 'title_po_test', selected: true, extraCopies: 3 }], 'Three publisher copies', '123 Publisher Way, Bayport, NY 11705');
assert.equal(linkedPodOrder.quantity, 10, 'publisher extras are added to the locked retailer quantity');
assert.equal(linkedPodOrder.sourcePurchaseOrder, finalizedPo[0].poNumber, 'the print request remains linked to its publisher PO');
assert.equal(linkedPodOrder.publisherExtraQuantity, 3, 'publisher copies are stored separately from distribution quantities');
assert.match(linkedPodOrder.publisherShipToAddress, /123 Publisher Way/, 'publisher extras keep their separate ship-to address');
assert.equal(linkedPodOrder.status, 'Submitted for Production Review', 'complete files move the request into production review');
const linkedProductionOrder = db.getProductionOrders(publisherForPodPo).find(order => order.titleId === 'title_po_test');
assert.equal(linkedProductionOrder.quantityRequired, 10, 'the linked production job receives the confirmed print quantity');
assert.equal(linkedProductionOrder.linkedPodOrderId, linkedPodOrder.podOrderId, 'the production job keeps the POD request reference');
assert.throws(() => db.submitPublisherPodOrder(finalizedPo[0].poNumber, [{ titleId: 'title_po_test', selected: true, extraCopies: 0 }]), /already linked/i, 'a publisher cannot accidentally create a duplicate active POD request for one PO');
loginOwner();

const specialist = db.createInternalStaff({ email: 'preflight.test@philbo.local', companyName: 'Preflight Test', role: 'preflight' });
assert.equal(specialist.role, ROLE_IDS.PREFLIGHT);
const regularAdmin = db.createInternalStaff({ email: 'regular.admin@philbo.local', companyName: 'Regular Admin', role: 'admin' });
const secondAdmin = db.createInternalStaff({ email: 'second.admin@philbo.local', companyName: 'Second Admin', role: 'admin' });
let rawUsers = JSON.parse(localStorage.getItem('philbo_users'));
rawUsers.find(user => user.uid === specialist.uid).passwordHash = 'test-only';
rawUsers.find(user => user.uid === specialist.uid).isInvitationPending = false;
rawUsers.find(user => user.uid === regularAdmin.uid).passwordHash = 'test-only';
rawUsers.find(user => user.uid === regularAdmin.uid).isInvitationPending = false;
rawUsers.find(user => user.uid === secondAdmin.uid).passwordHash = 'test-only';
rawUsers.find(user => user.uid === secondAdmin.uid).isInvitationPending = false;
localStorage.setItem('philbo_users', JSON.stringify(rawUsers));

const specialistSession = db.login('preflight.test@philbo.local', 'test-only');
assert.deepEqual(db.getOrders(specialistSession), [], 'Preflight cannot retrieve retailer orders');
assert.deepEqual(db.getReturns(specialistSession), [], 'Preflight cannot retrieve retailer returns');
assert.deepEqual(db.getPodOrders(specialistSession), [], 'Preflight cannot retrieve raw POD customer orders or quantities');
assert.throws(() => db.generatePurchaseOrders(), /denied/i, 'Preflight cannot retrieve publisher purchase orders');
localStorage.setItem('philbo_production_orders', JSON.stringify([{
  productionOrderId: 'PROD-SECURITY-TEST', titleId: 'security-test-title', title: 'Security Test Book', philboId: 'PHILBO-TEST',
  publisherId: 'pub1', publisherName: 'Indy Comic Press', quantityRequired: 500, orderPlacedAt: '2026-07-24T14:30:00.000Z',
  productionDeadline: '2026-08-15', coverFileName: 'cover.pdf', interiorFileName: 'interior.pdf',
  coverFileStatus: 'Files Received', interiorFileStatus: 'Files Received', overallPreflightStatus: 'Files Received',
  specifications: { trimSize: '6.625 × 10.25' }, retailerId: 'ret1', retailerName: 'Metropolis Comics', wholesalePrice: 2.5
}]));
const specialistJobs = db.getProductionOrders(specialistSession);
const specialistJob = specialistJobs.find(job => job.productionOrderId === 'PROD-SECURITY-TEST');
assert.ok(specialistJob, 'Preflight can retrieve production file jobs');
assert.equal(specialistJob.orderPlacedAt, '2026-07-24T14:30:00.000Z', 'Preflight sees when the related order was placed');
assert.equal(specialistJob.productionDeadline, '2026-08-15', 'Preflight sees the production deadline');
assert.equal(specialistJob.quantityRequired, undefined, 'Preflight never receives production quantities');
assert.equal(specialistJob.retailerId, undefined, 'Preflight never receives retailer identity');
assert.equal(specialistJob.wholesalePrice, undefined, 'Preflight never receives pricing');
assert.equal(specialistJob.customerContact.companyName, 'Indy Comic Press', 'Preflight receives only the contact attached to the file job');
assert.ok(db.getUsers(specialistSession).every(contact => !('shippingAddress' in contact) && !('mailingAddress' in contact)), 'Preflight contacts exclude shipping and mailing details');
const productionNote = db.addProductionNote('PROD-SECURITY-TEST', 'Interior correction received and ready for review.');
assert.equal(productionNote.user, specialistSession.email, 'Preflight notes record the signed-in specialist');
assert.equal(productionNote.role, ROLE_IDS.PREFLIGHT, 'Preflight notes record the specialist role');
assert.ok(db.getProductionOrders(specialistSession).find(job => job.productionOrderId === 'PROD-SECURITY-TEST').notes.some(note => note.noteId === productionNote.noteId), 'Production team notes are visible on the job');
assert.ok(db.getAuditLog(specialistSession).some(item => item.action === 'Production team note added'), 'Preflight note activity is visible in the specialist activity log');

loginOwner();
const followUpNote = db.addOperationalNote({ contextId: 'catalog-reviews', contextLabel: 'Catalog Listings', status: 'Waiting', note: 'Waiting on final creator credits.' });
assert.equal(followUpNote.authorUserId, owner.uid, 'Admin follow-up notes record the signed-in author');
assert.equal(db.getOperationalNotes(owner)[0].noteId, followUpNote.noteId, 'Admin follow-up notes remain available on the dashboard');
db.updateInternalStaff(specialist.uid, { revokeSessions: true });
sessionStorage.setItem('philbo_current_user', JSON.stringify(specialistSession));
assert.equal(db.getCurrentUser(), null, 'revoked sessions stop working immediately');

const regularAdminSession = db.login('regular.admin@philbo.local', 'test-only');
assert.equal(db.updateOperationalNoteStatus(followUpNote.noteId, 'In Progress').updatedByUserId, regularAdminSession.uid, 'Follow-up status changes record the signed-in Admin');
assert.ok(db.getInternalStaff().some(member => member.uid === owner.uid), 'Regular Admin can open Team Access while MO.OS remains visible and protected');
const adminCreatedPreflight = db.createInternalStaff({ email: 'admin.invited.preflight@philbo.local', companyName: 'Admin Invited Preflight', role: 'preflight' });
assert.equal(adminCreatedPreflight.role, ROLE_IDS.PREFLIGHT, 'Regular Admin can invite a Print Production / Preflight team member');
assert.throws(() => db.createInternalStaff({ email: 'forbidden.admin@philbo.local', companyName: 'Forbidden Admin', role: 'admin' }), /Only MO\.OS may create another Admin/i);
assert.throws(() => db.updateInternalStaff(owner.uid, { accountStatus: 'suspended' }), /never.*MO\.OS/i, 'Regular Admin cannot suspend the MO.OS owner');
assert.throws(() => db.updateInternalStaff(secondAdmin.uid, { accountStatus: 'suspended' }), /Only MO\.OS may manage another Admin/i, 'Regular Admin cannot suspend another Admin');
assert.equal(db.updateInternalStaff(adminCreatedPreflight.uid, { accountStatus: 'suspended' }).accountStatus, 'suspended', 'Regular Admin can manage Print Production team access');

const publisher = db.login('creator@indycomics.com', '');
assert.ok(db.getTitles().every(title => title.publisherId === publisher.uid), 'Publisher retrieves only its own titles');
assert.ok(db.getUsers().every(user => user.uid === publisher.uid), 'Publisher retrieves only its own account');
assert.equal(db.getPublisherLiveSales(publisher).find(item => item.titleId === 'title_po_test').quantity, 7, 'Publisher live sales remain visible independently of PO creation');
assert.ok(db.getPurchaseOrders(publisher).every(po => po.publisherId === publisher.uid && po.status === 'Official'), 'Publisher sees only its own official Purchase Orders');
assert.throws(() => db.changeOwnPassword('', 'too-short'), /at least 12 characters/i, 'Publisher passwords enforce the minimum length');
db.changeOwnPassword('', 'publisher-test-password');
assert.equal(db.getCurrentUser(), null, 'Changing a password revokes the current session');
assert.throws(() => db.login('creator@indycomics.com', ''), /invalid email or password/i, 'The old publisher password stops working');
db.login('creator@indycomics.com', 'publisher-test-password');

const retailer = db.login('comics@metropolisbooks.com', '');
assert.ok(db.getOrders().every(order => order.retailerId === retailer.uid), 'Retailer retrieves only its own orders');
assert.ok(db.getReturns().every(item => item.retailerId === retailer.uid), 'Retailer retrieves only its own returns');
assert.equal(canAccessSection(retailer, 'pull-list'), false, 'Retailer no longer has a separate My Order List workspace');
assert.equal(canAccessSection(retailer, 'retailer-catalog'), true, 'Retailer keeps Order Books access for catalog and Fast Entry ordering');
assert.ok(db.getPublicTitles().every(title => isTitlePublished(title.status)), 'Public catalog contains only approved/published title states');

loginOwner();
db.importCsvTitles([{
  Publisher: 'Indy Comic Press',
  Title: 'CSV Cover Round Trip Test',
  'Barcode / UPC / EAN': '0000000000999',
  'Series Code': 'CSVCOVER',
  Price: '$4.99',
  FOC: '2026-09-01',
  'Downloadable Cover Image URL': 'https://drive.google.com/file/d/test-cover-file-id/view?usp=sharing'
}], owner.email);
const csvCoverTitle = db.getTitles().find(title => title.barcode === '0000000000999');
assert.equal(csvCoverTitle.coverUrl, 'https://drive.google.com/thumbnail?id=test-cover-file-id&sz=w1200', 'CSV export cover column round-trips to a displayable Google Drive thumbnail');
const pendingPublisher = db.register('complete.publisher@philbo.local', 'Complete Publisher', 'publisher', {
  firstName: 'Complete', lastName: 'Contact', phone: '+1 555-0100', website: 'https://example.com', subscribeNews: true,
  publisherLogoFileName: 'publisher-logo.png', publisherLogoSize: '0.1MB', publisherLogoType: 'image/png', publisherLogoDataUrl: 'data:image/png;base64,dGVzdA==',
  coverLetterFileName: 'cover-letter.pdf', coverLetterSize: '0.2MB', bookPdfFileName: 'sample.pdf', bookPdfSize: '4.0MB',
  scheduleFileName: 'schedule.pdf', scheduleSize: '0.3MB', marketingPlanFileName: 'marketing.pdf', marketingPlanSize: '0.4MB',
  companyInfoText: 'Complete application record', storageUplink: 'Google Drive Cloud Storage'
});
const storedPublisherApplication = db.getUsers().find(user => user.uid === pendingPublisher.uid);
assert.equal(storedPublisherApplication.publisherLogoFileName, 'publisher-logo.png', 'Publisher logo metadata is preserved for approval review');
assert.equal(storedPublisherApplication.firstName, 'Complete', 'Publisher contact information is preserved for approval review');
assert.ok(storedPublisherApplication.createdAt, 'Publisher application submission time is recorded');
const retailerApplication = db.register('invited.retailer@philbo.local', 'Invited Retailer', 'retailer');
const approvalResult = db.approveUser(retailerApplication.uid, { tier: 'Tier I' });
assert.equal(approvalResult.invitation.email, 'invited.retailer@philbo.local', 'approval produces a retailer invitation for the correct email');
assert.ok(approvalResult.invitation.temporaryPassword.length >= 12, 'approval produces a secure one-time password');
const invitedRetailer = db.login(approvalResult.invitation.email, approvalResult.invitation.temporaryPassword);
assert.equal(invitedRetailer.isInvitationPending, true, 'the one-time password enters first-login password setup');
assert.throws(() => db.setPassword(invitedRetailer.uid, 'too-short'), /at least 12/i, 'first-login passwords enforce the minimum length');
assert.throws(() => db.setPassword(invitedRetailer.uid, 'retailer-secure-password'), /complete the required account information/i, 'an invited customer cannot create a password before completing required contact and mailing information');
const completedRetailerProfile = db.completeInvitationProfile(invitedRetailer.uid, {
  firstName: 'Retail',
  lastName: 'Buyer',
  jobTitle: 'Owner',
  primaryPhone: '555-010-2026',
  addressLine1: '100 Comic Shop Way',
  addressLine2: 'Suite 2',
  city: 'Columbus',
  stateProvince: 'OH',
  postalCode: '43215',
  country: 'United States'
});
assert.equal(completedRetailerProfile.primaryPhone, '555-010-2026', 'the required phone number is retained on the invited account');
assert.match(completedRetailerProfile.mailingAddress, /100 Comic Shop Way/, 'the required mailing address is retained on the invited account');
db.setPassword(invitedRetailer.uid, 'retailer-secure-password');
assert.equal(db.login(approvalResult.invitation.email, 'retailer-secure-password').uid, retailerApplication.uid, 'the retailer can log in with the password they created');
loginOwner();
const regeneratedInvitation = db.createExternalAccountInvitation(retailerApplication.uid);
assert.equal(regeneratedInvitation.invitation.email, approvalResult.invitation.email, 'an administrator can regenerate a pending retailer password email');
assert.notEqual(regeneratedInvitation.invitation.temporaryPassword, approvalResult.invitation.temporaryPassword, 'a regenerated invitation receives a new one-time password');
assert.equal(db.login(regeneratedInvitation.invitation.email, regeneratedInvitation.invitation.temporaryPassword).isInvitationPending, true, 'the regenerated one-time password opens password setup');
loginOwner();
db.updateExternalAccountStatus(retailerApplication.uid, 'suspended', 'Account hold test');
sessionStorage.setItem('philbo_current_user', JSON.stringify(invitedRetailer));
assert.equal(db.getCurrentUser(), null, 'placing an external account on hold ends its existing sessions immediately');
assert.throws(() => db.login(regeneratedInvitation.invitation.email, regeneratedInvitation.invitation.temporaryPassword), /on hold/i, 'an account on hold cannot sign in');
loginOwner();
db.updateExternalAccountStatus(retailerApplication.uid, 'active', 'Account reactivation test');
assert.equal(db.login(regeneratedInvitation.invitation.email, regeneratedInvitation.invitation.temporaryPassword).uid, retailerApplication.uid, 'a reactivated account can sign in again');
loginOwner();
db.updateExternalAccountStatus(retailerApplication.uid, 'revoked', 'Account archive test');
assert.throws(() => db.login(regeneratedInvitation.invitation.email, regeneratedInvitation.invitation.temporaryPassword), /archived/i, 'an archived account cannot sign in');
loginOwner();
const podApplication = db.register('pod.customer@philbo.local', 'POD Customer Test', 'pod', {
  firstName: 'POD', lastName: 'Customer', customerType: 'Creator', expectedQuantity: '50–100 copies',
  shippingAddress1: '100 Print Way', shippingCity: 'Richmond', shippingState: 'VA', shippingZip: '23219'
});
const podApproval = db.approveUser(podApplication.uid, { podProjectAccess: true });
assert.equal(podApproval.user.isPodClient, true, 'POD approval preserves the POD account type');
assert.equal(podApproval.invitation.isPodClient, true, 'POD approval creates a POD-labeled password invitation');
assert.equal(db.login(podApproval.invitation.email, podApproval.invitation.temporaryPassword).isPodClient, true, 'an approved POD customer can enter POD password setup');
const pendingPodCertificate = db.updatePodProfile({ resaleCertificateNumber: 'VA-12345', resaleCertificateState: 'VA', resaleCertificateExpiration: '2027-12-31', resaleCertificateFileName: 'pod-resale-certificate.pdf', resaleCertificateFileSize: 24000 });
assert.equal(pendingPodCertificate.resaleCertificateStatus, 'Pending Review', 'POD resale certificate submissions wait for admin review');
assert.equal(pendingPodCertificate.taxExempt, false, 'POD certificate submissions do not automatically remove tax');
const selfCoverOrder = db.submitPodOrder({ productType: 'self-cover-comics', productName: 'Comic Books', projectTitle: 'POD Price Test', quantity: 100, pageCount: 24, interiorColor: 'color', interiorPaper: '60# Lynx Super Smooth Text' });
assert.equal(selfCoverOrder.unitPrice, 2.60, 'Comic Books use the current public 24-page color unit price');
assert.equal(selfCoverOrder.subtotal, 260, 'Comic Books multiply the public unit price by quantity');
assert.equal(selfCoverOrder.comicSize, '6.625" x 10.25"', 'comic POD orders are locked to the current standard size');
assert.equal(selfCoverOrder.interiorPaper, '60# Lynx Super Smooth Text', 'comic interiors preserve the approved paper selection');
assert.equal(selfCoverOrder.coverType, '70# Gloss Cover', 'comic books use the approved default cover stock');
const discountedPodOrder = db.submitPodOrder({ productType: 'self-cover-comics', productName: 'Comic Books', projectTitle: 'POD Logo Discount Test', quantity: 100, pageCount: 24, interiorColor: 'color', interiorPaper: '60# Lynx Super Smooth Text', coverType: '80# Super Smooth Sketch Cover', usePhilboPodLogo: true });
assert.equal(discountedPodOrder.baseSubtotal, 260, 'POD logo discounts preserve the original printing subtotal');
assert.equal(discountedPodOrder.discountPercentage, 5, 'POD logo orders record the five percent discount');
assert.equal(discountedPodOrder.discountAmount, 13, 'POD logo orders calculate the correct savings');
assert.equal(discountedPodOrder.subtotal, 247, 'POD logo orders reduce the printing subtotal by five percent');
assert.equal(discountedPodOrder.interiorPaper, '60# Lynx Super Smooth Text', 'comic books use the approved Lynx interior stock');
assert.equal(discountedPodOrder.coverType, '80# Super Smooth Sketch Cover', 'comic books support the additional sketch-cover stock');
assert.throws(() => db.submitPodOrder({ productType: 'heavy-comic-covers', productName: 'Heavy Comic Covers', projectTitle: 'Unlisted Product Test', quantity: 50, requestedSpecifications: 'Quote request' }), /available POD product/i, 'products not listed on the public price sheet cannot be submitted');
assert.throws(() => db.submitPodOrder({ productType: 'art-prints', productName: 'Art Prints', projectTitle: 'Art Print Quote Test', quantity: 25, requestedSpecifications: '11 x 17 print request' }), /available POD product/i, 'Coming Soon Art Prints cannot be submitted before launch');
assert.ok(db.getPodOrders().every(order => order.customerId === podApplication.uid), 'POD customers retrieve only their own order records');
loginOwner();
const approvedPodCertificate = db.reviewPodResaleCertificate(podApplication.uid, 'approved');
assert.equal(approvedPodCertificate.resaleCertificateStatus, 'Approved', 'admins can approve POD resale certificates');
assert.equal(approvedPodCertificate.taxExempt, true, 'approved POD resale certificates mark the account tax-exempt');
const audit = db.getAuditLog();
assert.ok(audit.some(item => item.action === 'Internal account created'));
assert.ok(audit.some(item => item.action === 'Session revoked'));
assert.ok(audit.some(item => item.action === 'External account placed on hold'));
assert.ok(audit.some(item => item.action === 'External account archived'));

console.log('Role and permission tests passed.');
