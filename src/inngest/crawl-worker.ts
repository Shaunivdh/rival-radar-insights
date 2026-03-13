import { inngest } from './client';
import {
  startBusinessCrawl,
  checkCrawlStatus,
  extractAndPersistSignals,
  markCrawlFailed,
} from '@/lib/crawl/orchestrator';
import { supabaseAdmin } from '@/lib/supabase/server';

const MAX_POLL_ATTEMPTS = 60;
const POLL_INTERVAL = '5s';

/**
 * Event: crawl/business.scan
 * Payload: { businessId: string; mode: 'initial' | 'incremental' }
 *
 * Trigger via: inngest.send({ name: 'crawl/business.scan', data: { businessId, mode } })
 */
export const crawlBusinessFunction = inngest.createFunction(
  {
    id: 'crawl-business',
    retries: 2,
    concurrency: { limit: 6 },
  },
  { event: 'crawl/business.scan' },
  async ({ event, step }) => {
    const { businessId, mode } = event.data as {
      businessId: string;
      mode: 'initial' | 'incremental';
    };

    // Step 1: Start crawl, returns CF job ID
    const jobId = await step.run('start-crawl', () =>
      startBusinessCrawl(businessId, mode)
    );

    // Step 2: Poll until complete or failed
    let crawlStatus = 'running';
    let attempts = 0;

    while (crawlStatus === 'running' && attempts < MAX_POLL_ATTEMPTS) {
      await step.sleep(`poll-wait-${attempts}`, POLL_INTERVAL);
      crawlStatus = await step.run(`poll-status-${attempts}`, () =>
        checkCrawlStatus(businessId, jobId)
      );
      attempts++;
    }

    if (crawlStatus !== 'completed') {
      await step.run('mark-failed', () => markCrawlFailed(businessId));
      throw new Error(`Crawl ended with status: ${crawlStatus} after ${attempts} attempts`);
    }

    // Step 3: Extract signals and persist
    await step.run('persist-signals', () =>
      extractAndPersistSignals(businessId, jobId)
    );

    return { businessId, jobId, status: 'complete' };
  }
);

/** Weekly incremental crawl for all businesses that have been crawled before */
export const weeklyIncrementalCrawl = inngest.createFunction(
  { id: 'weekly-incremental-crawl' },
  { cron: '0 8 * * 1' }, // Every Monday at 08:00 UTC
  async ({ step }) => {
    const { data: businesses } = await step.run('fetch-businesses', () =>
      supabaseAdmin
        .from('businesses')
        .select('id')
        .not('last_crawled_at', 'is', null)
        .then((r) => r)
    );

    if (!businesses?.length) return { sent: 0 };

    await step.run('enqueue-crawls', () =>
      inngest.send(
        businesses.map((b) => ({
          name: 'crawl/business.scan' as const,
          data: { businessId: b.id, mode: 'incremental' as const },
        }))
      )
    );

    return { sent: businesses.length };
  }
);
