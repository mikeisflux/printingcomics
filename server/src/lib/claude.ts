import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
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
- Titles: 50-60 characters ideal, never over 70. Include the primary keyword near the start.
- Meta descriptions: 140-160 characters ideal. Compelling, includes a call to action.
- Keywords: focus on transactional and commercial-intent terms. Provide difficulty (0-100) and relevance (0-100) honestly.
- Rewritten body: clear, scannable, benefits-led. No keyword stuffing.
- Issues: concrete and actionable.

You MUST respond with a single JSON object matching the requested schema. No prose before or after the JSON. No markdown code fences.`;

// Extract JSON from a Claude text response. Tolerates markdown fences in case
// the model adds them despite the system prompt.
function parseJsonBlock<T>(text: string, schema: z.ZodType<T>): T {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  // Find the first `{` and the matching last `}` to be extra defensive.
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1) throw new HttpError(502, 'Claude returned no JSON object.');
  const slice = stripped.slice(start, end + 1);
  let raw: unknown;
  try {
    raw = JSON.parse(slice);
  } catch (e: any) {
    throw new HttpError(502, `Claude returned invalid JSON: ${e.message}`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new HttpError(502, `Claude output did not match schema: ${result.error.message}`);
  return result.data;
}

function textOf(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

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
    'Return ONLY a JSON object with these fields:',
    '- score (int 0-100)',
    '- suggestedTitle (string)',
    '- suggestedDescription (string)',
    '- headline (string)',
    '- summary (string)',
    '- issues (array of {severity, field, message})',
    '- rewrittenBody (string)',
    '- keywords (array of {keyword, intent, difficulty, relevance})',
  ].filter(Boolean).join('\n');

  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    system: [{ type: 'text', text: SEO_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent }],
  });

  const analysis = parseJsonBlock(textOf(response.content), SeoAnalysisSchema);
  const tokensUsed =
    (response.usage?.input_tokens ?? 0) +
    (response.usage?.output_tokens ?? 0) +
    ((response.usage as any)?.cache_creation_input_tokens ?? 0) +
    ((response.usage as any)?.cache_read_input_tokens ?? 0);

  return { analysis, tokensUsed, modelUsed: model };
}

const MetaSchema = z.object({
  title: z.string().min(10).max(70),
  description: z.string().min(50).max(180),
});

export async function generateMetaOnly(input: SeoInput) {
  const { client, model } = await getClient();

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: [{ type: 'text', text: SEO_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: `Write ONLY the SEO title and meta description for this product as a JSON object {title, description}:\n\nName: ${input.name}\nShort: ${input.shortDescription ?? ''}\nDescription: ${input.description ?? ''}`,
      },
    ],
  });

  return parseJsonBlock(textOf(response.content), MetaSchema);
}
