/**
 * Shopify (and Shopify POS) through the GraphQL Admin API.
 *
 * Three ways in, all ending with an Admin API access token:
 *   oauth               our Shopify app (client id/secret in Distribution
 *                       settings); the shop clicks Connect and approves; the
 *                       offline token is kept.
 *   client_credentials  the shop made an app in its own Dev Dashboard and
 *                       pasted its client id + secret; tokens last 24 hours
 *                       and are fetched again when needed.
 *   token               a legacy admin-created custom app's shpat_ token.
 *
 * Products are matched by SKU (our catalog id), then barcode (UPC). A new
 * product is one variant with the cover price, the UPC as barcode, our
 * catalog id as SKU and the wholesale price as cost. Received copies are
 * added as an "available" adjustment with reason "received".
 */
import { money2, posFetch, posOrigin, PosError, type PosAdapter, type PosLineResult, type PosLocation } from './types.js';
import type { PosLine as Line } from '../pos-files.js';

export const SHOPIFY_API_VERSION = '2026-01';
export const SHOPIFY_SCOPES = 'write_products,write_inventory,read_locations';

export interface ShopifySecrets {
  accessToken?: string;
  expiresAt?: string;
  clientId?: string;
  clientSecret?: string;
}

const gidTail = (gid: string) => gid.split('/').pop() ?? gid;
const handleOf = (key: string) => key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const productType = (format: string) => (format === 'comic' ? 'Comics' : format === 'graphic_novel' ? 'Graphic Novels' : format === 'magazine' ? 'Magazines' : 'Books');

export class ShopifyAdapter implements PosAdapter {
  readonly kind = 'shopify' as const;
  private changed = false;
  constructor(private shop: string, private mode: 'oauth' | 'client_credentials' | 'token', private secrets: ShopifySecrets) {}

  updatedSecrets() { return this.changed ? { ...this.secrets } : null; }

