/**
 * Seed Comix-Wellspring-style print products using the pricing data
 * extracted from comic_discount_log.xlsx and graphic_novel_discount_log.xlsx.
 *
 * Run with:  npx tsx prisma/seed-cws.ts
 *
 * Idempotent. Products with slugs starting `comic-` / `graphic-novel-`
 * are re-seeded in place: the Product row (and its id) is kept so any
 * CartItem / OrderItem rows pointing at it stay valid. Only the child
 * options/categories and the pricingConfig are rebuilt. Safe to re-run.
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../server/src/generated/prisma/client.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

interface QtyRow { qty: number; discountPct: number; }
interface PriceRow { label: string; priceUSD: number; sub: string | null; }
interface PageRow { pages: number; upgradeUSD: number; }
interface SizeData {
  listPriceUSD: number | null;
  qtyTiers: QtyRow[];
  cover: PriceRow[];
  lamination: PriceRow[];
  uv: PriceRow[];
  foil: PriceRow[];
  pages: {
    grayscale_uncoated: PageRow[];
    grayscale_semigloss: PageRow[];
    grayscale_gloss: PageRow[];
    fullcolor_uncoated: PageRow[];
    fullcolor_semigloss: PageRow[];
    fullcolor_gloss: PageRow[];
  };
}
interface Pricing { comic: Record<string, SizeData>; graphic_novel: Record<string, SizeData>; }

const raw: Pricing = JSON.parse(readFileSync('prisma/pricing/cws-pricing.json', 'utf8'));

function cents(usd: number | null | undefined): number {
  if (usd == null) return 0;
  return Math.round(usd * 100);
}

// Carry the spreadsheet's page table through verbatim as exact per-page-count
// upgrade tiers. The discount log's page columns are not linear, so the
// prices must be looked up — not recomputed from a per-4-pages rate.
function pageTiers(rows: PageRow[]): { pages: number; cents: number }[] {
  return rows.map((r) => ({ pages: r.pages, cents: cents(r.upgradeUSD) }));
}

interface BuildArgs {
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  size: string;         // "A5 (5.8x8.3)"
  categorySlug: string;
  productType: 'comic' | 'graphic_novel';
}

async function ensureCategories() {
  const cats = [
    { slug: 'comic-books', name: 'Comic Books', description: 'Single-issue comics, saddle-stitched.' },
    { slug: 'graphic-novels', name: 'Graphic Novels', description: 'Perfect-bound graphic novels.' },
    { slug: 'manga', name: 'Manga', description: 'Manga-format printing.' },
    { slug: 'zines', name: 'Zines', description: 'Short-run zines.' },
    { slug: 'artist-tools', name: 'Artist Tools', description: 'Sample packs, templates, resources.' },
    { slug: '11x17-prints', name: '11×17 Prints', description: 'Metal, paper and foil 11×17 art prints.' },
  ];
  const byslug: Record<string, string> = {};
  for (let i = 0; i < cats.length; i++) {
    const c = cats[i]!;
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, description: c.description },
      create: { ...c, sortOrder: i },
    });
    byslug[c.slug] = cat.id;
  }
  return byslug;
}

function buildPricingConfig(size: SizeData, productType: 'comic' | 'graphic_novel') {
  // Quantity discounts — skip the first row (qty=1, 0%) only if present twice.
  const qtyTiers = size.qtyTiers.map((t) => ({ qty: t.qty, discountBps: Math.round(t.discountPct * 10000) }));

  const modifiers: { key: string; values: Record<string, number> }[] = [];

  if (size.cover.length > 0) {
    const m: Record<string, number> = {};
    for (const c of size.cover) m[c.label] = cents(c.priceUSD);
    modifiers.push({ key: 'cover_paper', values: m });
  }
  if (size.lamination.length > 0) {
    const m: Record<string, number> = {};
    for (const c of size.lamination) m[c.label] = cents(c.priceUSD);
    modifiers.push({ key: 'lamination', values: m });
  }
  if (size.uv.length > 0) {
    const m: Record<string, number> = {};
    for (const c of size.uv) m[c.label] = cents(c.priceUSD);
    modifiers.push({ key: 'uv', values: m });
  }
  if (size.foil.length > 0) {
    const m: Record<string, number> = {};
    for (const c of size.foil) m[c.label] = cents(c.priceUSD);
    modifiers.push({ key: 'foil', values: m });
  }

  const tiers = {
    'grayscale:uncoated':   pageTiers(size.pages.grayscale_uncoated),
    'grayscale:semigloss':  pageTiers(size.pages.grayscale_semigloss),
    'grayscale:gloss':      pageTiers(size.pages.grayscale_gloss),
    'fullcolor:uncoated':   pageTiers(size.pages.fullcolor_uncoated),
    'fullcolor:semigloss':  pageTiers(size.pages.fullcolor_semigloss),
    'fullcolor:gloss':      pageTiers(size.pages.fullcolor_gloss),
  };

  // Page count options come from the first non-empty pages list.
  const pageCounts =
    size.pages.grayscale_uncoated.length > 0
      ? size.pages.grayscale_uncoated.map((p) => p.pages)
      : productType === 'comic'
        ? [8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52]
        : [32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224];

  return {
    config: {
      baseCents: cents(size.listPriceUSD),
      qtyTiers,
      modifiers,
      pages: {
        tiers,
        colorKey: 'interior_color',
        paperKey: 'interior_paper',
        pagesKey: 'interior_pages',
      },
    },
    pageCounts,
    cover: size.cover,
    lamination: size.lamination,
    uv: size.uv,
    foil: size.foil,
  };
}

async function buildProduct(args: BuildArgs, size: SizeData, categoryId: string) {
  const p = buildPricingConfig(size, args.productType);

  const pagesSubLabelFor = (label: string) => {
    // rough sub-labels matching CWS
    const m: Record<string, string> = {
      'Uncoated': '60# Uncoated Text',
      'Semi Gloss': '80# Silk Text',
      'Gloss': '80# Gloss Text',
    };
    return m[label] ?? null;
  };

  const existing = await prisma.product.findUnique({
    where: { slug: args.slug },
    select: { id: true },
  });

  const data = {
      slug: args.slug,
      name: args.name,
      shortDescription: args.shortDescription,
      description: args.description,
      priceCents: p.config.baseCents,
      hasVariants: false,
      madeToOrder: true,
      active: true,
      minQuantity: 1,
      pricingConfig: p.config as any,
      templateUrl: null,
      faq: [
        { q: 'What is staple "Saddle Stitch" binding?', a: 'Saddle stitch is the fastest and most economical binding — two staples driven through the spine fold. Ideal for books up to ~52 pages.' },
        { q: 'When should I use Saddle Stitch binding?', a: 'For issues up to 52 pages. Anything thicker should use perfect-bound (graphic novels / trade paperbacks).' },
        { q: 'How do I add a cover?', a: 'Every order includes a front + back cover. Pick the paper in "Your Cover" and upload the cover art with your interior files.' },
        { q: 'What is the difference between UV Gloss and Laminate?', a: 'Laminate is a plastic film bonded to the cover — durable and tactile. UV Gloss is a liquid coating cured with UV light — glossier shine, thinner feel.' },
        { q: 'How do I add foil to my covers?', a: 'Pick "Foil" under Embellishments, then choose the foil color. Provide your foil artwork as a separate spot-color PDF.' },
        { q: 'What are Variant Covers?', a: 'Multiple different covers for the same interior. Useful for collector editions. Order each variant as a separate run.' },
      ],
      seoTitle: args.name,
      seoDescription: args.shortDescription,
      categories: { create: [{ category: { connect: { id: categoryId } } }] },
      options: {
        create: [
          {
            name: 'Title of Comic',
            internalKey: 'title',
            type: 'TEXT',
            required: true,
            sortOrder: 0,
          },
          // Cover section
          ...(p.cover.length > 0
            ? [
                {
                  name: 'Cover Type',
                  internalKey: 'cover_paper',
                  section: 'Your Cover',
                  type: 'TILES' as const,
                  required: true,
                  sortOrder: 10,
                  values: {
                    create: p.cover.map((c, i) => ({
                      label: c.label,
                      subLabel: c.sub,
                      priceModifierCents: cents(c.priceUSD),
                      sortOrder: i,
                    })),
                  },
                },
              ]
            : []),
          // Embellishments — mutually exclusive choice between Lamination, UV, Foil, or None.
          ...(p.lamination.length > 0 || p.uv.length > 0 || p.foil.length > 0
            ? [
                {
                  name: 'Embellishments',
                  internalKey: 'embellishment',
                  section: 'Your Cover',
                  type: 'TILES' as const,
                  required: false,
                  sortOrder: 20,
                  values: {
                    create: [
                      { label: 'None', sortOrder: 0 },
                      ...(p.lamination.length > 0 ? [{ label: 'Lamination', sortOrder: 1 }] : []),
                      ...(p.uv.length > 0 ? [{ label: 'UV', sortOrder: 2 }] : []),
                      ...(p.foil.length > 0 ? [{ label: 'Foil', sortOrder: 3 }] : []),
                    ],
                  },
                },
              ]
            : []),
          // Conditional sub-options (lamination/UV/foil detail)
          ...(p.lamination.length > 0
            ? [
                {
                  name: 'Lamination Style',
                  internalKey: 'lamination',
                  section: 'Your Cover',
                  type: 'TILES' as const,
                  required: true,
                  sortOrder: 21,
                  dependsOnValue: 'Lamination',
                  values: {
                    create: p.lamination
                      .filter((l) => l.label !== 'None')
                      .map((l, i) => ({
                        label: l.label,
                        priceModifierCents: cents(l.priceUSD),
                        sortOrder: i,
                      })),
                  },
                },
              ]
            : []),
          ...(p.uv.length > 0
            ? [
                {
                  name: 'UV Style',
                  internalKey: 'uv',
                  section: 'Your Cover',
                  type: 'TILES' as const,
                  required: true,
                  sortOrder: 22,
                  dependsOnValue: 'UV',
                  values: {
                    create: p.uv
                      .filter((u) => u.label !== 'None')
                      .map((u, i) => ({
                        label: u.label,
                        priceModifierCents: cents(u.priceUSD),
                        sortOrder: i,
                      })),
                  },
                },
              ]
            : []),
          ...(p.foil.length > 0
            ? [
                {
                  name: 'Foil Cover',
                  internalKey: 'foil',
                  section: 'Your Cover',
                  type: 'TILES' as const,
                  required: true,
                  sortOrder: 23,
                  dependsOnValue: 'Foil',
                  values: {
                    create: p.foil
                      .filter((f) => f.label !== 'None')
                      .map((f, i) => ({
                        label: f.label,
                        priceModifierCents: cents(f.priceUSD),
                        sortOrder: i,
                      })),
                  },
                },
              ]
            : []),
          // Pages section
          {
            name: 'Interior Paper',
            internalKey: 'interior_paper',
            section: 'Your Pages',
            type: 'TILES' as const,
            required: true,
            sortOrder: 30,
            values: {
              create: [
                { label: 'Uncoated',    subLabel: '60# Uncoated Text', sortOrder: 0 },
                { label: 'Semi Gloss',  subLabel: '80# Silk Text',     sortOrder: 1 },
                { label: 'Gloss',       subLabel: '80# Gloss Text',    sortOrder: 2 },
              ],
            },
          },
          {
            name: 'Interior Color',
            internalKey: 'interior_color',
            section: 'Your Pages',
            type: 'TILES' as const,
            required: true,
            sortOrder: 31,
            values: {
              create: [
                { label: 'Full Color', sortOrder: 0 },
                { label: 'Grayscale',  sortOrder: 1 },
              ],
            },
          },
          {
            name: 'Interior Pages',
            internalKey: 'interior_pages',
            section: 'Your Pages',
            type: 'SELECT' as const,
            required: true,
            sortOrder: 32,
            values: {
              create: p.pageCounts.map((n, i) => ({
                label: String(n),
                sortOrder: i,
              })),
            },
          },
          // Finalize
          {
            name: 'PDF proof before printing',
            internalKey: 'pdf_proof',
            section: 'Finalize Setup',
            type: 'TOGGLE' as const,
            required: false,
            sortOrder: 38,
            helpText:
              'Free — we email you a PDF proof to approve before anything is printed. Nothing goes to production until you approve it.',
          },
          {
            name: 'Hard-copy proof before printing',
            internalKey: 'hard_copy_proof',
            section: 'Finalize Setup',
            type: 'TOGGLE' as const,
            required: false,
            sortOrder: 39,
            helpText:
              'A single printed proof of this book, shipped to you first. Adds the price of one book plus a $19.95 proof & shipping fee.',
          },
          {
            name: 'I would like a Printing Comics ad',
            internalKey: 'printing_comics_ad',
            section: 'Finalize Setup',
            type: 'RADIO' as const,
            required: true,
            sortOrder: 40,
            values: { create: [{ label: 'Yes', sortOrder: 0 }, { label: 'No', sortOrder: 1 }] },
          },
          {
            name: 'Is this a reorder?',
            internalKey: 'is_reorder',
            section: 'Finalize Setup',
            type: 'TOGGLE' as const,
            required: false,
            sortOrder: 41,
          },
          {
            name: 'Upload your work',
            internalKey: 'upload',
            section: 'Finalize Setup',
            type: 'UPLOAD' as const,
            required: true,
            sortOrder: 42,
          },
          {
            name: 'File Prep Checklist Confirmation',
            internalKey: 'file_prep_ok',
            section: 'Finalize Setup',
            type: 'CONFIRM' as const,
            required: true,
            sortOrder: 43,
            longDescription:
              'I confirm that my files are correctly sized according to the selected format, are flattened high-resolution PDFs or JPGs and labeled accurately, and meet the required page count multiples (4 for saddle stitch, 2 for glue bind). I understand that all files will be reviewed during prepress; if no issues are found, I will not receive a notification until proof approval. If any problems are identified, I will be contacted after purchase and required to submit corrected files from emailed link before production can proceed.',
          },
        ],
      },
  };

  if (existing) {
    // Re-seed in place. The Product row is kept (same id) so CartItem /
    // OrderItem foreign keys — which have no ON DELETE rule — stay valid.
    // Child options + categories cascade-delete, then get rebuilt.
    await prisma.$transaction(async (tx) => {
      await tx.productOption.deleteMany({ where: { productId: existing.id } });
      await tx.productCategory.deleteMany({ where: { productId: existing.id } });
      await tx.product.update({ where: { id: existing.id }, data });
    }, { timeout: 30000 });
  } else {
    await prisma.product.create({ data });
  }

  // silence unused helper
  void pagesSubLabelFor;
}

// ---------------------------------------------------------------------------
// 11×17 Prints — a separate product line. Firm prices (no site-wide promo);
// each material carries its own quantity price curve.
// ---------------------------------------------------------------------------
interface PrintTier { minQty: number; priceUSD: number; }
interface PrintDef {
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  tiers: PrintTier[];
}

const PRINTS: PrintDef[] = [
  {
    slug: 'art-print-11x17-silver-metal',
    name: '11×17 Metal Print — Silver',
    shortDescription: 'Brushed silver metal 11×17 art print.',
    description: 'Vibrant 11×17 prints on brushed silver metal. Flat per-unit pricing at every quantity.',
    tiers: [
      { minQty: 1, priceUSD: 17.67 }, { minQty: 25, priceUSD: 17.67 }, { minQty: 50, priceUSD: 17.67 },
      { minQty: 100, priceUSD: 17.67 }, { minQty: 250, priceUSD: 17.67 }, { minQty: 500, priceUSD: 17.67 },
      { minQty: 1000, priceUSD: 17.67 },
    ],
  },
  {
    slug: 'art-print-11x17-raised-metal',
    name: '11×17 Metal Print — Raised',
    shortDescription: 'Raised-texture metal 11×17 art print.',
    description: 'Raised-texture metal 11×17 prints. Flat per-unit pricing at every quantity.',
    tiers: [
      { minQty: 1, priceUSD: 22.67 }, { minQty: 25, priceUSD: 22.67 }, { minQty: 50, priceUSD: 22.67 },
      { minQty: 100, priceUSD: 22.67 }, { minQty: 250, priceUSD: 22.67 }, { minQty: 500, priceUSD: 22.67 },
      { minQty: 1000, priceUSD: 22.67 },
    ],
  },
  {
    slug: 'art-print-11x17-paper-gloss',
    name: '11×17 Paper Print — 100# Gloss',
    shortDescription: '11×17 prints on 100# gloss cover stock.',
    description: 'Full-color 11×17 prints on premium 100# gloss cover stock. Volume pricing.',
    tiers: [
      { minQty: 10, priceUSD: 2.16 }, { minQty: 25, priceUSD: 1.72 }, { minQty: 50, priceUSD: 1.35 },
      { minQty: 100, priceUSD: 1.08 }, { minQty: 250, priceUSD: 0.87 }, { minQty: 500, priceUSD: 0.76 },
      { minQty: 1000, priceUSD: 0.71 },
    ],
  },
  {
    slug: 'art-print-11x17-foil',
    name: '11×17 Foil Print',
    shortDescription: 'Foil-finished 11×17 art print.',
    description: 'Eye-catching foil-finished 11×17 prints. Volume pricing.',
    tiers: [
      { minQty: 5, priceUSD: 5.73 }, { minQty: 25, priceUSD: 5.33 }, { minQty: 50, priceUSD: 5.00 },
      { minQty: 100, priceUSD: 4.75 }, { minQty: 250, priceUSD: 4.56 }, { minQty: 500, priceUSD: 4.46 },
      { minQty: 1000, priceUSD: 4.42 },
    ],
  },
];

// Per-print shipping weight (grams). From the legacy BYOP weights:
// metal 0.361424 lb ≈ 164 g; paper & foil 0.076775 lb ≈ 35 g.
const PRINT_WEIGHT_GRAMS: Record<string, number> = {
  'art-print-11x17-silver-metal': 164,
  'art-print-11x17-raised-metal': 164,
  'art-print-11x17-paper-gloss': 35,
  'art-print-11x17-foil': 35,
};

async function buildPrintProduct(def: PrintDef, categoryId: string) {
  const first = def.tiers[0]!;
  const baseCents = cents(first.priceUSD);
  const qtyTiers = def.tiers.map((t) => ({
    qty: t.minQty,
    discountBps: Math.round((1 - t.priceUSD / first.priceUSD) * 10000),
  }));
  const config = { baseCents, qtyTiers, modifiers: [], kind: 'print', ignoreSiteDiscount: true };

  const existing = await prisma.product.findUnique({ where: { slug: def.slug }, select: { id: true } });
  const data = {
    slug: def.slug,
    name: def.name,
    shortDescription: def.shortDescription,
    description: def.description,
    priceCents: baseCents,
    hasVariants: false,
    madeToOrder: true,
    active: true,
    minQuantity: first.minQty,
    weightGrams: PRINT_WEIGHT_GRAMS[def.slug] ?? 0,
    pricingConfig: config as any,
    seoTitle: def.name,
    seoDescription: def.shortDescription,
    faq: [
      { q: 'What size are these prints?', a: 'All prints are 11×17 inches. Provide art at 11×17 with 0.125" bleed at 300 DPI.' },
      { q: 'Is there a minimum order?', a: `Minimum order is ${first.minQty} for this material.` },
      { q: 'Do you proof before printing?', a: 'Yes — request a free PDF proof (or a paid hard-copy proof) at checkout. Nothing prints until you approve.' },
    ],
    categories: { create: [{ category: { connect: { id: categoryId } } }] },
    options: {
      create: [
        { name: 'Print title / reference', internalKey: 'title', type: 'TEXT' as const, required: false, sortOrder: 0 },
        { name: 'PDF proof before printing', internalKey: 'pdf_proof', section: 'Finalize Setup', type: 'TOGGLE' as const, required: false, sortOrder: 38, helpText: 'Free — we email a PDF proof to approve before anything prints.' },
        { name: 'Hard-copy proof before printing', internalKey: 'hard_copy_proof', section: 'Finalize Setup', type: 'TOGGLE' as const, required: false, sortOrder: 39, helpText: 'A single printed proof shipped to you first. Adds the price of one print plus a $19.95 proof & shipping fee.' },
        { name: 'Is this a reorder?', internalKey: 'is_reorder', section: 'Finalize Setup', type: 'TOGGLE' as const, required: false, sortOrder: 41 },
        { name: 'Upload your art', internalKey: 'upload', section: 'Finalize Setup', type: 'UPLOAD' as const, required: true, sortOrder: 42 },
        { name: 'File Prep Checklist Confirmation', internalKey: 'file_prep_ok', section: 'Finalize Setup', type: 'CONFIRM' as const, required: true, sortOrder: 43, longDescription: 'I confirm my art is 11×17 at 300 DPI with 0.125" bleed, CMYK, flattened and print-ready. Files are reviewed in prepress; I will be contacted if corrections are needed.' },
      ],
    },
  };

  if (existing) {
    await prisma.$transaction(async (tx) => {
      await tx.productOption.deleteMany({ where: { productId: existing.id } });
      await tx.productCategory.deleteMany({ where: { productId: existing.id } });
      await tx.product.update({ where: { id: existing.id }, data });
    }, { timeout: 30000 });
  } else {
    await prisma.product.create({ data });
  }
}

async function main() {
  const categoryIds = await ensureCategories();

  const sizes: { key: string; slugSegment: string; name: string }[] = [
    { key: 'A5 (5.8x8.3)',           slugSegment: 'a5',       name: 'A5 (5.8" × 8.3")' },
    { key: 'Standard (6.625x10.25)', slugSegment: 'standard', name: 'Standard (6.625" × 10.25")' },
    { key: 'Magazine (8x10.5)',      slugSegment: 'magazine', name: 'Magazine (8" × 10.5")' },
    { key: 'Letter (8.5x11)',        slugSegment: 'letter',   name: 'Letter (8.5" × 11")' },
  ];

  for (const s of sizes) {
    const d = raw.comic[s.key];
    if (!d || !d.listPriceUSD) continue;
    // Fill missing cover/embellishments from Standard (happens for Letter).
    const filled: SizeData = {
      ...d,
      cover:      d.cover.length      ? d.cover      : raw.comic['Standard (6.625x10.25)']!.cover,
      lamination: d.lamination.length ? d.lamination : raw.comic['Standard (6.625x10.25)']!.lamination,
      uv:         d.uv.length         ? d.uv         : raw.comic['Standard (6.625x10.25)']!.uv,
      foil:       d.foil.length       ? d.foil       : raw.comic['Standard (6.625x10.25)']!.foil,
      pages:      Object.values(d.pages).some((p) => p.length > 0)
                  ? d.pages
                  : raw.comic['Standard (6.625x10.25)']!.pages,
    };
    await buildProduct(
      {
        slug: `comic-${s.slugSegment}-size`,
        name: `Comic Book — ${s.name}`,
        shortDescription: 'Saddle-stitched comic book. Custom short runs, bulk discounts up to 75%.',
        description: `Our standard saddle-stitched comic book. Quote includes full-color cover and interior; configure paper stock, embellishments, page count, and quantity to match your run.`,
        size: s.key,
        categorySlug: 'comic-books',
        productType: 'comic',
      },
      filled,
      categoryIds['comic-books']!,
    );
    console.log(`  created comic-${s.slugSegment}-size`);
  }

  for (const s of sizes) {
    const d = raw.graphic_novel[s.key];
    if (!d || !d.listPriceUSD) continue;
    const filled: SizeData = {
      ...d,
      cover:      d.cover.length      ? d.cover      : raw.graphic_novel['Standard (6.625x10.25)']!.cover,
      lamination: d.lamination.length ? d.lamination : raw.graphic_novel['Standard (6.625x10.25)']!.lamination,
      uv:         d.uv.length         ? d.uv         : raw.graphic_novel['Standard (6.625x10.25)']!.uv,
      foil:       d.foil.length       ? d.foil       : raw.graphic_novel['Standard (6.625x10.25)']!.foil,
      pages:      Object.values(d.pages).some((p) => p.length > 0)
                  ? d.pages
                  : raw.graphic_novel['Standard (6.625x10.25)']!.pages,
    };
    await buildProduct(
      {
        slug: `graphic-novel-${s.slugSegment}-size`,
        name: `Graphic Novel — ${s.name}`,
        shortDescription: 'Perfect-bound graphic novel. Higher page count, premium finish, bulk pricing.',
        description: `Perfect-bound graphic novel printing. Built for collected editions and long-form work — 32 to 224 pages, full or grayscale interior, same embellishment menu as our saddle-stitch line.`,
        size: s.key,
        categorySlug: 'graphic-novels',
        productType: 'graphic_novel',
      },
      filled,
      categoryIds['graphic-novels']!,
    );
    console.log(`  created graphic-novel-${s.slugSegment}-size`);
  }

  // 11×17 prints
  for (const def of PRINTS) {
    await buildPrintProduct(def, categoryIds['11x17-prints']!);
    console.log(`  built ${def.slug}`);
  }

  console.log('CWS-style products seeded.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
