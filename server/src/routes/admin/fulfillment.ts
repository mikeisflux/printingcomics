import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import {
  epCreateShipment, epBuyShipment, epFetchShipment, epRefundShipment, epTestConnection,
  type EpCreateShipmentInput, type EpAddress,
} from '../../lib/easypost.js';
import { autoPack, type PackageOption } from '../../lib/auto-pack.js';
import { getEasyPostConfig } from '../../lib/settings.js';

const router = Router();

/**
 * Per-unit shipping weight (grams) for an order line. Art prints price and ship
 * by size: the product carries a `pricingConfig.sizeWeightsGrams` map keyed by
 * the selected `print_size` option, so a comic-size metal print (82 g) isn't
 * billed as a full 11×17 sheet (164 g). Falls back to the product's flat
 * `weightGrams` for everything else.
 */
function perUnitWeightGrams(item: {
  options?: unknown;
  product?: { weightGrams?: number | null; pricingConfig?: unknown } | null;
}): number {
  const cfg = item.product?.pricingConfig as { sizeWeightsGrams?: Record<string, number> } | null | undefined;
  const size = (item.options as Record<string, unknown> | null | undefined)?.['print_size'];
  if (cfg?.sizeWeightsGrams && typeof size === 'string') {
    const g = cfg.sizeWeightsGrams[size];
    if (typeof g === 'number') return g;
  }
  return item.product?.weightGrams ?? 0;
}

// ============ Packages CRUD ============

const packageSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  lengthIn: z.number().positive(),
  widthIn: z.number().positive(),
  heightIn: z.number().positive(),
  emptyWeightOz: z.number().min(0).default(0),
  maxWeightOz: z.number().positive().optional(),
  costCents: z.number().int().min(0).default(0),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.get('/packages', async (_req, res) => {
  const items = await prisma.package.findMany({
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  res.json({ items });
});

router.post('/packages', async (req, res) => {
  const data = packageSchema.parse(req.body);
  if (data.isDefault) {
    await prisma.package.updateMany({ data: { isDefault: false } });
  }
  const created = await prisma.package.create({ data });
  res.json({ item: created });
});

router.put('/packages/:id', async (req, res) => {
  const data = packageSchema.parse(req.body);
  if (data.isDefault) {
    await prisma.package.updateMany({
      where: { id: { not: req.params.id } },
      data: { isDefault: false },
    });
  }
  const updated = await prisma.package.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ item: updated });
});

router.delete('/packages/:id', async (req, res) => {
  await prisma.package.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ============ EasyPost — shared helpers ============

async function fromAddress(): Promise<EpAddress> {
  const cfg = await getEasyPostConfig();
  if (!cfg.fromPostalCode) throw new HttpError(400, 'Set your sender postal code in admin settings first');
  if (!cfg.fromName) throw new HttpError(400, 'Set your sender name in admin settings first');
  return {
    name: cfg.fromName,
    company: cfg.fromCompany || undefined,
    email: cfg.fromEmail || undefined,
    phone: cfg.fromPhone || undefined,
    street1: cfg.fromStreet1,
    street2: cfg.fromStreet2 || undefined,
    city: cfg.fromCity,
    state: cfg.fromState || undefined,
    zip: cfg.fromPostalCode,
    country: cfg.fromCountry || 'US',
  };
}

function toAddressFromOrder(order: { email: string; shippingAddress: unknown }): EpAddress {
  const ship: any = order.shippingAddress;
  return {
    name: `${ship.firstName ?? ''} ${ship.lastName ?? ''}`.trim() || order.email,
    company: ship.company ?? undefined,
    email: order.email,
    phone: ship.phone ?? undefined,
    street1: ship.line1,
    street2: ship.line2 ?? undefined,
    city: ship.city,
    state: ship.region ?? undefined,
    zip: ship.postalCode,
    country: ship.country ?? 'US',
  };
}

router.get('/easypost/test', async (_req, res) => {
  const from = await fromAddress();
  const to: EpAddress = {
    name: 'EasyPost Test', street1: '417 Montgomery St', city: 'San Francisco',
    state: 'CA', zip: '94104', country: 'US',
  };
  try {
    const result = await epTestConnection(from, to);
    res.json(result);
  } catch (e: any) {
    res.status(502).json({ ok: false, error: e.message ?? 'EasyPost test failed' });
  }
});

// ============ Shipments: list / create / buy / refund ============

/** List shipments on an order, with enough info for the admin UI to render
 *  both the "already built" list and the remaining-to-pack item pool. */
router.get('/orders/:orderId/shipments', async (req, res) => {
  const [order, shipments] = await Promise.all([
    prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: { items: { include: { product: true } } },
    }),
    prisma.shipment.findMany({
      where: { orderId: req.params.orderId },
      orderBy: { createdAt: 'asc' },
      include: { items: true, package: true },
    }),
  ]);
  if (!order) throw new HttpError(404, 'Order not found');

  // Compute remaining quantity per order item (total qty − already-allocated qty).
  const allocatedByItem = new Map<string, number>();
  for (const s of shipments) {
    for (const si of s.items) {
      allocatedByItem.set(si.orderItemId, (allocatedByItem.get(si.orderItemId) ?? 0) + si.quantity);
    }
  }
  const remaining = order.items.map((i) => ({
    orderItemId: i.id,
    name: i.name,
    unitPriceCents: i.unitPriceCents,
    totalQuantity: i.quantity,
    remaining: Math.max(0, i.quantity - (allocatedByItem.get(i.id) ?? 0)),
    weightGramsEach: perUnitWeightGrams(i),
  }));

  res.json({ shipments, remaining });
});

