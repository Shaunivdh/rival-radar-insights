import { supabaseAdmin } from '@/lib/supabase/server';
import { startCrawl, startIncrementalCrawl, pollCrawlStatus, getCrawlResults, extractPriorityLinks, crawlSinglePage, type CrawlCredentials } from '@/services/crawl';
import { saveToCache, loadFromCache } from '@/services/crawl.cache';
import { extractSignals } from '@/services/extract';
import { extractPageSignals } from '@/services/ai';
import { parseHtmlSignals } from '@/lib/crawl/html-parser';
import { normalizeUrl } from '@/lib/url';
import type { RawCrawlResult } from '@/types';

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
const UNUSABLE_TITLES = ['one moment, please', 'just a moment', 'attention required', 'access denied', 'page not found', '404 not found', 'error 404', '403 forbidden'];

function isUnusablePage(html: string): boolean {
  if (!html || html.length < 300) return true;
  const lower = html.toLowerCase();
  const titleMatch = lower.match(/<title[^>]*>([\s\S]*?)<\/title>/);
  const title = titleMatch?.[1]?.trim().toLowerCase() ?? '';
  if (UNUSABLE_TITLES.some(t => title.includes(t))) return true;
  // 404 in h1 is a strong signal
  const h1Match = lower.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const h1 = h1Match?.[1]?.trim() ?? '';
  if (/^\s*404\s*$/.test(h1)) return true;
  return false;
}

function getCredentials(): CrawlCredentials {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  if (!accountId || !apiToken) throw new Error('CF_ACCOUNT_ID or CF_API_TOKEN not set in environment');
  return { accountId, apiToken };
}

