/**
 * Addresses as the storefront handles them: the countries we ship to, the
 * states and provinces a select can offer, postal-code shapes, the US ZIP →
 * state table (mirrors server/src/lib/postal.ts — keep in step), and the
 * checks a form runs before letting the customer pay.
 */

export interface Address {
  firstName: string; lastName: string; company?: string; line1: string; line2?: string;
  city: string; region: string; postalCode: string; country: string; phone?: string;
}

export const emptyAddress: Address = {
  firstName: '', lastName: '', company: '', line1: '', line2: '', city: '', region: '', postalCode: '', country: 'US', phone: '',
};

/** ISO 3166-1 alpha-2, US first then the rest alphabetically. */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'US', name: 'United States' }, { code: 'CA', name: 'Canada' }, { code: 'GB', name: 'United Kingdom' }, { code: 'AU', name: 'Australia' },
  { code: 'AF', name: 'Afghanistan' }, { code: 'AL', name: 'Albania' }, { code: 'DZ', name: 'Algeria' }, { code: 'AD', name: 'Andorra' }, { code: 'AO', name: 'Angola' },
  { code: 'AG', name: 'Antigua and Barbuda' }, { code: 'AR', name: 'Argentina' }, { code: 'AM', name: 'Armenia' }, { code: 'AT', name: 'Austria' }, { code: 'AZ', name: 'Azerbaijan' },
  { code: 'BS', name: 'Bahamas' }, { code: 'BH', name: 'Bahrain' }, { code: 'BD', name: 'Bangladesh' }, { code: 'BB', name: 'Barbados' }, { code: 'BY', name: 'Belarus' },
  { code: 'BE', name: 'Belgium' }, { code: 'BZ', name: 'Belize' }, { code: 'BJ', name: 'Benin' }, { code: 'BM', name: 'Bermuda' }, { code: 'BT', name: 'Bhutan' },
  { code: 'BO', name: 'Bolivia' }, { code: 'BA', name: 'Bosnia and Herzegovina' }, { code: 'BW', name: 'Botswana' }, { code: 'BR', name: 'Brazil' }, { code: 'BN', name: 'Brunei' },
  { code: 'BG', name: 'Bulgaria' }, { code: 'BF', name: 'Burkina Faso' }, { code: 'BI', name: 'Burundi' }, { code: 'KH', name: 'Cambodia' }, { code: 'CM', name: 'Cameroon' },
  { code: 'CV', name: 'Cape Verde' }, { code: 'KY', name: 'Cayman Islands' }, { code: 'CF', name: 'Central African Republic' }, { code: 'TD', name: 'Chad' }, { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' }, { code: 'CO', name: 'Colombia' }, { code: 'KM', name: 'Comoros' }, { code: 'CG', name: 'Congo' }, { code: 'CD', name: 'Congo (DRC)' },
  { code: 'CR', name: 'Costa Rica' }, { code: 'CI', name: "Côte d'Ivoire" }, { code: 'HR', name: 'Croatia' }, { code: 'CY', name: 'Cyprus' }, { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' }, { code: 'DJ', name: 'Djibouti' }, { code: 'DM', name: 'Dominica' }, { code: 'DO', name: 'Dominican Republic' }, { code: 'EC', name: 'Ecuador' },
  { code: 'EG', name: 'Egypt' }, { code: 'SV', name: 'El Salvador' }, { code: 'GQ', name: 'Equatorial Guinea' }, { code: 'ER', name: 'Eritrea' }, { code: 'EE', name: 'Estonia' },
  { code: 'SZ', name: 'Eswatini' }, { code: 'ET', name: 'Ethiopia' }, { code: 'FJ', name: 'Fiji' }, { code: 'FI', name: 'Finland' }, { code: 'FR', name: 'France' },
  { code: 'GA', name: 'Gabon' }, { code: 'GM', name: 'Gambia' }, { code: 'GE', name: 'Georgia' }, { code: 'DE', name: 'Germany' }, { code: 'GH', name: 'Ghana' },
  { code: 'GI', name: 'Gibraltar' }, { code: 'GR', name: 'Greece' }, { code: 'GL', name: 'Greenland' }, { code: 'GD', name: 'Grenada' }, { code: 'GU', name: 'Guam' },
  { code: 'GT', name: 'Guatemala' }, { code: 'GN', name: 'Guinea' }, { code: 'GW', name: 'Guinea-Bissau' }, { code: 'GY', name: 'Guyana' }, { code: 'HT', name: 'Haiti' },
  { code: 'HN', name: 'Honduras' }, { code: 'HK', name: 'Hong Kong' }, { code: 'HU', name: 'Hungary' }, { code: 'IS', name: 'Iceland' }, { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' }, { code: 'IQ', name: 'Iraq' }, { code: 'IE', name: 'Ireland' }, { code: 'IL', name: 'Israel' }, { code: 'IT', name: 'Italy' },
  { code: 'JM', name: 'Jamaica' }, { code: 'JP', name: 'Japan' }, { code: 'JO', name: 'Jordan' }, { code: 'KZ', name: 'Kazakhstan' }, { code: 'KE', name: 'Kenya' },
  { code: 'KI', name: 'Kiribati' }, { code: 'KR', name: 'Korea, South' }, { code: 'KW', name: 'Kuwait' }, { code: 'KG', name: 'Kyrgyzstan' }, { code: 'LA', name: 'Laos' },
  { code: 'LV', name: 'Latvia' }, { code: 'LB', name: 'Lebanon' }, { code: 'LS', name: 'Lesotho' }, { code: 'LR', name: 'Liberia' }, { code: 'LY', name: 'Libya' },
  { code: 'LI', name: 'Liechtenstein' }, { code: 'LT', name: 'Lithuania' }, { code: 'LU', name: 'Luxembourg' }, { code: 'MO', name: 'Macao' }, { code: 'MG', name: 'Madagascar' },
  { code: 'MW', name: 'Malawi' }, { code: 'MY', name: 'Malaysia' }, { code: 'MV', name: 'Maldives' }, { code: 'ML', name: 'Mali' }, { code: 'MT', name: 'Malta' },
  { code: 'MH', name: 'Marshall Islands' }, { code: 'MR', name: 'Mauritania' }, { code: 'MU', name: 'Mauritius' }, { code: 'MX', name: 'Mexico' }, { code: 'FM', name: 'Micronesia' },
  { code: 'MD', name: 'Moldova' }, { code: 'MC', name: 'Monaco' }, { code: 'MN', name: 'Mongolia' }, { code: 'ME', name: 'Montenegro' }, { code: 'MA', name: 'Morocco' },
  { code: 'MZ', name: 'Mozambique' }, { code: 'MM', name: 'Myanmar' }, { code: 'NA', name: 'Namibia' }, { code: 'NR', name: 'Nauru' }, { code: 'NP', name: 'Nepal' },
  { code: 'NL', name: 'Netherlands' }, { code: 'NZ', name: 'New Zealand' }, { code: 'NI', name: 'Nicaragua' }, { code: 'NE', name: 'Niger' }, { code: 'NG', name: 'Nigeria' },
  { code: 'MK', name: 'North Macedonia' }, { code: 'NO', name: 'Norway' }, { code: 'OM', name: 'Oman' }, { code: 'PK', name: 'Pakistan' }, { code: 'PW', name: 'Palau' },
  { code: 'PA', name: 'Panama' }, { code: 'PG', name: 'Papua New Guinea' }, { code: 'PY', name: 'Paraguay' }, { code: 'PE', name: 'Peru' }, { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' }, { code: 'PT', name: 'Portugal' }, { code: 'PR', name: 'Puerto Rico' }, { code: 'QA', name: 'Qatar' }, { code: 'RO', name: 'Romania' },
  { code: 'RW', name: 'Rwanda' }, { code: 'KN', name: 'Saint Kitts and Nevis' }, { code: 'LC', name: 'Saint Lucia' }, { code: 'VC', name: 'Saint Vincent and the Grenadines' },
  { code: 'WS', name: 'Samoa' }, { code: 'SM', name: 'San Marino' }, { code: 'ST', name: 'São Tomé and Príncipe' }, { code: 'SA', name: 'Saudi Arabia' }, { code: 'SN', name: 'Senegal' },
  { code: 'RS', name: 'Serbia' }, { code: 'SC', name: 'Seychelles' }, { code: 'SL', name: 'Sierra Leone' }, { code: 'SG', name: 'Singapore' }, { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' }, { code: 'SB', name: 'Solomon Islands' }, { code: 'ZA', name: 'South Africa' }, { code: 'ES', name: 'Spain' }, { code: 'LK', name: 'Sri Lanka' },
  { code: 'SR', name: 'Suriname' }, { code: 'SE', name: 'Sweden' }, { code: 'CH', name: 'Switzerland' }, { code: 'TW', name: 'Taiwan' }, { code: 'TJ', name: 'Tajikistan' },
  { code: 'TZ', name: 'Tanzania' }, { code: 'TH', name: 'Thailand' }, { code: 'TL', name: 'Timor-Leste' }, { code: 'TG', name: 'Togo' }, { code: 'TO', name: 'Tonga' },
  { code: 'TT', name: 'Trinidad and Tobago' }, { code: 'TN', name: 'Tunisia' }, { code: 'TR', name: 'Türkiye' }, { code: 'TM', name: 'Turkmenistan' }, { code: 'UG', name: 'Uganda' },
  { code: 'UA', name: 'Ukraine' }, { code: 'AE', name: 'United Arab Emirates' }, { code: 'UY', name: 'Uruguay' }, { code: 'UZ', name: 'Uzbekistan' }, { code: 'VU', name: 'Vanuatu' },
  { code: 'VE', name: 'Venezuela' }, { code: 'VN', name: 'Vietnam' }, { code: 'VI', name: 'U.S. Virgin Islands' }, { code: 'ZM', name: 'Zambia' }, { code: 'ZW', name: 'Zimbabwe' },
];

export const US_STATES: { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' }, { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' }, { code: 'PR', name: 'Puerto Rico' }, { code: 'GU', name: 'Guam' }, { code: 'VI', name: 'U.S. Virgin Islands' },
  { code: 'AA', name: 'Armed Forces Americas' }, { code: 'AE', name: 'Armed Forces Europe' }, { code: 'AP', name: 'Armed Forces Pacific' },
];

export const CA_PROVINCES: { code: string; name: string }[] = [
  { code: 'AB', name: 'Alberta' }, { code: 'BC', name: 'British Columbia' }, { code: 'MB', name: 'Manitoba' }, { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' }, { code: 'NS', name: 'Nova Scotia' }, { code: 'NT', name: 'Northwest Territories' }, { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' }, { code: 'PE', name: 'Prince Edward Island' }, { code: 'QC', name: 'Quebec' }, { code: 'SK', name: 'Saskatchewan' }, { code: 'YT', name: 'Yukon' },
];

/** The regions a country's address form offers as a list, or null for a free-text region. */
export function regionsFor(country: string): { code: string; name: string }[] | null {
  if (country === 'US') return US_STATES;
  if (country === 'CA') return CA_PROVINCES;
  return null;
}

/** What the postal-code field is called and how it is typed, by country. */
export function postalFieldFor(country: string): { label: string; placeholder: string; numeric: boolean } {
  switch (country) {
    case 'US': return { label: 'ZIP code', placeholder: '12345', numeric: true };
    case 'CA': return { label: 'Postal code', placeholder: 'A1A 1A1', numeric: false };
    case 'GB': return { label: 'Postcode', placeholder: 'SW1A 1AA', numeric: false };
    case 'IE': return { label: 'Eircode', placeholder: 'D02 X285', numeric: false };
    default: return { label: 'Postal code', placeholder: '', numeric: false };
  }
}

export function regionLabelFor(country: string): string {
  if (country === 'US') return 'State';
  if (country === 'CA') return 'Province';
  if (country === 'GB') return 'County';
  return 'State / region';
}

const POSTAL_FORMATS: Record<string, RegExp> = {
  US: /^\d{5}(-?\d{4})?$/,
  CA: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
  GB: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/,
  AU: /^\d{4}$/, NZ: /^\d{4}$/,
  DE: /^\d{5}$/, FR: /^\d{5}$/, IT: /^\d{5}$/, ES: /^\d{5}$/, MX: /^\d{5}$/,
  NL: /^\d{4}\s?[A-Za-z]{2}$/, BE: /^\d{4}$/, CH: /^\d{4}$/, AT: /^\d{4}$/, DK: /^\d{4}$/, NO: /^\d{4}$/,
  SE: /^\d{3}\s?\d{2}$/, JP: /^\d{3}-?\d{4}$/, BR: /^\d{5}-?\d{3}$/, IE: /^[A-Za-z0-9]{3}\s?[A-Za-z0-9]{4}$/,
};

export function postalCodeLooksValid(country: string, postalCode: string): boolean {
  const code = postalCode.trim();
  if (!code) return false;
  const re = POSTAL_FORMATS[country];
  return re ? re.test(code) : /^[A-Za-z0-9 -]{2,10}$/.test(code);
}

/** [first ZIP3, last ZIP3, state] — the USPS sectional-center ranges. */
const US_ZIP3: [number, number, string][] = [
  [5, 5, 'NY'], [6, 7, 'PR'], [8, 8, 'VI'], [9, 9, 'PR'],
  [10, 27, 'MA'], [28, 29, 'RI'], [30, 38, 'NH'], [39, 49, 'ME'], [50, 54, 'VT'], [55, 55, 'MA'], [56, 59, 'VT'],
  [60, 69, 'CT'], [70, 89, 'NJ'], [90, 98, 'AE'],
  [100, 149, 'NY'], [150, 196, 'PA'], [197, 199, 'DE'],
  [200, 200, 'DC'], [201, 201, 'VA'], [202, 205, 'DC'], [206, 219, 'MD'], [220, 246, 'VA'], [247, 268, 'WV'],
  [270, 289, 'NC'], [290, 299, 'SC'],
  [300, 319, 'GA'], [320, 339, 'FL'], [340, 340, 'AA'], [341, 349, 'FL'], [350, 369, 'AL'], [370, 385, 'TN'], [386, 397, 'MS'], [398, 399, 'GA'],
  [400, 427, 'KY'], [430, 459, 'OH'], [460, 479, 'IN'], [480, 499, 'MI'],
  [500, 528, 'IA'], [530, 549, 'WI'], [550, 567, 'MN'], [570, 577, 'SD'], [580, 588, 'ND'], [590, 599, 'MT'],
  [600, 629, 'IL'], [630, 658, 'MO'], [660, 679, 'KS'], [680, 693, 'NE'],
  [700, 714, 'LA'], [716, 729, 'AR'], [730, 732, 'OK'], [733, 733, 'TX'], [734, 749, 'OK'], [750, 799, 'TX'],
  [800, 816, 'CO'], [820, 831, 'WY'], [832, 838, 'ID'], [840, 847, 'UT'], [850, 865, 'AZ'], [870, 884, 'NM'], [885, 885, 'TX'], [889, 898, 'NV'],
  [900, 961, 'CA'], [962, 966, 'AP'], [967, 968, 'HI'], [969, 969, 'GU'], [970, 979, 'OR'], [980, 994, 'WA'], [995, 999, 'AK'],
];

/** "NV" for 89149; null when the ZIP is not a US one or its prefix is unassigned. */
export function usStateForZip(postalCode: string): string | null {
  const m = postalCode.trim().match(/^(\d{3})\d{2}(?:-?\d{4})?$/);
  if (!m) return null;
  const zip3 = Number(m[1]);
  const hit = US_ZIP3.find(([lo, hi]) => zip3 >= lo && zip3 <= hi);
  return hit ? hit[2] : null;
}

export type AddressField = keyof Address;

/** What is wrong with an address, field by field; empty when it is ready to ship to. */
export function validateAddress(a: Address): Partial<Record<AddressField, string>> {
  const errors: Partial<Record<AddressField, string>> = {};
  if (!a.firstName.trim()) errors.firstName = 'Enter a first name.';
  if (!a.lastName.trim()) errors.lastName = 'Enter a last name.';
  if (!a.line1.trim()) errors.line1 = 'Enter a street address.';
  else if (/^\s*p\.?\s*o\.?\s*box/i.test(a.line1) && a.country === 'US') errors.line1 = 'UPS and FedEx cannot deliver to a PO Box — use a street address.';
  if (!a.city.trim()) errors.city = 'Enter a city.';
  if (!a.country) errors.country = 'Choose a country.';
  if (!a.region.trim()) errors.region = `Enter a ${regionLabelFor(a.country).toLowerCase()}.`;
  else if (a.country === 'US' && a.postalCode && usStateForZip(a.postalCode) && usStateForZip(a.postalCode) !== a.region.toUpperCase()) {
    errors.region = `ZIP ${a.postalCode.trim().slice(0, 5)} is in ${usStateForZip(a.postalCode)} — check the state or the ZIP.`;
  }
  const postal = postalFieldFor(a.country);
  if (!a.postalCode.trim()) errors.postalCode = `Enter a ${postal.label}.`;
  else if (!postalCodeLooksValid(a.country, a.postalCode)) errors.postalCode = a.country === 'US' ? 'Enter a 5-digit ZIP code.' : `That does not look like a ${postal.label.toLowerCase()}.`;
  if (a.phone && a.phone.replace(/\D/g, '').length < 7) errors.phone = 'Enter a phone number with area code, or leave it blank.';
  return errors;
}

export function emailLooksValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** "Est. arrival Mon, Oct 20" from the carrier's transit days, counting business days from today. */
export function arrivalFromDays(estimatedDays: string | null | undefined, from = new Date()): string | null {
  const n = Number((estimatedDays ?? '').match(/\d+/)?.[0]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(from);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