const createSchema = z.object({
  packageId: z.string(),
  allocations: z.array(z.object({
    orderItemId: z.string(),
    quantity: z.number().int().positive(),
  })).min(1),
});

/** Create a Shipment record for an order, fetch EasyPost rates for it, and
 *  return the rates. The Shipment is persisted in CREATED status; no label
 *  is purchased yet. */
router.post('/orders/:orderId/shipments', async (req, res) => {
  const { packageId, allocations } = createSchema.parse(req.body);

  const order = await prisma.order.findUnique({
    where: { id: req.params.orderId },
    include: { items: { include: { product: true } }, shipments: { include: { items: true } } },
  });
  if (!order) throw new HttpError(404, 'Order not found');

  const pkg = await prisma.package.findUnique({ where: { id: packageId } });
  if (!pkg) throw new HttpError(404, 'Package not found');

  // Validate allocation against remaining quantities.
  const allocatedByItem = new Map<string, number>();
  for (const s of order.shipments) {
    for (const si of s.items) {
      allocatedByItem.set(si.orderItemId, (allocatedByItem.get(si.orderItemId) ?? 0) + si.quantity);
    }
  }
  let contentWeightOz = 0;
  let insuredValueCents = 0;
  for (const a of allocations) {
    const item = order.items.find((i: any) => i.id === a.orderItemId);
    if (!item) throw new HttpError(400, `Order item ${a.orderItemId} not on this order`);
    const alreadyAllocated = allocatedByItem.get(a.orderItemId) ?? 0;
    if (alreadyAllocated + a.quantity > item.quantity) {
      throw new HttpError(400, `Allocation for "${item.name}" exceeds remaining qty (${item.quantity - alreadyAllocated} left)`);
    }
    const perUnitOz = perUnitWeightGrams(item) / 28.3495;
    contentWeightOz += perUnitOz * a.quantity;
    insuredValueCents += (item.unitPriceCents as number) * a.quantity;
  }
  const totalWeightOz = Math.max(0.5, +(contentWeightOz + pkg.emptyWeightOz).toFixed(2));

  const from = await fromAddress();
  const to = toAddressFromOrder(order);

  const input: EpCreateShipmentInput = {
    from_address: from,
    to_address: to,
    parcel: {
      length: pkg.lengthIn,
      width: pkg.widthIn,
      height: pkg.heightIn,
      weight: totalWeightOz,
    },
    options: { label_format: 'PDF', print_custom_1: order.number },
    reference: order.number,
  };
  const epShipment = await epCreateShipment(input);

  const shipment = await prisma.shipment.create({
    data: {
      orderId: order.id,
      packageId: pkg.id,
      easypostId: epShipment.id,
      weightOz: totalWeightOz,
      lengthIn: pkg.lengthIn,
      widthIn: pkg.widthIn,
      heightIn: pkg.heightIn,
      insuredValueCents,
      status: 'CREATED',
      items: {
        create: allocations.map((a) => ({
          orderItemId: a.orderItemId,
          quantity: a.quantity,
        })),
      },
    },
    include: { items: true },
  });

  res.json({
    shipment,
    rates: epShipment.rates ?? [],
    insuredValueCents,
  });
});

/** Auto-pack: given an order's remaining un-allocated items and the active
 *  Package catalog, run first-fit-decreasing bin-packing and create one
 *  Shipment per box with EasyPost rates pre-fetched. Admin still picks
 *  which rate to buy per box — this just eliminates the manual allocation
 *  step for every new shipment.
 *
 *  Response includes an `estimatedShippingCents` rollup (sum of cheapest
 *  rate per box, plus the per-box "insurance cost" at 1% of insured value)
 *  so the admin can quote / bill shipping to the customer in one glance. */
