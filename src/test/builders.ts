/** Shared builders for domain objects. Keep defaults "healthy" and override per test. */
import type {
  Business,
  ExtractedSignals,
  GoogleData,
  PriorityAction,
  Project,
  SerpData,
} from '@/types';

export function buildSignals(overrides: Partial<ExtractedSignals> = {}): ExtractedSignals {
  return {
    seo: {
      title: 'Acme Plumbing — Bristol',
      metaDescription: 'Reliable plumbing.',
      h1Tags: ['Reliable Plumbing'],
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
      servicesListed: ['Boiler repair', 'Bathroom installation'],
      serviceAreasMentioned: ['Bristol'],
      hasBlog: true,
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
      socialLinksPresent: ['Facebook'],
      hasPhoneNumberProminent: true,
    },
    ...overrides,
  };
}

export function buildGoogleData(overrides: Partial<GoogleData> = {}): GoogleData {
  const now = Date.now();
  return {
    placeId: 'ChIJtest',
    googleRating: 4.7,
    reviewCount: 80,
    businessCategory: 'plumber',
    businessTypes: ['plumber'],
    address: '12 Pipe Street, Bristol',
    phoneNumber: '0117 123 4567',
    openingHours: ['Monday: 8:00 AM – 6:00 PM'],
    recentReviews: [
      { rating: 5, text: 'Great', time: now - 5 * 86400_000, authorName: 'A' },
      { rating: 4, text: 'Good', time: now - 20 * 86400_000, authorName: 'B' },
    ],
    photos: 12,
    priceLevel: null,
    description: 'Family-run plumbing firm.',
    website: 'https://acme-plumbing.test',
    ...overrides,
  } as GoogleData;
}

export function buildSerpData(overrides: Partial<SerpData> = {}): SerpData {
  return {
    localVisibilityPosition: 2,
    localPackPresent: true,
    featuredSnippet: false,
    knowledgePanelPresent: false,
    sitelinks: false,
    adsAboveResults: 0,
    searchTerm: 'plumber',
    ...overrides,
  };
}

export function buildBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: 'biz_own',
    name: 'Acme Plumbing',
    url: 'https://acme-plumbing.test',
    domain: 'acme-plumbing.test',
    lastCrawledAt: null,
    crawlJobId: null,
    crawlStatus: 'complete',
    signals: buildSignals(),
    googleData: buildGoogleData(),
    serpData: buildSerpData(),
    aiScore: null,
    aiVisibility: null,
    pagespeedData: null,
    reviewSentiment: null,
    enrichmentErrors: null,
    previousSignals: null,
    changeEvents: [],
    ...overrides,
  };
}

export function buildProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj_1',
    name: 'Acme vs Competitors',
    createdAt: Date.now(),
    ownBusiness: buildBusiness(),
    competitors: [
      buildBusiness({
        id: 'biz_c1',
        name: 'Bristol Plumbing Co',
        domain: 'bristolplumbing.test',
        url: 'https://bristolplumbing.test',
      }),
    ],
    primaryService: 'trades',
    location: 'Bristol',
    postcode: 'BS1 1AA',
    ...overrides,
  };
}

export function buildAction(overrides: Partial<PriorityAction> = {}): PriorityAction {
  return {
    id: 'act_1',
    priority: 1,
    status: 'active',
    category: 'Conversion',
    effort: 'low',
    action: 'Add your phone number to the homepage',
    reason: 'No phone number visible on your homepage',
    whyItMatters: 'Visitors should not hunt for your number.',
    steps: ['Add it to the header'],
    outcome: 'More calls',
    competitorReference: null,
    estimatedImpact: 'high',
    timeframe: '1–2 days',
    ...overrides,
  };
}
