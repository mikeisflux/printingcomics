/**
 * The part of a session that lives in the database, not the cookie: whether
 * the account is still active, its current role and permissions, and the
 * session version (bumped to sign the account out everywhere). Looked up
 * per request with a short cache, so disabling an account or changing what
 * it may do takes effect within seconds instead of at cookie expiry.
 */
import { prisma } from '../db.js';

export interface AuthState {
  active: boolean;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  permissions: string[];
  sessionVersion: number;
}

const TTL_MS = 15_000;
const cache = new Map<string, { at: number; state: AuthState | null }>();

export async function getAuthState(userId: string): Promise<AuthState | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.state;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { active: true, role: true, permissions: true, sessionVersion: true } });
  const state = u ? { active: u.active, role: u.role, permissions: u.permissions, sessionVersion: u.sessionVersion } : null;
  cache.set(userId, { at: Date.now(), state });
  if (cache.size > 5000) for (const [k, v] of cache) if (Date.now() - v.at > TTL_MS) cache.delete(k);
  return state;
}

/** Call after changing an account's role, permissions, status or session version. */
export function forgetAuthState(userId: string): void {
  cache.delete(userId);
}
