/**
 * Public API key helpers.
 *
 * Keys are minted once at creation time, returned to the caller, and never
 * stored in plaintext. We persist:
 *   - prefix: the first 12 chars (`pc_live_xxxx`) — safe to display so the
 *     admin can identify a key without revealing it.
 *   - keyHash: sha256(rawKey) — what every incoming request gets hashed to
 *     and looked up against.
 *
 * Format: `pc_live_<32 hex chars>` (40 chars total).
 */
import { createHash, randomBytes } from 'node:crypto';

const KEY_PREFIX = 'pc_live_';
const PREFIX_DISPLAY_LENGTH = 12;

export interface MintedApiKey {
  /** The full secret key — show to the user exactly once. */
  rawKey: string;
  /** Short identifier safe to persist and display. */
  prefix: string;
  /** sha256 of `rawKey`, hex-encoded. */
  keyHash: string;
}

export function mintApiKey(): MintedApiKey {
  const raw = `${KEY_PREFIX}${randomBytes(16).toString('hex')}`;
  return {
    rawKey: raw,
    prefix: raw.slice(0, PREFIX_DISPLAY_LENGTH),
    keyHash: hashApiKey(raw),
  };
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
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
