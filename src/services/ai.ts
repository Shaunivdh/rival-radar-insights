import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import type { ExtractedSignals, PriorityAction, ChangeSummary, Business, ReviewSentiment, AIVisibility } from '@/types';
import { SERVICE_CATEGORIES, GENERIC_AI_QUERY_TEMPLATES } from '@/lib/serviceCategories';
import type { ServiceCategory } from '@/lib/serviceCategories';
import { withRetry } from '@/lib/aiRetry';
import { logAIEvent } from '@/lib/aiTelemetry';
import { applyTemplates, applyTemplatesWithHistory } from '@/lib/priorityTemplates';

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

// ── In-memory cache for extractMentionedBusinesses ───────────────────
const mentionsCache = new Map<string, MentionedBusiness[]>();
const MENTIONS_CACHE_MAX = 200;

function hashText(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

export function clearMentionsCache(): void {
  mentionsCache.clear();
}

const SKIP_AI = process.env.SKIP_AI_CALLS === 'true';

// Model defaults verified 2026-05-03 against:
// https://platform.claude.com/docs/en/about-claude/models/overview
// Model strings change over time. Re-verify against docs if you see
// 404 or invalid_model errors at runtime.
const AI_MODEL_FAST = process.env.AI_MODEL_FAST?.trim() || 'claude-haiku-4-5-20251001';
const AI_MODEL_SMART = process.env.AI_MODEL_SMART?.trim() || 'claude-sonnet-4-6';

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
  retryOpts?: { backoffMs?: number; label?: string }
): Promise<Anthropic.Message> {
  return withRetry(
    () => getClient().messages.create(params),
    { label: retryOpts?.label ?? 'callLLMRaw', ...(retryOpts?.backoffMs ? { backoffMs: retryOpts.backoffMs } : {}) }
  );
}

