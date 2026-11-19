/**
 * Lightspeed Retail (R-Series) through its V3 API. R-Series only takes
 * OAuth apps, so our app's client id and secret live in Distribution
 * settings; the shop clicks Connect, approves `employee:inventory`, and we
 * keep the refresh token (access tokens last 30 minutes and are renewed as
 * needed; a renewed token is handed back through `updatedSecrets`).
 *
 * Items are matched by custom SKU (our catalog id), then UPC. Stock is the
 * ItemShop quantity on hand at the chosen shop, raised by the copies shipped.
 */
import { money2, posFetch, posOrigin, PosError, type PosAdapter, type PosLineResult, type PosLocation } from './types.js';
import type { PosLine } from '../pos-files.js';

export const LIGHTSPEED_R_SCOPE = 'employee:inventory';
const AUTH = () => `${posOrigin('lsr', 'https://cloud.lightspeedapp.com')}/auth/oauth`;
const API = () => `${posOrigin('lsr', 'https://api.lightspeedapp.com')}/API/V3`;

export interface LightspeedRSecrets { accessToken?: string; refreshToken: string; expiresAt?: string; clientId: string; clientSecret: string }

export class LightspeedRAdapter implements PosAdapter {
  readonly kind = 'lightspeed_r' as const;
  private changed = false;
  constructor(private accountId: string, private secrets: LightspeedRSecrets) {}
  updatedSecrets() { return this.changed ? { ...this.secrets } : null; }

  private async token(): Promise<string> {
    const fresh = this.secrets.accessToken && this.secrets.expiresAt && new Date(this.secrets.expiresAt).getTime() - Date.now() > 60_000;
    if (fresh) return this.secrets.accessToken!;
    const r = await posFetch(`${AUTH()}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ client_id: this.secrets.clientId, client_secret: this.secrets.clientSecret, refresh_token: this.secrets.refreshToken, grant_type: 'refresh_token' }).toString() });
    if (r.status !== 200 || !r.json?.access_token) throw new PosError(`Lightspeed would not renew the token (${r.status}). Connect the store again.`, r.status, r.text);
    this.secrets.accessToken = r.json.access_token;
    if (r.json.refresh_token) this.secrets.refreshToken = r.json.refresh_token;
    this.secrets.expiresAt = new Date(Date.now() + Math.max(300, Number(r.json.expires_in ?? 1800) - 30) * 1000).toISOString();
    this.changed = true;
    return this.secrets.accessToken!;
  }

  private async call(method: string, path: string, body?: unknown): Promise<any> {
    const token = await this.token();
    const r = await posFetch(`${API()}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 || r.status === 403) throw new PosError(`Lightspeed rejected the token (${r.status}). Connect the store again.`, r.status, r.text);
    if (r.status >= 400) throw new PosError(`Lightspeed answered ${r.status}: ${r.text.slice(0, 200)}`, r.status, r.text);
    return r.json;
  }

  async test() {
    try {
      const acct = await this.call('GET', `/Account/${this.accountId}.json`);
      const shops = await this.call('GET', `/Account/${this.accountId}/Shop.json`);
      const list = shops?.Shop ? (Array.isArray(shops.Shop) ? shops.Shop : [shops.Shop]) : [];
      const locations: PosLocation[] = list.map((s: any) => ({ id: String(s.shopID), name: String(s.name) }));
      return { ok: true, account: `${acct?.Account?.name ?? 'Lightspeed'} (account ${this.accountId})`, locations };
    } catch (e: any) { return { ok: false, account: this.accountId, locations: [], error: e?.message ?? String(e) }; }
  }

  private one(v: any): any | null { if (!v) return null; return Array.isArray(v) ? v[0] ?? null : v; }

  private async findItem(line: PosLine): Promise<any | null> {
    const bySku = await this.call('GET', `/Account/${this.accountId}/Item.json?customSku=${encodeURIComponent(line.catalogKey)}&load_relations=${encodeURIComponent('["ItemShops"]')}`);
    const a = this.one(bySku?.Item); if (a) return a;
    if (!line.upc) return null;
    const byUpc = await this.call('GET', `/Account/${this.accountId}/Item.json?upc=${encodeURIComponent(line.upc)}&load_relations=${encodeURIComponent('["ItemShops"]')}`);
    return this.one(byUpc?.Item);
  }

