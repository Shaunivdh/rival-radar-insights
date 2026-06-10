import type {
  GoogleData,
  SerpData,
  AIVisibility,
  AIHealthScore,
  ExtractedSignals,
  PageSpeedData,
} from '@/types';

/**
 * Website health score derived from crawl signals.
 * Max 100, clamped to 0–100.
 */
export function computeWebsiteHealthScore(
  signals: ExtractedSignals | null,
  pagespeedData?: PageSpeedData | null,
): number | null {
  if (signals == null) {
    // No crawl signals — but if we have PageSpeed data, we know a website exists
    if (pagespeedData) {
      const avg =
        (pagespeedData.mobile.performanceScore + pagespeedData.desktop.performanceScore) / 2;
      return Math.round((avg / 100) * 10); // 0–10 from PSI alone
    }
    return null; // null = crawl blocked AND no PSI, NOT a zero score
  }
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
    const avg =
      (pagespeedData.mobile.performanceScore + pagespeedData.desktop.performanceScore) / 2;
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
  prevReviewCount?: number,
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
 * Falls back to counting recentReviews timestamps within last 90 days when no historical data.
 * Applies a reply rate bonus (up to +20) when owners respond to reviews.
 * Returns null if no data at all (excluded from weighted average).
 */
export function computeReviewVelocityScore(
  currentReviewCount: number,
  previousReviewCount?: number,
  daysBetween?: number,
  recentReviews?: Array<{ time: number; ownerReply?: string }>,
): number | null {
  let base: number | null = null;

  if (previousReviewCount !== undefined && daysBetween !== undefined && daysBetween > 0) {
    const newReviews = Math.max(0, currentReviewCount - previousReviewCount);
    const velocityPer30d = (newReviews / daysBetween) * 30;
    base = Math.round((velocityPer30d / 5) * 100);
  } else if (recentReviews && recentReviews.length > 0) {
    const cutoff90 = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const count = recentReviews.filter((r) => r.time > cutoff90).length;
    const per30d = (count / 90) * 30;
    base = Math.round((per30d / 5) * 100);
  }

  if (base === null) return null;

  // Reply rate bonus: up to +20 points based on % of reviews with an owner reply
  let bonus = 0;
  if (recentReviews && recentReviews.length > 0) {
    const replyRate = recentReviews.filter((r) => r.ownerReply).length / recentReviews.length;
    bonus = Math.round(replyRate * 20);
  }

  return Math.min(100, Math.max(0, base + bonus));
}

/**
 * Recompute overallScore from component scores.
 * Mirrors calculateScores: null components are excluded and the weighted
 * average is renormalized over the available weights — never coerce
 * "unknown" to zero.
 */
export function recomputeOverallScore(score: AIHealthScore): number {
  const components: Array<{ score: number | null; weight: number }> = [
    { score: score.reputationScore, weight: 0.25 },
    { score: score.localVisibilityScore, weight: 0.25 },
    { score: score.websiteHealthScore, weight: 0.2 },
    { score: score.gbpCompletenessScore, weight: 0.15 },
    { score: score.aiPresenceScore, weight: 0.1 },
    { score: score.reviewVelocityScore, weight: 0.05 },
  ];

  const available = components.filter((c) => c.score !== null);
  const totalWeight = available.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight === 0) return 0;
  return Math.round(
    available.reduce((sum, c) => sum + c.score! * c.weight, 0) / totalWeight,
  );
}

/**
 * Deterministic score calculation — no AI involved.
 * Weights: reputation=25, localVisibility=25, websiteHealth=20,
 *          gbpCompleteness=15, aiPresence=10, reviewVelocity=5
 */
interface ScoreInput {
  googleData: GoogleData | null;
  serpData: SerpData | null;
  aiVisibility: AIVisibility | null;
  signals?: ExtractedSignals | null;
  previousReviewCount?: number;
  daysBetween?: number;
  pagespeedData?: PageSpeedData | null;
}

export function calculateScores(input: ScoreInput): AIHealthScore {
  const {
    googleData,
    serpData,
    aiVisibility,
    signals,
    previousReviewCount,
    daysBetween,
    pagespeedData,
  } = input;

  const reputationScore = computeReputationScore(googleData);

  let localVisibilityScore = 0;
  if (serpData != null) {
    const pos = serpData.localVisibilityPosition;
    // Granular 1–10 scoring; null = not found in top 10
    if (pos !== null && pos >= 1 && pos <= 10) {
      localVisibilityScore = Math.round(100 - (pos - 1) * 10);
    }
  }

  const aiPresenceScore = aiVisibility?.aiPresenceScore ?? null;
  const gbpCompletenessScore = computeGBPCompletenessScore(googleData);

  const websiteHealthScore = computeWebsiteHealthScore(signals ?? null, pagespeedData);
  const reviewVelocityScore = computeReviewVelocityScore(
    googleData?.reviewCount ?? 0,
    previousReviewCount,
    daysBetween,
    googleData?.recentReviews,
  );

  // Weighted average that EXCLUDES null components (unknown ≠ zero)
  const components: Array<{ score: number | null; weight: number }> = [
    { score: reputationScore, weight: 0.25 },
    { score: localVisibilityScore, weight: 0.25 },
    { score: websiteHealthScore, weight: 0.2 },
    { score: gbpCompletenessScore, weight: 0.15 },
    { score: aiPresenceScore, weight: 0.1 },
    { score: reviewVelocityScore, weight: 0.05 },
  ];

  const available = components.filter((c) => c.score !== null);
  const totalWeight = available.reduce((sum, c) => sum + c.weight, 0);
  const overallScore =
    totalWeight === 0
      ? 0
      : Math.round(available.reduce((sum, c) => sum + c.score! * c.weight, 0) / totalWeight);

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