/** Begin a crawl for a business. Updates crawl_status to 'running'. Returns the CF job ID. */
export async function startBusinessCrawl(
  businessId: string,
  mode: 'initial' | 'incremental'
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

  const jobId = isIncremental
    ? await startIncrementalCrawl(
        normalizedUrl,
        new Date(business.last_crawled_at as string).getTime(),
        credentials
      )
    : await startCrawl(
        normalizedUrl,
        {
          maxDepth: 3,
          maxPages: Math.max(1, MAX_TOTAL_PAGES - MAX_PRIORITY_PAGES),
          render: true,
          waitUntil: 'networkidle0',
          outputFormats: ['json', 'markdown', 'html'],
          jsonOptions: { prompt: EXTRACTION_PROMPT },
        },
        credentials
      );

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

/** Fetch crawl results, extract signals, persist to DB, and mark the business complete. */
export async function extractAndPersistSignals(
  businessId: string,
  jobId: string
): Promise<void> {
  const credentials = getCredentials();

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('url')
    .eq('id', businessId)
    .single();

  const url = business?.url ? normalizeUrl(business.url as string) : undefined;
  const cached = url ? loadFromCache(url) : null;
  const rootResult = cached ?? await getCrawlResults(jobId, credentials);

  // Multi-page: extract priority links from root HTML and crawl them in parallel
  let rawResult: RawCrawlResult = rootResult;
  if (!cached && url && rootResult.pages.length > 0) {
    const rootHtml = rootResult.pages[0]?.html ?? '';

    // Detect bot-check / redirect pages and retry once before proceeding
    if (rootHtml && isUnusablePage(rootHtml)) {
      console.warn(`[crawl] Root page for job ${jobId} looks like a bot-check or error page — retrying root URL`);
      await new Promise(r => setTimeout(r, 5000));
      const retryPage = await crawlSinglePage(url, EXTRACTION_PROMPT, credentials);
      if (retryPage && !isUnusablePage(retryPage.html ?? '')) {
        console.log(`[crawl] Retry succeeded for ${url}`);
        rawResult = { status: 'completed', pages: [retryPage, ...rootResult.pages.slice(1)] };
      } else {
        console.warn(`[crawl] Retry also returned unusable page for ${url} — flagging in DB`);
        await supabaseAdmin.from('businesses').update({
          enrichment_errors: { crawl: 'This website could not be crawled — it may use bot protection or be temporarily unavailable. Re-scanning may resolve this.' }
        }).eq('id', businessId);
      }
    }

    if (!rootHtml) {
      console.warn(`[crawl] Root page HTML is empty for job ${jobId} — multi-page enrichment will be skipped`);
    }
    const extraLimit = Math.min(MAX_PRIORITY_PAGES, Math.max(MAX_PRIORITY_PAGES, MAX_TOTAL_PAGES - rootResult.pages.length));

    if (rootHtml && extraLimit > 0) {
      let priorityLinks = extractPriorityLinks(rootHtml, url, extraLimit);
      console.log(`[crawl] Found ${priorityLinks.length} priority pages to crawl:`, priorityLinks);

      // Fallback: if no links found from HTML (JS-rendered nav), probe common paths
      if (priorityLinks.length === 0) {
        const base = new URL(url).origin;
        const fallbackPaths = ['/about', '/about-us', '/accreditations', '/awards', '/quality', '/services', '/contact'];
        priorityLinks = fallbackPaths.map(p => base + p).slice(0, extraLimit);
        console.log(`[crawl] No links found in HTML — falling back to common paths:`, priorityLinks);
      }

      if (priorityLinks.length > 0) {
        const extraPages = await Promise.all(
          priorityLinks.map(link => crawlSinglePage(link, EXTRACTION_PROMPT, credentials))
        );
        const validPages = extraPages.filter((p): p is RawCrawlResult['pages'][0] => p !== null && !isUnusablePage(p.html ?? ''));

        if (validPages.length > 0) {
          rawResult = { status: 'completed', pages: [...rootResult.pages, ...validPages] };
          console.log(`[crawl] Merged ${validPages.length} extra pages. Total: ${rawResult.pages.length}`);
          console.log(`[crawl] Pages after merge:`, rawResult.pages.map(p => ({ url: p.url, hasHtml: !!p.html, htmlLen: p.html?.length ?? 0 })));
        }
      }
    }

    if (url) saveToCache(url, rawResult);
  }

  // Deduplicate pages by URL (single-page sites can produce duplicates via priority crawls)
  const seenUrls = new Set<string>();
  const dedupedPages = rawResult.pages.filter(p => {
    const key = p.url ? new URL(p.url).origin + new URL(p.url).pathname.replace(/\/$/, '') : '';
    if (seenUrls.has(key)) return false;
    seenUrls.add(key);
    return true;
  });
  if (dedupedPages.length < rawResult.pages.length) {
    console.log(`[crawl] Deduped ${rawResult.pages.length - dedupedPages.length} duplicate pages`);
    rawResult = { ...rawResult, pages: dedupedPages };
  }

  // CF crawl doesn't return json field — extract signals from HTML via Claude
  const needsExtraction = rawResult.pages.some(p => (!p.json || Object.keys(p.json).length === 0) && !!p.html);
  if (needsExtraction) {
    const pagesToExtract = rawResult.pages.slice(0, 5);
    const extracted = await Promise.all(
      pagesToExtract.map(p => p.html ? extractPageSignals(p.html, EXTRACTION_PROMPT) : Promise.resolve({}))
    );
    rawResult = {
      ...rawResult,
      pages: rawResult.pages.map((p, i) => i < 5 ? { ...p, json: extracted[i] } : p),
    };
    console.log(`[crawl] Extracted signals from HTML for ${pagesToExtract.length} pages`);
  }

  // Always apply deterministic HTML parsing on top of AI-extracted json.
  // AI often returns empty strings for metadata fields even when the HTML contains them.
  rawResult = {
    ...rawResult,
    pages: rawResult.pages.map(p => {
      if (!p.html) return p;
      const parsed = parseHtmlSignals(p.html, p.url);
      return { ...p, json: { ...(p.json ?? {}), ...parsed } };
    }),
  };

  const signals = await extractSignals(rawResult);
  console.log(`[crawl] Engagement signals for ${businessId}:`, JSON.stringify({
    hasPhoneNumberProminent: signals.engagement.hasPhoneNumberProminent,
    hasContactForm: signals.engagement.hasContactForm,
    hasCallToAction: signals.engagement.hasCallToAction,
    h1TagCount: signals.seo.h1Tags.length,
    schemaMarkupTypes: signals.seo.schemaMarkupTypes,
  }));

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
    seo: signals.seo,
    trust: signals.trust,
    content: signals.content,
    engagement: signals.engagement,
  });
  if (insertError) throw new Error(`Failed to insert signals: ${insertError.message}`);

  const { error: updateError } = await supabaseAdmin
    .from('businesses')
    .update({ last_crawled_at: new Date().toISOString() })
    .eq('id', businessId);
  if (updateError) throw new Error(`Failed to update last_crawled_at: ${updateError.message}`);

  await supabaseAdmin
    .from('crawl_jobs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('cf_job_id', jobId);
}

/** Mark a business crawl as failed. */
export async function markCrawlFailed(businessId: string, jobId?: string): Promise<void> {
  await supabaseAdmin
    .from('businesses')
    .update({ crawl_status: 'failed' })
    .eq('id', businessId);

  if (jobId) {
    await supabaseAdmin
      .from('crawl_jobs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('cf_job_id', jobId);
  }
}
