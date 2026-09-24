import type { ExtractedSignals, PriorityAction, Business } from '@/types';
import { SERVICE_CATEGORIES } from '@/lib/serviceCategories';
import type { ServiceCategory } from '@/lib/serviceCategories';
import { logAIEvent } from '@/lib/aiTelemetry';
import { applyTemplates, applyTemplatesWithHistory } from '@/lib/priorityTemplates';
import {
  PRIORITY_ACTIONS_SCHEMA,
  PRIORITY_ACTIONS_WITH_CONTINUITY_SCHEMA,
  type JsonSchema,
} from '../aiSchemas';
import { logger } from '@/lib/logger';
import { AIUnavailableError, AI_MODEL_SMART, SKIP_AI, askClaude, errorTypeOf } from './client';
import { CATEGORY_SCORE_MAP_FULL, SCOUTLY_SYSTEM, summariseBiz } from './shared';
import { dropUngroundedActions } from './evidence';
import { validateActionsHybrid } from './validation';

const TONE_RULES = `TONE RULES:
- Plain English only. No SEO jargon (no "schema markup", "structured data", "alt tags", "SERP", "CTR"). If you must reference something technical, describe what it does in plain words.
- Speak directly to the owner. "You" not "the business."
- No editorialising in parentheses like "(good)" or "(nice work)".
- No filler phrases like "this gap compounds over time" or "category-wide gap". Say what to do and why.
- UK English spelling and phrasing (organise, colour, personalise, enquiry).
- No dash punctuation anywhere in the output: no em dashes, no en dashes, no hyphen standing in for a dash, and no dashes in ranges (write "2 to 3 hours", "15 to 20 reviews"). Use commas, colons, semicolons, or separate sentences.`;

const DATA_INTEGRITY_RULES = `DATA INTEGRITY RULES (violations break user trust):
- Every claim about a competitor MUST be directly verifiable in the data provided. Do not invent averages, trends, or competitor behaviours.
- Do not claim "competitors average X" unless you computed it from the actual data. Instead reference specific named competitors.
- Never contradict yourself within a single action: if competitorReference says "velocity 0" then whyItMatters cannot say "competitors maintain strong velocity."
- If the own business already has something (e.g. an accreditation listed in signals), do NOT recommend adding it. Recommend displaying it more prominently instead.
- competitorReference: if no specific competitor is doing a specific thing better than this business, set it to null. Do not pad with generic tips.
- Re-read the own business signals before finalising each action. If the gap you're describing doesn't exist in the data, pick a different gap.`;

const FIELD_RULES = `Field rules:
- action: conversational headline describing the gap in plain English, max 10 words
- reason: ≤15-word plain-English summary of the gap
- whyItMatters: 2 to 3 sentences. Reference actual score values from the data. Name specific competitors when citing them, and never say "competitors average X" unless you show the maths.
- steps: 3 to 5 specific, doable action items the owner can start this week. Each step is plain English. Be concrete (specific platform names, specific pages).
- outcome: 4 to 8 word goal statement
- effort: 'low' (< 1 hour), 'medium' (1 day), or 'high' (1+ week)
- category: one of "AI Visibility" | "Reviews" | "Local SEO" | "Website" | "Trust" | "Conversion"
- timeframe: realistic time-to-result, written without a dash (e.g. "2 to 3 weeks")
- competitorReference: plain-English note naming a specific competitor and what they have that this business lacks, or null. Must be consistent with whyItMatters.
- evidence: 1 to 4 data paths you relied on, each written as path=value exactly as it appears in the JSON below. Paths start with "own." or "competitor.<name>." and walk the object keys, e.g. "own.signals.engagement.hasContactForm=false", "own.scores.reputation=70", "competitor.Acme Ltd.reviewCount=140". Every path must exist in the data. Actions whose evidence does not resolve are discarded.`;

