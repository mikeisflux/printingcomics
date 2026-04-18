import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import {
  ssCreateOrder, ssGetRates, ssListCarriers, ssTestConnection, type SsCreateOrderInput,
} from '../../lib/shipstation.js';
import { getShipstationConfig } from '../../lib/settings.js';

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

// ============ ShipStation operations ============

router.get('/shipstation/test', async (_req, res) => {
  try {
    const result = await ssTestConnection();
    res.json(result);
  } catch (e: any) {
    throw new HttpError(502, e.message ?? 'ShipStation test failed');
  }
});

router.get('/shipstation/carriers', async (_req, res) => {
  const carriers = await ssListCarriers();
  res.json({ carriers });
});

const ratesSchema = z.object({
  orderId: z.string(),
  packageId: z.string(),
  carrierCode: z.string(),
});
router.post('/shipstation/rates', async (req, res) => {
  const { orderId, packageId, carrierCode } = ratesSchema.parse(req.body);
  const cfg = await getShipstationConfig();
  if (!cfg.fromPostalCode) throw new HttpError(400, 'Set your sender postal code in admin settings first');

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } } },
  });
  if (!order) throw new HttpError(404, 'Order not found');

  const pkg = await prisma.package.findUnique({ where: { id: packageId } });
  if (!pkg) throw new HttpError(404, 'Package not found');

  // Sum product weights
  const productWeightOz = order.items.reduce((sum, i) => {
    const grams = i.product.weightGrams ?? 0;
    const oz = (grams * i.quantity) / 28.3495;
    return sum + oz;
  }, 0);
  const totalWeightOz = Math.max(1, productWeightOz + pkg.emptyWeightOz);

  const ship: any = order.shippingAddress;
  const rates = await ssGetRates({
    carrierCode,
    fromPostalCode: cfg.fromPostalCode,
    toCountry: ship.country ?? 'US',
    toPostalCode: ship.postalCode,
    toState: ship.region,
    weight: { value: totalWeightOz, units: 'ounces' },
    dimensions: {
      length: pkg.lengthIn, width: pkg.widthIn, height: pkg.heightIn, units: 'inches',
    },
    residential: true,
  });
  res.json({ rates, weightOz: totalWeightOz });
});

router.post('/shipstation/push/:orderId', async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.orderId },
    include: { items: true },
  });
  if (!order) throw new HttpError(404, 'Order not found');
  const cfg = await getShipstationConfig();

  const ship: any = order.shippingAddress;
  const bill: any = order.billingAddress ?? order.shippingAddress;

  const input: SsCreateOrderInput = {
    orderNumber: order.number,
    orderDate: order.createdAt.toISOString(),
    orderStatus: order.paymentStatus === 'CAPTURED' ? 'awaiting_shipment' : 'awaiting_payment',
    customerEmail: order.email,
    customerUsername: order.email,
    billTo: {
      name: `${bill.firstName ?? ''} ${bill.lastName ?? ''}`.trim() || order.email,
      company: bill.company ?? undefined,
      street1: bill.line1, street2: bill.line2 ?? undefined,
      city: bill.city, state: bill.region,
      postalCode: bill.postalCode, country: bill.country ?? 'US',
      phone: bill.phone ?? undefined,
    },
    shipTo: {
      name: `${ship.firstName ?? ''} ${ship.lastName ?? ''}`.trim() || order.email,
      company: ship.company ?? undefined,
      street1: ship.line1, street2: ship.line2 ?? undefined,
      city: ship.city, state: ship.region,
      postalCode: ship.postalCode, country: ship.country ?? 'US',
      phone: ship.phone ?? undefined,
      residential: true,
    },
    items: order.items.map((i) => ({
      sku: undefined,
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unitPriceCents / 100,
    })),
    amountPaid: order.totalCents / 100,
    taxAmount: order.taxCents / 100,
    shippingAmount: order.shippingCents / 100,
    internalNotes: order.notes ?? undefined,
  };

  const result = await ssCreateOrder(input);

  await prisma.orderStatusEvent.create({
    data: {
      orderId: order.id,
      kind: 'fulfillment',
      message: `Pushed to ShipStation (orderId=${result.orderId}, key=${result.orderKey})`,
    },
  });
  res.json({ ok: true, shipstation: result });
});

export default router;
