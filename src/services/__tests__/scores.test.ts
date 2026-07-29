import { describe, it, expect } from 'vitest';
import {
  computeWebsiteHealthScore,
  computeReputationScore,
  computeGBPCompletenessScore,
  computeReviewVelocityScore,
  recomputeOverallScore,
  calculateScores,
} from '@/services/scores';
import type { ExtractedSignals, GoogleData, PageSpeedData, AIHealthScore, SerpData } from '@/types';

// ── Fixtures ──────────────────────────────────────────────────────────────

/** Signals with every website-health point available (score = 90 before PSI). */
function fullSignals(): ExtractedSignals {
  return {
    seo: {
      title: 'Acme Plumbing — Manchester',
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
      hasContactForm: true,
      hasBookingSystem: false,
      bookingProvider: null,
      hasCallToAction: true,
      ctaText: ['Call us'],
      hasNewsletterSignup: false,
      socialLinksPresent: [],
      hasPhoneNumberProminent: true,
    },
  };
}

/** Signals with nothing set (score = 10, the always-on "indexable" point only). */
function emptySignals(): ExtractedSignals {
  const s = fullSignals();
  s.seo = {
    title: '',
    metaDescription: '',
    h1Tags: [],
    hasSitemap: false,
    hasRobotsTxt: false,
    internalLinkCount: 0,
    schemaMarkupTypes: [],
    canonicalTagsPresent: false,
    altTagCoverage: 'none',
  };
  s.engagement = {
    hasContactForm: false,
    hasBookingSystem: false,
    bookingProvider: null,
    hasCallToAction: false,
    ctaText: [],
    hasNewsletterSignup: false,
    socialLinksPresent: [],
    hasPhoneNumberProminent: false,
  };
  return s;
}

function psi(mobilePerf: number, desktopPerf: number): PageSpeedData {
  const metrics = (performanceScore: number) => ({
    performanceScore,
    lcp: null,
    cls: null,
    inp: null,
    fcp: null,
  });
  return {
    mobile: metrics(mobilePerf),
    desktop: metrics(desktopPerf),
    fetchedAt: new Date().toISOString(),
  };
}

function googleData(overrides: Partial<GoogleData> = {}): GoogleData {
  return {
    googleRating: 5,
    reviewCount: 200,
    placeId: 'p',
    businessCategory: 'Plumber',
    businessTypes: [],
    address: '1 Main St',
    phoneNumber: '0161 000 0000',
    openingHours: ['Mon 9-5'],
    recentReviews: [],
    photos: 5,
    priceLevel: 2,
    description: 'desc',
    website: 'https://x.co',
    ...overrides,
  };
}

// ── computeWebsiteHealthScore ───────────────────────────────────────────────

describe('computeWebsiteHealthScore', () => {
  it('returns null when no signals and no PageSpeed data', () => {
    expect(computeWebsiteHealthScore(null)).toBeNull();
  });

  it('derives a 0–10 score from PageSpeed alone when signals are missing', () => {
    // avg(80, 60) = 70 → round(70/100 * 10) = 7
    expect(computeWebsiteHealthScore(null, psi(80, 60))).toBe(7);
  });

  it('scores full signals at 90 without PageSpeed', () => {
    expect(computeWebsiteHealthScore(fullSignals())).toBe(90);
  });

  it('scores empty signals at 10 (indexable point only)', () => {
    expect(computeWebsiteHealthScore(emptySignals())).toBe(10);
  });

  it('adds a PageSpeed bonus on top of signal score', () => {
    // 90 + round(avg(90,90)/100*10)=+9 → 99
    expect(computeWebsiteHealthScore(fullSignals(), psi(90, 90))).toBe(99);
  });

  it('caps the score at 60 when mobile performance is below 30', () => {
    expect(computeWebsiteHealthScore(fullSignals(), psi(20, 90))).toBe(60);
  });

  it('caps the score at 75 when mobile performance is below 50', () => {
    expect(computeWebsiteHealthScore(fullSignals(), psi(40, 90))).toBe(75);
  });
});

// ── computeReputationScore ──────────────────────────────────────────────────

describe('computeReputationScore', () => {
  it('returns null when there is no Google data', () => {
    expect(computeReputationScore(null)).toBeNull();
  });

  it('scores a perfect 5★ / 200-review profile at 100', () => {
    expect(computeReputationScore(googleData({ googleRating: 5, reviewCount: 200 }))).toBe(100);
  });

  it('scores zero reviews at 0 regardless of rating', () => {
    expect(computeReputationScore(googleData({ googleRating: 5, reviewCount: 0 }))).toBe(0);
  });

  it('applies the recency×1.1 boost only when reviews are recent AND growing', () => {
    const recent = googleData({
      googleRating: 4,
      reviewCount: 50,
      recentReviews: [{ rating: 5, text: 'x', time: Date.now() - 86400000, authorName: 'A' }],
    });
    const base = computeReputationScore(recent); // no prevReviewCount → no boost
    const boosted = computeReputationScore(recent, 40); // growing 40→50 → boost
    expect(boosted).toBeGreaterThan(base!);
  });

  it('does not boost when the review count is not growing', () => {
    const recent = googleData({
      googleRating: 4,
      reviewCount: 50,
      recentReviews: [{ rating: 5, text: 'x', time: Date.now() - 86400000, authorName: 'A' }],
    });
    expect(computeReputationScore(recent, 50)).toBe(computeReputationScore(recent));
  });
});

