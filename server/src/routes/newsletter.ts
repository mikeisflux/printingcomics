import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';

const router = Router();

const subscribeSchema = z.object({
  email: z.string().email(),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  source: z.string().max(80).optional(),
});

// Public: subscribe to the newsletter. Upserts the subscriber and flips
// optedIn back on if they had previously unsubscribed.
router.post('/subscribe', async (req, res) => {
  const data = subscribeSchema.parse(req.body);
  const subscriber = await prisma.emailSubscriber.upsert({
    where: { email: data.email.toLowerCase() },
    create: {
      email: data.email.toLowerCase(),
      firstName: data.firstName,
      lastName: data.lastName,
      optedIn: true,
      tags: data.source ? [`source:${data.source}`] : [],
    },
    update: {
      firstName: data.firstName ?? undefined,
      lastName: data.lastName ?? undefined,
      optedIn: true,
      unsubscribedAt: null,
    },
    select: { id: true, email: true },
  });
  res.json({ ok: true, id: subscriber.id });
});

// Public: unsubscribe via token in a one-click footer link.
router.get('/unsubscribe', async (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email.toLowerCase() : '';
  if (!email) return res.status(400).send('Missing email');
  await prisma.emailSubscriber.updateMany({
    where: { email },
    data: { optedIn: false, unsubscribedAt: new Date() },
  });
  res.type('html').send(`
    <!doctype html><html><body style="font-family: system-ui; padding: 2rem; max-width: 520px; margin: auto">
    <h1>You're unsubscribed</h1>
    <p>We've stopped sending emails to <strong>${email}</strong>. Change of heart? Just sign up again on the site.</p>
    </body></html>`);
});

export default router;
