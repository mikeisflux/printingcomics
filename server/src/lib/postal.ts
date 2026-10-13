/**
 * Postal codes: does one look right for its country, and (US) which state
 * it belongs to. The first three digits of a US ZIP fix the state, so a
 * checkout can fill the state in the moment the ZIP is typed and a ZIP-only
 * shipping estimate can give the carrier the state it wants. Mirrored in
 * web/src/lib/postal.ts — keep the two in step.
 */

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

const FORMATS: Record<string, RegExp> = {
  US: /^\d{5}(-?\d{4})?$/,
  CA: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
  GB: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/,
  AU: /^\d{4}$/, NZ: /^\d{4}$/,
  DE: /^\d{5}$/, FR: /^\d{5}$/, IT: /^\d{5}$/, ES: /^\d{5}$/, MX: /^\d{5}$/,
  NL: /^\d{4}\s?[A-Za-z]{2}$/, BE: /^\d{4}$/, CH: /^\d{4}$/, AT: /^\d{4}$/, DK: /^\d{4}$/, NO: /^\d{4}$/,
  SE: /^\d{3}\s?\d{2}$/, JP: /^\d{3}-?\d{4}$/, BR: /^\d{5}-?\d{3}$/, IE: /^[A-Za-z0-9]{3}\s?[A-Za-z0-9]{4}$/,
};

/** Does the postal code have the shape its country uses? Countries without a known shape accept 2–10 characters. */
export function postalCodeLooksValid(country: string, postalCode: string): boolean {
  const code = postalCode.trim();
  if (!code) return false;
  const re = FORMATS[country.toUpperCase()];
  return re ? re.test(code) : /^[A-Za-z0-9 -]{2,10}$/.test(code);
}

/** The region a carrier expects for a destination, when the postal code alone says what it is. */
export function regionForPostalCode(country: string, postalCode: string): string | null {
  return country.toUpperCase() === 'US' ? usStateForZip(postalCode) : null;
}
