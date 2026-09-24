import type { Business } from '@/types';

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