router.post('/orders/:orderId/auto-pack', async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.orderId },
    include: {
      items: { include: { product: true } },
      shipments: { include: { items: true } },
    },
  });
  if (!order) throw new HttpError(404, 'Order not found');

  const packages = await prisma.package.findMany({ where: { active: true } });
  if (packages.length === 0) {
    throw new HttpError(400, 'Define at least one active Package in /admin/fulfillment before auto-packing');
  }

  // Build the pool of units still needing to be packed. Subtract anything
  // already allocated into existing Shipments (so re-running auto-pack is
  // safe — it only adds boxes for what's left).
  const allocated = new Map<string, number>();
  for (const s of order.shipments) {
    for (const si of s.items) {
      allocated.set(si.orderItemId, (allocated.get(si.orderItemId) ?? 0) + si.quantity);
    }
  }
  const units: { orderItemId: string; weightOz: number }[] = [];
  for (const item of (order.items as any[])) {
    const remaining = item.quantity - (allocated.get(item.id) ?? 0);
    if (remaining <= 0) continue;
    // Default to 1oz per unit if a product is missing weightGrams — better
    // than packing 1000 weightless items into one mailer and then having
    // USPS reject it.
    const perUnitOz = (perUnitWeightGrams(item) / 28.3495) || 1;
    for (let i = 0; i < remaining; i++) {
      units.push({ orderItemId: item.id, weightOz: perUnitOz });
    }
  }

  if (units.length === 0) {
    return res.json({ message: 'All items already packed', shipments: [], unpacked: [], estimatedShippingCents: 0 });
  }

  const pkgOptions: PackageOption[] = packages.map((p: any) => ({
    id: p.id,
    name: p.name,
    maxWeightOz: p.maxWeightOz,
    emptyWeightOz: p.emptyWeightOz,
    lengthIn: p.lengthIn,
    widthIn: p.widthIn,
    heightIn: p.heightIn,
  }));
  const plan = autoPack(units, pkgOptions);

  // For each planned box, actually create a Shipment record and fetch rates
  // from EasyPost. Errors on one box don't rollback — we still return what
  // we got so the admin can see progress.
  const from = await fromAddress();
  const to = toAddressFromOrder(order);
  const itemById = new Map<string, any>((order.items as any[]).map((i: any) => [i.id, i]));
  const created: Array<{ shipment: any; rates: any[]; insuredValueCents: number; cheapestCents: number | null }> = [];

  for (const box of plan.boxes) {
    const pkg = packages.find((p: any) => p.id === box.packageId) as any;
    if (!pkg) continue;

    let contentWeightOz = 0;
    let insuredValueCents = 0;
    for (const alloc of box.allocations) {
      const it = itemById.get(alloc.orderItemId);
      if (!it) continue;
      const perUnit = (perUnitWeightGrams(it) / 28.3495) || 1;
      contentWeightOz += perUnit * alloc.quantity;
      insuredValueCents += (it.unitPriceCents as number) * alloc.quantity;
    }
    const totalWeightOz = Math.max(0.5, +(contentWeightOz + pkg.emptyWeightOz).toFixed(2));

    const input: EpCreateShipmentInput = {
      from_address: from,
      to_address: to,
      parcel: {
        length: pkg.lengthIn,
        width: pkg.widthIn,
        height: pkg.heightIn,
        weight: totalWeightOz,
      },
      options: { label_format: 'PDF', print_custom_1: order.number },
      reference: order.number,
    };
    const ep = await epCreateShipment(input);
    const rates = ep.rates ?? [];
    const cheapestCents = rates.length > 0
      ? Math.round(Math.min(...rates.map((r) => parseFloat(r.rate))) * 100)
      : null;

    const shipment = await prisma.shipment.create({
      data: {
        orderId: order.id,
        packageId: pkg.id,
        easypostId: ep.id,
        weightOz: totalWeightOz,
        lengthIn: pkg.lengthIn,
        widthIn: pkg.widthIn,
        heightIn: pkg.heightIn,
        insuredValueCents,
        status: 'CREATED',
        items: {
          create: box.allocations.map((a) => ({
            orderItemId: a.orderItemId,
            quantity: a.quantity,
          })),
        },
      },
      include: { items: true },
    });

    created.push({ shipment, rates, insuredValueCents, cheapestCents });
  }

  // Sum cheapest-rate + insurance-fee across all boxes → the number you'd
  // bill the customer if you went with the least expensive option everywhere.
  const estimatedShippingCents = created.reduce(
    (sum, b) => sum + (b.cheapestCents ?? 0) + Math.max(100, Math.round((b.insuredValueCents ?? 0) * 0.01)),
    0,
  );

  await prisma.orderStatusEvent.create({
    data: {
      orderId: order.id,
      kind: 'fulfillment',
      message: `Auto-pack: ${created.length} box${created.length === 1 ? '' : 'es'} created (est. $${(estimatedShippingCents / 100).toFixed(2)} shipping)`,
    },
  });

  res.json({
    shipments: created,
    unpacked: plan.unpacked,
    boxCount: created.length,
    estimatedShippingCents,
  });
});

