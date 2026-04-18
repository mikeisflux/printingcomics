import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signSession } from '../lib/jwt.js';
import { config, isProd } from '../config.js';
import { HttpError } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';

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
