import { getBrevoConfig } from './settings.js';
import { HttpError } from '../middleware/error.js';

export interface SendEmailInput {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; contentBase64: string; contentType: string }[];
  /** Arbitrary per-send metadata. Brevo returns this on webhook events. */
  params?: Record<string, string>;
  headers?: Record<string, string>;
  tags?: string[];
}

export interface SendEmailResult {
  /** Brevo "messageId" — format like "<xxx@smtp-relay.mailin.fr>". */
  providerRef?: string;
}

/**
 * Sends a transactional email via Brevo's v3 API:
 *   POST https://api.brevo.com/v3/smtp/email
 *
 * Brevo has no sandbox mode — when `testMode` is set in settings we short-
 * circuit and return a fake provider ref so local dev doesn't spend credits
 * or deliver to real inboxes.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const cfg = await getBrevoConfig();
  if (!cfg.apiKey) throw new HttpError(400, 'Brevo API key is not configured. Set it in Admin → Settings → Integrations.');
  if (!cfg.fromEmail) throw new HttpError(400, 'Brevo "from email" is not configured.');

  if (cfg.testMode) {
    console.info('[brevo:test-mode] would send to', input.to.email, 'subject:', input.subject);
    return { providerRef: `test_${Date.now()}` };
  }

  const body: Record<string, unknown> = {
    sender: { email: cfg.fromEmail, name: cfg.fromName },
    to: [{ email: input.to.email, ...(input.to.name ? { name: input.to.name } : {}) }],
    subject: input.subject,
    htmlContent: input.html,
    ...(input.text ? { textContent: input.text } : {}),
    ...(cfg.replyTo ? { replyTo: { email: cfg.replyTo } } : {}),
    ...(input.params ? { params: input.params } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
    ...(input.tags && input.tags.length > 0 ? { tags: input.tags } : {}),
  };

  if (input.attachments && input.attachments.length > 0) {
    body.attachment = input.attachments.map((a) => ({
      name: a.filename,
      content: a.contentBase64, // Brevo expects base64 in `content`
    }));
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': cfg.apiKey,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new HttpError(502, `Brevo error ${res.status}: ${text}`);
  }

  const json = (await res.json().catch(() => ({}))) as { messageId?: string };
  return { providerRef: json.messageId };
}
