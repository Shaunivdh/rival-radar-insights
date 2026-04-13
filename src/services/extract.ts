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

/** Returns the maximum numeric value across all pages — use for counts where the dedicated page has the real value. */
function maxNum(pages: PageJson[], key: string, fallback = 0): number {
  let max = fallback;
  for (const p of pages) {
    const v = p[key];
    if (typeof v === 'number' && v > max) max = v;
  }
  return max;
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

/** Returns true if any page HTML contains a <form> element with inputs — deterministic fallback for hasContactForm. */
function htmlHasContactForm(rawResult: RawCrawlResult): boolean {
  return rawResult.pages.some((p) => {
    const html = p.html ?? '';
    return /<form[\s>]/i.test(html) && /<input[\s>]/i.test(html);
  });
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
      hasPortfolio: pickBool(pages, 'hasPortfolio'),
      portfolioItemCount: maxNum(pages, 'portfolioItemCount'),
      hasFAQ: pickBool(pages, 'hasFAQ'),
    },
    engagement: {
      hasContactForm: pickBool(pages, 'hasContactForm') || htmlHasContactForm(rawResult),
      hasBookingSystem: pickBool(pages, 'hasBookingSystem'),
      bookingProvider: pickStr(pages, 'bookingProvider') || null,
      hasCallToAction: pickBool(pages, 'hasCallToAction'),
      ctaText: mergeStringArrays(pages, 'ctaText'),
      hasNewsletterSignup: pickBool(pages, 'hasNewsletterSignup'),
      socialLinksPresent: mergeStringArrays(pages, 'socialLinksPresent'),
      hasPhoneNumberProminent: pickBool(pages, 'hasPhoneNumberProminent'),
    },
  };
}
