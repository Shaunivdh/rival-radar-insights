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

type Summary = ReturnType<typeof summariseBiz>;

/**
 * Prompt payload for the competitor-insight call: the same shape as
 * summariseBiz (so evidence paths still resolve), but with every signal the
 * business shares with all of its competitors removed. Identical fields carry
 * no competitive insight and were most of the input tokens.
 */
export function summariseForInsight(
  own: Business,
  competitors: Business[],
): { own: Summary; competitors: Summary[] } {
  const ownView = summariseBiz(own, true);
  const compViews = competitors.map((c) => summariseBiz(c, false));
  const ownSignals = ownView.signals as Record<string, Record<string, unknown>> | null;
  if (!ownSignals)
    return { own: ownView, competitors: compViews.map((c) => ({ ...c, signals: null })) };

  const keep = (bucket: string, key: string) =>
    compViews.some((c) => {
      const cs = c.signals as Record<string, Record<string, unknown>> | null;
      return (
        cs?.[bucket] != null &&
        JSON.stringify(cs[bucket][key]) !== JSON.stringify(ownSignals[bucket]?.[key])
      );
    });

  const trim = (signals: Summary['signals']) => {
    const s = signals as Record<string, Record<string, unknown>> | null;
    if (!s) return null;
    const out: Record<string, Record<string, unknown>> = {};
    for (const [bucket, fields] of Object.entries(s)) {
      if (!fields) continue;
      const kept = Object.fromEntries(Object.entries(fields).filter(([k]) => keep(bucket, k)));
      if (Object.keys(kept).length) out[bucket] = kept;
    }
    return out as unknown as Summary['signals'];
  };

  return {
    own: { ...ownView, signals: trim(ownView.signals) },
    competitors: compViews.map((c) => ({ ...c, signals: trim(c.signals) })),
  };
}
