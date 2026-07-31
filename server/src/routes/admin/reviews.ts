/**
 * Review moderation. Nothing a customer writes reaches the storefront until
 * it's approved here.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { requestReviewForOrder, reviewUrl } from '../../lib/reviews.js';
import { sendReviewApprovedEmail } from '../../lib/review-emails.js';

const router = Router();

router.get('/', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const where = status && status !== 'all' ? { status } : {};
  const [reviews, counts] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: [{ submittedAt: 'desc' }, { requestedAt: 'desc' }],
      take: 200,
      include: { order: { select: { id: true, number: true, totalCents: true } } },
    }),
    prisma.review.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  res.json({
    reviews,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  });
});

const decideSchema = z.object({
  status: z.enum(['approved', 'rejected', 'pending']),
  reply: z.string().max(2000).optional(),
  adminNote: z.string().max(2000).optional(),
  featured: z.boolean().optional(),
  notify: z.boolean().optional(),
});

router.patch('/:id', async (req, res) => {
  const data = decideSchema.parse(req.body);
  const before = await prisma.review.findUnique({ where: { id: req.params.id } });
  if (!before) throw new HttpError(404, 'Review not found');
  if (data.status === 'approved' && !before.rating) {
    throw new HttpError(400, 'This review has not been submitted yet — there is nothing to approve.');
  }

  const review = await prisma.review.update({
    where: { id: req.params.id },
    data: {
      status: data.status,
      reply: data.reply === undefined ? undefined : data.reply.trim() || null,
      adminNote: data.adminNote === undefined ? undefined : data.adminNote.trim() || null,
      featured: data.featured,
      decidedAt: new Date(),
      decidedById: req.session?.sub,
    },
  });

  // Only notify on a fresh approval, and only if asked.
  let email: { sent: boolean; error?: string } | undefined;
  if (data.notify && data.status === 'approved' && before.status !== 'approved') {
    email = await sendReviewApprovedEmail(review.id);
  }
  res.json({ review, email });
});

/** Pin / unpin without touching moderation state. */
const featureSchema = z.object({ featured: z.boolean(), sortOrder: z.number().int().optional() });
router.patch('/:id/feature', async (req, res) => {
  const data = featureSchema.parse(req.body);
  const review = await prisma.review.update({ where: { id: req.params.id }, data });
  res.json({ review });
});

router.delete('/:id', async (req, res) => {
  await prisma.review.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

/** The customer's link, so staff can re-send or paste it manually. */
router.get('/:id/link', async (req, res) => {
  const review = await prisma.review.findUnique({ where: { id: req.params.id }, select: { token: true } });
  if (!review) throw new HttpError(404, 'Review not found');
  res.json({ url: await reviewUrl(review.token), token: review.token });
});

/** Manually ask for a review on an order (e.g. delivery recorded off-system). */
router.post('/request/:orderId', async (req, res) => {
  const result = await requestReviewForOrder(String(req.params.orderId));
  if (!result.sent) throw new HttpError(400, result.reason ?? 'Could not send the review request.');
  res.json({ ok: true });
});

export default router;
