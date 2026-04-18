import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../server/src/generated/prisma/client.js';
import bcrypt from 'bcryptjs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@printingcomics.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'changeme';

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
    },
  });
  console.log(`Admin user ready: ${adminEmail} (password set from ADMIN_PASSWORD env var)`);

  const categories = [
    { slug: 'comic-books', name: 'Comic Books', description: 'Single-issue comics, soft cover, saddle-stitched.' },
    { slug: 'graphic-novels', name: 'Graphic Novels', description: 'Perfect-bound graphic novels and one-shots.' },
    { slug: 'artist-tools', name: 'Artist Tools', description: 'Sketchbooks, panel pads, templates.' },
  ];
  const catByslug: Record<string, string> = {};
  for (let i = 0; i < categories.length; i++) {
    const c = categories[i]!;
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: { ...c, sortOrder: i },
    });
    catByslug[c.slug] = cat.id;
  }

  // Real configurable comic + graphic-novel products live in seed-cws.ts.
  // Run `npm run db:seed:cws` after this seed to load them.

  // Shipping zone + rates
  const zone = await prisma.shippingZone.findFirst({ where: { name: 'US Domestic' } });
  if (!zone) {
    const z = await prisma.shippingZone.create({ data: { name: 'US Domestic', countries: ['US'] } });
    await prisma.shippingRate.createMany({
      data: [
        { zoneId: z.id, name: 'Standard Ground', rateCents: 995, estimatedDays: '5–7 business days' },
        { zoneId: z.id, name: 'Expedited', rateCents: 1995, estimatedDays: '2–3 business days' },
      ],
    });
  }

  // Sample tax
  await prisma.taxRate.upsert({
    where: { id: 'seed-ca' },
    update: {},
    create: { id: 'seed-ca', name: 'CA Sales Tax', region: 'CA', country: 'US', rateBps: 725 },
  });

  // Sample coupon
  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: {
      code: 'WELCOME10',
      description: '10% off your first order',
      percentOffBps: 1000,
      active: true,
    },
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
