import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedSignals, PriorityAction, ChangeSummary, Business, ReviewSentiment, AIVisibility } from '@/types';
import { SERVICE_CATEGORIES } from '@/lib/serviceCategories';
import type { ServiceCategory } from '@/lib/serviceCategories';

const SKIP_AI = process.env.SKIP_AI_CALLS === 'true';
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
      model: 'claude-haiku-4-5-20251001',
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
        model: 'claude-haiku-4-5-20251001',
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
  return JSON.parse(json) as T;
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

  const summariseBiz = (b: Business) => ({
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
    signals: b.signals,
  });

  const prompt = `You are Scoutly, an ongoing local business monitor. Based on this week's data, surface the 5 most important actions this business should take right now.
${industryFocus ? `\n${industryFocus}\n` : ''}
Rules — read carefully before generating:
- Only recommend actions based on confirmed gaps visible in the data. Do not infer or assume.
- Never say "you likely qualify" or "if you have" — only act on what the data confirms.
- Each action must address a different gap — no two from the same root cause.
- Write like a monitor that noticed something, not an analyst writing a report.
- No SEO jargon. Plain English only.

Field rules:
- action: conversational headline describing the gap in plain English, max 10 words (e.g. "AI assistants don't know you exist")
- reason: ≤15-word plain-English summary of the gap (used in compact views)
- whyItMatters: 2–3 sentences explaining the business impact. Reference specific score data where available (e.g. "Your AI presence score is 42/100 — you appeared in 3 out of 10 test prompts."). Mention competitors if relevant.
- steps: array of 3–5 specific, immediately doable action items the owner can start this week. Each step is a plain-English sentence. No jargon. Be concrete (e.g. specific platform names, page types).
- outcome: 4–8 word goal statement (e.g. "Appear in AI-powered recommendations")
- effort: 'low' (< 1 hour), 'medium' (1 day), or 'high' (1+ week)
- category: one of "AI Visibility" | "Reviews" | "Local SEO" | "Website" | "Trust" | "Conversion"
- timeframe: realistic time-to-result (e.g. "2–4 weeks", "4–8 weeks")
- competitorReference: plain-English note about what a named competitor has that this business lacks, or null

Priority numbering (critical — violations break the product):
- Unique integers 1–5, no duplicates, no gaps, ordered by impact

Schema (JSON array only, no markdown):
[{"priority":1,"category":"string","effort":"low"|"medium"|"high","action":"string","reason":"string","whyItMatters":"string","steps":["string"],"outcome":"string","competitorReference":"string|null","estimatedImpact":"high"|"medium"|"low","timeframe":"string"}]

Own business: ${JSON.stringify(summariseBiz(own))}
Competitors: ${JSON.stringify(competitors.map(summariseBiz))}`;

  try {
    const actions = await askClaude<PriorityAction[]>(prompt, 3000);
    // Guarantee unique, sequential priority numbers regardless of model output
    return actions
      .sort((a, b) => a.priority - b.priority)
      .map((action, i) => ({ ...action, priority: (i + 1) as PriorityAction['priority'] }));
  } catch (e) {
    console.warn('[generatePriorityActions] failed:', e);
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
            model: 'claude-sonnet-4-6',
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
