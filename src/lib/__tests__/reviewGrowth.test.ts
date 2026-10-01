import { describe, it, expect } from 'vitest';
import { reviewGrowth, REVIEW_WINDOW_DAYS } from '@/lib/reviewGrowth';

const NOW = Date.parse('2026-10-01T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const row = (d: number, review_count: number | null) => ({ review_count, fetched_at: daysAgo(d) });

describe('reviewGrowth', () => {
  it('returns null with fewer than two usable rows', () => {
    expect(reviewGrowth([], NOW)).toBeNull();
    expect(reviewGrowth([row(0, 10)], NOW)).toBeNull();
    expect(reviewGrowth([row(10, null), row(0, 10)], NOW)).toBeNull();
  });

  it('measures from the oldest row when history is shorter than the window', () => {
    expect(reviewGrowth([row(20, 146), row(5, 148), row(0, 150)], NOW)).toEqual({
      gained: 4,
      days: 20,
      baselineCount: 146,
      since: daysAgo(20),
    });
  });

  it('measures from the last row at or before the window start when history is longer', () => {
    const rows = [row(200, 50), row(95, 80), row(60, 90), row(0, 96)];
    expect(reviewGrowth(rows, NOW)).toMatchObject({ gained: 16, days: 95, baselineCount: 80 });
    expect(REVIEW_WINDOW_DAYS).toBe(90);
  });

  it('never reports negative growth when Google removes reviews', () => {
    expect(reviewGrowth([row(70, 100), row(0, 97)], NOW)?.gained).toBe(0);
  });

  it('accepts rows in any order', () => {
    expect(reviewGrowth([row(0, 96), row(70, 96)], NOW)).toMatchObject({ gained: 0, days: 70 });
  });
});
