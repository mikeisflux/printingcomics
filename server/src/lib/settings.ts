import { prisma } from '../db.js';
import { decryptSecret, encryptSecret, maskSecret } from './crypto.js';

/**
 * Keys we treat as secrets: stored encrypted, masked when listing for UI,
 * but returned plaintext when read by server-side services.
 */
export const SECRET_KEYS = new Set<string>([
  'paypal.clientSecret',
  'paypal.webhookId',
  'brevo.apiKey',
  'smtp.password',
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
  smtp: {
    host: 'smtp.host',
    port: 'smtp.port',
    secure: 'smtp.secure',
    user: 'smtp.user',
    password: 'smtp.password',
    fromEmail: 'smtp.fromEmail',
    fromName: 'smtp.fromName',
    replyTo: 'smtp.replyTo',
    testMode: 'smtp.testMode',
    // Secret for the inbound email pipe auth. Requests to /api/inbound
    // must present this as a Bearer token.
    inboundSecret: 'smtp.inboundSecret',
  },
  // Kept for migration; remove after settings have been re-entered.
  brevo: {
    apiKey: 'brevo.apiKey',
    fromEmail: 'brevo.fromEmail',
    fromName: 'brevo.fromName',
    replyTo: 'brevo.replyTo',
    testMode: 'brevo.testMode',
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
    case 'brevo.apiKey':        return process.env.BREVO_API_KEY ?? '';
    case 'brevo.fromEmail':     return process.env.BREVO_FROM_EMAIL ?? '';
    case 'brevo.fromName':      return process.env.BREVO_FROM_NAME ?? 'Printing Comics';
    case 'smtp.host':           return process.env.SMTP_HOST ?? 'localhost';
    case 'smtp.port':           return Number(process.env.SMTP_PORT ?? 25);
    case 'smtp.secure':         return process.env.SMTP_SECURE === 'true';
    case 'smtp.user':           return process.env.SMTP_USER ?? '';
    case 'smtp.password':       return process.env.SMTP_PASSWORD ?? '';
    case 'smtp.fromEmail':      return process.env.SMTP_FROM_EMAIL ?? '';
    case 'smtp.fromName':       return process.env.SMTP_FROM_NAME ?? 'Printing Comics';
    case 'smtp.replyTo':        return process.env.SMTP_REPLY_TO ?? '';
    case 'smtp.testMode':       return process.env.SMTP_TEST_MODE === 'true';
    case 'smtp.inboundSecret':  return process.env.SMTP_INBOUND_SECRET ?? '';
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

export async function getSmtpConfig() {
  const [host, port, secure, user, password, fromEmail, fromName, replyTo, testMode, inboundSecret] = await Promise.all([
    getSetting<string>('smtp.host'),
    getSetting<number>('smtp.port'),
    getSetting<boolean>('smtp.secure'),
    getSetting<string>('smtp.user'),
    getSetting<string>('smtp.password'),
    getSetting<string>('smtp.fromEmail'),
    getSetting<string>('smtp.fromName'),
    getSetting<string>('smtp.replyTo'),
    getSetting<boolean>('smtp.testMode'),
    getSetting<string>('smtp.inboundSecret'),
  ]);
  return {
    host: host ?? '',
    port: Number(port) || 25,
    secure: Boolean(secure),
    user: user ?? '',
    password: password ?? '',
    fromEmail: fromEmail ?? '',
    fromName: fromName ?? 'Printing Comics',
    replyTo: replyTo ?? null,
    testMode: Boolean(testMode),
    inboundSecret: inboundSecret ?? '',
  };
}

/** @deprecated — replaced by getSmtpConfig. Kept for existing callers only. */
export async function getBrevoConfig() {
  const [apiKey, fromEmail, fromName, replyTo, testMode] = await Promise.all([
    getSetting<string>('brevo.apiKey'),
    getSetting<string>('brevo.fromEmail'),
    getSetting<string>('brevo.fromName'),
    getSetting<string>('brevo.replyTo'),
    getSetting<boolean>('brevo.testMode'),
  ]);
  return {
    apiKey: apiKey ?? '',
    fromEmail: fromEmail ?? '',
    fromName: fromName ?? 'Printing Comics',
    replyTo: replyTo ?? null,
    testMode: testMode ?? false,
  };
}

export async function getAnthropicConfig() {
  const [apiKey, model] = await Promise.all([
    getSetting<string>('anthropic.apiKey'),
    getSetting<string>('anthropic.model'),
  ]);
  return { apiKey: apiKey ?? '', model: model ?? 'claude-opus-4-7' };
}
