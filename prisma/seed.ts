import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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
  console.log(`Admin user ready: ${adminEmail} / ${adminPassword}`);

  const categories = [
    { slug: 'comic-books', name: 'Comic Books', description: 'Single-issue comics, soft cover, saddle-stitched.' },
    { slug: 'graphic-novels', name: 'Graphic Novels', description: 'Perfect-bound graphic novels and one-shots.' },
    { slug: 'trade-paperbacks', name: 'Trade Paperbacks', description: 'Collected editions and TPBs.' },
    { slug: 'hard-cover', name: 'Hard Cover Books', description: 'Premium hard cover collected editions.' },
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

  const products = [
    {
      slug: 'standard-comic-book',
      name: 'Standard Comic Book',
      shortDescription: 'Soft-cover, saddle-stitched, full color. 32 pages including cover.',
      description: 'Our standard comic book package: 24-32 interior pages with a glossy soft cover, saddle-stitched binding. Full-color printing on 70lb paper.\n\nVolume discounts kick in automatically at 50+ and 100+ units.',
      priceCents: 695,
      minQuantity: 25,
      madeToOrder: true,
      volumeTiers: [
        { minQty: 25, pricePerUnitCents: 695 },
        { minQty: 50, pricePerUnitCents: 595 },
        { minQty: 100, pricePerUnitCents: 495 },
        { minQty: 500, pricePerUnitCents: 395 },
      ],
      categories: ['comic-books'],
      image: 'https://images.unsplash.com/photo-1601933470096-0e34634ffcde?w=800',
    },
    {
      slug: 'graphic-novel-softcover',
      name: 'Graphic Novel — Soft Cover',
      shortDescription: 'Perfect-bound soft-cover graphic novel, 6.625" × 10.25".',
      description: 'Perfect-bound graphic novel printing with full-color interior and a premium soft cover. Choose your page count up to 300 pages.',
      priceCents: 1995,
      minQuantity: 25,
      madeToOrder: true,
      volumeTiers: [
        { minQty: 25, pricePerUnitCents: 1995 },
        { minQty: 50, pricePerUnitCents: 1795 },
        { minQty: 100, pricePerUnitCents: 1495 },
      ],
      categories: ['graphic-novels'],
      image: 'https://images.unsplash.com/photo-1569399078436-da10fbd60f12?w=800',
    },
    {
      slug: 'trade-paperback',
      name: 'Trade Paperback',
      shortDescription: 'Collected-edition trade paperback printing.',
      description: 'Perfect for collecting a story arc. TPB printing with premium cover stock and interior paper options.',
      priceCents: 2495,
      minQuantity: 25,
      madeToOrder: true,
      volumeTiers: [
        { minQty: 25, pricePerUnitCents: 2495 },
        { minQty: 50, pricePerUnitCents: 2195 },
        { minQty: 100, pricePerUnitCents: 1895 },
      ],
      categories: ['trade-paperbacks'],
      image: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=800',
    },
    {
      slug: 'hardcover-collection',
      name: 'Hardcover Collection',
      shortDescription: 'Premium hard-cover collected edition with dust jacket.',
      description: 'High-end hard-cover edition. Smyth-sewn binding, dust jacket, premium paper.',
      priceCents: 4995,
      minQuantity: 25,
      madeToOrder: true,
      volumeTiers: [
        { minQty: 25, pricePerUnitCents: 4995 },
        { minQty: 100, pricePerUnitCents: 3995 },
      ],
      categories: ['hard-cover', 'graphic-novels'],
      image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800',
    },
  ];

  for (const p of products) {
    const { categories: catSlugs, image, ...rest } = p;
    const existing = await prisma.product.findUnique({ where: { slug: rest.slug } });
    if (existing) continue;
    await prisma.product.create({
      data: {
        ...rest,
        volumeTiers: rest.volumeTiers as any,
        categories: { create: catSlugs.map((slug) => ({ category: { connect: { id: catByslug[slug]! } } })) },
        images: { create: [{ url: image, sortOrder: 0 }] },
        options: {
          create: [
            {
              name: 'Page Count',
              values: {
                create: [
                  { label: '24 pages', sortOrder: 0 },
                  { label: '32 pages', sortOrder: 1 },
                  { label: '48 pages', sortOrder: 2 },
                ],
              },
            },
            {
              name: 'Interior',
              values: {
                create: [
                  { label: 'Full Color', sortOrder: 0 },
                  { label: 'Black & White', sortOrder: 1 },
                ],
              },
            },
          ],
        },
      },
    });
  }

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
