import { Router, type Request, type Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signSession } from '../lib/jwt.js';
import { config, isProd } from '../config.js';
import { HttpError } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { sendEmail } from '../lib/mailgun.js';
import { getSetting } from '../lib/settings.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
});

function setSessionCookie(res: Response, token: string) {
  res.cookie(config.sessionCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

router.post('/register', async (req: Request, res: Response) => {
  const data = registerSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) throw new HttpError(409, 'An account with that email already exists');

  const user = await prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      passwordHash: await hashPassword(data.password),
      firstName: data.firstName,
      lastName: data.lastName,
    },
  });

  const token = signSession({ sub: user.id, role: user.role, email: user.email });
  setSessionCookie(res, token);
  res.json({ user: { id: user.id, email: user.email, role: user.role } });
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

  const token = signSession({ sub: user.id, role: user.role, email: user.email });
  setSessionCookie(res, token);
  res.json({ user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName } });
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
  if (user) {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    const publicUrl = (await getSetting<string>('store.publicUrl')) ?? '';
    const resetLink = `${publicUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;
    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:auto">
        <h2>Reset your password</h2>
        <p>Click the link below to choose a new password. The link expires in 1 hour.</p>
        <p><a href="${resetLink}" style="background:#1e74fc;color:#fff;padding:.6rem 1rem;border-radius:6px;text-decoration:none;display:inline-block">Reset password</a></p>
        <p style="color:#666;font-size:.85rem">If you didn't request this, ignore this email — your password won't change.</p>
      </div>
    `;
    try {
      await sendEmail({
        to: { email: user.email },
        subject: 'Reset your Printing Comics password',
        html,
        text: `Reset your password: ${resetLink}\n\nThe link expires in 1 hour.`,
        tags: ['password-reset'],
      });
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn('[forgot-password] Mailgun send failed:', e.message);
    }
  }
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
      data: { passwordHash: await hashPassword(password) },
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
      id: true, email: true, role: true, firstName: true, lastName: true, phone: true,
    },
  });
  res.json({ user });
});

export default router;
