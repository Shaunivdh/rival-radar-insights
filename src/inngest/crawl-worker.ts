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
import {
  generatePriorityActions,
  generatePriorityActionsWithHistory,
  generateChangeSummary,
  generateReviewSentiment,
  checkAIVisibility,
  AIUnavailableError,
} from '@/services/ai';
import { calculateScores, recomputeOverallScore } from '@/services/scores';
import { fetchPageSpeedData } from '@/services/pagespeed';
import { suppressOscillatingChanges } from '@/services/diff';
import { updateBusiness, saveChangeEvent } from '@/lib/supabase/business';
import { mapPriorityActionRow } from '@/lib/priorityActionRow';
import { normalizeUrl } from '@/lib/url';
import { saveScoreSnapshot, getWeeklyDelta } from '@/lib/supabase/scores';
import { logCrawlStep } from '@/lib/crawl/crawl-logger';
import { THREAT_DEDUP_MS, CHANGE_CONFIRMATION_DELAY_MS } from '@/lib/crawl/config';
import type {
  ExtractedSignals,
  Business,
  ChangeEvent,
  AIHealthScore,
  AIVisibility,
  GoogleData,
  SerpData,
  PageSpeedData,
  PriorityAction,
} from '@/types';
import type { ServiceCategory } from '@/lib/serviceCategories';

/** Convert a minimal row into a Business object for priority action generation. */
function toPartialBiz(b: {
  id: string;
  name: string;
  signals: ExtractedSignals | null;
  aiScore: AIHealthScore | null;
  googleData: unknown;
  pagespeedData: PageSpeedData | null;
}): Business {
  return {
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
    pagespeedData: b.pagespeedData,
    aiScore: b.aiScore,
    aiVisibility: null,
    reviewSentiment: null,
    enrichmentErrors: null,
    previousSignals: null,
    changeEvents: [],
  };
}

/**
 * Fetch the most recent batch of priority actions for a project. A "batch" is
 * all rows sharing the exact latest `generated_at` (a single Supabase INSERT
 * uses one transaction timestamp, so batched rows share the value). Includes
 * all statuses — completed/snoozed/queued — so the with-history prompt can
 * acknowledge closed items.
 */
async function fetchPreviousActionBatch(projectId: string): Promise<PriorityAction[]> {
  const { data: latest } = await supabaseAdmin
    .from('priority_actions')
    .select('generated_at')
    .eq('project_id', projectId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest?.generated_at) return [];

  const { data: rows } = await supabaseAdmin
    .from('priority_actions')
    .select('*')
    .eq('project_id', projectId)
    .eq('generated_at', latest.generated_at as string)
    .order('priority', { ascending: true });

  return (rows ?? []).map((r) => mapPriorityActionRow(r as Record<string, unknown>));
}

function rowToSignals(r: Record<string, unknown>): ExtractedSignals {
  return {
    seo: r.seo,
    trust: r.trust,
    content: r.content,
    engagement: r.engagement,
  } as ExtractedSignals;
}

/** Fetch the previous (not most-recent) extracted_signals row for a business. */
async function fetchPreviousSignals(businessId: string): Promise<ExtractedSignals | null> {
  const { data } = await supabaseAdmin
    .from('extracted_signals')
    .select('seo, trust, content, engagement')
    .eq('business_id', businessId)
    .order('scanned_at', { ascending: false })
    .limit(2);
  const prev = data?.[1];
  if (!prev?.seo) return null;
  return {
    seo: prev.seo,
    trust: prev.trust,
    content: prev.content,
    engagement: prev.engagement,
  } as ExtractedSignals;
}

const MAX_POLL_ATTEMPTS = 120;
const POLL_INTERVAL = '5s';
const DIRECT_FETCH_FALLBACK_ATTEMPTS = 36; // ~3 min before falling back to direct fetch

async function writeEnrichmentError(
  businessId: string,
  key: 'google' | 'serp' | 'ai_actions' | 'crawl' | 'change_summary',
  userMessage: string,
): Promise<void> {
  const { data } = await supabaseAdmin
    .from('businesses')
    .select('enrichment_errors')
    .eq('id', businessId)
    .single();
  const errors = { ...((data?.enrichment_errors as object) ?? {}), [key]: userMessage };
  await supabaseAdmin.from('businesses').update({ enrichment_errors: errors }).eq('id', businessId);
}

/**
 * Close the open crawl_jobs row for a business once its crawl has succeeded.
 * crawl_jobs is otherwise insert-only (orchestrator inserts 'running'; stale
 * recovery flips to 'failed'), so without this a successful crawl leaves its
 * job 'running' forever — polluting observability and stale-job detection.
 */