const PRIORITY_SCHEMA_BASE = `{"actions":[{"priority":1,"category":"string","effort":"low"|"medium"|"high","action":"string","reason":"string","whyItMatters":"string","steps":["string"],"outcome":"string","competitorReference":"string|null","estimatedImpact":"high"|"medium","timeframe":"string","evidence":["string"]}]}`;

const PRIORITY_SCHEMA_WITH_CONTINUITY = `{"actions":[{"priority":1,"category":"string","effort":"low"|"medium"|"high","action":"string","reason":"string","whyItMatters":"string","steps":["string"],"outcome":"string","competitorReference":"string|null","estimatedImpact":"high"|"medium","timeframe":"string","evidence":["string"],"continuityNote":"string|null"}]}`;

/** Build a warning note about own-business data quality issues (crawl errors, extract failures, empty signals). */
function ownDataWarnings(own: Business): string {
  const lines: string[] = [];
  if (own.enrichmentErrors?.crawl) {
    lines.push(
      "There were issues crawling this business's website, so website-related data may be incomplete.",
    );
  }
  if (own.enrichmentErrors?.extract) {
    lines.push(
      'Page-signal extraction failed for this business. Do not recommend adding standard features (booking, accreditations, services, phone, etc.) unless the gap is supported by another data source (Google data, scores).',
    );
  }
  const sig = own.signals as Record<string, unknown> | null | undefined;
  const sigEmpty =
    !sig ||
    Object.keys(sig).length === 0 ||
    Object.values(sig).every(
      (v) => v == null || (typeof v === 'object' && Object.keys(v as object).length === 0),
    );
  if (sigEmpty && !own.enrichmentErrors?.extract) {
    lines.push(
      'No on-site signals available for this business. Avoid recommending changes that depend on website signals you cannot verify.',
    );
  }
  return lines.length ? `\nNote: ${lines.join(' ')}\n` : '';
}

/** Build the "templates already covered these gaps" note. */
function coveredSlotsNote(templateActions: PriorityAction[], remainingSlots: number): string {
  if (templateActions.length === 0) return '';
  const names = templateActions.map((a) => `"${a.action.replace(/"/g, "'")}"`).join(', ');
  return `\nThese priority slots are already covered by automatic checks: ${names}. Fill the remaining ${remainingSlots} slots with different gaps.\n`;
}

/**
 * Compute the recommended effort mix for the slots the LLM still needs to fill.
 *
 * Target overall mix across 5 actions = 2 low, 2 medium, 1 high. We subtract
 * what templates already provided. If the resulting gap doesn't sum to
 * `remainingSlots` we rebalance: overflow is trimmed from high → medium → low
 * (LLM additions should lean low-effort), shortfall is padded with low. Then
 * the hard cap of "at most 2 high across the full list" is enforced and any
 * trimmed high slots roll back into low.
 */
function effortGapNote(templateActions: PriorityAction[], remainingSlots: number): string {
  type Effort = 'low' | 'medium' | 'high';
  const target: Record<Effort, number> = { low: 2, medium: 2, high: 1 };
  const used: Record<Effort, number> = { low: 0, medium: 0, high: 0 };
  for (const a of templateActions) used[a.effort]++;
  const want: Record<Effort, number> = {
    low: Math.max(0, target.low - used.low),
    medium: Math.max(0, target.medium - used.medium),
    high: Math.max(0, target.high - used.high),
  };

  let total = want.low + want.medium + want.high;
  if (total > remainingSlots) {
    for (const k of ['high', 'medium', 'low'] as const) {
      while (want[k] > 0 && total > remainingSlots) {
        want[k]--;
        total--;
      }
    }
  } else if (total < remainingSlots) {
    want.low += remainingSlots - total;
  }

  // Hard cap: across the full list of 5, no more than 2 'high'. Push overflow into low.
  const remainingHighCap = Math.max(0, 2 - used.high);
  if (want.high > remainingHighCap) {
    want.low += want.high - remainingHighCap;
    want.high = remainingHighCap;
  }

  const slotWord = remainingSlots === 1 ? 'slot' : 'slots';
  return `Effort guidance: aim for ${want.low} 'low', ${want.medium} 'medium', and ${want.high} 'high' effort across these ${remainingSlots} ${slotWord}. Hard cap: no more than ${remainingHighCap} 'high' effort ${remainingHighCap === 1 ? 'action' : 'actions'} in your response.`;
}

