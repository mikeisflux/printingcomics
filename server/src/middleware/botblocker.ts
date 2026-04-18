import type { NextFunction, Request, Response } from 'express';
import { isIPBlocked, recordSuspiciousActivity } from '../lib/bot-blocker.js';

/** Returns the client IP, preferring X-Forwarded-For when set by a trusted proxy. */
export function clientIp(req: Request): string {
  const xff = req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.ip ?? 'unknown';
}

/** Blocks requests from banned IPs. Mount early in the stack. */
export async function botBlockerGate(req: Request, res: Response, next: NextFunction) {
  const ip = clientIp(req);
  if (await isIPBlocked(ip)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}

/** Report a suspicious hit (e.g. invalid body, auth bruteforce, known bot UA). */
export async function reportSuspicious(
  req: Request,
  reason: string,
  metadata: { actionId?: string } = {},
) {
  const ip = clientIp(req);
  return recordSuspiciousActivity(ip, reason, {
    path: req.originalUrl,
    userAgent: req.header('user-agent') ?? undefined,
    actionId: metadata.actionId,
  });
}
