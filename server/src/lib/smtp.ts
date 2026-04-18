import nodemailer, { type Transporter } from 'nodemailer';
import { randomBytes } from 'node:crypto';
import { getSmtpConfig, getSetting } from './settings.js';
import { HttpError } from '../middleware/error.js';
import { prisma } from '../db.js';

export interface SendEmailInput {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; contentBase64: string; contentType: string }[];
  /** Per-send metadata stored on EmailSend for later correlation. */
  params?: Record<string, string>;
  headers?: Record<string, string>;
  tags?: string[];
  /** Opt out of injecting the open-tracking pixel (e.g. for admin test sends). */
  disableTracking?: boolean;
}

export interface SendEmailResult {
  /**
   * Internal tracking id generated per send — used for open/click
   * correlation and for matching bounce events. Stored as the Message-ID
   * header in the form <trackingId@fromDomain>.
   */
  providerRef?: string;
}

let cachedTransporter: { key: string; t: Transporter } | null = null;

async function transporter(): Promise<Transporter> {
  const cfg = await getSmtpConfig();
  if (!cfg.host) throw new HttpError(400, 'SMTP host is not configured. Set it in Admin → Settings → Email.');
  if (!cfg.fromEmail) throw new HttpError(400, 'SMTP "from email" is not configured.');

  const key = `${cfg.host}|${cfg.port}|${cfg.secure}|${cfg.user}|${cfg.password}`;
  if (cachedTransporter && cachedTransporter.key === key) return cachedTransporter.t;

  const t = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port || 587,
    secure: cfg.secure ?? false,  // true for 465 (implicit TLS), false for 587 (STARTTLS)
    auth: cfg.user && cfg.password ? { user: cfg.user, pass: cfg.password } : undefined,
    // Local Postfix on the same host normally runs unauthenticated on 25.
  });
  cachedTransporter = { key, t };
  return t;
}

/**
 * Sends email via nodemailer to our configured SMTP server (Postfix
 * on-box, or any external relay). Injects open/click tracking unless
 * disabled.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const cfg = await getSmtpConfig();
  if (!cfg.fromEmail) throw new HttpError(400, 'SMTP "from email" is not configured.');

  if (cfg.testMode) {
    console.info('[smtp:test-mode] would send to', input.to.email, 'subject:', input.subject);
    return { providerRef: `test_${Date.now()}` };
  }

  const fromDomain = cfg.fromEmail.split('@')[1] || 'localhost';
  const trackingId = randomBytes(12).toString('hex');
  const messageId = `<${trackingId}@${fromDomain}>`;

  const publicBaseUrl = (await getSetting<string>('store.publicUrl')) ?? '';
  const instrumented = input.disableTracking || !publicBaseUrl
    ? input.html
    : instrumentHtml(input.html, trackingId, publicBaseUrl);

  const t = await transporter();
  await t.sendMail({
    from: { name: cfg.fromName || 'Printing Comics', address: cfg.fromEmail },
    to: input.to.name ? `${input.to.name} <${input.to.email}>` : input.to.email,
    replyTo: cfg.replyTo || undefined,
    subject: input.subject,
    html: instrumented,
    text: input.text,
    messageId,
    headers: input.headers,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.contentBase64, 'base64'),
      contentType: a.contentType,
    })),
  });

  // Persist the tracking id → EmailSend will be updated later by open/click
  // endpoints; no-op if no EmailSend row exists for it yet.
  return { providerRef: messageId };
}

/**
 * Rewrites outbound HTML so that:
 *  - Every absolute http(s) link routes through /api/track/click?t=<id>&u=<enc>
 *  - A 1×1 pixel at /api/track/open?t=<id>.png is appended before </body>
 */
function instrumentHtml(html: string, trackingId: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const rewritten = html.replace(/href=(["'])(https?:\/\/[^"'>\s]+)\1/gi, (_m, q, url) => {
    return `href=${q}${base}/api/track/click?t=${trackingId}&u=${encodeURIComponent(url)}${q}`;
  });
  const pixel = `<img src="${base}/api/track/open?t=${trackingId}" width="1" height="1" alt="" style="display:none" />`;
  if (/<\/body>/i.test(rewritten)) return rewritten.replace(/<\/body>/i, `${pixel}</body>`);
  return rewritten + pixel;
}

// Internal helpers for the tracking routes to record events.

export async function recordOpen(trackingId: string) {
  const messageId = await matchMessageId(trackingId);
  if (!messageId) return;
  await prisma.emailSend.updateMany({
    where: { providerRef: messageId, openedAt: null },
    data: { status: 'OPENED', openedAt: new Date() },
  });
}

export async function recordClick(trackingId: string, url: string) {
  const messageId = await matchMessageId(trackingId);
  if (!messageId) return;
  await prisma.emailSend.updateMany({
    where: { providerRef: messageId },
    data: { status: 'CLICKED', clickedAt: new Date() },
  });
  console.info(`[track] click id=${trackingId} url=${url}`);
}

async function matchMessageId(trackingId: string): Promise<string | null> {
  if (!/^[a-f0-9]{24}$/i.test(trackingId)) return null;
  // We don't know the from-domain here, so match by prefix. EmailSend's
  // providerRef is the full `<id@domain>` Message-ID we returned above.
  const row = await prisma.emailSend.findFirst({
    where: { providerRef: { startsWith: `<${trackingId}@` } },
    select: { providerRef: true },
  });
  return row?.providerRef ?? null;
}
