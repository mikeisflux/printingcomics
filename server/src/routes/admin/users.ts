/**
 * Accounts: customers, staff and admins — list, create, edit, passwords,
 * sign-in links, roles and permissions, disable, delete, and the record of
 * what was done to each account.
 *
 *   GET    /users?q=&role=&status=&partner=&sort=&page=&pageSize=
 *   GET    /users/meta                      role counts + the permission catalogue
 *   GET    /users/:id                       profile, addresses, orders, activity
 *   POST   /users                           create (with a password, or email an invite)
 *   PATCH  /users/:id                       profile, role, permissions, status, notes
 *   POST   /users/:id/password              set a password (signs them out everywhere)
 *   POST   /users/:id/password-reset        a reset link: emailed, and returned to copy
 *   POST   /users/:id/sign-in-link          a one-click sign-in link to the account
 *   POST   /users/:id/sign-out              sign the account out everywhere
 *   DELETE /users/:id
 *
 * Reading accounts needs the Customers permission; changing them needs
 * Users & access (admins). Nobody can lock themselves out or remove the
 * last admin.
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { hashPassword } from '../../lib/password.js';
import { requirePermission, PERMISSIONS, STAFF_GRANTABLE, effectivePermissions } from '../../lib/permissions.js';
import { forgetAuthState } from '../../lib/session-guard.js';
import { createPasswordResetLink, sendSetPasswordEmail } from '../../lib/password-reset.js';
import { magicLink, attachOrdersToUser } from '../../lib/customer-accounts.js';
import { sendEmail } from '../../lib/mailgun.js';
import { randomBytes } from 'node:crypto';

const router = Router();

const ROLES = ['CUSTOMER', 'STAFF', 'ADMIN'] as const;
type RoleName = (typeof ROLES)[number];

function actor(req: Request): string | null {
  return req.session?.email ?? null;
}
function clientIp(req: Request): string | null {
  return (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || null;
}
async function logEvent(req: Request, userId: string, action: string, details?: Record<string, unknown>) {
  await prisma.userEvent.create({ data: { userId, actorEmail: actor(req), action, details: (details ?? undefined) as any, ip: clientIp(req) } }).catch(() => undefined);
}

const listSelect = {
  id: true, email: true, firstName: true, lastName: true, phone: true, role: true, permissions: true, active: true,
  passwordSetAt: true, lastLoginAt: true, createdAt: true,
  partner: { select: { id: true, slug: true, name: true, color: true } },
  _count: { select: { orders: true } },
} as const;

function presentRow(u: any) {
  const { passwordSetAt, permissions, ...rest } = u;
  return { ...rest, hasPassword: passwordSetAt !== null, permissions: effectivePermissions({ role: u.role, permissions }), grantedPermissions: permissions, orderCount: u._count?.orders ?? 0 };
}

// ---------- read (Customers permission) ----------

router.get('/', requirePermission('customers'), async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const role = req.query.role as string | undefined;
  const status = req.query.status as string | undefined;
  const partnerFilter = req.query.partner as string | undefined;
  const sort = (req.query.sort as string | undefined) ?? 'newest';
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize ?? 50) || 50));

  const where: any = {};
  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (role === 'CUSTOMER' || role === 'STAFF' || role === 'ADMIN') where.role = role;
  else if (role === 'team') where.role = { in: ['STAFF', 'ADMIN'] };
  if (status === 'active') where.active = true;
  else if (status === 'disabled') where.active = false;
  else if (status === 'no-password') where.passwordSetAt = null;
  if (partnerFilter === 'any') where.partnerId = { not: null };
  else if (partnerFilter === 'none') where.partnerId = null;
  else if (partnerFilter) where.partnerId = partnerFilter;

  const orderBy: any =
    sort === 'name' ? [{ lastName: 'asc' }, { firstName: 'asc' }, { email: 'asc' }]
    : sort === 'email' ? { email: 'asc' }
    : sort === 'last-login' ? [{ lastLoginAt: { sort: 'desc', nulls: 'last' } }]
    : sort === 'orders' ? { orders: { _count: 'desc' } }
    : sort === 'oldest' ? { createdAt: 'asc' }
    : { createdAt: 'desc' };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: listSelect }),
  ]);
  res.json({ users: users.map(presentRow), total, page, pageSize });
});

router.get('/meta', requirePermission('customers'), async (_req, res) => {
  const [byRole, disabled, noPassword, partners] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.user.count({ where: { active: false } }),
    prisma.user.count({ where: { passwordSetAt: null } }),
    prisma.partner.findMany({ select: { id: true, name: true, color: true }, orderBy: { name: 'asc' } }),
  ]);
  res.json({
    counts: {
      all: byRole.reduce((n, r) => n + r._count._all, 0),
      customers: byRole.find((r) => r.role === 'CUSTOMER')?._count._all ?? 0,
      staff: byRole.find((r) => r.role === 'STAFF')?._count._all ?? 0,
      admins: byRole.find((r) => r.role === 'ADMIN')?._count._all ?? 0,
      disabled, noPassword,
    },
    permissions: PERMISSIONS,
    staffGrantable: STAFF_GRANTABLE,
    partners,
  });
});

async function detail(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...listSelect,
      notes: true, createdBy: true, lastLoginIp: true, updatedAt: true, sessionVersion: true,
      addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
      orders: { orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, number: true, status: true, paymentStatus: true, totalCents: true, createdAt: true } },
      partner: { select: { id: true, slug: true, name: true, status: true, color: true } },
      events: { orderBy: { createdAt: 'desc' }, take: 60 },
    },
  });
  if (!user) return null;
  const outstandingResets = await prisma.passwordReset.count({ where: { userId: id, usedAt: null, expiresAt: { gt: new Date() } } });
  return { ...presentRow(user), outstandingResets };
}

router.get('/:id', requirePermission('customers'), async (req, res) => {
  const user = await detail(String(req.params.id));
  if (!user) throw new HttpError(404, 'Account not found');
  res.json({ user });
});

// ---------- write (Users & access permission — admins) ----------

router.use(requirePermission('users'));

const permissionsSchema = z.array(z.string()).max(50).transform((arr) => [...new Set(arr.filter((k) => (STAFF_GRANTABLE as readonly string[]).includes(k)))]);

const createSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  phone: z.string().max(40).optional(),
  role: z.enum(ROLES).default('CUSTOMER'),
  permissions: permissionsSchema.optional(),
  partnerId: z.string().nullable().optional(),
  notes: z.string().max(5000).optional(),
  // Either a password now, or an emailed link to choose one.
  password: z.string().min(8).max(200).optional(),
  sendInvite: z.boolean().optional(),
});

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body);
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw new HttpError(409, 'An account with that email already exists.');
  const password = data.password ?? randomBytes(24).toString('base64url');
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash: await hashPassword(password),
      passwordSetAt: data.password ? new Date() : null,
      firstName: data.firstName?.trim() || null,
      lastName: data.lastName?.trim() || null,
      phone: data.phone?.trim() || null,
      role: data.role,
      permissions: data.role === 'STAFF' ? (data.permissions ?? []) : [],
      partnerId: data.partnerId ?? null,
      notes: data.notes?.trim() || null,
      createdBy: actor(req),
    },
  });
  await attachOrdersToUser(user.id, user.email).catch(() => undefined);
  await logEvent(req, user.id, 'created', { role: user.role, permissions: user.permissions, withPassword: !!data.password, invite: !!data.sendInvite });
  let invite: { link: string; sent: boolean } | null = null;
  if (data.sendInvite || !data.password) {
    invite = await sendSetPasswordEmail(user, 'claim');
    await logEvent(req, user.id, 'invite_sent', { sent: invite.sent });
  }
  res.json({ user: await detail(user.id), invite });
});

const updateSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()).optional(),
  firstName: z.string().max(100).nullable().optional(),
  lastName: z.string().max(100).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  role: z.enum(ROLES).optional(),
  permissions: permissionsSchema.optional(),
  active: z.boolean().optional(),
  partnerId: z.string().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

/** Refuse a change that would leave the admin with no way in. */
async function guardLockout(req: Request, target: { id: string; role: RoleName; active: boolean }, next: { role?: RoleName; active?: boolean }) {
  const self = req.session!.sub === target.id;
  const losesAdmin = target.role === 'ADMIN' && ((next.role && next.role !== 'ADMIN') || next.active === false);
  if (self && losesAdmin) throw new HttpError(400, 'You cannot remove your own admin access or disable your own account. Ask another admin.');
  if (losesAdmin) {
    const otherAdmins = await prisma.user.count({ where: { role: 'ADMIN', active: true, id: { not: target.id } } });
    if (otherAdmins === 0) throw new HttpError(400, 'This is the last active admin account. Make someone else an admin first.');
  }
}

