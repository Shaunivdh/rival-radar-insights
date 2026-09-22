import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import type {
  ExtractedSignals,
  PriorityAction,
  ChangeSummary,
  Business,
  ReviewSentiment,
  AIVisibility,
} from '@/types';
import { SERVICE_CATEGORIES, GENERIC_AI_QUERY_TEMPLATES } from '@/lib/serviceCategories';
import type { ServiceCategory } from '@/lib/serviceCategories';
import { withRetry } from '@/lib/aiRetry';
import { logAIEvent } from '@/lib/aiTelemetry';
import { applyTemplates, applyTemplatesWithHistory } from '@/lib/priorityTemplates';
import {
  EXTRACTION_SCHEMA,
  SENTIMENT_SCHEMA,
  PRIORITY_ACTIONS_SCHEMA,
  PRIORITY_ACTIONS_WITH_CONTINUITY_SCHEMA,
  VALIDATION_PATCHES_SCHEMA,
  CHANGE_SUMMARY_SCHEMA,
  MENTIONED_BUSINESSES_SCHEMA,
  type JsonSchema,
} from './aiSchemas';
import { logger } from '@/lib/logger';

interface MentionedBusiness {
  name: string;
  position: number;
  context: 'recommended' | 'mentioned' | 'compared' | 'dismissed';
}

export class AIUnavailableError extends Error {
  readonly retryAt: string;
  constructor(cause: unknown) {
    super('AI generation unavailable');
    this.name = 'AIUnavailableError';
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    this.retryAt = tomorrow.toISOString();
    if (cause instanceof Error) this.cause = cause;
  }
}

/** The model hit `max_tokens` before finishing — output is unparseable by construction. */
export class TruncatedOutputError extends Error {
  constructor(label: string, maxTokens: number) {
    super(`${label}: model output truncated at max_tokens=${maxTokens}`);
    this.name = 'TruncatedOutputError';
  }
}

/** Telemetry error label: `truncated` is counted separately from parse/API errors. */
function errorTypeOf(e: unknown): string {
  if (e instanceof TruncatedOutputError) return 'truncated';
  return (e as Error)?.name ?? 'Error';
}

/** Structured-output text block → parsed JSON. Throws on truncation instead of parsing a partial. */
function parseStructured<T>(msg: Anthropic.Message, label: string, maxTokens: number): T {
  if (msg.stop_reason === 'max_tokens') throw new TruncatedOutputError(label, maxTokens);
  const block = msg.content.find((c) => c.type === 'text') as { text: string } | undefined;
  return JSON.parse((block?.text ?? '').trim()) as T;
}

// ── In-memory cache for extractMentionedBusinesses ───────────────────
// NOTE: resets per cold start and not shared across instances in serverless deployments.
// Effective within a single scan run (multiple queries for one business).
const mentionsCache = new Map<string, MentionedBusiness[]>();
const MENTIONS_CACHE_MAX = 200;

function hashText(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

export function clearMentionsCache(): void {
  mentionsCache.clear();
}

const SKIP_AI = process.env.SKIP_AI_CALLS === 'true';

// Model defaults verified 2026-09-18 against:
// https://platform.claude.com/docs/en/about-claude/models/overview
// Model strings change over time. Re-verify against docs if you see
// 404 or invalid_model errors at runtime.
// FAST: extraction, sentiment, mention extraction, change summaries.
// SMART: advice generation + validation (accuracy plan §4.4) and AI-visibility queries.
const AI_MODEL_FAST = process.env.AI_MODEL_FAST?.trim() || 'claude-haiku-4-5-20251001';
const AI_MODEL_SMART = process.env.AI_MODEL_SMART?.trim() || 'claude-sonnet-5';

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

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/**
 * Lowest-level LLM call wrapper. Every Anthropic `messages.create` in this
 * module routes through here so integration tests can mock a single function.
 */
export async function callLLMRaw(
  params: Anthropic.MessageCreateParamsNonStreaming,
  retryOpts?: { backoffMs?: number; label?: string },
): Promise<Anthropic.Message> {
  return withRetry(() => getClient().messages.create(params), {
    label: retryOpts?.label ?? 'callLLMRaw',
    ...(retryOpts?.backoffMs ? { backoffMs: retryOpts.backoffMs } : {}),
  });
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

/**
 * Structured JSON call. `schema` is sent as `output_config.format`, so the
 * response is schema-valid JSON and is parsed directly. Truncated output
 * (`stop_reason === 'max_tokens'`) throws `TruncatedOutputError` rather than
 * being parsed.
 */
async function askClaude<T>(
  prompt: string,
  schema: JsonSchema,
  opts: { maxTokens?: number; system?: string; model?: string } = {},
): Promise<T> {
  const maxTokens = opts.maxTokens ?? 512;
  const model = opts.model ?? AI_MODEL_FAST;
  const msg = await callLLMRaw(
    {
      model,
      max_tokens: maxTokens,
      output_config: { format: { type: 'json_schema', schema } },
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: 'user', content: prompt }],
    },
    { label: 'askClaude' },
  );
  return parseStructured<T>(msg, 'askClaude', maxTokens);
}

// ── Shared prompt scaffolding ───────────────────────────────────────
// Keep first-run and weekly-history prompts aligned so quality cannot
// regress between scans. Edit these constants, not the call sites.

