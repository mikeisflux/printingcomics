import { getPacklinkConfig } from './settings.js';
import { HttpError } from '../middleware/error.js';

/**
 * Packlink Pro API client.
 *
 *   Base:   https://api.packlink.com/v1
 *   Auth:   request header `Authorization: <apiKey>` (no Bearer prefix)
 *   Docs:   https://support-pro.packlink.com/hc/en-gb  (API reference)
 *   Ref:    https://github.com/wout/packlink.cr (Crystal client — authoritative
 *           format for /services query)
 *
 * Key operations we use:
 *   - quote rates: GET /services?from[country]=..&from[zip]=..&to[country]=..
 *                      &to[zip]=..&packages[0][weight]=..&packages[0][length]=..
 *                      &packages[0][width]=..&packages[0][height]=..
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
  weightKg: number;      // total weight in kg
  lengthCm?: number;     // package dims (cm) — Packlink requires all three
  widthCm?: number;
  heightCm?: number;
  priceCents?: number;   // optional content value (not part of /services query)
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
  // Packlink's /services endpoint uses nested bracket query params, not path
  // segments. See wout/packlink.cr Service::Query + Util.build_nested_query.
  // All four package dims (weight, length, width, height) are required; we
  // fall back to a small envelope if the caller didn't supply them so the
  // probe-style "test connection" call still works.
  const params = new URLSearchParams();
  params.append('from[country]', q.fromCountry);
  params.append('from[zip]', q.fromPostalCode);
  params.append('to[country]', q.toCountry);
  params.append('to[zip]', q.toPostalCode);
  params.append('packages[0][weight]', q.weightKg.toFixed(3));
  params.append('packages[0][length]', (q.lengthCm ?? 20).toFixed(2));
  params.append('packages[0][width]', (q.widthCm ?? 15).toFixed(2));
  params.append('packages[0][height]', (q.heightCm ?? 3).toFixed(2));
  return request(`/services?${params.toString()}`);
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
