import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import {
  epCreateShipment, epBuyShipment, epFetchShipment, epRefundShipment, epTestConnection,
  type EpCreateShipmentInput, type EpAddress,
} from '../../lib/easypost.js';
import { getEasyPostConfig } from '../../lib/settings.js';

const router = Router();

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
    weightGramsEach: i.product.weightGrams ?? 0,
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
    const perUnitOz = ((item.product?.weightGrams ?? 0) as number) / 28.3495;
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