/**
 * Check whether the LLM returned multiple actions in the same category for a
 * business that already scores well there (≥80). Returns which categories are
 * over-represented and whether a regeneration is warranted.
 *
 * Exported for unit testing.
 */
export function checkCategoryDistribution(
  actions: PriorityAction[],
  ownScores: NonNullable<Business['aiScore']> | null,
): { overrepresented: string[]; shouldRegenerate: boolean } {
  const counts: Record<string, number> = {};
  for (const a of actions) {
    counts[a.category] = (counts[a.category] || 0) + 1;
  }

  const overrepresented: string[] = [];
  for (const [category, count] of Object.entries(counts)) {
    if (count < 2) continue;
    // Skip when scores are missing — new businesses without scores should not
    // trigger unnecessary regenerations. Only flag when we have a real score ≥ 80.
    const scoreField = CATEGORY_SCORE_MAP_FULL[category];
    if (!scoreField || !ownScores) continue;
    const score = ownScores[scoreField];
    if (score == null) continue;
    if (typeof score === 'number' && score >= 80) {
      overrepresented.push(category);
    }
  }

  return { overrepresented, shouldRegenerate: overrepresented.length > 0 };
}

function sortTop5(raw: PriorityAction[]): PriorityAction[] {
  return raw
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5)
    .map((action, i) => ({ ...action, priority: (i + 1) as PriorityAction['priority'] }));
}

/**
 * Generate actions via askClaude, then check for over-represented categories
 * on strong scores. If detected, regenerate once with an explicit instruction.
 */
async function generateWithDistributionCheck(
  prompt: string,
  ownScores: NonNullable<Business['aiScore']> | null,
  label: string,
  maxTokens: number,
  schema: JsonSchema,
): Promise<PriorityAction[]> {
  const ask = (p: string) =>
    askClaude<{ actions: PriorityAction[] }>(p, schema, {
      maxTokens,
      system: SCOUTLY_SYSTEM,
      model: AI_MODEL_SMART,
    }).then((r) => (Array.isArray(r.actions) ? r.actions : []));

  let sorted = sortTop5(await ask(prompt));

  const dist = checkCategoryDistribution(sorted, ownScores);
  if (dist.shouldRegenerate) {
    const dupeNote = dist.overrepresented
      .map((cat) => {
        const field = CATEGORY_SCORE_MAP_FULL[cat];
        const score = field && ownScores ? ownScores[field] : '?';
        const count = sorted.filter((a) => a.category === cat).length;
        return `${count} actions in the "${cat}" category, but this business already scores ${score} there`;
      })
      .join('; ');
    logger.info(label, 'Over-represented categories detected, regenerating once', {
      overrepresented: dist.overrepresented,
    });

    const retryPrompt =
      prompt +
      `\n\nPREVIOUS ATTEMPT DUPLICATE: Your last attempt returned ${dupeNote}. Spread your actions across at least 2 different categories.`;
    sorted = sortTop5(await ask(retryPrompt));

    const retryDist = checkCategoryDistribution(sorted, ownScores);
    if (retryDist.shouldRegenerate) {
      logger.warn(label, 'Regeneration still has duplicate categories, proceeding anyway', {
        overrepresented: retryDist.overrepresented,
      });
    }
  }

  return sorted;
}

/**
 * Generate the top 5 priority actions for a business.
 *
 * **Template-first pipeline:** Before calling the LLM, deterministic Tier-1
 * templates are evaluated against the business signals. Any templates that
 * fire fill priority slots first. If all 5 slots are filled by templates the
 * LLM call is skipped entirely. Otherwise the LLM is told which gaps are
 * already covered and asked to fill the remaining slots.
 */
