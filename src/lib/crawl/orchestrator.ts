import { supabaseAdmin } from '@/lib/supabase/server';
import { startCrawl, startIncrementalCrawl, pollCrawlStatus, getCrawlResults, extractPriorityLinks, crawlSinglePage, type CrawlCredentials } from '@/services/crawl';
import { saveToCache, loadFromCache } from '@/services/crawl.cache';
import { extractSignals } from '@/services/extract';
import type { RawCrawlResult } from '@/types';

const MAX_PRIORITY_PAGES = parseInt(process.env.CRAWL_PRIORITY_PAGES ?? '5', 10);
const MAX_TOTAL_PAGES = parseInt(process.env.CRAWL_MAX_PAGES ?? '15', 10);

const EXTRACTION_PROMPT =
  'Analyse the raw HTML of this page and return a JSON object with these exact keys. ' +
  'schemaMarkupTypes: look for <script type="application/ld+json"> tags in the raw HTML; extract the "@type" value from each and return as a string array (e.g. ["LocalBusiness","WebPage"]); return [] if none found. ' +
  'hasBlog/blogPostCount: set hasBlog=true and count visible post/article titles if the page is a blog, articles, news, or resources listing (URL path contains /blog, /articles, /news, /resources, or page heading says "blog"/"articles"/"news"); count individual article cards/titles visible on the page. ' +
  'Other keys: title (page title), metaDescription (meta description), h1Tags (array of h1 text), hasSitemap (bool), hasRobotsTxt (bool), internalLinkCount (number), lastBlogDate (string or null), canonicalTagsPresent (bool), altTagCoverage ("full"|"partial"|"none"), hasPricingPage (bool), pricingMentions (array of {text,amount}), hasPackages (bool), packageDetails (array of {name,price}), hasFreeQuote (bool), hasFreeTrial (bool), priceTransparencyScore ("high"|"medium"|"low"|"none"), accreditations (string array), certifications (string array), awardsAndMemberships (string array), namedClientsOrPartners (string array), caseStudyCount (number), testimonialCount (number), videoTestimonials (bool), reviewPlatformsLinked (string array), trustBadges (string array), yearsInBusiness (number or null), teamPageExists (bool), namedTeamMemberCount (number), insuranceMentioned (bool), guaranteesMentioned (string array), servicesListed (string array), serviceAreasMentioned (string array), hasVideo (bool), hasPortfolio (bool), portfolioItemCount (number), hasFAQ (bool), faqCount (number), hasNewsFeed (bool), hasChatWidget (bool), chatProvider (string or null), hasContactForm (bool), hasBookingSystem (bool), bookingProvider (string or null), hasCallToAction (bool), ctaText (string array), hasNewsletterSignup (bool), socialLinksPresent (string array), hasPhoneNumberProminent (bool), hasEmergencyContact (bool), newServicesDetected (string array), removedServicesDetected (string array), newTechIntegrations (string array), recentAnnouncementsOrNews (array of {title,date,summary}), recentHiringSignals (string array), newLocationsOrExpansion (string array).';

function getCredentials(): CrawlCredentials {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  if (!accountId || !apiToken) throw new Error('CF_ACCOUNT_ID or CF_API_TOKEN not set in environment');
  return { accountId, apiToken };
}

const MAX_DAILY_CRAWLS = parseInt(process.env.MAX_DAILY_CRAWLS ?? '20', 10);

async function checkDailyLimit(): Promise<void> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count } = await supabaseAdmin
    .from('crawl_jobs')
    .select('id', { count: 'exact', head: true })
    .gte('started_at', startOfDay.toISOString())
    .in('status', ['running', 'completed']);

  if ((count ?? 0) >= MAX_DAILY_CRAWLS) {
    throw new Error(`Daily crawl limit reached (${MAX_DAILY_CRAWLS}). Resets at UTC midnight.`);
  }
}

/** Begin a crawl for a business. Updates crawl_status to 'running'. Returns the CF job ID. */
export async function startBusinessCrawl(
  businessId: string,
  mode: 'initial' | 'incremental'
): Promise<string> {
  await checkDailyLimit();

  const { data: business, error } = await supabaseAdmin
    .from('businesses')
    .select('url, last_crawled_at')
    .eq('id', businessId)
    .single();

  if (error || !business) throw new Error(`Business not found: ${businessId}`);

  const credentials = getCredentials();
  const isIncremental = mode === 'incremental' && !!business.last_crawled_at;

  const jobId = isIncremental
    ? await startIncrementalCrawl(
        business.url as string,
        new Date(business.last_crawled_at as string).getTime(),
        credentials
      )
    : await startCrawl(
        business.url as string,
        {
          maxDepth: 3,
          maxPages: Math.max(1, MAX_TOTAL_PAGES - MAX_PRIORITY_PAGES),
          render: true,
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

  const url = business?.url as string | undefined;
  const cached = url ? loadFromCache(url) : null;
  const rootResult = cached ?? await getCrawlResults(jobId, credentials);

  // Multi-page: extract priority links from root HTML and crawl them in parallel
  let rawResult: RawCrawlResult = rootResult;
  if (!cached && url && rootResult.pages.length > 0) {
    const rootHtml = rootResult.pages[0]?.html ?? '';
    if (!rootHtml) {
      console.warn(`[crawl] Root page HTML is empty for job ${jobId} — multi-page enrichment will be skipped`);
    }
    const extraLimit = Math.min(MAX_PRIORITY_PAGES, Math.max(MAX_PRIORITY_PAGES, MAX_TOTAL_PAGES - rootResult.pages.length));

    if (rootHtml && extraLimit > 0) {
      const priorityLinks = extractPriorityLinks(rootHtml, url, extraLimit);
      console.log(`[crawl] Found ${priorityLinks.length} priority pages to crawl:`, priorityLinks);

      if (priorityLinks.length > 0) {
        const extraPages = await Promise.all(
          priorityLinks.map(link => crawlSinglePage(link, EXTRACTION_PROMPT, credentials))
        );
        const validPages = extraPages.filter((p): p is RawCrawlResult['pages'][0] => p !== null);

        if (validPages.length > 0) {
          rawResult = { status: 'completed', pages: [...rootResult.pages, ...validPages] };
          console.log(`[crawl] Merged ${validPages.length} extra pages. Total: ${rawResult.pages.length}`);
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

  const signals = await extractSignals(rawResult);

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
    pricing: signals.pricing,
    trust: signals.trust,
    content: signals.content,
    engagement: signals.engagement,
    features: signals.features,
  });
  if (insertError) throw new Error(`Failed to insert signals: ${insertError.message}`);

  const { error: updateError } = await supabaseAdmin
    .from('businesses')
    .update({ crawl_status: 'complete', last_crawled_at: new Date().toISOString() })
    .eq('id', businessId);
  if (updateError) throw new Error(`Failed to mark business complete: ${updateError.message}`);

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
