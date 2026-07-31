/**
 * Public review endpoints.
 *   GET  /api/reviews/:token   — load the invite so the form can render
 *   POST /api/reviews/:token   — submit (goes to `pending` for moderation)
 *   GET  /api/reviews          — approved reviews for the storefront slider
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { displayName, publicReviews, reviewSummary } from '../lib/reviews.js';

const router = Router();

// ---- Storefront feed (no auth) ----
router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 12, 50);
  const [reviews, summary] = await Promise.all([publicReviews(limit), reviewSummary()]);
  res.json({ reviews, ...summary });
});

// ---- Tokenized invite ----
router.get('/:token', async (req, res) => {
  const review = await prisma.review.findUnique({
    where: { token: String(req.params.token) },
    include: { order: { select: { number: true, items: { select: { name: true, quantity: true } } } } },
  });
  if (!review) throw new HttpError(404, 'Review link not found');
  res.json({
    review: {
      status: review.status,
      // Already submitted? The form renders read-only instead of letting them
      // silently overwrite what staff may have already moderated.
      rating: review.rating,
      title: review.title,
      body: review.body,
      customerName: review.customerName,
      submittedAt: review.submittedAt,
      reply: review.reply,
    },
    order: review.order ? { number: review.order.number, items: review.order.items } : null,
  });
});

const submitSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  body: z.string().max(4000).optional(),
  // Let them choose how they're credited; we still only publish "First L."
  customerName: z.string().max(120).optional(),
});

router.post('/:token', async (req, res) => {
  const review = await prisma.review.findUnique({ where: { token: String(req.params.token) } });
  if (!review) throw new HttpError(404, 'Review link not found');
  if (review.status === 'approved' || review.status === 'rejected') {
    throw new HttpError(409, 'This review has already been submitted and reviewed by our team.');
  }
  const data = submitSchema.parse(req.body);

  const updated = await prisma.review.update({
    where: { id: review.id },
    data: {
      rating: data.rating,
      title: data.title?.trim() || null,
      body: data.body?.trim() || null,
      customerName: data.customerName?.trim() || review.customerName,
      // Always re-enters moderation, even on an edit before approval.
      status: 'pending',
      submittedAt: new Date(),
    },
  });

  if (review.orderId) {
    await prisma.orderStatusEvent
      .create({
        data: {
          orderId: review.orderId,
          kind: 'note',
          message: `Customer left a ${data.rating}-star review (awaiting moderation)`,
        },
      })
      .catch(() => undefined);
  }

  res.json({
    ok: true,
    // Set expectations: it isn't live yet.
    status: updated.status,
    displayName: displayName(updated.customerName),
  });
});

export default router;