router.patch('/:id', async (req, res) => {
  const id = String(req.params.id);
  const data = updateSchema.parse(req.body);
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new HttpError(404, 'Account not found');
  await guardLockout(req, target, data);
  if (data.email && data.email !== target.email && (await prisma.user.findUnique({ where: { email: data.email } }))) {
    throw new HttpError(409, 'Another account already uses that email.');
  }
  const role = data.role ?? target.role;
  const patch: any = {};
  if (data.email !== undefined) patch.email = data.email;
  if (data.firstName !== undefined) patch.firstName = data.firstName?.trim() || null;
  if (data.lastName !== undefined) patch.lastName = data.lastName?.trim() || null;
  if (data.phone !== undefined) patch.phone = data.phone?.trim() || null;
  if (data.role !== undefined) patch.role = data.role;
  if (data.permissions !== undefined || data.role !== undefined) patch.permissions = role === 'STAFF' ? (data.permissions ?? target.permissions) : [];
  if (data.active !== undefined) patch.active = data.active;
  if (data.partnerId !== undefined) patch.partnerId = data.partnerId;
  if (data.notes !== undefined) patch.notes = data.notes?.trim() || null;
  const user = await prisma.user.update({ where: { id }, data: patch });
  forgetAuthState(id);

  const changes: Record<string, unknown> = {};
  for (const k of ['email', 'firstName', 'lastName', 'phone', 'role', 'active', 'partnerId'] as const) {
    if (k in patch && (target as any)[k] !== (user as any)[k]) changes[k] = { from: (target as any)[k], to: (user as any)[k] };
  }
  if ('permissions' in patch && JSON.stringify(target.permissions) !== JSON.stringify(user.permissions)) changes.permissions = { from: target.permissions, to: user.permissions };
  if ('notes' in patch && target.notes !== user.notes) changes.notes = 'updated';
  if (Object.keys(changes).length > 0) {
    const action = changes.active !== undefined ? (user.active ? 'enabled' : 'disabled') : changes.role !== undefined ? 'role_changed' : changes.permissions !== undefined ? 'permissions_changed' : 'updated';
    await logEvent(req, id, action, changes);
  }
  res.json({ user: await detail(id) });
});

