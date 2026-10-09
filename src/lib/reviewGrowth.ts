/**
 * Review growth from the `google_data` history table.
 *
 * Places API returns up to 5 "most relevant" reviews, not the newest, so review
 * timestamps cannot prove a business has gone quiet. The review count stored on
 * every Google fetch can: comparing the latest count with a baseline about
 * REVIEW_WINDOW_DAYS ago gives a true "gained N reviews in D days".
 */
import { DAY_MS } from '@/lib/crawl/config';

export const REVIEW_WINDOW_DAYS = 90;

export type ReviewHistoryRow = { review_count: number | null; fetched_at: string };

export type ReviewGrowth = {
  /** Reviews gained since the baseline, never negative (Google sometimes removes reviews). */
  gained: number;
  /** Whole days between the baseline and the latest fetch. */
  days: number;
  baselineCount: number;
  latestCount: number;
  /** ISO timestamp of the baseline fetch. */
  since: string;
  /** True when every fetch from the baseline to the latest has the same count. */
  unchanged: boolean;
};

/**
 * Baseline is the last row at or before the window start when history reaches
 * that far, otherwise the oldest row. Returns null with fewer than two rows.
 */
export function reviewGrowth(rows: ReviewHistoryRow[], now = Date.now()): ReviewGrowth | null {
  const usable = rows
    .filter((r): r is { review_count: number; fetched_at: string } => r.review_count != null)
    .sort((a, b) => Date.parse(a.fetched_at) - Date.parse(b.fetched_at));
  if (usable.length < 2) return null;

  const latest = usable[usable.length - 1];
  const windowStart = now - REVIEW_WINDOW_DAYS * DAY_MS;
  const beforeWindow = usable.filter((r) => Date.parse(r.fetched_at) <= windowStart);
  const baseline = beforeWindow.length ? beforeWindow[beforeWindow.length - 1] : usable[0];
  if (baseline === latest) return null;

  return {
    gained: Math.max(0, latest.review_count - baseline.review_count),
    days: Math.round((Date.parse(latest.fetched_at) - Date.parse(baseline.fetched_at)) / DAY_MS),
    baselineCount: baseline.review_count,
    latestCount: latest.review_count,
    since: baseline.fetched_at,
    unchanged: usable
      .slice(usable.indexOf(baseline))
      .every((r) => r.review_count === baseline.review_count),
  };
}
