import { createHash } from 'crypto';
import type { AIVisibility } from '@/types';
import { SERVICE_CATEGORIES, GENERIC_AI_QUERY_TEMPLATES } from '@/lib/serviceCategories';
import type { ServiceCategory } from '@/lib/serviceCategories';
import { logAIEvent } from '@/lib/aiTelemetry';
import { MENTIONED_BUSINESSES_SCHEMA } from '../aiSchemas';
import { logger } from '@/lib/logger';
import { AI_MODEL_SMART, SKIP_AI, askClaude, callLLMRaw } from './client';

interface MentionedBusiness {
  name: string;
  position: number;
  context: 'recommended' | 'mentioned' | 'compared' | 'dismissed';
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
