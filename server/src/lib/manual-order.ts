/**
 * Orders placed by staff for a customer — a phone order, a quote that became
 * a sale, a replacement, a comp. Priced by the same engine as the storefront
 * (with a staff override per line), shipped by the same packer and carrier
 * quote, settled by the same code as a paid checkout.
 *
 * Payment is one of:
 *   link — the customer gets an emailed link to a page where they pay with
 *          PayPal or any card, no account needed (the order waits PENDING);
 *   paid — staff already took the money another way (cash, check, PayPal
 *          invoice…), recorded with a reference, and the order is PAID now;
 *   comp — nothing is charged, the order is PAID now.
 */
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { priceForQuantity, type VolumeTier } from './money.js';
import { computePricing, type PricingConfig } from './pricing.js';
import { getSetting } from './settings.js';
import { evaluateCoupon } from './coupons.js';
import { quoteShipping, type ShippingOption, type QuoteAddress } from './shipping-quote.js';
import { itemsRequestProof } from './proofs.js';
import { ensureCustomerAccount } from './customer-accounts.js';
import { newOrderNumber, type StoredShippingQuote } from './checkout-order.js';
import { settlePaidOrder } from './paid-order.js';
import { sendOrderConfirmationEmail, sendPayRequestEmail } from './order-emails.js';
import { orderViewToken } from './order-view.js';
import { isTracked, availableItems } from './inventory.js';
import { assertOfferedOptions } from './order-adjustments.js';

export interface ManualAddress {
  firstName: string; lastName: string; company?: string | null; line1: string; line2?: string | null;
  city: string; region: string; postalCode: string; country: string; phone?: string | null;
}

export interface ManualLineInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  /** Option key → value, as the cart stores them. */
  options?: Record<string, string> | null;
  /** A unit price staff typed, in cents; the engine's price when null. */
  unitPriceCents?: number | null;
}

export type ManualShipping =
  | { mode: 'quote'; optionId?: string | null }
  | { mode: 'manual'; cents: number; name: string };

export type ManualPayment =
  | { mode: 'link' }
  | { mode: 'paid'; provider: string; reference?: string | null }
  | { mode: 'comp' };

export interface ManualDiscount { code?: string | null; cents?: number | null; label?: string | null }
export type ManualTax = { mode: 'auto' } | { mode: 'manual'; cents: number };

export interface ManualOrderInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  shippingAddress: ManualAddress;
  billingAddress?: ManualAddress | null;
  items: ManualLineInput[];
  shipping: ManualShipping;
  discount?: ManualDiscount | null;
  tax?: ManualTax | null;
  payment: ManualPayment;
  notes?: string | null;
  /** Place it even when shelf stock shows short. */
  ignoreStock?: boolean;
  /** Email the customer (the pay link, or the confirmation). Default true. */
  sendEmail?: boolean;
}

/** What the preview takes: the same, but nothing has to be complete yet. */
export interface ManualPreviewInput {
  email?: string | null;
  shippingAddress?: Partial<ManualAddress> | null;
  items: ManualLineInput[];
  shipping: ManualShipping;
  discount?: ManualDiscount | null;
  tax?: ManualTax | null;
  ignoreStock?: boolean;
}

/** How staff can say an order was paid outside the site (mirrored in web/src/pages/admin/OrderNew.tsx). */
export const PAYMENT_METHODS: { key: string; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'check', label: 'Check' },
  { key: 'paypal-invoice', label: 'PayPal invoice / PayPal.me' },
  { key: 'venmo', label: 'Venmo' },
  { key: 'zelle', label: 'Zelle' },
  { key: 'card-terminal', label: 'Card (terminal / over the phone)' },
  { key: 'bank', label: 'Bank transfer / wire' },
  { key: 'other', label: 'Other' },
];
const PAYMENT_KEYS = new Set(PAYMENT_METHODS.map((m) => m.key));

// The same product shape a cart line carries, so the packer and the stock
// check see exactly what checkout shows them.
const lineInclude = {
  stockPool: true, package: true, variants: true,
  options: { select: { name: true, internalKey: true, type: true, required: true, values: { select: { label: true } } } },
} as const;
type ProductForLine = Awaited<ReturnType<typeof loadProducts>>[number];
async function loadProducts(ids: string[]) {
  return prisma.product.findMany({ where: { id: { in: ids } }, include: lineInclude });
}

