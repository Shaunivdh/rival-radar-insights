import { inngest } from './client';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logCrawlStep } from '@/lib/crawl/crawl-logger';
import { markCrawlFailed } from '@/lib/crawl/orchestrator';

/**
 * Daily health check cron — runs at 8 AM UTC.
 *
 * 1. Detects and recovers stale crawls (stuck in 'running' > 30 min)
 * 2. Computes 24h success/failure rates from crawl_logs
 * 3. Re-queues overdue businesses (last_crawled_at > 8 days ago)
 * 4. Writes a summary row to crawl_health_reports
 */
export const crawlHealthCheckFunction = inngest.createFunction(
  { id: 'crawl-health-check' },
  { cron: '0 8 * * *' },
  async ({ step }) => {
    // Step 1: Detect stale crawls (running > 30 min)
    const staleRecovered = await step.run('recover-stale-crawls', async () => {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

      const { data: stale } = await supabaseAdmin
        .from('businesses')
        .select('id, crawl_job_id')
        .eq('crawl_status', 'running')
        .lt('last_crawled_at', thirtyMinAgo);

      // Also catch businesses that started running but never got a last_crawled_at update
      const { data: staleNoTimestamp } = await supabaseAdmin
        .from('businesses')
        .select('id, crawl_job_id')
        .eq('crawl_status', 'running')
        .is('last_crawled_at', null);

      const allStale = [...(stale ?? []), ...(staleNoTimestamp ?? [])];
      if (!allStale.length) return 0;

      for (const biz of allStale) {
        await markCrawlFailed(biz.id, biz.crawl_job_id ?? undefined);
        logCrawlStep(biz.id, biz.crawl_job_id, 'health-check', 'warning', 'Recovered stale crawl (stuck in running)');
      }

      console.log(`[crawl-health-check] Recovered ${allStale.length} stale crawls`);
      return allStale.length;
    });

    // Step 2: Compute 24h failure/success rates from crawl_logs
    const stats = await step.run('compute-failure-rates', async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { count: totalCount } = await supabaseAdmin
        .from('crawl_logs')
        .select('id', { count: 'exact', head: true })
        .in('step', ['start-crawl', 'persist-signals', 'enrich-google', 'enrich-serp', 'enrich-pagespeed', 'check-ai-visibility', 'calculate-scores'])
        .gte('created_at', since);

      const { count: successCount } = await supabaseAdmin
        .from('crawl_logs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'success')
        .in('step', ['start-crawl', 'persist-signals', 'enrich-google', 'enrich-serp', 'enrich-pagespeed', 'check-ai-visibility', 'calculate-scores'])
        .gte('created_at', since);

      const { count: failedCount } = await supabaseAdmin
        .from('crawl_logs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('created_at', since);

      // Get failure reasons breakdown
      const { data: failures } = await supabaseAdmin
        .from('crawl_logs')
        .select('step, message')
        .eq('status', 'failed')
        .gte('created_at', since)
        .limit(100);

      const reasons: Record<string, number> = {};
      for (const f of failures ?? []) {
        const key = `${f.step}: ${(f.message ?? 'unknown').slice(0, 100)}`;
        reasons[key] = (reasons[key] ?? 0) + 1;
      }

      return {
        total: totalCount ?? 0,
        successful: successCount ?? 0,
        failed: failedCount ?? 0,
        reasons,
      };
    });

    // Step 3: Re-queue overdue crawls (last_crawled_at > 8 days ago)
    const overdueRequeued = await step.run('requeue-overdue-crawls', async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

      const { data: overdue } = await supabaseAdmin
        .from('businesses')
        .select('id')
        .in('crawl_status', ['complete', 'failed', 'idle'])
        .lt('last_crawled_at', eightDaysAgo);

      if (!overdue?.length) return 0;

      // Send events in batches to avoid overwhelming the queue
      const events = overdue.map((b) => ({
        name: 'crawl/business.scan' as const,
        data: { businessId: b.id, mode: 'incremental' as const },
      }));

      await inngest.send(events);

      console.log(`[crawl-health-check] Re-queued ${overdue.length} overdue crawls`);
      return overdue.length;
    });

    // Step 4: Write health report
    await step.run('write-health-report', async () => {
      await supabaseAdmin.from('crawl_health_reports').insert({
        total_crawls_24h: stats.total,
        successful: stats.successful,
        failed: stats.failed,
        stale_recovered: staleRecovered,
        overdue_requeued: overdueRequeued,
        failure_reasons: Object.keys(stats.reasons).length ? stats.reasons : null,
      });
    });

    return {
      totalCrawls24h: stats.total,
      successful: stats.successful,
      failed: stats.failed,
      staleRecovered,
      overdueRequeued,
    };
  }
);
