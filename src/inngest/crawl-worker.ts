import { inngest } from './client';
import {
  startBusinessCrawl,
  checkCrawlStatus,
  extractAndPersistSignals,
  markCrawlFailed,
} from '@/lib/crawl/orchestrator';
import { supabaseAdmin } from '@/lib/supabase/server';
import { fetchGoogleData, fetchSerpData } from '@/actions/enrichment';
import { generatePriorityActions, generateChangeSummary, checkAIPresence } from '@/services/ai';
import { calculateScores, recomputeOverallScore } from '@/services/scores';
import { diffSignals } from '@/services/diff';
import { updateBusiness, saveChangeEvent } from '@/actions/projects';
import { saveScoreSnapshot, getWeeklyDelta } from '@/lib/supabase/scores';
import type { ExtractedSignals, Business, ChangeEvent, AIHealthScore, SerpData } from '@/types';

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
    onFailure: async ({ error, event, step }) => {
      const { businessId } = event.data.event.data as { businessId: string };
      console.error(`[crawl-business] Unexpected failure for business ${businessId}:`, error.message);
      await step.run('mark-failed-on-error', () => markCrawlFailed(businessId));
    },
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
      await step.run('mark-failed', () => markCrawlFailed(businessId, jobId));
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
        .select('primary_service, location, postcode')
        .eq('user_id', proj.user_id)
        .maybeSingle();

      return {
        name: biz.name as string,
        url: biz.url as string,
        domain: biz.domain as string,
        projectId: biz.project_id as string,
        primaryService: (settings?.primary_service as string) ?? '',
        location: (settings?.location as string) ?? '',
        postcode: (settings?.postcode as string) ?? '',
      };
    });

    // Step 5: Enrichment (sequential)
    await step.run('enrich-google', async () => {
      try {
        await fetchGoogleData(businessId, meta.name, meta.url, meta.postcode);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown error';
        console.error(`[enrich-google] Failed for business ${businessId}:`, msg);
        const { data: biz } = await supabaseAdmin.from('businesses').select('enrichment_errors').eq('id', businessId).single();
        const errors = { ...(biz?.enrichment_errors as object ?? {}), google: 'unavailable' };
        await supabaseAdmin.from('businesses').update({ enrichment_errors: errors }).eq('id', businessId);
      }
    });

    await step.run('enrich-serp', async () => {
      try {
        await fetchSerpData(businessId, meta.name, meta.domain, meta.primaryService, meta.location, meta.postcode);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown error';
        console.error(`[enrich-serp] Failed for business ${businessId}:`, msg);
        const { data: biz } = await supabaseAdmin.from('businesses').select('enrichment_errors').eq('id', businessId).single();
        const errors = { ...(biz?.enrichment_errors as object ?? {}), serp: 'unavailable' };
        await supabaseAdmin.from('businesses').update({ enrichment_errors: errors }).eq('id', businessId);
      }
    });

    // Step 6: AI search visibility check
    await step.run('check-ai-visibility', async () => {
      if (!meta.primaryService || !meta.location) return;
      try {
        const visibility = await checkAIPresence(meta.primaryService, meta.location, meta.name, meta.domain);
        const { error } = await supabaseAdmin.from('businesses').update({ ai_visibility: visibility }).eq('id', businessId);
        if (error) {
          console.error(`[check-ai-visibility] DB write failed for business ${businessId}:`, error);
        } else {
          console.log(`[check-ai-visibility] aiPresenceScore=${visibility.aiPresenceScore} saved for business ${businessId}`);
        }
      } catch (e) {
        console.error(`[check-ai-visibility] Failed for business ${businessId}:`, e);
      }
    });

    // Step 7: If incremental, diff signals and generate change summary
    if (mode === 'incremental') {
      await step.run('diff-and-summarize', async () => {
        const { data: rows } = await supabaseAdmin
          .from('extracted_signals')
          .select('seo, pricing, trust, content, engagement, features')
          .eq('business_id', businessId)
          .order('scanned_at', { ascending: false })
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

    // Step 7: Calculate deterministic health score
    await step.run('calculate-scores', async () => {
      const [{ data: biz }, { data: sig }, { data: googleHistory }] = await Promise.all([
        supabaseAdmin
          .from('businesses')
          .select('google_data, serp_data, ai_visibility')
          .eq('id', businessId)
          .single(),
        supabaseAdmin
          .from('extracted_signals')
          .select('seo, pricing, trust, content, engagement, features')
          .eq('business_id', businessId)
          .order('scanned_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from('google_data')
          .select('review_count, fetched_at')
          .eq('business_id', businessId)
          .order('fetched_at', { ascending: false })
          .limit(2),
      ]);

      if (!biz) return;

      const signals = sig?.seo
        ? ({ seo: sig.seo, pricing: sig.pricing, trust: sig.trust, content: sig.content, engagement: sig.engagement, features: sig.features } as ExtractedSignals)
        : null;

      let previousReviewCount: number | undefined;
      let daysBetween: number | undefined;
      if (googleHistory && googleHistory.length >= 2) {
        const msApart =
          new Date(googleHistory[0].fetched_at as string).getTime() -
          new Date(googleHistory[1].fetched_at as string).getTime();
        previousReviewCount = googleHistory[1].review_count as number;
        daysBetween = msApart / 86400000;
      }

      console.log(`[calculate-scores] business ${businessId} — google_data:`, biz.google_data != null, '| serp_data:', biz.serp_data != null, '| ai_visibility:', biz.ai_visibility != null);

      const aiScore = calculateScores(
        biz.google_data as Parameters<typeof calculateScores>[0],
        biz.serp_data as Parameters<typeof calculateScores>[1],
        biz.ai_visibility as Parameters<typeof calculateScores>[2],
        signals,
        previousReviewCount,
        daysBetween
      );
      await updateBusiness(businessId, { aiScore });
      console.log(`[calculate-scores] ai_score saved for business ${businessId}:`, JSON.stringify(aiScore));
    });

    // Step 8: Apply score decay if no recent google_data
    await step.run('apply-score-decay', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: oldRow } = await supabaseAdmin
        .from('google_data')
        .select('fetched_at')
        .eq('business_id', businessId)
        .lt('fetched_at', thirtyDaysAgo)
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!oldRow) return;

      const daysSinceLastReview =
        (Date.now() - new Date(oldRow.fetched_at as string).getTime()) / 86400000;
      if (daysSinceLastReview <= 30) return;

      const { data: bizRow } = await supabaseAdmin
        .from('businesses')
        .select('ai_score')
        .eq('id', businessId)
        .single();
      if (!bizRow?.ai_score) return;

      const aiScore = bizRow.ai_score as AIHealthScore;
      const weeksOver30 = Math.floor((daysSinceLastReview - 30) / 7);
      aiScore.reviewVelocityScore = Math.max(0, aiScore.reviewVelocityScore - weeksOver30 * 10);
      aiScore.overallScore = recomputeOverallScore(aiScore);
      await updateBusiness(businessId, { aiScore });
    });

    // Step 9: Save score snapshot, compute weeklyDelta, persist to businesses + ai_health_scores
    await step.run('save-score-snapshot', async () => {
      const { data: bizRow } = await supabaseAdmin
        .from('businesses')
        .select('ai_score')
        .eq('id', businessId)
        .single();
      if (!bizRow?.ai_score) return;

      const aiScore = bizRow.ai_score as AIHealthScore;
      await saveScoreSnapshot(supabaseAdmin, businessId, aiScore);

      const weeklyDelta = await getWeeklyDelta(supabaseAdmin, businessId);

      // Write weeklyDelta back into businesses.ai_score so the UI can read it
      const updatedScore: AIHealthScore = { ...aiScore, weeklyDelta };
      await updateBusiness(businessId, { aiScore: updatedScore });

      // Upsert into ai_health_scores (denormalised table for potential reporting)
      await supabaseAdmin.from('ai_health_scores').upsert(
        {
          business_id: businessId,
          overall_score: updatedScore.overallScore,
          weekly_delta: weeklyDelta,
          reputation_score: updatedScore.reputationScore,
          local_visibility_score: updatedScore.localVisibilityScore,
          website_health_score: updatedScore.websiteHealthScore,
          gbp_completeness_score: updatedScore.gbpCompletenessScore,
          ai_presence_score: updatedScore.aiPresenceScore,
          review_velocity_score: updatedScore.reviewVelocityScore,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'business_id' }
      );
    });

    // Step 10: Check if any competitor overtook own business in local pack
    await step.run('check-threats', async () => {
      const { data: allBiz } = await supabaseAdmin
        .from('businesses')
        .select('id, is_own_business, serp_data')
        .eq('project_id', meta.projectId);

      if (!allBiz) return;

      const ownBiz = allBiz.find((b) => b.is_own_business);
      if (!ownBiz) return;

      const ownPosition = (ownBiz.serp_data as SerpData | null)?.localPackPosition;
      if (ownPosition == null) return;

      const overtakers = allBiz.filter((b) => {
        if (b.is_own_business) return false;
        const pos = (b.serp_data as SerpData | null)?.localPackPosition;
        return pos != null && pos < ownPosition;
      });

      if (!overtakers.length) return;

      for (const comp of overtakers) {
        const theirPosition = (comp.serp_data as SerpData).localPackPosition!;
        const event: ChangeEvent = {
          id: crypto.randomUUID(),
          detectedAt: Date.now(),
          severity: 'high',
          summary: 'Competitor overtook you in local pack',
          changes: [{
            category: 'threat',
            description: JSON.stringify({ competitorId: comp.id, theirPosition, yourPosition: ownPosition }),
            significance: 'high',
          }],
        };
        await saveChangeEvent(ownBiz.id as string, event);
      }

      const { data: ownBizRow } = await supabaseAdmin
        .from('businesses')
        .select('ai_score')
        .eq('id', ownBiz.id)
        .single();
      if (!ownBizRow?.ai_score) return;

      const aiScore = ownBizRow.ai_score as AIHealthScore;
      aiScore.localVisibilityScore = Math.max(0, aiScore.localVisibilityScore - 10);
      aiScore.overallScore = recomputeOverallScore(aiScore);
      await updateBusiness(ownBiz.id as string, { aiScore });
    });

    // Step 11: If all businesses in project are done, generate priority actions
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

      // Skip regeneration only if actions were generated within the last 24 hours
      const { data: latestAction } = await supabaseAdmin
        .from('priority_actions')
        .select('generated_at')
        .eq('project_id', meta.projectId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestAction?.generated_at) {
        const ageMs = Date.now() - new Date(latestAction.generated_at).getTime();
        if (ageMs < 24 * 60 * 60 * 1000) return;
      }

      const withSignals = await Promise.all(
        allBiz.map(async (b) => {
          const { data: sig } = await supabaseAdmin
            .from('extracted_signals')
            .select('seo, pricing, trust, content, engagement, features')
            .eq('business_id', b.id)
            .order('scanned_at', { ascending: false })
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
        aiVisibility: null,
        enrichmentErrors: null,
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
