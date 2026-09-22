/**
 * JSON schemas passed to the Messages API via `output_config.format` so every
 * AI call returns schema-valid JSON — no fence stripping, no bracket regex.
 *
 * Structured-output rules (see Anthropic docs): every object needs
 * `additionalProperties: false` and lists every property in `required`;
 * nullable values use `anyOf`; no min/max or length constraints.
 */

export type JsonSchema = Record<string, unknown>;

const str = { type: 'string' } as const;
const bool = { type: 'boolean' } as const;
const int = { type: 'integer' } as const;
const strArr = { type: 'array', items: str } as const;
const nullableStr = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;
const nullableBool = { anyOf: [{ type: 'boolean' }, { type: 'null' }] } as const;

function obj(properties: Record<string, unknown>): JsonSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

/** Per-page signal extraction — mirrors the keys requested by EXTRACTION_PROMPT. */
export const EXTRACTION_SCHEMA: JsonSchema = obj({
  title: str,
  metaDescription: str,
  h1Tags: strArr,
  hasSitemap: bool,
  hasRobotsTxt: bool,
  internalLinkCount: int,
  schemaMarkupTypes: strArr,
  canonicalTagsPresent: bool,
  altTagCoverage: { type: 'string', enum: ['full', 'partial', 'none'] },
  accreditations: strArr,
  certifications: strArr,
  awardsAndMemberships: strArr,
  reviewPlatformsLinked: strArr,
  teamPageExists: bool,
  insuranceMentioned: bool,
  guaranteesMentioned: strArr,
  servicesListed: strArr,
  serviceAreasMentioned: strArr,
  hasBlog: bool,
  hasPortfolio: bool,
  portfolioItemCount: int,
  hasFAQ: bool,
  hasContactForm: bool,
  hasBookingSystem: bool,
  bookingProvider: nullableStr,
  hasCallToAction: bool,
  ctaText: strArr,
  hasNewsletterSignup: bool,
  socialLinksPresent: strArr,
  hasPhoneNumberProminent: bool,
  newServicesDetected: strArr,
  removedServicesDetected: strArr,
  newTechIntegrations: strArr,
  recentAnnouncementsOrNews: {
    type: 'array',
    items: obj({ title: str, date: nullableStr, summary: str }),
  },
  recentHiringSignals: strArr,
  newLocationsOrExpansion: strArr,
  sectorSpecific: obj({
    cqcRating: nullableStr,
    ofstedRating: nullableStr,
    treatmentsListed: strArr,
    consultationBookable: nullableBool,
    gasSafeRegistered: nullableBool,
    nicEicApproved: nullableBool,
    trustmarkMember: nullableBool,
    dvsaApproved: nullableBool,
    passRates: nullableStr,
    ageRangesCovered: strArr,
  }),
});

export const SENTIMENT_SCHEMA: JsonSchema = obj({
  positiveThemes: strArr,
  negativeThemes: strArr,
  summary: str,
});

const PRIORITY_ACTION_PROPS = {
  priority: int,
  category: {
    type: 'string',
    enum: ['AI Visibility', 'Reviews', 'Local SEO', 'Website', 'Trust', 'Conversion'],
  },
  effort: { type: 'string', enum: ['low', 'medium', 'high'] },
  action: str,
  reason: str,
  whyItMatters: str,
  steps: strArr,
  outcome: str,
  competitorReference: nullableStr,
  estimatedImpact: { type: 'string', enum: ['high', 'medium'] },
  timeframe: str,
  /** Data paths the model used, e.g. "own.signals.engagement.hasContactForm=false". */
  evidence: strArr,
};

/** LLM-generated priority actions, wrapped in an object (structured outputs require an object root). */
export const PRIORITY_ACTIONS_SCHEMA: JsonSchema = obj({
  actions: { type: 'array', items: obj(PRIORITY_ACTION_PROPS) },
});

export const PRIORITY_ACTIONS_WITH_CONTINUITY_SCHEMA: JsonSchema = obj({
  actions: {
    type: 'array',
    items: obj({ ...PRIORITY_ACTION_PROPS, continuityNote: nullableStr }),
  },
});

export const VALIDATION_PATCHES_SCHEMA: JsonSchema = obj({
  patches: {
    type: 'array',
    items: obj({
      actionIndex: int,
      field: {
        type: 'string',
        enum: ['action', 'reason', 'whyItMatters', 'competitorReference', 'timeframe', 'outcome'],
      },
      newValue: nullableStr,
    }),
  },
});

export const CHANGE_SUMMARY_SCHEMA: JsonSchema = obj({
  hasSignificantChanges: bool,
  severity: { type: 'string', enum: ['high', 'medium', 'low'] },
  summary: str,
  changes: {
    type: 'array',
    items: obj({
      category: str,
      description: str,
      significance: { type: 'string', enum: ['high', 'medium', 'low'] },
      actionItem: nullableStr,
    }),
  },
});

export const MENTIONED_BUSINESSES_SCHEMA: JsonSchema = obj({
  businesses: {
    type: 'array',
    items: obj({
      name: str,
      position: int,
      context: { type: 'string', enum: ['recommended', 'mentioned', 'compared', 'dismissed'] },
    }),
  },
});
