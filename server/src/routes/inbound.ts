import { Router, raw } from 'express';
import { simpleParser } from 'mailparser';
import { prisma } from '../db.js';
import { getSmtpConfig } from '../lib/settings.js';
import { HttpError } from '../middleware/error.js';

const router = Router();

// Accept up to 50MB raw message bodies; Postfix pipes RFC-822 mail straight
// through. Authentication is a shared Bearer token configured in Admin
// → Settings → Email → Inbound secret.
router.post('/', raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
  const cfg = await getSmtpConfig();
  if (!cfg.inboundSecret) throw new HttpError(500, 'Inbound email is not configured (missing secret).');

  const auth = req.header('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (token !== cfg.inboundSecret) throw new HttpError(401, 'Unauthorized');

  const raw = req.body as Buffer;
  if (!raw || raw.length === 0) throw new HttpError(400, 'Empty body');

  const parsed = await simpleParser(raw);

  const fromAddr = parsed.from?.value?.[0];
  const toAddr = Array.isArray(parsed.to) ? parsed.to[0]?.value?.[0] : parsed.to?.value?.[0];

  const inReplyTo = parsed.inReplyTo ?? parsed.headers.get('references')?.toString().split(/\s+/)[0] ?? null;

  // Bounce detection — Postfix/Postmaster DSN messages have a distinctive
  // From and content-type. We flag them so the admin inbox can filter.
  const fromEmail = fromAddr?.address?.toLowerCase() ?? '';
  const subject = parsed.subject ?? '';
  const isBounce =
    /mailer-daemon|postmaster/i.test(fromEmail) ||
    /undeliver|delivery status notification|failure notice|returned mail/i.test(subject) ||
    /multipart\/report/i.test(parsed.headers.get('content-type')?.toString() ?? '');

  let bounceType: 'hard' | 'soft' | null = null;
  let linkedSendId: string | null = null;

  if (isBounce) {
    const body = (parsed.text ?? '') + ' ' + subject;
    // Very rough heuristics — good enough to sort hard vs soft.
    if (/5\.\d\.\d|user unknown|no such user|does not exist|permanent/i.test(body)) bounceType = 'hard';
    else if (/4\.\d\.\d|temporary|mailbox full|try again later|throttled/i.test(body)) bounceType = 'soft';

    // Link the bounce back to the EmailSend via our Message-ID.
    if (inReplyTo) {
      const send = await prisma.emailSend.findFirst({
        where: { providerRef: inReplyTo },
        select: { id: true },
      });
      if (send) {
        linkedSendId = send.id;
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

  await prisma.inboundEmail.create({
    data: {
      messageId: parsed.messageId ?? null,
      inReplyTo: inReplyTo ?? null,
      fromEmail,
      fromName: fromAddr?.name ?? null,
      toEmail: toAddr?.address ?? '',
      subject,
      textBody: parsed.text ?? null,
      htmlBody: typeof parsed.html === 'string' ? parsed.html : null,
      rawHeaders: Object.fromEntries(parsed.headers),
      kind: isBounce ? 'bounce' : 'inbound',
      bounceType,
      linkedSendId,
    },
  }).catch((e) => {
    // Unique-constraint on messageId means a duplicate delivery — ignore.
    if (!String(e.message).includes('Unique')) throw e;
  });

  res.status(204).end();
});

export default router;
