import { inngest } from './client';
import {
  startBusinessCrawl,
  checkCrawlStatus,
  extractAndPersistSignals,
  markCrawlFailed,
  DIRECT_FETCH_DONE,
  CRAWL_DISALLOWED,
} from '@/lib/crawl/orchestrator';
import { fetchPageDirect } from '@/services/crawl';
import { checkDirectSignals } from '@/lib/crawl/direct-checks';
import { supabaseAdmin } from '@/lib/supabase/server';
import { fetchGoogleData, fetchSerpData } from '@/actions/enrichment';
import { generatePriorityActions, generateChangeSummary, generateReviewSentiment, checkAIVisibility, AIUnavailableError } from '@/services/ai';
import { calculateScores, recomputeOverallScore } from '@/services/scores';
import { fetchPageSpeedData } from '@/services/pagespeed';
import { diffSignals } from '@/services/diff';
import { updateBusiness, saveChangeEvent } from '@/actions/projects';
import { normalizeUrl } from '@/lib/url';
import { saveScoreSnapshot, getWeeklyDelta } from '@/lib/supabase/scores';
import type { ExtractedSignals, Business, ChangeEvent, AIHealthScore, AIVisibility, SerpData, PageSpeedData, PriorityAction } from '@/types';
import type { ServiceCategory } from '@/lib/serviceCategories';

/**
 * Enforce effort distribution across a batch of 5 actions: 2 low, 2 medium, 1 high.
 * Sorts by estimatedImpact desc then assigns efforts: high → medium → medium → low → low.
 * Preserves original priority ordering in the output.
 */