router.post('/:id/password', async (req, res) => {
  const id = String(req.params.id);
  const { password, signOutEverywhere } = z.object({ password: z.string().min(8).max(200), signOutEverywhere: z.boolean().optional() }).parse(req.body);
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) throw new HttpError(404, 'Account not found');
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password), passwordSetAt: new Date(), ...(signOutEverywhere !== false ? { sessionVersion: { increment: 1 } } : {}) },
  });
  await prisma.passwordReset.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: new Date() } });
  forgetAuthState(id);
  await logEvent(req, id, 'password_set', { signedOutEverywhere: signOutEverywhere !== false });
  res.json({ user: await detail(id) });
});

router.post('/:id/password-reset', async (req, res) => {
  const id = String(req.params.id);
  const { send } = z.object({ send: z.boolean().optional() }).parse(req.body ?? {});
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, passwordSetAt: true } });
  if (!target) throw new HttpError(404, 'Account not found');
  let link: string; let sent = false; let expiresAt: Date | null = null;
  if (send !== false) {
    const r = await sendSetPasswordEmail(target, target.passwordSetAt === null ? 'claim' : 'reset');
    link = r.link; sent = r.sent;
  } else {
    const r = await createPasswordResetLink(id);
    link = r.link; expiresAt = r.expiresAt;
  }
  await logEvent(req, id, 'password_reset_sent', { emailed: sent, copied: send === false });
  res.json({ link, sent, expiresAt: expiresAt ?? new Date(Date.now() + 3600_000), user: await detail(id) });
});

router.post('/:id/sign-in-link', async (req, res) => {
  const id = String(req.params.id);
  const { path, send } = z.object({ path: z.string().max(300).optional(), send: z.boolean().optional() }).parse(req.body ?? {});
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, firstName: true, active: true } });
  if (!target) throw new HttpError(404, 'Account not found');
  if (!target.active) throw new HttpError(400, 'This account is disabled; enable it before sending a sign-in link.');
  const link = await magicLink(id, path && path.startsWith('/') ? path : '/account');
  let sent = false;
  if (send) {
    try {
      await sendEmail({
        to: { email: target.email, name: target.firstName ?? undefined },
        subject: 'Your Printing Comics sign-in link',
        html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:auto"><h2>Sign in to Printing Comics</h2><p>Click the link below to open your account — no password needed. It works for 14 days.</p><p><a href="${link}" style="background:#C61A22;color:#fff;padding:.6rem 1rem;border-radius:6px;text-decoration:none;display:inline-block">Open my account</a></p><p style="color:#666;font-size:.85rem">If you didn't ask for this, you can ignore it.</p></div>`,
        text: `Sign in to Printing Comics: ${link}\n\nThe link works for 14 days.`,
        tags: ['sign-in-link'],
        trackClicks: false,
      });
      sent = true;
    } catch (e: any) {
      console.warn('[sign-in link] Mailgun send failed:', e?.message ?? e);
    }
  }
  await logEvent(req, id, 'sign_in_link', { emailed: sent, path: path ?? '/account' });
  res.json({ link, sent, user: await detail(id) });
});

router.post('/:id/sign-out', async (req, res) => {
  const id = String(req.params.id);
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) throw new HttpError(404, 'Account not found');
  await prisma.user.update({ where: { id }, data: { sessionVersion: { increment: 1 } } });
  forgetAuthState(id);
  await logEvent(req, id, 'signed_out_everywhere');
  res.json({ user: await detail(id) });
});

router.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, role: true, active: true } });
  if (!target) throw new HttpError(404, 'Account not found');
  if (req.session!.sub === id) throw new HttpError(400, 'You cannot delete your own account.');
  if (target.role === 'ADMIN') {
    const otherAdmins = await prisma.user.count({ where: { role: 'ADMIN', active: true, id: { not: id } } });
    if (otherAdmins === 0) throw new HttpError(400, 'This is the last active admin account. Make someone else an admin first.');
  }
  const orders = await prisma.order.count({ where: { userId: id } });
  // Orders keep their rows (the email stays on them); the account, its
  // addresses, resets and activity go.
  await prisma.user.delete({ where: { id } });
  forgetAuthState(id);
  console.info(`[users] ${actor(req) ?? 'someone'} deleted account ${target.email} (${orders} order(s) kept)`);
  res.json({ ok: true, ordersKept: orders });
});

export default router;
