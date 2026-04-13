import type { GoogleData, SerpData, AIVisibility, AIHealthScore, ExtractedSignals, PageSpeedData, TrustpilotData } from '@/types';

/**
 * Website health score derived from crawl signals.
 * Max 100, clamped to 0–100.
 */
export function computeWebsiteHealthScore(
  signals: ExtractedSignals | null,
  pagespeedData?: PageSpeedData | null
): number | null {
  if (signals == null) return null;  // null = crawl blocked, NOT a zero score
  const { seo, engagement } = signals;

  let score = 0;

  // +30: phone prominent or contact form above fold
  if (engagement.hasPhoneNumberProminent || engagement.hasContactForm) score += 30;
  // +20: CTA present
  if (engagement.hasCallToAction) score += 20;
  // +15: title tag and h1 set
  if (seo.title && seo.h1Tags.length > 0) score += 15;
  // +10: sitemap present
  if (seo.hasSitemap) score += 10;
  // +10: site assumed indexable (no noIndexed field available)
  score += 10;
  // +5: schema markup present
  if (seo.schemaMarkupTypes.length > 0) score += 5;
  // +0–10: PSI performance bonus (avg of mobile + desktop, scaled)
  if (pagespeedData) {
    const avg = (pagespeedData.mobile.performanceScore + pagespeedData.desktop.performanceScore) / 2;
    score += Math.round((avg / 100) * 10);
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Reputation score: weighted combination of rating and review count.
 * Base: (rating/5) × log10(reviewCount+1) / log10(201), normalized 0–1, scaled to 0–100.
 * Recency boost: ×1.1 (capped at 100) if googleData has recent reviews within 30 days and count is growing
 * — pass optional prevReviewCount to enable boost.
 */
export function computeReputationScore(
  googleData: GoogleData | null,
  prevReviewCount?: number
): number {
  if (googleData == null) return 0;
  const { googleRating, reviewCount, recentReviews } = googleData;
  const ratingFactor = (googleRating / 5) ** 2;
  const base = ratingFactor * (Math.log10(reviewCount + 1) / Math.log10(201));
  let score = Math.min(base, 1);

  const thirtyDaysAgo = Date.now() - 30 * 86400000;
  const hasRecentReview = recentReviews.some((r) => r.time >= thirtyDaysAgo);
  const isGrowing = prevReviewCount !== undefined && reviewCount > prevReviewCount;
  if (hasRecentReview && isGrowing) {
    score = Math.min(score * 1.1, 1);
  }

  return Math.round(score * 100);
}

/**
 * GBP completeness score: 100 points max across 9 fields.
 */
export function computeGBPCompletenessScore(googleData: GoogleData | null): number {
  if (googleData == null) return 0;
  let score = 0;
  if (googleData.googleRating) score += 10;
  if (googleData.reviewCount > 0) score += 10;
  if (googleData.address) score += 10;
  if (googleData.phoneNumber) score += 15;
  if (googleData.openingHours && googleData.openingHours.length > 0) score += 15;
  if (googleData.photos > 0) score += 15;
  if (googleData.priceLevel !== null && googleData.priceLevel !== undefined) score += 5;
  if (googleData.description) score += 10;
  if (googleData.website) score += 10;
  return score;
}

/**
 * Review velocity score: new reviews per 30 days, scaled so 5/30d = 100.
 * Falls back to counting recentReviews timestamps within last 30 days when no historical data.
 * Returns null if no data at all (excluded from weighted average).
 */
export function computeReviewVelocityScore(
  currentReviewCount: number,
  previousReviewCount?: number,
  daysBetween?: number,
  recentReviews?: Array<{ time: number }>
): number | null {
  if (previousReviewCount !== undefined && daysBetween !== undefined && daysBetween > 0) {
    const newReviews = Math.max(0, currentReviewCount - previousReviewCount);
    const velocityPer30d = (newReviews / daysBetween) * 30;
    return Math.min(100, Math.max(0, Math.round((velocityPer30d / 5) * 100)));
  }
  if (recentReviews && recentReviews.length > 0) {
    const cutoff90 = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const count = recentReviews.filter((r) => r.time > cutoff90).length;
    const per30d = (count / 90) * 30;
    return Math.min(100, Math.max(0, Math.round((per30d / 5) * 100)));
  }
  return null;
}

/**
 * Recompute overallScore from component scores using fixed weights.
 * reviewVelocity split: Google 2.5% + Trustpilot 2.5% (if available).
 * If trustpilotVelocityScore is null, Google gets the full 5%.
 */
export function recomputeOverallScore(score: AIHealthScore): number {
  const hasTP = score.trustpilotVelocityScore !== null && score.trustpilotVelocityScore !== undefined;
  return Math.round(
    score.reputationScore * 0.25 +
    score.localVisibilityScore * 0.25 +
    score.websiteHealthScore * 0.20 +
    score.gbpCompletenessScore * 0.15 +
    score.aiPresenceScore * 0.10 +
    score.reviewVelocityScore * (hasTP ? 0.025 : 0.05) +
    (hasTP ? score.trustpilotVelocityScore! * 0.025 : 0)
  );
}

/**
 * Deterministic score calculation — no AI involved.
 * Weights: reputation=25, localVisibility=25, websiteHealth=20,
 *          gbpCompleteness=15, aiPresence=10, reviewVelocity=2.5 (Google) + 2.5 (Trustpilot)
 */
export function calculateScores(
  googleData: GoogleData | null,
  serpData: SerpData | null,
  aiVisibility: AIVisibility | null,
  signals?: ExtractedSignals | null,
  previousReviewCount?: number,
  daysBetween?: number,
  pagespeedData?: PageSpeedData | null,
  trustpilotData?: TrustpilotData | null,
  previousTrustpilotReviewCount?: number,
  trustpilotDaysBetween?: number,
): AIHealthScore {
  const reputationScore = computeReputationScore(googleData);

  let localVisibilityScore = 0;
  if (serpData != null) {
    const pos = serpData.localVisabilityPosition;
    // Granular 1–10 scoring; null = not found in top 10
    if (pos !== null && pos >= 1 && pos <= 10) {
      localVisibilityScore = Math.round(100 - (pos - 1) * 10);
    }
  }

  const aiPresenceScore = aiVisibility?.aiPresenceScore ?? 0;
  const gbpCompletenessScore = computeGBPCompletenessScore(googleData);

  const websiteHealthScore = computeWebsiteHealthScore(signals ?? null, pagespeedData);
  const reviewVelocityScore = computeReviewVelocityScore(
    googleData?.reviewCount ?? 0,
    previousReviewCount,
    daysBetween,
    googleData?.recentReviews
  );

  const trustpilotVelocityScore = trustpilotData?.trustpilotReviewCount != null
    ? computeReviewVelocityScore(
        trustpilotData.trustpilotReviewCount,
        previousTrustpilotReviewCount,
        trustpilotDaysBetween,
        trustpilotData.recentTrustpilotReviews
          .map((r) => ({ time: new Date(r.date).getTime() }))
          .filter((r) => !isNaN(r.time))
      )
    : null;

  // Weighted average that EXCLUDES null components (unknown ≠ zero)
  // reviewVelocity split 0.05 → Google 0.025 + Trustpilot 0.025
  const components: Array<{ score: number | null; weight: number }> = [
    { score: reputationScore,         weight: 0.25 },
    { score: localVisibilityScore,    weight: 0.25 },
    { score: websiteHealthScore,      weight: 0.20 },
    { score: gbpCompletenessScore,    weight: 0.15 },
    { score: aiPresenceScore,         weight: 0.10 },
    { score: reviewVelocityScore,     weight: 0.025 },
    { score: trustpilotVelocityScore, weight: 0.025 },
  ];

  const available = components.filter((c) => c.score !== null);
  const totalWeight = available.reduce((sum, c) => sum + c.weight, 0);
  const overallScore = totalWeight === 0
    ? 0
    : Math.round(
        available.reduce((sum, c) => sum + c.score! * c.weight, 0) / totalWeight
      );

  return {
    overallScore,
    weeklyDelta: null,
    reputationScore,
    localVisibilityScore,
    websiteHealthScore: websiteHealthScore ?? 0,
    gbpCompletenessScore,
    aiPresenceScore,
    reviewVelocityScore: reviewVelocityScore ?? 0,
    trustpilotVelocityScore,
    generatedAt: new Date().toISOString(),
  };
}
