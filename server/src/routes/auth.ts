import { Router, type Request, type Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { startSession } from '../lib/session-cookie.js';
import { config } from '../config.js';
import { HttpError } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { sendEmail } from '../lib/mailgun.js';
import { getSetting } from '../lib/settings.js';
import { attachOrdersToUser, verifyMagicToken } from '../lib/customer-accounts.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
});


/** Email a link that lets the owner of an existing account choose a password. */
async function sendSetPasswordEmail(user: { id: string; email: string }, kind: 'reset' | 'claim'): Promise<void> {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  await prisma.passwordReset.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  const publicUrl = (await getSetting<string>('store.publicUrl')) ?? '';
  const resetLink = `${publicUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;
  const heading = kind === 'claim' ? 'Finish setting up your account' : 'Reset your password';
  const intro = kind === 'claim'
    ? 'An account for this email already exists — it was created when you ordered. Choose a password with the link below and everything you have ordered will be waiting in it.'
    : 'Click the link below to choose a new password.';
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:auto">
      <h2>${heading}</h2>
      <p>${intro} The link expires in 1 hour.</p>
      <p><a href="${resetLink}" style="background:#C61A22;color:#fff;padding:.6rem 1rem;border-radius:6px;text-decoration:none;display:inline-block">${kind === 'claim' ? 'Choose a password' : 'Reset password'}</a></p>
      <p style="color:#666;font-size:.85rem">If you didn't request this, ignore this email — nothing changes.</p>
    </div>
  `;
  try {
    await sendEmail({
      to: { email: user.email },
      subject: kind === 'claim' ? 'Finish setting up your Printing Comics account' : 'Reset your Printing Comics password',
      html,
      text: `${heading}: ${resetLink}\n\nThe link expires in 1 hour.`,
      tags: ['password-reset'],
    });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn('[set-password email] Mailgun send failed:', e.message);
  }
}

router.post('/register', async (req: Request, res: Response) => {
  const data = registerSchema.parse(req.body);
  const email = data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Never hand a session to whoever types an email that already has an
    // account (every past guest order created one). The address itself gets
    // a set-password link; the browser just learns to check the inbox.
    await sendSetPasswordEmail(existing, 'claim');
    return res.json({ claim: true });
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(data.password),
      passwordSetAt: new Date(),
      firstName: data.firstName,
      lastName: data.lastName,
    },
  });
  await attachOrdersToUser(user.id, email);

  startSession(res, user);
  res.json({ user: { id: user.id, email: user.email, role: user.role, hasPassword: true } });
});

/**
 * Sign in from a link in one of our emails (proofs ready, files needed) and
 * land on the page it was about. This is how customers whose account was
 * created at checkout get in before they choose a password.
 */
router.get('/magic', async (req: Request, res: Response) => {
  const parsed = verifyMagicToken(String(req.query.token ?? ''));
  const user = parsed ? await prisma.user.findUnique({ where: { id: parsed.userId } }) : null;
  if (!parsed || !user) {
    return res.redirect('/login?expired=1&redirect=' + encodeURIComponent('/account/proofs'));
  }
  await attachOrdersToUser(user.id, user.email);
  startSession(res, user);
  // An account that has never had a password finishes setting itself up
  // (name + password) before it sees anything; then it lands where the
  // email pointed.
  if (user.passwordSetAt === null) return res.redirect(`/account/setup?next=${encodeURIComponent(parsed.to)}`);
  res.redirect(parsed.to);
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new HttpError(401, 'Invalid credentials');
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new HttpError(401, 'Invalid credentials');
  await attachOrdersToUser(user.id, user.email);

  startSession(res, user);
  res.json({ user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, hasPassword: user.passwordSetAt !== null } });
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(config.sessionCookie, { path: '/' });
  res.json({ ok: true });
});

// Forgot password — always returns 200 even if the email isn't on file,
// to avoid leaking which addresses have accounts.
const forgotSchema = z.object({ email: z.string().email() });
router.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = forgotSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // An account that never had a password (created at checkout) gets the
  // "finish setting up" wording; the link is the same.
  if (user) await sendSetPasswordEmail(user, user.passwordSetAt === null ? 'claim' : 'reset');
  res.json({ ok: true });
});

const resetSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(8).max(200),
});
router.post('/reset-password', async (req: Request, res: Response) => {
  const { token, password } = resetSchema.parse(req.body);
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const reset = await prisma.passwordReset.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash: await hashPassword(password), passwordSetAt: new Date() },
    }),
    prisma.passwordReset.update({
      where: { id: reset.id },
      data: { usedAt: new Date() },
    }),
    // Invalidate any other outstanding tokens for this user.
    prisma.passwordReset.updateMany({
      where: { userId: reset.userId, usedAt: null, NOT: { id: reset.id } },
      data: { usedAt: new Date() },
    }),
  ]);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.session!.sub },
    select: {
      id: true, email: true, role: true, firstName: true, lastName: true, phone: true, passwordSetAt: true,
    },
  });
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  const { passwordSetAt, ...rest } = user;
  res.json({ user: { ...rest, hasPassword: passwordSetAt !== null } });
});

export default router;
