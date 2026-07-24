import { getPaypalConfig as getPaypalSettings, invalidateSettingsCache } from '../../settings.js';
import { HttpError } from '../../../middleware/error.js';

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
  // Trim — a trailing space/newline from copy-paste is a common, invisible
  // cause of "invalid_client" (the credential no longer matches byte-for-byte).
  const clientId = (settings.clientId || '').trim();
  const clientSecret = (settings.clientSecret || '').trim();
  const webhookId = (settings.webhookId || '').trim();
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
    // Log the raw PayPal body for diagnostics, but return an actionable,
    // buyer-safe message instead of a bare 500. invalid_client means the
    // Client ID + Secret pair PayPal received didn't authenticate — almost
    // always a wrong/rotated Secret or an environment (sandbox/live) that
    // doesn't match the credentials.
    console.error('[paypal] auth failed', { env: config.baseUrl, body: err });
    if (res.status === 401 || /invalid_client/.test(err)) {
      throw new HttpError(
        502,
        'Payment provider rejected our credentials. If you are the site owner, re-check the PayPal Client ID, Secret, and that the environment (Sandbox/Live) matches the keys in Admin → Settings → Payments.',
      );
    }
    throw new HttpError(502, 'Could not reach the payment provider. Please try again in a moment.');
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export function invalidatePayPalConfigCache() {
  cachedConfig = null;
  cacheExpiry = 0;
  invalidateSettingsCache();
}
