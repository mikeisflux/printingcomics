/**
 * Bot Blocker — database-backed IP blocking with in-memory cache.
 *
 * Ported from indiecrowdfund_2.0 / src/lib/bot-blocker.ts and adapted to the
 * Prisma schema in this repo. Writes blocked IPs to a pending file so a
 * host-side watcher service can apply iptables DROP rules within seconds.
 */

import { appendFile } from 'node:fs/promises';
import { prisma } from '../db.js';

const BOT_BLOCK_THRESHOLD = 3;
const SUSPICIOUS_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const BLOCK_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const PENDING_FILE = process.env.BOTBLOCK_PENDING_FILE ?? '/tmp/botblock-pending';

const blockedIPCache = new Map<string, { expiresAt: Date; checkedAt: number }>();

export async function isIPBlocked(ip: string): Promise<boolean> {
  if (!ip || ip === 'unknown') return false;
  const now = Date.now();

  const cached = blockedIPCache.get(ip);
  if (cached) {
    if (cached.expiresAt.getTime() > now) return true;
    blockedIPCache.delete(ip);
  }

  try {
    const blocked = await prisma.blockedIP.findUnique({
      where: { ipAddress: ip },
      select: { expiresAt: true },
    });
    if (blocked && blocked.expiresAt.getTime() > now) {
      blockedIPCache.set(ip, { expiresAt: blocked.expiresAt, checkedAt: now });
      return true;
    }
    if (blocked) {
      void prisma.blockedIP.deleteMany({ where: { ipAddress: ip } }).catch(() => undefined);
    }
    return false;
  } catch (err) {
    console.error('[bot-blocker] DB error in isIPBlocked:', err);
    return false;
  }
}

export async function recordSuspiciousActivity(
  ip: string,
  reason: string,
  metadata?: { actionId?: string; path?: string; userAgent?: string },
): Promise<boolean> {
  if (!ip || ip === 'unknown') return false;
  try {
    await prisma.suspiciousActivity.create({
      data: {
        ipAddress: ip,
        reason,
        actionId: metadata?.actionId,
        path: metadata?.path,
        userAgent: metadata?.userAgent,
      },
    });

    const windowStart = new Date(Date.now() - SUSPICIOUS_WINDOW_MS);
    const recentCount = await prisma.suspiciousActivity.count({
      where: { ipAddress: ip, createdAt: { gte: windowStart } },
    });
    console.info(`[bot-blocker] suspicious ${ip}: ${reason} (${recentCount})`);

    if (recentCount >= BOT_BLOCK_THRESHOLD) {
      return await blockIP(ip, reason, metadata);
    }
    return false;
  } catch (err) {
    console.error('[bot-blocker] DB error in recordSuspiciousActivity:', err);
    return false;
  }
}

export async function blockIP(
  ip: string,
  reason: string,
  metadata?: { actionId?: string; path?: string; userAgent?: string },
): Promise<boolean> {
  if (!ip || ip === 'unknown') return false;
  const expiresAt = new Date(Date.now() + BLOCK_DURATION_MS);
  try {
    await prisma.blockedIP.upsert({
      where: { ipAddress: ip },
      create: {
        ipAddress: ip,
        reason,
        expiresAt,
        lastUserAgent: metadata?.userAgent,
        lastPath: metadata?.path,
        lastActionId: metadata?.actionId,
      },
      update: {
        reason,
        expiresAt,
        violationCount: { increment: 1 },
        lastUserAgent: metadata?.userAgent,
        lastPath: metadata?.path,
        lastActionId: metadata?.actionId,
      },
    });
    blockedIPCache.set(ip, { expiresAt, checkedAt: Date.now() });

    try {
      await appendFile(PENDING_FILE, `${ip}\n`);
    } catch {
      console.error(`[bot-blocker] could not write pending file for ${ip}`);
    }

    console.info(`[bot-blocker] BLOCKED ${ip} — ${reason} — until ${expiresAt.toISOString()}`);
    return true;
  } catch (err) {
    console.error('[bot-blocker] DB error in blockIP:', err);
    return false;
  }
}

export async function unblockIP(ip: string): Promise<boolean> {
  try {
    await prisma.blockedIP.deleteMany({ where: { ipAddress: ip } });
    blockedIPCache.delete(ip);
    console.info(`[bot-blocker] UNBLOCKED ${ip}`);
    return true;
  } catch (err) {
    console.error('[bot-blocker] error unblocking:', err);
    return false;
  }
}

export async function getBlockedIPs() {
  try {
    return await prisma.blockedIP.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { blockedAt: 'desc' },
    });
  } catch (err) {
    console.error('[bot-blocker] error fetching blocked IPs:', err);
    return [];
  }
}

export async function getRecentSuspiciousActivity(limit = 100) {
  try {
    return await prisma.suspiciousActivity.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (err) {
    console.error('[bot-blocker] error fetching suspicious activity:', err);
    return [];
  }
}

export async function cleanupExpiredData() {
  try {
    const now = new Date();
    const oldActivityCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [blocks, activity] = await Promise.all([
      prisma.blockedIP.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.suspiciousActivity.deleteMany({ where: { createdAt: { lt: oldActivityCutoff } } }),
    ]);
    if (blocks.count > 0 || activity.count > 0) {
      console.info(`[bot-blocker] cleanup: ${blocks.count} blocks, ${activity.count} logs`);
    }
    for (const [ip, data] of blockedIPCache.entries()) {
      if (data.expiresAt.getTime() < now.getTime()) blockedIPCache.delete(ip);
    }
  } catch (err) {
    console.error('[bot-blocker] error during cleanup:', err);
  }
}

export function isValidServerActionId(actionId: string): boolean {
  if (!actionId || actionId.length < 10) return false;
  return /^[a-f0-9]+$/i.test(actionId);
}