  private async token(): Promise<string> {
    if (this.mode !== 'client_credentials') {
      if (!this.secrets.accessToken) throw new PosError('No Shopify access token on file; connect the store again.');
      return this.secrets.accessToken;
    }
    const fresh = this.secrets.accessToken && this.secrets.expiresAt && new Date(this.secrets.expiresAt).getTime() - Date.now() > 10 * 60_000;
    if (fresh) return this.secrets.accessToken!;
    if (!this.secrets.clientId || !this.secrets.clientSecret) throw new PosError('The Shopify app client id and secret are missing.');
    const r = await posFetch(`${posOrigin('shopify', `https://${this.shop}`, this.shop)}/admin/oauth/access_token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.secrets.clientId, client_secret: this.secrets.clientSecret }).toString(),
    });
    if (r.status !== 200 || !r.json?.access_token) throw new PosError(`Shopify refused the client credentials (${r.status}): ${(r.json?.error_description ?? r.json?.error ?? r.text).toString().slice(0, 200)}`, r.status, r.text);
    this.secrets.accessToken = r.json.access_token;
    this.secrets.expiresAt = new Date(Date.now() + Math.max(600, Number(r.json.expires_in ?? 86_000) - 60) * 1000).toISOString();
    this.changed = true;
    return this.secrets.accessToken!;
  }

  private async gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const token = await this.token();
    const r = await posFetch(`${posOrigin('shopify', `https://${this.shop}`, this.shop)}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token }, body: JSON.stringify({ query, variables }),
    });
    if (r.status === 401 || r.status === 403) throw new PosError(`Shopify rejected the access token (${r.status}). Reconnect the store${r.status === 403 ? ', and check the app has write_products, write_inventory and read_locations' : ''}.`, r.status, r.text);
    if (r.status !== 200) throw new PosError(`Shopify answered ${r.status}: ${r.text.slice(0, 200)}`, r.status, r.text);
    if (r.json?.errors?.length) throw new PosError(`Shopify: ${r.json.errors.map((e: any) => e.message).join('; ').slice(0, 300)}`, 200, r.text);
    return r.json.data as T;
  }

  async test() {
    try {
      const d = await this.gql<{ shop: { name: string; myshopifyDomain: string }; locations: { nodes: { id: string; name: string; isActive: boolean }[] } }>(
        `{ shop { name myshopifyDomain } locations(first: 20) { nodes { id name isActive } } }`,
      );
      const locations: PosLocation[] = d.locations.nodes.filter((l) => l.isActive).map((l) => ({ id: l.id, name: l.name }));
      return { ok: true, account: `${d.shop.name} (${d.shop.myshopifyDomain})`, locations };
    } catch (e: any) { return { ok: false, account: this.shop, locations: [], error: e?.message ?? String(e) }; }
  }

  private async findVariant(line: Line): Promise<{ productId: string; variantId: string; inventoryItemId: string } | null> {
    const q = async (query: string) => {
      const d = await this.gql<{ productVariants: { nodes: { id: string; product: { id: string }; inventoryItem: { id: string } }[] } }>(
        `query($q: String!) { productVariants(first: 1, query: $q) { nodes { id product { id } inventoryItem { id } } } }`, { q: query },
      );
      const v = d.productVariants.nodes[0];
      return v ? { productId: v.product.id, variantId: v.id, inventoryItemId: v.inventoryItem.id } : null;
    };
    return (await q(`sku:"${line.catalogKey}"`)) ?? (line.upc ? await q(`barcode:"${line.upc}"`) : null);
  }

  async push(lines: Line[], opts: { locationId: string; receive: boolean; reference: string }): Promise<PosLineResult[]> {
    const out: PosLineResult[] = [];
    for (const line of lines) {
      try {
        const found = await this.findVariant(line);
        const qty = opts.receive ? line.quantity : 0;
        if (!found) {
          const d = await this.gql<{ productSet: { product: { id: string; variants: { nodes: { id: string; inventoryItem: { id: string } }[] } } | null; userErrors: { field: string[]; message: string }[] } }>(
            `mutation($input: ProductSetInput!) { productSet(synchronous: true, input: $input) { product { id variants(first: 1) { nodes { id inventoryItem { id } } } } userErrors { field message } } }`,
            { input: {
              title: line.title, handle: handleOf(line.catalogKey), vendor: line.publisher, productType: productType(line.format), status: 'ACTIVE',
              descriptionHtml: line.description ? `<p>${line.description.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : '',
              tags: [productType(line.format), line.seriesName ?? ''].filter(Boolean),
              productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
              variants: [{
                optionValues: [{ optionName: 'Title', name: 'Default Title' }],
                price: money2(line.msrpCents), barcode: line.upc ?? undefined,
                inventoryItem: { sku: line.catalogKey, tracked: true, cost: money2(line.unitCents) },
                inventoryQuantities: [{ locationId: opts.locationId, name: 'available', quantity: qty }],
              }],
            } },
          );
          const errs = d.productSet.userErrors;
          if (errs.length || !d.productSet.product) throw new PosError(errs.map((e) => `${(e.field ?? []).join('.')}: ${e.message}`).join('; ') || 'Shopify did not return the product');
          out.push({ catalogKey: line.catalogKey, ok: true, action: 'created', remoteId: gidTail(d.productSet.product.id), received: qty });
          continue;
        }
        // Existing product: price, barcode and cost follow the catalog; copies are received.
        const upd = await this.gql<{ productVariantsBulkUpdate: { userErrors: { message: string }[] } }>(
          `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } } }`,
          { productId: found.productId, variants: [{ id: found.variantId, price: money2(line.msrpCents), barcode: line.upc ?? undefined, inventoryItem: { cost: money2(line.unitCents), tracked: true } }] },
        );
        if (upd.productVariantsBulkUpdate.userErrors.length) throw new PosError(upd.productVariantsBulkUpdate.userErrors.map((e) => e.message).join('; '));
        if (qty > 0) {
          // The item must be stocked at the location before it can be adjusted; activating an already-active item is harmless.
          await this.gql(`mutation($i: ID!, $l: ID!) { inventoryActivate(inventoryItemId: $i, locationId: $l) { userErrors { message } } }`, { i: found.inventoryItemId, l: opts.locationId }).catch(() => undefined);
          const adj = await this.gql<{ inventoryAdjustQuantities: { userErrors: { message: string }[] } }>(
            `mutation($input: InventoryAdjustQuantitiesInput!) { inventoryAdjustQuantities(input: $input) { userErrors { field message } } }`,
            { input: { reason: 'received', name: 'available', referenceDocumentUri: `gid://printingcomics/Shipment/${opts.reference}`, changes: [{ delta: qty, inventoryItemId: found.inventoryItemId, locationId: opts.locationId }] } },
          );
          if (adj.inventoryAdjustQuantities.userErrors.length) throw new PosError(adj.inventoryAdjustQuantities.userErrors.map((e) => e.message).join('; '));
        }
        out.push({ catalogKey: line.catalogKey, ok: true, action: 'updated', remoteId: gidTail(found.productId), received: qty });
      } catch (e: any) {
        out.push({ catalogKey: line.catalogKey, ok: false, action: 'failed', received: 0, error: (e?.message ?? String(e)).slice(0, 300) });
      }
    }
    return out;
  }
}

/** The OAuth authorize URL for our own Shopify app. */
export function shopifyAuthorizeUrl(shop: string, clientId: string, redirectUri: string, state: string): string {
  const u = new URL(`https://${shop}/admin/oauth/authorize`);
  u.searchParams.set('client_id', clientId); u.searchParams.set('scope', SHOPIFY_SCOPES); u.searchParams.set('redirect_uri', redirectUri); u.searchParams.set('state', state);
  return u.toString();
}

/** Trade the authorization code for the shop's offline access token. */
export async function shopifyExchangeCode(shop: string, clientId: string, clientSecret: string, code: string): Promise<string> {
  const r = await posFetch(`${posOrigin('shopify', `https://${shop}`, shop)}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  if (r.status !== 200 || !r.json?.access_token) throw new PosError(`Shopify did not issue a token (${r.status}): ${r.text.slice(0, 200)}`, r.status, r.text);
  return r.json.access_token as string;
}

/** "my-shop" or "my-shop.myshopify.com" or a URL → "my-shop.myshopify.com". */
export function normalizeShopifyDomain(input: string): string | null {
  let s = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!s) return null;
  if (!s.includes('.')) s = `${s}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s)) return null;
  return s;
}

