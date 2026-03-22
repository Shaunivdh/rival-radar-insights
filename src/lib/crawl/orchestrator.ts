import { supabaseAdmin } from '@/lib/supabase/server';
import { startCrawl, startIncrementalCrawl, pollCrawlStatus, getCrawlResults } from '@/services/crawl';
import { saveToCache, loadFromCache } from '@/services/crawl.cache';
import { extractSignals } from '@/services/extract';

interface CrawlCredentials {
  accountId: string;
  apiToken: string;
}

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
    .gte('started_at', startOfDay.toISOString());

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
          maxDepth: 2,
          maxPages: 15,
          render: true,
          outputFormats: ['json', 'markdown'],
          jsonOptions: {
            prompt:
              'Return a JSON object with these exact keys: title (page title), metaDescription (meta description), h1Tags (array of h1 text), hasSitemap (bool), hasRobotsTxt (bool), internalLinkCount (number), blogPostCount (number), lastBlogDate (string or null), schemaMarkupTypes (string array), canonicalTagsPresent (bool), altTagCoverage ("full"|"partial"|"none"), hasPricingPage (bool), pricingMentions (array of {text,amount}), hasPackages (bool), packageDetails (array of {name,price}), hasFreeQuote (bool), hasFreeTrial (bool), priceTransparencyScore ("high"|"medium"|"low"|"none"), accreditations (string array), certifications (string array), awardsAndMemberships (string array), namedClientsOrPartners (string array), caseStudyCount (number), testimonialCount (number), videoTestimonials (bool), reviewPlatformsLinked (string array), trustBadges (string array), yearsInBusiness (number or null), teamPageExists (bool), namedTeamMemberCount (number), insuranceMentioned (bool), guaranteesMentioned (string array), servicesListed (string array), serviceAreasMentioned (string array), hasBlog (bool), hasVideo (bool), hasPortfolio (bool), portfolioItemCount (number), hasFAQ (bool), faqCount (number), hasNewsFeed (bool), hasChatWidget (bool), chatProvider (string or null), hasContactForm (bool), hasBookingSystem (bool), bookingProvider (string or null), hasCallToAction (bool), ctaText (string array), hasNewsletterSignup (bool), socialLinksPresent (string array), hasPhoneNumberProminent (bool), hasEmergencyContact (bool), newServicesDetected (string array), removedServicesDetected (string array), newTechIntegrations (string array), recentAnnouncementsOrNews (array of {title,date,summary}), recentHiringSignals (string array), newLocationsOrExpansion (string array).',
          },
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
  const rawResult = cached ?? await getCrawlResults(jobId, credentials);
  if (!cached && url) saveToCache(url, rawResult);
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
}

/** Mark a business crawl as failed. */
export async function markCrawlFailed(businessId: string): Promise<void> {
  await supabaseAdmin
    .from('businesses')
    .update({ crawl_status: 'failed' })
    .eq('id', businessId);
}
