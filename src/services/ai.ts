import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedSignals, PriorityAction, ChangeSummary, Business, ReviewSentiment, AIVisibility } from '@/types';
import { SERVICE_CATEGORIES } from '@/lib/serviceCategories';
import type { ServiceCategory } from '@/lib/serviceCategories';

const SKIP_AI = process.env.SKIP_AI_CALLS === 'true';
const AI_MODEL_FAST = process.env.AI_MODEL_FAST ?? 'claude-haiku-4-5-20251001';
const AI_MODEL_SMART = process.env.AI_MODEL_SMART ?? 'claude-sonnet-4-6';
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export async function extractPageSignals(html: string, prompt: string): Promise<Record<string, unknown>> {
  if (SKIP_AI) return {};
  const stripped = html
    .replace(/<script\b(?![^>]*type=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .slice(0, 24000);
  try {
    const msg = await getClient().messages.create({
      model: AI_MODEL_FAST,
      max_tokens: 1024,
      messages: [{ role: 'user', content: `${prompt}\n\nHTML:\n${stripped}\n\nReturn JSON only, no markdown.` }],
    });
    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(json) as Record<string, unknown>;
  } catch (e) {
    console.warn('[extractPageSignals] failed:', e);
    return {};
  }
}

async function askClaude<T>(prompt: string, maxTokens = 512): Promise<T> {
  let msg: Anthropic.Message | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 5000));
    try {
      msg = await getClient().messages.create({
        model: AI_MODEL_FAST,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
      break;
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 429 && attempt < 2) { console.warn(`[askClaude] 429 rate limit, retry ${attempt + 1}/3`); continue; }
      throw e;
    }
  }
  if (!msg) throw new Error('[askClaude] all retries exhausted');
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
  const prompt = `Analyse these customer reviews and return JSON only.
Schema: {"positiveThemes":["string","string","string"],"negativeThemes":["string","string","string"],"summary":"string"}
Rules: positiveThemes = top 3 praised topics (2-4 words each), negativeThemes = top 3 complaint topics (2-4 words each, empty array if none), summary = ≤15 words.
Reviews:\n${texts}`;
  try {
    const result = await askClaude<Omit<ReviewSentiment, 'generatedAt'>>(prompt);
    return { ...result, generatedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

export async function generatePriorityActions(own: Business, competitors: Business[], serviceCategory?: ServiceCategory): Promise<PriorityAction[]> {
  if (SKIP_AI) return [];

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
    // For competitors with crawl errors, omit signals to avoid recommendations based on incomplete data.
    // For own business with crawl errors, still include signals but add a note below.
    signals: (!isOwn && b.enrichmentErrors?.crawl) ? null : b.signals,
  });

  const ownCrawlIssue = own.enrichmentErrors?.crawl
    ? '\nNote: There were issues crawling this business\'s website, so website-related data may be incomplete.'
    : '';

  const prompt = `You are Scoutly, an ongoing local business monitor. Based on this week's data, surface the TOP 3 most important actions this business should take right now.
${industryFocus ? `\n${industryFocus}\n` : ''}${ownCrawlIssue}

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
- Return exactly 3 actions, not 5. Three forces real prioritisation.
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

Priority numbering: Unique integers 1, 2, 3 ordered by impact. No gaps, no duplicates.

Schema (JSON array only, no markdown):
[{"priority":1,"category":"string","effort":"low"|"medium"|"high","action":"string","reason":"string","whyItMatters":"string","steps":["string"],"outcome":"string","competitorReference":"string|null","estimatedImpact":"high"|"medium","timeframe":"string"}]

Own business: ${JSON.stringify(summariseBiz(own, true))}
Competitors: ${JSON.stringify(competitors.map(b => summariseBiz(b, false)))}`;

  try {
    const raw = await askClaude<PriorityAction[]>(prompt, 2500);
    const sorted = raw
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 3)
      .map((action, i) => ({ ...action, priority: (i + 1) as PriorityAction['priority'] }));
    return await validateActions(sorted, own, competitors);
  } catch (e) {
    console.warn('[generatePriorityActions] failed:', e);
    return [];
  }
}

