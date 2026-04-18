import { prisma } from '../db.js';
import { decryptSecret, encryptSecret, maskSecret } from './crypto.js';

/**
 * Keys we treat as secrets: stored encrypted, masked when listing for UI,
 * but returned plaintext when read by server-side services.
 */
export const SECRET_KEYS = new Set<string>([
  'paypal.clientSecret',
  'paypal.webhookId',
  'mailgun.apiKey',
  'mailgun.webhookSigningKey',
  'anthropic.apiKey',
]);

/**
 * Known setting keys that the admin UI renders. The UI can add arbitrary keys,
 * but these get labels/sections and have server-side readers.
 */
export const SETTING_KEYS = {
  store: {
    name: 'store.name',
    email: 'store.email',
    phone: 'store.phone',
    addressLine1: 'store.addressLine1',
    addressLine2: 'store.addressLine2',
    city: 'store.city',
    region: 'store.region',
    postalCode: 'store.postalCode',
    country: 'store.country',
    logoUrl: 'store.logoUrl',
    currency: 'store.currency',
    publicUrl: 'store.publicUrl',
  },
  paypal: {
    environment: 'paypal.environment', // "sandbox" | "live"
    clientId: 'paypal.clientId',
    clientSecret: 'paypal.clientSecret',
    webhookId: 'paypal.webhookId',
    enableCard: 'paypal.enableCard',
    enablePaypalButton: 'paypal.enablePaypalButton',
  },
  mailgun: {
    apiKey: 'mailgun.apiKey',
    domain: 'mailgun.domain',
    region: 'mailgun.region',       // "us" | "eu"
    fromEmail: 'mailgun.fromEmail',
    fromName: 'mailgun.fromName',
    replyTo: 'mailgun.replyTo',
    webhookSigningKey: 'mailgun.webhookSigningKey',
    testMode: 'mailgun.testMode',
  },
  anthropic: {
    apiKey: 'anthropic.apiKey',
    model: 'anthropic.model',
  },
  seo: {
    siteTitleTemplate: 'seo.siteTitleTemplate',
    defaultMetaDescription: 'seo.defaultMetaDescription',
    robotsPolicy: 'seo.robotsPolicy', // "index" | "noindex"
  },
};

function envFallback(key: string): unknown {
  switch (key) {
    case 'paypal.environment':  return process.env.PAYPAL_ENV ?? 'sandbox';
    case 'paypal.clientId':     return process.env.PAYPAL_CLIENT_ID ?? '';
    case 'paypal.clientSecret': return process.env.PAYPAL_CLIENT_SECRET ?? '';
    case 'paypal.webhookId':    return process.env.PAYPAL_WEBHOOK_ID ?? '';
    case 'mailgun.apiKey':            return process.env.MAILGUN_API_KEY ?? '';
    case 'mailgun.domain':            return process.env.MAILGUN_DOMAIN ?? '';
    case 'mailgun.region':            return process.env.MAILGUN_REGION ?? 'us';
    case 'mailgun.fromEmail':         return process.env.MAILGUN_FROM_EMAIL ?? '';
    case 'mailgun.fromName':          return process.env.MAILGUN_FROM_NAME ?? 'Printing Comics';
    case 'mailgun.replyTo':           return process.env.MAILGUN_REPLY_TO ?? '';
    case 'mailgun.webhookSigningKey': return process.env.MAILGUN_WEBHOOK_SIGNING_KEY ?? '';
    case 'mailgun.testMode':          return process.env.MAILGUN_TEST_MODE === 'true';
    case 'anthropic.apiKey':    return process.env.ANTHROPIC_API_KEY ?? '';
    case 'anthropic.model':     return process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-7';
    case 'store.currency':      return 'USD';
    case 'store.country':       return 'US';
    case 'store.publicUrl':     return process.env.PUBLIC_URL ?? '';
    case 'contact.inboundEmail': return process.env.CONTACT_INBOUND_EMAIL ?? '';
    default: return null;
  }
}

