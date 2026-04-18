import { getMailgunConfig } from './settings.js';
import { HttpError } from '../middleware/error.js';

export interface SendEmailInput {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; contentBase64: string; contentType: string }[];
  /** Arbitrary per-send metadata. Sent as X-Mailgun-Variables header (JSON),
   *  returned on events so we can correlate opens/clicks/bounces back to
   *  campaigns and subscribers. */
  params?: Record<string, string>;
  headers?: Record<string, string>;
  tags?: string[];
}

export interface SendEmailResult {
  /** Mailgun's per-message id in angle brackets, e.g. "<xxxxx@domain>".
   *  Webhook events echo this as `message-id` so we can update EmailSend. */
  providerRef?: string;
}

/**
 * Sends transactional / campaign email via Mailgun's HTTP API.
 *   POST https://api.{region}/v3/{domain}/messages
 *
 * Mailgun handles open + click tracking server-side (no pixel rewrite on
 * our side), and POSTs event callbacks to /api/webhooks/mailgun.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const cfg = await getMailgunConfig();
  if (!cfg.apiKey) throw new HttpError(400, 'Mailgun API key is not configured. Set it in Admin → Settings → Email.');
  if (!cfg.domain) throw new HttpError(400, 'Mailgun sending domain is not configured.');
  if (!cfg.fromEmail) throw new HttpError(400, 'Mailgun "from email" is not configured.');

  if (cfg.testMode) {
    console.info('[mailgun:test-mode] would send to', input.to.email, 'subject:', input.subject);
    return { providerRef: `test_${Date.now()}` };
  }

  const base = cfg.region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  const endpoint = `${base}/v3/${encodeURIComponent(cfg.domain)}/messages`;

  const form = new FormData();
  form.set('from', cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail);
  form.set('to', input.to.name ? `${input.to.name} <${input.to.email}>` : input.to.email);
  if (cfg.replyTo) form.set('h:Reply-To', cfg.replyTo);
  form.set('subject', input.subject);
  form.set('html', input.html);
  if (input.text) form.set('text', input.text);

  // Tracking on (Mailgun injects the pixel + rewrites links for us).
  form.set('o:tracking', 'yes');
  form.set('o:tracking-opens', 'yes');
  form.set('o:tracking-clicks', 'htmlonly');

  // Tags for filtering in Mailgun dashboard.
  if (input.tags) for (const tag of input.tags) form.append('o:tag', tag);

  // Opaque JSON blob returned on every webhook event for this message.
  if (input.params) form.set('v:pc-params', JSON.stringify(input.params));

  // Arbitrary additional headers (we prefix with `h:` per Mailgun's API).
  if (input.headers) {
    for (const [k, v] of Object.entries(input.headers)) form.set(`h:${k}`, v);
  }

  // Attachments as Blob parts.
  if (input.attachments?.length) {
    for (const a of input.attachments) {
      form.append(
        'attachment',
        new Blob([Buffer.from(a.contentBase64, 'base64')], { type: a.contentType }),
        a.filename,
      );
    }
  }

  const auth = 'Basic ' + Buffer.from(`api:${cfg.apiKey}`).toString('base64');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: auth },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(502, `Mailgun error ${res.status}: ${body}`);
  }

  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { providerRef: json.id };
}
