import type { NextFunction, Request, Response } from 'express';
import { verifySession, type SessionClaims } from '../lib/jwt.js';
import { config } from '../config.js';
import { getAuthState } from '../lib/session-guard.js';
export { requirePermission } from '../lib/permissions.js';

declare module 'express-serve-static-core' {
  interface Request {
    session?: SessionClaims;
    sessionKey?: string;
  }
}

/**
 * Soft: attaches the session if present; does not reject. The cookie says
 * who; the database says whether they are still allowed in (active, not
 * signed out everywhere) and what they currently are (role, permissions).
 */
export async function attachSession(req: Request, _res: Response, next: NextFunction) {
  const token =
    req.cookies?.[config.sessionCookie] ??
    req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (token) {
    const claims = verifySession(token);
    if (claims) {
      try {
        const state = await getAuthState(claims.sub);
        if (state && state.active && (claims.sv ?? 0) >= state.sessionVersion) {
          req.session = { ...claims, role: state.role, permissions: state.permissions };
        }
      } catch {
        // Database hiccup: fall back to the cookie rather than lock everyone out.
        req.session = claims;
      }
    }
  }
  // Anonymous cart session key for guests.
  req.sessionKey = req.cookies?.pc_cart_key ?? req.header('x-cart-key') ?? undefined;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.role !== 'ADMIN' && req.session.role !== 'STAFF') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
