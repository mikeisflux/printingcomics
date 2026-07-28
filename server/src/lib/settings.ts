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
  'easypost.apiKey',
  'easypost.webhookSecret',
  'r2.accessKeyId',
  'r2.secretAccessKey',
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
  easypost: {
    apiKey: 'easypost.apiKey',
    baseUrl: 'easypost.baseUrl',
    autoBuyOnPaid: 'easypost.autoBuyOnPaid',
    webhookSecret: 'easypost.webhookSecret',
    fromName: 'easypost.fromName',
    fromCompany: 'easypost.fromCompany',
    fromEmail: 'easypost.fromEmail',
    fromPhone: 'easypost.fromPhone',
    fromStreet1: 'easypost.fromStreet1',
    fromStreet2: 'easypost.fromStreet2',
    fromCity: 'easypost.fromCity',
    fromState: 'easypost.fromState',
    fromPostalCode: 'easypost.fromPostalCode',
    fromCountry: 'easypost.fromCountry',
  },
  r2: {
    enabled: 'r2.enabled',
    accountId: 'r2.accountId',
    accessKeyId: 'r2.accessKeyId',
    secretAccessKey: 'r2.secretAccessKey',
    bucket: 'r2.bucket',
    endpoint: 'r2.endpoint',           // optional override
    publicBaseUrl: 'r2.publicBaseUrl', // public/custom domain for the bucket
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
  pricing: {
    siteDiscountBps: 'pricing.siteDiscountBps', // 0 = off; 1000 = 10% off everything
  },
};

function envFallback(key: string): unknown {
  switch (key) {
    case 'paypal.environment':  return process.env.PAYPAL_ENV ?? 'sandbox';
    case 'paypal.clientId':     return process.env.PAYPAL_CLIENT_ID ?? '';
    case 'paypal.clientSecret': return process.env.PAYPAL_CLIENT_SECRET ?? '';
    case 'paypal.webhookId':    return process.env.PAYPAL_WEBHOOK_ID ?? '';
    case 'r2.enabled':              return process.env.R2_ENABLED === 'true';
    case 'r2.accountId':            return process.env.R2_ACCOUNT_ID ?? '';
    case 'r2.accessKeyId':          return process.env.R2_ACCESS_KEY_ID ?? '';
    case 'r2.secretAccessKey':      return process.env.R2_SECRET_ACCESS_KEY ?? '';
    case 'r2.bucket':               return process.env.R2_BUCKET ?? '';
    case 'r2.endpoint':             return process.env.R2_ENDPOINT ?? '';
    case 'r2.publicBaseUrl':        return process.env.R2_PUBLIC_BASE_URL ?? '';
    case 'easypost.apiKey':         return process.env.EASYPOST_API_KEY ?? '';
    case 'easypost.baseUrl':        return process.env.EASYPOST_BASE_URL ?? 'https://api.easypost.com/v2';
    case 'easypost.autoBuyOnPaid':  return process.env.EASYPOST_AUTO_BUY === 'true';
    case 'easypost.webhookSecret':  return process.env.EASYPOST_WEBHOOK_SECRET ?? '';
    case 'easypost.fromCountry':    return 'US';
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

export async function getR2Config() {
  const keys = [
    'r2.enabled', 'r2.accountId', 'r2.accessKeyId', 'r2.secretAccessKey',
    'r2.bucket', 'r2.endpoint', 'r2.publicBaseUrl',
  ] as const;
  const values = await Promise.all(keys.map((k) => getSetting<string | boolean>(k)));
  const v = (i: number) => String((values[i] as string | undefined) ?? '').trim();
  return {
    enabled: values[0] === true || values[0] === 'true',
    accountId: v(1),
    accessKeyId: v(2),
    secretAccessKey: v(3),
    bucket: v(4),
    endpoint: v(5),
    publicBaseUrl: v(6),
  };
}

export async function getEasyPostConfig() {
  const keys = [
    'easypost.apiKey', 'easypost.baseUrl',
    'easypost.autoBuyOnPaid', 'easypost.webhookSecret',
    'easypost.fromName', 'easypost.fromCompany', 'easypost.fromEmail',
    'easypost.fromPhone',
    'easypost.fromStreet1', 'easypost.fromStreet2',
    'easypost.fromCity', 'easypost.fromState',
    'easypost.fromPostalCode', 'easypost.fromCountry',
  ] as const;
  const values = await Promise.all(keys.map((k) => getSetting<string | boolean>(k)));
  const v = (i: number) => (values[i] as string | undefined) ?? '';
  return {
    apiKey: v(0),
    baseUrl: (v(1) || 'https://api.easypost.com/v2').replace(/\/$/, ''),
    autoBuyOnPaid: Boolean(values[2]),
    webhookSecret: v(3),
    fromName: v(4),
    fromCompany: v(5),
    fromEmail: v(6),
    fromPhone: v(7),
    fromStreet1: v(8),
    fromStreet2: v(9),
    fromCity: v(10),
    fromState: v(11),
    fromPostalCode: v(12),
    fromCountry: v(13) || 'US',
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
  // Trim every credential/field — a stray space or newline pasted into the
  // API key or domain is a common cause of Mailgun 401s.
  return {
    apiKey: (apiKey ?? '').trim(),
    domain: (domain ?? '').trim(),
    region: (String(region ?? 'us').trim().toLowerCase() === 'eu' ? 'eu' : 'us') as 'us' | 'eu',
    fromEmail: (fromEmail ?? '').trim(),
    fromName: (fromName ?? 'Printing Comics').trim(),
    replyTo: (replyTo ?? '').trim(),
    webhookSigningKey: (webhookSigningKey ?? '').trim(),
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
