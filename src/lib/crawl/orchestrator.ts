import { supabaseAdmin } from '@/lib/supabase/server';
import { toJson } from '@/lib/supabase/mappers';
import {
  startCrawl,
  startIncrementalCrawl,
  pollCrawlStatus,
  getCrawlResults,
  extractPriorityLinks,
  crawlSinglePage,
  fetchPageDirect,
  CrawlDisallowedError,
  type CrawlCredentials,
} from '@/services/crawl';
import { saveToCache, loadFromCache } from '@/services/crawl.cache';
import { extractSignals } from '@/services/extract';
import { extractPageSignals } from '@/services/ai';
import { parseHtmlSignals } from '@/lib/crawl/html-parser';
import { normalizeUrl } from '@/lib/url';
import type { RawCrawlResult } from '@/types';
import { logger } from '@/lib/logger';

const MAX_PRIORITY_PAGES = parseInt(process.env.CRAWL_PRIORITY_PAGES ?? '5', 10);
const MAX_TOTAL_PAGES = parseInt(process.env.CRAWL_MAX_PAGES ?? '15', 10);

const EXTRACTION_PROMPT =
  'Analyse the raw HTML of this page and return a JSON object with these exact keys. ' +
  'schemaMarkupTypes: look for <script type="application/ld+json"> tags in the raw HTML; extract the "@type" value from each and return as a string array (e.g. ["LocalBusiness","WebPage"]); return [] if none found. ' +
  'hasBlog: set hasBlog=true if (a) this page IS a blog/articles/news listing, OR (b) there is a nav/footer link whose href contains /blog, /articles, /news, /resources. ' +
  'hasFAQ: set hasFAQ=true if (a) this page IS a FAQ page, OR (b) there is a nav/footer/body link whose href contains /faq, /faqs, /help, /support. ' +
  'accreditations: string array of named regulatory or professional accreditations found anywhere on the page (e.g. "CQC registered", "ISO 9001", "UKAS accredited", "Care Quality Commission"); look for logos, badges, footer text, or "accredited by" phrases. ' +
  'certifications: string array of professional qualifications or certifications mentioned (e.g. "BTEC Level 4", "NVQ", "RGN", "NMC registered"); look for staff credentials, qualification badges, or "qualified" phrases. ' +
  'awardsAndMemberships: string array of industry awards, trade body memberships, or recognised schemes (e.g. "Which? Trusted Trader", "Feefo Gold Award", "British Dental Association member", "Investors in People"); look for badge images, footer logos, or "proud member of" / "award-winning" text. ' +
  'reviewPlatformsLinked: string array of review platform names linked from the page (e.g. "Trustpilot", "Google Reviews", "Feefo", "Checkatrade", "Trustist"); look for outbound links or embedded widgets. ' +
  'teamPageExists: true if the page IS a team/about-us/meet-the-team page, or if there is a prominent nav link to one (e.g. href contains /team, /aboutus, /about-us, /about, /meet-us, /our-team, /people). ' +
  'insuranceMentioned: true if any form of insurance is mentioned (public liability, professional indemnity, fully insured, etc.). ' +
  'guaranteesMentioned: string array of explicit guarantees or warranties mentioned (e.g. "30-day money-back guarantee", "12-month workmanship guarantee"). ' +
  'servicesListed: string array of every distinct service, treatment, or offering explicitly named on the page; look in nav menus, section headings (h2/h3), list items (li), pricing tables, service cards, and any block labelled "services", "treatments", "what we offer", "our work", or similar; use the exact names as written on the page (e.g. "Swedish Massage", "Gel Nails", "Boiler Service", "Wedding Photography"); return [] only if no services are mentioned anywhere. ' +
  'serviceAreasMentioned: string array of geographic locations, towns, counties, or regions explicitly mentioned as service areas; look in footer, "areas we cover", "we serve", address blocks, or page copy. ' +
  'Other keys: title (page title), metaDescription (meta description), h1Tags (array of h1 text), hasSitemap (bool), hasRobotsTxt (bool), internalLinkCount (number), canonicalTagsPresent (bool), altTagCoverage ("full"|"partial"|"none"), hasPortfolio (bool), portfolioItemCount (number), hasContactForm (bool — true if the page contains a <form> element with input fields, a "Contact Us" form, or any embedded form widget regardless of label), hasBookingSystem (bool), bookingProvider (string or null), hasCallToAction (bool), ctaText (string array), hasNewsletterSignup (bool), socialLinksPresent (string array), hasPhoneNumberProminent (bool), newServicesDetected (string array), removedServicesDetected (string array), newTechIntegrations (string array), recentAnnouncementsOrNews (array of {title,date,summary}), recentHiringSignals (string array), newLocationsOrExpansion (string array). ' +
  'sectorSpecific: an object containing sector-specific signals — only populate fields that are clearly evidenced on the page, leave others null or omit them. ' +
  'sectorSpecific.cqcRating: string or null — the CQC inspection rating if explicitly stated (e.g. "Outstanding", "Good", "Requires Improvement", "Inadequate"); look for CQC badge, rating banner, or inspection report link. ' +
  'sectorSpecific.ofstedRating: string or null — the Ofsted inspection rating if explicitly stated (e.g. "Outstanding", "Good", "Requires Improvement", "Inadequate"); look for Ofsted badge, rating text, or inspection report link. ' +
  'sectorSpecific.treatmentsListed: string array — named medical, cosmetic, or aesthetic treatments listed (e.g. "Botox", "dermal fillers", "HRT", "private GP consultation", "IV drip"); look in service lists, treatment menus, or pricing pages. ' +
  'sectorSpecific.consultationBookable: bool or null — true if the page offers a bookable consultation (online or phone); look for "book a consultation", "schedule a call", or a booking widget. ' +
  'sectorSpecific.gasSafeRegistered: bool or null — true if Gas Safe registration is mentioned or a Gas Safe logo/number is present. ' +
  'sectorSpecific.nicEicApproved: bool or null — true if NICEIC or EIC (Electrical Installation Certificate) approval is mentioned or their logo is present. ' +
  'sectorSpecific.trustmarkMember: bool or null — true if TrustMark membership or logo is present. ' +
  'sectorSpecific.dvsaApproved: bool or null — true if DVSA approval or an Approved Driving Instructor (ADI) badge is mentioned. ' +
  'sectorSpecific.passRates: string or null — any stated pass rate or first-time pass rate percentage (e.g. "72% first-time pass rate"); return the raw string as found. ' +
  'sectorSpecific.ageRangesCovered: string array — age ranges or year groups catered for, relevant to nurseries, childminders, or tutors (e.g. "0-5 years", "Key Stage 1", "6 weeks to 5 years").';
