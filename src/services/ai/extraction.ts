import type { ReviewSentiment } from '@/types';
import { logAIEvent } from '@/lib/aiTelemetry';
import { SENTIMENT_SCHEMA } from '../aiSchemas';
import { AI_MODEL_FAST, SKIP_AI, askClaude, errorTypeOf } from './client';

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
Rules: positiveThemes = top 3 praised topics (2 to 4 words each), negativeThemes = top 3 complaint topics (2 to 4 words each, empty array if none), summary = ≤15 words.
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