async function markCrawlJobComplete(businessId: string): Promise<void> {
  await supabaseAdmin
    .from('crawl_jobs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('business_id', businessId)
    .eq('status', 'running');
}

async function clearEnrichmentError(
  businessId: string,
  key: 'google' | 'serp' | 'ai_actions' | 'crawl' | 'change_summary',
): Promise<void> {
  const { data } = await supabaseAdmin
    .from('businesses')
    .select('enrichment_errors')
    .eq('id', businessId)
    .single();
  const errors = { ...((data?.enrichment_errors as Record<string, unknown>) ?? {}) };
  delete errors[key];
  await supabaseAdmin
    .from('businesses')
    .update({ enrichment_errors: Object.keys(errors).length ? errors : null })
    .eq('id', businessId);
}

/**
 * Event: crawl/business.scan
 * Payload: { businessId: string; mode: 'initial' | 'incremental' }
 */
export const crawlBusinessFunction = inngest.createFunction(
  {
    id: 'crawl-business',
    retries: 2,
    concurrency: { limit: 3 },
    onFailure: async ({ error, event, step }) => {
      const { businessId } = event.data.event.data as { businessId: string };
      console.error(
        `[crawl-business] Unexpected failure for business ${businessId}:`,
        error.message,
      );
      logCrawlStep(businessId, null, 'onFailure', 'failed', error.message?.slice(0, 500));
      const projectId = await step.run('mark-failed-on-error', async () => {
        const { data } = await supabaseAdmin
          .from('businesses')
          .select('crawl_job_id, project_id')
          .eq('id', businessId)
          .single();
        await markCrawlFailed(businessId, data?.crawl_job_id ?? undefined);

        // Store failure reason so users can see what went wrong
        const reason = error.message?.slice(0, 200) || 'Unknown error';
        await writeEnrichmentError(
          businessId,
          'crawl',
          `Crawl failed: ${reason}. We'll retry automatically.`,
        );

        return data?.project_id as string | null;
      });

      // Check if this was the last business — if so, generate priority actions
      if (projectId) {
        await step.run('check-generate-priority-actions', async () => {
          const { data: allBiz } = await supabaseAdmin
            .from('businesses')
            .select('id, name, crawl_status, is_own_business')
            .eq('project_id', projectId);
          if (!allBiz?.length) return;

          const allDone = allBiz.every(
            (b) => b.crawl_status === 'complete' || b.crawl_status === 'failed',
          );
          if (!allDone) return;

          // Check if actions already exist (generated by another business's run)
          const { count } = await supabaseAdmin
            .from('priority_actions')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', projectId)
            .in('status', ['active', 'snoozed']);
          if ((count ?? 0) > 0) return;

          const withSignals = await Promise.all(
            allBiz.map(async (b) => {
              const [{ data: sig }, { data: bizRow }] = await Promise.all([
                supabaseAdmin
                  .from('extracted_signals')
                  .select('seo, trust, content, engagement')
                  .eq('business_id', b.id)
                  .order('scanned_at', { ascending: false })
                  .limit(1)
                  .maybeSingle(),
                supabaseAdmin
                  .from('businesses')
                  .select('ai_score, google_data, pagespeed_data')
                  .eq('id', b.id)
                  .single(),
              ]);
              const signals = sig?.seo
                ? ({
                    seo: sig.seo,
                    trust: sig.trust,
                    content: sig.content,
                    engagement: sig.engagement,
                  } as ExtractedSignals)
                : null;
              return {
                id: b.id as string,
                name: b.name as string,
                isOwn: b.is_own_business as boolean,
                signals,
                aiScore: (bizRow?.ai_score as AIHealthScore) ?? null,
                googleData: bizRow?.google_data ?? null,
                pagespeedData: (bizRow?.pagespeed_data as PageSpeedData) ?? null,
              };
            }),
          );

          const ownRaw = withSignals.find((b) => b.isOwn);
          if (!ownRaw) return;

          // Fetch project's business details
          const { data: projRow } = await supabaseAdmin
            .from('projects')
            .select('primary_service, location, postcode')
            .eq('id', projectId)
            .single();

          const ownBusiness = toPartialBiz(ownRaw);
          const competitorBusinesses = withSignals
            .filter((b) => !b.isOwn)
            .map((b) => toPartialBiz(b));
          const previousActions = await fetchPreviousActionBatch(projectId);
          const useHistory = previousActions.length > 0 && !!ownRaw.signals;
          const previousSignals = useHistory ? await fetchPreviousSignals(ownRaw.id) : null;

          try {
            const rawActions = useHistory
              ? await generatePriorityActionsWithHistory(
                  ownBusiness,
                  competitorBusinesses,
                  previousActions,
                  previousSignals,
                  ownRaw.signals!,
                  projRow?.primary_service as ServiceCategory,
                )
              : await generatePriorityActions(
                  ownBusiness,
                  competitorBusinesses,
                  projRow?.primary_service as ServiceCategory,
                );

            await clearEnrichmentError(ownRaw.id, 'ai_actions');
            if (!rawActions.length) {
              console.warn(
                `[onFailure] priority-actions generation returned 0 actions for project ${projectId} (own=${ownRaw.id})`,
              );
              await writeEnrichmentError(
                ownRaw.id,
                'ai_actions',
                'No recommendations were generated on the last scan — re-scan to try again.',
              );
              return;
            }

            await supabaseAdmin.from('priority_actions').insert(
              rawActions.map((a, i) => ({
                project_id: projectId,
                priority: a.priority,
                status: i < 5 ? 'active' : 'queued',
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
                continuity_note: useHistory ? (a.continuityNote ?? null) : null,
              })),
            );
            console.log(
              `[onFailure] Generated ${rawActions.length} priority actions for project ${projectId}`,
            );
          } catch (e) {
            if (e instanceof AIUnavailableError) {
              await writeEnrichmentError(
                ownRaw.id,
                'ai_actions',
                `Recommendations unavailable — retrying at ${(e as AIUnavailableError).retryAt}`,
              );
            } else {
              console.error(`[onFailure] priority-actions error for ${ownRaw.id}:`, e);
              await writeEnrichmentError(
                ownRaw.id,
                'ai_actions',
                'Unexpected error generating recommendations',
              );
            }
          }
        });
      }

      // Retry sooner for failures (24h) — the regular 7-day cycle resumes once a crawl succeeds
      await step.sendEvent('schedule-retry-crawl', {
        name: 'crawl/business.scan',
        data: { businessId, mode: 'incremental' },
        ts: Date.now() + 24 * 60 * 60 * 1000,
      });
    },
  },
  { event: 'crawl/business.scan' },
  async ({ event, step }) => {
    const { businessId, mode } = event.data as {
      businessId: string;
      mode: 'initial' | 'incremental';
    };

    // Step 1: Start crawl, returns CF job ID — falls back to direct fetch on failure
    console.log(`[crawl-worker] Starting ${mode} crawl for business ${businessId}`);
    const jobId = await step.run('start-crawl', async () => {
      try {
        const id = await startBusinessCrawl(businessId, mode);
        logCrawlStep(businessId, id, 'start-crawl', 'success', `${mode} crawl started`, { mode });
        return id;
      } catch (e) {
        console.error(
          `[start-crawl] CF crawl failed for ${businessId}, falling back to direct fetch:`,
          e instanceof Error ? e.message : e,
        );
        logCrawlStep(
          businessId,
          null,
          'start-crawl',
          'warning',
          `CF crawl failed, trying direct fetch: ${e instanceof Error ? e.message : e}`,
          { mode, fallback: true },
        );
        // Attempt direct fetch fallback
        const { data: bizRow } = await supabaseAdmin
          .from('businesses')
          .select('url')
          .eq('id', businessId)
          .single();
        if (!bizRow?.url) throw e; // no URL to fallback with
        const html = await fetchPageDirect(bizRow.url as string);
        if (!html) {
          logCrawlStep(
            businessId,
            null,
            'start-crawl',
            'failed',
            'CF crawl and direct fetch both failed',
            { mode },
          );
          throw e;
        }
        console.log(
          `[start-crawl] Direct fetch fallback succeeded for ${businessId} (${html.length} chars)`,
        );
        logCrawlStep(
          businessId,
          DIRECT_FETCH_DONE,
          'start-crawl',
          'success',
          'Direct fetch fallback succeeded',
          { mode, htmlSize: html.length },
        );
        await extractAndPersistSignals(businessId, DIRECT_FETCH_DONE, {
          status: 'completed',
          pages: [{ url: bizRow.url as string, html }],
        });
        return DIRECT_FETCH_DONE;
      }
    });
    console.log(
      `[crawl-worker] Started crawl jobId=${jobId} for business ${businessId} mode=${mode}`,
    );

    // If crawl was handled via direct fetch fallback, skip poll + extract
    const skipCrawlSteps = jobId === DIRECT_FETCH_DONE || jobId === CRAWL_DISALLOWED;

    if (!skipCrawlSteps) {
      // Step 2: Poll until complete or failed
      let crawlStatus = 'running';
      let attempts = 0;

      while (crawlStatus === 'running' && attempts < MAX_POLL_ATTEMPTS) {
        crawlStatus = await step.run(`poll-status-${attempts}`, () =>
          checkCrawlStatus(businessId, jobId),
        );
        if (attempts % 10 === 0) {
          console.log(
            `[crawl-worker] Poll attempt ${attempts}/${MAX_POLL_ATTEMPTS} for jobId=${jobId}: status=${crawlStatus}`,
          );
        }
        attempts++;

        if (crawlStatus === 'running' && attempts === DIRECT_FETCH_FALLBACK_ATTEMPTS) {
          console.warn(
            `[crawl-worker] jobId=${jobId} still running after ${attempts} polls (~3 min) — falling back to direct fetch for business ${businessId}`,
          );
          break;
        }

        if (crawlStatus === 'running') {
          await step.sleep(`poll-wait-${attempts}`, POLL_INTERVAL);
        }
      }

      const usedDirectFetch = crawlStatus === 'running';

      if (!usedDirectFetch && crawlStatus !== 'completed') {
        console.error(
          `[crawl-worker] Crawl failed: jobId=${jobId} finalStatus=${crawlStatus} attempts=${attempts} mode=${mode} businessId=${businessId}`,
        );
        await step.run('log-poll-failed', async () => {
          logCrawlStep(
            businessId,
            jobId,
            'poll-status',
            'failed',
            `Crawl ended with status: ${crawlStatus}`,
            { attempts, finalStatus: crawlStatus },
          );
        });
        throw new Error(`Crawl ended with status: ${crawlStatus} after ${attempts} attempts`);
      }
      if (!usedDirectFetch) {
        console.log(`[crawl-worker] Crawl completed: jobId=${jobId} after ${attempts} polls`);
      }

      // Log poll result inside a step so it doesn't re-fire on Inngest replays
      await step.run('log-poll-result', async () => {
        if (usedDirectFetch) {
          logCrawlStep(
            businessId,
            jobId,
            'poll-status',
            'warning',
            'Timed out, falling back to direct fetch',
            { attempts },
          );
        } else {
          logCrawlStep(
            businessId,
            jobId,
            'poll-status',
            'success',
            `Completed after ${attempts} polls`,
            { attempts },
          );
        }
      });

      // Step 3: Extract signals and persist, then override seo fields via direct HTTP checks
      await step.run('persist-signals', async () => {
        let prefetchedResult:
          | { status: 'completed'; pages: Array<{ url: string; html: string }> }
          | undefined;

        if (usedDirectFetch) {
          const { data: bizRow } = await supabaseAdmin
            .from('businesses')
            .select('url')
            .eq('id', businessId)
            .single();
          const html = bizRow?.url ? await fetchPageDirect(bizRow.url as string) : null;
          if (html) {
            console.log(
              `[crawl-worker] Direct fetch succeeded for business ${businessId} (${html.length} chars)`,
            );
            prefetchedResult = {
              status: 'completed',
              pages: [{ url: bizRow!.url as string, html }],
            };
          } else {
            console.warn(
              `[crawl-worker] Direct fetch also failed for business ${businessId} — skipping signal extraction`,
            );
            logCrawlStep(
              businessId,
              jobId,
              'persist-signals',
              'failed',
              'Direct fetch fallback also failed',
            );
            return;
          }
        }

        await extractAndPersistSignals(
          businessId,
          usedDirectFetch ? DIRECT_FETCH_DONE : jobId,
          prefetchedResult,
        );
        logCrawlStep(
          businessId,
          jobId,
          'persist-signals',
          'success',
          'Signals extracted and persisted',
        );

        const { data: urlRow } = await supabaseAdmin
          .from('businesses')
          .select('url')
          .eq('id', businessId)
          .single();
        if (!urlRow?.url) return;
        const { hasRobotsTxt, hasSitemap } = await checkDirectSignals(
          normalizeUrl(urlRow.url as string),
        );
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

        await supabaseAdmin.from('extracted_signals').update({ seo }).eq('id', sigRow.id);
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
        console.warn(
          `[fetch-meta] Business ${businessId} no longer exists — skipping remaining steps`,
          bizError?.message,
        );
        return null;
      }

      const { data: proj } = await supabaseAdmin
        .from('projects')
        .select('primary_service, location, postcode')
        .eq('id', biz.project_id)
        .single();
      if (!proj) throw new Error('Project not found');

      const result = {
        name: biz.name as string,
        url: biz.url as string,
        domain: biz.domain as string,
        projectId: biz.project_id as string,
        isOwnBusiness: (biz.is_own_business as boolean | null) ?? false,
        googlePlaceId: biz.google_place_id as string | null,
        primaryService: (proj.primary_service as string) ?? '',
        location: (proj.location as string) ?? '',
        postcode: (proj.postcode as string) ?? '',
      };

      if (!result.primaryService || !result.location) {
        console.warn(
          `[fetch-meta] business ${businessId}: project missing ` +
            `primary_service="${result.primaryService}" location="${result.location}". ` +
            `SERP and AI checks will be skipped.`,
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
        logCrawlStep(businessId, jobId, 'enrich-google', 'success');
      } catch (e) {
        console.error(
          `[enrich-google] Failed for business ${businessId}:`,
          e instanceof Error ? e.message : e,
        );
        logCrawlStep(
          businessId,
          jobId,
          'enrich-google',
          'failed',
          e instanceof Error ? e.message : String(e),
        );
        const userMessage = meta.isOwnBusiness
          ? 'We could not find your business on Google. Go to Settings → Business Details and check your business name and postcode are correct.'
          : `No Google data found for "${meta.name}". This competitor may not have a Google Business Profile, or the name may not match exactly.`;
        await writeEnrichmentError(businessId, 'google', userMessage);
      }
    });

    await step.run('enrich-serp', async () => {
      try {
        await fetchSerpData(
          businessId,
          meta.name,
          meta.domain,
          meta.primaryService,
          meta.location,
          meta.postcode,
        );
        await clearEnrichmentError(businessId, 'serp');
        logCrawlStep(businessId, jobId, 'enrich-serp', 'success');
      } catch (e) {
        console.error(
          `[enrich-serp] Failed for business ${businessId}:`,
          e instanceof Error ? e.message : e,
        );
        logCrawlStep(
          businessId,
          jobId,
          'enrich-serp',
          'failed',
          e instanceof Error ? e.message : String(e),
        );
        const userMessage = meta.isOwnBusiness
          ? 'Could not find your business in local search results. Go to Settings and make sure your Primary Service and Location are filled in.'
          : `No local search data found for "${meta.name}".`;
        await writeEnrichmentError(businessId, 'serp', userMessage);
      }
    });

    // Step 6: AI search visibility check (skip if checked within 24h)
    await step.run('check-ai-visibility', async () => {
      if (!meta.primaryService || !meta.location) {
        logCrawlStep(
          businessId,
          jobId,
          'check-ai-visibility',
          'skipped',
          'Missing primaryService or location',
        );
        return;
      }
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
        if (!visibility) {
          logCrawlStep(
            businessId,
            jobId,
            'check-ai-visibility',
            'skipped',
            'Still fresh (checked within 24h)',
          );
          return;
        }

        const { error } = await supabaseAdmin
          .from('businesses')
          .update({ ai_visibility: visibility })
          .eq('id', businessId);
        if (error) {
          console.error(`[check-ai-visibility] DB write failed for business ${businessId}:`, error);
          logCrawlStep(
            businessId,
            jobId,
            'check-ai-visibility',
            'failed',
            `DB write failed: ${error.message}`,
          );
        } else {
          console.log(
            `[check-ai-visibility] aiPresenceScore=${visibility.aiPresenceScore} saved for business ${businessId}`,
          );
          logCrawlStep(
            businessId,
            jobId,
            'check-ai-visibility',
            'success',
            `aiPresenceScore=${visibility.aiPresenceScore}`,
          );
        }
      } catch (e) {
        console.error(`[check-ai-visibility] Failed for business ${businessId}:`, e);
        logCrawlStep(
          businessId,
          jobId,
          'check-ai-visibility',
          'failed',
          e instanceof Error ? e.message : String(e),
        );
      }
    });

    // Step 7: PageSpeed Insights (mobile + desktop) — marks crawl_status complete
    await step.run('enrich-pagespeed', async () => {
      try {
        const pagespeedData = await fetchPageSpeedData(normalizeUrl(meta.url));
        await updateBusiness(businessId, { pagespeedData, crawlStatus: 'complete' });
        await markCrawlJobComplete(businessId);
        console.log(
          `[enrich-pagespeed] mobile=${pagespeedData.mobile.performanceScore} desktop=${pagespeedData.desktop.performanceScore} for ${businessId}`,
        );
        logCrawlStep(
          businessId,
          jobId,
          'enrich-pagespeed',
          'success',
          `mobile=${pagespeedData.mobile.performanceScore} desktop=${pagespeedData.desktop.performanceScore}`,
        );
      } catch (e) {
        console.error(
          `[enrich-pagespeed] Failed for business ${businessId}:`,
          e instanceof Error ? e.message : e,
        );
        logCrawlStep(
          businessId,
          jobId,
          'enrich-pagespeed',
          'failed',
          e instanceof Error ? e.message : String(e),
        );
        // non-fatal — PSI may be rate-limited or URL unreachable; still mark complete
        await updateBusiness(businessId, { crawlStatus: 'complete' });
        await markCrawlJobComplete(businessId);
      }
    });

    // Step 8: Detect signal changes (runs on any rescan if a confirmed baseline exists).
    // Oscillating values (extraction flip-flops) are suppressed outright; genuine changes
    // are NOT alerted here — they alert only after a confirmation re-crawl reproduces them
    // (see confirmChangeFunction below).
    const pendingConfirmation = await step.run('diff-and-summarize', async () => {
      const { data: rows } = await supabaseAdmin
        .from('extracted_signals')
        .select('id, seo, trust, content, engagement, status')
        .eq('business_id', businessId)
        .order('scanned_at', { ascending: false })
        .limit(7);

      if (!rows || rows.length < 2) return null;

      const detection = rows[0];
      // Only confirmed snapshots may serve as baseline/history — pending/unconfirmed
      // rows are flaky-render suspects and must never poison a diff
      const confirmedRows = rows.slice(1).filter((r) => r.status === 'confirmed');
      const baseline = confirmedRows[0];
      if (!baseline) return null;

      const filtered = suppressOscillatingChanges(
        rowToSignals(baseline),
        rowToSignals(detection),
        confirmedRows.slice(1, 5).map(rowToSignals),
      );
      if (filtered.suppressedPaths.length > 0) {
        logCrawlStep(
          businessId,
          jobId,
          'diff-and-summarize',
          'warning',
          `Suppressed oscillating signals: ${filtered.suppressedPaths.join(', ')}`,
        );
      }
      if (!filtered.hasChanges) return null;

      await supabaseAdmin
        .from('extracted_signals')
        .update({ status: 'pending' })
        .eq('id', detection.id);
      logCrawlStep(
        businessId,
        jobId,
        'diff-and-summarize',
        'success',
        `Changes detected, confirmation crawl scheduled: ${filtered.changedPaths.join(', ')}`,
      );

      return {
        baselineId: baseline.id as string,
        detectionId: detection.id as string,
        changedPaths: filtered.changedPaths,
      };
    });

    if (pendingConfirmation) {
      await step.sendEvent('schedule-change-confirmation', {
        name: 'crawl/change.confirm',
        data: { businessId, ...pendingConfirmation },
        ts: Date.now() + CHANGE_CONFIRMATION_DELAY_MS,
      });
    }

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
          .select('seo, trust, content, engagement')
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
        ? ({
            seo: sig.seo,
            trust: sig.trust,
            content: sig.content,
            engagement: sig.engagement,
          } as ExtractedSignals)
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

      console.log(
        `[calculate-scores] business ${businessId} — google_data:`,
        biz.google_data != null,
        '| serp_data:',
        biz.serp_data != null,
      );

      const aiScore = calculateScores({
        googleData: biz.google_data as GoogleData | null,
        serpData: biz.serp_data as SerpData | null,
        aiVisibility: biz.ai_visibility as AIVisibility | null,
        signals,
        previousReviewCount,
        daysBetween,
        pagespeedData: biz.pagespeed_data as PageSpeedData | null,
      });
      await updateBusiness(businessId, { aiScore });
      console.log(
        `[calculate-scores] ai_score saved for business ${businessId}:`,
        JSON.stringify(aiScore),
      );
      logCrawlStep(
        businessId,
        jobId,
        'calculate-scores',
        'success',
        `overallScore=${aiScore.overallScore}`,
        { overallScore: aiScore.overallScore },
      );
    });

    // Step 10: Generate review sentiment
    await step.run('generate-review-sentiment', async () => {
      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('google_data')
        .eq('id', businessId)
        .single();
      const reviews =
        (biz?.google_data as { recentReviews?: Array<{ rating: number; text: string }> } | null)
          ?.recentReviews ?? [];
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
      // Only decay scores we actually have — unknown stays unknown.
      if (aiScore.reviewVelocityScore !== null) {
        aiScore.reviewVelocityScore = Math.max(0, aiScore.reviewVelocityScore - weeksOver30 * 10);
      }
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
        { onConflict: 'business_id' },
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
        (b) => b.crawl_status === 'complete' || b.crawl_status === 'failed',
      );
      if (!allDone) return;

      const ownBiz = allBiz.find((b) => b.is_own_business);
      if (!ownBiz) return;

      const ownSerp = ownBiz.serp_data as SerpData | null;
      const ownPosition = ownSerp?.localVisibilityPosition;
      if (ownPosition == null) return;
      // "Overtook" means the relative order actually flipped between scans. Baseline
      // scans (no stored previous position) stay silent — a competitor that was simply
      // always ahead is a standing gap, visible in comparison scores, not an event.
      const ownPrevious = ownSerp?.previousLocalVisibilityPosition;
      if (ownPrevious == null) return;

      const overtakers = allBiz.filter((b) => {
        if (b.is_own_business) return false;
        const serp = b.serp_data as SerpData | null;
        const pos = serp?.localVisibilityPosition;
        if (pos == null || pos >= ownPosition) return false;
        const prev = serp?.previousLocalVisibilityPosition;
        if (prev === undefined) return false; // first scan with position tracking — no before/after yet
        return prev === null || prev >= ownPrevious; // previously unranked or behind/equal → real flip
      });

      if (!overtakers.length) return;

      const sinceLast = new Date(Date.now() - THREAT_DEDUP_MS).toISOString();

      // Fetch threat events recorded within the last crawl interval (+slack) to dedup per competitor
      const { data: recentThreats } = await supabaseAdmin
        .from('change_events')
        .select('changes')
        .eq('business_id', ownBiz.id)
        .eq('summary', 'Competitor overtook you in local pack')
        .gte('detected_at', sinceLast);

      const alreadyRecorded = new Set(
        (recentThreats ?? [])
          .flatMap((e) =>
            (e.changes as Array<{ description: string }>).map((c) => {
              try {
                return (JSON.parse(c.description) as { competitorId: string }).competitorId;
              } catch {
                return null;
              }
            }),
          )
          .filter(Boolean),
      );

      for (const comp of overtakers) {
        if (alreadyRecorded.has(comp.id)) continue;

        const theirPosition = (comp.serp_data as SerpData).localVisibilityPosition!;

        const event: ChangeEvent = {
          id: crypto.randomUUID(),
          detectedAt: Date.now(),
          severity: 'high',
          summary: 'Competitor overtook you in local pack',
          changes: [
            {
              category: 'threat',
              description: JSON.stringify({
                competitorId: comp.id,
                theirPosition,
                yourPosition: ownPosition,
              }),
              significance: 'high',
              actionItem:
                'Review your Google Business Profile and local SEO to reclaim your local pack position',
            },
          ],
        };
        await saveChangeEvent(ownBiz.id as string, event);
      }
      // No score penalty here: local pack position already feeds the deterministic
      // localVisibilityScore, so an event-driven −10 double-counted the same fact.
    });

    // Step 14: If all businesses in project are done, generate priority actions
    await step.run('priority-actions', async () => {
      const { data: allBiz } = await supabaseAdmin
        .from('businesses')
        .select('id, name, crawl_status, is_own_business')
        .eq('project_id', meta.projectId);

      if (!allBiz?.length) return;

      const allDone = allBiz.every(
        (b) => b.crawl_status === 'complete' || b.crawl_status === 'failed',
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
              .select('seo, trust, content, engagement')
              .eq('business_id', b.id)
              .order('scanned_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabaseAdmin
              .from('businesses')
              .select('ai_score, google_data, pagespeed_data')
              .eq('id', b.id)
              .single(),
          ]);
          const signals = sig?.seo
            ? ({
                seo: sig.seo,
                trust: sig.trust,
                content: sig.content,
                engagement: sig.engagement,
              } as ExtractedSignals)
            : null;
          return {
            id: b.id as string,
            name: b.name as string,
            isOwn: b.is_own_business as boolean,
            signals,
            aiScore: (bizRow?.ai_score as AIHealthScore) ?? null,
            googleData: bizRow?.google_data ?? null,
            pagespeedData: (bizRow?.pagespeed_data as PageSpeedData) ?? null,
          };
        }),
      );

      const ownRaw = withSignals.find((b) => b.isOwn);
      if (!ownRaw) return;

      const ownBusiness = toPartialBiz(ownRaw);
      const competitorBusinesses = withSignals.filter((b) => !b.isOwn).map((b) => toPartialBiz(b));

      const previousActions = await fetchPreviousActionBatch(meta.projectId);
      const useHistory = previousActions.length > 0 && !!ownRaw.signals;
      const previousSignals = useHistory ? await fetchPreviousSignals(ownRaw.id) : null;

      try {
        const rawActions = useHistory
          ? await generatePriorityActionsWithHistory(
              ownBusiness,
              competitorBusinesses,
              previousActions,
              previousSignals,
              ownRaw.signals!,
              meta.primaryService as ServiceCategory,
            )
          : await generatePriorityActions(
              ownBusiness,
              competitorBusinesses,
              meta.primaryService as ServiceCategory,
            );

        await clearEnrichmentError(ownRaw.id, 'ai_actions');

        if (!rawActions.length) {
          // Should not happen — templates alone usually fire. Surface it instead of
          // leaving the action plan silently empty (the 06-21 symptom).
          console.warn(
            `[priority-actions] generation returned 0 actions for project ${meta.projectId} (own=${ownRaw.id})`,
          );
          await writeEnrichmentError(
            ownRaw.id,
            'ai_actions',
            'No recommendations were generated on the last scan — re-scan to try again.',
          );
          return;
        }

        // Fetch existing actions to deduplicate
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const { data: existingActions } = await supabaseAdmin
          .from('priority_actions')
          .select('action, status, actioned_at')
          .eq('project_id', meta.projectId);

        const existingSet = new Set(
          (existingActions ?? [])
            .filter((e) => {
              // Skip if still active/snoozed/queued (duplicate)
              if (['active', 'snoozed', 'queued'].includes(e.status)) return true;
              // Skip if completed within the last 30 days
              if (e.status === 'completed' && e.actioned_at && e.actioned_at >= thirtyDaysAgo)
                return true;
              return false;
            })
            .map((e) => e.action),
        );

        const newActions = rawActions.filter((a) => !existingSet.has(a.action));
        if (!newActions.length) return;

        // Count current active + snoozed to determine how many slots are open
        const { count: activeCount } = await supabaseAdmin
          .from('priority_actions')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', meta.projectId)
          .in('status', ['active', 'snoozed']);

        const openSlots = Math.max(0, 15 - (activeCount ?? 0));

        await supabaseAdmin.from('priority_actions').insert(
          newActions.map((a, i) => ({
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
            continuity_note: useHistory ? (a.continuityNote ?? null) : null,
          })),
        );
      } catch (e) {
        if (e instanceof AIUnavailableError) {
          await writeEnrichmentError(
            ownRaw.id,
            'ai_actions',
            `Recommendations unavailable — retrying at ${e.retryAt}`,
          );
        } else {
          console.error(`[priority-actions] unexpected error for ${ownRaw.id}:`, e);
          await writeEnrichmentError(
            ownRaw.id,
            'ai_actions',
            'Unexpected error generating recommendations',
          );
        }
      }
    });

    // NOTE: the next crawl is NOT self-scheduled here. The daily health-check cron is the sole
    // scheduler — it re-queues any business older than CRAWL_INTERVAL_DAYS. Self-scheduling per
    // completion forked a new perpetual chain on every extra re-scan, doubling the cadence.
    return { businessId, jobId, status: 'complete' };
  },
);

