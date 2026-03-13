import { supabaseAdmin } from '@/lib/supabase/server';
import { startCrawl, startIncrementalCrawl, pollCrawlStatus, getCrawlResults } from '@/services/crawl';
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
          outputFormats: ['json', 'markdown'],
          jsonOptions: {
            prompt:
              'Extract: SEO signals (title, meta, h1, schema types), pricing mentions and packages, trust signals (accreditations, certifications, testimonials), content signals (services, blog, portfolio), engagement signals (chat, forms, CTAs), and feature changes (new services, announcements).',
          },
        },
        credentials
      );

  await supabaseAdmin
    .from('businesses')
    .update({ crawl_status: 'running', crawl_job_id: jobId })
    .eq('id', businessId);

  return jobId;
}

/** Poll the crawl status for a given job. */
export async function checkCrawlStatus(businessId: string, jobId: string): Promise<string> {
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
  const rawResult = await getCrawlResults(jobId, credentials);
  const signals = await extractSignals(rawResult);

  // Archive previous signals
  await supabaseAdmin
    .from('extracted_signals')
    .update({ is_current: false })
    .eq('business_id', businessId)
    .eq('is_current', true);

  // Insert new signals
  await supabaseAdmin.from('extracted_signals').insert({
    business_id: businessId,
    is_current: true,
    seo: signals.seo,
    pricing: signals.pricing,
    trust: signals.trust,
    content: signals.content,
    engagement: signals.engagement,
    features: signals.features,
  });

  await supabaseAdmin
    .from('businesses')
    .update({ crawl_status: 'complete', last_crawled_at: new Date().toISOString() })
    .eq('id', businessId);
}

/** Mark a business crawl as failed. */
export async function markCrawlFailed(businessId: string): Promise<void> {
  await supabaseAdmin
    .from('businesses')
    .update({ crawl_status: 'failed' })
    .eq('id', businessId);
}
