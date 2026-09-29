/**
 * Stock for goods kept on a shelf (mailers, Comic Armor…): products with
 * madeToOrder = false. Printed-to-order products never touch this.
 *
 * Two shapes:
 *   - a product with its own `stock` (or per-variant `stock`)
 *   - separate listings that sell from ONE pile: they point at a StockPool
 *     and each says how many units one of it takes (unitsPerItem). The five
 *     T-Mailer pack sizes share one pool of mailers this way.
 *
 * Rules: adding to the cart and placing the order check stock unless the
 * product is on backorder (backorder sells ahead of stock by design); a paid
 * order consumes stock once (called inside the paid-order CAS); stock never
 * goes below zero.
 */
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';

export interface StockView {
  name: string;
  madeToOrder: boolean;
  backorder: boolean;
  stock: number;
  unitsPerItem: number;
  stockPool: { units: number } | null;
}

/** How many of this listing could be bought right now; null when not tracked. */
export function availableItems(p: StockView, variant?: { stock: number } | null): number | null {
  if (p.madeToOrder) return null;
  if (p.stockPool) return Math.floor(Math.max(0, p.stockPool.units) / Math.max(1, p.unitsPerItem));
  return variant ? variant.stock : p.stock;
}

/**
 * Throw if `quantity` more of this listing cannot be sold. `already` is what
 * the cart holds against the same stock: units for a pooled product, items
 * for a plain one (see unitsAlreadyInCart).
 */
export function assertInStock(p: StockView, quantity: number, variant?: { stock: number; label: string } | null, already = 0): void {
  if (p.madeToOrder || p.backorder) return;
  const label = `${p.name}${variant ? ` (${variant.label})` : ''}`;
  if (p.stockPool) {
    const upi = Math.max(1, p.unitsPerItem);
    if (p.stockPool.units <= 0) throw new HttpError(409, `${label} is out of stock.`);
    const left = Math.floor(Math.max(0, p.stockPool.units - already) / upi);
    if (quantity > left) {
      throw new HttpError(409, already > 0
        ? `Only ${left} more of ${label} can be added — the rest of your cart is already using the same stock.`
        : `Only ${left} of ${label} left in stock.`);
    }
    return;
  }
  const available = variant ? variant.stock : p.stock;
  if (available <= 0) throw new HttpError(409, `${label} is out of stock.`);
  if (quantity + already > available) {
    throw new HttpError(409, already > 0
      ? `Only ${available} of ${label} left in stock and ${already} are already in your cart.`
      : `Only ${available} of ${label} left in stock.`);
  }
}

/** What the cart already holds against this listing's stock (units for a pool, items otherwise). */
export async function unitsAlreadyInCart(
  cartId: string,
  product: { id: string; stockPoolId: string | null },
  variantId: string | null | undefined,
  excludeItemId?: string,
): Promise<number> {
  const exclude = excludeItemId ? { id: { not: excludeItemId } } : {};
  if (product.stockPoolId) {
    const rows = await prisma.cartItem.findMany({
      where: { cartId, product: { stockPoolId: product.stockPoolId }, ...exclude },
      select: { quantity: true, product: { select: { unitsPerItem: true } } },
    });
    return rows.reduce((s, r) => s + r.quantity * Math.max(1, r.product.unitsPerItem), 0);
  }
  const agg = await prisma.cartItem.aggregate({
    where: { cartId, productId: product.id, variantId: variantId ?? null, ...exclude },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

/** Whole-cart check at checkout: pooled lines are summed per pool. */
export function assertCartInStock(
  items: Array<{ quantity: number; variant?: { stock: number; label: string } | null; product: StockView & { id: string; stockPoolId: string | null } }>,
): void {
  const poolUsed = new Map<string, number>();
  const plainUsed = new Map<string, number>();
  for (const it of items) {
    const p = it.product;
    if (p.madeToOrder || p.backorder) continue;
    if (p.stockPoolId) {
      const before = poolUsed.get(p.stockPoolId) ?? 0;
      assertInStock(p, it.quantity, it.variant ?? null, before);
      poolUsed.set(p.stockPoolId, before + it.quantity * Math.max(1, p.unitsPerItem));
    } else {
      const key = `${p.id}:${it.variant ? 'v' : ''}`;
      const before = plainUsed.get(key) ?? 0;
      assertInStock(p, it.quantity, it.variant ?? null, before);
      plainUsed.set(key, before + it.quantity);
    }
  }
}

/**
 * Take a paid order's shelf lines out of stock. Callers guard with the
 * payment CAS so a webhook and a browser capture cannot both consume.
 */
export async function consumeStockForOrder(orderId: string): Promise<void> {
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: {
      quantity: true, variantId: true,
      product: { select: { id: true, madeToOrder: true, stock: true, stockPoolId: true, unitsPerItem: true } },
    },
  });
  for (const it of items) {
    const p = it.product;
    if (p.madeToOrder) continue;
    if (p.stockPoolId) {
      const pool = await prisma.stockPool.findUnique({ where: { id: p.stockPoolId }, select: { units: true } });
      if (pool) await prisma.stockPool.update({ where: { id: p.stockPoolId }, data: { units: Math.max(0, pool.units - it.quantity * Math.max(1, p.unitsPerItem)) } });
      continue;
    }
    if (it.variantId) {
      const v = await prisma.productVariant.findUnique({ where: { id: it.variantId }, select: { stock: true } });
      if (v) await prisma.productVariant.update({ where: { id: it.variantId }, data: { stock: Math.max(0, v.stock - it.quantity) } });
      continue;
    }
    await prisma.product.update({ where: { id: p.id }, data: { stock: Math.max(0, p.stock - it.quantity) } });
  }
}