export async function extractPageSignals(html: string, prompt: string): Promise<Record<string, unknown>> {
  if (SKIP_AI) return {};
  const t0 = Date.now();
  const stripped = html
    .replace(/<script\b(?![^>]*type=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .slice(0, 24000);
  try {
    const msg = await callLLMRaw({
      model: AI_MODEL_FAST,
      max_tokens: 1024,
      messages: [{ role: 'user', content: `${prompt}\n\nHTML:\n${stripped}\n\nReturn JSON only, no markdown.` }],
    }, { label: 'extractPageSignals' });
    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const result = JSON.parse(json) as Record<string, unknown>;
    logAIEvent({ event: 'extract_signals', model: AI_MODEL_FAST, success: true, durationMs: Date.now() - t0 });
    return result;
  } catch (e) {
    logAIEvent({ event: 'extract_signals', model: AI_MODEL_FAST, success: false, durationMs: Date.now() - t0, errorType: (e as Error).name });
    console.warn('[extractPageSignals] failed:', e);
    return {};
  }
}

async function askClaude<T>(prompt: string, maxTokens = 512): Promise<T> {
  const msg = await callLLMRaw({
    model: AI_MODEL_FAST,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  }, { label: 'askClaude' });
  const text = (msg.content[0] as { type: string; text: string }).text.trim();
  const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  // Extract the outermost JSON array or object to strip trailing prose
  const match = json.match(/^(\s*[\[{][\s\S]*[\]}])/);
  return JSON.parse(match ? match[1] : json) as T;
}

export async function generateReviewSentiment(
  reviews: Array<{ rating: number; text: string }>
): Promise<ReviewSentiment | null> {
  if (SKIP_AI) return null;
  if (!reviews.length) return null;
  const texts = reviews
    .filter((r) => r.text?.trim())
    .slice(0, 20)
    .map((r) => `[${r.rating}★] ${r.text.trim()}`)
    .join('\n');
  if (!texts) return null;
  const t0 = Date.now();
  const prompt = `Analyse these customer reviews and return JSON only.
Schema: {"positiveThemes":["string","string","string"],"negativeThemes":["string","string","string"],"summary":"string"}
Rules: positiveThemes = top 3 praised topics (2-4 words each), negativeThemes = top 3 complaint topics (2-4 words each, empty array if none), summary = ≤15 words.
Reviews:\n${texts}`;
  try {
    const result = await askClaude<Omit<ReviewSentiment, 'generatedAt'>>(prompt);
    logAIEvent({ event: 'sentiment', model: AI_MODEL_FAST, success: true, durationMs: Date.now() - t0 });
    return { ...result, generatedAt: new Date().toISOString() };
  } catch (e) {
    logAIEvent({ event: 'sentiment', model: AI_MODEL_FAST, success: false, durationMs: Date.now() - t0, errorType: (e as Error).name });
    return null;
  }
}

/**
 * Generate the top 3 priority actions for a business.
 *
 * **Template-first pipeline:** Before calling the LLM, deterministic Tier-1
 * templates are evaluated against the business signals. Any templates that
 * fire fill priority slots first. If all 3 slots are filled by templates the
 * LLM call is skipped entirely. Otherwise the LLM is told which gaps are
 * already covered and asked to fill the remaining slots.
 */
export async function generatePriorityActions(own: Business, competitors: Business[], serviceCategory?: ServiceCategory): Promise<PriorityAction[]> {
  if (SKIP_AI) return [];

  // ── Tier-1 templates ────────────────────────────────────────────────
  const { actions: templateActions, firedIds } = applyTemplates(own);
  const templatesUsed = templateActions.length;

  if (templatesUsed >= 3) {
    console.log('[priority] 3 templates fired, skipping LLM');
    logAIEvent({ event: 'generation', model: AI_MODEL_FAST, success: true, durationMs: 0, serviceCategory, templatesUsed, templatesFired: firedIds });
    return await validateActionsHybrid(templateActions.slice(0, 3), own, competitors);
  }

  // ── Build LLM prompt for remaining slots ────────────────────────────
  const remainingSlots = 3 - templatesUsed;

  const catConfig = serviceCategory ? SERVICE_CATEGORIES[serviceCategory] : null;
  const industryFocus = catConfig
    ? `This is a ${catConfig.label} business. Prioritise actions that affect: ${catConfig.dashboardPriority.join(', ')}.`
    : '';

  const summariseBiz = (b: Business, isOwn = false) => ({
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
    signals: (!isOwn && b.enrichmentErrors?.crawl) ? null : b.signals,
  });

  const ownCrawlIssue = own.enrichmentErrors?.crawl
    ? '\nNote: There were issues crawling this business\'s website, so website-related data may be incomplete.'
    : '';

  const coveredNote = templatesUsed > 0
    ? `\nThese priority slots are already covered by automatic checks: ${templateActions.map(a => `"${a.action}"`).join(', ')}. Fill the remaining ${remainingSlots} slots with different gaps.\n`
    : '';

  const prompt = `You are Scoutly, an ongoing local business monitor. Based on this week's data, surface the TOP ${remainingSlots} most important actions this business should take right now.
${industryFocus ? `\n${industryFocus}\n` : ''}${ownCrawlIssue}${coveredNote}

AUDIENCE: The reader is a busy local business owner (plumber, café owner, IT shop, small clinic). They are not a marketer. They have 5 minutes. Write like a friendly advisor, not a consultant.

TONE RULES:
- Plain English only. No SEO jargon (no "schema markup", "structured data", "alt tags", "SERP", "CTR"). If you must reference a technical thing, describe what it does in plain words (e.g. "helps search engines understand your services" not "schema markup").
- Write like you're speaking directly to the owner. "You" not "the business."
- No editorialising in parentheses like "(good)" or "(nice work)". Keep it clean.
- No filler phrases like "this gap compounds over time" or "category-wide gap" — say what to do and why.

DATA INTEGRITY RULES (critical — violations break user trust):
- Every claim about a competitor MUST be directly verifiable in the data provided. Do not invent averages, trends, or competitor behaviours not present in the signals.
- Do not claim "competitors average X" unless you have computed it from the actual data. Instead reference specific named competitors.
- Never contradict yourself within a single action: if competitorReference says "velocity 0" then reason/whyItMatters cannot say "competitors maintain strong velocity."
- If the own business already has something (e.g. an accreditation listed in signals), do NOT recommend adding it. Recommend displaying it more prominently instead.
- Re-read the own business signals before finalising each action. If the gap you're describing doesn't exist in the data, pick a different gap.

PRIORITISATION RULES:
- Return exactly ${remainingSlots} action${remainingSlots > 1 ? 's' : ''}, not more. ${remainingSlots < 3 ? `(${templatesUsed} slot${templatesUsed > 1 ? 's are' : ' is'} already filled by automatic checks.)` : 'Three forces real prioritisation.'}
- Only include an action if it reflects a genuine gap. If the business is already strong in a category (score ≥ 85 and no specific deficit in the data), do not invent a problem there.
- Do not include "low impact" actions in the top 3. Every action must have estimatedImpact of "high" or "medium".
- Each action must address a genuinely different gap — no two from the same root cause or category unless the gaps are clearly distinct.

Field rules:
- action: conversational headline describing the gap in plain English, max 10 words
- reason: ≤15-word plain-English summary of the gap
- whyItMatters: 2–3 sentences. Reference actual score values from the data. Name specific competitors when citing them — never "competitors average X" unless you show the math.
- steps: 3–5 specific, doable action items the owner can start this week. Each step is plain English. Be concrete (specific platform names, specific pages).
- outcome: 4–8 word goal statement
- effort: 'low' (< 1 hour), 'medium' (1 day), or 'high' (1+ week)
- category: one of "AI Visibility" | "Reviews" | "Local SEO" | "Website" | "Trust" | "Conversion"
- timeframe: realistic time-to-result
- competitorReference: plain-English note naming a specific competitor and what they have that this business lacks, or null. Must be consistent with whyItMatters.

Priority numbering: Unique integers 1–${remainingSlots} ordered by impact. No gaps, no duplicates.

Schema (JSON array only, no markdown):
[{"priority":1,"category":"string","effort":"low"|"medium"|"high","action":"string","reason":"string","whyItMatters":"string","steps":["string"],"outcome":"string","competitorReference":"string|null","estimatedImpact":"high"|"medium","timeframe":"string"}]

Own business: ${JSON.stringify(summariseBiz(own, true))}
Competitors: ${JSON.stringify(competitors.map(b => summariseBiz(b, false)))}`;

  const tokensPerSlot = 833;
  const maxTokens = remainingSlots * tokensPerSlot;

  const t0 = Date.now();
  try {
    const llmActions = await generateWithDistributionCheck(prompt, own.aiScore, 'generatePriorityActions', maxTokens);

    // Combine: templates first, then LLM actions, renumber 1–3
    const combined = [...templateActions, ...llmActions.slice(0, remainingSlots).map(a => ({ ...a, _source: 'llm' as const }))]
      .slice(0, 3)
      .map((a, i) => ({ ...a, priority: (i + 1) as PriorityAction['priority'] }));

    logAIEvent({ event: 'generation', model: AI_MODEL_FAST, success: true, durationMs: Date.now() - t0, serviceCategory, templatesUsed, templatesFired: firedIds });
    return await validateActionsHybrid(combined, own, competitors);
  } catch (e) {
    logAIEvent({ event: 'generation', model: AI_MODEL_FAST, success: false, durationMs: Date.now() - t0, serviceCategory, templatesUsed, templatesFired: firedIds, errorType: (e as Error).name });
    console.warn('[generatePriorityActions] failed:', e);
    throw new AIUnavailableError(e);
  }
}

/** Map action categories to their corresponding score field on AIHealthScore. */
const CATEGORY_SCORE_MAP_FULL: Record<string, keyof NonNullable<Business['aiScore']>> = {
  'Reviews': 'reputationScore',
  'Local SEO': 'localVisibilityScore',
  'Website': 'websiteHealthScore',
  'Trust': 'gbpCompletenessScore',
  'AI Visibility': 'aiPresenceScore',
  'Conversion': 'websiteHealthScore',
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
  ownScores: NonNullable<Business['aiScore']> | null
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

function sortTop3(raw: PriorityAction[]): PriorityAction[] {
  return raw
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3)
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
  maxTokens = 2500
): Promise<PriorityAction[]> {
  let sorted = sortTop3(await askClaude<PriorityAction[]>(prompt, maxTokens));

  const dist = checkCategoryDistribution(sorted, ownScores);
  if (dist.shouldRegenerate) {
    const dupeNote = dist.overrepresented
      .map(cat => {
        const field = CATEGORY_SCORE_MAP_FULL[cat];
        const score = field && ownScores ? ownScores[field] : '?';
        const count = sorted.filter(a => a.category === cat).length;
        return `${count} actions in the "${cat}" category, but this business already scores ${score} there`;
      })
      .join('; ');
    console.log(`[${label}] over-represented categories detected (${dist.overrepresented.join(', ')}), regenerating once`);

    const retryPrompt = prompt + `\n\nPREVIOUS ATTEMPT DUPLICATE: Your last attempt returned ${dupeNote}. Pick at least 2 different categories for the 3 actions.`;
    sorted = sortTop3(await askClaude<PriorityAction[]>(retryPrompt, maxTokens));

    const retryDist = checkCategoryDistribution(sorted, ownScores);
    if (retryDist.shouldRegenerate) {
      console.warn(`[${label}] regeneration still has duplicate categories (${retryDist.overrepresented.join(', ')}), proceeding anyway`);
    }
  }

  return sorted;
}

interface ValidationFlag {
  actionIndex: number;
  type: 'unverified_average' | 'recommends_existing' | 'score_contradiction' | 'self_contradiction';
  detail: string;
}

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
  competitorNames: string[]
): RegExpMatchArray | null {
  const lower = text.toLowerCase();
  const anchors = ['competitor', 'competitors', 'rival', 'rivals',
    ...competitorNames.map(n => n.toLowerCase())];

  for (const anchor of anchors) {
    let searchFrom = 0;
    // eslint-disable-next-line no-constant-condition
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

const ALLOWED_PATCH_FIELDS = new Set(['action', 'reason', 'whyItMatters', 'competitorReference', 'timeframe', 'outcome']);

type ExistenceCheck =
  | { kind: 'list'; signalPath: (b: Business) => string[] | null | undefined; keywords: string[]; label: string }
  | { kind: 'flag'; signalPath: (b: Business) => boolean; phrases: string[]; label: string };

const EXISTENCE_CHECKS: ExistenceCheck[] = [
  {
    kind: 'list',
    signalPath: (b) => b.signals?.trust?.accreditations,
    keywords: ['add', 'get', 'obtain', 'pursue'],
    label: 'accreditation',
  },
  {
    kind: 'list',
    signalPath: (b) => b.signals?.content?.servicesListed,
    keywords: ['add', 'offer', 'list'],
    label: 'service',
  },
  {
    kind: 'flag',
    signalPath: (b) => Boolean(b.signals?.engagement?.hasBookingSystem),
    phrases: ['add online booking', 'set up booking', 'enable booking'],
    label: 'booking system',
  },
  {
    kind: 'flag',
    signalPath: (b) => Boolean(b.signals?.engagement?.hasPhoneNumberProminent),
    phrases: ['add a phone number', 'add your phone', 'display a phone'],
    label: 'phone number',
  },
];

/**
 * Run fast, deterministic checks against priority actions to catch common
 * failure modes (unverified averages, recommending existing features,
 * score-vs-claim contradictions, internal contradictions) without an LLM call.
 * Returns an array of flags describing each issue found.
 */
function deterministicChecks(
  actions: PriorityAction[],
  own: Business,
  competitors: Business[]
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
      flags.push({ actionIndex: i, type: 'unverified_average', detail: `Action "${a.action}" references an unverified average` });
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
              flags.push({ actionIndex: i, type: 'recommends_existing', detail: `Recommends adding "${item}" but business already has it (signal: ${check.label})` });
              existenceFlags++;
              break; // one flag per check — avoid duplicates from multi-item matches
            }
          }
        } else {
          // flag check: skip if business doesn't have this feature
          if (!check.signalPath(own)) continue;
          for (const phrase of check.phrases) {
            if (text.includes(phrase.toLowerCase())) {
              flags.push({ actionIndex: i, type: 'recommends_existing', detail: `Recommends adding "${phrase}" but business already has it (signal: ${check.label})` });
              existenceFlags++;
              break; // one flag per check — avoid duplicates from multi-phrase matches
            }
          }
        }
      }
    }

    // (c) score_contradiction — high score but weakness language near competitor refs in whyItMatters
    const scoreField = CATEGORY_SCORE_MAP_FULL[a.category];
    if (scoreField && own.aiScore) {
      const score = own.aiScore[scoreField];
      if (typeof score === 'number' && score >= 85 && a.whyItMatters) {
        const compNames = competitors.map(c => c.name);
        const weakMatch = matchesNearCompetitor(a.whyItMatters, WEAKNESS_RE, compNames);
        if (weakMatch) {
          const wim = a.whyItMatters.toLowerCase();
          const matchIdx = wim.indexOf(weakMatch[0].trim());
          const ctxStart = Math.max(0, matchIdx - 20);
          const ctxEnd = Math.min(wim.length, matchIdx + weakMatch[0].trim().length + 20);
          const context = wim.slice(ctxStart, ctxEnd);
          flags.push({ actionIndex: i, type: 'score_contradiction', detail: `${a.category} score is ${score} (≥85) but whyItMatters uses weakness language ("...${context}...")` });
        }
      }
    }

    // (d) self_contradiction — competitorReference weakness + whyItMatters strength
    if (a.competitorReference && a.whyItMatters) {
      const cr = a.competitorReference.toLowerCase();
      const wim = a.whyItMatters.toLowerCase();
      if (COMPETITOR_WEAKNESS_RE.test(cr) && STRENGTH_RE.test(wim)) {
        flags.push({ actionIndex: i, type: 'self_contradiction', detail: `competitorReference implies weakness but whyItMatters implies strength` });
      }
    }
  }

  return flags;
}

