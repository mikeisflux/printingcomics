import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { analyzeProductSeo, generateMetaOnly } from '../../lib/claude.js';
import { HttpError } from '../../middleware/error.js';

const router = Router();

async function loadProductForSeo(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { categories: { include: { category: true } } },
  });
  if (!product) throw new HttpError(404, 'Product not found');
  return {
    product,
    input: {
      name: product.name,
      shortDescription: product.shortDescription,
      description: product.description,
      categories: product.categories.map((pc) => pc.category.name),
      priceCents: product.priceCents,
      existingTitle: product.seoTitle,
      existingMeta: product.seoDescription,
    },
  };
}

// Dashboard summary
router.get('/', async (_req, res) => {
  const [totalProducts, analyzed, missingMeta, lastAnalyses] = await Promise.all([
    prisma.product.count({ where: { active: true } }),
    prisma.seoAnalysis.count({ where: { status: 'COMPLETE' } }),
    prisma.product.count({ where: { active: true, OR: [{ seoTitle: null }, { seoDescription: null }] } }),
    prisma.seoAnalysis.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 10,
      include: { product: { select: { id: true, slug: true, name: true } } },
    }),
  ]);

  const avgScore = await prisma.seoAnalysis.aggregate({
    where: { status: 'COMPLETE', score: { not: null } },
    _avg: { score: true },
  });

  res.json({
    totals: { products: totalProducts, analyzed, missingMeta },
    averageScore: avgScore._avg.score ?? null,
    recent: lastAnalyses,
  });
});

// List analyses
router.get('/analyses', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const analyses = await prisma.seoAnalysis.findMany({
    where: q ? { product: { name: { contains: q, mode: 'insensitive' } } } : undefined,
    include: {
      product: { select: { id: true, slug: true, name: true } },
      keywords: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
  res.json({ analyses });
});

router.get('/analyses/:id', async (req, res) => {
  const analysis = await prisma.seoAnalysis.findUnique({
    where: { id: req.params.id },
    include: { product: true, keywords: true },
  });
  if (!analysis) throw new HttpError(404, 'Not found');
  res.json({ analysis });
});

// Analyze a single product
router.post('/analyze-product/:productId', async (req, res) => {
  const { input, product } = await loadProductForSeo(req.params.productId);

  // Mark an analysis as PENDING so the UI can show a spinner if needed.
  const existing = await prisma.seoAnalysis.upsert({
    where: { productId: product.id },
    create: { productId: product.id, status: 'PENDING' },
    update: { status: 'PENDING', errorMessage: null },
  });

  try {
    const result = await analyzeProductSeo(input);

    const saved = await prisma.$transaction(async (tx) => {
      await tx.seoKeyword.deleteMany({ where: { analysisId: existing.id } });
      const updated = await tx.seoAnalysis.update({
        where: { id: existing.id },
        data: {
          status: 'COMPLETE',
          score: result.analysis.score,
          suggestedTitle: result.analysis.suggestedTitle,
          suggestedDescription: result.analysis.suggestedDescription,
          headline: result.analysis.headline,
          summary: result.analysis.summary,
          issues: result.analysis.issues,
          rewrittenBody: result.analysis.rewrittenBody,
          tokensUsed: result.tokensUsed,
          modelUsed: result.modelUsed,
          errorMessage: null,
          keywords: {
            create: result.analysis.keywords.map((k) => ({
              keyword: k.keyword,
              intent: k.intent,
              difficulty: k.difficulty,
              relevance: k.relevance,
            })),
          },
        },
        include: { keywords: true, product: true },
      });
      return updated;
    });

    res.json({ analysis: saved });
  } catch (e: any) {
    await prisma.seoAnalysis.update({
      where: { id: existing.id },
      data: { status: 'FAILED', errorMessage: e.message ?? 'Unknown error' },
    });
    throw e;
  }
});

// Quick meta-only generation (cheap)
router.post('/meta/:productId', async (req, res) => {
  const { input } = await loadProductForSeo(req.params.productId);
  const meta = await generateMetaOnly(input);
  res.json({ meta });
});

// Apply suggestions to the product
const applySchema = z.object({
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  description: z.string().optional(),
});

router.post('/apply/:productId', async (req, res) => {
  const data = applySchema.parse(req.body);
  const product = await prisma.product.update({
    where: { id: req.params.productId },
    data,
  });
  res.json({ product });
});

// Bulk analyze missing
router.post('/analyze-missing', async (_req, res) => {
  const missing = await prisma.product.findMany({
    where: { active: true, OR: [{ seoTitle: null }, { seoDescription: null }] },
    select: { id: true },
    take: 20,
  });

  const results: { productId: string; ok: boolean; error?: string }[] = [];
  for (const p of missing) {
    try {
      const { input } = await loadProductForSeo(p.id);
      const meta = await generateMetaOnly(input);
      await prisma.product.update({
        where: { id: p.id },
        data: { seoTitle: meta.title, seoDescription: meta.description },
      });
      results.push({ productId: p.id, ok: true });
    } catch (e: any) {
      results.push({ productId: p.id, ok: false, error: e.message });
    }
  }

  res.json({ processed: results });
});

export default router;
