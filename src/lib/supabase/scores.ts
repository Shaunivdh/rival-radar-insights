import type { SupabaseClient } from '@supabase/supabase-js';
import type { AIHealthScore } from '@/types';

export async function saveScoreSnapshot(
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
  businessId: string,
): Promise<number | null> {
  const { data: latest } = await supabase
    .from('score_snapshots')
    .select('overall_score, snapshot_at')
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
    .select('overall_score')
    .eq('business_id', businessId)
    .lt('snapshot_at', sixDaysBefore)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!previous) return null;

  return (latest.overall_score as number) - (previous.overall_score as number);
}