export interface PricedLine {
  productId: string; variantId: string | null; name: string; quantity: number; options: Record<string, string> | null;
  unitPriceCents: number; enginePriceCents: number; overridden: boolean; totalCents: number;
  /** "out of stock" / "only 3 in stock" when the shelf count is short; null otherwise. */
  stockNote: string | null;
  /** The product's minimum order, when this quantity is under it. */
  belowMinimum: number | null;
  /** Hidden from the store (inactive); staff can still sell it. */
  hidden: boolean;
}
type PricedLineFull = PricedLine & { product: ProductForLine };

/** Same coercion the pricing engine expects: integer-looking strings become numbers. */
function pricingInputs(options: Record<string, string> | null | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(options ?? {})) out[k] = typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : v;
  return out;
}

function isConfigurator(cfg: unknown): cfg is PricingConfig {
  return !!(cfg && typeof cfg === 'object' && Array.isArray((cfg as PricingConfig).qtyTiers));
}

/** Price every line the way the cart would, noting where staff set the price by hand. */
async function priceLines(lines: ManualLineInput[]): Promise<PricedLineFull[]> {
  if (lines.length === 0) throw new HttpError(400, 'Add at least one item to the order.');
  const siteDiscountBps = Number(await getSetting<number | string>('pricing.siteDiscountBps', 0)) || 0;
  const products = await loadProducts([...new Set(lines.map((l) => l.productId))]);
  const out: PricedLineFull[] = [];
  for (const line of lines) {
    const product = products.find((p) => p.id === line.productId);
    if (!product) throw new HttpError(404, 'One of the products no longer exists.');
    const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const entries = Object.entries(line.options ?? {}).filter(([, v]) => v !== '' && v != null);
    const options = entries.length ? Object.fromEntries(entries) : null;
    // Staff pick from the same menu as the store: a retired paper cannot be sold by typing its label.
    assertOfferedOptions(product.options, options ?? {}, undefined, product.name);
    let variant: ProductForLine['variants'][number] | undefined;
    if (line.variantId) {
      variant = product.variants.find((v) => v.id === line.variantId);
      if (!variant) throw new HttpError(400, `${product.name}: that variant no longer exists.`);
    }
    const cfg = product.pricingConfig;
    const base = variant ? variant.priceCents : product.priceCents;
    const enginePriceCents = isConfigurator(cfg)
      ? computePricing(cfg, { quantity, options: pricingInputs(options), siteDiscountBps }).unitCents
      : priceForQuantity(base, quantity, product.volumeTiers as VolumeTier[] | null);
    const override = line.unitPriceCents != null && Number.isFinite(line.unitPriceCents) && line.unitPriceCents >= 0 ? Math.round(line.unitPriceCents) : null;
    const overridden = override != null && override !== enginePriceCents;
    const unitPriceCents = overridden ? override : enginePriceCents;
    let stockNote: string | null = null;
    if (isTracked(product) && !product.backorder) {
      const left = availableItems(product, variant ?? null);
      if (left != null && left < quantity) stockNote = left <= 0 ? 'out of stock' : `only ${left} in stock`;
    }
    out.push({
      productId: product.id, variantId: variant?.id ?? null, name: product.name + (variant ? ` — ${variant.label}` : ''), quantity, options,
      unitPriceCents, enginePriceCents, overridden, totalCents: unitPriceCents * quantity, stockNote,
      belowMinimum: product.minQuantity > quantity ? product.minQuantity : null,
      hidden: !product.active,
      product,
    });
  }
  return out;
}

export interface ManualTotals {
  lines: PricedLine[];
  subtotalCents: number;
  /** Off the goods. */
  discountCents: number;
  /** Off the shipping charge (a code that applies to shipping). */
  shippingDiscountCents: number;
  discountLabel: string | null;
  couponCode: string | null;
  /** The carrier's price for the chosen method, before any code. */
  shippingListCents: number;
  /** Shipping actually charged. */
  shippingCents: number;
  shippingName: string | null;
  shippingOptionId: string | null;
  shippingQuote: StoredShippingQuote | null;
  taxCents: number;
  /** What the tax table says, whether or not it was overridden. */
  taxAutoCents: number;
  totalCents: number;
  /** The options for these boxes to this address (empty until the address can be rated). */
  shippingOptions: { id: string; name: string; rateCents: number; estimatedDays: string | null; boxes: number }[];
  shippingError: string | null;
  /** Stock, minimum-quantity and hidden-product notes, one per line that has one. */
  warnings: string[];
  stockShort: boolean;
}

const quoteItems = (lines: PricedLineFull[]) => lines.map((l) => ({ quantity: l.quantity, options: l.options, product: l.product }));

function canRate(a: Partial<ManualAddress> | null | undefined): a is Partial<ManualAddress> & { postalCode: string; country: string } {
  return !!(a && a.postalCode && a.postalCode.trim() && a.country);
}

