import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface SessionClaims {
  sub: string;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  email: string;
  /** The account's session version when the cookie was issued; an older one is refused. */
  sv?: number;
  /** Filled in per request from the database (not stored in the cookie). */
  permissions?: string[];
}

export function signSession(claims: SessionClaims): string {
  return jwt.sign(claims, config.jwtSecret, { expiresIn: '30d' });
}

export function verifySession(token: string): SessionClaims | null {
  try {
    return jwt.verify(token, config.jwtSecret) as SessionClaims;
  } catch {
    return null;
  }
}
