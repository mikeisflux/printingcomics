/**
 * Lightspeed Retail (X-Series, formerly Vend) through its 2.0 API with a
 * personal token the shop's admin makes under Setup → Personal tokens.
 *
 * Products are matched by SKU (our catalog id). Received copies go in as a
 * supplier consignment (stock order) that is created, filled and marked
 * received in one go, which is how X-Series records stock arriving with a
 * cost, so the shop's margin reports stay right.
 */
import { money2, posFetch, posOrigin, PosError, type PosAdapter, type PosLineResult, type PosLocation } from './types.js';
import type { PosLine } from '../pos-files.js';

export interface LightspeedXSecrets { token: string }

export class LightspeedXAdapter implements PosAdapter {
  readonly kind = 'lightspeed_x' as const;
  constructor(private prefix: string, private secrets: LightspeedXSecrets) {}
  updatedSecrets() { return null; }
  private get base() { return `${posOrigin('lsx', `https://${this.prefix}.retail.lightspeed.app`, this.prefix)}/api/2.0`; }

  private async call(method: string, path: string, body?: unknown): Promise<any> {
    const r = await posFetch(`${this.base}${path}`, { method, headers: { Authorization: `Bearer ${this.secrets.token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 || r.status === 403) throw new PosError(`Lightspeed rejected the personal token (${r.status}). Make a new one under Setup → Personal tokens (Plus plan).`, r.status, r.text);
    if (r.status >= 400) throw new PosError(`Lightspeed answered ${r.status}: ${r.text.slice(0, 200)}`, r.status, r.text);
    return r.json;
  }

  async test() {
    try {
      const retailer = await this.call('GET', '/retailer');
      const outlets = await this.call('GET', '/outlets');
      const locations: PosLocation[] = ((outlets?.data ?? []) as { id: string; name: string; deleted_at?: string | null }[]).filter((o) => !o.deleted_at).map((o) => ({ id: o.id, name: o.name }));
      return { ok: true, account: `${retailer?.data?.name ?? this.prefix} (${this.prefix}.retail.lightspeed.app)`, locations };
    } catch (e: any) { return { ok: false, account: this.prefix, locations: [], error: e?.message ?? String(e) }; }
  }

  private async findProduct(line: PosLine): Promise<{ id: string } | null> {
    const r = await this.call('GET', `/search?type=products&sku=${encodeURIComponent(line.catalogKey)}`);
    const hit = (r?.data ?? []).find((p: any) => (p.sku ?? '').toUpperCase() === line.catalogKey.toUpperCase());
    return hit ? { id: hit.id } : null;
  }

  async push(lines: PosLine[], opts: { locationId: string; receive: boolean; reference: string }): Promise<PosLineResult[]> {
    const out: PosLineResult[] = [];
    const received: { product_id: string; count: number; cost: number; catalogKey: string }[] = [];
    for (const line of lines) {
      try {
        const found = await this.findProduct(line);
        let id = found?.id ?? null;
        const body = {
          name: line.title, sku: line.catalogKey, description: line.description ?? '', supply_price: Number(money2(line.unitCents)),
          price_excluding_tax: Number(money2(line.msrpCents)), active: true, brand_name: line.publisher,
        };
        if (!id) { const made = await this.call('POST', '/products', body); id = made?.data?.id ?? null; if (!id) throw new PosError('Lightspeed did not return a product id'); }
        else await this.call('PUT', `/products/${id}`, body);
        if (opts.receive && line.quantity > 0) received.push({ product_id: id!, count: line.quantity, cost: Number(money2(line.unitCents)), catalogKey: line.catalogKey });
        out.push({ catalogKey: line.catalogKey, ok: true, action: found ? 'updated' : 'created', remoteId: id, received: 0 });
      } catch (e: any) { out.push({ catalogKey: line.catalogKey, ok: false, action: 'failed', received: 0, error: (e?.message ?? String(e)).slice(0, 300) }); }
    }
    if (received.length) {
      try {
        const c = await this.call('POST', '/consignments', { name: `Printing Comics ${opts.reference}`, outlet_id: opts.locationId, type: 'SUPPLIER', status: 'OPEN', reference: opts.reference });
        const cid = c?.data?.id;
        if (!cid) throw new PosError('Lightspeed did not return a consignment id');
        for (const p of received) await this.call('POST', `/consignments/${cid}/products`, { product_id: p.product_id, count: p.count, received: p.count, cost: p.cost });
        await this.call('PUT', `/consignments/${cid}`, { status: 'RECEIVED' });
        for (const p of received) { const row = out.find((o) => o.catalogKey === p.catalogKey); if (row) row.received = p.count; }
      } catch (e: any) {
        for (const p of received) { const row = out.find((o) => o.catalogKey === p.catalogKey); if (row) { row.ok = false; row.action = 'product ok, stock failed'; row.error = (e?.message ?? String(e)).slice(0, 300); } }
      }
    }
    return out;
  }
}

/** "myshop" or "myshop.retail.lightspeed.app" or a URL → "myshop". */
export function normalizeXPrefix(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\.retail\.lightspeed\.app.*$/, '').replace(/\.vendhq\.com.*$/, '').replace(/\/.*$/, '');
  return /^[a-z0-9][a-z0-9-]*$/.test(s) ? s : null;
}
