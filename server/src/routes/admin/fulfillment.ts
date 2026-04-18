import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import {
  plpCreateShipment, plpGetRates, plpTestConnection, plpFetchShipment, plpGetLabels,
  type PlpCreateShipmentInput,
} from '../../lib/packlinkpro.js';
import { getPacklinkConfig } from '../../lib/settings.js';

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

// ============ Packlink Pro operations ============

function inToCm(inches: number): number { return Math.max(1, Math.round(inches * 2.54)); }
function ozToKg(oz: number): number { return Math.max(0.01, +(oz * 0.0283495).toFixed(2)); }

async function buildShipmentInput(orderId: string, packageId: string, serviceId?: number): Promise<PlpCreateShipmentInput> {
  const cfg = await getPacklinkConfig();
  if (!cfg.fromPostalCode) throw new HttpError(400, 'Set your sender postal code in admin settings first');
  if (!cfg.fromName) throw new HttpError(400, 'Set your sender name in admin settings first');

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
  const summary = order.items.slice(0, 3).map((i) => `${i.quantity}× ${i.name}`).join('; ');

  return {
    service_id: serviceId ?? 0,
    content: summary || `Order ${order.number}`,
    content_value: Math.max(1, Math.round(order.subtotalCents / 100)),
    currency: 'USD',
    from: {
      name: cfg.fromName,
      company: cfg.fromCompany || undefined,
      email: cfg.fromEmail || undefined,
      phone: cfg.fromPhone || undefined,
      street1: cfg.fromStreet1,
      street2: cfg.fromStreet2 || undefined,
      city: cfg.fromCity,
      state: cfg.fromState || undefined,
      zip_code: cfg.fromPostalCode,
      country: cfg.fromCountry,
    },
    to: {
      name: `${ship.firstName ?? ''} ${ship.lastName ?? ''}`.trim() || order.email,
      company: ship.company ?? undefined,
      email: order.email,
      phone: ship.phone ?? undefined,
      street1: ship.line1,
      street2: ship.line2 ?? undefined,
      city: ship.city,
      state: ship.region ?? undefined,
      zip_code: ship.postalCode,
      country: ship.country ?? 'US',
    },
    packages: [{
      length: inToCm(pkg.lengthIn),
      width: inToCm(pkg.widthIn),
      height: inToCm(pkg.heightIn),
      weight: ozToKg(totalWeightOz),
    }],
    additional_data: { order_number: order.number },
  };
}

router.get('/packlink/test', async (_req, res) => {
  const cfg = await getPacklinkConfig();
  if (!cfg.fromPostalCode) throw new HttpError(400, 'Set your sender postal code before testing');
  try {
    const result = await plpTestConnection(cfg.fromCountry, cfg.fromPostalCode);
    res.json(result);
  } catch (e: any) {
    throw new HttpError(502, e.message ?? 'Packlink test failed');
  }
});

const ratesSchema = z.object({
  orderId: z.string(),
  packageId: z.string(),
});
router.post('/packlink/rates', async (req, res) => {
  const { orderId, packageId } = ratesSchema.parse(req.body);
  const cfg = await getPacklinkConfig();
  if (!cfg.fromPostalCode) throw new HttpError(400, 'Set your sender postal code in admin settings first');

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

  const services = await plpGetRates({
    fromCountry: cfg.fromCountry,
    fromPostalCode: cfg.fromPostalCode,
    toCountry: ship.country ?? 'US',
    toPostalCode: ship.postalCode,
    priceCents: order.subtotalCents,
    weightKg: ozToKg(totalWeightOz),
  });
  res.json({ services, weightKg: ozToKg(totalWeightOz) });
});

const pushSchema = z.object({ packageId: z.string(), serviceId: z.number() });
router.post('/packlink/push/:orderId', async (req, res) => {
  const { packageId, serviceId } = pushSchema.parse(req.body);
  const input = await buildShipmentInput(req.params.orderId, packageId, serviceId);
  const shipment = await plpCreateShipment(input);

  await prisma.orderStatusEvent.create({
    data: {
      orderId: req.params.orderId,
      kind: 'fulfillment',
      message: `Pushed to Packlink Pro (ref=${shipment.reference}, ${shipment.carrier_name} ${shipment.service_name})`,
    },
  });
  res.json({ ok: true, shipment });
});

router.get('/packlink/shipments/:reference', async (req, res) => {
  const shipment = await plpFetchShipment(req.params.reference);
  res.json({ shipment });
});

router.get('/packlink/shipments/:reference/labels', async (req, res) => {
  const labels = await plpGetLabels(req.params.reference);
  res.json({ labels });
});

export default router;
