import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * A link to one order's confirmation page for whoever just placed it.
 *
 * Checkout makes an account for a guest's email but cannot sign them in —
 * typing someone else's address at checkout must not open that person's
 * order history. So the order pages stay behind a session, and the buyer
 * who just paid gets this instead: a signed token that opens exactly this
 * one order, nothing else, for a month. The confirmation email carries a
 * magic link (email proves ownership) for everything beyond that.
 */
interface OrderViewClaims { kind: 'order-view'; sub: string }

export function orderViewToken(orderId: string): string {
  return jwt.sign({ kind: 'order-view', sub: orderId } satisfies OrderViewClaims, config.jwtSecret, { expiresIn: '30d' });
}

/** The order id a view token stands for, or null for anything else. */
export function verifyOrderView(token: unknown): string | null {
  if (typeof token !== 'string' || !token) return null;
  try {
    const c = jwt.verify(token, config.jwtSecret) as Partial<OrderViewClaims>;
    return c.kind === 'order-view' && typeof c.sub === 'string' ? c.sub : null;
  } catch {
    return null;
  }
}
