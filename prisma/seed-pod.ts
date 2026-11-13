/**
 * Distribution bootstrap — safe to run on every deploy.
 *
 *   npm run db:seed:pod
 *
 * Creates the Distribution admin account (a STAFF user holding only the `pod` and
 * `preflight` areas, so /admin opens straight into the section) with a
 * starter password and `passwordSetAt: null`, which forces choosing a real
 * password on the first login. If the account already exists it is left
 * alone, except that a plain customer account under that email is promoted.
 * Also writes the default program settings when none are saved yet.
 *
 *   POD_ADMIN_EMAIL     default mauramariepowers@gmail.com
 *   POD_ADMIN_PASSWORD  default "password" (only used when creating)
 *   POD_ADMIN_RESET=1   reset the existing account to the starter password
 *                       and require a new one again
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../server/src/generated/prisma/client.js';
import bcrypt from 'bcryptjs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const DEFAULT_SETTINGS = {
  enabled: true,
  programName: 'Distribution',
  intro: 'List your comics with us, sell them to comic shops at wholesale, and let us print and ship every order. No minimums, no inventory, one monthly catalog.',
  tiers: [
    { name: 'Tier I', minCents: 0, discountBps: 4000 },
    { name: 'Tier II', minCents: 10100, discountBps: 4500 },
    { name: 'Tier III', minCents: 25100, discountBps: 5000 },
  ],
  commissionBpsPrintedByUs: 500,
  commissionBpsPartnerShips: 1000,
  retailerMinOrderCents: 0,
  retailerShipping: { mode: 'billed_later', flatCents: 0 },
  retailerTerms: 'Orders are final at the catalog’s final order cutoff (FOC). Shipping is billed at cost when the order ships. Payment is due on invoice.',
  publisherTerms: 'Approved listings appear in the next open catalog. Wholesale sales are paid out per catalog cycle, less our commission and any printing charges.',
  notifyEmail: '',
  pageCountStep: 4,
  minPageCount: 8,
  maxPageCount: 200,
};

async function main() {
  const email = (process.env.POD_ADMIN_EMAIL ?? 'mauramariepowers@gmail.com').trim().toLowerCase();
  const password = process.env.POD_ADMIN_PASSWORD ?? 'password';
  const reset = process.env.POD_ADMIN_RESET === '1';
  const permissions = ['pod', 'preflight'];

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 12),
        passwordSetAt: null,
        firstName: 'Maura',
        lastName: 'Powers',
        role: 'STAFF',
        permissions,
        active: true,
        notes: 'Distribution admin (seeded). Must set a new password on first login.',
      },
    });
    console.log(`Distribution admin created: ${email} — starter password set; a new password is required on first login.`);
  } else {
    const data: Record<string, unknown> = {};
    if (existing.role === 'CUSTOMER') { data.role = 'STAFF'; data.permissions = permissions; }
    else if (existing.role === 'STAFF' && !permissions.every((p) => existing.permissions.includes(p))) data.permissions = Array.from(new Set([...existing.permissions, ...permissions]));
    if (!existing.active) data.active = true;
    if (reset) { data.passwordHash = await bcrypt.hash(password, 12); data.passwordSetAt = null; data.sessionVersion = { increment: 1 }; }
    if (Object.keys(data).length) {
      await prisma.user.update({ where: { id: existing.id }, data });
      console.log(`Distribution admin updated: ${email} (${Object.keys(data).join(', ')})`);
    } else {
      console.log(`Distribution admin already in place: ${email} (${existing.role}, ${existing.permissions.join(', ') || 'no areas'})`);
    }
  }

  const settings = await prisma.setting.findUnique({ where: { key: 'pod.settings' } });
  if (!settings) {
    await prisma.setting.create({ data: { key: 'pod.settings', value: DEFAULT_SETTINGS } });
    console.log('Distribution settings written (defaults). Edit them under Admin → Distribution → Settings.');
  } else {
    console.log('Distribution settings already saved; left as they are.');
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
