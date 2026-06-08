import { supabaseAdmin } from '@/lib/supabase/server';

type CrawlLogStatus = 'started' | 'success' | 'failed' | 'warning' | 'skipped';

/**
 * Fire-and-forget crawl step logger.
 * Inserts a row into crawl_logs without blocking the crawl pipeline.
 */
export function logCrawlStep(
  businessId: string,
  crawlJobId: string | null,
  step: string,
  status: CrawlLogStatus,
  message?: string,
  meta?: Record<string, unknown>,
): void {
  supabaseAdmin
    .from('crawl_logs')
    .insert({
      business_id: businessId,
      crawl_job_id: crawlJobId,
      step,
      status,
      message: message ?? null,
      meta: meta ?? null,
    })
    .then(({ error }) => {
      if (error)
        console.error(
          `[crawl-logger] Failed to log step="${step}" for business=${businessId}:`,
          error.message,
        );
    });
}