// Internal field — never sent to clients.
function stripSource(actions: PriorityAction[]): PriorityAction[] {
  return actions.map(({ _source, ...rest }) => rest);
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
  competitors: Business[]
): Promise<PriorityAction[]> {
  if (SKIP_AI || !actions.length) return stripSource(actions);
  const t0 = Date.now();

  const flags = deterministicChecks(actions, own, competitors);

  if (flags.length === 0) {
    console.log('[validator] no issues found, skipping LLM');
    logAIEvent({ event: 'validation', model: AI_MODEL_FAST, success: true, durationMs: Date.now() - t0, flagsFound: 0 });
    return stripSource(actions);
  }

  console.log(`[validator] ${flags.length} issue(s) found, requesting LLM patches`);

  const flaggedIndices = Array.from(new Set(flags.map(f => f.actionIndex)));
  const flaggedActions = flaggedIndices.map(i => ({ index: i, action: actions[i] }));

  const prompt = `You are a fact-checker for Scoutly reports. The following actions have been flagged by automated checks. Fix ONLY the flagged issues with minimal text changes.

Flags:
${flags.map(f => `- Action ${f.actionIndex} (${f.type}): ${f.detail}`).join('\n')}

Flagged actions:
${JSON.stringify(flaggedActions, null, 2)}

Own business signals: ${JSON.stringify(own.signals)}
Competitor signals: ${JSON.stringify(competitors.map(c => ({ name: c.name, signals: c.signals })))}

Return JSON only. Each patch fixes one field on one action. Allowed fields: action, reason, whyItMatters, competitorReference, timeframe, outcome.
Schema: {"patches":[{"actionIndex":0,"field":"string","newValue":"string"}]}`;

  try {
    const result = await askClaude<{ patches: Array<{ actionIndex: number; field: string; newValue: string }> }>(prompt, 1500);
    const patched = actions.map(a => ({ ...a }));

    for (const patch of result.patches) {
      if (patch.actionIndex < 0 || patch.actionIndex >= actions.length) {
        console.warn(`[validator] skipping patch: invalid index ${patch.actionIndex}`);
        continue;
      }
      if (!ALLOWED_PATCH_FIELDS.has(patch.field)) {
        console.warn(`[validator] skipping patch: disallowed field "${patch.field}"`);
        continue;
      }
      if (typeof patch.newValue !== 'string' && patch.newValue !== null) {
        console.warn(`[validator] skipping patch: invalid newValue type for field "${patch.field}"`);
        continue;
      }
      console.log(`[validator] patching action ${patch.actionIndex}.${patch.field}`);
      (patched[patch.actionIndex] as Record<string, unknown>)[patch.field] = patch.newValue;
    }

    logAIEvent({ event: 'validation', model: AI_MODEL_FAST, success: true, durationMs: Date.now() - t0, flagsFound: flags.length });
    return stripSource(patched);
  } catch (e) {
    logAIEvent({ event: 'validation', model: AI_MODEL_FAST, success: false, durationMs: Date.now() - t0, flagsFound: flags.length, errorType: (e as Error).name });
    console.warn('[validator] LLM patch call failed, returning original actions:', e);
    return stripSource(actions);
  }
}