export async function generatePriorityActions(
  own: Business,
  competitors: Business[],
  serviceCategory?: ServiceCategory,
): Promise<PriorityAction[]> {
  if (SKIP_AI) return [];

  // ── Tier-1 templates ────────────────────────────────────────────────
  const { actions: templateActions, firedIds } = applyTemplates(own);
  const templatesUsed = templateActions.length;

  if (templatesUsed >= 5) {
    logger.info('priority', '5 templates fired, skipping LLM');
    logAIEvent({
      event: 'generation',
      model: AI_MODEL_SMART,
      success: true,
      durationMs: 0,
      serviceCategory,
      templatesUsed,
      templatesFired: firedIds,
    });
    return await validateActionsHybrid(templateActions.slice(0, 5), own, competitors);
  }

  // ── Build LLM prompt for remaining slots ────────────────────────────
  const remainingSlots = 5 - templatesUsed;

  const catConfig = serviceCategory ? SERVICE_CATEGORIES[serviceCategory] : null;
  const industryFocus = catConfig
    ? `This is a ${catConfig.label} business. Prioritise actions that affect: ${catConfig.dashboardPriority.join(', ')}.`
    : '';

  const dataWarnings = ownDataWarnings(own);
  const coveredNote = coveredSlotsNote(templateActions, remainingSlots);
  const effortNote = effortGapNote(templateActions, remainingSlots);

  const prompt = `Based on this week's data, surface the TOP ${remainingSlots} most important action${remainingSlots > 1 ? 's' : ''} this business should take right now.
${industryFocus ? `\n${industryFocus}\n` : ''}${dataWarnings}${coveredNote}

AUDIENCE: The reader is a busy local business owner (plumber, café owner, IT shop, small clinic). They are not a marketer. They have 5 minutes. Write like a friendly advisor, not a consultant.

${TONE_RULES}

${DATA_INTEGRITY_RULES}

PRIORITISATION RULES:
- Return exactly ${remainingSlots} action${remainingSlots > 1 ? 's' : ''}, not more. ${remainingSlots < 5 ? `(${templatesUsed} slot${templatesUsed > 1 ? 's are' : ' is'} already filled by automatic checks.)` : 'Five forces real prioritisation.'}
- Only include an action if it reflects a genuine gap. If the business is already strong in a category (score ≥ 85 and no specific deficit in the data), do not invent a problem there.
- Every action must have estimatedImpact of "high" or "medium". No "low impact" actions.
- Each action must address a genuinely different gap. No two from the same root cause unless the gaps are clearly distinct.
- ${effortNote}

${FIELD_RULES}

Priority numbering: Unique integers 1 to ${remainingSlots} ordered by impact. No gaps, no duplicates.

Schema (JSON object only, no markdown):
${PRIORITY_SCHEMA_BASE}

Own business: ${JSON.stringify(summariseBiz(own, true))}
Competitors: ${JSON.stringify(competitors.map((b) => summariseBiz(b, false)))}`;

  const tokensPerSlot = 900;
  const maxTokens = remainingSlots * tokensPerSlot;

  const t0 = Date.now();
  try {
    const llmActions = dropUngroundedActions(
      await generateWithDistributionCheck(
        prompt,
        own.aiScore,
        'generatePriorityActions',
        maxTokens,
        PRIORITY_ACTIONS_SCHEMA,
      ),
      own,
      competitors,
    );

    // Combine: templates first, then LLM actions, renumber 1–5
    const combined = [
      ...templateActions,
      ...llmActions.slice(0, remainingSlots).map((a) => ({ ...a, _source: 'llm' as const })),
    ]
      .slice(0, 5)
      .map((a, i) => ({ ...a, priority: (i + 1) as PriorityAction['priority'] }));

    logAIEvent({
      event: 'generation',
      model: AI_MODEL_SMART,
      success: true,
      durationMs: Date.now() - t0,
      serviceCategory,
      templatesUsed,
      templatesFired: firedIds,
    });
    return await validateActionsHybrid(combined, own, competitors);
  } catch (e) {
    logAIEvent({
      event: 'generation',
      model: AI_MODEL_SMART,
      success: false,
      durationMs: Date.now() - t0,
      serviceCategory,
      templatesUsed,
      templatesFired: firedIds,
      errorType: errorTypeOf(e),
    });
    logger.warn('generatePriorityActions', 'Failed', { error: e });
    throw new AIUnavailableError(e);
  }
}

