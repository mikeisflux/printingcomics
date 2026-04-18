import { Router } from 'express';
import { z } from 'zod';
import {
  blockIP,
  cleanupExpiredData,
  getBlockedIPs,
  getRecentSuspiciousActivity,
  unblockIP,
} from '../../lib/bot-blocker.js';
import { prisma } from '../../db.js';

const router = Router();

router.get('/stats', async (_req, res) => {
  const [activeUsers, blockedIPs, failed24h, blockedList] = await Promise.all([
    prisma.user.count(),
    prisma.blockedIP.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.suspiciousActivity.count({
      where: { createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
    getBlockedIPs(),
  ]);
  res.json({
    activeUsers,
    blockedIPs,
    failedLogins24h: failed24h,
    users2FAEnabled: 0, // 2FA not implemented yet
    blockedPreview: blockedList.slice(0, 5),
  });
});

router.get('/blocked', async (_req, res) => {
  res.json({ blocked: await getBlockedIPs() });
});

router.get('/suspicious', async (_req, res) => {
  const limit = Math.min(Number((_req.query as any).limit ?? 200), 1000);
  res.json({ events: await getRecentSuspiciousActivity(limit) });
});

const blockSchema = z.object({ ip: z.string().min(1), reason: z.string().min(1) });
router.post('/block', async (req, res) => {
  const { ip, reason } = blockSchema.parse(req.body);
  const ok = await blockIP(ip, reason);
  res.json({ ok });
});

router.delete('/block/:ip', async (req, res) => {
  const ok = await unblockIP(req.params.ip);
  res.json({ ok });
});

router.post('/cleanup', async (_req, res) => {
  await cleanupExpiredData();
  res.json({ ok: true });
});

export default router;
