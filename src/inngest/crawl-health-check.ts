import { inngest } from './client';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logCrawlStep } from '@/lib/crawl/crawl-logger';
import { markCrawlFailed } from '@/lib/crawl/orchestrator';
import { CRAWL_INTERVAL_MS, CRAWL_INTERVAL_DAYS } from '@/lib/crawl/config';

/**
 * Daily health check cron — runs at 8 AM UTC.
 *
 * 1. Detects and recovers stale crawls (stuck in 'running' > 30 min)
 * 2. Computes 24h success/failure rates from crawl_logs
 * 3. Re-queues due businesses (last_crawled_at older than CRAWL_INTERVAL_DAYS) — the sole crawl scheduler
 * 4. Writes a summary row to crawl_health_reports
 */
export const crawlHealthCheckFunction = inngest.createFunction(
  { id: 'crawl-health-check' },
  { cron: '0 8 * * *' },
  async ({ step }) => {
    // Step 1: Detect stale crawls (running > 30 min)
    const staleRecovered = await step.run('recover-stale-crawls', async () => {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

      // Use crawl_jobs.started_at as source of truth (aligned with syncProject's stale detection)
      const { data: staleJobs } = await supabaseAdmin
        .from('crawl_jobs')
        .select('id, business_id')
        .eq('status', 'running')
        .lt('started_at', thirtyMinAgo);

      // Catch orphaned businesses stuck in 'running' with no matching crawl_job row
      const staleBusinessIds = new Set((staleJobs ?? []).map((j) => j.business_id));
      const { data: orphaned } = await supabaseAdmin
        .from('businesses')
        .select('id')
        .eq('crawl_status', 'running')
        .is('crawl_job_id', null);

      const allStale = [
        ...(staleJobs ?? []).map((j) => ({
          id: j.business_id,
          crawl_job_id: j.id as string | undefined,
        })),
        ...(orphaned ?? [])
          .filter((b) => !staleBusinessIds.has(b.id))
          .map((b) => ({ id: b.id, crawl_job_id: undefined })),
      ];
      if (!allStale.length) return 0;

      for (const biz of allStale) {
        await markCrawlFailed(biz.id, biz.crawl_job_id ?? undefined);
        logCrawlStep(
          biz.id,
          biz.crawl_job_id ?? null,
          'health-check',
          'warning',
          'Recovered stale crawl (stuck in running)',
        );
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
        .in('step', [
          'start-crawl',
          'persist-signals',
          'enrich-google',
          'enrich-serp',
          'enrich-pagespeed',
          'check-ai-visibility',
          'calculate-scores',
        ])
        .gte('created_at', since);

      const { count: successCount } = await supabaseAdmin
        .from('crawl_logs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'success')
        .in('step', [
          'start-crawl',
          'persist-signals',
          'enrich-google',
          'enrich-serp',
          'enrich-pagespeed',
          'check-ai-visibility',
          'calculate-scores',
        ])
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

    // Step 3: Re-queue due crawls (last_crawled_at older than the crawl interval). This is the sole
    // scheduler for recurring crawls — staleness-based, so it can never fork duplicate chains.
    const overdueRequeued = await step.run('requeue-overdue-crawls', async () => {
      const dueBefore = new Date(Date.now() - CRAWL_INTERVAL_MS).toISOString();

      const { data: overdue } = await supabaseAdmin
        .from('businesses')
        .select('id')
        .in('crawl_status', ['complete', 'failed', 'idle'])
        .lt('last_crawled_at', dueBefore);

      if (!overdue?.length) return 0;

      const ids = overdue.map((b) => b.id as string);

      // Mark pending BEFORE sending so the next daily cron run skips these until the crawl completes.
      // Without this, a business still queued/backed-up at the next tick would be re-queued again
      // (duplicate concurrent crawls) — the same mark-pending guard every other trigger site uses.
      await supabaseAdmin.from('businesses').update({ crawl_status: 'pending' }).in('id', ids);

      // Stagger by 15s to avoid a thundering herd against the worker's concurrency limit, matching
      // triggerInitialScans/rescanAll. As the sole daily scheduler this batch can be large.
      const events = ids.map((businessId, i) => ({
        name: 'crawl/business.scan' as const,
        data: { businessId, mode: 'incremental' as const },
        ts: Date.now() + i * 15000,
      }));

      await inngest.send(events);

      console.log(
        `[crawl-health-check] Re-queued ${ids.length} crawls due (>${CRAWL_INTERVAL_DAYS}d since last)`,
      );
      return ids.length;
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
  },
);