async function validateActions(
  actions: PriorityAction[],
  own: Business,
  competitors: Business[]
): Promise<PriorityAction[]> {
  if (SKIP_AI || !actions.length) return actions;

  const prompt = `You are a fact-checker for Scoutly reports. Below are 3 recommended actions for a business owner, plus the underlying data.

For each action, check:
1. Does the competitorReference contradict the whyItMatters or reason field? (e.g. saying competitors are strong in one place but weak in another)
2. Does the action recommend adding something the business already has in its signals?
3. Are all competitor claims verifiable in the data provided?
4. Does any whyItMatters paragraph contain two sentences that appear to contradict each other (e.g. one score described as good, another as failing, without explanation)? If so, rewrite to clarify the relationship or drop the weaker reference.
5. Does each timeframe field match the outcome's implied horizon? (If outcome says "per quarter," timeframe shouldn't be "4–8 weeks.") Fix mismatches.

Return JSON only:
{"actions": []}

If an action is clean, return it unchanged. If it has a contradiction, rewrite the offending field minimally to resolve it. Preserve priority numbers and all other fields.

Actions: ${JSON.stringify(actions)}
Own business signals: ${JSON.stringify(own.signals)}
Competitor signals: ${JSON.stringify(competitors.map(c => ({ name: c.name, signals: c.signals })))}`;

  try {
    const result = await askClaude<{ actions: PriorityAction[] }>(prompt, 2500);
    return result.actions;
  } catch (e) {
    console.warn('[validateActions] failed, returning original:', e);
    return actions;
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

  const prompt = `You are Scoutly, continuing an ongoing conversation with a local business owner. Last week you gave them 3 actions. This week, decide what to tell them next.

${industryFocus}

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

Return exactly 3 actions. Every action must have estimatedImpact "high" or "medium".

Previous week's actions: ${JSON.stringify(previousActions.map(a => ({ action: a.action, category: a.category, reason: a.reason })))}

What changed in this business's signals since last week: ${Object.keys(changedSignals).length ? JSON.stringify(changedSignals) : '(nothing changed)'}

Schema (JSON array only, no markdown):
[{"priority":1,"category":"string","effort":"low"|"medium"|"high","action":"string","reason":"string","whyItMatters":"string","steps":["string"],"outcome":"string","competitorReference":"string|null","estimatedImpact":"high"|"medium","timeframe":"string","continuityNote":"string|null"}]

continuityNote: short optional sentence like "You completed last week's portfolio action" or "Still outstanding from last week" or null for genuinely new items.

Own business: ${JSON.stringify(summariseBiz(own, true))}
Competitors: ${JSON.stringify(competitors.map(b => summariseBiz(b, false)))}`;

  try {
    const actions = await askClaude<PriorityAction[]>(prompt, 2500);
    return actions
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 3)
      .map((action, i) => ({ ...action, priority: (i + 1) as PriorityAction['priority'] }));
  } catch (e) {
    console.warn('[generatePriorityActionsWithHistory] failed:', e);
    return [];
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
    return await askClaude<ChangeSummary>(prompt);
  } catch (e) {
    console.warn('[generateChangeSummary] failed:', e);
    return { hasSignificantChanges: false, severity: 'low', summary: '', changes: [] };
  }
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

function fuzzyMatch(text: string, bizName: string): boolean {
  const normText = normalizeStr(text);
  const normBiz = normalizeStr(bizName);
  if (normText.includes(normBiz)) return true;
  const bizWords = normBiz.split(' ').filter((w) => w.length >= 3);
  if (bizWords.length === 0) return false;
  const textWords = normText.split(' ');
  for (let i = 0; i <= textWords.length - bizWords.length; i++) {
    const chunk = textWords.slice(i, i + bizWords.length + 3).join(' ');
    if (bizWords.every((w) => chunk.includes(w))) return true;
  }
  return false;
}

export async function checkAIVisibility(
  primaryService: string,
  location: string,
  businessName: string,
  existingVisibility?: AIVisibility | null,
): Promise<AIVisibility | null> {
  if (SKIP_AI) {
    return { aiPresenceScore: 0, mentionCount: 0, totalPrompts: 0, tested_at: new Date().toISOString() };
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

  const queries = [
    `Best ${primaryService} in ${location} UK`,
    `Top ${primaryService} near ${location} UK`,
    `Recommended ${primaryService} ${location} UK`,
  ];

  let mentionCount = 0;

  for (const query of queries) {
    try {
      let result: Anthropic.Message | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 10000));
        try {
          result = await getClient().messages.create({
            model: AI_MODEL_SMART,
            max_tokens: 1000,
            system: 'You are a helpful local business recommendation assistant. When asked about businesses in a specific area, provide specific real business names and brief descriptions. Always include specific names.',
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages: [{ role: 'user', content: query }],
          });
          break;
        } catch (e: unknown) {
          const status = (e as { status?: number }).status;
          if (status === 429) { console.warn(`[ai-presence] 429 rate limit, retry ${attempt + 1}/3`); continue; }
          throw e;
        }
      }
      if (!result) continue;

      const aiText = result.content
        .filter((c) => c.type === 'text')
        .map((c) => (c as { type: 'text'; text: string }).text)
        .join('\n');

      console.log(`[ai-presence] query="${query}" textLength=${aiText.length} snippet="${aiText.slice(0, 200)}"`);
      if (fuzzyMatch(aiText, businessName)) {
        mentionCount++;
        console.log(`[ai-presence] matched "${businessName}" in response`);
      }
    } catch (e) {
      console.warn('[ai-presence] query failed:', e);
    }
  }

  const total = queries.length;
  const aiPresenceScore = total > 0 ? Math.round((mentionCount / total) * 100) : 0;

  return { aiPresenceScore, mentionCount, totalPrompts: total, tested_at: new Date().toISOString() };
}