export async function generatePriorityActionsWithHistory(
  own: Business,
  competitors: Business[],
  previousActions: PriorityAction[],
  previousSignals: ExtractedSignals | null,
  currentSignals: ExtractedSignals,
  serviceCategory?: ServiceCategory
): Promise<PriorityAction[]> {
  if (SKIP_AI) return [];

  // ── Tier-1 templates (with continuity awareness) ─────────────────────
  const { actions: templateActions, firedIds: firedIds2, closedFromLastWeek } = applyTemplatesWithHistory(own, previousActions);
  const templatesUsed = templateActions.length;

  if (templatesUsed >= 3) {
    console.log('[priority] 3 templates fired, skipping LLM (with-history)');
    // If there are closed items from last week, acknowledge in first template's whyItMatters
    if (closedFromLastWeek.length > 0) {
      const win = closedFromLastWeek[0];
      templateActions[0] = {
        ...templateActions[0],
        whyItMatters: `Last week you closed "${win}" — that gap is gone. ${templateActions[0].whyItMatters}`,
      };
    }
    logAIEvent({ event: 'generation', model: AI_MODEL_FAST, success: true, durationMs: 0, serviceCategory, templatesUsed, templatesFired: firedIds2 });
    return await validateActionsHybrid(templateActions.slice(0, 3), own, competitors);
  }

  const remainingSlots = 3 - templatesUsed;

  const catConfig = serviceCategory ? SERVICE_CATEGORIES[serviceCategory] : null;
  const industryFocus = catConfig
    ? `This is a ${catConfig.label} business. Prioritise actions affecting: ${catConfig.dashboardPriority.join(', ')}.`
    : '';

  const summariseBiz = (b: Business, isOwn = false) => ({
    name: b.name,
    scores: b.aiScore ? {
      overall: b.aiScore.overallScore,
      reputation: b.aiScore.reputationScore,
      localSEO: b.aiScore.localVisibilityScore,
      websiteQuality: b.aiScore.websiteHealthScore,
      gbpCompleteness: b.aiScore.gbpCompletenessScore,
      reviewVelocity: b.aiScore.reviewVelocityScore,
    } : null,
    signals: (!isOwn && b.enrichmentErrors?.crawl) ? null : b.signals,
  });

  const changedSignals: Record<string, { before: unknown; after: unknown }> = {};
  if (previousSignals) {
    for (const key of Object.keys(currentSignals) as (keyof ExtractedSignals)[]) {
      if (JSON.stringify(previousSignals[key]) !== JSON.stringify(currentSignals[key])) {
        changedSignals[key] = { before: previousSignals[key], after: currentSignals[key] };
      }
    }
  }

  const coveredNote = templatesUsed > 0
    ? `\nThese priority slots are already covered by automatic checks: ${templateActions.map(a => `"${a.action}"`).join(', ')}. Fill the remaining ${remainingSlots} slots with different gaps.\n`
    : '';

  const closedNote = closedFromLastWeek.length > 0
    ? `\nClosed since last week: ${closedFromLastWeek.map(h => `"${h}"`).join(', ')}. The first action's continuityNote should briefly acknowledge one of these wins.\n`
    : '';

  const prompt = `You are Scoutly, continuing an ongoing conversation with a local business owner. Last week you gave them 3 actions. This week, decide what to tell them next.

${industryFocus}
${coveredNote}${closedNote}
AUDIENCE & TONE: Plain English, direct, no jargon, speaking to a busy owner.

CONTINUITY RULES (this is what makes the product feel alive):
- Acknowledge what changed since last week. If a previous action was completed (signal improved), explicitly celebrate it in the first line of the first action.
- If a previous action was NOT completed (signal unchanged), you may repeat it — but reframe it as "still worth doing" with updated context, not as a fresh discovery.
- If nothing changed at all, say so honestly and keep actions steady rather than reshuffling for the sake of it.
- Never contradict last week's baseline. If last week said "you have no accreditations" and this week's data shows three, the report must acknowledge that.
- CONTINUITY ACKNOWLEDGEMENT: If a category appeared in last week's actions but is absent this week, the FIRST action's continuityNote (or whyItMatters) must briefly acknowledge what the user fixed. Example: "Last week you added a booking system — that gap is closed. Here's the next priority." Do not silently drop a previous action without naming the win. The user needs to feel their work was noticed.

DATA INTEGRITY RULES:
- Every competitor claim must be directly in the data. No invented averages.
- Never contradict yourself inside a single action.
- Do not recommend adding something the business already has.

INTERNAL COHERENCE CHECK (do this before returning):
- Read each whyItMatters as a paragraph. If two sentences within it appear to contradict (e.g. "score is 0" and "completeness is 85%"), explain the relationship in plain words rather than presenting them as competing facts. If you cannot reconcile them, drop the conflicting reference.
- If competitorReference does not name a specific competitor doing a specific thing better, set it to null. Do not pad it with generic tips.

Return exactly ${remainingSlots} action${remainingSlots > 1 ? 's' : ''}. Every action must have estimatedImpact "high" or "medium".${templatesUsed > 0 ? ` (${templatesUsed} slot${templatesUsed > 1 ? 's are' : ' is'} already filled by automatic checks.)` : ''}

Previous week's actions: ${JSON.stringify(previousActions.map(a => ({ action: a.action, category: a.category, reason: a.reason })))}

What changed in this business's signals since last week: ${Object.keys(changedSignals).length ? JSON.stringify(changedSignals) : '(nothing changed)'}

Schema (JSON array only, no markdown):
[{"priority":1,"category":"string","effort":"low"|"medium"|"high","action":"string","reason":"string","whyItMatters":"string","steps":["string"],"outcome":"string","competitorReference":"string|null","estimatedImpact":"high"|"medium","timeframe":"string","continuityNote":"string|null"}]

continuityNote: short optional sentence like "You completed last week's portfolio action" or "Still outstanding from last week" or null for genuinely new items.

Own business: ${JSON.stringify(summariseBiz(own, true))}
Competitors: ${JSON.stringify(competitors.map(b => summariseBiz(b, false)))}`;

  const tokensPerSlot = 833;
  const maxTokens = remainingSlots * tokensPerSlot;

  const t0 = Date.now();
  try {
    const sorted = await generateWithDistributionCheck(prompt, own.aiScore, 'generatePriorityActionsWithHistory', maxTokens);

    // Combine: templates first, then LLM actions, renumber 1–3
    const combined = [...templateActions, ...sorted.slice(0, remainingSlots).map(a => ({ ...a, _source: 'llm' as const }))]
      .slice(0, 3)
      .map((a, i) => ({ ...a, priority: (i + 1) as PriorityAction['priority'] }));

    logAIEvent({ event: 'generation', model: AI_MODEL_FAST, success: true, durationMs: Date.now() - t0, serviceCategory, templatesUsed, templatesFired: firedIds2 });
    return await validateActionsHybrid(combined, own, competitors);
  } catch (e) {
    logAIEvent({ event: 'generation', model: AI_MODEL_FAST, success: false, durationMs: Date.now() - t0, serviceCategory, templatesUsed, templatesFired: firedIds2, errorType: (e as Error).name });
    console.warn('[generatePriorityActionsWithHistory] failed:', e);
    throw new AIUnavailableError(e);
  }
}