/** In-process cache with short TTL to avoid hitting DB for every request. */
const cache = new Map<string, { value: unknown; expiresAt: number }>();
const TTL_MS = 5_000;

function cachePut(key: string, value: unknown) {
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

function cacheGet(key: string): unknown | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

export function invalidateSettingsCache() {
  cache.clear();
}

/** Get one setting's raw value (decrypted if secret). Falls back to env. */
export async function getSetting<T = unknown>(key: string, fallback?: T): Promise<T | null> {
  const cached = cacheGet(key);
  if (cached !== undefined) return cached as T;

  const row = await prisma.setting.findUnique({ where: { key } });
  let value: unknown;
  if (row) {
    if (row.encrypted && typeof row.value === 'string') {
      try { value = decryptSecret(row.value); } catch { value = null; }
    } else {
      value = row.value;
    }
  } else {
    value = envFallback(key);
  }
  if (value === undefined || value === null || value === '') {
    value = fallback ?? envFallback(key);
  }
  cachePut(key, value);
  return (value as T) ?? null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const encrypt = SECRET_KEYS.has(key);
  let storedValue: unknown = value;
  if (encrypt) {
    const asString = typeof value === 'string' ? value : JSON.stringify(value);
    storedValue = encryptSecret(asString);
  }
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: storedValue as any, encrypted: encrypt },
    update: { value: storedValue as any, encrypted: encrypt },
  });
  cache.delete(key);
}

export async function deleteSetting(key: string): Promise<void> {
  await prisma.setting.delete({ where: { key } }).catch(() => undefined);
  cache.delete(key);
}

/** List every setting, with secret values masked, for the admin UI. */
export async function listAllSettings(): Promise<Record<string, unknown>> {
  const rows = await prisma.setting.findMany();
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    if (r.encrypted && typeof r.value === 'string') {
      try { out[r.key] = maskSecret(decryptSecret(r.value)); }
      catch { out[r.key] = null; }
    } else {
      out[r.key] = r.value;
    }
  }
  return out;
}

export async function getPaypalConfig() {
  const [environment, clientId, clientSecret, webhookId, enableCard, enableButton] = await Promise.all([
    getSetting<string>('paypal.environment'),
    getSetting<string>('paypal.clientId'),
    getSetting<string>('paypal.clientSecret'),
    getSetting<string>('paypal.webhookId'),
    getSetting<boolean>('paypal.enableCard'),
    getSetting<boolean>('paypal.enablePaypalButton'),
  ]);
  return {
    environment: environment === 'live' ? 'live' : 'sandbox',
    clientId: clientId ?? '',
    clientSecret: clientSecret ?? '',
    webhookId: webhookId ?? '',
    enableCard: enableCard ?? true,
    enableButton: enableButton ?? true,
  };
}

export async function getMailgunConfig() {
  const [apiKey, domain, region, fromEmail, fromName, replyTo, webhookSigningKey, testMode] = await Promise.all([
    getSetting<string>('mailgun.apiKey'),
    getSetting<string>('mailgun.domain'),
    getSetting<string>('mailgun.region'),
    getSetting<string>('mailgun.fromEmail'),
    getSetting<string>('mailgun.fromName'),
    getSetting<string>('mailgun.replyTo'),
    getSetting<string>('mailgun.webhookSigningKey'),
    getSetting<boolean>('mailgun.testMode'),
  ]);
  return {
    apiKey: apiKey ?? '',
    domain: domain ?? '',
    region: (region === 'eu' ? 'eu' : 'us') as 'us' | 'eu',
    fromEmail: fromEmail ?? '',
    fromName: fromName ?? 'Printing Comics',
    replyTo: replyTo ?? '',
    webhookSigningKey: webhookSigningKey ?? '',
    testMode: Boolean(testMode),
  };
}

export async function getAnthropicConfig() {
  const [apiKey, model] = await Promise.all([
    getSetting<string>('anthropic.apiKey'),
    getSetting<string>('anthropic.model'),
  ]);
  return { apiKey: apiKey ?? '', model: model ?? 'claude-opus-4-7' };
}
