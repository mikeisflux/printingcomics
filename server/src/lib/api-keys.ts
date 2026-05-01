/**
 * Public API key helpers.
 *
 * Each issued credential is a pair:
 *   - rawKey  (`pc_live_…`): bearer token used for authentication. We store
 *     only sha256(rawKey) and a 12-char prefix so the admin can identify it.
 *   - rawSigningSecret (`pcs_…`): HMAC secret the integrator can sign request
 *     bodies with (X-PC-Request-Signature). Stored AES-GCM encrypted at rest
 *     so we can verify signatures on incoming requests.
 *
 * Both are returned exactly once at mint time. Either can be rotated.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { encryptSecret, decryptSecret } from './crypto.js';

const KEY_PREFIX = 'pc_live_';
const SIGNING_SECRET_PREFIX = 'pcs_';
const PREFIX_DISPLAY_LENGTH = 12;

export interface MintedApiKey {
  /** The full bearer key — show to the user exactly once. */
  rawKey: string;
  /** Short identifier safe to persist and display. */
  prefix: string;
  /** sha256 of `rawKey`, hex-encoded. */
  keyHash: string;
  /** The HMAC signing secret — show to the user exactly once. */
  rawSigningSecret: string;
  /** AES-GCM encrypted form of `rawSigningSecret`, persisted in the DB. */
  signingSecretEncrypted: string;
}

export function mintApiKey(): MintedApiKey {
  const raw = `${KEY_PREFIX}${randomBytes(16).toString('hex')}`;
  const rawSigningSecret = `${SIGNING_SECRET_PREFIX}${randomBytes(32).toString('hex')}`;
  return {
    rawKey: raw,
    prefix: raw.slice(0, PREFIX_DISPLAY_LENGTH),
    keyHash: hashApiKey(raw),
    rawSigningSecret,
    signingSecretEncrypted: encryptSecret(rawSigningSecret),
  };
}

/** Re-mint just the signing secret (key bearer token unchanged). */
export function mintSigningSecret(): { rawSigningSecret: string; signingSecretEncrypted: string } {
  const rawSigningSecret = `${SIGNING_SECRET_PREFIX}${randomBytes(32).toString('hex')}`;
  return { rawSigningSecret, signingSecretEncrypted: encryptSecret(rawSigningSecret) };
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Verify an X-PC-Request-Signature header of the form `t=<unix>,v1=<hex>`
 * computed as HMAC-SHA256(secret, `${t}.${rawBody}`). Constant-time compare,
 * 5-minute window to defeat replays.
 */
export function verifyRequestSignature(
  signatureHeader: string,
  rawBody: string,
  signingSecretEncrypted: string,
): { ok: boolean; reason?: string } {
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const idx = p.indexOf('=');
      return idx === -1 ? [p, ''] : [p.slice(0, idx).trim(), p.slice(idx + 1).trim()];
    }),
  ) as Record<string, string>;
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return { ok: false, reason: 'malformed signature header' };
  const ts = Number(t);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'invalid timestamp' };
  const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (skew > 300) return { ok: false, reason: 'timestamp outside 5-minute window' };

  let secret: string;
  try {
    secret = decryptSecret(signingSecretEncrypted);
  } catch {
    return { ok: false, reason: 'signing secret unavailable' };
  }
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(v1);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: 'signature mismatch' };
  return { ok: timingSafeEqual(a, b), reason: 'signature mismatch' };
}

/** Extract the bearer key from common header shapes. */
export function extractApiKey(headers: Record<string, string | string[] | undefined>): string | null {
  const xApiKey = headers['x-api-key'];
  if (typeof xApiKey === 'string' && xApiKey.trim()) return xApiKey.trim();
  const auth = headers['authorization'];
  if (typeof auth === 'string') {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  return null;
}

/** Available scope strings. Any unknown scope is rejected. */
export const API_SCOPES = [
  'catalog:read',
  'pricing:read',
  'shipping:read',
  'orders:read',
  'orders:write',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export function isValidScope(s: string): s is ApiScope {
  return (API_SCOPES as readonly string[]).includes(s);
}