/** Everything the order would be, before it exists: lines, shipping choices, discount, tax, total. */
async function build(input: ManualPreviewInput): Promise<{ totals: ManualTotals; priced: PricedLineFull[] }> {
  const priced = await priceLines(input.items);
  const subtotalCents = priced.reduce((s, l) => s + l.totalCents, 0);
  const warnings: string[] = [];
  let stockShort = false;
  for (const l of priced) {
    if (l.stockNote) { stockShort = true; warnings.push(`${l.name}: ${l.stockNote}`); }
    if (l.belowMinimum) warnings.push(`${l.name}: below the store minimum of ${l.belowMinimum}`);
    if (l.hidden) warnings.push(`${l.name}: hidden from the store`);
  }
  const a = input.shippingAddress ?? null;

  // Shipping: the options for these boxes to this address, and the one chosen.
  let shippingOptions: ManualTotals['shippingOptions'] = [];
  let shippingError: string | null = null;
  let shippingListCents = 0; let shippingName: string | null = null; let shippingOptionId: string | null = null; let shippingQuote: StoredShippingQuote | null = null;
  if (canRate(a)) {
    const address: QuoteAddress = { line1: a.line1 ?? undefined, line2: a.line2 ?? undefined, city: a.city ?? undefined, region: a.region ?? undefined, postalCode: a.postalCode.trim(), country: a.country };
    let options: ShippingOption[] = [];
    try {
      const q = await quoteShipping({ items: quoteItems(priced), address, subtotalCents });
      options = q.options;
      shippingOptions = q.options.map((o) => ({ id: o.id, name: o.name, rateCents: o.rateCents, estimatedDays: o.estimatedDays ?? null, boxes: q.boxes }));
      if (q.liveError && q.options.length === 0) shippingError = q.liveError;
    } catch (e: any) { shippingError = e?.message ?? 'Could not quote shipping'; }
    if (input.shipping.mode === 'quote' && input.shipping.optionId) {
      // Priced from the quote just run, never from a number the browser sent.
      const wanted = input.shipping.optionId;
      const chosen = options.find((o) => o.id === wanted);
      if (chosen) {
        shippingListCents = chosen.rateCents; shippingName = chosen.name; shippingOptionId = chosen.id;
        if (chosen.breakdown) shippingQuote = { ...chosen.breakdown, optionId: chosen.id, name: chosen.name, chargedCents: chosen.rateCents, quotedAt: new Date().toISOString() };
      } else if (!shippingError) {
        shippingError = options.length ? 'That shipping option is no longer offered — pick another.' : 'No shipping options for this address yet.';
      }
    }
  } else if (input.shipping.mode === 'quote') {
    shippingError = 'Enter the postal code and country to quote shipping.';
  }
  if (input.shipping.mode === 'manual') {
    shippingListCents = Math.max(0, Math.round(Number(input.shipping.cents) || 0));
    shippingName = (input.shipping.name ?? '').trim() || 'Shipping';
    shippingOptionId = null;
    shippingError = null;
  }

  // Discount: a code (the storefront's rules), or an amount staff typed.
  let discountCents = 0; let shippingDiscountCents = 0; let discountLabel: string | null = null; let couponCode: string | null = null;
  const code = input.discount?.code?.trim();
  if (code) {
    const ev = await evaluateCoupon(code, subtotalCents, { shippingCents: shippingListCents });
    if (!ev.ok) throw new HttpError(400, `Discount code ${code.toUpperCase()}: ${ev.reason ?? 'not valid.'}`);
    discountCents = ev.discountCents; shippingDiscountCents = ev.shippingDiscountCents; couponCode = ev.coupon?.code ?? code.toUpperCase(); discountLabel = couponCode;
  } else if (input.discount?.cents && input.discount.cents > 0) {
    discountCents = Math.min(subtotalCents, Math.round(input.discount.cents));
    discountLabel = input.discount.label?.trim() || 'Discount';
  }
  const shippingCents = Math.max(0, shippingListCents - shippingDiscountCents);
  if (shippingQuote) shippingQuote.chargedCents = shippingCents;

  // Tax: the storefront's rule (the table's rate for the region, on the goods after the discount), or an amount.
  let taxAutoCents = 0;
  if (a?.region) {
    const rate = await prisma.taxRate.findFirst({ where: { region: a.region, country: a.country || 'US' } });
    if (rate) taxAutoCents = Math.floor(((subtotalCents - discountCents) * rate.rateBps) / 10_000);
  }
  const taxCents = input.tax && input.tax.mode === 'manual' ? Math.max(0, Math.round(Number(input.tax.cents) || 0)) : taxAutoCents;

  const totalCents = Math.max(0, subtotalCents - discountCents + taxCents + shippingCents);
  const totals: ManualTotals = {
    lines: priced.map(({ product: _p, ...l }) => l),
    subtotalCents, discountCents, shippingDiscountCents, discountLabel, couponCode,
    shippingListCents, shippingCents, shippingName, shippingOptionId, shippingQuote,
    taxCents, taxAutoCents, totalCents, shippingOptions, shippingError, warnings, stockShort,
  };
  return { totals, priced };
}

