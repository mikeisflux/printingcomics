import { isSupabaseConfigured, supabase } from './supabase';
import { formatInvitationMailingAddress, isExternalInvitationUser, missingInvitationProfileFields, normalizeInvitationProfile } from './invitation-profile';

const internalRoles = new Set(['moos', 'admin', 'preflight']);

function requireBackend() {
  if (!isSupabaseConfigured || !supabase) throw new Error('The Philbo backend is not configured for this environment.');
  return supabase;
}

function friendlyAuthError(error) {
  const message = String(error?.message || 'Sign in failed.');
  if (/invalid login credentials/i.test(message)) return new Error('Invalid email or password.');
  if (/email not confirmed/i.test(message)) return new Error('Please use the secure link in your email to finish setting up your account.');
  return new Error(message);
}

export async function loadPortalUser(authUser) {
  if (!authUser) return null;
  const client = requireBackend();
  const [{ data: profile, error: profileError }, { data: roleRows, error: roleError }, { data: membershipRows, error: membershipError }, { data: overrides, error: overridesError }] = await Promise.all([
    client.from('profiles').select('*').eq('user_id', authUser.id).single(),
    client.from('user_roles').select('role,is_active').eq('user_id', authUser.id).eq('is_active', true),
    client.from('organization_memberships').select('organization_id,is_primary_contact,is_active,organizations(id,name,organization_type,account_status)').eq('user_id', authUser.id).eq('is_active', true),
    client.from('permission_overrides').select('permission_code,enabled').eq('user_id', authUser.id)
  ]);
  if (profileError) throw profileError;
  if (roleError) throw roleError;
  if (membershipError) throw membershipError;
  if (overridesError) throw overridesError;
  if (profile.account_status !== 'active') throw new Error('This account is currently on hold. Contact Philbo Distribution for assistance.');

  const roles = (roleRows ?? []).map((row) => row.role);
  if (!roles.length) throw new Error('This account has not been assigned portal access yet.');
  const preferredRole = ['moos', 'admin', 'preflight', 'publisher', 'retailer', 'pod'].find((role) => roles.includes(role));
  const membership = (membershipRows ?? []).find((row) => row.is_primary_contact) ?? membershipRows?.[0];
  const organization = membership?.organizations;
  if (organization && organization.account_status !== 'active') throw new Error('This company account is currently on hold. Contact Philbo Distribution for assistance.');
  let primaryContact = null;
  let mailingAddress = null;
  let retailerProfile = null;
  if (organization?.id) {
    const [{ data: contactRows, error: contactError }, { data: addressRows, error: addressError }, { data: retailerRows, error: retailerError }] = await Promise.all([
      client.from('contacts').select('*').eq('organization_id', organization.id).order('is_primary', { ascending: false }).limit(1),
      client.from('addresses').select('*').eq('organization_id', organization.id).in('address_type', ['shipping', 'mailing']).order('is_primary', { ascending: false }),
      preferredRole === 'retailer'
        ? client.from('retailer_profiles').select('*').eq('organization_id', organization.id).limit(1)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (contactError) throw contactError;
    if (addressError) throw addressError;
    if (retailerError) throw retailerError;
    primaryContact = contactRows?.[0] || null;
    mailingAddress = addressRows?.find(address => address.address_type === 'shipping') || addressRows?.find(address => address.address_type === 'mailing') || null;
    retailerProfile = retailerRows?.[0] || null;
  }
  const isPodClient = preferredRole === 'pod' || organization?.organization_type === 'pod_customer';
  const frontendRole = isPodClient ? 'publisher' : preferredRole;

  return {
    uid: authUser.id,
    email: authUser.email,
    firstName: profile.first_name || '',
    lastName: profile.last_name || '',
    contactName: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || '',
    displayName: profile.display_name || authUser.email,
    companyName: organization?.name || 'Philbo Operations',
    website: organization?.website || '',
    organizationId: organization?.id || null,
    jobTitle: primaryContact?.title || membership?.job_title || '',
    primaryPhone: primaryContact?.mobile_phone || primaryContact?.office_phone || mailingAddress?.phone || '',
    mailingAddress: mailingAddress ? formatInvitationMailingAddress({
      addressLine1: mailingAddress.line_1,
      addressLine2: mailingAddress.line_2,
      city: mailingAddress.city,
      stateProvince: mailingAddress.state_province,
      postalCode: mailingAddress.postal_code,
      country: mailingAddress.country
    }) : '',
    addressLine1: mailingAddress?.line_1 || '',
    addressLine2: mailingAddress?.line_2 || '',
    city: mailingAddress?.city || '',
    stateProvince: mailingAddress?.state_province || '',
    postalCode: mailingAddress?.postal_code || '',
    country: mailingAddress?.country || '',
    shippingName: mailingAddress?.contact_name || '',
    shippingAddress1: mailingAddress?.line_1 || '',
    shippingAddress2: mailingAddress?.line_2 || '',
    shippingCity: mailingAddress?.city || '',
    shippingState: mailingAddress?.state_province || '',
    shippingZip: mailingAddress?.postal_code || '',
    shippingCountry: mailingAddress?.country || '',
    tier: retailerProfile?.tier || undefined,
    discountRate: retailerProfile?.discount_rate == null ? undefined : Number(retailerProfile.discount_rate),
    taxId: retailerProfile?.tax_identifier || '',
    resaleCertificateNumber: retailerProfile?.resale_certificate_number || '',
    resaleCertificateState: retailerProfile?.resale_certificate_state || '',
    resaleCertificateExpiration: retailerProfile?.resale_certificate_expires_on || '',
    resaleCertificateFileName: retailerProfile?.resale_certificate_object_path?.split('/').pop() || '',
    resaleCertificateStatus: retailerProfile?.resale_certificate_status || 'not_submitted',
    taxExempt: Boolean(retailerProfile?.tax_exempt),
    invitationAcceptedAt: profile.invitation_accepted_at || null,
    role: frontendRole,
    backendRole: preferredRole,
    roles: roles.map((role) => role === 'pod' ? 'publisher' : role),
    accountStatus: profile.account_status,
    approved: true,
    isPodClient,
    permissionOverrides: Object.fromEntries((overrides ?? []).map((row) => [row.permission_code, row.enabled])),
    authProvider: 'supabase'
  };
}

export async function restorePortalSession() {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw friendlyAuthError(error);
  return data.session?.user ? loadPortalUser(data.session.user) : null;
}

export async function signInToPortal(email, password, audience = 'customer') {
  const client = requireBackend();
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw friendlyAuthError(error);
  try {
    const portalUser = await loadPortalUser(data.user);
    const actualRole = portalUser.backendRole || portalUser.role;
    const isInternal = internalRoles.has(actualRole);
    if ((audience === 'staff' && !isInternal) || (audience === 'customer' && isInternal)) {
      await client.auth.signOut();
      throw new Error('Invalid email or password.');
    }
    return portalUser;
  } catch (loadError) {
    await client.auth.signOut();
    throw loadError;
  }
}

export async function signOutOfPortal() {
  if (supabase) await supabase.auth.signOut();
}

export async function updateOwnPassword(password) {
  if (String(password).length < 12) throw new Error('Please use at least 12 characters for your new password.');
  const { error } = await requireBackend().auth.updateUser({ password });
  if (error) throw friendlyAuthError(error);
}

export async function completeExternalInvitationProfile(profileInput) {
  const client = requireBackend();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw friendlyAuthError(authError);
  const portalUser = await loadPortalUser(authData.user);
  if (!isExternalInvitationUser(portalUser)) throw new Error('This invitation does not require a customer company profile.');

  const profile = normalizeInvitationProfile(profileInput);
  const missingFields = missingInvitationProfileFields(profile);
  if (missingFields.length) throw new Error(`Complete all required information: ${missingFields.join(', ')}.`);

  const { error: profileError } = await client.from('profiles').update({
    first_name: profile.firstName,
    last_name: profile.lastName,
    display_name: `${profile.firstName} ${profile.lastName}`.trim()
  }).eq('user_id', portalUser.uid);
  if (profileError) throw new Error(profileError.message);

  const { data: existingContacts, error: contactReadError } = await client.from('contacts')
    .select('id').eq('organization_id', portalUser.organizationId).order('is_primary', { ascending: false }).limit(1);
  if (contactReadError) throw new Error(contactReadError.message);
  const contactPayload = {
    organization_id: portalUser.organizationId,
    contact_type: 'primary',
    first_name: profile.firstName,
    last_name: profile.lastName,
    title: profile.jobTitle || null,
    email: portalUser.email,
    mobile_phone: profile.primaryPhone,
    is_primary: true
  };
  const contactWrite = existingContacts?.[0]?.id
    ? client.from('contacts').update(contactPayload).eq('id', existingContacts[0].id)
    : client.from('contacts').insert(contactPayload);
  const { error: contactWriteError } = await contactWrite;
  if (contactWriteError) throw new Error(contactWriteError.message);

  const { data: existingAddresses, error: addressReadError } = await client.from('addresses')
    .select('id').eq('organization_id', portalUser.organizationId).eq('address_type', 'mailing').order('is_primary', { ascending: false }).limit(1);
  if (addressReadError) throw new Error(addressReadError.message);
  const addressPayload = {
    organization_id: portalUser.organizationId,
    address_type: 'mailing',
    contact_name: `${profile.firstName} ${profile.lastName}`.trim(),
    company_name: portalUser.companyName,
    line_1: profile.addressLine1,
    line_2: profile.addressLine2 || null,
    city: profile.city,
    state_province: profile.stateProvince,
    postal_code: profile.postalCode,
    country: profile.country,
    phone: profile.primaryPhone,
    is_primary: true
  };
  const addressWrite = existingAddresses?.[0]?.id
    ? client.from('addresses').update(addressPayload).eq('id', existingAddresses[0].id)
    : client.from('addresses').insert(addressPayload);
  const { error: addressWriteError } = await addressWrite;
  if (addressWriteError) throw new Error(addressWriteError.message);
  return loadPortalUser(authData.user);
}

export async function updateRetailerAccountProfile(profileInput, certificateFile = null) {
  const client = requireBackend();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw friendlyAuthError(authError);
  const portalUser = await loadPortalUser(authData.user);
  if (portalUser.backendRole !== 'retailer' || !portalUser.organizationId) throw new Error('Only retailer accounts can update store information.');

  const required = ['companyName', 'primaryPhone', 'shippingAddress1', 'shippingCity', 'shippingState', 'shippingZip', 'shippingCountry'];
  const missing = required.filter(field => !String(profileInput?.[field] || '').trim());
  if (missing.length) throw new Error('Complete the store name, phone, and full brick-and-mortar address before saving.');
  let website = String(profileInput.website || '').trim();
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;

  const { data: existingContacts, error: contactReadError } = await client.from('contacts')
    .select('id').eq('organization_id', portalUser.organizationId).order('is_primary', { ascending: false }).limit(1);
  if (contactReadError) throw new Error(contactReadError.message);
  const contactNameParts = String(profileInput.contactName || '').trim().split(/\s+/).filter(Boolean);
  const contactPayload = {
    organization_id: portalUser.organizationId,
    contact_type: 'primary',
    first_name: contactNameParts.shift() || portalUser.firstName || 'Store',
    last_name: contactNameParts.join(' ') || portalUser.lastName || 'Contact',
    email: portalUser.email,
    mobile_phone: String(profileInput.primaryPhone || '').trim(),
    is_primary: true
  };
  const contactWrite = existingContacts?.[0]?.id
    ? client.from('contacts').update(contactPayload).eq('id', existingContacts[0].id)
    : client.from('contacts').insert(contactPayload);
  const { error: contactWriteError } = await contactWrite;
  if (contactWriteError) throw new Error(contactWriteError.message);

  const { data: existingAddresses, error: addressReadError } = await client.from('addresses')
    .select('id').eq('organization_id', portalUser.organizationId).eq('address_type', 'shipping').order('is_primary', { ascending: false }).limit(1);
  if (addressReadError) throw new Error(addressReadError.message);
  const addressPayload = {
    organization_id: portalUser.organizationId,
    address_type: 'shipping',
    contact_name: String(profileInput.contactName || portalUser.contactName || '').trim() || null,
    company_name: String(profileInput.companyName || '').trim(),
    line_1: String(profileInput.shippingAddress1 || '').trim(),
    line_2: String(profileInput.shippingAddress2 || '').trim() || null,
    city: String(profileInput.shippingCity || '').trim(),
    state_province: String(profileInput.shippingState || '').trim(),
    postal_code: String(profileInput.shippingZip || '').trim(),
    country: String(profileInput.shippingCountry || '').trim(),
    phone: String(profileInput.primaryPhone || '').trim(),
    is_primary: true
  };
  const addressWrite = existingAddresses?.[0]?.id
    ? client.from('addresses').update(addressPayload).eq('id', existingAddresses[0].id)
    : client.from('addresses').insert(addressPayload);
  const { error: addressWriteError } = await addressWrite;
  if (addressWriteError) throw new Error(addressWriteError.message);

  let certificateObjectPath = null;
  if (certificateFile) {
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(certificateFile.type)) throw new Error('Upload the resale certificate as a PDF, PNG, JPG, or JPEG file.');
    if (certificateFile.size > 20 * 1024 * 1024) throw new Error('The resale certificate must be 20 MB or smaller.');
    const safeName = String(certificateFile.name || 'resale-certificate').replace(/[^a-zA-Z0-9._-]/g, '-');
    certificateObjectPath = `${portalUser.organizationId}/retailer-${Date.now()}-${safeName}`;
    const { error: uploadError } = await client.storage.from('resale-certificates').upload(certificateObjectPath, certificateFile, { upsert: false });
    if (uploadError) throw new Error(uploadError.message);
  }

  const { error: profileError } = await client.rpc('update_my_retailer_profile', {
    p_company_name: String(profileInput.companyName || '').trim(),
    p_website: website || null,
    p_tax_identifier: String(profileInput.taxId || '').trim() || null,
    p_certificate_number: String(profileInput.resaleCertificateNumber || '').trim() || null,
    p_certificate_state: String(profileInput.resaleCertificateState || '').trim() || null,
    p_certificate_expires_on: String(profileInput.resaleCertificateExpiration || '').trim() || null,
    p_certificate_object_path: certificateObjectPath
  });
  if (profileError) throw new Error(profileError.message);
  return loadPortalUser(authData.user);
}

export async function finishInvitationPassword(password) {
  const client = requireBackend();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw friendlyAuthError(authError);
  const portalUser = await loadPortalUser(authData.user);
  if (isExternalInvitationUser(portalUser)) {
    const missingFields = missingInvitationProfileFields(portalUser);
    if (missingFields.length) throw new Error(`Complete all required information before creating a password: ${missingFields.join(', ')}.`);
  }
  await updateOwnPassword(password);
  const { error: acceptedError } = await client.from('profiles').update({ invitation_accepted_at: new Date().toISOString() }).eq('user_id', authData.user.id);
  if (acceptedError) throw new Error(acceptedError.message);
}

export async function sendPasswordReset(email) {
  const { error } = await requireBackend().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/?set_password=1`
  });
  if (error) throw friendlyAuthError(error);
}

export async function submitPortalApplication({ role, email, companyName, firstName, lastName, phone, website, applicationData }) {
  const applicantType = role === 'pod' ? 'pod_customer' : role;
  const { taxId: _taxId, publisherLogoDataUrl: _publisherLogoDataUrl, ...safeApplicationData } = applicationData || {};
  const { error } = await requireBackend().from('portal_applications').insert({
    applicant_type: applicantType,
    email: email.trim().toLowerCase(),
    company_name: companyName.trim(),
    contact_first_name: firstName.trim(),
    contact_last_name: lastName.trim(),
    phone,
    website: website || null,
    application_data: { ...safeApplicationData, taxIdProvided: Boolean(_taxId) }
  });
  if (error) throw new Error(error.message);
}

export async function runAdminAccessAction(payload) {
  const { data, error } = await requireBackend().functions.invoke('admin-user-access', { body: payload });
  if (error) throw new Error(error.message || 'The account action could not be completed.');
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function listInternalStaff() {
  const client = requireBackend();
  const { data: roleRows, error: roleError } = await client.from('user_roles')
    .select('user_id,role,is_active,granted_at').in('role', ['moos', 'admin', 'preflight']);
  if (roleError) throw new Error(roleError.message);
  const userIds = [...new Set((roleRows ?? []).map((row) => row.user_id))];
  if (!userIds.length) return [];
  const { data: profiles, error: profileError } = await client.from('profiles').select('*').in('user_id', userIds);
  if (profileError) throw new Error(profileError.message);
  const profileById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
  return (roleRows ?? []).map((row) => {
    const profile = profileById.get(row.user_id) || {};
    return {
      uid: row.user_id,
      email: profile.email,
      companyName: profile.display_name || profile.email,
      role: row.role,
      accountStatus: profile.account_status,
      approved: profile.account_status === 'active',
      lastLoginAt: null,
      permissionOverrides: {}
    };
  });
}

export async function loadAdminAttentionQueue() {
  const { data, error } = await requireBackend()
    .from('admin_attention_queue')
    .select('attention_key,section,label,record_type,record_id,record_label,detail,severity,created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message || 'The Admin attention queue could not be loaded.');

  const grouped = new Map();
  (data || []).forEach(row => {
    const current = grouped.get(row.attention_key) || {
      key: row.attention_key,
      section: row.section,
      label: row.label,
      count: 0,
      detail: 'unresolved items',
      tone: row.severity === 'critical' ? 'critical' : row.severity === 'pod' ? 'pod' : undefined,
      records: []
    };
    current.count += 1;
    current.records.push(row);
    if (row.severity === 'critical') current.tone = 'critical';
    grouped.set(row.attention_key, current);
  });
  return [...grouped.values()];
}

export async function loadPublishedCatalogTitles() {
  const { data, error } = await requireBackend()
    .from('public_catalog')
    .select('*')
    .order('publisher_name', { ascending: true })
    .order('title', { ascending: true });
  if (error) throw new Error(error.message || 'The published catalog could not be loaded.');
  return (data || []).map(row => ({
    id: row.id,
    titleId: row.id,
    philboId: row.philbo_id,
    barcode: row.barcode,
    title: row.title,
    publisherName: row.publisher_name,
    publisherId: row.publisher_organization_id,
    seriesName: row.series_name,
    issueNumber: row.issue_number,
    variantNumber: row.variant_number,
    coverDescription: row.cover_description,
    incentiveRatio: row.incentive_ratio || '',
    incentiveRules: row.incentive_rules || '',
    language: row.language,
    bookFormat: row.book_format,
    seriesType: row.series_type,
    seriesFrequency: row.series_frequency,
    ageRange: row.age_rating,
    msrp: Number(row.msrp_cents || 0) / 100,
    synopsis: row.brief_synopsis,
    briefSynopsis: row.brief_synopsis,
    description: row.full_description,
    writer: row.writer,
    artist: row.artist,
    coverArtist: row.cover_artist,
    bisac1: row.bisac_1,
    bisac2: row.bisac_2,
    bisac3: row.bisac_3,
    genre: row.genre,
    pageCount: row.page_count,
    colorProfile: row.color_mode,
    width: row.width_inches,
    height: row.height_inches,
    weight: row.weight_ounces,
    reprint: row.is_reprint ? 'Yes' : 'No',
    printingNumber: row.printing_number,
    focDate: row.foc_date,
    releaseDate: row.in_store_date,
    catalogDate: row.catalog_date,
    cycleId: row.catalog_cycle_id,
    catalogCycleName: row.catalog_cycle_name,
    catalogCycleStatus: row.catalog_cycle_status,
    catalogPublicationVersion: row.publication_version,
    catalogPublishedAt: row.catalog_published_at,
    catalogPdfUrl: row.catalog_pdf_url,
    availableForReorder: row.available_for_reorder,
    status: 'Live',
    focLocked: row.catalog_cycle_status === 'foc_locked' || (row.foc_date ? new Date(`${row.foc_date}T23:59:59`) < new Date() : false),
    publishedAt: row.published_at,
    coverUrl: row.cover_url || '',
    publisherLogoUrl: row.publisher_logo_url || '',
    interiorImageUrl: row.interior_image_url || ''
  }));
}

export async function loadRetailerPublisherFollows() {
  const { data, error } = await requireBackend()
    .from('publisher_follows')
    .select('publisher_organization_id');
  if (error) throw new Error(error.message || 'Your followed publishers could not be loaded.');
  return (data || []).map(row => row.publisher_organization_id).filter(Boolean);
}

export async function setRetailerPublisherFollow(publisherOrganizationId, shouldFollow) {
  const client = requireBackend();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData?.user) throw new Error('Please sign in again before updating followed publishers.');
  if (shouldFollow) {
    const { error } = await client.from('publisher_follows').upsert({
      user_id: authData.user.id,
      publisher_organization_id: publisherOrganizationId
    }, { onConflict: 'user_id,publisher_organization_id' });
    if (error) throw new Error(error.message || 'Publisher follow could not be saved.');
  } else {
    const { error } = await client.from('publisher_follows')
      .delete()
      .eq('user_id', authData.user.id)
      .eq('publisher_organization_id', publisherOrganizationId);
    if (error) throw new Error(error.message || 'Publisher follow could not be removed.');
  }
}

const centsToDollars = value => Number(value || 0) / 100;

const trackingUrlFor = (carrier, trackingNumber) => {
  const number = String(trackingNumber || '').trim();
  if (!number) return '';
  const normalizedCarrier = String(carrier || '').trim().toLowerCase();
  if (normalizedCarrier.includes('ups')) return `https://www.ups.com/track?tracknum=${encodeURIComponent(number)}`;
  if (normalizedCarrier.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(number)}`;
  if (normalizedCarrier.includes('usps') || normalizedCarrier.includes('postal')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(number)}`;
  return '';
};

export async function loadRetailerOrders() {
  const { data, error } = await requireBackend()
    .from('sales_orders')
    .select(`
      id,order_number,placed_at,status,payment_status,currency,
      msrp_total_cents,discount_total_cents,subtotal_cents,tax_cents,
      shipping_cents,credit_applied_cents,amount_due_cents,created_at,
      sales_order_items(
        id,title_id,quantity,unit_msrp_cents,discount_rate,
        unit_wholesale_cents,line_total_cents,
        titles(title,variant_number,cover_description,organizations(name))
      ),
      invoices(invoice_number,status,paid_at),
      fulfillments(status,carrier,service_level,tracking_number,shipped_at,delivered_at)
    `)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Your order history could not be loaded.');

  return (data || []).map(row => {
    const invoice = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
    const fulfillments = Array.isArray(row.fulfillments) ? row.fulfillments : [];
    const shipment = [...fulfillments].sort((a, b) =>
      String(b.shipped_at || b.delivered_at || '').localeCompare(String(a.shipped_at || a.delivered_at || ''))
    )[0] || null;
    return {
      id: row.id,
      orderId: row.order_number,
      date: row.placed_at || row.created_at,
      status: row.status,
      paymentStatus: invoice?.status || row.payment_status,
      invoiceNumber: invoice?.invoice_number || '',
      invoicePaidAt: invoice?.paid_at || null,
      currency: row.currency || 'USD',
      msrpTotal: centsToDollars(row.msrp_total_cents),
      discountTotal: centsToDollars(row.discount_total_cents),
      subtotal: centsToDollars(row.subtotal_cents),
      tax: centsToDollars(row.tax_cents),
      shipping: centsToDollars(row.shipping_cents),
      creditApplied: centsToDollars(row.credit_applied_cents),
      netTotal: centsToDollars(row.amount_due_cents),
      items: (row.sales_order_items || []).map(item => ({
        salesOrderItemId: item.id,
        titleId: item.title_id,
        titleName: item.titles?.title || 'Untitled',
        publisherName: item.titles?.organizations?.name || '',
        variantNumber: item.titles?.variant_number || '',
        coverDescription: item.titles?.cover_description || '',
        qty: Number(item.quantity) || 0,
        msrp: centsToDollars(item.unit_msrp_cents),
        wholesalePrice: centsToDollars(item.unit_wholesale_cents),
        lineTotal: centsToDollars(item.line_total_cents),
        discountRate: Number(item.discount_rate) || 0
      })),
      shipmentStatus: shipment?.status || '',
      carrier: shipment?.carrier || '',
      serviceLevel: shipment?.service_level || '',
      trackingNumber: shipment?.tracking_number || '',
      trackingUrl: trackingUrlFor(shipment?.carrier, shipment?.tracking_number),
      shippedAt: shipment?.shipped_at || null,
      deliveredAt: shipment?.delivered_at || null
    };
  });
}

const normalizeReturnStatus = status => ({ requested: 'pending', denied: 'rejected' })[status] || status;

export async function loadRetailerReturnPortal() {
  const { data, error } = await requireBackend().rpc('get_my_return_portal');
  if (error) throw new Error(error.message || 'Your return information could not be loaded.');
  const allowance = data?.allowance || {};
  return {
    allowance: {
      tier: allowance.tier || 'Tier I',
      maximum: Number(allowance.maximum) || 0,
      approved: Number(allowance.approved) || 0,
      pending: Number(allowance.pending) || 0,
      remaining: Number(allowance.remaining) || 0
    },
    creditBalance: Number(data?.creditBalanceCents || 0) / 100,
    returns: (data?.returns || []).map(item => ({
      returnId: item.returnId,
      returnNumber: item.returnNumber,
      orderId: item.orderNumber || item.orderId,
      titleId: item.titleId,
      titleName: item.titleName,
      qty: Number(item.qty) || 0,
      reason: item.reason || '',
      status: normalizeReturnStatus(item.status),
      requestedCredit: Number(item.requestedCreditCents || 0) / 100,
      approvedCredit: Number(item.approvedCreditCents || 0) / 100,
      date: item.date,
      reviewedAt: item.reviewedAt || null
    })),
    eligibleItems: (data?.eligibleItems || []).map(item => ({
      key: item.key,
      salesOrderItemId: item.salesOrderItemId,
      orderId: item.orderNumber || item.orderId,
      orderDate: item.orderDate,
      titleId: item.titleId,
      titleName: item.titleName,
      purchasedQty: Number(item.purchasedQty) || 0,
      alreadyRequested: Number(item.alreadyRequested) || 0,
      availableQty: Number(item.availableQty) || 0,
      unitCredit: Number(item.unitCreditCents || 0) / 100,
      returnable: true
    }))
  };
}

export async function submitRetailerReturn({ salesOrderItemId, quantity, reason }) {
  const { data, error } = await requireBackend().rpc('request_my_return', {
    requested_sales_order_item_id: salesOrderItemId,
    requested_quantity: Number(quantity),
    requested_reason: String(reason || '').trim()
  });
  if (error) throw new Error(error.message || 'The return request could not be submitted.');
  return data;
}

export async function loadAdminReturns() {
  const { data, error } = await requireBackend().rpc('get_admin_returns_dashboard');
  if (error) throw new Error(error.message || 'Return requests could not be loaded.');
  return (data || []).map(item => ({
    returnId: item.returnId,
    returnNumber: item.returnNumber,
    retailerId: item.retailerId,
    retailerName: item.retailerName,
    orderId: item.orderNumber || item.orderId,
    titleId: item.titleId,
    titleName: item.titleName,
    qty: Number(item.qty) || 0,
    reason: item.reason || '',
    status: normalizeReturnStatus(item.status),
    requestedCredit: Number(item.requestedCreditCents || 0) / 100,
    approvedCredit: Number(item.approvedCreditCents || 0) / 100,
    date: item.date,
    reviewedAt: item.reviewedAt || null,
    reviewNotes: item.reviewNotes || ''
  }));
}

export async function reviewAdminReturn(returnId, decision, notes = '') {
  const backendDecision = decision === 'rejected' ? 'denied' : decision;
  const { data, error } = await requireBackend().rpc('review_return_request', {
    requested_return_id: returnId,
    requested_decision: backendDecision,
    requested_notes: String(notes || '').trim() || null
  });
  if (error) throw new Error(error.message || 'The return request could not be reviewed.');
  return data;
}

const mapPublisherTitle = row => ({
  id: row.id,
  titleId: row.id,
  publisherId: row.publisher_organization_id,
  cycleId: row.catalog_cycle_id,
  philboId: row.philbo_id,
  barcode: row.barcode || '',
  title: row.title,
  seriesName: row.series_name || '',
  issueNumber: row.issue_number || '',
  variantNumber: row.variant_number || '',
  coverDescription: row.cover_description || '',
  language: row.language || 'English',
  bookFormat: row.book_format || 'Single Issue',
  seriesType: row.series_type || 'Ongoing',
  seriesCode: row.series_code || '',
  seriesFrequency: row.series_frequency || '',
  ageRange: row.age_rating || '',
  msrp: Number(row.msrp_cents || 0) / 100,
  synopsis: row.brief_synopsis || '',
  description: row.full_description || '',
  writer: row.writer || '',
  artist: row.artist || '',
  coverArtist: row.cover_artist || '',
  bisac1: row.bisac_1 || '',
  bisac2: row.bisac_2 || '',
  bisac3: row.bisac_3 || '',
  pageCount: row.page_count,
  colorProfile: row.color_mode || '',
  width: row.width_inches,
  height: row.height_inches,
  weight: row.weight_ounces == null ? null : Number(row.weight_ounces) / 16,
  reprint: row.is_reprint ? 'Yes' : 'No',
  printingNumber: row.printing_number,
  availableForReorder: row.available_for_reorder ? 'Yes' : 'No',
  trailerLink: row.trailer_url || '',
  fulfillmentMethod: row.fulfillment_method === 'publisher_fulfilled' ? 'Inventory' : 'Philbo POD',
  status: ({
    draft: 'Draft',
    submitted_for_review: 'Submitted for Review',
    changes_requested: 'Changes Requested',
    approved: 'Approved',
    scheduled: 'Scheduled',
    live: 'Live',
    archived: 'Archived'
  })[row.status] || row.status,
  catalogDate: row.catalog_cycles?.catalog_date || '',
  focDate: row.catalog_cycles?.foc_date || '',
  releaseDate: row.catalog_cycles?.in_store_date || '',
  interiorPdfName: row.title_files?.find(file => file.file_type === 'interior_print_pdf')?.original_filename || 'N/A',
  coverArtFileName: row.title_files?.find(file => ['downloadable_cover', 'cover_print_pdf'].includes(file.file_type))?.original_filename || ''
});

export async function loadPublisherCatalogCycles() {
  const { data, error } = await requireBackend()
    .from('catalog_cycles')
    .select('id,name,catalog_date,foc_date,in_store_date,status,publisher_submissions_open')
    .or('publisher_submissions_open.eq.true,status.eq.upcoming')
    .order('catalog_date', { ascending: true });
  if (error) throw new Error(error.message || 'Catalog cycles could not be loaded.');
  return (data || []).map(row => ({
    cycleId: row.id,
    cycleName: row.name,
    catalogDate: row.catalog_date,
    focDate: row.foc_date,
    releaseDate: row.in_store_date,
    status: row.status,
    publisherOpen: row.publisher_submissions_open
  }));
}

export async function loadPublisherTitles(organizationId) {
  if (!organizationId) return [];
  const { data, error } = await requireBackend()
    .from('titles')
    .select('*,catalog_cycles(catalog_date,foc_date,in_store_date),title_files(file_type,original_filename,review_status,version)')
    .eq('publisher_organization_id', organizationId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Publisher titles could not be loaded.');
  return (data || []).map(mapPublisherTitle);
}

const publisherTitlePayload = ({ organizationId, input }) => ({
  publisher_organization_id: organizationId,
  catalog_cycle_id: input.cycleId || null,
  barcode: String(input.barcode || '').replace(/\D/g, '') || null,
  title: String(input.title || '').trim(),
  series_name: input.seriesName || null,
  issue_number: input.issueNumber || null,
  variant_number: input.variantNumber || null,
  cover_description: input.coverDescription || null,
  language: input.language || 'English',
  book_format: input.bookFormat || null,
  series_type: input.seriesType || null,
  series_code: String(input.seriesCode || '').replace(/\s+/g, '').toUpperCase() || null,
  series_frequency: input.seriesFrequency || null,
  age_rating: input.ageRange || null,
  msrp_cents: Math.round(Number(input.msrp || 0) * 100),
  brief_synopsis: input.synopsis || null,
  full_description: input.description || null,
  writer: input.writer || null,
  artist: input.artist || null,
  cover_artist: input.coverArtist || null,
  bisac_1: input.bisac1 || null,
  bisac_2: input.bisac2 || null,
  bisac_3: input.bisac3 || null,
  page_count: Number(input.pageCount) || null,
  color_mode: input.colorProfile || null,
  width_inches: Number(input.width) || null,
  height_inches: Number(input.height) || null,
  weight_ounces: Number(input.weight) > 0 ? Number(input.weight) * 16 : null,
  is_reprint: input.reprint === 'Yes',
  printing_number: Number(input.printingNumber) || null,
  available_for_reorder: input.availableForReorder === 'Yes',
  trailer_url: input.trailerLink || null,
  fulfillment_method: input.fulfillmentMethod === 'Inventory' ? 'publisher_fulfilled' : 'philbo_pod'
});

export async function savePublisherTitle({ titleId = null, organizationId, input, submitForReview = false }) {
  const client = requireBackend();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) throw friendlyAuthError(authError || new Error('Please sign in again.'));
  const payload = publisherTitlePayload({ organizationId, input });
  let saved;
  if (titleId) {
    delete payload.publisher_organization_id;
    const { data, error } = await client.from('titles').update(payload).eq('id', titleId).select('*').single();
    if (error) throw new Error(error.message || 'The title could not be updated.');
    saved = data;
  } else {
    const { data, error } = await client.from('titles').insert({ ...payload, status: 'draft', created_by: authData.user.id }).select('*').single();
    if (error) throw new Error(error.message || 'The title could not be created.');
    saved = data;
  }
  if (submitForReview) {
    const { error } = await client.rpc('submit_my_title_for_review', { requested_title_id: saved.id });
    if (error) throw new Error(error.message || 'The title was saved as a draft but could not be submitted for review.');
  }
  return saved.id;
}

export async function submitPublisherTitleForReview(titleId) {
  const { error } = await requireBackend().rpc('submit_my_title_for_review', { requested_title_id: titleId });
  if (error) throw new Error(error.message || 'The title was saved as a draft but could not be submitted for review.');
}

export async function publishProductionCatalogCycle(catalogCycleId) {
  const { data, error } = await requireBackend().rpc('publish_catalog_cycle', {
    requested_cycle_id: catalogCycleId
  });
  if (error) throw new Error(error.message || 'The catalog could not be published.');
  return data?.[0] || null;
}

export async function startStripeCheckout({ items, applyCredit = false, couponCode = '' }) {
  const client = requireBackend();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (sessionError || !accessToken) throw new Error('Sign in again before checking out.');
  const { data, error } = await client.functions.invoke('create-stripe-checkout', {
    body: { items, applyCredit, couponCode },
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (error) {
    let message = error.message || 'Secure checkout could not be opened.';
    try {
      const details = await error.context?.json();
      if (details?.error) message = details.error;
    } catch {
      // Keep the safe fallback when the function did not return JSON.
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  if (!data?.url || !/^https:\/\/checkout\.stripe\.com\//i.test(data.url)) {
    throw new Error('Stripe returned an invalid checkout address.');
  }
  return data.url;
}
