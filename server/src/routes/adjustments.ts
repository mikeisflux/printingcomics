/**
 * Customer-facing side of an order adjustment: the tokenized "pay the
 * difference" link staff send after changing an item. No login — the token
 * is the credential, same as proof and review links.
 *
 *   GET  /api/adjustments/:token                          what changed, what is owed
 *   POST /api/adjustments/:token/paypal/create            mint the PayPal order
 *   POST /api/adjustments/:token/paypal/capture/:ppOrder  capture + apply the change
 */
import { Router } from 'express';
import { getSetting } from '../lib/settings.js';
import {
  captureAdjustmentPayment,
  createAdjustmentPaypalOrder,
  loadAdjustmentForCustomer,
} from '../lib/order-adjustments.js';

const router = Router();

router.get('/:token', async (req, res) => {
  const adjustment = await loadAdjustmentForCustomer(String(req.params.token));
  const storeName = (await getSetting<string>('store.name')) ?? 'Printing Comics';
  res.json({ adjustment, storeName });
});

router.post('/:token/paypal/create', async (req, res) => {
  res.json(await createAdjustmentPaypalOrder(String(req.params.token)));
});

router.post('/:token/paypal/capture/:paypalOrderId', async (req, res) => {
  res.json(await captureAdjustmentPayment(String(req.params.token), String(req.params.paypalOrderId)));
});

export default router;
