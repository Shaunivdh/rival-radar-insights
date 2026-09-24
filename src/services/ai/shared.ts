import type { Business } from '@/types';

// ── Shared prompt scaffolding ───────────────────────────────────────
// Keep first-run and weekly-history prompts aligned so quality cannot
// regress between scans. Edit these constants, not the call sites.

export const SCOUTLY_SYSTEM = `You are Scoutly, an ongoing competitor-intelligence advisor for local business owners.
Hard rules you never break:
1. Return valid JSON matching the schema in the user prompt. No markdown, no prose outside JSON.
2. Every factual claim must be directly verifiable in the data provided. Do not invent averages, rankings, trends, traffic, or competitor behaviours.
3. Do not recommend adding something the business's own signals already show they have.
4. Never contradict yourself within a single field or between fields.
5. Plain English. Speak to the owner directly. No SEO jargon.
6. UK English spelling and phrasing throughout (organise, colour, personalise, enquiry).
7. Never use dash punctuation in any text you output: no em dashes, no en dashes, no hyphen used as a dash, and no dashes in number ranges (write "2 to 3 hours", not "2-3 hours"). Use a comma, colon, semicolon, or a new sentence instead. Hyphens inside ordinary compound words ("plain-English", "top-rated") are fine.`;

/** Map action categories to their corresponding score field on AIHealthScore. */
export const CATEGORY_SCORE_MAP_FULL: Record<string, keyof NonNullable<Business['aiScore']>> = {
  Reviews: 'reputationScore',
  'Local SEO': 'localVisibilityScore',
  Website: 'websiteHealthScore',
  Trust: 'gbpCompletenessScore',
  'AI Visibility': 'aiPresenceScore',
  Conversion: 'websiteHealthScore',
};

/** Single canonical business summariser used by both first-run and history prompts. */
export function summariseBiz(b: Business, isOwn = false) {
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
