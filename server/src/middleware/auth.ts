import type { NextFunction, Request, Response } from 'express';
import { verifySession, type SessionClaims } from '../lib/jwt.js';
import { config } from '../config.js';

declare module 'express-serve-static-core' {
  interface Request {
    session?: SessionClaims;
    sessionKey?: string;
  }
}

/** Soft: attaches session if present; does not reject. */
export function attachSession(req: Request, _res: Response, next: NextFunction) {
  const token =
    req.cookies?.[config.sessionCookie] ??
    req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (token) {
    const claims = verifySession(token);
    if (claims) req.session = claims;
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