export async function generatePriorityActionsWithHistory(
  own: Business,
  competitors: Business[],
  previousActions: PriorityAction[],
  previousSignals: ExtractedSignals | null,
  currentSignals: ExtractedSignals,
  serviceCategory?: ServiceCategory,
): Promise<PriorityAction[]> {
  if (SKIP_AI) return [];

  // ── Tier-1 templates (with continuity awareness) ─────────────────────
  const {
    actions: templateActions,
    firedIds: firedIds2,
    closedFromLastWeek,
  } = applyTemplatesWithHistory(own, previousActions);
  const templatesUsed = templateActions.length;

  if (templatesUsed >= 5) {
    logger.info('priority', '5 templates fired, skipping LLM (with-history)');
    // Acknowledge up to 3 closed items from last week in the first template's whyItMatters
    if (closedFromLastWeek.length > 0) {
      const wins = closedFromLastWeek
        .slice(0, 3)
        .map((w) => `"${w}"`)
        .join(', ');
      const verb = closedFromLastWeek.length === 1 ? 'that gap is gone' : 'those gaps are gone';
      templateActions[0] = {
        ...templateActions[0],
        whyItMatters: `Last week you closed ${wins}, so ${verb}. ${templateActions[0].whyItMatters}`,
      };
    }
    logAIEvent({
      event: 'generation',
      model: AI_MODEL_SMART,
      success: true,
      durationMs: 0,
      serviceCategory,
      templatesUsed,
      templatesFired: firedIds2,
    });
    return await validateActionsHybrid(templateActions.slice(0, 5), own, competitors);
  }

  const remainingSlots = 5 - templatesUsed;

  const catConfig = serviceCategory ? SERVICE_CATEGORIES[serviceCategory] : null;
  const industryFocus = catConfig
    ? `This is a ${catConfig.label} business. Prioritise actions affecting: ${catConfig.dashboardPriority.join(', ')}.`
    : '';

  const changedSignals: Record<string, { before: unknown; after: unknown }> = {};
  if (previousSignals) {
    for (const key of Object.keys(currentSignals) as (keyof ExtractedSignals)[]) {
      if (JSON.stringify(previousSignals[key]) !== JSON.stringify(currentSignals[key])) {
        changedSignals[key] = { before: previousSignals[key], after: currentSignals[key] };
      }
    }
  }

  const dataWarnings = ownDataWarnings(own);
  const coveredNote = coveredSlotsNote(templateActions, remainingSlots);
  const effortNote = effortGapNote(templateActions, remainingSlots);

  const closedNote =
    closedFromLastWeek.length > 0
      ? `\nClosed since last week: ${closedFromLastWeek.map((h) => `"${h}"`).join(', ')}. The first action's continuityNote should briefly acknowledge ${closedFromLastWeek.length > 1 ? 'these wins' : 'this win'}.\n`
      : '';

  const previousCount = previousActions.length;
  const prompt = `You are continuing an ongoing weekly conversation with a local business owner. Last week you gave them ${previousCount} action${previousCount === 1 ? '' : 's'}. This week, decide what to tell them next.

${industryFocus ? `${industryFocus}\n` : ''}${dataWarnings}${coveredNote}${closedNote}
AUDIENCE: The reader is a busy local business owner. They are not a marketer. Write like a friendly advisor, not a consultant.

${TONE_RULES}

CONTINUITY RULES (this is what makes the product feel alive):
- Acknowledge what changed since last week. If a previous action was completed (signal improved), celebrate it in the first line of the first action.
- If a previous action was NOT completed (signal unchanged), you may repeat it, but reframe it as "still worth doing" with updated context, not as a fresh discovery.
- If nothing changed at all, say so honestly and keep actions steady rather than reshuffling for the sake of it.
- Never contradict last week's baseline. If last week said "you have no accreditations" and this week's data shows three, acknowledge that.
- If a category appeared in last week's actions but is absent this week, the FIRST action's continuityNote (or whyItMatters) must briefly acknowledge what the user fixed. Example: "Last week you added a booking system, so that gap is closed. Here is the next priority." Do not silently drop a previous action without naming the win.

${DATA_INTEGRITY_RULES}

INTERNAL COHERENCE CHECK (do this before returning):
- Read each whyItMatters as a paragraph. If two sentences within it appear to contradict (e.g. "score is 0" and "completeness is 85%"), explain the relationship in plain words rather than presenting them as competing facts. If you cannot reconcile them, drop the conflicting reference.

PRIORITISATION RULES:
- Return exactly ${remainingSlots} action${remainingSlots > 1 ? 's' : ''}. ${templatesUsed > 0 ? `(${templatesUsed} slot${templatesUsed > 1 ? 's are' : ' is'} already filled by automatic checks.)` : ''}
- Every action must have estimatedImpact "high" or "medium".
- Each action must address a genuinely different gap. No two from the same root cause unless the gaps are clearly distinct.
- ${effortNote}

${FIELD_RULES}
- continuityNote: short optional sentence like "You completed last week's portfolio action" or "Still outstanding from last week", or null for genuinely new items.

Previous week's actions: ${JSON.stringify(previousActions.map((a) => ({ action: a.action, category: a.category, reason: a.reason })))}

What changed in this business's signals since last week: ${Object.keys(changedSignals).length ? JSON.stringify(changedSignals) : '(nothing changed)'}

Schema (JSON object only, no markdown):
${PRIORITY_SCHEMA_WITH_CONTINUITY}

Own business: ${JSON.stringify(summariseBiz(own, true))}
Competitors: ${JSON.stringify(competitors.map((b) => summariseBiz(b, false)))}`;

  const tokensPerSlot = 900;
  const maxTokens = remainingSlots * tokensPerSlot;

  const t0 = Date.now();
  try {
    const sorted = dropUngroundedActions(
      await generateWithDistributionCheck(
        prompt,
        own.aiScore,
        'generatePriorityActionsWithHistory',
        maxTokens,
        PRIORITY_ACTIONS_WITH_CONTINUITY_SCHEMA,
      ),
      own,
      competitors,
    );

    // Combine: templates first, then LLM actions, renumber 1–5
    const combined = [
      ...templateActions,
      ...sorted.slice(0, remainingSlots).map((a) => ({ ...a, _source: 'llm' as const })),
    ]
      .slice(0, 5)
      .map((a, i) => ({ ...a, priority: (i + 1) as PriorityAction['priority'] }));

    logAIEvent({
      event: 'generation',
      model: AI_MODEL_SMART,
      success: true,
      durationMs: Date.now() - t0,
      serviceCategory,
      templatesUsed,
      templatesFired: firedIds2,
    });
    return await validateActionsHybrid(combined, own, competitors);
  } catch (e) {
    logAIEvent({
      event: 'generation',
      model: AI_MODEL_SMART,
      success: false,
      durationMs: Date.now() - t0,
      serviceCategory,
      templatesUsed,
      templatesFired: firedIds2,
      errorType: errorTypeOf(e),
    });
    logger.warn('generatePriorityActionsWithHistory', 'Failed', { error: e });
    throw new AIUnavailableError(e);
  }
}
