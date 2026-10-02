import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { verifyOrderView } from '../lib/order-view.js';
import { completeMediaRequest, isPrintFileKind, orderFilesNeeded, printFileSlotsFor, removeItemPrintFile, storeItemPrintFile } from '../lib/print-files.js';
import { customerUpload } from './proofs.js';
import { promises as fs } from 'node:fs';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.session!.sub },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, number: true, status: true, paymentStatus: true,
      totalCents: true, subtotalCents: true, shippingCents: true, taxCents: true,
      trackingNumber: true, shippingMethod: true,
      createdAt: true, updatedAt: true,
      items: {
        select: {
          id: true, name: true, quantity: true,
          product: { select: { slug: true, images: { take: 1, orderBy: { sortOrder: 'asc' } } } },
        },
      },
    },
  });
  // "Files needed": a book line without its Cover or Interior PDF, or an open file request.
  const flagged = await Promise.all(orders.map((o) => orderFilesNeeded(o.id)));
  res.json({ orders: orders.map((o, i) => ({ ...o, filesNeeded: flagged[i] })) });
});

// Account dashboard summary: totals + recent orders.
router.get('/summary', requireAuth, async (req, res) => {
  const [count, spentAgg, recent, addresses] = await Promise.all([
    prisma.order.count({ where: { userId: req.session!.sub, paymentStatus: 'CAPTURED' } }),
    prisma.order.aggregate({
      where: { userId: req.session!.sub, paymentStatus: 'CAPTURED' },
      _sum: { totalCents: true },
    }),
    prisma.order.findMany({
      where: { userId: req.session!.sub },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true, number: true, status: true, paymentStatus: true,
        totalCents: true, createdAt: true,
      },
    }),
    prisma.address.count({ where: { userId: req.session!.sub } }),
  ]);
  res.json({
    orderCount: count,
    totalSpentCents: spentAgg._sum.totalCents ?? 0,
    addressCount: addresses,
    recentOrders: recent,
  });
});

// The signed-in owner sees their order; so does whoever holds the view link
// the checkout handed out for it (`?t=`), since a guest's account exists but
// is not signed in until they follow an emailed link.
router.get('/:number', async (req, res) => {
  const number = String(req.params.number);
  const sessionUser = req.session?.sub;
  const linkedOrderId = verifyOrderView(req.query.t);
  if (!sessionUser && !linkedOrderId) throw new HttpError(401, 'Not authenticated');
  const order = await prisma.order.findFirst({
    where: {
      number,
      OR: [
        ...(sessionUser ? [{ userId: sessionUser }] : []),
        ...(linkedOrderId ? [{ id: linkedOrderId }] : []),
      ],
    },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              slug: true,
              name: true,
              pricingConfig: true,
              madeToOrder: true,
              options: { include: { values: true } },
              images: { take: 1, orderBy: { sortOrder: 'asc' } },
            },
          },
          files: { include: { media: { select: { id: true, originalName: true, size: true, url: true } } } },
        },
      },
      mediaRequests: { orderBy: { createdAt: 'desc' }, select: { id: true, message: true, status: true, createdAt: true, fulfilledAt: true } },
      payments: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, provider: true, providerRef: true,
          amountCents: true, status: true, createdAt: true,
        },
      },
      events: {
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true, kind: true, message: true,
          fromStatus: true, toStatus: true,
          createdAt: true,
        },
      },
    },
  });
  if (!order) throw new HttpError(404, 'Order not found');
  // Each line carries its print-file slots (Cover PDF / Interior PDF, or the
  // artwork for a print) with the current file in each; the raw file rows
  // stay out of the customer's view.
  const items = order.items.map(({ files, ...it }) => ({ ...it, printFiles: printFileSlotsFor({ ...it, files }) }));
  // A link viewer sees the order, not the account's actions (reorder…).
  res.json({ order: { ...order, items }, viewer: sessionUser && order.userId === sessionUser ? 'owner' : 'link' });
});

