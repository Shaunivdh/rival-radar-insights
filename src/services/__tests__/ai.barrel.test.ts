/**
 * Guards the public surface of `@/services/ai`.
 *
 * The implementation is split across `src/services/ai/*`, and the barrel is the
 * only entry point the rest of the app imports. A dropped or renamed re-export
 * should fail here, pointing at the real cause, rather than surfacing as an
 * unrelated type error elsewhere. Update EXPECTED_EXPORTS deliberately when the
 * public surface is meant to change.
 */
import { describe, it, expect } from 'vitest';
import * as ai from '@/services/ai';

const EXPECTED_EXPORTS: Record<string, 'function' | 'number'> = {
  AIUnavailableError: 'function',
  TruncatedOutputError: 'function',
  callLLMRaw: 'function',
  prepareHtmlForExtraction: 'function',
  extractPageSignals: 'function',
  generateReviewSentiment: 'function',
  resolveEvidence: 'function',
  dropUngroundedActions: 'function',
  checkCategoryDistribution: 'function',
  generatePriorityActions: 'function',
  generatePriorityActionsWithHistory: 'function',
  generateChangeSummary: 'function',
  clearMentionsCache: 'function',
  checkAIVisibility: 'function',
  AI_PRESENCE_WINDOW: 'number',
};

describe('@/services/ai barrel', () => {
  it.each(Object.entries(EXPECTED_EXPORTS))('re-exports %s as a %s', (name, kind) => {
    expect(typeof (ai as Record<string, unknown>)[name]).toBe(kind);
  });

  it('exports nothing beyond the documented surface', () => {
    // Catches an accidental `export *` widening the surface without review.
    expect(Object.keys(ai).sort()).toEqual(Object.keys(EXPECTED_EXPORTS).sort());
  });

  it('exports error classes the app can narrow on', () => {
    // Single class identity matters: apiErrorHandler and the AI tests both rely
    // on `instanceof` against the constructor reached through this barrel.
    const unavailable = new ai.AIUnavailableError(new Error('boom'));
    expect(unavailable).toBeInstanceOf(Error);
    expect(unavailable.retryAt).toEqual(expect.any(String));
    expect(new ai.TruncatedOutputError('label', 512)).toBeInstanceOf(Error);
  });
});