function enforceEffortDistribution(actions: PriorityAction[]): PriorityAction[] {
  if (actions.length !== 5) return actions;
  const tally = actions.reduce((acc, a) => { acc[a.effort] = (acc[a.effort] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  if (tally.low === 2 && tally.medium === 2 && tally.high === 1) return actions;

  const impactOrder = { high: 0, medium: 1, low: 2 } as Record<string, number>;
  const byImpact = [...actions].sort((a, b) => impactOrder[a.estimatedImpact] - impactOrder[b.estimatedImpact]);
  const effortMap: PriorityAction['effort'][] = ['high', 'medium', 'medium', 'low', 'low'];
  const adjusted = byImpact.map((a, i) => ({ ...a, effort: effortMap[i] }));
  return adjusted.sort((a, b) => a.priority - b.priority);
}

const MAX_POLL_ATTEMPTS = 120;
const POLL_INTERVAL = '5s';
const DIRECT_FETCH_FALLBACK_ATTEMPTS = 36; // ~3 min before falling back to direct fetch

async function writeEnrichmentError(
  businessId: string,
  key: 'google' | 'serp' | 'ai_actions',
  userMessage: string
): Promise<void> {
  const { data } = await supabaseAdmin
    .from('businesses')
    .select('enrichment_errors')
    .eq('id', businessId)
    .single();
  const errors = { ...(data?.enrichment_errors as object ?? {}), [key]: userMessage };
  await supabaseAdmin.from('businesses').update({ enrichment_errors: errors }).eq('id', businessId);
}

async function clearEnrichmentError(
  businessId: string,
  key: 'google' | 'serp' | 'ai_actions'
): Promise<void> {
  const { data } = await supabaseAdmin
    .from('businesses')
    .select('enrichment_errors')
    .eq('id', businessId)
    .single();
  const errors = { ...(data?.enrichment_errors as Record<string, unknown> ?? {}) };
  delete errors[key];
  await supabaseAdmin.from('businesses').update({ enrichment_errors: Object.keys(errors).length ? errors : null }).eq('id', businessId);
}

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
      await step.run('mark-failed-on-error', async () => {
        const { data } = await supabaseAdmin
          .from('businesses')
          .select('crawl_job_id')
          .eq('id', businessId)
          .single();
        await markCrawlFailed(businessId, data?.crawl_job_id ?? undefined);
      });
    },
  },
  { event: 'crawl/business.scan' },
  async ({ event, step }) => {
    const { businessId, mode } = event.data as {
      businessId: string;
      mode: 'initial' | 'incremental';
    };

    // Step 1: Start crawl, returns CF job ID
    console.log(`[crawl-worker] Starting ${mode} crawl for business ${businessId}`);
    const jobId = await step.run('start-crawl', () =>
      startBusinessCrawl(businessId, mode)
    );
    console.log(`[crawl-worker] Started crawl jobId=${jobId} for business ${businessId} mode=${mode}`);

    // If crawl was handled via direct fetch fallback, skip poll + extract
    const skipCrawlSteps = jobId === DIRECT_FETCH_DONE || jobId === CRAWL_DISALLOWED;

    if (!skipCrawlSteps) {
    // Step 2: Poll until complete or failed
    let crawlStatus = 'running';
    let attempts = 0;

    while (crawlStatus === 'running' && attempts < MAX_POLL_ATTEMPTS) {
      crawlStatus = await step.run(`poll-status-${attempts}`, () =>
        checkCrawlStatus(businessId, jobId)
      );
      if (attempts % 10 === 0) {
        console.log(`[crawl-worker] Poll attempt ${attempts}/${MAX_POLL_ATTEMPTS} for jobId=${jobId}: status=${crawlStatus}`);
      }
      attempts++;

      if (crawlStatus === 'running' && attempts === DIRECT_FETCH_FALLBACK_ATTEMPTS) {
        console.warn(`[crawl-worker] jobId=${jobId} still running after ${attempts} polls (~3 min) — falling back to direct fetch for business ${businessId}`);
        break;
      }

      if (crawlStatus === 'running') {
        await step.sleep(`poll-wait-${attempts}`, POLL_INTERVAL);
      }
    }

    const usedDirectFetch = crawlStatus === 'running';

    if (!usedDirectFetch && crawlStatus !== 'completed') {
      console.error(`[crawl-worker] Crawl failed: jobId=${jobId} finalStatus=${crawlStatus} attempts=${attempts} mode=${mode} businessId=${businessId}`);
      throw new Error(`Crawl ended with status: ${crawlStatus} after ${attempts} attempts`);
    }
    if (!usedDirectFetch) {
      console.log(`[crawl-worker] Crawl completed: jobId=${jobId} after ${attempts} polls`);
    }

    // Step 3: Extract signals and persist, then override seo fields via direct HTTP checks
    await step.run('persist-signals', async () => {
      let prefetchedResult: { status: 'completed'; pages: Array<{ url: string; html: string }> } | undefined;

      if (usedDirectFetch) {
        const { data: bizRow } = await supabaseAdmin
          .from('businesses')
          .select('url')
          .eq('id', businessId)
          .single();
        const html = bizRow?.url ? await fetchPageDirect(bizRow.url as string) : null;
        if (html) {
          console.log(`[crawl-worker] Direct fetch succeeded for business ${businessId} (${html.length} chars)`);
          prefetchedResult = { status: 'completed', pages: [{ url: bizRow!.url as string, html }] };
        } else {
          console.warn(`[crawl-worker] Direct fetch also failed for business ${businessId} — skipping signal extraction`);
          return;
        }
      }

      await extractAndPersistSignals(businessId, usedDirectFetch ? DIRECT_FETCH_DONE : jobId, prefetchedResult);

      const { data: urlRow } = await supabaseAdmin
        .from('businesses')
        .select('url')
        .eq('id', businessId)
        .single();
      if (!urlRow?.url) return;
      const { hasRobotsTxt, hasSitemap } = await checkDirectSignals(normalizeUrl(urlRow.url as string));
      console.log(`[direct-checks] ${urlRow.url} robots=${hasRobotsTxt} sitemap=${hasSitemap}`);

      // Only override if direct check found something the crawl missed
      if (!hasRobotsTxt && !hasSitemap) return;

      const { data: sigRow } = await supabaseAdmin
        .from('extracted_signals')
        .select('id, seo')
        .eq('business_id', businessId)
        .order('scanned_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!sigRow) return;

      const seo = { ...(sigRow.seo as Record<string, unknown>) };
      if (hasRobotsTxt) seo.hasRobotsTxt = true;
      if (hasSitemap) seo.hasSitemap = true;

      await supabaseAdmin
        .from('extracted_signals')
        .update({ seo })
        .eq('id', sigRow.id);
    });
    } // end skipCrawlSteps

    // Step 4: Fetch business + project metadata (name, url, domain, settings)
    const meta = await step.run('fetch-meta', async () => {
      const { data: biz, error: bizError } = await supabaseAdmin
        .from('businesses')
        .select('name, url, domain, project_id, is_own_business, google_place_id')
        .eq('id', businessId)
        .single();
      if (!biz) {
        console.warn(`[fetch-meta] Business ${businessId} no longer exists — skipping remaining steps`, bizError?.message);
        return null;
      }

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

      const result = {
        name: biz.name as string,
        url: biz.url as string,
        domain: biz.domain as string,
        projectId: biz.project_id as string,
        isOwnBusiness: (biz.is_own_business as boolean | null) ?? false,
        googlePlaceId: biz.google_place_id as string | null,
        primaryService: (settings?.primary_service as string) ?? '',
        location: (settings?.location as string) ?? '',
        postcode: (settings?.postcode as string) ?? '',
      };

      if (!result.primaryService || !result.location) {
        console.warn(
          `[fetch-meta] business ${businessId}: app_settings missing ` +
          `primary_service="${result.primaryService}" location="${result.location}". ` +
          `SERP and AI checks will be skipped.`
        );
      }

      return result;
    });

    if (!meta) return { businessId, status: 'skipped-deleted' };

    // Step 5: Enrichment (sequential)
    await step.run('enrich-google', async () => {
      try {
        await fetchGoogleData(businessId, meta.name, meta.url, meta.postcode, meta.googlePlaceId);
        await clearEnrichmentError(businessId, 'google');
      } catch (e) {
        console.error(`[enrich-google] Failed for business ${businessId}:`, e instanceof Error ? e.message : e);
        const userMessage = meta.isOwnBusiness
          ? 'We could not find your business on Google. Go to Settings → Business Details and check your business name and postcode are correct.'
          : `No Google data found for "${meta.name}". This competitor may not have a Google Business Profile, or the name may not match exactly.`;
        await writeEnrichmentError(businessId, 'google', userMessage);
      }
    });

    await step.run('enrich-serp', async () => {
      try {
        await fetchSerpData(businessId, meta.name, meta.domain, meta.primaryService, meta.location, meta.postcode);
        await clearEnrichmentError(businessId, 'serp');
      } catch (e) {
        console.error(`[enrich-serp] Failed for business ${businessId}:`, e instanceof Error ? e.message : e);
        const userMessage = meta.isOwnBusiness
          ? 'Could not find your business in local search results. Go to Settings and make sure your Primary Service and Location are filled in.'
          : `No local search data found for "${meta.name}".`;
        await writeEnrichmentError(businessId, 'serp', userMessage);
      }
    });

    // Step 6: AI search visibility check (skip if checked within 24h)
    await step.run('check-ai-visibility', async () => {
      if (!meta.primaryService || !meta.location) return;
      try {
        const { data: existing } = await supabaseAdmin
          .from('businesses')
          .select('ai_visibility')
          .eq('id', businessId)
          .single();

        const visibility = await checkAIVisibility(
          meta.primaryService,
          meta.location,
          meta.name,
          existing?.ai_visibility as AIVisibility | null,
          meta.primaryService as ServiceCategory,
        );
        if (!visibility) return; // skipped — still fresh

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

    // Step 7: PageSpeed Insights (mobile + desktop) — marks crawl_status complete
    await step.run('enrich-pagespeed', async () => {
      try {
        const pagespeedData = await fetchPageSpeedData(normalizeUrl(meta.url));
        await updateBusiness(businessId, { pagespeedData, crawlStatus: 'complete' });
        console.log(`[enrich-pagespeed] mobile=${pagespeedData.mobile.performanceScore} desktop=${pagespeedData.desktop.performanceScore} for ${businessId}`);
      } catch (e) {
        console.error(`[enrich-pagespeed] Failed for business ${businessId}:`, e instanceof Error ? e.message : e);
        // non-fatal — PSI may be rate-limited or URL unreachable; still mark complete
        await updateBusiness(businessId, { crawlStatus: 'complete' });
      }
    });

    // Step 8: Diff signals and generate change summary (runs on any rescan if previous snapshot exists)
    await step.run('diff-and-summarize', async () => {
      const { data: rows } = await supabaseAdmin
        .from('extracted_signals')
        .select('seo, pricing, trust, content, engagement')
        .eq('business_id', businessId)
        .order('scanned_at', { ascending: false })
        .limit(2);

      if (!rows || rows.length < 2) return;

      const toSignals = (r: Record<string, unknown>): ExtractedSignals =>
        ({ seo: r.seo, pricing: r.pricing, trust: r.trust, content: r.content, engagement: r.engagement } as ExtractedSignals);

      const current = toSignals(rows[0]);
      const previous = toSignals(rows[1]);
      const diff = diffSignals(previous, current);

      if (!diff.hasChanges) return;

      let summary;
      try {
        summary = await generateChangeSummary(meta.name, previous, current, !meta.isOwnBusiness);
      } catch (e) {
        if (e instanceof AIUnavailableError) {
          console.warn(`[change-summary] AI unavailable for ${businessId}, skipping change event`);
        } else {
          console.error(`[change-summary] unexpected error for ${businessId}:`, e);
        }
        return;
      }
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

    // Step 9: Calculate deterministic health score
    await step.run('calculate-scores', async () => {
      const [{ data: biz }, { data: sig }, { data: googleHistory }] = await Promise.all([
        supabaseAdmin
          .from('businesses')
          .select('google_data, serp_data, ai_visibility, pagespeed_data')
          .eq('id', businessId)
          .single(),
        supabaseAdmin
          .from('extracted_signals')
          .select('seo, pricing, trust, content, engagement')
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
        ? ({ seo: sig.seo, pricing: sig.pricing, trust: sig.trust, content: sig.content, engagement: sig.engagement } as ExtractedSignals)
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

      console.log(`[calculate-scores] business ${businessId} — google_data:`, biz.google_data != null, '| serp_data:', biz.serp_data != null);

      const aiScore = calculateScores(
        biz.google_data as Parameters<typeof calculateScores>[0],
        biz.serp_data as Parameters<typeof calculateScores>[1],
        biz.ai_visibility as Parameters<typeof calculateScores>[2],
        signals,
        previousReviewCount,
        daysBetween,
        biz.pagespeed_data as PageSpeedData | null,
      );
      await updateBusiness(businessId, { aiScore });
      console.log(`[calculate-scores] ai_score saved for business ${businessId}:`, JSON.stringify(aiScore));
    });

    // Step 10: Generate review sentiment
    await step.run('generate-review-sentiment', async () => {
      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('google_data')
        .eq('id', businessId)
        .single();
      const reviews = (biz?.google_data as { recentReviews?: Array<{ rating: number; text: string }> } | null)?.recentReviews ?? [];
      const sentiment = await generateReviewSentiment(reviews);
      if (sentiment) {
        await updateBusiness(businessId, { reviewSentiment: sentiment });
        console.log(`[review-sentiment] saved for business ${businessId}`);
      }
    });

    // Step 11: Apply score decay if no recent google_data
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

    // Step 12: Save score snapshot, compute weeklyDelta, persist to businesses + ai_health_scores
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

    // Step 13: Check if any competitor overtook own business in local pack
    // Only runs once — when ALL businesses in the project have finished crawling
    await step.run('check-threats', async () => {
      const { data: allBiz } = await supabaseAdmin
        .from('businesses')
        .select('id, is_own_business, serp_data, crawl_status')
        .eq('project_id', meta.projectId);

      if (!allBiz) return;

      const allDone = allBiz.every(
        (b) => b.crawl_status === 'complete' || b.crawl_status === 'failed'
      );
      if (!allDone) return;

      const ownBiz = allBiz.find((b) => b.is_own_business);
      if (!ownBiz) return;

      const ownPosition = (ownBiz.serp_data as SerpData | null)?.localVisibilityPosition;
      if (ownPosition == null) return;

      const overtakers = allBiz.filter((b) => {
        if (b.is_own_business) return false;
        const pos = (b.serp_data as SerpData | null)?.localVisibilityPosition;
        return pos != null && pos < ownPosition;
      });

      if (!overtakers.length) return;

      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Fetch all threat events recorded in the last 24h to dedup per competitor
      const { data: recentThreats } = await supabaseAdmin
        .from('change_events')
        .select('changes')
        .eq('business_id', ownBiz.id)
        .eq('summary', 'Competitor overtook you in local pack')
        .gte('detected_at', since24h);

      const alreadyRecorded = new Set(
        (recentThreats ?? []).flatMap((e) =>
          (e.changes as Array<{ description: string }>).map((c) => {
            try { return (JSON.parse(c.description) as { competitorId: string }).competitorId; } catch { return null; }
          })
        ).filter(Boolean)
      );

      for (const comp of overtakers) {
        if (alreadyRecorded.has(comp.id)) continue;

        const theirPosition = (comp.serp_data as SerpData).localVisibilityPosition!;

        const event: ChangeEvent = {
          id: crypto.randomUUID(),
          detectedAt: Date.now(),
          severity: 'high',
          summary: 'Competitor overtook you in local pack',
          changes: [{
            category: 'threat',
            description: JSON.stringify({ competitorId: comp.id, theirPosition, yourPosition: ownPosition }),
            significance: 'high',
            actionItem: 'Review your Google Business Profile and local SEO to reclaim your local pack position',
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

    // Step 14: If all businesses in project are done, generate priority actions
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
          const [{ data: sig }, { data: bizRow }] = await Promise.all([
            supabaseAdmin
              .from('extracted_signals')
              .select('seo, pricing, trust, content, engagement')
              .eq('business_id', b.id)
              .order('scanned_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabaseAdmin
              .from('businesses')
              .select('ai_score, google_data')
              .eq('id', b.id)
              .single(),
          ]);
          const signals = sig?.seo
            ? ({ seo: sig.seo, pricing: sig.pricing, trust: sig.trust, content: sig.content, engagement: sig.engagement } as ExtractedSignals)
            : null;
          return {
            id: b.id as string,
            name: b.name as string,
            isOwn: b.is_own_business as boolean,
            signals,
            aiScore: (bizRow?.ai_score as AIHealthScore) ?? null,
            googleData: bizRow?.google_data ?? null,
          };
        })
      );

      const ownRaw = withSignals.find((b) => b.isOwn);
      if (!ownRaw) return;

      const toPartialBiz = (b: { id: string; name: string; signals: ExtractedSignals | null; aiScore: AIHealthScore | null; googleData: unknown }): Business => ({
        id: b.id,
        name: b.name,
        url: '',
        domain: '',
        lastCrawledAt: null,
        crawlJobId: null,
        crawlStatus: 'complete',
        signals: b.signals,
        googleData: b.googleData as Business['googleData'],
        serpData: null,
        pagespeedData: null,
        aiScore: b.aiScore,
        aiVisibility: null,
        reviewSentiment: null,
        enrichmentErrors: null,
        previousSignals: null,
        changeEvents: [],
      });

      try {
        const rawActions = await generatePriorityActions(
          toPartialBiz(ownRaw),
          withSignals.filter((b) => !b.isOwn).map((b) => toPartialBiz(b)),
          meta.primaryService as ServiceCategory
        );

        await clearEnrichmentError(ownRaw.id, 'ai_actions');

        if (!rawActions.length) return;

        const actions = enforceEffortDistribution(rawActions);

        // Count current active + snoozed to determine how many slots are open
        const { count: activeCount } = await supabaseAdmin
          .from('priority_actions')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', meta.projectId)
          .in('status', ['active', 'snoozed']);

        const openSlots = Math.max(0, 15 - (activeCount ?? 0));

        await supabaseAdmin.from('priority_actions').insert(
          actions.map((a, i) => ({
            project_id: meta.projectId,
            priority: a.priority,
            status: i < openSlots ? 'active' : 'queued',
            category: a.category,
            action: a.action,
            reason: a.reason,
            why_it_matters: a.whyItMatters ?? null,
            steps: a.steps ?? null,
            effort: a.effort ?? null,
            outcome: a.outcome ?? null,
            competitor_reference: a.competitorReference ?? null,
            estimated_impact: a.estimatedImpact,
            timeframe: a.timeframe,
          }))
        );
      } catch (e) {
        if (e instanceof AIUnavailableError) {
          await writeEnrichmentError(ownRaw.id, 'ai_actions', `Recommendations unavailable — retrying at ${e.retryAt}`);
        } else {
          console.error(`[priority-actions] unexpected error for ${ownRaw.id}:`, e);
          await writeEnrichmentError(ownRaw.id, 'ai_actions', 'Unexpected error generating recommendations');
        }
      }
    });

    // Schedule next incremental crawl in 7 days
    await step.sendEvent('schedule-next-crawl', {
      name: 'crawl/business.scan',
      data: { businessId, mode: 'incremental' },
      ts: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    return { businessId, jobId, status: 'complete' };
  }
);

