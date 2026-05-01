/**
 * Helpers for the Partner system — first-class records of crowdfunding
 * platforms / publishers that submit orders via the public API.
 *
 * - slugify: turn a partner's display name into a stable URL slug.
 * - mintWebhookSecret: random 256-bit secret used for HMAC signing.
 * - signWebhookPayload: produce the X-PC-Signature header value.
 * - dispatchPartnerWebhook: log + POST a webhook delivery to the partner.
 *   Persists every attempt to PartnerWebhookDelivery so the admin can audit
 *   and replay failures.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { prisma } from '../db.js';

const RESERVED_SLUGS = new Set(['new', 'me', 'admin', 'api', 'webhooks']);

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'partner';
}

/** Generate a unique slug given a desired base, falling back to -2, -3, … on collision. */
export async function uniquePartnerSlug(desired: string): Promise<string> {
  const base = slugify(desired);
  if (RESERVED_SLUGS.has(base)) {
    return uniquePartnerSlug(`${base}-1`);
  }
  let slug = base;
  let n = 2;
  while (await prisma.partner.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
    if (n > 50) {
      // Bail out into random territory so we don't loop forever.
      slug = `${base}-${randomBytes(2).toString('hex')}`;
      break;
    }
  }
  return slug;
}

export function mintWebhookSecret(): string {
  return `pcw_${randomBytes(24).toString('hex')}`;
}

/**
 * HMAC-SHA256 over `${timestamp}.${rawBody}` using the partner's webhook secret.
 * Returned in the standard `t=…,v1=…` format that recipients can verify.
 */
export function signWebhookPayload(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signed = `${timestamp}.${body}`;
  const sig = createHmac('sha256', secret).update(signed).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

export interface PartnerWebhookEvent {
  partnerId: string;
  event: string;
  orderId?: string | null;
  payload: Record<string, unknown>;
}

/**
 * Send a webhook to the partner. Logs the attempt in PartnerWebhookDelivery
 * regardless of outcome and returns the persisted delivery row. Best-effort:
 * never throws — caller should treat failures as background noise.
 *
 * Retries are not done here; the admin can replay manually from the UI, and
 * a future cron can sweep `succeeded=false AND nextRetryAt <= now`.
 */
export async function dispatchPartnerWebhook(evt: PartnerWebhookEvent): Promise<{ id: string; succeeded: boolean }> {
  const partner = await prisma.partner.findUnique({ where: { id: evt.partnerId } });

  // Always log the attempt, even when there's no URL configured — gives the
  // admin visibility that an event would have fired.
  if (!partner?.webhookUrl) {
    const row = await prisma.partnerWebhookDelivery.create({
      data: {
        partnerId: evt.partnerId,
        event: evt.event,
        orderId: evt.orderId ?? null,
        url: '',
        payload: evt.payload as object,
        succeeded: false,
        error: 'No webhook URL configured for partner',
      },
    });
    return { id: row.id, succeeded: false };
  }

  const body = JSON.stringify({
    event: evt.event,
    orderId: evt.orderId ?? null,
    data: evt.payload,
    sentAt: new Date().toISOString(),
  });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'PrintingComics-Webhook/1.0',
    'X-PC-Event': evt.event,
  };
  if (partner.webhookSecret) {
    headers['X-PC-Signature'] = signWebhookPayload(partner.webhookSecret, body);
  }

  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;
  let succeeded = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(partner.webhookUrl, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      statusCode = res.status;
      // Bound the response body we persist — partners might return huge HTML.
      responseBody = (await res.text().catch(() => '')).slice(0, 4000);
      succeeded = res.ok;
      if (!res.ok) error = `HTTP ${res.status}`;
    } finally {
      clearTimeout(timeout);
    }
  } catch (e: any) {
    error = e?.message ? String(e.message).slice(0, 500) : 'Network error';
  }

  const row = await prisma.partnerWebhookDelivery.create({
    data: {
      partnerId: evt.partnerId,
      event: evt.event,
      orderId: evt.orderId ?? null,
      url: partner.webhookUrl,
      payload: evt.payload as object,
      attempts: 1,
      statusCode: statusCode ?? undefined,
      responseBody: responseBody ?? undefined,
      error: error ?? undefined,
      succeeded,
      deliveredAt: succeeded ? new Date() : null,
    },
  });

  return { id: row.id, succeeded };
}

/**
 * Retry an existing delivery. Updates the row in place (attempts + result).
 * Returns the refreshed row.
 */
export async function replayWebhookDelivery(deliveryId: string) {
  const existing = await prisma.partnerWebhookDelivery.findUnique({ where: { id: deliveryId } });
  if (!existing) return null;
  const partner = await prisma.partner.findUnique({ where: { id: existing.partnerId } });
  const url = partner?.webhookUrl ?? existing.url;
  if (!url) {
    return prisma.partnerWebhookDelivery.update({
      where: { id: existing.id },
      data: {
        attempts: existing.attempts + 1,
        error: 'No webhook URL configured for partner',
        succeeded: false,
      },
    });
  }

  const body = JSON.stringify({
    event: existing.event,
    orderId: existing.orderId,
    data: existing.payload,
    sentAt: new Date().toISOString(),
    replay: true,
  });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'PrintingComics-Webhook/1.0',
    'X-PC-Event': existing.event,
    'X-PC-Replay': 'true',
  };
  if (partner?.webhookSecret) {
    headers['X-PC-Signature'] = signWebhookPayload(partner.webhookSecret, body);
  }

  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;
  let succeeded = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
      statusCode = res.status;
      responseBody = (await res.text().catch(() => '')).slice(0, 4000);
      succeeded = res.ok;
      if (!res.ok) error = `HTTP ${res.status}`;
    } finally {
      clearTimeout(timeout);
    }
  } catch (e: any) {
    error = e?.message ? String(e.message).slice(0, 500) : 'Network error';
  }

  return prisma.partnerWebhookDelivery.update({
    where: { id: existing.id },
    data: {
      attempts: existing.attempts + 1,
      url,
      statusCode: statusCode ?? undefined,
      responseBody: responseBody ?? undefined,
      error: error ?? undefined,
      succeeded,
      deliveredAt: succeeded ? new Date() : existing.deliveredAt,
    },
  });
}

/** Standard set of events partners can subscribe to. */
export const PARTNER_WEBHOOK_EVENTS = [
  'order.created',
  'order.paid',
  'order.in_production',
  'order.shipped',
  'order.delivered',
  'order.cancelled',
  'order.refunded',
] as const;
export type PartnerWebhookEventName = (typeof PARTNER_WEBHOOK_EVENTS)[number];

export function fingerprintWebhookSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 8);
}
