/**
 * Unit tests for generateChangeSummary.
 * Mocks the Anthropic SDK so no real API key or LLM call is needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExtractedSignals } from '@/types';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: mockCreate };
    constructor() {}
  },
}));

import { generateChangeSummary, AIUnavailableError } from '@/services/ai';

function buildSignals(overrides: Partial<ExtractedSignals> = {}): ExtractedSignals {
  return {
    seo: {
      title: 'Acme Plumbing',
      metaDescription: 'Reliable plumbing services in Manchester.',
      h1Tags: ['Acme Plumbing'],
      hasSitemap: true,
      hasRobotsTxt: true,
      internalLinkCount: 10,
      schemaMarkupTypes: ['LocalBusiness'],
      canonicalTagsPresent: true,
      altTagCoverage: 'partial',
    },
    trust: {
      accreditations: ['Gas Safe'],
      certifications: [],
      awardsAndMemberships: [],
      reviewPlatformsLinked: ['Google'],
      teamPageExists: true,
      insuranceMentioned: true,
      guaranteesMentioned: [],
    },
    content: {
      servicesListed: ['Boiler repair'],
      serviceAreasMentioned: ['Manchester'],
      hasBlog: false,
      hasPortfolio: false,
      portfolioItemCount: 0,
      hasFAQ: true,
    },
    engagement: {
      hasContactForm: true,
      hasBookingSystem: false,
      bookingProvider: null,
      hasCallToAction: true,
      ctaText: ['Call us'],
      hasNewsletterSignup: false,
      socialLinksPresent: ['facebook'],
      hasPhoneNumberProminent: true,
    },
    ...overrides,
  };
}

function llmResponse(json: unknown) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5-20251001',
    content: [{ type: 'text', text: JSON.stringify(json) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

const origEnv = { ...process.env };
beforeEach(() => {
  process.env.SKIP_AI_CALLS = 'false';
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
  mockCreate.mockReset();
});
afterEach(() => {
  process.env = { ...origEnv };
});

describe('generateChangeSummary', () => {
  it('returns no-changes result and skips the LLM when before equals after', async () => {
    const sig = buildSignals();
    const result = await generateChangeSummary('Acme', sig, sig, false);

    expect(result.hasSignificantChanges).toBe(false);
    expect(result.severity).toBe('low');
    expect(result.changes).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('frames competitor changes with competitor wording and uses Scoutly system prompt', async () => {
    const before = buildSignals();
    const after = buildSignals({
      content: { ...before.content, hasBlog: true },
    });

    mockCreate.mockResolvedValueOnce(
      llmResponse({
        hasSignificantChanges: true,
        severity: 'medium',
        summary: 'Competitor launched a blog — they may pull search traffic.',
        changes: [
          {
            category: 'Content',
            description: 'Competitor added a blog.',
            significance: 'medium',
            actionItem: 'Consider starting your own blog focused on local search terms.',
          },
        ],
      }),
    );

    const result = await generateChangeSummary('Bob Plumbing', before, after, true);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0][0];

    // Competitor framing in user prompt
    expect(call.messages[0].content).toContain('competitor');
    expect(call.messages[0].content).toContain('Bob Plumbing');
    // Scoutly persona in system prompt
    expect(call.system).toContain('Scoutly');
    // Data integrity guardrail present
    expect(call.messages[0].content).toContain('DATA INTEGRITY');
    // Only changed fields are sent (token reduction)
    expect(call.messages[0].content).toContain('content');
    expect(call.messages[0].content).not.toContain('"seo":{"title":"Acme');

    expect(result.hasSignificantChanges).toBe(true);
    expect(result.severity).toBe('medium');
    expect(result.changes).toHaveLength(1);
  });

  it('frames own-site changes with owner wording', async () => {
    const before = buildSignals();
    const after = buildSignals({
      trust: { ...before.trust, accreditations: ['Gas Safe', 'CIPHE'] },
    });

    mockCreate.mockResolvedValueOnce(
      llmResponse({
        hasSignificantChanges: true,
        severity: 'high',
        summary: 'You added a new accreditation — promote it on your homepage.',
        changes: [
          {
            category: 'Trust',
            description: 'New CIPHE accreditation added.',
            significance: 'high',
            actionItem: 'Add the CIPHE badge to your homepage and footer.',
          },
        ],
      }),
    );

    const result = await generateChangeSummary('Acme Plumbing', before, after, false);

    const userPrompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(userPrompt).toContain("owner's own website");
    expect(userPrompt).toContain('Acme Plumbing');
    expect(userPrompt).not.toContain('competitor called');
    expect(result.changes[0].category).toBe('Trust');
  });

  it('throws AIUnavailableError when the LLM call fails', async () => {
    const before = buildSignals();
    const after = buildSignals({
      seo: { ...before.seo, title: 'Acme Plumbing — Now in Salford' },
    });

    mockCreate.mockRejectedValueOnce(new Error('upstream 503'));

    await expect(generateChangeSummary('Acme', before, after, false)).rejects.toBeInstanceOf(
      AIUnavailableError,
    );
  });
});