const SCOUTLY_SYSTEM = `You are Scoutly, an ongoing competitor-intelligence advisor for local business owners.
Hard rules you never break:
1. Return valid JSON matching the schema in the user prompt. No markdown, no prose outside JSON.
2. Every factual claim must be directly verifiable in the data provided. Do not invent averages, rankings, trends, traffic, or competitor behaviours.
3. Do not recommend adding something the business's own signals already show they have.
4. Never contradict yourself within a single field or between fields.
5. Plain English. Speak to the owner directly. No SEO jargon.
6. UK English spelling and phrasing throughout (organise, colour, personalise, enquiry).
7. Never use dash punctuation in any text you output: no em dashes, no en dashes, no hyphen used as a dash, and no dashes in number ranges (write "2 to 3 hours", not "2-3 hours"). Use a comma, colon, semicolon, or a new sentence instead. Hyphens inside ordinary compound words ("plain-English", "top-rated") are fine.`;

const SCOUTLY_FACT_CHECKER_SYSTEM = `You are Scoutly's fact-checker. Your only job is to fix flagged issues in already-generated priority actions with the smallest possible text change. You never invent new facts, you never rewrite well-formed sentences, and you never patch unflagged fields. Output valid JSON matching the schema in the user prompt and nothing else. Never use dash punctuation (em dash, en dash, or hyphen as a dash) in patched text; if a flagged sentence contains one, replace it with a comma, colon, or full stop.`;

/** Action category → relevant signal buckets, used to scope competitor signals sent to the validator. */
const CATEGORY_SIGNAL_BUCKETS: Record<string, Array<keyof ExtractedSignals>> = {
  Reviews: ['trust'],
  'Local SEO': ['seo'],
  Website: ['seo', 'engagement', 'content'],
  Trust: ['trust'],
  'AI Visibility': ['seo', 'content'],
  Conversion: ['engagement', 'content'],
};

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

/** Single canonical business summariser used by both first-run and history prompts. */
function summariseBiz(b: Business, isOwn = false) {
  return {
    name: b.name,
    industry: b.googleData?.businessCategory ?? null,
    location: b.googleData?.address ?? null,
    googleRating: b.googleData?.googleRating ?? null,
    reviewCount: b.googleData?.reviewCount ?? null,
    scores: b.aiScore
      ? {
          overall: b.aiScore.overallScore,
          reputation: b.aiScore.reputationScore,
          localSEO: b.aiScore.localVisibilityScore,
          websiteQuality: b.aiScore.websiteHealthScore,
          gbpCompleteness: b.aiScore.gbpCompletenessScore,
          reviewVelocity: b.aiScore.reviewVelocityScore,
        }
      : null,
    signals: !isOwn && b.enrichmentErrors?.crawl ? null : b.signals,
  };
}

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

/** Map action categories to their corresponding score field on AIHealthScore. */
const CATEGORY_SCORE_MAP_FULL: Record<string, keyof NonNullable<Business['aiScore']>> = {
  Reviews: 'reputationScore',
  'Local SEO': 'localVisibilityScore',
  Website: 'websiteHealthScore',
  Trust: 'gbpCompletenessScore',
  'AI Visibility': 'aiPresenceScore',
  Conversion: 'websiteHealthScore',
};

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

interface ValidationFlag {
  actionIndex: number;
  type:
    | 'unverified_average'
    | 'recommends_existing'
    | 'score_contradiction'
    | 'self_contradiction'
    | 'evidence_mismatch';
  detail: string;
}

// ── Evidence grounding ───────────────────────────────────────────────
// Every LLM action must cite the data it used ("own.signals.engagement.hasContactForm=false").
// The code resolves each path against the real objects: a path that does not exist
// drops the action; a value that does not match is flagged for the fact-checker.

type EvidenceResolution =
  | { ok: true; path: string }
  | { ok: false; path: string; reason: 'missing_path' | 'value_mismatch'; actual?: unknown };

function walkPath(root: unknown, segments: string[]): { found: boolean; value: unknown } {
  let cur: unknown = root;
  for (const seg of segments) {
    if (cur == null || typeof cur !== 'object') return { found: false, value: undefined };
    if (!(seg in (cur as object))) return { found: false, value: undefined };
    cur = (cur as Record<string, unknown>)[seg];
  }
  return { found: true, value: cur };
}

