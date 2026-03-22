import type { GoogleData, SerpData, AIVisibility, AIHealthScore } from '@/types';

/**
 * Deterministic score calculation — no AI involved.
 * Component weights: googleRating=30, reviewCount=20, localPack=30, aiVisibility=20 (total 100).
 * If an input is null, its weight is excluded and remaining components are scaled proportionally.
 */
export function calculateScores(
  googleData: GoogleData | null,
  serpData: SerpData | null,
  aiVisibility: AIVisibility | null
): AIHealthScore {
  type Component = { score: number; weight: number };
  const components: Component[] = [];

  let googleRatingScore = 0;
  let reviewCountScore = 0;
  let localPackScore = 0;
  let aiVisibilityScore = 0;

  if (googleData != null) {
    googleRatingScore = (googleData.googleRating / 5) * 30;
    reviewCountScore = Math.min(googleData.reviewCount / 200, 1) * 20;
    components.push({ score: googleRatingScore, weight: 30 });
    components.push({ score: reviewCountScore, weight: 20 });
  }

  if (serpData != null) {
    const pos = serpData.localPackPosition;
    if (pos === 1) localPackScore = 30;
    else if (pos === 2) localPackScore = 24;
    else if (pos === 3) localPackScore = 18;
    else if (pos !== null && pos >= 4 && pos <= 10) localPackScore = 6;
    components.push({ score: localPackScore, weight: 30 });
  }

  if (aiVisibility != null) {
    aiVisibilityScore = aiVisibility.mentioned ? 20 : 0;
    components.push({ score: aiVisibilityScore, weight: 20 });
  }

  let overallScore = 0;
  if (components.length > 0) {
    const totalWeight = components.reduce((s, c) => s + c.weight, 0);
    const rawSum = components.reduce((s, c) => s + c.score, 0);
    overallScore = Math.round((rawSum / totalWeight) * 100);
  }

  return {
    overallScore,
    googleRatingScore: Math.round(googleRatingScore),
    reviewCountScore: Math.round(reviewCountScore),
    localPackScore,
    aiVisibilityScore,
    calculation_method: 'deterministic',
  };
}