const CHALLENGE_TITLES = [
  'one moment, please',
  'just a moment',
  'attention required',
  'access denied',
];
const ERROR_TITLES = ['page not found', '404 not found', 'error 404', '403 forbidden'];
const POPUP_SELECTORS = [
  '.modal',
  '.popup',
  '[class*="overlay"]',
  '[class*="cookie"]',
  '[class*="consent"]',
  '[id*="modal"]',
  '[id*="popup"]',
  '[id*="overlay"]',
];

// Regex patterns to strip common popup/overlay/challenge elements from rendered HTML.
// Each pattern removes the full element including children.
const STRIP_PATTERNS = [
  // Cloudflare challenge containers
  /<div[^>]*id=["']challenge[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
  /<div[^>]*id=["']cf-[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
  // Generic modal/popup/overlay wrappers
  /<div[^>]*class=["'][^"']*\bmodal\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
  /<div[^>]*class=["'][^"']*\bpopup\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
  /<div[^>]*class=["'][^"']*\boverlay\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
  /<div[^>]*id=["'][^"']*modal[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
  /<div[^>]*id=["'][^"']*popup[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
  /<div[^>]*id=["'][^"']*overlay[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
  // Cookie/consent banners
  /<div[^>]*class=["'][^"']*\bcookie\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
  /<div[^>]*class=["'][^"']*\bconsent\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
  /<div[^>]*id=["'][^"']*cookie[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
  /<div[^>]*id=["'][^"']*consent[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
];

// Challenge pages often overwrite <title> — these are the real title patterns to restore from <meta> or <og:title>
function stripPopupOverlays(html: string): { html: string; strippedCount: number } {
  let stripped = html;
  let strippedCount = 0;
  for (const pattern of STRIP_PATTERNS) {
    const before = stripped;
    stripped = stripped.replace(pattern, '');
    if (stripped !== before) strippedCount++;
  }

  // If the title looks like a challenge page, try to restore from og:title or meta title
  const lower = stripped.toLowerCase();
  const titleMatch = lower.match(/<title[^>]*>([\s\S]*?)<\/title>/);
  const currentTitle = titleMatch?.[1]?.trim() ?? '';
  if (CHALLENGE_TITLES.some((t) => currentTitle.includes(t))) {
    const ogMatch =
      html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    if (ogMatch?.[1]) {
      stripped = stripped.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${ogMatch[1]}</title>`);
      strippedCount++;
    }
  }

  return { html: stripped, strippedCount };
}

type BlockReason = 'challenge_or_popup' | 'error_page' | 'empty_html';

interface PageDiagnostics {
  unusable: boolean;
  reason: string | null;
  blockType: BlockReason | null;
  title: string;
  h1: string;
  htmlLength: number;
  hasPopupSignals: boolean;
  popupSelectors: string[];
  internalLinkCount: number;
}

function diagnosePage(html: string): PageDiagnostics {
  const base: PageDiagnostics = {
    unusable: false,
    reason: null,
    blockType: null,
    title: '',
    h1: '',
    htmlLength: html?.length ?? 0,
    hasPopupSignals: false,
    popupSelectors: [],
    internalLinkCount: 0,
  };

  if (!html || html.length < 300) {
    return {
      ...base,
      unusable: true,
      blockType: 'empty_html',
      reason: html ? `HTML too short (${html.length} chars)` : 'Empty HTML',
    };
  }

  const lower = html.toLowerCase();
  const titleMatch = lower.match(/<title[^>]*>([\s\S]*?)<\/title>/);
  base.title = titleMatch?.[1]?.trim() ?? '';

  const h1Match = lower.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  base.h1 = h1Match?.[1]?.trim() ?? '';

  // Count internal links as a content quality signal
  const linkMatches = lower.match(/<a\s[^>]*href/g);
  base.internalLinkCount = linkMatches?.length ?? 0;

  // Check for popup/modal/overlay indicators in HTML
  const matchedSelectors = POPUP_SELECTORS.filter((sel) => {
    const attr = sel.startsWith('.')
      ? `class="${sel.slice(1)}`
      : sel.startsWith('[')
        ? sel.replace(/[\[\]]/g, '').replace('*=', '="')
        : sel;
    return lower.includes(attr.replace(/"/g, '').toLowerCase());
  });
  if (matchedSelectors.length > 0) {
    base.hasPopupSignals = true;
    base.popupSelectors = matchedSelectors;
  }

  // Challenge / bot-protection / popup pages — the HTML content (including h1) is NOT real site content
  const matchedChallenge = CHALLENGE_TITLES.find((t) => base.title.includes(t));
  if (matchedChallenge) {
    return {
      ...base,
      unusable: true,
      blockType: 'challenge_or_popup',
      reason: `Bot challenge or popup blocking page (title: "${base.title}"). Page content (including h1) is from the challenge screen, not the real site.`,
    };
  }

  // Actual error pages
  const matchedError = ERROR_TITLES.find((t) => base.title.includes(t));
  if (matchedError) {
    return {
      ...base,
      unusable: true,
      blockType: 'error_page',
      reason: `Error page (title: "${base.title}")`,
    };
  }
  if (/^\s*404\s*$/.test(base.h1)) {
    // Only flag as error if the title doesn't suggest a challenge page
    return { ...base, unusable: true, blockType: 'error_page', reason: `Error page (h1: "404")` };
  }

  return base;
}

function isUnusablePage(html: string): boolean {
  return diagnosePage(html).unusable;
}

function getCredentials(): CrawlCredentials {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  if (!accountId || !apiToken)
    throw new Error('CF_ACCOUNT_ID or CF_API_TOKEN not set in environment');
  return { accountId, apiToken };
}

/** Sentinel jobId returned when direct fetch fallback handled signals inline. */
export const DIRECT_FETCH_DONE = 'direct-fetch-done';
/** Sentinel jobId returned when crawl was disallowed and direct fetch also failed. */
export const CRAWL_DISALLOWED = 'crawl-disallowed';

/** Begin a crawl for a business. Updates crawl_status to 'running'. Returns the CF job ID. */
export async function startBusinessCrawl(
  businessId: string,
  mode: 'initial' | 'incremental',
): Promise<string> {
  const { data: business, error } = await supabaseAdmin
    .from('businesses')
    .select('url, last_crawled_at')
    .eq('id', businessId)
    .single();

  if (error || !business) throw new Error(`Business not found: ${businessId}`);

  const normalizedUrl = normalizeUrl(business.url as string);

  const credentials = getCredentials();
  const isIncremental = mode === 'incremental' && !!business.last_crawled_at;

  let jobId: string;
  try {
    jobId = isIncremental
      ? await startIncrementalCrawl(
          normalizedUrl,
          new Date(business.last_crawled_at as string).getTime(),
          credentials,
        )
      : await startCrawl(
          normalizedUrl,
          {
            maxPages: Math.max(1, MAX_TOTAL_PAGES - MAX_PRIORITY_PAGES),
            render: true,
            jsonOptions: { prompt: EXTRACTION_PROMPT },
            gotoOptions: { waitUntil: 'networkidle0' },
          },
          credentials,
        );
  } catch (e) {
    if (e instanceof CrawlDisallowedError) {
      logger.warn('crawl', 'CF crawl disallowed — trying direct fetch fallback', {
        url: normalizedUrl,
      });
      const html = await fetchPageDirect(normalizedUrl);

      if (html) {
        // Direct fetch succeeded — extract and persist signals inline
        const directResult: RawCrawlResult = {
          status: 'completed',
          pages: [{ url: normalizedUrl, html }],
        };
        await extractAndPersistSignals(businessId, DIRECT_FETCH_DONE, directResult);

        // Write a non-blocking warning so the UI can note reduced data quality
        await supabaseAdmin
          .from('businesses')
          .update({
            enrichment_errors: {
              crawl:
                'This website blocks automated crawling. We fetched a basic version of the page, so some data may be incomplete.',
            },
          })
          .eq('id', businessId);

        logger.info('crawl', 'Direct fetch fallback succeeded', { url: normalizedUrl });
        return DIRECT_FETCH_DONE;
      }

      // Direct fetch also failed — mark as disallowed
      logger.error('crawl', 'Direct fetch also failed', { url: normalizedUrl });
      await supabaseAdmin
        .from('businesses')
        .update({
          enrichment_errors: {
            crawl:
              'This website has blocked all automated access. Website data could not be collected for this business.',
          },
        })
        .eq('id', businessId);
      return CRAWL_DISALLOWED;
    }
    throw e; // Re-throw non-disallowed errors
  }

  const { error: statusError } = await supabaseAdmin
    .from('businesses')
    .update({ crawl_status: 'running', crawl_job_id: jobId })
    .eq('id', businessId);
  if (statusError) throw new Error(`Failed to update crawl status: ${statusError.message}`);

  // Supersede any pre-existing running jobs so the stale check doesn't false-positive on retry
  await supabaseAdmin
    .from('crawl_jobs')
    .update({ status: 'failed', completed_at: new Date().toISOString() })
    .eq('business_id', businessId)
    .eq('status', 'running');

  await supabaseAdmin.from('crawl_jobs').insert({
    business_id: businessId,
    cf_job_id: jobId,
    mode,
    status: 'running',
    started_at: new Date().toISOString(),
  });

  return jobId;
}

/** Poll the crawl status for a given job. */
export async function checkCrawlStatus(_businessId: string, jobId: string): Promise<string> {
  const credentials = getCredentials();
  const result = await pollCrawlStatus(jobId, credentials);
  return result.status;
}

/** Fetch crawl results, extract signals, persist to DB, and mark the business complete.
 * `bypassCache` forces fresh results — required for confirmation crawls, which exist
 * to independently reproduce a change and must never re-read the data being verified. */
export async function extractAndPersistSignals(
  businessId: string,
  jobId: string,
  prefetchedResult?: RawCrawlResult,
  opts?: { bypassCache?: boolean },
): Promise<void> {
  const credentials = getCredentials();

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('url')
    .eq('id', businessId)
    .single();

  const url = business?.url ? normalizeUrl(business.url as string) : undefined;
  const cached = url && !opts?.bypassCache ? loadFromCache(url) : null;
  const rootResult = prefetchedResult ?? cached ?? (await getCrawlResults(jobId, credentials));

  // Multi-page: extract priority links from root HTML and crawl them in parallel
  let rawResult: RawCrawlResult = rootResult;
  if (!cached && url && rootResult.pages.length > 0) {
    const rootHtml = rootResult.pages[0]?.html ?? '';

    // Detect bot-check / redirect / popup pages and retry with longer JS wait
    const rootDiag = diagnosePage(rootHtml);
    if (rootHtml && rootDiag.unusable) {
      const diagLog = {
        url,
        blockType: rootDiag.blockType,
        reason: rootDiag.reason,
        title: rootDiag.title,
        htmlLength: rootDiag.htmlLength,
        hasPopupSignals: rootDiag.hasPopupSignals,
        popupSelectors: rootDiag.popupSelectors,
        internalLinkCount: rootDiag.internalLinkCount,
        // Only include h1 for actual error pages — on challenge/popup pages the h1 is from the blocker, not the real site
        ...(rootDiag.blockType === 'error_page' ? { h1: rootDiag.h1 } : {}),
      };
      logger.warn('crawl', 'Unusable root page', { jobId, diagnostics: diagLog });

      // Strip popup/overlay elements from the rendered HTML — real content is likely underneath
      const { html: strippedHtml, strippedCount } = stripPopupOverlays(rootHtml);
      const strippedDiag = diagnosePage(strippedHtml);

      if (strippedCount > 0) {
        logger.info('crawl', 'Stripped popup/overlay patterns', {
          strippedCount,
          url,
          beforeChars: rootHtml.length,
          afterChars: strippedHtml.length,
        });
      }

      if (!strippedDiag.unusable && strippedHtml.length > 500) {
        logger.info('crawl', 'Stripped HTML is usable — using cleaned version', { url });
        rawResult = {
          status: 'completed',
          pages: [{ ...rootResult.pages[0], html: strippedHtml }, ...rootResult.pages.slice(1)],
        };
      } else {
        // Stripping didn't help — retry with networkidle0 + longer timeout
        logger.warn(
          'crawl',
          "Stripping didn't recover usable content — retrying with networkidle0 + 30s timeout",
          { url },
        );
        await new Promise((r) => setTimeout(r, 5000));
        const retryPage = await crawlSinglePage(url, EXTRACTION_PROMPT, credentials, {
          gotoOptions: { waitUntil: 'networkidle0', timeout: 30000 },
        });

        // Also try stripping the retry result
        let retryHtml = retryPage?.html ?? '';
        if (retryHtml && diagnosePage(retryHtml).unusable) {
          const retryStripped = stripPopupOverlays(retryHtml);
          if (retryStripped.strippedCount > 0) {
            logger.info('crawl', 'Stripped patterns from retry result', {
              strippedCount: retryStripped.strippedCount,
              url,
            });
            retryHtml = retryStripped.html;
          }
        }

        const retryDiag = retryHtml ? diagnosePage(retryHtml) : null;
        if (retryDiag && !retryDiag.unusable && retryHtml.length > 500) {
          logger.info('crawl', 'Retry succeeded', {
            url,
            popupSignals: retryDiag.hasPopupSignals,
            popupSelectors: retryDiag.popupSelectors,
          });
          rawResult = {
            status: 'completed',
            pages: [
              {
                ...rootResult.pages[0],
                html: retryHtml,
                ...(retryPage ? { url: retryPage.url } : {}),
              },
              ...rootResult.pages.slice(1),
            ],
          };
        } else {
          const finalDiag = retryDiag ?? strippedDiag;
          const finalLog = {
            blockType: finalDiag.blockType,
            reason: finalDiag.reason,
            title: finalDiag.title,
            htmlLength: finalDiag.htmlLength,
            hasPopupSignals: finalDiag.hasPopupSignals,
            popupSelectors: finalDiag.popupSelectors,
            internalLinkCount: finalDiag.internalLinkCount,
            ...(finalDiag.blockType === 'error_page' ? { h1: finalDiag.h1 } : {}),
          };
          logger.error('crawl', 'Retry failed — page remains unusable', {
            url,
            diagnostics: finalLog,
          });

          const userMessage =
            finalDiag.blockType === 'challenge_or_popup'
              ? 'This website has a popup or bot challenge that blocks automated crawling. The page content could not be read.'
              : finalDiag.blockType === 'error_page'
                ? 'This website returned an error page. It may be temporarily down or the URL may be incorrect.'
                : 'This website could not be crawled — it may be temporarily unavailable. Re-scanning may resolve this.';

          await supabaseAdmin
            .from('businesses')
            .update({
              enrichment_errors: {
                crawl: userMessage,
                crawl_block_type: finalDiag.blockType,
                crawl_blocked_reason: finalDiag.reason,
                crawl_popup_detected: finalDiag.hasPopupSignals,
                crawl_popup_selectors:
                  finalDiag.popupSelectors.length > 0 ? finalDiag.popupSelectors : null,
              },
            })
            .eq('id', businessId);

          // Remove the unusable root page from results so sub-page signals aren't contaminated
          // by challenge page titles/h1s — sub-pages will provide the real data
          rawResult = { ...rawResult, pages: rawResult.pages.slice(1) };
          logger.info('crawl', 'Removed unusable root page from results', {
            subPagesRemaining: rawResult.pages.length,
          });
        }
      }
    } else if (rootHtml && rootDiag.hasPopupSignals) {
      // Page is usable but has popup indicators — log as warning for monitoring
      logger.warn('crawl', 'Popup signals detected (page still usable)', {
        url,
        popupSelectors: rootDiag.popupSelectors,
        internalLinkCount: rootDiag.internalLinkCount,
      });
    }

    if (!rootHtml) {
      logger.warn('crawl', 'Root page HTML is empty — multi-page enrichment will be skipped', {
        jobId,
      });
    }
    const extraLimit = Math.min(MAX_PRIORITY_PAGES, MAX_TOTAL_PAGES - rawResult.pages.length);

    // Use root HTML for link extraction; if root was unusable, try the first available sub-page
    const htmlForLinks =
      rootHtml && !rootDiag.unusable ? rootHtml : rawResult.pages.find((p) => p.html)?.html;

    if (htmlForLinks && extraLimit > 0) {
      let priorityLinks = extractPriorityLinks(htmlForLinks, url, extraLimit);
      logger.info('crawl', 'Found priority pages to crawl', {
        count: priorityLinks.length,
        priorityLinks,
      });

      // Fallback: if no links found from HTML (JS-rendered nav), probe common paths
      if (priorityLinks.length === 0) {
        const base = new URL(url).origin;
        const fallbackPaths = [
          '/about',
          '/about-us',
          '/accreditations',
          '/awards',
          '/quality',
          '/services',
          '/contact',
        ];
        priorityLinks = fallbackPaths.map((p) => base + p).slice(0, extraLimit);
        logger.info('crawl', 'No links found in HTML — falling back to common paths', {
          priorityLinks,
        });
      }

      if (priorityLinks.length > 0) {
        const extraPages = await Promise.all(
          priorityLinks.map((link) => crawlSinglePage(link, EXTRACTION_PROMPT, credentials)),
        );
        const validPages = extraPages.filter(
          (p): p is RawCrawlResult['pages'][0] => p !== null && !isUnusablePage(p.html ?? ''),
        );

        if (validPages.length > 0) {
          rawResult = { status: 'completed', pages: [...rootResult.pages, ...validPages] };
          logger.info('crawl', 'Merged extra pages', {
            merged: validPages.length,
            total: rawResult.pages.length,
          });
          logger.info('crawl', 'Pages after merge', {
            pages: rawResult.pages.map((p) => ({
              url: p.url,
              hasHtml: !!p.html,
              htmlLen: p.html?.length ?? 0,
            })),
          });
        }
      }
    }

    if (url) saveToCache(url, rawResult);
  }

  // Deduplicate pages by URL (single-page sites can produce duplicates via priority crawls)
  const seenUrls = new Set<string>();
  const dedupedPages = rawResult.pages.filter((p) => {
    try {
      const parsed = new URL(p.url);
      const key = parsed.origin + parsed.pathname.replace(/\/$/, '');
      if (seenUrls.has(key)) return false;
      seenUrls.add(key);
      return true;
    } catch {
      return true; // keep pages with unparseable URLs rather than crashing
    }
  });
  if (dedupedPages.length < rawResult.pages.length) {
    logger.info('crawl', 'Deduped duplicate pages', {
      deduped: rawResult.pages.length - dedupedPages.length,
    });
    rawResult = { ...rawResult, pages: dedupedPages };
  }

  // CF crawl doesn't return json field — extract signals from HTML via Claude
  const needsExtraction = rawResult.pages.some(
    (p) => (!p.json || Object.keys(p.json).length === 0) && !!p.html,
  );
  let extractFailures = 0;
  let extractAttempts = 0;
  if (needsExtraction) {
    const pagesToExtract = rawResult.pages.slice(0, 5);
    const settled = await Promise.allSettled(
      pagesToExtract.map((p) =>
        p.html ? extractPageSignals(p.html, EXTRACTION_PROMPT) : Promise.resolve({}),
      ),
    );
    const extracted = settled.map((r) => {
      if (r.status === 'fulfilled') return r.value;
      extractFailures++;
      return {} as Record<string, unknown>;
    });
    extractAttempts = pagesToExtract.filter((p) => !!p.html).length;
    rawResult = {
      ...rawResult,
      pages: rawResult.pages.map((p, i) => (i < 5 ? { ...p, json: extracted[i] } : p)),
    };
    logger.info('crawl', 'Extracted signals from HTML', {
      pages: pagesToExtract.length,
      failures: extractFailures,
    });
  }

  // Always apply deterministic HTML parsing on top of AI-extracted json.
  // AI often returns empty strings for metadata fields even when the HTML contains them.
  // For array fields, union-merge so neither AI nor deterministic results are lost.
  const MERGE_ARRAY_KEYS = [
    'servicesListed',
    'serviceAreasMentioned',
    'h1Tags',
    'accreditations',
    'certifications',
    'awardsAndMemberships',
    'reviewPlatformsLinked',
    'guaranteesMentioned',
    'ctaText',
    'socialLinksPresent',
    'schemaMarkupTypes',
  ];
  rawResult = {
    ...rawResult,
    pages: rawResult.pages.map((p) => {
      if (!p.html) return p;
      const parsed = parseHtmlSignals(p.html, p.url);
      const aiJson = (p.json ?? {}) as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...aiJson, ...parsed };
      for (const key of MERGE_ARRAY_KEYS) {
        const a = aiJson[key],
          b = (parsed as Record<string, unknown>)[key];
        if (Array.isArray(a) && Array.isArray(b)) merged[key] = [...new Set([...a, ...b])];
      }
      return { ...p, json: merged };
    }),
  };

  const signals = await extractSignals(rawResult);
  logger.info('crawl', 'Engagement signals', {
    businessId,
    hasPhoneNumberProminent: signals.engagement.hasPhoneNumberProminent,
    hasContactForm: signals.engagement.hasContactForm,
    hasCallToAction: signals.engagement.hasCallToAction,
    h1TagCount: signals.seo.h1Tags.length,
    schemaMarkupTypes: signals.seo.schemaMarkupTypes,
  });

  // Archive previous signals
  await supabaseAdmin
    .from('extracted_signals')
    .update({ is_current: false })
    .eq('business_id', businessId)
    .eq('is_current', true);

  // Insert new signals
  const { error: insertError } = await supabaseAdmin.from('extracted_signals').insert({
    business_id: businessId,
    is_current: true,
    seo: toJson(signals.seo),
    trust: toJson(signals.trust),
    content: toJson(signals.content),
    engagement: toJson(signals.engagement),
  });
  if (insertError) throw new Error(`Failed to insert signals: ${insertError.message}`);

  // Merge enrichment_errors so we can flag an extract failure without clobbering other fields.
  const { data: existingErrRow } = await supabaseAdmin
    .from('businesses')
    .select('enrichment_errors')
    .eq('id', businessId)
    .single();
  const existingErrs = (existingErrRow?.enrichment_errors ?? {}) as Record<string, string>;
  const nextErrs: Record<string, string> = { ...existingErrs };
  // Flag on ANY extract failure — partial failures still corrupt downstream signals.
  if (extractFailures > 0 && extractAttempts > 0) {
    const ratio = `${extractFailures}/${extractAttempts}`;
    nextErrs.extract =
      extractFailures === extractAttempts
        ? 'Page-signal extraction failed — some on-site recommendations may be unavailable.'
        : `Page-signal extraction partially failed (${ratio} pages) — some on-site recommendations may be unavailable.`;
  } else {
    delete nextErrs.extract;
  }

  const { error: updateError } = await supabaseAdmin
    .from('businesses')
    .update({
      last_crawled_at: new Date().toISOString(),
      enrichment_errors: Object.keys(nextErrs).length > 0 ? nextErrs : null,
    })
    .eq('id', businessId);
  if (updateError) throw new Error(`Failed to update last_crawled_at: ${updateError.message}`);

  await supabaseAdmin
    .from('crawl_jobs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('cf_job_id', jobId);
}

/** Mark a business crawl as failed. Stamps last_crawled_at so a failed attempt still advances the
 * weekly cadence — otherwise the health-check cron would re-queue a hard-failing business every day. */
export async function markCrawlFailed(businessId: string, jobId?: string): Promise<void> {
  await supabaseAdmin
    .from('businesses')
    .update({ crawl_status: 'failed', last_crawled_at: new Date().toISOString() })
    .eq('id', businessId);

  if (jobId) {
    await supabaseAdmin
      .from('crawl_jobs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('cf_job_id', jobId);
  }
}