function evidenceValueMatches(actual: unknown, expected: string): boolean {
  const exp = expected.trim();
  if (exp === '') return true;
  if (exp === 'null') return actual == null;
  if (exp === 'true' || exp === 'false') return actual === (exp === 'true');
  if (typeof actual === 'number') {
    const n = Number(exp);
    return Number.isFinite(n) && Math.abs(n - actual) < 0.051;
  }
  if (Array.isArray(actual)) {
    if (exp === '[]') return actual.length === 0;
    try {
      const parsed = JSON.parse(exp);
      if (Array.isArray(parsed)) {
        return parsed.every((p) =>
          actual.some((a) => String(a).toLowerCase() === String(p).toLowerCase()),
        );
      }
    } catch {
      /* not JSON — fall through to single-item check */
    }
    const item = exp.replace(/^["']|["']$/g, '').toLowerCase();
    return actual.some((a) => String(a).toLowerCase() === item);
  }
  if (actual == null) return false;
  const a = String(actual).toLowerCase();
  const e = exp.replace(/^["']|["']$/g, '').toLowerCase();
  return a === e || a.includes(e);
}

/**
 * Resolve one evidence string against the real data. Paths are tried against
 * the summarised view the model was shown (`summariseBiz`) and the raw
 * `Business` object, so both "own.scores.reputation=70" and
 * "own.aiScore.reputationScore=70" resolve. Exported for unit tests.
 */
export function resolveEvidence(
  evidence: string,
  own: Business,
  competitors: Business[],
): EvidenceResolution {
  const eqIdx = evidence.indexOf('=');
  const path = (eqIdx === -1 ? evidence : evidence.slice(0, eqIdx)).trim();
  const expected = eqIdx === -1 ? '' : evidence.slice(eqIdx + 1);
  const segments = path.split('.').filter(Boolean);
  if (segments.length < 2) return { ok: false, path, reason: 'missing_path' };

  let roots: unknown[] = [];
  let rest: string[] = [];
  const head = segments[0].toLowerCase();
  if (head === 'own') {
    roots = [summariseBiz(own, true), own];
    rest = segments.slice(1);
  } else if (head === 'competitor' || head === 'competitors') {
    // Competitor names may contain dots — try progressively longer name joins.
    for (let n = 1; n < segments.length && roots.length === 0; n++) {
      const name = segments
        .slice(1, 1 + n)
        .join('.')
        .toLowerCase();
      const comp = competitors.find((c) => c.name.toLowerCase() === name);
      if (comp) {
        roots = [summariseBiz(comp, false), comp];
        rest = segments.slice(1 + n);
      }
    }
    if (roots.length === 0) return { ok: false, path, reason: 'missing_path' };
  } else {
    return { ok: false, path, reason: 'missing_path' };
  }
  if (rest.length === 0) return { ok: false, path, reason: 'missing_path' };

  let lastActual: unknown;
  let found = false;
  for (const root of roots) {
    const r = walkPath(root, rest);
    if (!r.found) continue;
    found = true;
    lastActual = r.value;
    if (evidenceValueMatches(r.value, expected)) return { ok: true, path };
  }
  if (!found) return { ok: false, path, reason: 'missing_path' };
  return { ok: false, path, reason: 'value_mismatch', actual: lastActual };
}

/**
 * Drop LLM actions whose evidence cites a path that does not exist in the data.
 * Value mismatches are kept and flagged later by `deterministicChecks`.
 */
export function dropUngroundedActions(
  actions: PriorityAction[],
  own: Business,
  competitors: Business[],
): PriorityAction[] {
  return actions.filter((a) => {
    const evidence = Array.isArray(a.evidence) ? a.evidence : [];
    for (const ev of evidence) {
      const r = resolveEvidence(ev, own, competitors);
      if (!r.ok && r.reason === 'missing_path') {
        logger.warn('evidence', 'Dropping action — path not in data', {
          action: a.action,
          path: r.path,
        });
        return false;
      }
    }
    return true;
  });
}

// ── Existence checks (generated from the signal shape) ───────────────
// Every boolean `hasX` / `xExists` / `xMentioned` maps to "add/set up/create X"
// phrases; every non-empty array maps to "add/list/get" + item. Replaces the
// four hand-written entries so contact form, FAQ, blog, schema, social links,
// newsletter and team page are all covered.

const FLAG_SIGNAL_LABELS: Record<string, string[]> = {
  'engagement.hasContactForm': ['contact form', 'enquiry form', 'inquiry form', 'web form'],
  'engagement.hasBookingSystem': ['booking system', 'online booking', 'booking'],
  'engagement.hasPhoneNumberProminent': ['phone number', 'your phone'],
  'engagement.hasCallToAction': ['call to action', 'call-to-action', 'cta'],
  'engagement.hasNewsletterSignup': ['newsletter', 'mailing list', 'email signup', 'email sign-up'],
  'content.hasBlog': ['blog', 'news section', 'articles section'],
  'content.hasFAQ': ['faq', 'faqs', 'frequently asked questions'],
  'content.hasPortfolio': ['portfolio', 'gallery', 'case studies'],
  'trust.teamPageExists': ['team page', 'meet the team page', 'about page', 'about us page'],
  'trust.insuranceMentioned': ['insurance details', 'insurance information', 'insurance'],
  'seo.hasSitemap': ['sitemap'],
  'seo.hasRobotsTxt': ['robots.txt'],
  'seo.canonicalTagsPresent': ['canonical tag', 'canonical tags'],
};

const ARRAY_SIGNAL_LABELS: Record<string, string> = {
  'trust.accreditations': 'accreditation',
  'trust.certifications': 'certification',
  'trust.awardsAndMemberships': 'award or membership',
  'trust.reviewPlatformsLinked': 'review platform',
  'trust.guaranteesMentioned': 'guarantee',
  'content.servicesListed': 'service',
  'content.serviceAreasMentioned': 'service area',
  'engagement.socialLinksPresent': 'social link',
  'seo.schemaMarkupTypes': 'schema markup',
};

const ADD_VERBS = [
  'add',
  'set up',
  'setup',
  'create',
  'install',
  'enable',
  'build',
  'launch',
  'start',
];
const LIST_VERBS = ['add', 'get', 'obtain', 'pursue', 'list', 'offer', 'link', 'join', 'display'];

// These match weakness/strength language only when it appears near competitor
// references, to reduce false positives on neutral phrases like "maintain your rating".
const WEAKNESS_RE = /\b(weak|poor|lacking|behind|falling|low|missing)\b|\bno\s/;
const STRENGTH_RE = /\b(strong|maintain|active|consistent|leading)\b/;
const COMPETITOR_WEAKNESS_RE = /\b(zero|lack|none)\b|\bno\s|\b0\s/;

/**
 * Test whether `pattern` matches within ~50 characters of a competitor reference.
 * Returns the first match found, or null.
 */
function matchesNearCompetitor(
  text: string,
  pattern: RegExp,
  competitorNames: string[],
): RegExpMatchArray | null {
  const lower = text.toLowerCase();
  const anchors = [
    'competitor',
    'competitors',
    'rival',
    'rivals',
    ...competitorNames.map((n) => n.toLowerCase()),
  ];

  for (const anchor of anchors) {
    let searchFrom = 0;

    while (true) {
      const pos = lower.indexOf(anchor, searchFrom);
      if (pos === -1) break;
      const start = Math.max(0, pos - 50);
      const end = Math.min(lower.length, pos + anchor.length + 50);
      const window = lower.slice(start, end);
      const m = pattern.exec(window);
      if (m) return m;
      searchFrom = pos + 1;
    }
  }

  return null;
}

const ALLOWED_PATCH_FIELDS = new Set([
  'action',
  'reason',
  'whyItMatters',
  'competitorReference',
  'timeframe',
  'outcome',
]);
/** Subset of ALLOWED_PATCH_FIELDS where null is also valid. All others require a string. */
const NULLABLE_PATCH_FIELDS = new Set(['competitorReference']);

type ExistenceCheck =
  | {
      kind: 'list';
      signalPath: (b: Business) => string[] | null | undefined;
      keywords: string[];
      label: string;
    }
  | { kind: 'flag'; signalPath: (b: Business) => boolean; pattern: RegExp; label: string };

function signalAt(b: Business, dotted: string): unknown {
  const [bucket, key] = dotted.split('.');
  const sig = b.signals as Record<string, Record<string, unknown>> | null | undefined;
  return sig?.[bucket]?.[key];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildExistenceChecks(): ExistenceCheck[] {
  const checks: ExistenceCheck[] = [];
  for (const [dotted, label] of Object.entries(ARRAY_SIGNAL_LABELS)) {
    checks.push({
      kind: 'list',
      signalPath: (b) => signalAt(b, dotted) as string[] | null | undefined,
      keywords: LIST_VERBS,
      label,
    });
  }
  for (const [dotted, labels] of Object.entries(FLAG_SIGNAL_LABELS)) {
    const verbs = ADD_VERBS.map(escapeRe).join('|');
    const nouns = labels.map(escapeRe).join('|');
    checks.push({
      kind: 'flag',
      signalPath: (b) => signalAt(b, dotted) === true,
      // "add a contact form", "set up an online booking system", "create your FAQ page"
      pattern: new RegExp(`\\b(?:${verbs})\\b(?:\\s+\\w+){0,3}?\\s+(?:${nouns})\\b`, 'i'),
      label: labels[0],
    });
  }
  return checks;
}

const EXISTENCE_CHECKS: ExistenceCheck[] = buildExistenceChecks();

/**
 * Run fast, deterministic checks against priority actions to catch common
 * failure modes (unverified averages, recommending existing features,
 * score-vs-claim contradictions, internal contradictions) without an LLM call.
 * Returns an array of flags describing each issue found.
 */
function deterministicChecks(
  actions: PriorityAction[],
  own: Business,
  competitors: Business[],
): ValidationFlag[] {
  const flags: ValidationFlag[] = [];

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const text = [a.action, a.reason, a.whyItMatters, a.competitorReference, a.outcome]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    // (a) unverified_average — regex for average claims
    if (/competitors?\s+average|on average|industry average/.test(text)) {
      flags.push({
        actionIndex: i,
        type: 'unverified_average',
        detail: `Action "${a.action}" references an unverified average`,
      });
    }

    // (b) recommends_existing — check signals the business already has
    // Templates are trusted by construction; skip existence checks for them.
    if (a._source !== 'template') {
      let existenceFlags = 0;
      for (const check of EXISTENCE_CHECKS) {
        if (existenceFlags >= 2) break;

        if (check.kind === 'list') {
          const items = check.signalPath(own);
          if (!items?.length) continue;
          for (const item of items) {
            const escaped = item.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`(${check.keywords.join('|')})\\s+.*?${escaped}`, 'i');
            if (pattern.test(text)) {
              flags.push({
                actionIndex: i,
                type: 'recommends_existing',
                detail: `Recommends adding "${item}" but business already has it (signal: ${check.label})`,
              });
              existenceFlags++;
              break; // one flag per check — avoid duplicates from multi-item matches
            }
          }
        } else {
          // flag check: skip if business doesn't have this feature
          if (!check.signalPath(own)) continue;
          const m = check.pattern.exec(text);
          if (m) {
            flags.push({
              actionIndex: i,
              type: 'recommends_existing',
              detail: `Recommends "${m[0]}" but business already has it (signal: ${check.label})`,
            });
            existenceFlags++;
          }
        }
      }

      // (b2) evidence_mismatch — cited path exists but the value differs from the data
      for (const ev of Array.isArray(a.evidence) ? a.evidence : []) {
        const r = resolveEvidence(ev, own, competitors);
        if (!r.ok && r.reason === 'value_mismatch') {
          flags.push({
            actionIndex: i,
            type: 'evidence_mismatch',
            detail: `Cites "${ev}" but the data shows ${r.path}=${JSON.stringify(r.actual)}`,
          });
        }
      }
    }

    // (c) score_contradiction — high score but weakness language near competitor refs in whyItMatters
    const scoreField = CATEGORY_SCORE_MAP_FULL[a.category];
    if (scoreField && own.aiScore) {
      const score = own.aiScore[scoreField];
      if (typeof score === 'number' && score >= 85 && a.whyItMatters) {
        const compNames = competitors.map((c) => c.name);
        const weakMatch = matchesNearCompetitor(a.whyItMatters, WEAKNESS_RE, compNames);
        if (weakMatch) {
          const wim = a.whyItMatters.toLowerCase();
          const matchIdx = wim.indexOf(weakMatch[0].trim());
          const ctxStart = Math.max(0, matchIdx - 20);
          const ctxEnd = Math.min(wim.length, matchIdx + weakMatch[0].trim().length + 20);
          const context = wim.slice(ctxStart, ctxEnd);
          flags.push({
            actionIndex: i,
            type: 'score_contradiction',
            detail: `${a.category} score is ${score} (≥85) but whyItMatters uses weakness language ("...${context}...")`,
          });
        }
      }
    }

    // (d) self_contradiction — competitorReference weakness + whyItMatters strength
    if (a.competitorReference && a.whyItMatters) {
      const cr = a.competitorReference.toLowerCase();
      const wim = a.whyItMatters.toLowerCase();
      if (COMPETITOR_WEAKNESS_RE.test(cr) && STRENGTH_RE.test(wim)) {
        flags.push({
          actionIndex: i,
          type: 'self_contradiction',
          detail: `competitorReference implies weakness but whyItMatters implies strength`,
        });
      }
    }
  }

  return flags;
}

// Internal fields — never persisted or sent to clients.
function stripSource(actions: PriorityAction[]): PriorityAction[] {
  return actions.map(({ _source, evidence: _evidence, ...rest }) => rest);
}

/**
 * Hybrid validation: runs deterministic checks first, and only calls the LLM
 * when code-based checks find issues. When the LLM is needed, it receives only
 * the flagged actions and returns targeted patches rather than full rewrites.
 * Falls back to original actions if the LLM call fails.
 */
async function validateActionsHybrid(
  actions: PriorityAction[],
  own: Business,
  competitors: Business[],
): Promise<PriorityAction[]> {
  if (SKIP_AI || !actions.length) return stripSource(actions);
  const t0 = Date.now();

  const flags = deterministicChecks(actions, own, competitors);

  if (flags.length === 0) {
    logger.info('validator', 'No issues found, skipping LLM');
    logAIEvent({
      event: 'validation',
      model: AI_MODEL_SMART,
      success: true,
      durationMs: Date.now() - t0,
      flagsFound: 0,
    });
    return stripSource(actions);
  }

  logger.info('validator', 'Issues found, requesting LLM patches', { flags: flags.length });

  const flaggedIndices = Array.from(new Set(flags.map((f) => f.actionIndex)));
  const flaggedActions = flaggedIndices.map((i) => ({ index: i, action: actions[i] }));

  // Build a per-competitor snapshot tailored to the flagged categories.
  // This keeps the prompt tight while still giving the validator the data it
  // needs to fact-check — e.g. googleRating/reviewCount for Reviews flags,
  // aiPresenceScore for AI Visibility flags.
  const flaggedCategories = new Set(flaggedIndices.map((i) => actions[i].category));
  const relevantBuckets = new Set<keyof ExtractedSignals>();
  for (const cat of flaggedCategories) {
    for (const b of CATEGORY_SIGNAL_BUCKETS[cat] ?? []) relevantBuckets.add(b);
  }
  const competitorContext = competitors.map((c) => {
    const ctx: Record<string, unknown> = { name: c.name };
    if (c.signals && relevantBuckets.size > 0) {
      const scoped: Partial<ExtractedSignals> = {};
      for (const b of relevantBuckets) {
        if (c.signals[b] != null) (scoped as Record<string, unknown>)[b] = c.signals[b];
      }
      ctx.signals = scoped;
    }
    if (flaggedCategories.has('Reviews')) {
      ctx.googleRating = c.googleData?.googleRating ?? null;
      ctx.reviewCount = c.googleData?.reviewCount ?? null;
    }
    if (flaggedCategories.has('AI Visibility')) {
      ctx.aiPresenceScore = c.aiVisibility?.aiPresenceScore ?? null;
    }
    return ctx;
  });

  const prompt = `The following actions have been flagged by automated checks. Fix ONLY the flagged issues with minimal text changes. Keep the original meaning where possible. Do not invent new facts.

Flags:
${flags.map((f) => `- Action ${f.actionIndex} (${f.type}): ${f.detail}`).join('\n')}

Flagged actions:
${JSON.stringify(flaggedActions, null, 2)}

Own business signals: ${JSON.stringify(own.signals)}
Competitor context (scoped to flagged categories): ${JSON.stringify(competitorContext)}

Return JSON only. Each patch fixes one field on one action.
Allowed fields: action, reason, whyItMatters, competitorReference, timeframe, outcome.
newValue must be a string for all fields EXCEPT competitorReference, which may also be null.
Schema: {"patches":[{"actionIndex":0,"field":"string","newValue":"string|null"}]}`;

  try {
    const result = await askClaude<{
      patches: Array<{ actionIndex: number; field: string; newValue: string | null }>;
    }>(prompt, VALIDATION_PATCHES_SCHEMA, {
      maxTokens: 1500,
      system: SCOUTLY_FACT_CHECKER_SYSTEM,
      model: AI_MODEL_SMART,
    });
    const patched = actions.map((a) => ({ ...a }));

    for (const patch of result.patches) {
      if (patch.actionIndex < 0 || patch.actionIndex >= actions.length) {
        logger.warn('validator', 'Skipping patch: invalid index', {
          actionIndex: patch.actionIndex,
        });
        continue;
      }
      if (!ALLOWED_PATCH_FIELDS.has(patch.field)) {
        logger.warn('validator', 'Skipping patch: disallowed field', { field: patch.field });
        continue;
      }
      const isString = typeof patch.newValue === 'string';
      const isNull = patch.newValue === null;
      if (!isString && !(isNull && NULLABLE_PATCH_FIELDS.has(patch.field))) {
        logger.warn('validator', 'Skipping patch: null newValue not allowed for this field', {
          field: patch.field,
        });
        continue;
      }
      logger.info('validator', 'Patching action', {
        actionIndex: patch.actionIndex,
        field: patch.field,
      });
      (patched[patch.actionIndex] as Record<string, unknown>)[patch.field] = patch.newValue;
    }

    logAIEvent({
      event: 'validation',
      model: AI_MODEL_SMART,
      success: true,
      durationMs: Date.now() - t0,
      flagsFound: flags.length,
    });
    return stripSource(patched);
  } catch (e) {
    logAIEvent({
      event: 'validation',
      model: AI_MODEL_SMART,
      success: false,
      durationMs: Date.now() - t0,
      flagsFound: flags.length,
      errorType: errorTypeOf(e),
    });
    logger.warn('validator', 'LLM patch call failed, returning original actions', { error: e });
    return stripSource(actions);
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

// ── AI Visibility: types & helpers ──────────────────────────────────

type MatchConfidence = 'exact' | 'high' | 'medium' | 'low' | 'none';

const CONFIDENCE_TIERS = [
  'none',
  'low',
  'medium',
  'high',
  'exact',
] as const satisfies readonly MatchConfidence[];

// We require medium confidence (≥80% token overlap or substring match) to count
// as a mention. Low confidence (50-80% token overlap) is too noisy for businesses
// with common surname-based names like "Smith Plumbing."
const MENTION_CONFIDENCE_THRESHOLD: MatchConfidence = 'medium';

function meetsMentionThreshold(confidence: MatchConfidence): boolean {
  return (
    CONFIDENCE_TIERS.indexOf(confidence) >= CONFIDENCE_TIERS.indexOf(MENTION_CONFIDENCE_THRESHOLD)
  );
}

function normalizeStr(str: string): string {
  return str
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[.,\-–—:;!?()[\]{}]/g, ' ')
    .replace(/\b(ltd|limited|inc|llc|uk|the|and|&)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ask the fast model to extract a structured list of businesses from an AI
 * recommendation response. Returns [] on any failure so callers can fall back
 * gracefully.
 */
async function extractMentionedBusinesses(
  aiText: string,
): Promise<{ businesses: MentionedBusiness[]; cacheHit: boolean }> {
  const capped = aiText.slice(0, 6000);
  const hash = hashText(capped);

  const cached = mentionsCache.get(hash);
  if (cached) {
    logger.info('ai-presence', 'Mentions cache hit');
    return { businesses: cached, cacheHit: true };
  }

  const prompt = `Extract every business mentioned in the text below. Return JSON only.
Schema: {"businesses":[{"name":"string","position":1,"context":"recommended"|"mentioned"|"compared"|"dismissed"}]}
Rules:
- position: 1 = first mentioned, 2 = second, etc.
- context: "recommended" if the text endorses it, "mentioned" if neutral, "compared" if listed alongside others, "dismissed" if the text warns against it.
- Include only real LOCAL service businesses (salons, clinics, shops, providers).
- EXCLUDE product, cosmetic, and retail brands, manufacturers, and national chains (e.g. Elemis, OPI, Essie, Lycon, Clarins, Medik8), which are products a business uses, not local competitors.
- Exclude generic descriptions.

Text:\n${capped}`;

  try {
    const { businesses } = await askClaude<{ businesses: MentionedBusiness[] }>(
      prompt,
      MENTIONED_BUSINESSES_SCHEMA,
      { maxTokens: 1024 },
    );
    const result = Array.isArray(businesses) ? businesses : [];
    // Only cache successful extractions — don't cache empty fallbacks
    if (result.length > 0) {
      if (mentionsCache.size >= MENTIONS_CACHE_MAX) {
        const oldest = mentionsCache.keys().next().value!;
        mentionsCache.delete(oldest);
      }
      mentionsCache.set(hash, result);
    }
    return { businesses: result, cacheHit: false };
  } catch {
    return { businesses: [], cacheHit: false };
  }
}

/**
 * Score how confidently `target` matches one of the `mentioned` businesses.
 * Tiers: exact (normalised strings equal), high (substring containment),
 * medium (≥80% token overlap), low (≥50% token overlap), none.
 */
function matchBusinessName(
  target: string,
  mentioned: MentionedBusiness[],
): { confidence: MatchConfidence; match: MentionedBusiness | null } {
  const normTarget = normalizeStr(target);
  const targetTokens = normTarget.split(' ').filter((t) => t.length >= 2);

  let bestConfidence: MatchConfidence = 'none';
  let bestMatch: MentionedBusiness | null = null;

  for (const m of mentioned) {
    const normName = normalizeStr(m.name);
    let confidence: MatchConfidence = 'none';

    if (normName === normTarget) {
      confidence = 'exact';
    } else if (normName.includes(normTarget) || normTarget.includes(normName)) {
      confidence = 'high';
    } else {
      const mentionTokens = normName.split(' ').filter((t) => t.length >= 2);
      if (targetTokens.length > 0 && mentionTokens.length > 0) {
        const overlap = targetTokens.filter((t) => mentionTokens.includes(t)).length;
        const ratio = overlap / Math.max(targetTokens.length, mentionTokens.length);
        if (ratio >= 0.8) confidence = 'medium';
        else if (ratio >= 0.5) confidence = 'low';
      }
    }

    if (CONFIDENCE_TIERS.indexOf(confidence) > CONFIDENCE_TIERS.indexOf(bestConfidence)) {
      bestConfidence = confidence;
      bestMatch = m;
    }
    if (bestConfidence === 'exact') break;
  }

  return { confidence: bestConfidence, match: bestMatch };
}

/**
 * Like matchBusinessName but uses location proximity in the original AI text
 * to bump or penalise confidence. If location tokens appear within 200 chars
 * of the mention, confidence is bumped one tier. If confidence is low and
 * no location is nearby, it downgrades to none.
 */
function matchWithLocation(
  target: string,
  targetLocation: string,
  mentioned: MentionedBusiness[],
  fullText: string,
): { confidence: MatchConfidence; match: MentionedBusiness | null } {
  const result = matchBusinessName(target, mentioned);
  if (!result.match || result.confidence === 'none') return result;

  const locationTokens = normalizeStr(targetLocation)
    .split(' ')
    .filter((t) => t.length >= 2);
  const textLower = fullText.toLowerCase();
  const matchNameLower = result.match.name.toLowerCase();
  const namePos = textLower.indexOf(matchNameLower);

  let locationNearby = false;
  if (namePos >= 0 && locationTokens.length > 0) {
    const start = Math.max(0, namePos - 200);
    const end = Math.min(textLower.length, namePos + matchNameLower.length + 200);
    const window = textLower.slice(start, end);
    locationNearby = locationTokens.some((t) => window.includes(t));
  }

  let confidence: MatchConfidence = result.confidence;
  const tierIdx = CONFIDENCE_TIERS.indexOf(confidence);

  if (locationNearby && tierIdx < CONFIDENCE_TIERS.length - 1) {
    confidence = CONFIDENCE_TIERS[tierIdx + 1] as MatchConfidence;
  } else if (confidence === 'low' && !locationNearby) {
    confidence = 'none';
  }

  return { confidence, match: result.match };
}

/**
 * Check how visible a business is in AI recommendation responses.
 *
 * Matching strategy (for future maintainers):
 * 1. For each search query, get the AI's free-text response.
 * 2. Use a fast LLM call to extract a structured list of mentioned businesses.
 * 3. Match the target business against that list using normalised string
 *    comparison with confidence tiers (exact → high → medium → low → none).
 * 4. Location proximity within 200 chars of the mention bumps confidence by
 *    one tier; low confidence without location proximity drops to none.
 * 5. Only medium confidence or higher counts as a mention.
 * 6. Track position, recommended-vs-mentioned context, and which businesses
 *    appear ahead of the target in each response.
 */
export async function checkAIVisibility(
  primaryService: string,
  location: string,
  businessName: string,
  existingVisibility?: AIVisibility | null,
  serviceCategory?: ServiceCategory,
): Promise<AIVisibility | null> {
  if (SKIP_AI) {
    return {
      aiPresenceScore: 0,
      mentionCount: 0,
      totalPrompts: 0,
      tested_at: new Date().toISOString(),
      averagePosition: null,
      recommendedCount: 0,
      competitorsAhead: [],
    };
  }

  // Skip if already checked within the last 24 hours
  if (existingVisibility?.tested_at) {
    const lastTested = new Date(existingVisibility.tested_at).getTime();
    const hoursAgo = (Date.now() - lastTested) / (1000 * 60 * 60);
    if (hoursAgo < 24) {
      logger.info('ai-presence', 'Skipping — recently tested', { hoursAgo: hoursAgo.toFixed(1) });
      return null;
    }
  }

  const catConfig = serviceCategory ? SERVICE_CATEGORIES[serviceCategory] : null;
  const templates = catConfig?.aiQueryTemplates ?? GENERIC_AI_QUERY_TEMPLATES;
  const countryModifier = catConfig?.countryModifier ?? 'UK';
  // Use the category's natural search term ("beauty salon") rather than the raw
  // primary_service slug ("beauty") so queries read naturally and surface the
  // business. Falls back to the raw service when no category config exists.
  const serviceTerm = catConfig?.searchTerm ?? primaryService;

  const queries = templates.map((t) => {
    let q = t.replace(/\{service\}/g, serviceTerm).replace(/\{location\}/g, location);
    if (countryModifier) q += ` ${countryModifier}`;
    return q;
  });

  const t0 = Date.now();
  let mentionCount = 0;
  let recommendedCount = 0;
  let queryFailures = 0;
  let cacheHits = 0;
  let bestConfidence: MatchConfidence = 'none';
  const positions: number[] = [];
  const competitorsAheadSet = new Set<string>();

  for (const query of queries) {
    try {
      const result = await callLLMRaw(
        {
          model: AI_MODEL_SMART,
          max_tokens: 1000,
          system:
            'You are a helpful local business recommendation assistant. When asked about businesses in a specific area, provide specific real business names and brief descriptions. Always include specific names.',
          // Current web-search tool (dynamic filtering); requires Sonnet 4.6+ / Sonnet 5.
          tools: [{ type: 'web_search_20260209', name: 'web_search' }],
          messages: [{ role: 'user', content: query }],
        },
        { backoffMs: 10000, label: 'ai-presence' },
      );

      const aiText = result.content
        .filter((c) => c.type === 'text')
        .map((c) => (c as { type: 'text'; text: string }).text)
        .join('\n');

      logger.info('ai-presence', 'Query response', {
        query,
        textLength: aiText.length,
        snippet: aiText.slice(0, 200),
      });

      // Quick check: if no name tokens appear in the response, skip the
      // extractMentionedBusinesses AI call entirely. This is the common case
      // for businesses not mentioned and saves one Haiku call per query.
      const nameTokens = normalizeStr(businessName)
        .split(' ')
        .filter((t) => t.length >= 2);
      const textLower = aiText.toLowerCase();
      const hasAnyNameToken = nameTokens.some((t) => textLower.includes(t));

      if (!hasAnyNameToken) {
        logger.info('ai-presence', 'No name tokens in response, skipping extraction', { query });
        continue;
      }

      const { businesses, cacheHit } = await extractMentionedBusinesses(aiText);
      if (cacheHit) cacheHits++;
      const { confidence, match } = matchWithLocation(businessName, location, businesses, aiText);

      logger.info('ai-presence', 'Match', {
        confidence,
        name: match?.name ?? 'none',
        position: match?.position ?? '-',
      });

      if (CONFIDENCE_TIERS.indexOf(confidence) > CONFIDENCE_TIERS.indexOf(bestConfidence)) {
        bestConfidence = confidence;
      }

      if (meetsMentionThreshold(confidence) && match) {
        mentionCount++;
        positions.push(match.position);
        if (match.context === 'recommended') recommendedCount++;

        // Track businesses ranked ahead of the target — only those the AI actually
        // presented as alternatives (recommended/compared), so incidental product
        // or brand mentions don't show up as "competitors ahead".
        for (const m of businesses) {
          if (
            m.position < match.position &&
            (m.context === 'recommended' || m.context === 'compared')
          ) {
            competitorsAheadSet.add(m.name);
          }
        }
      }
    } catch (e) {
      queryFailures++;
      logger.warn('ai-presence', 'Query failed', { error: e });
    }
  }

  const total = queries.length;
  const allFailed = queryFailures === total;
  const rawPresenceScore = total > 0 ? Math.round((mentionCount / total) * 100) : 0;
  // Smooth sampling noise: the reported score is the mean of the last three runs.
  const runScores = [
    ...(existingVisibility?.runScores ?? []).slice(-(AI_PRESENCE_WINDOW - 1)),
    rawPresenceScore,
  ];
  const aiPresenceScore = Math.round(runScores.reduce((s, v) => s + v, 0) / runScores.length);
  const averagePosition =
    positions.length > 0
      ? Math.round((positions.reduce((sum, p) => sum + p, 0) / positions.length) * 10) / 10
      : null;

  logAIEvent({
    event: 'visibility',
    model: AI_MODEL_SMART,
    success: !allFailed,
    durationMs: Date.now() - t0,
    mentionConfidence: bestConfidence,
    cacheHits,
  });

  return {
    aiPresenceScore,
    rawPresenceScore,
    runScores,
    mentionCount,
    totalPrompts: total,
    tested_at: new Date().toISOString(),
    averagePosition,
    recommendedCount,
    competitorsAhead: Array.from(competitorsAheadSet),
  };
}

/** Number of runs averaged into the reported AI presence score. */
export const AI_PRESENCE_WINDOW = 3;
