import { Router } from 'express';

// Packlink Pro doesn't provide outbound webhooks in their UI, so we poll
// instead (see lib/packlink-poller.ts). This endpoint exists only to
// return a clean 410 for anyone who has a stale webhook URL pointing here.
const router = Router();

router.all('/', (_req, res) => {
  res.status(410).json({
    error: 'Packlink Pro webhook endpoint retired — this app polls the Packlink API every 10 minutes instead.',
  });
});

export default router;
