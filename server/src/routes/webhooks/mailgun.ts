import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../db.js';
import { getMailgunConfig } from '../../lib/settings.js';

const router = Router();

// Mailgun webhook payload shape:
// {
//   signature: { timestamp: "...", token: "...", signature: "..." },
//   "event-data": {
//     event: "delivered" | "opened" | "clicked" | "failed" | "complained" | "unsubscribed",
//     message: { headers: { "message-id": "xxx@domain" } },
//     recipient: "a@b.com",
//     reason, severity, "user-variables", ...
//   }
// }

const EVENT_STATUS: Record<string, string> = {
  delivered: 'DELIVERED',
  opened: 'OPENED',
  clicked: 'CLICKED',
  failed: 'BOUNCED', // permanent or temporary — severity decides
  complained: 'BOUNCED',
  unsubscribed: 'UNSUBSCRIBED',
  accepted: 'SENT',
};

// Verify HMAC-SHA256 of (timestamp + token) using the webhook signing key.
function verifySignature(
  timestamp: string,
  token: string,
  signature: string,
  signingKey: string,
): boolean {
  if (!timestamp || !token || !signature || !signingKey) return false;
  const expected = createHmac('sha256', signingKey).update(timestamp + token).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Event webhook — Mailgun Dashboard → Sending → Webhooks.
 * Point at: https://<your-domain>/api/webhooks/mailgun
 */
router.post('/', async (req, res) => {
  const cfg = await getMailgunConfig();
  if (!cfg.webhookSigningKey) {
    // Refuse until the signing key is configured — we can't trust unsigned events.
    return res.status(503).json({ error: 'Mailgun webhook signing key not configured' });
  }

  const body = req.body as any;
  const sig = body?.signature;
  if (!verifySignature(sig?.timestamp, sig?.token, sig?.signature, cfg.webhookSigningKey)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const evt = body?.['event-data'];
  if (!evt || typeof evt !== 'object') return res.status(400).json({ error: 'Missing event-data' });

  const providerRef = evt.message?.headers?.['message-id'] as string | undefined;
  if (!providerRef) return res.status(204).end();

  const status = EVENT_STATUS[evt.event];
  if (!status) return res.status(204).end();

  const patch: Record<string, unknown> = { status };
  if (evt.event === 'opened') patch.openedAt = new Date();
  if (evt.event === 'clicked') patch.clickedAt = new Date();
  if (evt.event === 'failed') {
    // Mailgun marks severity=permanent for hard bounces, =temporary for soft.
    patch.status = evt.severity === 'temporary' ? 'QUEUED' : 'BOUNCED';
    if (evt.reason) patch.errorMessage = String(evt.reason);
  }
  if (evt.event === 'complained') patch.errorMessage = 'Recipient complained (spam)';

  // Accept both `<id@domain>` and `id@domain` forms — match either.
  const alt = providerRef.startsWith('<') ? providerRef.slice(1, -1) : `<${providerRef}>`;
  await prisma.emailSend.updateMany({
    where: { providerRef: { in: [providerRef, alt] } },
    data: patch,
  });

  res.status(204).end();
});

/**
 * Inbound route webhook — Mailgun Dashboard → Receiving → Routes.
 * Create a catch-all route with action:
 *   forward("https://<your-domain>/api/webhooks/mailgun/inbound")
 * Mailgun POSTs multipart/form-data with parsed fields.
 */
router.post('/inbound', async (_req, res) => {
  // Stub — v1 just acks. Mailgun Routes can forward replies straight to
  // your mailbox (hello@printingcomics.com); point the Route there.
  res.status(202).json({ ok: true });
});

export default router;
