import type { TypedSupabaseClient } from './types';
import { DAY_MS, REVIEW_WINDOW_DAYS, reviewGrowth, type ReviewGrowth } from '@/lib/reviewGrowth';

/**
 * Review growth for one business over the last REVIEW_WINDOW_DAYS, from the
 * google_data history: the last row at or before the window start plus every
 * row inside it. Null when there are fewer than two fetches.
 */
export async function fetchReviewGrowth(
  db: TypedSupabaseClient,
  businessId: string,
  now = Date.now(),
): Promise<ReviewGrowth | null> {
  const windowStart = new Date(now - REVIEW_WINDOW_DAYS * DAY_MS).toISOString();
  const [{ data: before }, { data: inside }] = await Promise.all([
    db
      .from('google_data')
      .select('review_count, fetched_at')
      .eq('business_id', businessId)
      .lte('fetched_at', windowStart)
      .order('fetched_at', { ascending: false })
      .limit(1),
    db
      .from('google_data')
      .select('review_count, fetched_at')
      .eq('business_id', businessId)
      .gt('fetched_at', windowStart)
      .order('fetched_at', { ascending: true }),
  ]);
  return reviewGrowth([...(before ?? []), ...(inside ?? [])], now);
}
