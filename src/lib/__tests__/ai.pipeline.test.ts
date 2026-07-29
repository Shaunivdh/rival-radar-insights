/**
 * End-to-end smoke test for the priority-action pipeline.
 * Mocks the Anthropic SDK so no real API key or LLM call is needed.
 *
 * Run: pnpm test:integration (or npm run test:integration)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Business, PriorityAction, ExtractedSignals } from '@/types';

// ── Mock Anthropic SDK before importing ai.ts ───────────────────────────
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class Anthropic {
      messages = { create: mockCreate };
      constructor() {}
    },
  };
});

// Now import the functions under test — they'll get the mocked Anthropic
import { generatePriorityActions, generatePriorityActionsWithHistory } from '@/services/ai';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Minimal Business with sensible defaults; override what you need. */
function buildBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: 'biz-1',
    name: 'Acme Plumbing',
    url: 'https://acme-plumbing.co.uk',
    domain: 'acme-plumbing.co.uk',
    lastCrawledAt: Date.now(),
    crawlJobId: null,
    crawlStatus: 'complete',
    signals: {
      seo: {
        title: 'Acme Plumbing — Manchester',
        metaDescription:
          'Reliable plumbing services across Manchester and surrounding areas for homes and businesses.',
        h1Tags: ['Reliable Plumbing in Manchester'],
        hasSitemap: true,
        hasRobotsTxt: true,
        internalLinkCount: 15,
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
        servicesListed: ['Boiler repair', 'Emergency plumbing'],
        serviceAreasMentioned: ['Manchester', 'Salford'],
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
        ctaText: ['Call us today'],
        hasNewsletterSignup: false,
        socialLinksPresent: ['facebook'],
        hasPhoneNumberProminent: true,
      },
    },
    googleData: {
      googleRating: 4.6,
      reviewCount: 32,
      placeId: 'ChIJ123',
      businessCategory: 'Plumber',
      businessTypes: [],
      address: '123 Main St, Manchester',
      phoneNumber: '0161 123 4567',
      openingHours: ['Mon-Fri 8am-6pm'],
      recentReviews: [
        {
          rating: 5,
          text: 'Great job!',
          // r.time is stored in milliseconds (see scores.ts / priorityTemplates.ts) — 1 day ago.
          time: Date.now() - 86400000,
          authorName: 'Alice',
        },
      ],
      photos: 5,
      priceLevel: null,
      description: 'Professional plumbing services in Manchester with over 20 years experience.',
    },
    serpData: null,
    aiScore: {
      overallScore: 62,
      weeklyDelta: null,
      reputationScore: 70,
      localVisibilityScore: 50,
      websiteHealthScore: 55,
      gbpCompletenessScore: 65,
      aiPresenceScore: 20,
      reviewVelocityScore: 40,
      generatedAt: new Date().toISOString(),
    },
    aiVisibility: null,
    pagespeedData: null,
    reviewSentiment: null,
    enrichmentErrors: null,
    previousSignals: null,
    changeEvents: [],
    ...overrides,
  };
}

function buildCompetitor(name: string, overrides: Partial<Business> = {}): Business {
  return buildBusiness({
    id: `comp-${name.toLowerCase().replace(/\s/g, '-')}`,
    name,
    url: `https://${name.toLowerCase().replace(/\s/g, '-')}.co.uk`,
    domain: `${name.toLowerCase().replace(/\s/g, '-')}.co.uk`,
    ...overrides,
  });
}

/** Build an Anthropic-shaped message response wrapping a JSON string. */
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

/** Canned LLM actions for generation calls. */
function cannedLLMActions(count: number): PriorityAction[] {
  const pool: PriorityAction[] = [
    {
      id: '',
      status: 'active',
      priority: 1,
      category: 'AI Visibility',
      effort: 'medium',
      action: 'Get listed in AI recommendations',
      reason: 'AI assistants do not mention you yet',
      whyItMatters:
        'More people use AI to find local services. Your AI presence score is 20, meaning most AI tools skip you entirely.',
      steps: [
        'Claim your listing on major directories',
        'Add structured data to your site',
        'Encourage reviews mentioning your services',
      ],
      outcome: 'Appear in AI recommendations',
      competitorReference: null,
      estimatedImpact: 'high',
      timeframe: '2-4 weeks',
    },
    {
      id: '',
      status: 'active',
      priority: 2,
      category: 'Reviews',
      effort: 'low',
      action: 'Ask 3 recent customers for reviews',
      reason: 'Review velocity is below competitors',
      whyItMatters:
        'Your review velocity score is 40. Fresh reviews signal to Google that you are active and trusted.',
      steps: [
        'Text 3 recent happy customers',
        'Include your Google review link',
        'Follow up after 3 days',
      ],
      outcome: 'Steady stream of new reviews',
      competitorReference: 'Bob Plumbing has 12 reviews this month',
      estimatedImpact: 'high',
      timeframe: '1-2 weeks',
    },
    {
      id: '',
      status: 'active',
      priority: 3,
      category: 'Conversion',
      effort: 'low',
      action: 'Add an online booking option',
      reason: 'No way to book online',
      whyItMatters:
        'Visitors who cannot book immediately often leave. Adding a simple booking form can capture leads 24/7.',
      steps: [
        'Sign up for Calendly or similar',
        'Add a "Book now" button to your homepage',
        'Link it from your Google profile',
      ],
      outcome: 'Capture leads outside business hours',
      competitorReference: null,
      estimatedImpact: 'medium',
      timeframe: '1-2 days',
    },
  ];
  return pool.slice(0, count);
}

