/**
 * Print cost settings and per-order material estimates. Owner-only — costs
 * and margins are not for staff accounts, and never for customers.
 *
 *   GET  /admin/costs/print          config + reference lists for the form
 *   PUT  /admin/costs/print          save the config (normalised server-side)
 *   GET  /admin/costs/orders/:id     estimate for one order
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { HttpError } from '../../middleware/error.js';
import { estimateOrderCosts, loadPrintCosts, printCostRefs, savePrintCosts } from '../../lib/print-costs.js';

const router = Router();

function requireOwner(req: Request, _res: Response, next: NextFunction) {
  if (req.session?.role !== 'ADMIN') throw new HttpError(403, 'Owner access required');
  next();
}
router.use(requireOwner);

router.get('/print', async (_req, res) => {
  const [config, refs] = await Promise.all([loadPrintCosts(), printCostRefs()]);
  res.json({ config, refs });
});

router.put('/print', async (req, res) => {
  const config = await savePrintCosts(req.body?.config ?? req.body);
  res.json({ config });
});

router.get('/orders/:id', async (req, res) => {
  const estimate = await estimateOrderCosts(String(req.params.id));
  if (!estimate) throw new HttpError(404, 'Order not found');
  res.json({ estimate });
});

export default router;
