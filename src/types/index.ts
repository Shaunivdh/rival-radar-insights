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
  averagePosition: number | null;
  recommendedCount: number;
  competitorsAhead: string[];
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
  aiScore: AIHealthScore | null;
  aiVisibility: AIVisibility | null;
  pagespeedData: PageSpeedData | null;
  reviewSentiment: ReviewSentiment | null;
  enrichmentErrors: { google?: string; serp?: string; crawl?: string; ai_actions?: string } | null;
  previousSignals: ExtractedSignals | null;
  changeEvents: ChangeEvent[];
}

export interface ExtractedSignals {
  seo: SEOSignals;
  trust: TrustSignals;
  content: ContentSignals;
  engagement: EngagementSignals;
}

export interface SEOSignals {
  title: string;
  metaDescription: string;
  h1Tags: string[];
  hasSitemap: boolean;
  hasRobotsTxt: boolean;
  internalLinkCount: number;
  schemaMarkupTypes: string[];
  canonicalTagsPresent: boolean;
  altTagCoverage: 'full' | 'partial' | 'none';
}

export interface TrustSignals {
  accreditations: string[];
  certifications: string[];
  awardsAndMemberships: string[];
  reviewPlatformsLinked: string[];
  teamPageExists: boolean;
  insuranceMentioned: boolean;
  guaranteesMentioned: string[];
}

export interface ContentSignals {
  servicesListed: string[];
  serviceAreasMentioned: string[];
  hasBlog: boolean;
  hasPortfolio: boolean;
  portfolioItemCount: number;
  hasFAQ: boolean;
}

export interface EngagementSignals {
  hasContactForm: boolean;
  hasBookingSystem: boolean;
  bookingProvider: string | null;
  hasCallToAction: boolean;
  ctaText: string[];
  hasNewsletterSignup: boolean;
  socialLinksPresent: string[];
  hasPhoneNumberProminent: boolean;
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
    ownerReply?: string;
  }>;
  photos: number;
  priceLevel: number | null;
  description?: string;
  website?: string;
}

export interface SerpData {
  localVisibilityPosition: number | null;
  localPackPresent: boolean;
  featuredSnippet: boolean;
  knowledgePanelPresent: boolean;
  sitelinks: boolean;
  adsAboveResults: number;
  searchTerm: string | null;
}

export interface AIHealthScore {
  overallScore: number;
  weeklyDelta: number | null; // +/- vs 7 days ago

  reputationScore: number; // weighted rating × reviews × recency
  localVisibilityScore: number; // local pack position (0–100)
  websiteHealthScore: number; // crawl-derived: speed, CTA, contact, errors
  gbpCompletenessScore: number; // Google Business Profile completeness
  aiPresenceScore: number; // multi-prompt AI mention check (0–100)
  reviewVelocityScore: number; // Google: new reviews in last 30d

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
  id: string;
  priority: 1 | 2 | 3 | 4 | 5;
  status: 'active' | 'snoozed' | 'completed' | 'queued';
  category: string;
  effort: 'low' | 'medium' | 'high';
  action: string; // conversational headline describing the gap
  reason: string; // ≤15-word summary (used in dashboard panel)
  whyItMatters: string; // 2–3 sentence paragraph with business impact
  steps: string[]; // 3–5 specific action items
  outcome: string; // goal statement e.g. "Appear in AI recommendations"
  competitorReference: string | null;
  estimatedImpact: 'high' | 'medium' | 'low';
  timeframe: string;
  note?: string | null;
  actionedAt?: string | null;
  continuityNote?: string | null; // e.g. "Still outstanding from last week" or "You completed this"
  /** Internal: source of this action for deterministic-check skip logic. Stripped before serving to clients. */
  _source?: 'template' | 'llm';
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
  actionItem: string | null;
}

export interface CrawlOptions {
  maxPages?: number;
  render?: boolean;
  jsonOptions?: { prompt: string };
  modifiedSince?: number;
  gotoOptions?: { waitUntil?: string; timeout?: number };
  waitForSelector?: { selector: string; timeout?: number; visible?: boolean };
}

export interface RawCrawlResult {
  status:
    | 'running'
    | 'completed'
    | 'errored'
    | 'cancelled_due_to_timeout'
    | 'cancelled_due_to_limits'
    | 'cancelled_by_user';
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

export interface PageSpeedMetrics {
  performanceScore: number; // 0-100
  lcp: number | null; // ms
  cls: number | null; // 0–1
  inp: number | null; // ms
  fcp: number | null; // ms
}

export interface PageSpeedData {
  mobile: PageSpeedMetrics;
  desktop: PageSpeedMetrics;
  fetchedAt: string;
}

export interface ReviewSentiment {
  positiveThemes: string[]; // top 3 things customers praise
  negativeThemes: string[]; // top 3 complaints
  summary: string; // ≤15 words
  generatedAt: string;
}

export interface AppSettings {
  primaryService: import('@/lib/serviceCategories').ServiceCategory;
  location: string;
  postcode?: string;
}

export interface User {
  id: string;
  email: string;
  username?: string;
}
