import { inngest } from './client';
import {
  startBusinessCrawl,
  checkCrawlStatus,
  extractAndPersistSignals,
  markCrawlFailed,
} from '@/lib/crawl/orchestrator';
import { supabaseAdmin } from '@/lib/supabase/server';
import { fetchGoogleData, fetchSerpData, fetchTrustpilotData } from '@/actions/enrichment';
import { generateHealthScore, generatePriorityActions, generateChangeSummary } from '@/services/ai';
import { diffSignals } from '@/services/diff';
import { updateBusiness, saveChangeEvent } from '@/actions/projects';
import type { ExtractedSignals, Business, ChangeEvent } from '@/types';

const MAX_POLL_ATTEMPTS = 60;
const POLL_INTERVAL = '5s';

/**
 * Event: crawl/business.scan
 * Payload: { businessId: string; mode: 'initial' | 'incremental' }
 */
export const crawlBusinessFunction = inngest.createFunction(
  {
    id: 'crawl-business',
    retries: 0,
    concurrency: { limit: 3 },
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
      crawlStatus = await step.run(`poll-status-${attempts}`, () =>
        checkCrawlStatus(businessId, jobId)
      );
      attempts++;
      if (crawlStatus === 'running') {
        await step.sleep(`poll-wait-${attempts}`, POLL_INTERVAL);
      }
    }

    if (crawlStatus !== 'completed') {
      await step.run('mark-failed', () => markCrawlFailed(businessId));
      throw new Error(`Crawl ended with status: ${crawlStatus} after ${attempts} attempts`);
    }

    // Step 3: Extract signals and persist
    await step.run('persist-signals', () =>
      extractAndPersistSignals(businessId, jobId)
    );

    // Step 4: Fetch business + project metadata (name, url, domain, settings)
    const meta = await step.run('fetch-meta', async () => {
      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('name, url, domain, project_id')
        .eq('id', businessId)
        .single();
      if (!biz) throw new Error('Business not found');

      const { data: proj } = await supabaseAdmin
        .from('projects')
        .select('user_id')
        .eq('id', biz.project_id)
        .single();
      if (!proj) throw new Error('Project not found');

      const { data: settings } = await supabaseAdmin
        .from('app_settings')
        .select('primary_service, location')
        .eq('user_id', proj.user_id)
        .maybeSingle();

      return {
        name: biz.name as string,
        url: biz.url as string,
        domain: biz.domain as string,
        projectId: biz.project_id as string,
        primaryService: (settings?.primary_service as string) ?? '',
        location: (settings?.location as string) ?? '',
      };
    });

    // Step 5: Enrichment (sequential)
    await step.run('enrich-google', async () => {
      try { await fetchGoogleData(businessId, meta.name, meta.url); } catch { /* non-fatal */ }
    });

    await step.run('enrich-serp', async () => {
      try { await fetchSerpData(businessId, meta.name, meta.domain, meta.primaryService, meta.location); } catch { /* non-fatal */ }
    });

    await step.run('enrich-trustpilot', async () => {
      try { await fetchTrustpilotData(businessId, meta.url); } catch { /* non-fatal */ }
    });

    // Step 6: If incremental, diff signals and generate change summary
    if (mode === 'incremental') {
      await step.run('diff-and-summarize', async () => {
        const { data: rows } = await supabaseAdmin
          .from('extracted_signals')
          .select('seo, pricing, trust, content, engagement, features')
          .eq('business_id', businessId)
          .order('crawled_at', { ascending: false })
          .limit(2);

        if (!rows || rows.length < 2) return;

        const toSignals = (r: Record<string, unknown>): ExtractedSignals =>
          ({ seo: r.seo, pricing: r.pricing, trust: r.trust, content: r.content, engagement: r.engagement, features: r.features } as ExtractedSignals);

        const current = toSignals(rows[0]);
        const previous = toSignals(rows[1]);
        const diff = diffSignals(previous, current);

        if (!diff.hasChanges) return;

        const summary = await generateChangeSummary(meta.name, previous, current);
        if (!summary.hasSignificantChanges) return;

        const event: ChangeEvent = {
          id: crypto.randomUUID(),
          detectedAt: Date.now(),
          severity: summary.severity,
          summary: summary.summary,
          changes: summary.changes,
        };

        await saveChangeEvent(businessId, event);
      });
    }

    // Step 7: Generate and save health score
    await step.run('health-score', async () => {
      const { data: sig } = await supabaseAdmin
        .from('extracted_signals')
        .select('seo, pricing, trust, content, engagement, features')
        .eq('business_id', businessId)
        .order('crawled_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sig?.seo) return;

      const sigData = { seo: sig.seo, pricing: sig.pricing, trust: sig.trust, content: sig.content, engagement: sig.engagement, features: sig.features } as ExtractedSignals;

      try {
        const aiScore = await generateHealthScore(sigData);
        await updateBusiness(businessId, { aiScore });
      } catch { /* non-fatal */ }
    });

    // Step 8: If all businesses in project are done, generate priority actions
    await step.run('priority-actions', async () => {
      const { data: allBiz } = await supabaseAdmin
        .from('businesses')
        .select('id, name, crawl_status, is_own_business')
        .eq('project_id', meta.projectId);

      if (!allBiz?.length) return;

      const allDone = allBiz.every(
        (b) => b.crawl_status === 'complete' || b.crawl_status === 'failed'
      );
      if (!allDone) return;

      // Guard against race: skip if priority actions already exist for this project
      const { count } = await supabaseAdmin
        .from('priority_actions')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', meta.projectId);
      if (count && count > 0) return;

      const withSignals = await Promise.all(
        allBiz.map(async (b) => {
          const { data: sig } = await supabaseAdmin
            .from('extracted_signals')
            .select('seo, pricing, trust, content, engagement, features')
            .eq('business_id', b.id)
            .order('crawled_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const signals = sig?.seo
            ? ({ seo: sig.seo, pricing: sig.pricing, trust: sig.trust, content: sig.content, engagement: sig.engagement, features: sig.features } as ExtractedSignals)
            : null;
          return {
            id: b.id as string,
            name: b.name as string,
            isOwn: b.is_own_business as boolean,
            signals,
          };
        })
      );

      const ownRaw = withSignals.find((b) => b.isOwn);
      if (!ownRaw) return;

      const toPartialBiz = (b: { id: string; name: string; signals: ExtractedSignals | null }): Business => ({
        id: b.id,
        name: b.name,
        url: '',
        domain: '',
        lastCrawledAt: null,
        crawlJobId: null,
        crawlStatus: 'complete',
        signals: b.signals,
        googleData: null,
        serpData: null,
        trustpilotData: null,
        aiScore: null,
        previousSignals: null,
        changeEvents: [],
      });

      try {
        const actions = await generatePriorityActions(
          toPartialBiz(ownRaw),
          withSignals.filter((b) => !b.isOwn).map((b) => toPartialBiz(b))
        );

        if (!actions.length) return;

        await supabaseAdmin.from('priority_actions').insert(
          actions.map((a) => ({
            project_id: meta.projectId,
            priority: a.priority,
            category: a.category,
            action: a.action,
            reason: a.reason,
            competitor_reference: a.competitorReference ?? null,
            estimated_impact: a.estimatedImpact,
            timeframe: a.timeframe,
          }))
        );
      } catch { /* non-fatal */ }
    });

    return { businessId, jobId, status: 'complete' };
  }
);

/** Weekly incremental crawl for all businesses that have been crawled before */
export const weeklyIncrementalCrawl = inngest.createFunction(
  { id: 'weekly-incremental-crawl' },
  { cron: '0 8 * * 1' }, // Every Monday at 08:00 UTC
  async ({ step }) => {
    const businesses = await step.run('fetch-businesses', async () => {
      const { data } = await supabaseAdmin
        .from('businesses')
        .select('id')
        .not('last_crawled_at', 'is', null);
      return data;
    });

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
