import { getShipstationConfig } from './settings.js';
import { HttpError } from '../middleware/error.js';

const BASE_URL = 'https://ssapi.shipstation.com';

function authHeader(apiKey: string, apiSecret: string): string {
  return 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
}

interface SsAddress {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
  residential?: boolean;
}

interface SsItem {
  sku?: string;
  name: string;
  quantity: number;
  unitPrice: number; // dollars
  weight?: { value: number; units: 'ounces' | 'grams' | 'pounds' };
}

export interface SsCreateOrderInput {
  orderNumber: string;
  orderDate: string; // ISO
  orderStatus?: 'awaiting_payment' | 'awaiting_shipment' | 'shipped' | 'on_hold' | 'cancelled';
  customerEmail?: string;
  customerUsername?: string;
  billTo: SsAddress;
  shipTo: SsAddress;
  items: SsItem[];
  amountPaid?: number;
  taxAmount?: number;
  shippingAmount?: number;
  customerNotes?: string;
  internalNotes?: string;
  weight?: { value: number; units: 'ounces' | 'grams' | 'pounds' };
  dimensions?: { length: number; width: number; height: number; units: 'inches' | 'centimeters' };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cfg = await getShipstationConfig();
  if (!cfg.apiKey || !cfg.apiSecret) {
    throw new HttpError(503, 'ShipStation not configured (missing API key/secret in admin settings)');
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(cfg.apiKey, cfg.apiSecret),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(502, `ShipStation ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/** Push (create or update) a local order into ShipStation. */
export async function ssCreateOrder(input: SsCreateOrderInput): Promise<{ orderId: number; orderKey: string }> {
  return request('/orders/createorder', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Get rate quotes from a specific carrier for a parcel. */
export interface SsRateInput {
  carrierCode: string;       // e.g. "stamps_com", "ups", "fedex"
  serviceCode?: string;
  packageCode?: string;
  fromPostalCode: string;
  toCountry: string;
  toPostalCode: string;
  toState?: string;
  weight: { value: number; units: 'ounces' | 'grams' | 'pounds' };
  dimensions?: { length: number; width: number; height: number; units: 'inches' | 'centimeters' };
  residential?: boolean;
}
export interface SsRate {
  serviceName: string;
  serviceCode: string;
  shipmentCost: number;
  otherCost: number;
}
export async function ssGetRates(input: SsRateInput): Promise<SsRate[]> {
  return request('/shipments/getrates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface SsCarrier {
  name: string;
  code: string;
  accountNumber?: string;
  primary: boolean;
  shippingProviderId: number;
}
export async function ssListCarriers(): Promise<SsCarrier[]> {
  return request('/carriers');
}

/** Fetch a shipment record by its resource_url (returned by SHIP_NOTIFY webhook). */
export async function ssFetchShipment(resourceUrl: string): Promise<any> {
  const cfg = await getShipstationConfig();
  if (!cfg.apiKey || !cfg.apiSecret) throw new HttpError(503, 'ShipStation not configured');
  const res = await fetch(resourceUrl, {
    headers: { Authorization: authHeader(cfg.apiKey, cfg.apiSecret) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(502, `ShipStation fetch shipment ${res.status}: ${body}`);
  }
  return res.json();
}

/** Quick connectivity probe — returns the list of carriers (or throws). */
export async function ssTestConnection(): Promise<{ ok: true; carriers: number }> {
  const carriers = await ssListCarriers();
  return { ok: true, carriers: carriers.length };
}