// ---- Print files on a placed order: upload into a slot, as the owner ----
// The order screen in the account is where a customer sends the Cover PDF
// and the Interior PDF for each book — at first, and again when staff ask for
// corrected files. The file is checked (PDF, page count) before it is kept.
router.post('/:number/items/:itemId/files', requireAuth, customerUpload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'No file received');
  const kind = req.body?.kind;
  if (!isPrintFileKind(kind)) {
    await fs.unlink(file.path).catch(() => undefined);
    throw new HttpError(400, 'Say which file this is: cover, interior or artwork.');
  }
  const item = await prisma.orderItem.findFirst({
    where: { id: String(req.params.itemId), order: { number: String(req.params.number), userId: req.session!.sub } },
    select: { id: true },
  });
  if (!item) {
    await fs.unlink(file.path).catch(() => undefined);
    throw new HttpError(404, 'Order line not found');
  }
  const result = await storeItemPrintFile({ orderItemId: item.id, kind, file, uploaderId: req.session!.sub, via: 'account' });
  const refreshed = await prisma.orderItem.findUniqueOrThrow({
    where: { id: item.id },
    include: { product: { select: { slug: true, pricingConfig: true, madeToOrder: true } }, files: { include: { media: { select: { id: true, originalName: true, size: true, url: true } } } } },
  });
  const open = await prisma.mediaRequest.count({ where: { order: { number: String(req.params.number) }, status: 'open' } });
  res.json({ ok: true, file: result.file, printFiles: printFileSlotsFor(refreshed), openRequests: open });
});

// A file uploaded by mistake comes out of its slot (kept on record for staff).
router.delete('/:number/items/:itemId/files/:fileId', requireAuth, async (req, res) => {
  const item = await prisma.orderItem.findFirst({
    where: { id: String(req.params.itemId), order: { number: String(req.params.number), userId: req.session!.sub } },
    select: { id: true },
  });
  if (!item) throw new HttpError(404, 'Order line not found');
  await removeItemPrintFile({ orderItemId: item.id, fileId: String(req.params.fileId), via: 'account' });
  const refreshed = await prisma.orderItem.findUniqueOrThrow({
    where: { id: item.id },
    include: { product: { select: { slug: true, pricingConfig: true, madeToOrder: true } }, files: { include: { media: { select: { id: true, originalName: true, size: true, url: true } } } } },
  });
  const open = await prisma.mediaRequest.count({ where: { order: { number: String(req.params.number) }, status: 'open' } });
  res.json({ ok: true, printFiles: printFileSlotsFor(refreshed), openRequests: open });
});

// The customer tells us the files we asked for are up.
router.post('/:number/requests/:requestId/done', requireAuth, async (req, res) => {
  const mr = await prisma.mediaRequest.findFirst({
    where: { id: String(req.params.requestId), order: { number: String(req.params.number), userId: req.session!.sub } },
    select: { id: true },
  });
  if (!mr) throw new HttpError(404, 'Request not found');
  await completeMediaRequest(mr.id, 'account');
  res.json({ ok: true });
});

// Reorder: creates a new cart (or merges into the user's current cart) with
// the same items & options as a past order. Returns the new cart so the
// client can redirect to /cart.
router.post('/:number/reorder', requireAuth, async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { number: String(req.params.number), userId: req.session!.sub },
    include: { items: true },
  });
  if (!order) throw new HttpError(404, 'Order not found');

  let cart = await prisma.cart.findFirst({
    where: { userId: req.session!.sub },
    orderBy: { updatedAt: 'desc' },
  });
  if (!cart) {
    cart = await prisma.cart.create({ data: { userId: req.session!.sub } });
  }

  for (const item of order.items) {
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        options: item.options ?? undefined,
        unitPriceCents: item.unitPriceCents,
      },
    });
  }
  await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });

  res.json({ ok: true, cartId: cart.id, itemCount: order.items.length });
});

export default router;
