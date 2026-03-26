export interface Project {
  id: string;
  name: string;
  createdAt: number;
  ownBusiness: Business;
  competitors: Business[];
}

export interface AIVisibility {
  aiPresenceScore: number;
  mentionCount: number;
  totalPrompts: number;
  tested_at: string;
}

export interface Business {
  id: string;
  name: string;
  url: string;
  domain: string;
  lastCrawledAt: number | null;
  crawlJobId: string | null;
  crawlStatus: 'idle' | 'pending' | 'running' | 'complete' | 'failed';
  signals: ExtractedSignals | null;
  googleData: GoogleData | null;
  serpData: SerpData | null;
  trustpilotData: TrustpilotData | null;
  aiScore: AIHealthScore | null;
  aiVisibility: AIVisibility | null;
  enrichmentErrors: { google?: string; serp?: string } | null;
  previousSignals: ExtractedSignals | null;
  changeEvents: ChangeEvent[];
}

export interface ExtractedSignals {
  seo: SEOSignals;
  pricing: PricingSignals;
  trust: TrustSignals;
  content: ContentSignals;
  engagement: EngagementSignals;
  features: FeatureChanges;
}

export interface SEOSignals {
  title: string;
  metaDescription: string;
  h1Tags: string[];
  pageCount: number;
  hasSitemap: boolean;
  hasRobotsTxt: boolean;
  internalLinkCount: number;
  blogPostCount: number;
  lastBlogDate: string | null;
  schemaMarkupTypes: string[];
  canonicalTagsPresent: boolean;
  altTagCoverage: 'full' | 'partial' | 'none';
}

export interface PricingSignals {
  hasPricingPage: boolean;
  pricingMentions: Array<{
    service: string;
    price: string;
    context: string;
  }>;
  hasPackages: boolean;
  packageDetails: Array<{
    name: string;
    price: string;
    includes: string[];
  }>;
  hasFreeQuote: boolean;
  hasFreeTrial: boolean;
  priceTransparencyScore: 'high' | 'medium' | 'low' | 'none';
}

export interface TrustSignals {
  accreditations: string[];
  certifications: string[];
  awardsAndMemberships: string[];
  namedClientsOrPartners: string[];
  caseStudyCount: number;
  testimonialCount: number;
  videoTestimonials: boolean;
  reviewPlatformsLinked: string[];
  trustBadges: string[];
  yearsInBusiness: number | null;
  teamPageExists: boolean;
  namedTeamMemberCount: number;
  insuranceMentioned: boolean;
  guaranteesMentioned: string[];
}

export interface ContentSignals {
  totalPages: number;
  servicesListed: string[];
  serviceAreasMentioned: string[];
  hasBlog: boolean;
  blogPostCount: number;
  mostRecentPostDate: string | null;
  hasVideo: boolean;
  hasPortfolio: boolean;
  portfolioItemCount: number;
  hasFAQ: boolean;
  faqCount: number;
  hasNewsFeed: boolean;
}

export interface EngagementSignals {
  hasChatWidget: boolean;
  chatProvider: string | null;
  hasContactForm: boolean;
  hasBookingSystem: boolean;
  bookingProvider: string | null;
  hasCallToAction: boolean;
  ctaText: string[];
  hasNewsletterSignup: boolean;
  socialLinksPresent: string[];
  hasPhoneNumberProminent: boolean;
  hasEmergencyContact: boolean;
}

export interface FeatureChanges {
  newServicesDetected: string[];
  removedServicesDetected: string[];
  newTechIntegrations: string[];
  recentAnnouncementsOrNews: Array<{
    headline: string;
    date: string | null;
  }>;
  recentHiringSignals: string[];
  newLocationsOrExpansion: string[];
}

export interface GoogleData {
  googleRating: number;
  reviewCount: number;
  placeId: string;
  businessCategory: string;
  address: string;
  phoneNumber: string;
  openingHours: string[];
  recentReviews: Array<{
    rating: number;
    text: string;
    time: number;
    authorName: string;
  }>;
  photos: number;
  priceLevel: number | null;
  description?: string;
  website?: string;
}

export interface SerpData {
  organicPosition: number | null;
  localPackPosition: number | null;
  localPackPresent: boolean;
  featuredSnippet: boolean;
  knowledgePanelPresent: boolean;
  sitelinks: boolean;
  adsAboveResults: number;
  searchTerm: string | null;
}

export interface TrustpilotData {
  trustpilotRating: number | null;
  trustpilotReviewCount: number | null;
  trustpilotTrustScore: string | null;
  recentTrustpilotReviews: Array<{
    rating: number;
    title: string;
    date: string;
  }>;
}

export interface AIHealthScore {
  overallScore: number;
  weeklyDelta: number | null; // +/- vs 7 days ago

  reputationScore: number;        // weighted rating × reviews × recency
  localVisibilityScore: number;   // local pack position (0–100)
  websiteHealthScore: number;     // crawl-derived: speed, CTA, contact, errors
  gbpCompletenessScore: number;   // Google Business Profile completeness
  aiPresenceScore: number;        // multi-prompt AI mention check (0–100)
  reviewVelocityScore: number;    // new reviews in last 30d vs competitors

  summary?: string;
  generatedAt: string;
}

export interface ScoreSnapshot {
  id: string;
  businessId: string;
  overallScore: number;
  reputationScore: number;
  localVisibilityScore: number;
  websiteHealthScore: number;
  gbpCompletenessScore: number;
  aiPresenceScore: number;
  reviewVelocityScore: number;
  snapshotAt: string;
}

export interface PriorityAction {
  priority: 1 | 2 | 3;
  category: string;
  action: string;
  reason: string;
  competitorReference: string;
  estimatedImpact: 'high' | 'medium' | 'low';
  timeframe: string;
}

export interface ChangeEvent {
  id: string;
  detectedAt: number;
  severity: 'high' | 'medium' | 'low';
  summary: string;
  changes: Change[];
}

export interface Change {
  category: string;
  description: string;
  significance: string;
}

export interface CrawlOptions {
  maxDepth?: number;
  maxPages?: number;
  outputFormats?: string[];
  render?: boolean;
  jsonOptions?: { prompt: string };
  modifiedSince?: number;
}

export interface RawCrawlResult {
  status: 'running' | 'completed' | 'errored' | 'cancelled_due_to_timeout' | 'cancelled_due_to_limits' | 'cancelled_by_user';
  pages: Array<{
    url: string;
    json?: Record<string, unknown>;
    markdown?: string;
    html?: string;
  }>;
}

export interface SignalDiff {
  hasChanges: boolean;
  changedFields: string[];
  before: Partial<ExtractedSignals>;
  after: Partial<ExtractedSignals>;
}

export interface ChangeSummary {
  hasSignificantChanges: boolean;
  severity: 'high' | 'medium' | 'low';
  summary: string;
  changes: Change[];
}

export interface AppSettings {
  primaryService: string;
  location: string;
  postcode?: string;
}

export interface User {
  id: 