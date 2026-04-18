import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAnthropicConfig } from './settings.js';
import { HttpError } from '../middleware/error.js';

async function getClient() {
  const { apiKey, model } = await getAnthropicConfig();
  if (!apiKey) throw new HttpError(400, 'Anthropic API key is not configured. Set it in Admin → Settings → Integrations.');
  return { client: new Anthropic({ apiKey }), model };
}

const SeoIssueSchema = z.object({
  severity: z.enum(['low', 'medium', 'high']),
  field: z.string(),
  message: z.string(),
});

const SeoKeywordSchema = z.object({
  keyword: z.string(),
  intent: z.enum(['informational', 'commercial', 'transactional', 'navigational']),
  difficulty: z.number().int().min(0).max(100),
  relevance: z.number().int().min(0).max(100),
});

export const SeoAnalysisSchema = z.object({
  score: z.number().int().min(0).max(100).describe('Overall SEO health score.'),
  suggestedTitle: z.string().min(10).max(70).describe('Meta title, 50-60 chars ideal.'),
  suggestedDescription: z.string().min(50).max(180).describe('Meta description, 140-160 chars ideal.'),
  headline: z.string().describe('Primary H1 headline for the page.'),
  summary: z.string().describe('2-3 sentence summary of what SEO changes are recommended.'),
  issues: z.array(SeoIssueSchema).describe('Concrete, actionable issues found.'),
  rewrittenBody: z.string().describe('A rewritten, SEO-optimized version of the product body copy.'),
  keywords: z.array(SeoKeywordSchema).min(3).max(15).describe('Target keywords with intent/difficulty/relevance 0-100.'),
});

export type SeoAnalysisResult = z.infer<typeof SeoAnalysisSchema>;

export interface SeoInput {
  name: string;
  shortDescription?: string | null;
  description?: string | null;
  categories: string[];
  priceCents: number;
  existingTitle?: string | null;
  existingMeta?: string | null;
}

const SEO_SYSTEM = `You are a senior SEO specialist writing for an independent comic-book and graphic-novel printing company. You help the shop owner improve organic search visibility and click-through rates for product pages.

Rules:
- Titles: 50-60 characters ideal, never over 70. Include the primary keyword near the start. Match search intent for someone looking to print comics, graphic novels, or trade paperbacks.
- Meta descriptions: 140-160 characters ideal. Compelling, includes a call to action. Avoid generic fluff.
- Keywords: focus on transactional and commercial-intent terms that a small press, independent creator, or publisher would actually search. Include long-tail variants. Provide an honest difficulty estimate (0-100) and relevance (0-100) to the product.
- Rewritten body: clear, scannable, benefits-led. No keyword stuffing. Preserve factual claims present in the original body.
- Issues: concrete and actionable. Flag missing alt text hints, thin content, keyword cannibalization risk, CTA weakness, etc.
- Keep tone professional-friendly, not hype.`;

export async function analyzeProductSeo(input: SeoInput): Promise<{ analysis: SeoAnalysisResult; tokensUsed: number; modelUsed: string }> {
  const { client, model } = await getClient();

  const userContent = [
    `# Product to analyze`,
    `Name: ${input.name}`,
    `Categories: ${input.categories.join(', ') || '(none)'}`,
    `Price: $${(input.priceCents / 100).toFixed(2)}`,
    input.existingTitle ? `Current SEO title: ${input.existingTitle}` : '',
    input.existingMeta ? `Current meta description: ${input.existingMeta}` : '',
    '',
    '## Short description',
    input.shortDescription ?? '(none)',
    '',
    '## Full description',
    input.description ?? '(none)',
    '',
    'Return the SEO analysis as structured JSON.',
  ].filter(Boolean).join('\n');

  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    // Cache the long system prompt across every analysis in the session.
    system: [{ type: 'text', text: SEO_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent }],
    output_config: { format: zodOutputFormat(SeoAnalysisSchema) },
  });

  const analysis = response.parsed_output;
  if (!analysis) throw new HttpError(502, 'Claude returned no structured output.');

  const tokensUsed =
    (response.usage?.input_tokens ?? 0) +
    (response.usage?.output_tokens ?? 0) +
    (response.usage?.cache_creation_input_tokens ?? 0) +
    (response.usage?.cache_read_input_tokens ?? 0);

  return { analysis, tokensUsed, modelUsed: model };
}

const MetaSchema = z.object({
  title: z.string().min(10).max(70),
  description: z.string().min(50).max(180),
});

export async function generateMetaOnly(input: SeoInput) {
  const { client, model } = await getClient();

  const response = await client.messages.parse({
    model,
    max_tokens: 1024,
    system: [{ type: 'text', text: SEO_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: `Write ONLY the SEO title and meta description for this product:\n\nName: ${input.name}\nShort: ${input.shortDescription ?? ''}\nDescription: ${input.description ?? ''}\n\nReturn structured JSON only.`,
      },
    ],
    output_config: { format: zodOutputFormat(MetaSchema) },
  });

  if (!response.parsed_output) throw new HttpError(502, 'Claude returned no structured output.');
  return response.parsed_output;
}
