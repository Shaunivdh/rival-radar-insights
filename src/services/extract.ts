import type { RawCrawlResult, ExtractedSignals } from '@/types';

type PageJson = Record<string, unknown>;

function pickStr(pages: PageJson[], key: string, fallback = ''): string {
  for (const p of pages) {
    const v = p[key];
    if (typeof v === 'string' && v) return v;
  }
  return fallback;
}

function pickBool(pages: PageJson[], key: string, fallback = false): boolean {
  let found = false;
  for (const p of pages) {
    if (typeof p[key] === 'boolean') {
      if (p[key] === true) return true;
      found = true;
    }
  }
  return found ? false : fallback;
}

function pickNum(pages: PageJson[], key: string, fallback: number | null = null): number | null {
  for (const p of pages) {
    if (typeof p[key] === 'number') return p[key] as number;
  }
  return fallback;
}

function mergeStringArrays(pages: PageJson[], key: string): string[] {
  const seen = new Set<string>();
  for (const p of pages) {
    const arr = p[key];
    if (Array.isArray(arr)) arr.forEach((v) => typeof v === 'string' && seen.add(v));
  }
  return [...seen];
}

function mergeObjectArrays(pages: PageJson[], key: string): unknown[] {
  const results: unknown[] = [];
  for (const p of pages) {
    const arr = p[key];
    if (Array.isArray(arr)) results.push(...arr);
  }
  return results;
}

/** Aggregate extracted JSON blobs from all crawl pages into a single ExtractedSignals object. */
export async function extractSignals(rawResult: RawCrawlResult): Promise<ExtractedSignals> {
  const pages = rawResult.pages.map((p) => (p.json ?? {}) as PageJson);

  return {
    seo: {
      title: pickStr(pages, 'title'),
      metaDescription: pickStr(pages, 'metaDescription'),
      h1Tags: mergeStringArrays(pages, 'h1Tags'),
      hasSitemap: pickBool(pages, 'hasSitemap'),
      hasRobotsTxt: pickBool(pages, 'hasRobotsTxt'),
      internalLinkCount: pickNum(pages, 'internalLinkCount', 0) ?? 0,
      blogPostCount: pickNum(pages, 'blogPostCount', 0) ?? 0,
      lastBlogDate: pickStr(pages, 'lastBlogDate') || null,
      schemaMarkupTypes: mergeStringArrays(pages, 'schemaMarkupTypes'),
      canonicalTagsPresent: pickBool(pages, 'canonicalTagsPresent'),
      altTagCoverage: (pickStr(pages, 'altTagCoverage') as 'full' | 'partial' | 'none') || 'none',
    },
    trust: {
      accreditations: mergeStringArrays(pages, 'accreditations'),
      certifications: mergeStringArrays(pages, 'certifications'),
      awardsAndMemberships: mergeStringArrays(pages, 'awardsAndMemberships'),
      reviewPlatformsLinked: mergeStringArrays(pages, 'reviewPlatformsLinked'),
      teamPageExists: pickBool(pages, 'teamPageExists'),
      insuranceMentioned: pickBool(pages, 'insuranceMentioned'),
      guaranteesMentioned: mergeStringArrays(pages, 'guaranteesMentioned'),
    },
    content: {
      servicesListed: mergeStringArrays(pages, 'servicesListed'),
      serviceAreasMentioned: mergeStringArrays(pages, 'serviceAreasMentioned'),
      hasBlog: pickBool(pages, 'hasBlog'),
      blogPostCount: pickNum(pages, 'blogPostCount', 0) ?? 0,
      mostRecentPostDate: pickStr(pages, 'mostRecentPostDate') || null,
      hasVideo: pickBool(pages, 'hasVideo'),
      hasPortfolio: pickBool(pages, 'hasPortfolio'),
      portfolioItemCount: pickNum(pages, 'portfolioItemCount', 0) ?? 0,
      hasFAQ: pickBool(pages, 'hasFAQ'),
      faqCount: pickNum(pages, 'faqCount', 0) ?? 0,
      hasNewsFeed: pickBool(pages, 'hasNewsFeed'),
    },
    engagement: {
      hasContactForm: pickBool(pages, 'hasContactForm'),
      hasBookingSystem: pickBool(pages, 'hasBookingSystem'),
      bookingProvider: pickStr(pages, 'bookingProvider') || null,
      hasCallToAction: pickBool(pages, 'hasCallToAction'),
      ctaText: mergeStringArrays(pages, 'ctaText'),
      hasNewsletterSignup: pickBool(pages, 'hasNewsletterSignup'),
      socialLinksPresent: mergeStringArrays(pages, 'socialLinksPresent'),
      hasPhoneNumberProminent: pickBool(pages, 'hasPhoneNumberProminent'),
      hasEmergencyContact: pickBool(pages, 'hasEmergencyContact'),
    },
    features: {
      newServicesDetected: mergeStringArrays(pages, 'newServicesDetected'),
      removedServicesDetected: mergeStringArrays(pages, 'removedServicesDetected'),
      newTechIntegrations: mergeStringArrays(pages, 'newTechIntegrations'),
      recentAnnouncementsOrNews: mergeObjectArrays(pages, 'recentAnnouncementsOrNews') as ExtractedSignals['features']['recentAnnouncementsOrNews'],
      recentHiringSignals: mergeStringArrays(pages, 'recentHiringSignals'),
      newLocationsOrExpansion: mergeStringArrays(pages, 'newLocationsOrExpansion'),
    },
  };
}