// ── Setup ───────────────────────────────────────────────────────────────
const origEnv = { ...process.env };

beforeEach(() => {
  process.env.SKIP_AI_CALLS = 'false';
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
  mockCreate.mockReset();
});

afterEach(() => {
  process.env = { ...origEnv };
});

// ── Scenarios ───────────────────────────────────────────────────────────

describe('Priority action pipeline (integration)', () => {
  const competitors = [buildCompetitor('Bob Plumbing'), buildCompetitor('Quick Fix')];

  // ── 1. Templates fill some slots, LLM fills the rest ────────────────
  it('returns template actions first and fills remaining slots via LLM', async () => {
    const own = buildBusiness({
      signals: {
        seo: {
          title: '',
          metaDescription: '',
          h1Tags: [],
          hasSitemap: false,
          hasRobotsTxt: false,
          internalLinkCount: 0,
          schemaMarkupTypes: [],
          canonicalTagsPresent: false,
          altTagCoverage: 'none',
        },
        trust: {
          accreditations: [],
          certifications: [],
          awardsAndMemberships: [],
          reviewPlatformsLinked: [],
          teamPageExists: false,
          insuranceMentioned: false,
          guaranteesMentioned: [],
        },
        content: {
          servicesListed: [],
          serviceAreasMentioned: [],
          hasBlog: false,
          hasPortfolio: false,
          portfolioItemCount: 0,
          hasFAQ: false,
        },
        engagement: {
          hasContactForm: false,
          hasBookingSystem: false,
          bookingProvider: null,
          hasCallToAction: false,
          ctaText: [],
          hasNewsletterSignup: false,
          socialLinksPresent: [],
          hasPhoneNumberProminent: false,
        },
      },
      googleData: {
        googleRating: 4.0,
        reviewCount: 0,
        placeId: 'x',
        businessCategory: 'Plumber',
        businessTypes: [],
        address: '1 Main St',
        phoneNumber: '',
        openingHours: [],
        recentReviews: [],
        photos: 0,
        priceLevel: null,
      },
    });

    // This empty business fires many template triggers (>= 5), so no LLM call is needed.
    const result = await generatePriorityActions(own, competitors);

    expect(result).toHaveLength(5);
    expect(result.map((a) => a.priority)).toEqual([1, 2, 3, 4, 5]);
    // First three templates by definition order: no_phone_on_homepage, missing_h1, no_business_hours
    expect(result[0].action).toContain('phone number');
    expect(result[1].action).toContain('heading');
    expect(result[2].action).toContain('hours');
    // No LLM call should have been made
    expect(mockCreate).not.toHaveBeenCalled();
    // _source should be stripped
    expect(result.every((a) => !('_source' in a))).toBe(true);
  });

  // ── 2. Mixed: 1 template + 4 LLM ───────────────────────────────────
  it('fills remaining slots with LLM actions when only 1 template fires', async () => {
    const own = buildBusiness({
      signals: {
        ...buildBusiness().signals!,
        seo: { ...buildBusiness().signals!.seo, h1Tags: [] }, // triggers missing_h1
      },
    });

    // Pad to 4 LLM actions (cannedLLMActions only has 3 templates so repeat the last).
    const llm = cannedLLMActions(3);
    llm.push({ ...llm[2], action: 'Add a customer testimonials section' });
    mockCreate.mockResolvedValueOnce(llmResponse(llm));

    const result = await generatePriorityActions(own, competitors);

    expect(result).toHaveLength(5);
    // First action is the template
    expect(result[0].action).toContain('heading');
    expect(result.map((a) => a.priority)).toEqual([1, 2, 3, 4, 5]);
    // LLM was called exactly once (generation, no validation flags expected)
    expect(mockCreate).toHaveBeenCalledTimes(1);
    // Prompt should contain coveredNote
    const callArgs = mockCreate.mock.calls[0][0];
    const prompt = callArgs.messages[0].content;
    expect(prompt).toContain('already covered');
    // maxTokens should reflect 4 remaining slots (4 * 833 = 3332)
    expect(callArgs.max_tokens).toBe(3332);
  });

  // ── 3. LLM only ────────────────────────────────────────────────────
  it('uses only LLM when no templates fire', async () => {
    const own = buildBusiness(); // default business has no template triggers

    const llm = cannedLLMActions(3);
    llm.push({ ...llm[2], action: 'Add a customer testimonials section' });
    llm.push({ ...llm[1], action: 'Publish a frequently asked questions page' });
    mockCreate.mockResolvedValueOnce(llmResponse(llm));

    const result = await generatePriorityActions(own, competitors);

    expect(result).toHaveLength(5);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    // Prompt should NOT contain coveredNote
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).not.toContain('already covered');
    // maxTokens for 5 slots = 5 * 833 = 4165
    expect(mockCreate.mock.calls[0][0].max_tokens).toBe(4165);
  });

  // ── 4. Validator-flagged: unverified average triggers patch call ────
  it('patches actions when validator detects unverified averages', async () => {
    const own = buildBusiness();

    // First call: generation — return actions with a flagged phrase. Pad to 5 LLM actions.
    const flaggedActions = cannedLLMActions(3);
    flaggedActions.push({ ...flaggedActions[2], action: 'Add a customer testimonials section' });
    flaggedActions.push({ ...flaggedActions[1], action: 'Publish a frequently asked questions page' });
    flaggedActions[0] = {
      ...flaggedActions[0],
      whyItMatters: 'Your competitors average 4 reviews per month, leaving you behind.',
    };
    mockCreate.mockResolvedValueOnce(llmResponse(flaggedActions));

    // Second call: validator patch — return a clean patch
    const patchResponse = {
      patches: [
        {
          actionIndex: 0,
          field: 'whyItMatters',
          newValue:
            'Bob Plumbing received 12 reviews this month while you received none. Fresh reviews help you rank higher.',
        },
      ],
    };
    mockCreate.mockResolvedValueOnce(llmResponse(patchResponse));

    const result = await generatePriorityActions(own, competitors);

    // Validator should have made a second call
    expect(mockCreate).toHaveBeenCalledTimes(2);
    // The second call should be the validator, identified by its system prompt persona.
    expect(mockCreate.mock.calls[1][0].system).toContain("fact-checker");
    // The patched action should no longer contain the flagged phrase
    expect(result[0].whyItMatters).not.toContain('competitors average 4');
    expect(result[0].whyItMatters).toContain('Bob Plumbing');
  });

  // ── 5. Continuity: acknowledges completed actions from last week ───
  it('includes continuityNote acknowledging completed wins', async () => {
    const own = buildBusiness();

    const previousActions: PriorityAction[] = [
      {
        id: '',
        status: 'active',
        priority: 1,
        category: 'Conversion',
        effort: 'low',
        action: 'Add a phone number to the homepage',
        reason: 'No phone number visible',
        whyItMatters: 'Visitors cannot call you easily.',
        steps: ['Add phone to header'],
        outcome: 'More calls',
        competitorReference: null,
        estimatedImpact: 'high',
        timeframe: '1 day',
      },
      {
        id: '',
        status: 'active',
        priority: 2,
        category: 'Reviews',
        effort: 'low',
        action: 'Ask for more reviews',
        reason: 'Low review count',
        whyItMatters: 'Reviews help ranking.',
        steps: ['Ask 3 customers'],
        outcome: 'More reviews',
        competitorReference: null,
        estimatedImpact: 'high',
        timeframe: '1 week',
      },
      {
        id: '',
        status: 'active',
        priority: 3,
        category: 'Website',
        effort: 'medium',
        action: 'Add a blog section',
        reason: 'No blog content',
        whyItMatters: 'Blog content helps SEO.',
        steps: ['Create blog page'],
        outcome: 'More organic traffic',
        competitorReference: null,
        estimatedImpact: 'medium',
        timeframe: '2 weeks',
      },
    ];

    const currentSignals = own.signals!;
    const previousSignals: ExtractedSignals = {
      ...currentSignals,
      engagement: { ...currentSignals.engagement, hasPhoneNumberProminent: false },
    };

    // LLM call for remaining 5 slots (no templates fire on this business)
    const padded = cannedLLMActions(3);
    padded.push({ ...padded[2], action: 'Add a customer testimonials section' });
    padded.push({ ...padded[1], action: 'Publish a frequently asked questions page' });
    const llmActions = padded.map((a) => ({
      ...a,
      continuityNote: 'You added your phone number last week — great move.',
    }));
    mockCreate.mockResolvedValueOnce(llmResponse(llmActions));

    const result = await generatePriorityActionsWithHistory(
      own,
      competitors,
      previousActions,
      previousSignals,
      currentSignals,
    );

    expect(result).toHaveLength(5);
    // LLM prompt should include closedNote about the phone number win
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Closed since last week');
    expect(prompt).toContain('Add a phone number');
    // At least one action should carry a continuityNote
    const withContinuity = result.filter((a) => a.continuityNote);
    expect(withContinuity.length).toBeGreaterThanOrEqual(1);
    expect(withContinuity[0].continuityNote).toContain('phone number');
  });
});