  async push(lines: PosLine[], opts: { locationId: string; receive: boolean; reference: string }): Promise<PosLineResult[]> {
    const out: PosLineResult[] = [];
    for (const line of lines) {
      try {
        const qty = opts.receive ? line.quantity : 0;
        const prices = { ItemPrice: [{ amount: money2(line.msrpCents), useTypeID: '1', useType: 'Default' }, { amount: money2(line.msrpCents), useTypeID: '2', useType: 'MSRP' }] };
        const found = await this.findItem(line);
        if (!found) {
          const made = await this.call('POST', `/Account/${this.accountId}/Item.json`, { description: line.title, customSku: line.catalogKey, manufacturerSku: line.catalogKey, upc: line.upc && line.upc.length === 12 ? line.upc : '', ean: line.upc && line.upc.length === 13 ? line.upc : '', defaultCost: money2(line.unitCents), Prices: prices });
          const item = made?.Item;
          if (!item?.itemID) throw new PosError('Lightspeed did not return an item id');
          if (qty > 0) await this.setQoh(String(item.itemID), opts.locationId, qty, null);
          out.push({ catalogKey: line.catalogKey, ok: true, action: 'created', remoteId: String(item.itemID), received: qty });
          continue;
        }
        await this.call('PUT', `/Account/${this.accountId}/Item/${found.itemID}.json`, { defaultCost: money2(line.unitCents), Prices: prices });
        if (qty > 0) {
          const shops = found.ItemShops?.ItemShop ? (Array.isArray(found.ItemShops.ItemShop) ? found.ItemShops.ItemShop : [found.ItemShops.ItemShop]) : [];
          const here = shops.find((s: any) => String(s.shopID) === String(opts.locationId));
          await this.setQoh(String(found.itemID), opts.locationId, Number(here?.qoh ?? 0) + qty, here?.itemShopID ? String(here.itemShopID) : null);
        }
        out.push({ catalogKey: line.catalogKey, ok: true, action: 'updated', remoteId: String(found.itemID), received: qty });
      } catch (e: any) { out.push({ catalogKey: line.catalogKey, ok: false, action: 'failed', received: 0, error: (e?.message ?? String(e)).slice(0, 300) }); }
    }
    return out;
  }

  private async setQoh(itemId: string, shopId: string, qoh: number, itemShopId: string | null): Promise<void> {
    let isid = itemShopId;
    if (!isid) {
      const r = await this.call('GET', `/Account/${this.accountId}/Item/${itemId}.json?load_relations=${encodeURIComponent('["ItemShops"]')}`);
      const shops = r?.Item?.ItemShops?.ItemShop ? (Array.isArray(r.Item.ItemShops.ItemShop) ? r.Item.ItemShops.ItemShop : [r.Item.ItemShops.ItemShop]) : [];
      isid = shops.find((s: any) => String(s.shopID) === String(shopId))?.itemShopID ?? null;
      if (!isid) throw new PosError(`Lightspeed has no inventory record for this item at shop ${shopId}`);
    }
    await this.call('PUT', `/Account/${this.accountId}/Item/${itemId}.json`, { ItemShops: { ItemShop: [{ itemShopID: isid, shopID: shopId, qoh: String(qoh) }] } });
  }
}

export function lightspeedRAuthorizeUrl(clientId: string, state: string): string {
  const u = new URL(`${AUTH()}/authorize`);
  u.searchParams.set('response_type', 'code'); u.searchParams.set('client_id', clientId); u.searchParams.set('scope', LIGHTSPEED_R_SCOPE); u.searchParams.set('state', state);
  return u.toString();
}

export async function lightspeedRExchangeCode(clientId: string, clientSecret: string, code: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; accountId: string }> {
  const r = await posFetch(`${AUTH()}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' }).toString() });
  if (r.status !== 200 || !r.json?.access_token) throw new PosError(`Lightspeed did not issue a token (${r.status}): ${r.text.slice(0, 200)}`, r.status, r.text);
  const acct = await posFetch(`${API()}/Account.json`, { headers: { Authorization: `Bearer ${r.json.access_token}`, Accept: 'application/json' } });
  const account = acct.json?.Account ? (Array.isArray(acct.json.Account) ? acct.json.Account[0] : acct.json.Account) : null;
  if (!account?.accountID) throw new PosError('Lightspeed did not say which account the token is for');
  return { accessToken: r.json.access_token, refreshToken: r.json.refresh_token, expiresIn: Number(r.json.expires_in ?? 1800), accountId: String(account.accountID) };
}
