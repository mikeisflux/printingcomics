/**
 * Public submission endpoint for partner API access requests.
 *
 * Anyone can submit; nothing is provisioned automatically. The application
 * lands as PENDING in the admin review queue at /admin/partners (Applications
 * tab). On approval an admin mints the Partner + first key from there.
 *
 * Anti-abuse:
 *   - 5 requests / minute / IP
 *   - honeypot field `website2` — filled = silent success
 *   - 10 pending applications max for a single contact email — beyond that we
 *     return success without creating a row (defense against floods)
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { sendEmail } from '../../lib/mailgun.js';
import { getSetting } from '../../lib/settings.js';

const router = Router();

const submitSchema = z.object({
  name: z.string().min(1).max(120),
  contactName: z.string().min(1).max(120),
  contactEmail: z.string().email(),
  platform: z.string().max(60).optional(),
  website: z.string().url().optional(),
  scopes: z.array(z.string()).max(20).optional(),
  estimatedMonthlyOrders: z.number().int().positive().max(1_000_000).optional(),
  message: z.string().max(5000).optional(),
  // honeypot — real users leave blank
  website2: z.string().max(200).optional(),
});

const limiter = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false });

router.post('/', limiter, async (req, res) => {
  const data = submitSchema.parse(req.body);

  // Silent honeypot drop
  if (data.website2 && data.website2.trim()) {
    return res.json({ ok: true });
  }

  const email = data.contactEmail.toLowerCase();

  // Cap pending applications per email at 10 to prevent floods.
  const pendingCount = await prisma.partnerApplication.count({
    where: { contactEmail: email, status: 'PENDING' },
  });
  if (pendingCount >= 10) {
    return res.json({ ok: true, capped: true });
  }

  const application = await prisma.partnerApplication.create({
    data: {
      name: data.name,
      contactName: data.contactName,
      contactEmail: email,
      platform: data.platform,
      website: data.website,
      scopes: data.scopes ?? [],
      estimatedMonthlyOrders: data.estimatedMonthlyOrders,
      message: data.message,
      ipAddress: req.ip,
      userAgent: req.header('user-agent')?.slice(0, 500),
    },
  });

  // Best-effort emails. Both are fire-and-forget so a Mailgun outage doesn't
  // block a legitimate submission.
  void sendApplicantConfirmation(application).catch(() => undefined);
  void sendInternalNotification(application).catch(() => undefined);

  res.status(201).json({
    ok: true,
    applicationId: application.id,
    message:
      'Thanks — we received your request and will be in touch from developers@printingcomics.com within 1–2 business days.',
  });
});

async function sendApplicantConfirmation(app: { contactEmail: string; contactName: string; name: string; id: string }) {
  await sendEmail({
    to: { email: app.contactEmail, name: app.contactName },
    subject: 'Your Printing Comics API access request',
    text: `Hi ${app.contactName},\n\nThanks for requesting API access for "${app.name}". A member of our developer team will review your request and follow up within 1–2 business days.\n\nReference: ${app.id}\n\n— Printing Comics`,
    html: `
      <p>Hi ${escapeHtml(app.contactName)},</p>
      <p>Thanks for requesting API access for <strong>${escapeHtml(app.name)}</strong>. A member of our developer team will review your request and follow up within 1–2 business days.</p>
      <p style="color:#666;font-size:.85rem;">Reference: <code>${app.id}</code></p>
      <p>— Printing Comics</p>
    `,
    tags: ['partner-application'],
  });
}

async function sendInternalNotification(app: any) {
  const inboundTo: string =
    (await getSetting<string>('contact.inboundEmail')) || 'hello@printingcomics.com';
  await sendEmail({
    to: { email: inboundTo },
    subject: `[Partner request] ${app.name}`,
    text:
      `New partner API access request:\n\n` +
      `Name: ${app.name}\n` +
      `Contact: ${app.contactName} <${app.contactEmail}>\n` +
      (app.platform ? `Platform: ${app.platform}\n` : '') +
      (app.website ? `Website: ${app.website}\n` : '') +
      (app.estimatedMonthlyOrders ? `Est. monthly orders: ${app.estimatedMonthlyOrders}\n` : '') +
      (app.scopes?.length ? `Scopes requested: ${app.scopes.join(', ')}\n` : '') +
      (app.message ? `\nMessage:\n${app.message}\n` : '') +
      `\nReview at /admin/partners (Applications tab).\n`,
    html: `
      <h2>New partner API access request</h2>
      <p><strong>${escapeHtml(app.name)}</strong></p>
      <ul>
        <li>Contact: ${escapeHtml(app.contactName)} &lt;${escapeHtml(app.contactEmail)}&gt;</li>
        ${app.platform ? `<li>Platform: ${escapeHtml(app.platform)}</li>` : ''}
        ${app.website ? `<li>Website: <a href="${escapeHtml(app.website)}">${escapeHtml(app.website)}</a></li>` : ''}
        ${app.estimatedMonthlyOrders ? `<li>Est. monthly orders: ${app.estimatedMonthlyOrders}</li>` : ''}
        ${app.scopes?.length ? `<li>Scopes requested: ${app.scopes.map(escapeHtml).join(', ')}</li>` : ''}
      </ul>
      ${app.message ? `<p style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:.75rem;color:#444">${escapeHtml(app.message)}</p>` : ''}
      <p><a href="/admin/partners">Review in admin →</a></p>
    `,
    headers: { 'Reply-To': `${app.contactName} <${app.contactEmail}>` },
    tags: ['partner-application'],
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default router;
