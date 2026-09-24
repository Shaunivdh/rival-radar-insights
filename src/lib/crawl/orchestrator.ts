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
import { parseHtmlSignals, mergePageSignals } from '@/lib/crawl/html-parser';
import { checkDirectSignals } from '@/lib/crawl/direct-checks';
import { EXTRACTION_PROMPT } from '@/lib/crawl/extraction-prompt';
import { normalizeUrl } from '@/lib/url';
import type { RawCrawlResult } from '@/types';
import { logger } from '@/lib/logger';

const MAX_PRIORITY_PAGES = parseInt(process.env.CRAWL_PRIORITY_PAGES ?? '5', 10);
const MAX_TOTAL_PAGES = parseInt(process.env.CRAWL_MAX_PAGES ?? '15', 10);
/**
 * Pages sent to the AI extractor, in order: root page, then priority pages
 * (services/about/contact/accreditations), then remaining CF-discovered pages.
 * Haiku 4.5 at ~7k input tokens/page ≈ $0.008/page → 8 pages ≈ $0.06 per crawl.
 */
const MAX_AI_EXTRACT_PAGES = parseInt(process.env.CRAWL_AI_EXTRACT_PAGES ?? '8', 10);

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
            gotoOptions: { waitUntil: 'networkidle0', timeout: 30000 },
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
  // Set when the unusable root is removed below, so the merge does not treat the
  // first surviving sub-page as the root and hand it the root ordering slot.
  let rootPageDropped = false;
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
          rootPageDropped = true;
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
          // Order matters for extraction: root first, then priority pages, then the
          // rest of the CF-discovered pages — so the pages that carry the most
          // signals fall inside the AI-extraction cap.
          // Source from rawResult, not rootResult: rawResult carries the retried or
          // popup-stripped root page. Rebuilding from rootResult silently discarded
          // a successful retry.
          // When the root was dropped as unusable there is no root to lead with, and
          // every surviving page is a discovered sub-page.
          const rootPage = rootPageDropped ? null : (rawResult.pages[0] ?? null);
          const discovered = rootPageDropped ? rawResult.pages : rawResult.pages.slice(1);
          rawResult = {
            status: 'completed',
            pages: [...(rootPage ? [rootPage] : []), ...validPages, ...discovered],
          };
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
    const pagesToExtract = rawResult.pages.slice(0, MAX_AI_EXTRACT_PAGES);
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
      pages: rawResult.pages.map((p, i) =>
        i < MAX_AI_EXTRACT_PAGES ? { ...p, json: extracted[i] } : p,
      ),
    };
    logger.info('crawl', 'Extracted signals from HTML', {
      pages: pagesToExtract.length,
      failures: extractFailures,
    });
  }

  // Always apply deterministic HTML parsing on top of AI-extracted json.
  // AI often returns empty strings for metadata fields even when the HTML contains them.
  // For array fields, union-merge so neither AI nor deterministic results are lost.
  rawResult = {
    ...rawResult,
    pages: rawResult.pages.map((p) => {
      if (!p.html) return p;
      const parsed = parseHtmlSignals(p.html, p.url);
      const aiJson = (p.json ?? {}) as Record<string, unknown>;
      return { ...p, json: mergePageSignals(aiJson, parsed) };
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

  // robots.txt and sitemap.xml never appear in page HTML, so the parser and the
  // AI extractor always report them absent. Probe them directly and override
  // before the insert, so every caller — main scan, confirmation crawl and both
  // direct-fetch fallbacks — persists the same fields the same way. Skewing this
  // per call site makes two snapshots disagree by construction, and the diff then
  // reports a phantom robots/sitemap change on every comparison.
  if (url) {
    const { hasRobotsTxt, hasSitemap } = await checkDirectSignals(url);
    logger.info('direct-checks', 'robots/sitemap probe', {
      url,
      robots: hasRobotsTxt,
      sitemap: hasSitemap,
    });
    // Only override upwards: a failed probe returns false and must not erase a
    // positive the crawl somehow found.
    if (hasRobotsTxt) signals.seo.hasRobotsTxt = true;
    if (hasSitemap) signals.seo.hasSitemap = true;
  }

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
