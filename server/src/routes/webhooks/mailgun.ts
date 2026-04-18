import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import multer from 'multer';
import { prisma } from '../../db.js';
import { getMailgunConfig } from '../../lib/settings.js';

const router = Router();

// Mailgun's inbound webhook is multipart/form-data. We don't need to keep
// any uploaded attachments ourselves — Mailgun hosts them at signed URLs
// we store as metadata — so use memoryStorage and toss the buffers.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Mailgun webhook payload shape (events):
//   { signature: { timestamp, token, signature }, "event-data": {...} }

const EVENT_STATUS: Record<string, string> = {
  delivered: 'DELIVERED',
  opened: 'OPENED',
  clicked: 'CLICKED',
  failed: 'BOUNCED',
  complained: 'BOUNCED',
  unsubscribed: 'UNSUBSCRIBED',
  accepted: 'SENT',
};

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

/** Event webhook: point Mailgun → Sending → Webhooks at this URL. */
router.post('/', async (req, res) => {
  const cfg = await getMailgunConfig();
  if (!cfg.webhookSigningKey) {
    return res.status(503).json({ error: 'Mailgun webhook signing key not configured' });
  }

  const body = req.body as any;
  const sig = body?.signature;
  if (!verifySignature(sig?.timestamp ?? '', sig?.token ?? '', sig?.signature ?? '', cfg.webhookSigningKey)) {
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
    patch.status = evt.severity === 'temporary' ? 'QUEUED' : 'BOUNCED';
    if (evt.reason) patch.errorMessage = String(evt.reason);
  }
  if (evt.event === 'complained') patch.errorMessage = 'Recipient complained (spam)';

  const alt = providerRef.startsWith('<') ? providerRef.slice(1, -1) : `<${providerRef}>`;
  await prisma.emailSend.updateMany({
    where: { providerRef: { in: [providerRef, alt] } },
    data: patch,
  });

  res.status(204).end();
});

/**
 * Inbound webhook: Mailgun → Receiving → Routes → forward("<this URL>")
 *
 * Mailgun POSTs multipart/form-data with these fields (we read the ones we
 * care about — full list is in Mailgun's Routes docs):
 *   timestamp, token, signature     (for HMAC verification)
 *   sender, recipient, subject, from
 *   body-plain, body-html, stripped-text, stripped-html
 *   Message-Id, In-Reply-To, References
 *   attachment-count, attachment-1..N (files)
 *   message-headers (JSON of all headers)
 */
router.post('/inbound', upload.any(), async (req, res) => {
  const cfg = await getMailgunConfig();
  if (!cfg.webhookSigningKey) {
    return res.status(503).json({ error: 'Mailgun webhook signing key not configured' });
  }

  const f = req.body as Record<string, string>;
  if (!verifySignature(f.timestamp ?? '', f.token ?? '', f.signature ?? '', cfg.webhookSigningKey)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const messageId = (f['Message-Id'] as string | undefined) ?? undefined;
  const inReplyTo = (f['In-Reply-To'] as string | undefined) ?? undefined;
  const sender = f.sender ?? '';
  const from = f.from ?? sender;
  const recipient = f.recipient ?? '';
  const subject = f.subject ?? '';

  // Crude name parse from "Jane Doe <jane@x.com>"
  const fromMatch = /^(.*?)\s*<(.+)>$/.exec(from);
  const fromName = fromMatch?.[1]?.replace(/^"|"$/g, '').trim() || null;
  const fromEmail = (fromMatch?.[2] ?? sender).toLowerCase();

  // Classify bounces / complaints — Mailgun sends separate event-data for
  // these via the events webhook, but they can also arrive as inbound mail
  // when DSNs come back through the Route.
  const isBounce =
    /mailer-daemon|postmaster/i.test(fromEmail) ||
    /undeliver|delivery status notification|failure notice|returned mail/i.test(subject);
  let bounceType: 'hard' | 'soft' | null = null;
  if (isBounce) {
    const body = (f['body-plain'] ?? '') + ' ' + subject;
    if (/5\.\d\.\d|user unknown|no such user|does not exist/i.test(body)) bounceType = 'hard';
    else if (/4\.\d\.\d|temporary|mailbox full|try again later/i.test(body)) bounceType = 'soft';
  }

  // Link to the originating EmailSend via the In-Reply-To header, which
  // Mailgun echoes whenever a recipient replies.
  let linkedSendId: string | null = null;
  if (inReplyTo) {
    const alt = inReplyTo.startsWith('<') ? inReplyTo.slice(1, -1) : `<${inReplyTo}>`;
    const send = await prisma.emailSend.findFirst({
      where: { providerRef: { in: [inReplyTo, alt] } },
      select: { id: true },
    });
    if (send) {
      linkedSendId = send.id;
      if (isBounce) {
        await prisma.emailSend.update({
          where: { id: send.id },
          data: {
            status: bounceType === 'hard' ? 'BOUNCED' : 'FAILED',
            errorMessage: subject,
          },
        });
      }
    }
  }

  // Parse Mailgun's attachment metadata. Each attached file is posted as
  // "attachment-N" with the file content — we don't store the bytes, just
  // the filename + content-type + size so the admin sees "[PDF] proof.pdf"
  // and can grab the full file from the Messages API if needed.
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const attachments = files.map((x) => ({
    filename: x.originalname,
    contentType: x.mimetype,
    size: x.size,
  }));

  // message-headers is a JSON string of [["Name", "Value"], ...]
  let rawHeaders: Record<string, string> | null = null;
  try {
    const parsed = JSON.parse(f['message-headers'] ?? '[]') as [string, string][];
    rawHeaders = Object.fromEntries(parsed);
  } catch { /* leave null */ }

  await prisma.inboundEmail.create({
    data: {
      messageId: messageId ?? null,
      inReplyTo: inReplyTo ?? null,
      fromEmail,
      fromName,
      toEmail: recipient,
      subject,
      textBody: f['body-plain'] ?? null,
      strippedText: f['stripped-text'] ?? null,
      htmlBody: f['body-html'] ?? null,
      rawHeaders: rawHeaders ?? undefined,
      attachments: attachments.length ? attachments : undefined,
      kind: isBounce ? 'bounce' : 'inbound',
      bounceType,
      linkedSendId,
    },
  }).catch((e: any) => {
    // Duplicate delivery — ignore.
    if (!String(e.message).includes('Unique')) throw e;
  });

  res.status(204).end();
});

export default router;