const buySchema = z.object({ rateId: z.string() });

/** Buy the selected rate for a Shipment. Insurance is always requested at the
 *  shipment's insuredValueCents (= sum of allocated item price × qty). */
router.post('/shipments/:shipmentId/buy', async (req, res) => {
  const { rateId } = buySchema.parse(req.body);

  const shipment = await prisma.shipment.findUnique({
    where: { id: req.params.shipmentId },
    include: { order: true },
  });
  if (!shipment) throw new HttpError(404, 'Shipment not found');
  if (!shipment.easypostId) throw new HttpError(400, 'Shipment has no EasyPost id — recreate it');
  if (shipment.status !== 'CREATED') throw new HttpError(400, `Shipment already ${shipment.status}`);

  // Refetch EasyPost shipment first so we can set the `insurance` field on
  // the buy call (EasyPost accepts insurance on /buy as well).
  const insuranceAmount = ((shipment.insuredValueCents ?? 0) / 100).toFixed(2);

  const bought = await epBuyShipment(shipment.easypostId, rateId, {
    insurance: insuranceAmount,
  });

  const carrier = bought.selected_rate?.carrier ?? null;
  const service = bought.selected_rate?.service ?? null;
  const rateAmount = bought.selected_rate ? Math.round(parseFloat(bought.selected_rate.rate) * 100) : null;
  const method = [carrier, service].filter(Boolean).join(' ') || null;
  const tracking = bought.tracking_code ?? null;
  const labelUrl = bought.postage_label?.label_url ?? null;

  await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      status: 'PURCHASED',
      carrier,
      service,
      trackingCode: tracking,
      labelUrl,
      rateAmountCents: rateAmount,
    },
  });

  // Mirror the latest shipment's summary onto the order for the customer
  // email + public order page, and flip the order to SHIPPED.
  await prisma.order.update({
    where: { id: shipment.orderId },
    data: {
      trackingNumber: tracking,
      shippingMethod: method,
      status: 'SHIPPED',
    },
  });

  await prisma.orderStatusEvent.create({
    data: {
      orderId: shipment.orderId,
      kind: 'fulfillment',
      message: `Label purchased for shipment ${shipment.id}: ${method ?? 'unknown'}${tracking ? ` — tracking ${tracking}` : ''}, insured for $${insuranceAmount}`,
    },
  });

  res.json({ ok: true, easypost: bought });
});

router.post('/shipments/:shipmentId/refund', async (req, res) => {
  const shipment = await prisma.shipment.findUnique({ where: { id: req.params.shipmentId } });
  if (!shipment) throw new HttpError(404, 'Shipment not found');
  if (!shipment.easypostId) throw new HttpError(400, 'Shipment has no EasyPost id');
  const refunded = await epRefundShipment(shipment.easypostId);
  await prisma.shipment.update({
    where: { id: shipment.id },
    data: { status: 'REFUNDED' },
  });
  await prisma.orderStatusEvent.create({
    data: {
      orderId: shipment.orderId,
      kind: 'fulfillment',
      message: `Shipment ${shipment.id} label refund requested`,
    },
  });
  res.json({ ok: true, easypost: refunded });
});

router.delete('/shipments/:shipmentId', async (req, res) => {
  const shipment = await prisma.shipment.findUnique({ where: { id: req.params.shipmentId } });
  if (!shipment) throw new HttpError(404, 'Shipment not found');
  if (shipment.status !== 'CREATED') {
    throw new HttpError(400, `Cannot delete a ${shipment.status} shipment — refund the label first`);
  }
  await prisma.shipment.delete({ where: { id: shipment.id } });
  res.json({ ok: true });
});

router.get('/shipments/:shipmentId/fetch', async (req, res) => {
  const shipment = await prisma.shipment.findUnique({ where: { id: req.params.shipmentId } });
  if (!shipment) throw new HttpError(404, 'Shipment not found');
  if (!shipment.easypostId) throw new HttpError(400, 'Shipment has no EasyPost id');
  const ep = await epFetchShipment(shipment.easypostId);
  res.json({ easypost: ep });
});

export default router;
