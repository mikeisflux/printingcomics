import { getPacklinkConfig } from './settings.js';
import { HttpError } from '../middleware/error.js';

/**
 * Packlink Pro API client.
 *
 *   Base:   https://api.packlink.com/v1
 *   Auth:   request header `Authorization: <apiKey>` (no Bearer prefix)
 *   Docs:   https://support-pro.packlink.com/hc/en-gb  (API reference)
 *
 * Key operations we use:
 *   - quote rates: GET /services/from/{fromCc}/{fromZip}/to/{toCc}/{toZip}/price/{priceEUR}/weight/{weightKg}
 *   - create shipment: POST /shipments
 *   - fetch shipment: GET /shipments/{reference}
 *   - download label: GET /shipments/{reference}/labels
 */

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cfg = await getPacklinkConfig();
  if (!cfg.apiKey) throw new HttpError(503, 'Packlink Pro not configured (missing API key in admin settings)');
  const url = `${cfg.baseUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(cfg.apiKey), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Expose the actual Packlink response body to the admin so we can see
    // what Packlink is complaining about (wrong endpoint? wrong auth?
    // missing field? country not supported?).
    const truncated = body.length > 600 ? body.slice(0, 600) + '…' : body;
    throw new HttpError(502, `Packlink ${res.status} at ${path}: ${truncated || '(empty body)'}`);
  }
  return res.json() as Promise<T>;
}

// ----- Rates -----

export interface PlpRateQuery {
  fromCountry: string;   // ISO, e.g. "US"
  fromPostalCode: string;
  toCountry: string;
  toPostalCode: string;
  priceCents: number;    // package content value
  weightKg: number;      // total weight in kg
}

export interface PlpService {
  id: number;
  name: string;
  carrier_name: string;
  price: { total_price: number; base_price: number; tax_price: number; currency: string };
  transit_days: number | null;
  service_point_input?: 'NONE' | 'SOURCE' | 'DESTINATION' | 'BOTH';
}

export async function plpGetRates(q: PlpRateQuery): Promise<PlpService[]> {
  const priceEUR = (q.priceCents / 100).toFixed(2);
  const weight = q.weightKg.toFixed(2);
  const path = `/services/from/${q.fromCountry}/${q.fromPostalCode}/to/${q.toCountry}/${q.toPostalCode}/price/${priceEUR}/weight/${weight}`;
  return request(path);
}

// ----- Shipments -----

export interface PlpAddress {
  name: string;
  surname?: string;
  company?: string;
  email?: string;
  phone?: string;
  street1: string;
  street2?: string;
  city: string;
  state?: string;
  zip_code: string;
  country: string;
}

export interface PlpPackage {
  length: number; // cm
  width: number;
  height: number;
  weight: number; // kg
}

export interface PlpCreateShipmentInput {
  service_id: number;
  content: string;           // short description of contents
  content_value: number;     // declared value (eur)
  currency?: string;         // "EUR" default
  from: PlpAddress;
  to: PlpAddress;
  packages: PlpPackage[];
  additional_data?: { order_number?: string; [k: string]: unknown };
}

export interface PlpShipment {
  reference: string;
  state: string;
  tracking_codes?: string[];
  carrier_tracking_code?: string;
  service_name: string;
  carrier_name: string;
  price: { total_price: number; currency: string };
}

export async function plpCreateShipment(input: PlpCreateShipmentInput): Promise<PlpShipment> {
  return request('/shipments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function plpFetchShipment(reference: string): Promise<PlpShipment> {
  return request(`/shipments/${encodeURIComponent(reference)}`);
}

export async function plpListShipments(): Promise<PlpShipment[]> {
  return request('/shipments');
}

/** Label download — returns an array of base64-encoded PDF strings. */
export async function plpGetLabels(reference: string): Promise<string[]> {
  return request(`/shipments/${encodeURIComponent(reference)}/labels`);
}

/** Probe: list services for a trivial US→US 0.5kg, 10 EUR quote. Throws if creds are wrong. */
export async function plpTestConnection(fromCountry: string, fromPostalCode: string): Promise<{ ok: true; sampleServices: number }> {
  const services = await plpGetRates({
    fromCountry,
    fromPostalCode,
    toCountry: fromCountry,
    toPostalCode: fromPostalCode,
    priceCents: 1000,
    weightKg: 0.5,
  });
  return { ok: true, sampleServices: services.length };
}