// ── computeGBPCompletenessScore ─────────────────────────────────────────────

describe('computeGBPCompletenessScore', () => {
  it('returns null when there is no Google data', () => {
    expect(computeGBPCompletenessScore(null)).toBeNull();
  });

  it('scores a fully-populated profile at 100', () => {
    expect(computeGBPCompletenessScore(googleData())).toBe(100);
  });

  it('scores an empty profile at 0', () => {
    const empty = googleData({
      googleRating: 0,
      reviewCount: 0,
      address: '',
      phoneNumber: '',
      openingHours: [],
      photos: 0,
      priceLevel: null,
      description: undefined,
      website: undefined,
    });
    expect(computeGBPCompletenessScore(empty)).toBe(0);
  });

  it('sums only the fields that are present', () => {
    // rating(10)+reviews(10)+address(10)+phone(15)+hours(15)+photos(15) = 75
    const partial = googleData({ priceLevel: null, description: undefined, website: undefined });
    expect(computeGBPCompletenessScore(partial)).toBe(75);
  });
});

// ── computeReviewVelocityScore ──────────────────────────────────────────────

describe('computeReviewVelocityScore', () => {
  it('returns null with no history and no recent reviews', () => {
    expect(computeReviewVelocityScore(10)).toBeNull();
  });

  it('scores from the count delta over the window', () => {
    // +2 reviews / 30 days → per30d=2 → round(2/5*100)=40
    expect(computeReviewVelocityScore(42, 40, 30)).toBe(40);
  });

  it('clamps a high velocity to 100', () => {
    // +10 / 30 days → per30d=10 → base 200 → clamped 100
    expect(computeReviewVelocityScore(50, 40, 30)).toBe(100);
  });

  it('falls back to counting recent reviews within 90 days', () => {
    const now = Date.now();
    const recentReviews = [1, 2, 3].map((i) => ({ time: now - i * 86400000 }));
    // 3 in 90 days → per30d=1 → base round(1/5*100)=20, no owner replies → +0
    expect(computeReviewVelocityScore(0, undefined, undefined, recentReviews)).toBe(20);
  });

  it('adds an owner-reply bonus of up to +20', () => {
    // 2 reviews via delta path (base 40) + both have replies (100% → +20) = 60
    const recentReviews = [
      { time: Date.now(), ownerReply: 'thanks' },
      { time: Date.now(), ownerReply: 'cheers' },
    ];
    expect(computeReviewVelocityScore(42, 40, 30, recentReviews)).toBe(60);
  });
});

// ── recomputeOverallScore ───────────────────────────────────────────────────

describe('recomputeOverallScore', () => {
  const base = (o: Partial<AIHealthScore>): AIHealthScore => ({
    overallScore: 0,
    weeklyDelta: null,
    reputationScore: 100,
    localVisibilityScore: 100,
    websiteHealthScore: 100,
    gbpCompletenessScore: 100,
    aiPresenceScore: 100,
    reviewVelocityScore: 100,
    generatedAt: new Date().toISOString(),
    ...o,
  });

  it('returns 100 when every component is 100', () => {
    expect(recomputeOverallScore(base({}))).toBe(100);
  });

  it('renormalises over available weights, excluding null components', () => {
    // rep 80(.25) + local 60(.25) + gbp 40(.15) + velocity 100(.05) = 46 over weight .70 → 66
    const score = base({
      reputationScore: 80,
      localVisibilityScore: 60,
      websiteHealthScore: null,
      gbpCompletenessScore: 40,
      aiPresenceScore: null,
      reviewVelocityScore: 100,
    });
    expect(recomputeOverallScore(score)).toBe(66);
  });
});

// ── calculateScores ─────────────────────────────────────────────────────────

describe('calculateScores', () => {
  it('excludes unknown (null) components instead of coercing them to zero', () => {
    const result = calculateScores({
      googleData: null,
      serpData: null,
      aiVisibility: null,
    });
    expect(result.reputationScore).toBeNull();
    expect(result.gbpCompletenessScore).toBeNull();
    expect(result.websiteHealthScore).toBeNull();
    expect(result.reviewVelocityScore).toBeNull();
    expect(result.aiPresenceScore).toBeNull();
    // Only localVisibilityScore (0) is a real number here → overall 0
    expect(result.localVisibilityScore).toBe(0);
    expect(result.overallScore).toBe(0);
  });

  it('maps local pack position 1 → 100 and position 3 → 80', () => {
    const serp = (pos: number | null): SerpData => ({
      localVisibilityPosition: pos,
      localPackPresent: true,
      featuredSnippet: false,
      knowledgePanelPresent: false,
      sitelinks: false,
      adsAboveResults: 0,
      searchTerm: 'plumber manchester',
    });
    expect(
      calculateScores({ googleData: null, serpData: serp(1), aiVisibility: null })
        .localVisibilityScore,
    ).toBe(100);
    expect(
      calculateScores({ googleData: null, serpData: serp(3), aiVisibility: null })
        .localVisibilityScore,
    ).toBe(80);
  });

  it('carries the AI presence score straight through from aiVisibility', () => {
    const result = calculateScores({
      googleData: null,
      serpData: null,
      aiVisibility: {
        aiPresenceScore: 42,
        mentionCount: 1,
        totalPrompts: 5,
        tested_at: new Date().toISOString(),
        averagePosition: null,
        recommendedCount: 0,
        competitorsAhead: [],
      },
    });
    expect(result.aiPresenceScore).toBe(42);
  });
});
