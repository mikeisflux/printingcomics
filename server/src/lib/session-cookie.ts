import type { Response } from 'express';
import { config, isProd } from '../config.js';
import { signSession } from './jwt.js';

/** Sign the user in: a 30-day session cookie, same as the login form issues. */
export function startSession(res: Response, user: { id: string; role: 'CUSTOMER' | 'STAFF' | 'ADMIN'; email: string }): void {
  const token = signSession({ sub: user.id, role: user.role, email: user.email });
  res.cookie(config.sessionCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}
