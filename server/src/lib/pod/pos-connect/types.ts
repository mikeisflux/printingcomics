/**
 * A live link to a shop's point of sale. Every system gets the same two
 * jobs: make sure a title exists as a product (SKU = our catalog id,
 * barcode = UPC, price = cover price, cost = the shop's wholesale price),
 * and add received copies to stock at the shop's location.
 *
 * Adapters never throw on a line: each returns what it did so the sync log
 * can show the shop exactly which title went in and which did not.
 */
import type { PosLine } from '../pos-files.js';

export type PosKind = 'shopify' | 'lightspeed_x' | 'lightspeed_r';
export type PosMode = 'oauth' | 'client_credentials' | 'token';

export interface PosLocation { id: string; name: string }

export interface PosLineResult {
  catalogKey: string;
  ok: boolean;
  /** created | updated | skipped */
  action: string;
  /** The POS's own id for the product / item, when known. */
  remoteId?: string | null;
  /** Copies added to stock (0 when only the product was pushed). */
  received: number;
  error?: string | null;
}

export interface PosAdapter {
  readonly kind: PosKind;
  /** Prove the credentials work and list the places stock can land. */
  test(): Promise<{ ok: boolean; account: string; locations: PosLocation[]; error?: string }>;
  /**
   * Push titles. With `receive` the line quantities are added to stock at
   * the location; without it the products are only created or updated
   * (quantity 0 for a new one), which is how pre-orders get a product.
   */
  push(lines: PosLine[], opts: { locationId: string; receive: boolean; reference: string }): Promise<PosLineResult[]>;
  /** Tokens that were refreshed during the call and must be stored again (null when unchanged). */
  updatedSecrets(): Record<string, unknown> | null;
}

export interface PosConnectionInput {
  kind: PosKind;
  mode: PosMode;
  shop: string;
  secrets: Record<string, unknown>;
  locationId: string | null;
}

/** An HTTP failure from the POS, with enough of the body to act on. */
export class PosError extends Error {
  constructor(message: string, public status?: number, public body?: string) { super(message); }
}

export async function posFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; text: string; json: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, text, json };
  } finally { clearTimeout(timeout); }
}

export const money2 = (cents: number) => (cents / 100).toFixed(2);

/**
 * Where a POS lives. In tests POS_MOCK_BASE points every system at a local
 * stand-in (`<base>/shopify/<shop>`, `<base>/lsx/<prefix>`, `<base>/lsr`),
 * so the exact requests can be checked without a live store.
 */
export function posOrigin(system: 'shopify' | 'lsx' | 'lsr', real: string, id = ''): string {
  const mock = process.env.POS_MOCK_BASE;
  return mock ? `${mock.replace(/\/$/, '')}/${system}${id ? `/${id}` : ''}` : real;
}