export async function generateChangeSummary(
  name: string,
  before: ExtractedSignals,
  after: ExtractedSignals,
  isCompetitor: boolean
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
    return { hasSignificantChanges: false, severity: 'low', summary: 'No changes detected this scan.', changes: [] };
  }

  const framing = isCompetitor
    ? `You are a competitive intelligence assistant. A competitor called "${name}" has made changes to their website. Your job is to tell the business owner what changed and why it matters to them — frame it as an opportunity or a threat, in plain English. Be direct and advisory.`
    : `You are a website monitoring assistant. The business owner's own website ("${name}") has changed since the last scan. Your job is to clearly describe what changed and flag anything that could help or hurt their online presence. Be concise and helpful.`;

  const prompt = `${framing}

Return JSON only.
Schema: {"hasSignificantChanges":boolean,"severity":"high"|"medium"|"low","summary":"string","changes":[{"category":"string","description":"string","significance":"string","actionItem":"string|null"}]}

Rules:
- summary: max 20 words, plain English, written as if speaking to the business owner
- description: explain the change and why it matters, not just what changed
- significance: one of "high" | "medium" | "low"
- actionItem: a plain-English next step the business owner should take (max 20 words, no jargon). For competitors: frame as an opportunity or threat response (e.g. "Add your pricing page before they take that traffic"). For own site: frame as a win to build on or a fix (e.g. "Add customer photos to the new page to build trust faster"). null only if no action is needed.
- severity: high = directly affects leads/rankings/trust, medium = noticeable improvement/regression, low = minor
- If the "Before" value is null/empty, describe the change as "newly added" not "changed from X." Only describe a change from a specific value if that value is clearly present in the Before data.
- Max 5 changes

Before: ${JSON.stringify(changedBefore)}
After: ${JSON.stringify(changedAfter)}`;

  try {
    const result = await askClaude<ChangeSummary>(prompt);
    logAIEvent({ event: 'change_summary', model: AI_MODEL_FAST, success: true, durationMs: Date.now() - t0 });
    return result;
  } catch (e) {
    logAIEvent({ event: 'change_summary', model: AI_MODEL_FAST, success: false, durationMs: Date.now() - t0, errorType: (e as Error).name });
    console.warn('[generateChangeSummary] failed:', e);
    throw new AIUnavailableError(e);
  }
}

