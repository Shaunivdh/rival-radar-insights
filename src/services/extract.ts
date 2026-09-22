import type { RawCrawlResult, ExtractedSignals } from '@/types';

type PageJson = Record<string, unknown>;

/** Titles that indicate a bot challenge or loading screen — not real site content. */
const CHALLENGE_TITLES = [
  'one moment, please',
  'just a moment',
  'attention required',
  'access denied',
];

function pickStr(
  pages: PageJson[],
  key: string,
  fallback = '',
  skipChallengeTitles = false,
): string {
  for (const p of pages) {
    const v = p[key];
    if (typeof v === 'string' && v) {
      if (skipChallengeTitles && CHALLENGE_TITLES.some((t) => v.toLowerCase().includes(t)))
        continue;
      return v;
    }
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

// Headings that leak into servicesListed from nav/footer/blog sections but are never services
const NON_SERVICE_RE =
  /^(recent posts?|latest (posts?|news|articles?)|blog|news|brands?|our brands|categories|archives?|tags?|search|menu|quick links|useful links|follow us|connect with us|find us( on)?|subscribe|newsletter|sign (in|up)|log ?in|register|privacy policy|terms( (&|and) conditions)?|cookie policy|sitemap|faqs?|testimonials?|reviews?|gallery|portfolio|about( us)?|contact( us)?|home|book (now|online)|opening (hours|times)|our (story|team)|meet the team)$/i;
// Years, "est. 2005", © marks — business-name/footer fragments, not services
const NON_SERVICE_HINT_RE = /\b(19|20)\d{2}\b|[©®™]/;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Drop nav/blog/footer junk that heading-based extraction misreads as services. */
function sanitizeServices(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const s = decodeEntities(raw);
    if (s.length < 3 || s.length > 60) continue;
    if (NON_SERVICE_RE.test(s) || NON_SERVICE_HINT_RE.test(s)) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
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
      title: pickStr(pages, 'title', '', true),
      metaDescription: pickStr(pages, 'metaDescription'),
      h1Tags: mergeStringArrays(pages, 'h1Tags'),
      hasSitemap: pickBool(pages, 'hasSitemap'),
      hasRobotsTxt: pickBool(pages, 'hasRobotsTxt'),
      internalLinkCount: maxNum(pages, 'internalLinkCount'),
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
      servicesListed: sanitizeServices(mergeStringArrays(pages, 'servicesListed')),
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
