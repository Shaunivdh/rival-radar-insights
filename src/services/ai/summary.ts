import type { ExtractedSignals, ChangeSummary } from '@/types';
import { logAIEvent } from '@/lib/aiTelemetry';
import { CHANGE_SUMMARY_SCHEMA } from '../aiSchemas';
import { logger } from '@/lib/logger';
import { AIUnavailableError, AI_MODEL_FAST, SKIP_AI, askClaude, errorTypeOf } from './client';
import { SCOUTLY_SYSTEM } from './shared';

export async function generateChangeSummary(
  name: string,
  before: ExtractedSignals,
  after: ExtractedSignals,
  isCompetitor: boolean,
): Promise<ChangeSummary> {
  if (SKIP_AI) return { hasSignificantChanges: false, severity: 'low', summary: '', changes: [] };
  // Only send the fields that actually changed to reduce tokens
  const changedBefore: Partial<ExtractedSignals> = {};
  const changedAfter: Partial<ExtractedSignals> = {};
  for (const key of Object.keys(after) as (keyof ExtractedSignals)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      (changedBefore as Record<string, unknown>)[key] = before[key];
      (changedAfter as Record<string, unknown>)[key] = after[key];
    }
  }

  const t0 = Date.now();

  if (Object.keys(changedBefore).length === 0) {
    logAIEvent({ event: 'change_summary_skipped', model: 'none', success: true, durationMs: 0 });
    return {
      hasSignificantChanges: false,
      severity: 'low',
      summary: 'No changes detected this scan.',
      changes: [],
    };
  }

  const framing = isCompetitor
    ? `A competitor called "${name}" has made changes to their website. Tell the owner what changed and why it matters to them, framed as an opportunity or a threat. Be direct and advisory.`
    : `The owner's own website ("${name}") has changed since the last scan. Clearly describe what changed and flag anything that could help or hurt their online presence. Be concise and helpful.`;

  const prompt = `${framing}

DATA INTEGRITY: Every claim you make must be directly supported by the Before/After JSON below. Do not invent rankings, traffic numbers, competitor activity, search positions, or anything else not visible in the data. Do not state outcomes as fact ("they're capturing more traffic", "they're winning customers"). The data shows what changed on the site, never its results; phrase impact as possibility ("this could help them rank for..."). If you cannot describe a change concretely from the data, drop it.

Return JSON only.
Schema: {"hasSignificantChanges":boolean,"severity":"high"|"medium"|"low","summary":"string","changes":[{"category":"string","description":"string","significance":"string","actionItem":"string|null"}]}

Rules:
- summary: max 20 words, plain English, written as if speaking to the owner.
- description: explain the change and why it matters, not just what changed.
- significance: one of "high" | "medium" | "low".
- actionItem: a plain-English next step the owner should take (max 20 words, no jargon). For competitors: frame as an opportunity or threat response (e.g. "Add your pricing page before they take that traffic"). For own site: frame as a win to build on or a fix (e.g. "Add customer photos to the new page to build trust faster"). null only if no action is needed.
- severity: high = directly affects leads/rankings/trust, medium = noticeable improvement/regression, low = minor.
- If the "Before" value is null/empty, describe the change as "newly added" not "changed from X". Only describe a change from a specific value if that value is clearly present in the Before data.
- Max 5 changes.

Before: ${JSON.stringify(changedBefore)}
After: ${JSON.stringify(changedAfter)}`;

  try {
    const result = await askClaude<ChangeSummary>(prompt, CHANGE_SUMMARY_SCHEMA, {
      maxTokens: 1024,
      system: SCOUTLY_SYSTEM,
    });
    logAIEvent({
      event: 'change_summary',
      model: AI_MODEL_FAST,
      success: true,
      durationMs: Date.now() - t0,
    });
    return result;
  } catch (e) {
    logAIEvent({
      event: 'change_summary',
      model: AI_MODEL_FAST,
      success: false,
      durationMs: Date.now() - t0,
      errorType: errorTypeOf(e),
    });
    logger.warn('generateChangeSummary', 'Failed', { error: e });
    throw new AIUnavailableError(e);
  }
}