// ── AI Visibility: types & helpers ──────────────────────────────────

type MatchConfidence = 'exact' | 'high' | 'medium' | 'low' | 'none';

const CONFIDENCE_TIERS = ['none', 'low', 'medium', 'high', 'exact'] as const satisfies readonly MatchConfidence[];

// We require medium confidence (≥80% token overlap or substring match) to count
// as a mention. Low confidence (50-80% token overlap) is too noisy for businesses
// with common surname-based names like "Smith Plumbing."
const MENTION_CONFIDENCE_THRESHOLD: MatchConfidence = 'medium';

function meetsMentionThreshold(confidence: MatchConfidence): boolean {
  return CONFIDENCE_TIERS.indexOf(confidence) >= CONFIDENCE_TIERS.indexOf(MENTION_CONFIDENCE_THRESHOLD);
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
async function extractMentionedBusinesses(aiText: string): Promise<{ businesses: MentionedBusiness[]; cacheHit: boolean }> {
  const capped = aiText.slice(0, 6000);
  const hash = hashText(capped);

  const cached = mentionsCache.get(hash);
  if (cached) {
    console.log('[ai-presence] mentions cache hit');
    return { businesses: cached, cacheHit: true };
  }

  const prompt = `Extract every business mentioned in the text below. Return JSON only.
Schema: [{"name":"string","position":1,"context":"recommended"|"mentioned"|"compared"|"dismissed"}]
Rules:
- position: 1 = first mentioned, 2 = second, etc.
- context: "recommended" if the text endorses it, "mentioned" if neutral, "compared" if listed alongside others, "dismissed" if the text warns against it.
- Include only real business names, not generic descriptions.

Text:\n${capped}`;

  try {
    const result = await askClaude<MentionedBusiness[]>(prompt, 512);
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
  mentioned: MentionedBusiness[]
): { confidence: MatchConfidence; match: MentionedBusiness | null } {
  const normTarget = normalizeStr(target);
  const targetTokens = normTarget.split(' ').filter(t => t.length >= 2);

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
      const mentionTokens = normName.split(' ').filter(t => t.length >= 2);
      if (targetTokens.length > 0 && mentionTokens.length > 0) {
        const overlap = targetTokens.filter(t => mentionTokens.includes(t)).length;
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
  fullText: string
): { confidence: MatchConfidence; match: MentionedBusiness | null } {
  const result = matchBusinessName(target, mentioned);
  if (!result.match || result.confidence === 'none') return result;

  const locationTokens = normalizeStr(targetLocation).split(' ').filter(t => t.length >= 2);
  const textLower = fullText.toLowerCase();
  const matchNameLower = result.match.name.toLowerCase();
  const namePos = textLower.indexOf(matchNameLower);

  let locationNearby = false;
  if (namePos >= 0 && locationTokens.length > 0) {
    const start = Math.max(0, namePos - 200);
    const end = Math.min(textLower.length, namePos + matchNameLower.length + 200);
    const window = textLower.slice(start, end);
    locationNearby = locationTokens.some(t => window.includes(t));
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
      aiPresenceScore: 0, mentionCount: 0, totalPrompts: 0,
      tested_at: new Date().toISOString(),
      averagePosition: null, recommendedCount: 0, competitorsAhead: [],
    };
  }

  // Skip if already checked within the last 24 hours
  if (existingVisibility?.tested_at) {
    const lastTested = new Date(existingVisibility.tested_at).getTime();
    const hoursAgo = (Date.now() - lastTested) / (1000 * 60 * 60);
    if (hoursAgo < 24) {
      console.log(`[ai-presence] skipping — last tested ${hoursAgo.toFixed(1)}h ago`);
      return null;
    }
  }

  const catConfig = serviceCategory ? SERVICE_CATEGORIES[serviceCategory] : null;
  const templates = catConfig?.aiQueryTemplates ?? GENERIC_AI_QUERY_TEMPLATES;
  const countryModifier = catConfig?.countryModifier ?? 'UK';

  const queries = templates.map(t => {
    let q = t.replace(/\{service\}/g, primaryService).replace(/\{location\}/g, location);
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
      const result = await callLLMRaw({
          model: AI_MODEL_SMART,
          max_tokens: 1000,
          system: 'You are a helpful local business recommendation assistant. When asked about businesses in a specific area, provide specific real business names and brief descriptions. Always include specific names.',
          tools: [{ type: 'web_search_20250305', name: 'web_search' }] as unknown as Anthropic.MessageCreateParamsNonStreaming['tools'],
          messages: [{ role: 'user', content: query }],
        }, { backoffMs: 10000, label: 'ai-presence' });

      const aiText = result.content
        .filter((c) => c.type === 'text')
        .map((c) => (c as { type: 'text'; text: string }).text)
        .join('\n');

      console.log(`[ai-presence] query="${query}" textLength=${aiText.length} snippet="${aiText.slice(0, 200)}"`);

      const { businesses, cacheHit } = await extractMentionedBusinesses(aiText);
      if (cacheHit) cacheHits++;
      const { confidence, match } = matchWithLocation(businessName, location, businesses, aiText);

      console.log(`[ai-presence] match confidence="${confidence}" name="${match?.name ?? 'none'}" position=${match?.position ?? '-'}`);

      if (CONFIDENCE_TIERS.indexOf(confidence) > CONFIDENCE_TIERS.indexOf(bestConfidence)) {
        bestConfidence = confidence;
      }

      if (meetsMentionThreshold(confidence) && match) {
        mentionCount++;
        positions.push(match.position);
        if (match.context === 'recommended') recommendedCount++;

        // Track businesses mentioned before the target
        for (const m of businesses) {
          if (m.position < match.position) {
            competitorsAheadSet.add(m.name);
          }
        }
      }
    } catch (e) {
      queryFailures++;
      console.warn('[ai-presence] query failed:', e);
    }
  }

  const total = queries.length;
  const allFailed = queryFailures === total;
  const aiPresenceScore = total > 0 ? Math.round((mentionCount / total) * 100) : 0;
  const averagePosition = positions.length > 0
    ? Math.round((positions.reduce((sum, p) => sum + p, 0) / positions.length) * 10) / 10
    : null;

  logAIEvent({ event: 'visibility', model: AI_MODEL_SMART, success: !allFailed, durationMs: Date.now() - t0, mentionConfidence: bestConfidence, cacheHits });

  return {
    aiPresenceScore,
    mentionCount,
    totalPrompts: total,
    tested_at: new Date().toISOString(),
    averagePosition,
    recommendedCount,
    competitorsAhead: Array.from(competitorsAheadSet),
  };
}
