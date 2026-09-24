import type { ReviewSentiment } from '@/types';
import { logAIEvent } from '@/lib/aiTelemetry';
import { EXTRACTION_SCHEMA, SENTIMENT_SCHEMA } from '../aiSchemas';
import { logger } from '@/lib/logger';
import {
  AI_MODEL_FAST,
  SKIP_AI,
  askClaude,
  callLLMRaw,
  errorTypeOf,
  parseStructured,
} from './client';

/** Character budget for HTML sent to the extraction model (~15k tokens). */
const EXTRACT_HTML_BUDGET = 60_000;
const EXTRACT_HEAD_CHARS = 40_000;
const EXTRACT_TAIL_CHARS = 20_000;
const EXTRACT_MAX_TOKENS = 4096;

/**
 * Strip everything the extractor never needs (scripts except ld+json, styles,
 * svg, noscript, comments, presentational attributes, inline images) and, if
 * still over budget, keep the head + first 40k + last 20k so the footer —
 * where accreditations, review links, social links and service areas live —
 * survives. Exported for the extraction eval.
 */
export function prepareHtmlForExtraction(html: string): string {
  const stripped = html
    .replace(/<script\b(?![^>]*type=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s(?:style|class|data-[\w-]+)=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(?:src|href|srcset)=["']data:image\/[^"']*["']/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  if (stripped.length <= EXTRACT_HTML_BUDGET) return stripped;
  return (
    stripped.slice(0, EXTRACT_HEAD_CHARS) +
    '\n<!-- truncated -->\n' +
    stripped.slice(stripped.length - EXTRACT_TAIL_CHARS)
  );
}

export async function extractPageSignals(
  html: string,
  prompt: string,
): Promise<Record<string, unknown>> {
  if (SKIP_AI) return {};
  const t0 = Date.now();
  const stripped = prepareHtmlForExtraction(html);
  try {
    const msg = await callLLMRaw(
      {
        model: AI_MODEL_FAST,
        max_tokens: EXTRACT_MAX_TOKENS,
        output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: `${prompt}\n\nHTML:\n${stripped}`,
          },
        ],
      },
      { label: 'extractPageSignals' },
    );
    const result = parseStructured<Record<string, unknown>>(
      msg,
      'extractPageSignals',
      EXTRACT_MAX_TOKENS,
    );
    logAIEvent({
      event: 'extract_signals',
      model: AI_MODEL_FAST,
      success: true,
      durationMs: Date.now() - t0,
    });
    return result;
  } catch (e) {
    logAIEvent({
      event: 'extract_signals',
      model: AI_MODEL_FAST,
      success: false,
      durationMs: Date.now() - t0,
      errorType: errorTypeOf(e),
    });
    logger.warn('extractPageSignals', 'Failed', { error: e });
    throw e;
  }
}

export async function generateReviewSentiment(
  reviews: Array<{ rating: number; text: string }>,
): Promise<ReviewSentiment | null> {
  if (SKIP_AI) return null;
  if (!reviews.length) return null;
  const texts = reviews
    .filter((r) => r.text?.trim())
    .slice(0, 20)
    .map((r) => `[${r.rating}★] ${r.text.trim().slice(0, 400)}`)
    .join('\n');
  if (!texts) return null;
  const t0 = Date.now();
  const prompt = `Analyse these customer reviews and return JSON only.
Schema: {"positiveThemes":["string","string","string"],"negativeThemes":["string","string","string"],"summary":"string"}
Rules: positiveThemes = top 3 praised topics (2-4 words each), negativeThemes = top 3 complaint topics (2-4 words each, empty array if none), summary = ≤15 words.
Reviews:\n${texts}`;
  try {
    const result = await askClaude<Omit<ReviewSentiment, 'generatedAt'>>(prompt, SENTIMENT_SCHEMA);
    logAIEvent({
      event: 'sentiment',
      model: AI_MODEL_FAST,
      success: true,
      durationMs: Date.now() - t0,
    });
    return { ...result, generatedAt: new Date().toISOString() };
  } catch (e) {
    logAIEvent({
      event: 'sentiment',
      model: AI_MODEL_FAST,
      success: false,
      durationMs: Date.now() - t0,
      errorType: errorTypeOf(e),
    });
    return null;
  }
}
