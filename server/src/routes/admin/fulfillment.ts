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

// ============ EasyPost operations ============

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

async function buildShipmentInput(orderId: string, packageId: string): Promise<EpCreateShipmentInput & { orderNumber: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } } },
  });
  if (!order) throw new HttpError(404, 'Order not found');

  const pkg = await prisma.package.findUnique({ where: { id: packageId } });
  if (!pkg) throw new HttpError(404, 'Package not found');

  const productWeightOz = order.items.reduce((sum, i) => {
    const grams = i.product.weightGrams ?? 0;
    const oz = (grams * i.quantity) / 28.3495;
    return sum + oz;
  }, 0);
  const totalWeightOz = Math.max(0.5, productWeightOz + pkg.emptyWeightOz);

  const ship: any = order.shippingAddress;
  const from = await fromAddress();

  return {
    orderNumber: order.number,
    from_address: from,
    to_address: {
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
    },
    parcel: {
      length: pkg.lengthIn,
      width: pkg.widthIn,
      height: pkg.heightIn,
      weight: +totalWeightOz.toFixed(2),
    },
    options: {
      label_format: 'PDF',
      print_custom_1: order.number,
    },
    reference: order.number,
  };
}

router.get('/easypost/test', async (_req, res) => {
  const cfg = await getEasyPostConfig();
  if (!cfg.fromPostalCode) throw new HttpError(400, 'Set your sender postal code before testing');
  const from = await fromAddress();
  // Hit a realistic US→US consumer address for the probe: San Francisco CA.
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

const ratesSchema = z.object({
  orderId: z.string(),
  packageId: z.string(),
});

/** Create a shipment at EasyPost and return the rate options.
 *  Does NOT buy postage — the admin picks a rate next. */
router.post('/easypost/rates', async (req, res) => {
  const { orderId, packageId } = ratesSchema.parse(req.body);
  const input = await buildShipmentInput(orderId, packageId);
  const shipment = await epCreateShipment(input);
  res.json({
    shipmentId: shipment.id,
    rates: shipment.rates ?? [],
    weightOz: input.parcel.weight,
  });
});

const buySchema = z.object({ shipmentId: z.string(), rateId: z.string() });
/** Buy the selected rate. This creates the label and starts tracking. */
router.post('/easypost/buy/:orderId', async (req, res) => {
  const { shipmentId, rateId } = buySchema.parse(req.body);
  const shipment = await epBuyShipment(shipmentId, rateId);

  const carrier = shipment.selected_rate?.carrier ?? null;
  const service = shipment.selected_rate?.service ?? null;
  const method = [carrier, service].filter(Boolean).join(' ') || null;
  const tracking = shipment.tracking_code ?? null;

  await prisma.order.update({
    where: { id: req.params.orderId },
    data: {
      epShipmentId: shipment.id,
      trackingNumber: tracking,
      shippingMethod: method,
      status: 'SHIPPED',
    },
  });

  await prisma.orderStatusEvent.create({
    data: {
      orderId: req.params.orderId,
      kind: 'fulfillment',
      message: `EasyPost label purchased (${method ?? 'unknown'}${tracking ? ` — tracking ${tracking}` : ''})`,
    },
  });
  res.json({ ok: true, shipment });
});

router.get('/easypost/shipments/:id', async (req, res) => {
  const shipment = await epFetchShipment(req.params.id);
  res.json({ shipment });
});

router.post('/easypost/shipments/:id/refund', async (req, res) => {
  const shipment = await epRefundShipment(req.params.id);
  res.json({ shipment });
});

export default router;
