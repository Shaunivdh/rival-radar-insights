import { supabaseAdmin } from '@/lib/supabase/server';
import { toJson } from '@/lib/supabase/mappers';
import { logger } from '@/lib/logger';

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
      meta: meta ? toJson(meta) : null,
    })
    .then(({ error }) => {
      if (error)
        logger.error('crawl-logger', 'Failed to log step', {
          step,
          businessId,
          error: error.message,
        });
    });
}
