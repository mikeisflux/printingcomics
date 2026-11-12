export const REQUIRED_INVITATION_PROFILE_FIELDS = Object.freeze([
  { key: 'firstName', label: 'first name' },
  { key: 'lastName', label: 'last name' },
  { key: 'primaryPhone', label: 'phone number' },
  { key: 'addressLine1', label: 'street address' },
  { key: 'city', label: 'city' },
  { key: 'stateProvince', label: 'state or province' },
  { key: 'postalCode', label: 'ZIP or postal code' },
  { key: 'country', label: 'country' }
]);

const clean = value => String(value ?? '').trim();

export const isExternalInvitationUser = user => {
  const role = clean(user?.backendRole || user?.role).toLowerCase();
  return ['publisher', 'retailer', 'pod'].includes(role) || Boolean(user?.isPodClient);
};

export const buildInvitationProfile = (user = {}) => ({
  firstName: clean(user.firstName),
  lastName: clean(user.lastName),
  jobTitle: clean(user.jobTitle),
  primaryPhone: clean(user.primaryPhone || user.phone),
  addressLine1: clean(user.addressLine1 || user.shippingAddress1 || user.mailingAddress),
  addressLine2: clean(user.addressLine2 || user.shippingAddress2),
  city: clean(user.city || user.shippingCity),
  stateProvince: clean(user.stateProvince || user.shippingState),
  postalCode: clean(user.postalCode || user.shippingZip),
  country: clean(user.country || user.shippingCountry) || 'United States'
});

export const normalizeInvitationProfile = profile => Object.fromEntries(
  Object.entries(buildInvitationProfile(profile)).map(([key, value]) => [key, clean(value)])
);

export const missingInvitationProfileFields = profile => {
  const normalized = normalizeInvitationProfile(profile);
  return REQUIRED_INVITATION_PROFILE_FIELDS
    .filter(field => !normalized[field.key])
    .map(field => field.label);
};

export const isInvitationProfileComplete = profile => missingInvitationProfileFields(profile).length === 0;

export const formatInvitationMailingAddress = profile => {
  const normalized = normalizeInvitationProfile(profile);
  return [
    normalized.addressLine1,
    normalized.addressLine2,
    [normalized.city, normalized.stateProvince, normalized.postalCode].filter(Boolean).join(', '),
    normalized.country
  ].filter(Boolean).join('\n');
};
