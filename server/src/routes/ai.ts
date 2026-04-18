import { Router } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { getAnthropicConfig } from '../lib/settings.js';

const router = Router();

const requestSchema = z.object({
  categorySlug: z.string(),
  description: z.string().min(3).max(2000),
});

const responseSchema = z.object({
  productSlug: z.string(),
  selections: z.record(z.union([z.string(), z.number()])),
  quantity: z.number().int().min(1),
  rationale: z.string(),
});

const SYSTEM = `You are a print-shop sales assistant. The customer is shopping in one product category and tells you in plain English what they want printed. Your job is to translate that into a precise configuration: which product (size), which option values, and how many.

Rules:
- Pick the productSlug whose name and dimensions best match what the customer described. If they didn't specify a size, pick the most popular standard size.
- For each ProductOption on the chosen product, look at its "values" list and pick the value LABEL whose name best matches the customer's intent. If the customer didn't say anything about that option, pick the cheapest sensible default (priceModifierCents = 0 wins ties).
- For TEXT options like "Title", extract or generate a sensible value.
- For NUMBER options like "Pages", pick a number that matches what the customer said, or default to 32 for comics / 100 for graphic novels.
- The quantity must be an integer ≥ the product's minQuantity.
- selections must use the option's internalKey (or a snake_case form of its name) as the key, and the value LABEL string (or number) as the value.
- Never invent options that don't exist in the catalog.

Respond with ONE JSON object matching this shape (no prose, no markdown fences):
{ "productSlug": "...", "selections": { "internalKey": "label", ... }, "quantity": 100, "rationale": "1 sentence" }`;

router.post('/configure', async (req, res) => {
  const { categorySlug, description } = requestSchema.parse(req.body);

  const { apiKey, model } = await getAnthropicConfig();
  if (!apiKey) throw new HttpError(503, 'AI configuration not enabled (Anthropic key not set in admin)');

  const category = await prisma.category.findUnique({ where: { slug: categorySlug } });
  if (!category) throw new HttpError(404, 'Category not found');

  const products = await prisma.product.findMany({
    where: { active: true, categories: { some: { categoryId: category.id } } },
    orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
    include: {
      options: {
        orderBy: { sortOrder: 'asc' },
        include: { values: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  });

  if (products.length === 0) throw new HttpError(404, 'No products in this category');

  const catalog = products.map((p) => ({
    slug: p.slug,
    name: p.name,
    shortDescription: p.shortDescription,
    minQuantity: p.minQuantity,
    options: p.options.map((o) => ({
      internalKey: o.internalKey ?? o.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      name: o.name,
      type: o.type,
      required: o.required,
      values: o.values.map((v) => ({ label: v.label, subLabel: v.subLabel, priceModifierCents: v.priceModifierCents })),
    })),
  }));

  const userPrompt = `Customer description: ${description}\n\nCategory: ${category.name}\n\nAvailable products + options (JSON):\n${JSON.stringify(catalog, null, 2)}`;

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  // Strip markdown fences if Claude added them despite the instructions.
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1) throw new HttpError(502, 'AI returned no JSON object');

  let parsed: unknown;
  try { parsed = JSON.parse(stripped.slice(start, end + 1)); }
  catch (e: any) { throw new HttpError(502, `AI returned invalid JSON: ${e.message}`); }

  const result = responseSchema.safeParse(parsed);
  if (!result.success) throw new HttpError(502, `AI output didn't match schema: ${result.error.message}`);

  // Validate the suggested productSlug actually exists in this category.
  if (!products.find((p) => p.slug === result.data.productSlug)) {
    throw new HttpError(502, `AI picked unknown product: ${result.data.productSlug}`);
  }

  res.json({ configuration: result.data });
});

export default router;