/** Quarantine a detection snapshot and restore crawl state after a failed/degraded confirmation. */
async function discardUnconfirmedChange(businessId: string, detectionId: string): Promise<void> {
  await supabaseAdmin
    .from('extracted_signals')
    .update({ status: 'unconfirmed' })
    .eq('id', detectionId);
  await updateBusiness(businessId, { crawlStatus: 'complete' });
  await markCrawlJobComplete(businessId);
}

/**
 * Event: crawl/change.confirm
 * Payload: { businessId, baselineId, detectionId, changedPaths }
 *
 * Sent (delayed by CHANGE_CONFIRMATION_DELAY_MS) when a scan detects genuine signal
 * changes. Re-crawls the site fresh (cache bypassed) and re-diffs against the SAME
 * baseline: only reproduced changes become change events. A change that vanishes was
 * a flaky render — the detection snapshot is quarantined so it can never become a
 * diff baseline and re-fire the phantom alert in reverse.
 */
export const confirmChangeFunction = inngest.createFunction(
  {
    id: 'confirm-change',
    retries: 1,
    concurrency: { limit: 3 },
    onFailure: async ({ error, event, step }) => {
      const { businessId, detectionId } = event.data.event.data as {
        businessId: string;
        detectionId: string;
      };
      console.error(`[confirm-change] failed for business ${businessId}:`, error.message);
      logCrawlStep(businessId, null, 'confirm-change', 'failed', error.message?.slice(0, 500));
      // Conservative: a change we could not verify never alerts
      await step.run('discard-unconfirmed', () =>
        discardUnconfirmedChange(businessId, detectionId),
      );
    },
  },
  { event: 'crawl/change.confirm' },
  async ({ event, step }) => {
    const { businessId, baselineId, detectionId, changedPaths } = event.data as {
      businessId: string;
      baselineId: string;
      detectionId: string;
      changedPaths: string[];
    };

    const jobId = await step.run('confirm-start-crawl', () =>
      startBusinessCrawl(businessId, 'incremental'),
    );

    // Direct-fetch fallback yields single-page signals that cannot be compared against
    // a multi-page baseline — the change is unverifiable, and the fallback snapshot
    // itself must be quarantined so it never becomes a baseline.
    if (jobId === DIRECT_FETCH_DONE || jobId === CRAWL_DISALLOWED) {
      await step.run('confirm-degraded-fallback', async () => {
        if (jobId === DIRECT_FETCH_DONE) {
          const { data: latest } = await supabaseAdmin
            .from('extracted_signals')
            .select('id')
            .eq('business_id', businessId)
            .order('scanned_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (latest && latest.id !== detectionId) {
            await supabaseAdmin
              .from('extracted_signals')
              .update({ status: 'unconfirmed' })
              .eq('id', latest.id);
          }
        }
        await discardUnconfirmedChange(businessId, detectionId);
        logCrawlStep(
          businessId,
          jobId,
          'confirm-change',
          'warning',
          'Confirmation crawl degraded to direct fetch — change left unconfirmed',
        );
      });
      return { businessId, status: 'unconfirmed-degraded' };
    }

    let crawlStatus = 'running';
    let attempts = 0;
    while (crawlStatus === 'running' && attempts < MAX_POLL_ATTEMPTS) {
      crawlStatus = await step.run(`confirm-poll-${attempts}`, () =>
        checkCrawlStatus(businessId, jobId),
      );
      attempts++;
      if (crawlStatus === 'running') {
        await step.sleep(`confirm-poll-wait-${attempts}`, POLL_INTERVAL);
      }
    }
    if (crawlStatus !== 'completed') {
      // Throw so retries/onFailure handle quarantine + crawl state restore
      throw new Error(`Confirmation crawl ended with status: ${crawlStatus}`);
    }

    await step.run('confirm-persist-signals', async () => {
      await extractAndPersistSignals(businessId, jobId, undefined, { bypassCache: true });
      await updateBusiness(businessId, { crawlStatus: 'complete' });
    });

    await step.run('confirm-or-discard', async () => {
      const [{ data: baseRow }, { data: confirmRow }, { data: biz }] = await Promise.all([
        supabaseAdmin
          .from('extracted_signals')
          .select('seo, trust, content, engagement, scanned_at')
          .eq('id', baselineId)
          .single(),
        supabaseAdmin
          .from('extracted_signals')
          .select('id, seo, trust, content, engagement')
          .eq('business_id', businessId)
          .order('scanned_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from('businesses')
          .select('name, is_own_business')
          .eq('id', businessId)
          .single(),
      ]);
      if (!baseRow || !confirmRow || !biz || confirmRow.id === detectionId) return;

      // Same oscillation history the detection used: confirmed rows older than the baseline
      const { data: historyRows } = await supabaseAdmin
        .from('extracted_signals')
        .select('seo, trust, content, engagement')
        .eq('business_id', businessId)
        .eq('status', 'confirmed')
        .lt('scanned_at', baseRow.scanned_at as string)
        .order('scanned_at', { ascending: false })
        .limit(4);

      const baseline = rowToSignals(baseRow);
      const filtered = suppressOscillatingChanges(
        baseline,
        rowToSignals(confirmRow),
        (historyRows ?? []).map(rowToSignals),
      );

      if (!filtered.hasChanges) {
        await supabaseAdmin
          .from('extracted_signals')
          .update({ status: 'unconfirmed' })
          .eq('id', detectionId);
        logCrawlStep(
          businessId,
          jobId,
          'confirm-change',
          'warning',
          `Change not reproduced — detection snapshot quarantined (pending: ${changedPaths.join(', ')})`,
        );
        return;
      }

      // Detection is vindicated only if everything it saw reproduced
      const reproduced = new Set(filtered.changedPaths);
      const allHeld = changedPaths.every((p) => reproduced.has(p));
      await supabaseAdmin
        .from('extracted_signals')
        .update({ status: allHeld ? 'confirmed' : 'unconfirmed' })
        .eq('id', detectionId);

      let summary;
      try {
        summary = await generateChangeSummary(
          biz.name as string,
          baseline,
          filtered.filteredCurrent,
          !(biz.is_own_business as boolean),
        );
      } catch (e) {
        if (e instanceof AIUnavailableError) {
          console.warn(`[confirm-change] AI unavailable for ${businessId}, skipping change event`);
          await writeEnrichmentError(
            businessId,
            'change_summary',
            'AI unavailable — change summary skipped',
          );
        } else {
          console.error(`[confirm-change] unexpected error for ${businessId}:`, e);
          await writeEnrichmentError(
            businessId,
            'change_summary',
            'Failed to generate change summary',
          );
        }
        return;
      }
      if (!summary.hasSignificantChanges) return;

      const changeEvent: ChangeEvent = {
        id: crypto.randomUUID(),
        detectedAt: Date.now(),
        severity: summary.severity,
        summary: summary.summary,
        changes: summary.changes,
      };

      await saveChangeEvent(businessId, changeEvent);
      await clearEnrichmentError(businessId, 'change_summary');
      logCrawlStep(
        businessId,
        jobId,
        'confirm-change',
        'success',
        `Change confirmed: ${filtered.changedPaths.join(', ')}`,
      );
    });

    return { businessId, jobId, status: 'confirmed' };
  },
);
