import { describe, it, expect } from 'vitest';
import { computeWeeklyDelta, AI_PRESENCE_DELTA_THRESHOLD } from '@/lib/supabase/scores';
import { recomputeOverallScore } from '@/services/scores';
import type { AIHealthScore } from '@/types';

function score(overrides: Partial<AIHealthScore>): AIHealthScore {
  const base: AIHealthScore = {
    overallScore: 0,
    weeklyDelta: null,
    reputationScore: 70,
    localVisibilityScore: 50,
    websiteHealthScore: 55,
    gbpCompletenessScore: 65,
    aiPresenceScore: 20,
    reviewVelocityScore: 40,
    generatedAt: new Date().toISOString(),
  };
  const s = { ...base, ...overrides };
  return { ...s, overallScore: recomputeOverallScore(s) };
}

describe('computeWeeklyDelta', () => {
  it('ignores AI presence noise below the threshold', () => {
    const previous = score({ aiPresenceScore: 20 });
    // Only AI presence moved, and by less than the threshold
    const latest = score({ aiPresenceScore: 20 + AI_PRESENCE_DELTA_THRESHOLD - 1 });
    expect(latest.overallScore).not.toBe(previous.overallScore);
    expect(computeWeeklyDelta(latest, previous)).toBe(0);
  });

  it('counts AI presence when it moves by the threshold or more', () => {
    const previous = score({ aiPresenceScore: 0 });
    const latest = score({ aiPresenceScore: 60 });
    expect(computeWeeklyDelta(latest, previous)).toBe(latest.overallScore - previous.overallScore);
  });

  it('still reports real movement in other components', () => {
    const previous = score({ reputationScore: 50, aiPresenceScore: 20 });
    const latest = score({ reputationScore: 90, aiPresenceScore: 25 });
    const held = recomputeOverallScore({ ...latest, aiPresenceScore: 20 });
    expect(computeWeeklyDelta(latest, previous)).toBe(held - previous.overallScore);
    expect(computeWeeklyDelta(latest, previous)).toBeGreaterThan(0);
  });

  it('falls back to the raw delta when AI presence is unknown on either side', () => {
    const previous = score({ aiPresenceScore: null });
    const latest = score({ aiPresenceScore: 40 });
    expect(computeWeeklyDelta(latest, previous)).toBe(latest.overallScore - previous.overallScore);
  });
});
