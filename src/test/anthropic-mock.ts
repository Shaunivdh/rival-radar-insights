/**
 * Anthropic SDK mock that answers by the JSON schema (or tool) the call asks
 * for, so every `src/services/ai.ts` path returns well-formed data without a
 * network call. Use with:
 *
 *   const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
 *   vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: mockCreate }; } }));
 *   mockCreate.mockImplementation(anthropicResponder());
 */
import {
  EXTRACTION_SCHEMA,
  SENTIMENT_SCHEMA,
  MENTIONED_BUSINESSES_SCHEMA,
  PRIORITY_ACTIONS_SCHEMA,
  PRIORITY_ACTIONS_WITH_CONTINUITY_SCHEMA,
  VALIDATION_PATCHES_SCHEMA,
  CHANGE_SUMMARY_SCHEMA,
} from '@/services/aiSchemas';

export function llmMessage(body: unknown, stopReason: 'end_turn' | 'max_tokens' = 'end_turn') {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-test',
    content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body) }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

/** A full EXTRACTION_SCHEMA-shaped object; override fields per page/test. */
export function extractionJson(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Acme Plumbing | Emergency Plumbers in Bristol',
    metaDescription: 'Gas Safe registered plumbers in Bristol.',
    h1Tags: ['Acme Plumbing Bristol'],
    hasSitemap: false,
    hasRobotsTxt: false,
    internalLinkCount: 6,
    schemaMarkupTypes: ['LocalBusiness'],
    canonicalTagsPresent: true,
    altTagCoverage: 'partial',
    accreditations: ['Gas Safe'],
    certifications: [],
    awardsAndMemberships: [],
    reviewPlatformsLinked: ['Google', 'Trustpilot'],
    teamPageExists: false,
    insuranceMentioned: true,
    guaranteesMentioned: [],
    servicesListed: ['Boiler repair', 'Bathroom installation', 'Emergency plumbing'],
    serviceAreasMentioned: ['Bristol'],
    hasBlog: true,
    hasPortfolio: false,
    portfolioItemCount: 0,
    hasFAQ: false,
    hasContactForm: false,
    hasBookingSystem: false,
    bookingProvider: null,
    hasCallToAction: true,
    ctaText: ['Call us'],
    hasNewsletterSignup: false,
    socialLinksPresent: [],
    hasPhoneNumberProminent: true,
    newServicesDetected: [],
    removedServicesDetected: [],
    newTechIntegrations: [],
    recentAnnouncementsOrNews: [],
    recentHiringSignals: [],
    newLocationsOrExpansion: [],
    sectorSpecific: {
      cqcRating: null,
      ofstedRating: null,
      treatmentsListed: [],
      consultationBookable: null,
      gasSafeRegistered: true,
      nicEicApproved: null,
      trustmarkMember: null,
      dvsaApproved: null,
      passRates: null,
      ageRangesCovered: [],
    },
    ...overrides,
  };
}

export interface ResponderOptions {
  extraction?: Record<string, unknown>;
  webSearchText?: string;
  changeSummary?: Record<string, unknown>;
  llmActions?: unknown[];
}

type Params = {
  tools?: unknown[];
  output_config?: { format?: { schema?: unknown } };
};

/** Returns a `messages.create` implementation keyed on the requested schema. */
export function anthropicResponder(opts: ResponderOptions = {}) {
  return async (params: Params) => {
    if (params.tools) {
      return llmMessage(
        opts.webSearchText ??
          'Top plumbers in Bristol: 1. Bristol Plumbing Co — reliable. 2. Acme Plumbing — Gas Safe, fast callouts. 3. Pipes R Us.',
      );
    }
    const schema = params.output_config?.format?.schema;
    switch (schema) {
      case EXTRACTION_SCHEMA:
        return llmMessage(extractionJson(opts.extraction));
      case SENTIMENT_SCHEMA:
        return llmMessage({
          positiveThemes: ['Fast response'],
          negativeThemes: ['Pricey'],
          summary: 'Fast and reliable, slightly pricey.',
        });
      case MENTIONED_BUSINESSES_SCHEMA:
        return llmMessage({
          businesses: [
            { name: 'Bristol Plumbing Co', position: 1, context: 'recommended' },
            { name: 'Acme Plumbing', position: 2, context: 'recommended' },
            { name: 'Pipes R Us', position: 3, context: 'mentioned' },
          ],
        });
      case PRIORITY_ACTIONS_SCHEMA:
      case PRIORITY_ACTIONS_WITH_CONTINUITY_SCHEMA:
        return llmMessage({ actions: opts.llmActions ?? [] });
      case VALIDATION_PATCHES_SCHEMA:
        return llmMessage({ patches: [] });
      case CHANGE_SUMMARY_SCHEMA:
        return llmMessage(
          opts.changeSummary ?? {
            hasSignificantChanges: true,
            severity: 'medium',
            summary: 'Contact form removed from the website',
            changes: [
              {
                category: 'engagement',
                description: 'The contact form is no longer present',
                significance: 'medium',
                actionItem: 'Restore the contact form',
              },
            ],
          },
        );
      default:
        throw new Error('anthropicResponder: unrecognised schema/tool in request');
    }
  };
}
