/**
 * Authenticates requests against the public /api/v1 endpoints using API keys
 * minted in the admin UI. Attaches `req.apiKey` on success and updates
 * `lastUsedAt` (best-effort, fire-and-forget).
 *
 * If the key is attached to a Partner, the partner's status gates access:
 * suspended/archived partners cannot submit orders or read data even with a
 * still-active key. This is the kill switch the admin uses for billing
 * disputes, abuse, etc.
 */
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.js';
import { extractApiKey, hashApiKey, type ApiScope } from '../lib/api-keys.js';

export interface ApiKeyContext {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  partnerId: string | null;
  partnerName: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    apiKey?: ApiKeyContext;
  }
}

export function requireApiKey(...requiredScopes: ApiScope[]) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const raw = extractApiKey(req.headers as Record<string, string | string[] | undefined>);
    if (!raw) {
      return res.status(401).json({
        error: 'Missing API key',
        hint: 'Pass your key in the X-Api-Key header or as Authorization: Bearer <key>.',
      });
    }
    const keyHash = hashApiKey(raw);
    const record = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { partner: true },
    });
    if (!record || !record.active || record.revokedAt) {
      return res.status(401).json({ error: 'Invalid or revoked API key' });
    }

    // Partner-level gate: suspended/archived partners can't transact even
    // through still-active keys. This is the admin's kill switch.
    if (record.partner && record.partner.status !== 'ACTIVE') {
      return res.status(403).json({
        error: `Partner "${record.partner.name}" is ${record.partner.status.toLowerCase()}`,
        hint: 'Contact your account manager at Printing Comics to restore access.',
      });
    }

    if (requiredScopes.length > 0) {
      const missing = requiredScopes.filter((s) => !record.scopes.includes(s));
      if (missing.length > 0) {
        return res.status(403).json({
          error: 'API key is missing required scope',
          missing,
        });
      }
    }

    req.apiKey = {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      scopes: record.scopes,
      partnerId: record.partnerId ?? null,
      partnerName: record.partner?.name ?? null,
    };

    // Best-effort: don't await, don't fail the request if it errors.
    void prisma.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    next();
  };
}
