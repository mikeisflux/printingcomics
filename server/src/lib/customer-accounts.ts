/**
 * Every customer has an account, whether or not they ever chose a password.
 *
 * An order placed as a guest creates (or finds) the account for its email and
 * attaches the order to it, so the customer's dashboard is the one place
 * orders, proofs and file requests live. Until the customer sets a password
 * (passwordSetAt is null) the account is reached through signed links in our
 * emails — a magic link signs them in and lands them on the page the email
 * was about — and the Password tab lets them choose one without a "current
 * password".
 *
 * Nothing here makes an account reachable by anyone who merely knows the
 * email: registering with an email that already has an account emails that
 * address a set-password link instead of handing over a session.
 */
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { config } from '../config.js';
import { hashPassword } from './password.js';
import { getSetting } from './settings.js';

/** Move every order placed with this email, and never claimed, onto the account. */
export async function attachOrdersToUser(userId: string, email: string): Promise<number> {
  // Older and API-submitted orders may carry the address in any case.
  const r = await prisma.order.updateMany({ where: { email: { equals: email.trim(), mode: 'insensitive' }, userId: null }, data: { userId } });
  return r.count;
}

/**
 * The customer account a portal (publisher or shop) seat is given to. A staff
 * or admin account is never handed a seat: a seat comes with sign-in links,
 * and a link into an admin account would be a way in for whoever holds it.
 */
export async function ensurePortalAccount(email: string, names?: { firstName?: string | null; lastName?: string | null }) {
  const user = await ensureCustomerAccount(email, names);
  if (user.role !== 'CUSTOMER') throw new HttpError(400, 'That email belongs to a staff account. Portal access needs a customer account; use a different address.');
  return user;
}

/** The account for an email address, created on the spot when there is none. */
export async function ensureCustomerAccount(email: string, names?: { firstName?: string | null; lastName?: string | null }) {
  const normalized = email.trim().toLowerCase();
  let user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: normalized,
        // Unusable until the customer sets one: 32 random bytes nobody knows.
        passwordHash: await hashPassword(randomBytes(32).toString('hex')),
        passwordSetAt: null,
        firstName: names?.firstName?.trim() || null,
        lastName: names?.lastName?.trim() || null,
      },
    });
  } else if (!user.firstName && !user.lastName && (names?.firstName || names?.lastName)) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { firstName: names?.firstName?.trim() || null, lastName: names?.lastName?.trim() || null },
    });
  }
  await attachOrdersToUser(user.id, normalized);
  return user;
}

/** One pass over history: give every guest order an account. Idempotent and cheap. */
export async function attachAllGuestOrders(): Promise<{ accounts: number; orders: number }> {
  const guests = await prisma.order.groupBy({ by: ['email'], where: { userId: null }, _count: { _all: true } });
  const emails = new Set(guests.map((g) => g.email.trim().toLowerCase()).filter(Boolean));
  let accounts = 0;
  let orders = 0;
  for (const email of emails) {
    const before = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    const user = await ensureCustomerAccount(email);
    if (!before) accounts++;
    orders += await prisma.order.count({ where: { userId: user.id, email: { equals: email, mode: 'insensitive' } } });
  }
  return { accounts, orders };
}

// ---------------------------------------------------------------------------
// Magic links: sign in from an email, land on the page it was about
// ---------------------------------------------------------------------------

interface MagicClaims { sub: string; kind: 'magic'; to: string }

const MAGIC_TTL = '14d';

export async function magicLink(userId: string, to: string, opts: { ttl?: string } = {}): Promise<string> {
  const path = to.startsWith('/') && !to.startsWith('//') ? to : '/account';
  const token = jwt.sign({ sub: userId, kind: 'magic', to: path } satisfies MagicClaims, config.jwtSecret, { expiresIn: (opts.ttl ?? MAGIC_TTL) as jwt.SignOptions['expiresIn'] });
  const base = ((await getSetting<string>('store.publicUrl')) || process.env.PUBLIC_URL || 'https://printingcomics.com').replace(/\/$/, '');
  return `${base}/api/auth/magic?token=${encodeURIComponent(token)}`;
}

/** The user id and destination a magic token stands for, or null. */
export function verifyMagicToken(token: string): { userId: string; to: string } | null {
  try {
    const c = jwt.verify(token, config.jwtSecret) as Partial<MagicClaims>;
    if (c.kind !== 'magic' || typeof c.sub !== 'string') return null;
    const to = typeof c.to === 'string' && c.to.startsWith('/') && !c.to.startsWith('//') ? c.to : '/account';
    return { userId: c.sub, to };
  } catch {
    return null;
  }
}
