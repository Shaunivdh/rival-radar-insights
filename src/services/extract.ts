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
  /^(recent posts?|latest (posts?|news|articles?|offers?)|blog|news|brands?|our brands|categories|archives?|tags?|search|menu|quick links|useful links|follow us|connect with us|find us( on)?|subscribe|newsletter|sign (in|up)|log ?in|register|privacy policy|terms( (&|and) conditions)?|cookie policy|sitemap|faqs?|testimonials?|reviews?|gallery|portfolio|about( us)?|contact( us)?|home|book (now|online)|opening (hours|times)|our (story|team|promise)|meet the team|why choose us|why (us|choose [\w\s]+)|get in touch|how it works)$/i;
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

/** Hosted-form embeds that never render a native <form> in the page HTML. */
const EMBEDDED_FORM_IFRAME_RE =
  /<iframe\b[^>]*\bsrc=["'][^"']*(?:typeform\.com|hsforms\.net|jotform\.com|forms\.gle|tally\.so|cognitoforms\.com)[^"']*["']/i;
const HUBSPOT_FORM_SCRIPT_RE = /hbspt\.forms\.create\s*\(/i;

/** Returns true if the HTML contains a native form with inputs or a known embedded form widget. */
export function htmlHasContactFormMarkup(html: string): boolean {
  if (/<form[\s>]/i.test(html) && /<input[\s>]/i.test(html)) return true;
  return EMBEDDED_FORM_IFRAME_RE.test(html) || HUBSPOT_FORM_SCRIPT_RE.test(html);
}

/** Deterministic fallback for hasContactForm across all crawled pages (native forms + embeds). */
function htmlHasContactForm(rawResult: RawCrawlResult): boolean {
  return rawResult.pages.some((p) => htmlHasContactFormMarkup(p.html ?? ''));
}

/**
 * h1 count on the root (home) page only. null when the root page is unusable —
 * no HTML, or a bot-challenge title — so `missing_h1` stays silent rather than
 * claiming the homepage has no heading.
 */
function homepageH1Count(rawResult: RawCrawlResult): number | null {
  const root = rawResult.pages[0];
  if (!root?.html) return null;
  const titleMatch = root.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (titleMatch?.[1] ?? '').toLowerCase();
  if (CHALLENGE_TITLES.some((t) => title.includes(t))) return null;
  const h1s = (root.json as PageJson | undefined)?.h1Tags;
  if (Array.isArray(h1s)) return h1s.filter((h) => typeof h === 'string' && h.trim()).length;
  return [...root.html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].filter((m) =>
    m[1].replace(/<[^>]+>/g, '').trim(),
  ).length;
}

/** Aggregate extracted JSON blobs from all crawl pages into a single ExtractedSignals object. */
export async function extractSignals(rawResult: RawCrawlResult): Promise<ExtractedSignals> {
  const pages = rawResult.pages.map((p) => (p.json ?? {}) as PageJson);

  return {
    seo: {
      title: pickStr(pages, 'title', '', true),
      metaDescription: pickStr(pages, 'metaDescription'),
      h1Tags: mergeStringArrays(pages, 'h1Tags'),
      homepageH1Count: homepageH1Count(rawResult),
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