export async function previewManualOrder(input: ManualPreviewInput): Promise<ManualTotals> {
  return (await build(input)).totals;
}

export interface Actor { userId: string | null; email: string | null; name: string | null }

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Create the order. For a pay link, the link is returned (and emailed unless told not to). */
export async function createManualOrder(input: ManualOrderInput, actor: Actor) {
  const email = (input.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'Enter the customer’s email address.');
  const a = input.shippingAddress;
  for (const [k, label] of [['firstName', 'first name'], ['lastName', 'last name'], ['line1', 'street address'], ['city', 'city'], ['postalCode', 'postal code'], ['country', 'country']] as const) {
    if (!String(a?.[k] ?? '').trim()) throw new HttpError(400, `The shipping address needs a ${label}.`);
  }
  const phone = String(a.phone ?? '').replace(/\D/g, '');
  if (phone.length < 7) throw new HttpError(400, 'The shipping address needs a phone number — the carriers require one.');
  if (input.payment.mode === 'paid' && !PAYMENT_KEYS.has(input.payment.provider)) throw new HttpError(400, 'Choose how the order was paid.');

  const { totals, priced } = await build(input);
  if (input.shipping.mode === 'quote' && !totals.shippingName) {
    throw new HttpError(400, totals.shippingError ?? 'Pick a shipping method, or enter the shipping charge by hand.');
  }
  if (totals.stockShort && !input.ignoreStock) {
    throw new HttpError(400, `${totals.warnings.filter((w) => /in stock|out of stock/.test(w)).join('; ')}. Tick “sell anyway” to place it regardless.`);
  }

  const user = await ensureCustomerAccount(email, { firstName: input.firstName ?? a.firstName, lastName: input.lastName ?? a.lastName });
  const paidNow = input.payment.mode !== 'link' || totals.totalCents === 0;
  const provider = totals.totalCents === 0 ? 'none' : input.payment.mode === 'paid' ? input.payment.provider : input.payment.mode === 'comp' ? 'comp' : 'paypal';
  const reference = input.payment.mode === 'paid' ? input.payment.reference?.trim() || null : null;
  const by = actor.name ?? actor.email ?? 'staff';

  const how = totals.totalCents === 0 ? 'nothing to pay'
    : input.payment.mode === 'paid' ? `paid by ${PAYMENT_METHODS.find((m) => m.key === provider)?.label ?? provider}${reference ? ` (${reference})` : ''}`
    : input.payment.mode === 'comp' ? 'no charge'
    : 'awaiting payment by link';
  const notes: string[] = [];
  for (const l of priced) if (l.overridden) notes.push(`${l.name} priced by hand at ${money(l.unitPriceCents)} (list ${money(l.enginePriceCents)})`);
  if (totals.discountLabel && !totals.couponCode) notes.push(`${totals.discountLabel}: ${money(totals.discountCents)} off`);
  if (input.shipping.mode === 'manual') notes.push(`shipping entered by hand: ${totals.shippingName} ${money(totals.shippingListCents)}`);
  if (input.tax?.mode === 'manual') notes.push(`tax entered by hand: ${money(totals.taxCents)} (table says ${money(totals.taxAutoCents)})`);
  if (totals.warnings.length) notes.push(...totals.warnings);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        number: newOrderNumber(),
        userId: user.id,
        email,
        status: paidNow ? 'PAID' : 'PENDING',
        paymentStatus: paidNow ? 'CAPTURED' : 'PENDING',
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        couponCode: totals.couponCode,
        taxCents: totals.taxCents,
        shippingCents: totals.shippingCents,
        totalCents: totals.totalCents,
        shippingAddress: a as any,
        billingAddress: (input.billingAddress ?? a) as any,
        shippingMethod: totals.shippingName,
        shippingQuote: totals.shippingQuote ? (totals.shippingQuote as any) : undefined,
        notes: input.notes?.trim() || null,
        source: 'admin',
        proofStatus: itemsRequestProof(priced.map((l) => ({ options: l.options }))) ? 'requested' : null,
        items: {
          create: priced.map((l) => ({
            productId: l.productId, variantId: l.variantId, name: l.name, options: l.options ?? undefined,
            quantity: l.quantity, unitPriceCents: l.unitPriceCents, totalCents: l.totalCents,
          })),
        },
      },
    });
    // A pay link's PayPal payment row is written when the customer actually
    // starts paying; nothing is recorded until then.
    if (paidNow) {
      await tx.payment.create({ data: { orderId: created.id, provider, providerRef: reference, amountCents: totals.totalCents, status: 'CAPTURED' } });
    }
    await tx.orderStatusEvent.create({
      data: {
        orderId: created.id, kind: 'status', fromStatus: null, toStatus: created.status,
        actorId: actor.userId, actorName: by,
        message: `Order created by ${by} — ${how}${notes.length ? `. ${notes.join('; ')}` : ''}`,
      },
    });
    return created;
  });

  let payLink: string | null = null;
  let emailed = false;
  let emailError: string | null = null;
  if (paidNow) {
    await settlePaidOrder(order.id);
    if (input.sendEmail !== false) { void sendOrderConfirmationEmail(order.id); emailed = true; }
  } else {
    payLink = await orderPayLink(order.id, order.number);
    if (input.sendEmail !== false) {
      const r = await sendPayRequestEmail(order.id, payLink);
      emailed = r.sent; emailError = r.error ?? null;
    }
  }
  return { order, payLink, emailed, emailError, totals };
}

