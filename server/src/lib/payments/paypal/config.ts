import { getPaypalConfig as getPaypalSettings, invalidateSettingsCache } from '../../settings.js';

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  baseUrl: string;
}

let cachedConfig: PayPalConfig | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

export async function getPayPalConfig(): Promise<PayPalConfig> {
  if (cachedConfig && Date.now() < cacheExpiry) return cachedConfig;

  const settings = await getPaypalSettings();
  const clientId = settings.clientId || '';
  const clientSecret = settings.clientSecret || '';
  const webhookId = settings.webhookId || '';
  const mode = settings.environment || 'sandbox';

  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured. Set them in Admin → Settings → Payments.');
  }

  const baseUrl =
    mode === 'sandbox'
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com';

  cachedConfig = { clientId, clientSecret, webhookId, baseUrl };
  cacheExpiry = Date.now() + CACHE_TTL;
  return cachedConfig;
}

export async function getPayPalAccessToken(): Promise<string> {
  const config = await getPayPalConfig();
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  const res = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal auth failed: ${err}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export function invalidatePayPalConfigCache() {
  cachedConfig = null;
  cacheExpiry = 0;
  invalidateSettingsCache();
}
