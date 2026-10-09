import { describe, it, expect, vi } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: mockCreate };
    constructor() {}
  },
}));

import { checkAIVisibility } from '@/services/ai';
import type { AIVisibility } from '@/types';

const DAY = 86_400_000;
const testedDaysAgo = (days: number) =>
  ({
    aiPresenceScore: 40,
    mentionCount: 2,
    totalPrompts: 4,
    tested_at: new Date(Date.now() - days * DAY).toISOString(),
    averagePosition: null,
    recommendedCount: 0,
    competitorsAhead: [],
  }) as AIVisibility;

/** Answers always name the business, so no mention-extraction call is needed. */
const run = async (existing: AIVisibility | null) => {
  const getResponse = vi.fn(async () => 'Top picks: Acme Plumbing, Bob Plumbing.');
  const result = await checkAIVisibility(
    'trades',
    'Bristol',
    'Acme Plumbing',
    existing,
    'trades',
    getResponse,
  );
  return { result, searched: getResponse.mock.calls.length > 0 };
};

describe('AI visibility schedule', () => {
  it('runs on the first scan, when there is no previous result', async () => {
    expect((await run(null)).searched).toBe(true);
  });

  it('skips the weekly scan in between', async () => {
    const { result, searched } = await run(testedDaysAgo(8));
    expect(result).toBeNull();
    expect(searched).toBe(false);
  });

  it('runs again two weeks later, allowing a day of scan drift', async () => {
    expect((await run(testedDaysAgo(13.5))).searched).toBe(true);
    expect((await run(testedDaysAgo(15))).searched).toBe(true);
    expect((await run(testedDaysAgo(12))).searched).toBe(false);
  });

  it('throws rather than saving a 0 when every query fails, so the next scan retries', async () => {
    const getResponse = vi.fn(async () => {
      throw new Error('overloaded');
    });
    await expect(
      checkAIVisibility('trades', 'Bristol', 'Acme Plumbing', null, 'trades', getResponse),
    ).rejects.toThrow('all');
  });
});