/** The page where the customer pays for this order — no sign-in, the link is the key (30 days). */
export async function orderPayLink(orderId: string, number: string): Promise<string> {
  const base = ((await getSetting<string>('store.publicUrl')) || process.env.PUBLIC_URL || 'https://printingcomics.com').replace(/\/$/, '');
  return `${base}/order/${encodeURIComponent(number)}?t=${encodeURIComponent(orderViewToken(orderId))}&pay=1`;
}

/**
 * Can the customer pay for this order on its page? Only a staff-created order
 * that is still waiting for its money — and not one whose PayPal payment is
 * already in flight (an eCheck clearing), which must not be paid twice.
 */
export async function orderPayable(order: { id: string; source: string | null; status: string; paymentStatus: string; totalCents: number }): Promise<boolean> {
  if (!(order.source === 'admin' && order.status === 'PENDING' && order.paymentStatus === 'PENDING' && order.totalCents > 0)) return false;
  const pending = await prisma.payment.findMany({ where: { orderId: order.id, status: 'PENDING' }, select: { rawPayload: true } });
  return !pending.some((p) => p.rawPayload != null);
}

/** Staff took the money another way: record it and settle the order as paid. */
export async function markOrderPaid(orderId: string, how: { provider: string; reference?: string | null }, actor: Actor) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new HttpError(404, 'Order not found');
  if (order.paymentStatus === 'CAPTURED') throw new HttpError(409, 'This order is already paid.');
  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') throw new HttpError(409, `This order is ${order.status.toLowerCase()}; it cannot be marked paid.`);
  if (!PAYMENT_KEYS.has(how.provider)) throw new HttpError(400, 'Choose how the order was paid.');
  const reference = how.reference?.trim() || null;
  const by = actor.name ?? actor.email ?? 'staff';
  const label = PAYMENT_METHODS.find((m) => m.key === how.provider)?.label ?? how.provider;
  await prisma.$transaction(async (tx) => {
    // A PayPal approval the customer never finished is just clutter now; a
    // payment PayPal is still clearing (it has PayPal's answer stored) stays.
    const pending = await tx.payment.findMany({ where: { orderId, status: 'PENDING' }, select: { id: true, rawPayload: true } });
    const stale = pending.filter((p) => p.rawPayload == null).map((p) => p.id);
    if (stale.length) await tx.payment.deleteMany({ where: { id: { in: stale } } });
    await tx.payment.create({ data: { orderId, provider: how.provider, providerRef: reference, amountCents: order.totalCents, status: 'CAPTURED' } });
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'CAPTURED', status: order.status === 'PENDING' ? 'PAID' : order.status } });
    await tx.orderStatusEvent.create({
      data: {
        orderId, kind: 'payment', fromStatus: order.paymentStatus, toStatus: 'CAPTURED', actorId: actor.userId, actorName: by,
        message: `Marked paid by ${by} — ${label}${reference ? ` (${reference})` : ''}`,
      },
    });
  });
  await settlePaidOrder(orderId);
  void sendOrderConfirmationEmail(orderId);
  return prisma.order.findUnique({ where: { id: orderId } });
}
