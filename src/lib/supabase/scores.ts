import type { AIHealthScore } from '@/types';
import type { TypedSupabaseClient } from './types';
import { recomputeOverallScore } from '@/services/scores';

/** AI presence only contributes to the weekly delta when its (smoothed) score moved at least this much. */
export const AI_PRESENCE_DELTA_THRESHOLD = 20;

const SNAPSHOT_COLS =
  'overall_score, snapshot_at, reputation_score, local_visibility_score, website_health_score, gbp_completeness_score, ai_presence_score, review_velocity_score';

type SnapshotRow = {
  overall_score: number;
  snapshot_at: string;
  reputation_score: number | null;
  local_visibility_score: number;
  website_health_score: number | null;
  gbp_completeness_score: number | null;
  ai_presence_score: number | null;
  review_velocity_score: number | null;
};

function toScore(r: SnapshotRow): AIHealthScore {
  return {
    overallScore: r.overall_score,
    weeklyDelta: null,
    reputationScore: r.reputation_score,
    localVisibilityScore: r.local_visibility_score,
    websiteHealthScore: r.website_health_score,
    gbpCompletenessScore: r.gbp_completeness_score,
    aiPresenceScore: r.ai_presence_score,
    reviewVelocityScore: r.review_velocity_score,
    generatedAt: r.snapshot_at,
  };
}

/**
 * Weekly delta with AI-presence sampling noise excluded: unless the AI presence
 * score moved by ≥ AI_PRESENCE_DELTA_THRESHOLD between the two snapshots, the
 * latest overall score is recomputed holding AI presence at its previous value.
 * Exported for unit tests.
 */
export function computeWeeklyDelta(latest: AIHealthScore, previous: AIHealthScore): number {
  const aiNow = latest.aiPresenceScore;
  const aiPrev = previous.aiPresenceScore;
  const aiMoved =
    aiNow !== null && aiPrev !== null && Math.abs(aiNow - aiPrev) >= AI_PRESENCE_DELTA_THRESHOLD;
  const bothKnown = aiNow !== null && aiPrev !== null;
  if (!bothKnown || aiMoved) return latest.overallScore - previous.overallScore;
  const held = recomputeOverallScore({ ...latest, aiPresenceScore: aiPrev });
  return held - previous.overallScore;
}

export async function saveScoreSnapshot(
  supabase: TypedSupabaseClient,
  businessId: string,
  scores: AIHealthScore,
): Promise<void> {
  await supabase.from('score_snapshots').insert({
    business_id: businessId,
    overall_score: scores.overallScore,
    reputation_score: scores.reputationScore,
    local_visibility_score: scores.localVisibilityScore,
    website_health_score: scores.websiteHealthScore,
    gbp_completeness_score: scores.gbpCompletenessScore,
    ai_presence_score: scores.aiPresenceScore,
    review_velocity_score: scores.reviewVelocityScore,
  });
}

/**
 * Returns (latestSnapshot.overallScore - previousSnapshot.overallScore)
 * where previousSnapshot.snapshot_at < latestSnapshot.snapshot_at - 6 days.
 * Returns null if no such previous snapshot exists.
 */
export async function getWeeklyDelta(
  supabase: TypedSupabaseClient,
  businessId: string,
): Promise<number | null> {
  const { data: latest } = await supabase
    .from('score_snapshots')
    .select(SNAPSHOT_COLS)
    .eq('business_id', businessId)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return null;

  const sixDaysBefore = new Date(
    new Date(latest.snapshot_at as string).getTime() - 6 * 86400000,
  ).toISOString();

  const { data: previous } = await supabase
    .from('score_snapshots')
    .select(SNAPSHOT_COLS)
    .eq('business_id', businessId)
    .lt('snapshot_at', sixDaysBefore)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!previous) return null;

  return computeWeeklyDelta(
    toScore(latest as unknown as SnapshotRow),
    toScore(previous as unknown as SnapshotRow),
  );
}
