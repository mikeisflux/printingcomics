import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { sendEmail } from '../lib/mailgun.js';
import { getSetting } from '../lib/settings.js';
import { HttpError } from '../middleware/error.js';

const router = Router();

const contactSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  subject: z.string().max(200).optional(),
  message: z.string().min(1).max(5000),
  // Honeypot — real users leave this blank. Filled = bot, silently drop.
  website: z.string().max(200).optional(),
});

// Tight rate limit — 5/min per IP.
const contactLimiter = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false });

router.post('/', contactLimiter, async (req, res) => {
  const data = contactSchema.parse(req.body);

  // Honeypot hit — pretend to succeed so bots don't get feedback.
  if (data.website && data.website.trim()) {
    return res.json({ ok: true });
  }

  const inboundTo: string = (await getSetting<string>('contact.inboundEmail')) || 'hello@printingcomics.com';
  const subject = data.subject?.trim() || 'New contact form submission';

  const htmlBody = `
    <h2>New contact form submission</h2>
    <p><strong>From:</strong> ${escapeHtml(data.name)} &lt;${escapeHtml(data.email)}&gt;</p>
    ${data.subject ? `<p><strong>Subject:</strong> ${escapeHtml(data.subject)}</p>` : ''}
    <hr />
    <p style="white-space: pre-wrap">${escapeHtml(data.message)}</p>
  `;
  const textBody = `New contact form submission\n\nFrom: ${data.name} <${data.email}>\n${data.subject ? `Subject: ${data.subject}\n` : ''}\n---\n${data.message}`;

  try {
    await sendEmail({
      to: { email: inboundTo },
      subject: `[Contact] ${subject}`,
      html: htmlBody,
      text: textBody,
      headers: { 'Reply-To': `${data.name} <${data.email}>` },
      tags: ['contact-form'],
    });
  } catch (e: any) {
    throw new HttpError(502, 'Could not deliver message. Please email us directly.');
  }

  res.json({ ok: true });
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default router;
