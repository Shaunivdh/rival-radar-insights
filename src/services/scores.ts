import type { GoogleData, SerpData, AIVisibility, AIHealthScore, ExtractedSignals } from '@/types';

/**
 * Website health score derived from crawl signals.
 * Max 100, clamped to 0–100.
 */
export function computeWebsiteHealthScore(signals: ExtractedSignals | null): number {
  if (signals == null) return 0;
  const { seo, engagement } = signals;

  let score = 0;

  // +30: phone prominent or contact form above fold
  if (engagement.hasPhoneNumberProminent || engagement.hasContactForm) score += 30;
  // +20: CTA present
  if (engagement.hasCallToAction) score += 20;
  // +15: title tag and h1 set
  if (seo.title && seo.h1Tags.length > 0) score += 15;
  // +10: multi-page site (pageCount >= 3)
  if (seo.pageCount >= 3) score += 10;
  // +10: sitemap present
  if (seo.hasSitemap) score += 10;
  // +10: site assumed indexable (no noIndexed field available)
  score += 10;
  // +5: schema markup present
  if (seo.schemaMarkupTypes.length > 0) score += 5;

  // Deductions
  if (!engagement.hasPhoneNumberProminent && !engagement.hasContactForm) score -= 20;
  if (seo.h1Tags.length === 0) score -= 10;

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
 * Returns 50 (neutral) if no previous data.
 */
export function computeReviewVelocityScore(
  currentReviewCount: number,
  previousReviewCount?: number,
  daysBetween?: number
): number {
  if (previousReviewCount === undefined || daysBetween === undefined || daysBetween <= 0) return 50;
  const newReviews = Math.max(0, currentReviewCount - previousReviewCount);
  const velocityPer30d = (newReviews / daysBetween) * 30;
  return Math.min(100, Math.max(0, Math.round((velocityPer30d / 5) * 100)));
}

/**
 * Recompute overallScore from component scores using fixed weights.
 * Weights: reputation=0.25, localVisibility=0.25, websiteHealth=0.20,
 *          gbpCompleteness=0.15, aiPresence=0.10, reviewVelocity=0.05
 */
export function recomputeOverallScore(score: AIHealthScore): number {
  return Math.round(
    score.reputationScore * 0.25 +
    score.localVisibilityScore * 0.25 +
    score.websiteHealthScore * 0.20 +
    score.gbpCompletenessScore * 0.15 +
    score.aiPresenceScore * 0.10 +
    score.reviewVelocityScore * 0.05
  );
}

/**
 * Deterministic score calculation — no AI involved.
 * Weights: reputation=25, localVisibility=25, websiteHealth=20,
 *          gbpCompleteness=15, aiPresence=10, reviewVelocity=5
 */
export function calculateScores(
  googleData: GoogleData | null,
  serpData: SerpData | null,
  aiVisibility: AIVisibility | null,
  signals?: ExtractedSignals | null,
  previousReviewCount?: number,
  daysBetween?: number
): AIHealthScore {
  const reputationScore = computeReputationScore(googleData);

  let localVisibilityScore = 0;
  if (serpData != null) {
    const pos = serpData.localPackPosition;
    if (pos === 1) localVisibilityScore = 100;
    else if (pos === 2) localVisibilityScore = 80;
    else if (pos === 3) localVisibilityScore = 60;
    else if (pos !== null && pos >= 4 && pos <= 10) localVisibilityScore = 20;
  }

  const aiPresenceScore = aiVisibility?.aiPresenceScore ?? 0;
  const websiteHealthScore = computeWebsiteHealthScore(signals ?? null);
  const gbpCompletenessScore = computeGBPCompletenessScore(googleData);
  const reviewVelocityScore = computeReviewVelocityScore(
    googleData?.reviewCount ?? 0,
    previousReviewCount,
    daysBetween
  );

  const overallScore = Math.round(
    reputationScore * 0.25 +
    localVisibilityScore * 0.25 +
    websiteHealthScore * 0.20 +
    gbpCompletenessScore * 0.15 +
    aiPresenceScore * 0.10 +
    reviewVelocityScore * 0.05
  );

  return {
    overallScore,
    weeklyDelta: null,
    reputationScore,
    localVisibilityScore,
    websiteHealthScore,
    gbpCompletenessScore,
    aiPresenceScore,
    reviewVelocityScore,
    generatedAt: new Date().toISOString(),
  };
}
