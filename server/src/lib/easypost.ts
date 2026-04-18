import { getEasyPostConfig } from './settings.js';
import { HttpError } from '../middleware/error.js';

/**
 * EasyPost API client.
 *
 *   Base:  https://api.easypost.com/v2
 *   Auth:  HTTP Basic — API key as the username, empty password
 *   Docs:  https://docs.easypost.com/docs/shipments
 *
 * Operations we use:
 *   - Create shipment + fetch rates: POST /shipments
 *       body: { shipment: { to_address, from_address, parcel, options? } }
 *       returns: { id, rates: [ ... ], ... }
 *   - Buy (purchase label):          POST /shipments/{id}/buy
 *       body: { rate: { id } }
 *       returns: full shipment with postage_label.label_url and tracking_code
 *   - Fetch shipment:                GET /shipments/{id}
 *   - Refund (void label):           POST /shipments/{id}/refund
 */

export interface EpAddress {
  name?: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state?: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface EpParcel {
  // Dimensions are in INCHES, weight in OUNCES for EasyPost.
  length: number;
  width: number;
  height: number;
  weight: number;
}

export interface EpRate {
  id: string;
  carrier: string;
  service: string;
  rate: string;           // string decimal, e.g. "5.67"
  currency: string;
  delivery_days: number | null;
  delivery_date: string | null;
  est_delivery_days: number | null;
}

export interface EpPostageLabel {
  label_url: string;
  label_file_type?: string;
  label_size?: string;
}

export interface EpShipment {
  id: string;
  object: 'Shipment';
  status: string | null;  // e.g. "unknown", "pre_transit", "in_transit", "delivered"
  tracking_code: string | null;
  tracker?: { id: string; status: string | null; tracking_code: string | null } | null;
  postage_label?: EpPostageLabel | null;
  selected_rate?: EpRate | null;
  rates?: EpRate[];
  to_address?: EpAddress & { id?: string };
  from_address?: EpAddress & { id?: string };
  parcel?: EpParcel & { id?: string };
  created_at?: string;
  updated_at?: string;
}

function basicAuth(apiKey: string): string {
  return 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64');
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cfg = await getEasyPostConfig();
  if (!cfg.apiKey) throw new HttpError(503, 'EasyPost not configured (missing API key in admin settings)');
  const url = `${cfg.baseUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: basicAuth(cfg.apiKey),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const truncated = body.length > 600 ? body.slice(0, 600) + '…' : body;
    throw new HttpError(502, `EasyPost ${res.status} at ${path}: ${truncated || '(empty body)'}`);
  }
  return res.json() as Promise<T>;
}

// ----- Shipments / rates -----

export interface EpCreateShipmentInput {
  to_address: EpAddress;
  from_address: EpAddress;
  parcel: EpParcel;
  options?: {
    label_format?: 'PDF' | 'PNG' | 'ZPL' | 'EPL2';
    print_custom_1?: string;  // e.g. order number
    print_custom_2?: string;
    [k: string]: unknown;
  };
  reference?: string;
  is_return?: boolean;
}

/** Creates a shipment and returns it including the `rates` array. */
export async function epCreateShipment(input: EpCreateShipmentInput): Promise<EpShipment> {
  return request('/shipments', {
    method: 'POST',
    body: JSON.stringify({ shipment: input }),
  });
}

/** Buys the given rate for a shipment (generates the label). */
export async function epBuyShipment(shipmentId: string, rateId: string): Promise<EpShipment> {
  return request(`/shipments/${encodeURIComponent(shipmentId)}/buy`, {
    method: 'POST',
    body: JSON.stringify({ rate: { id: rateId } }),
  });
}

export async function epFetchShipment(shipmentId: string): Promise<EpShipment> {
  return request(`/shipments/${encodeURIComponent(shipmentId)}`);
}

export async function epRefundShipment(shipmentId: string): Promise<EpShipment> {
  return request(`/shipments/${encodeURIComponent(shipmentId)}/refund`, { method: 'POST' });
}

/** Cheapest-of-all-rates helper — what you'd preselect in a UI. */
export function epCheapestRate(rates: EpRate[] | undefined): EpRate | null {
  if (!rates || rates.length === 0) return null;
  return [...rates].sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate))[0];
}

/** Probe: create a tiny sample shipment to prove the API key works. Does NOT
 *  buy a label (no postage spent). Returns the rate count. */
export async function epTestConnection(from: EpAddress, to: EpAddress): Promise<{ ok: true; rates: number; shipmentId: string }> {
  const shipment = await epCreateShipment({
    from_address: from,
    to_address: to,
    parcel: { length: 9, width: 6, height: 1, weight: 8 },  // small mailer, 8 oz
  });
  return { ok: true, rates: shipment.rates?.length ?? 0, shipmentId: shipment.id };
}
