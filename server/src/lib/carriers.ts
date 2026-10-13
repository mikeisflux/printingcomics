/**
 * Plain names for what EasyPost calls carriers and services.
 *
 * EasyPost names a rate by the carrier ACCOUNT it came from ("UPSDAP" is
 * UPS through EasyPost's Digital Access Program, "FedExDefault" is FedEx
 * through EasyPost's account) and by the carrier's own service code
 * ("UPSGroundsaverGreaterThan1lb", "FEDEX_GROUND", "GroundAdvantage"). A
 * customer picking a shipping method, and staff buying a label, should read
 * "UPS Ground Saver" and "FedEx Ground". The raw codes stay in the option
 * ids, which is what a quote is resolved by.
 */

const CARRIERS: Record<string, string> = {
  USPS: 'USPS',
  UPS: 'UPS', UPSDAP: 'UPS', UPSSurePost: 'UPS', UPSMailInnovations: 'UPS',
  FedEx: 'FedEx', FedExDefault: 'FedEx', FedexDefault: 'FedEx', FedExSmartPost: 'FedEx', FedExCrossBorder: 'FedEx',
  DHLExpress: 'DHL Express', DhlExpress: 'DHL Express', DHLEcommerce: 'DHL eCommerce', DhlEcs: 'DHL eCommerce',
  CanadaPost: 'Canada Post', Purolator: 'Purolator', OnTrac: 'OnTrac', LaserShip: 'LaserShip', GSO: 'GSO',
};

const SERVICES: Record<string, Record<string, string>> = {
  USPS: {
    First: 'First-Class Mail', GroundAdvantage: 'Ground Advantage', Priority: 'Priority Mail', Express: 'Priority Mail Express',
    ParcelSelect: 'Parcel Select', MediaMail: 'Media Mail', LibraryMail: 'Library Mail',
    FirstClassMailInternational: 'First-Class Mail International', FirstClassPackageInternationalService: 'First-Class Package International',
    PriorityMailInternational: 'Priority Mail International', ExpressMailInternational: 'Priority Mail Express International',
  },
  UPS: {
    Ground: 'Ground', UPSStandard: 'Standard', UPSSaver: 'Worldwide Saver', Express: 'Worldwide Express', ExpressPlus: 'Worldwide Express Plus',
    Expedited: 'Worldwide Expedited', NextDayAir: 'Next Day Air', NextDayAirSaver: 'Next Day Air Saver', NextDayAirEarlyAM: 'Next Day Air Early',
    '2ndDayAir': '2nd Day Air', '2ndDayAirAM': '2nd Day Air A.M.', '3DaySelect': '3 Day Select',
    UPSGroundsaverLessThan1lb: 'Ground Saver', UPSGroundsaverGreaterThan1lb: 'Ground Saver', GroundSaver: 'Ground Saver',
    SurePostLessThan1Lb: 'SurePost', SurePostOver1Lb: 'SurePost',
  },
  FedEx: {
    FEDEX_GROUND: 'Ground', GROUND_HOME_DELIVERY: 'Home Delivery', SMART_POST: 'Ground Economy', FEDEX_2_DAY: '2Day', FEDEX_2_DAY_AM: '2Day A.M.',
    FEDEX_EXPRESS_SAVER: 'Express Saver', STANDARD_OVERNIGHT: 'Standard Overnight', PRIORITY_OVERNIGHT: 'Priority Overnight', FIRST_OVERNIGHT: 'First Overnight',
    INTERNATIONAL_ECONOMY: 'International Economy', INTERNATIONAL_PRIORITY: 'International Priority', INTERNATIONAL_FIRST: 'International First',
    FEDEX_INTERNATIONAL_PRIORITY: 'International Priority', FEDEX_INTERNATIONAL_ECONOMY: 'International Economy', FEDEX_INTERNATIONAL_CONNECT_PLUS: 'International Connect Plus',
    FEDEX_INTERNATIONAL_PRIORITY_EXPRESS: 'International Priority Express',
  },
};

export function carrierDisplayName(raw: string | null | undefined): string {
  if (!raw) return '';
  if (CARRIERS[raw]) return CARRIERS[raw]!;
  const trimmed = raw.replace(/(Default|DAP|Account)$/i, '');
  if (CARRIERS[trimmed]) return CARRIERS[trimmed]!;
  return trimmed.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function serviceDisplayName(rawCarrier: string | null | undefined, rawService: string | null | undefined): string {
  if (!rawService) return '';
  const carrier = carrierDisplayName(rawCarrier);
  const known = SERVICES[carrier]?.[rawService];
  if (known) return known;
  // Fall back to the code, made readable: drop the carrier's own prefix,
  // split CamelCase and SNAKE_CASE, title-case the words.
  const words = rawService
    .replace(/^(FEDEX_|FedEx|UPS|USPS)/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .replace(/\b(Am|Pm)\b/g, (t) => t.toUpperCase());
  return words || rawService;
}

/** "UPS Ground", "USPS Ground Advantage" — the name a customer sees and the order records. */
export function methodDisplayName(rawCarrier: string | null | undefined, rawService: string | null | undefined): string {
  return `${carrierDisplayName(rawCarrier)} ${serviceDisplayName(rawCarrier, rawService)}`.trim();
}
