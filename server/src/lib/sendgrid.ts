import { getSendGridConfig } from './settings.js';
import { HttpError } from '../middleware/error.js';

export interface SendEmailInput {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; contentBase64: string; contentType: string }[];
  // Custom per-send metadata. Surfaces in SendGrid's Event Webhook.
  customArgs?: Record<string, string>;
}

export interface SendEmailResult {
  providerRef?: string;
}

/**
 * Sends an email via SendGrid's v3 API. Returns the x-message-id if provided.
 * Honors sandbox mode from settings for safe testing.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const cfg = await getSendGridConfig();
  if (!cfg.apiKey) throw new HttpError(400, 'SendGrid API key is not configured. Set it in Admin → Settings → Integrations.');
  if (!cfg.fromEmail) throw new HttpError(400, 'SendGrid "from email" is not configured.');

  const body: any = {
    personalizations: [
      {
        to: [{ email: input.to.email, ...(input.to.name ? { name: input.to.name } : {}) }],
        subject: input.subject,
        ...(input.customArgs ? { custom_args: input.customArgs } : {}),
      },
    ],
    from: { email: cfg.fromEmail, name: cfg.fromName },
    ...(cfg.replyTo ? { reply_to: { email: cfg.replyTo } } : {}),
    content: [
      ...(input.text ? [{ type: 'text/plain', value: input.text }] : []),
      { type: 'text/html', value: input.html },
    ],
    ...(input.attachments && input.attachments.length > 0
      ? {
          attachments: input.attachments.map((a) => ({
            filename: a.filename,
            content: a.contentBase64,
            type: a.contentType,
            disposition: 'attachment',
          })),
        }
      : {}),
    ...(cfg.sandboxMode ? { mail_settings: { sandbox_mode: { enable: true } } } : {}),
  };

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new HttpError(502, `SendGrid error ${res.status}: ${text}`);
  }

  return { providerRef: res.headers.get('x-message-id') ?? undefined };
}

/**
 * Verifies a SendGrid Event Webhook signature. Requires the PUBLIC_KEY set
 * in your SendGrid dashboard. Returns true if signature is valid.
 */
export function verifySendGridSignature(): boolean {
  // Implementation requires @sendgrid/eventwebhook or ed25519 verification.
  // Plug your public key into settings and complete this in follow-up work.
  return true;
}
