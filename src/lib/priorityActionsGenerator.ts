import { supabaseAdmin } from '@/lib/supabase/server';
import {
  generatePriorityActions,
  generatePriorityActionsWithHistory,
  AIUnavailableError,
} from '@/services/ai';
import { mapPriorityActionRow } from '@/lib/priorityActionRow';
import { businessJson, rowToSignals } from '@/lib/supabase/mappers';
import { fetchReviewGrowth } from '@/lib/supabase/reviewHistory';
import type { Business, ExtractedSignals, PriorityAction } from '@/types';
import { asBusinessId, type BusinessId, type ProjectId } from '@/types';

/**
 * Prefix of the insert-failure reason. Exported because the crawl worker matches
 * it with `startsWith`, which no closed union can protect: renaming the literal
 * in one place would leave that branch compiling and silently never matching.
 */
export const INSERT_FAILED_PREFIX = 'insert failed';

/**
 * Why a run produced no actions.
 *
 * Closed on purpose: `runProjectActionGeneration` in the crawl worker branches on
 * these exact strings, so rewording one here is a compile error at the branch
 * rather than a condition that silently stops matching. The insert case keeps a
 * template literal because it carries the Postgres message.
 */
export type ActionGenerationReason =
  | 'no businesses in project'
  | 'project has no own business'
  | 'AI temporarily unavailable'
  | 'generation returned 0 actions'
  | 'all generated actions already exist'
  | `${typeof INSERT_FAILED_PREFIX}: ${string}`;

export type ActionGenerationResult = {
  inserted: number;
  reason?: ActionGenerationReason;
  ownBusinessId?: BusinessId;
  /** Set with reason 'AI temporarily unavailable', from the caught AIUnavailableError. */
  retryAt?: string;
};
import type { ServiceCategory } from '@/lib/serviceCategories';
import { logger } from '@/lib/logger';

export type ProjectForActions = {
  own: Business;
  competitors: Business[];
  primaryService?: ServiceCategory;
  location?: string | null;
};

/**
 * Load a project's businesses exactly as action generation sees them: latest
 * signals, enrichment JSON and review growth per business. Shared with
 * scripts/eval-action-plan.ts so the eval cannot drift from production.
 */
export async function loadProjectForActions(
  projectId: ProjectId,
): Promise<
  ProjectForActions | { missing: 'no businesses in project' | 'project has no own business' }
> {
  const { data: allBiz } = await supabaseAdmin
    .from('businesses')
    .select(
      'id, name, is_own_business, ai_score, google_data, pagespeed_data, serp_data, ai_visibility, enrichment_errors',
    )
    .eq('project_id', projectId);

  if (!allBiz?.length) return { missing: 'no businesses in project' };

  // serpData/aiVisibility let the local-pack and AI-visibility templates fire;
  // enrichmentErrors lets the extract-failed gate and prompt warnings work.
  const businesses = await Promise.all(
    allBiz.map(async (b) => {
      const { data: sig } = await supabaseAdmin
        .from('extracted_signals')
        .select('seo, trust, content, engagement')
        .eq('business_id', b.id)
        .order('scanned_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const json = businessJson(b);
      const business: Business = {
        id: asBusinessId(b.id),
        name: b.name,
        url: '',
        domain: '',
        lastCrawledAt: null,
        crawlJobId: null,
        crawlStatus: 'complete',
        signals: rowToSignals(sig),
        googleData: json.googleData,
        serpData: json.serpData,
        pagespeedData: json.pagespeedData,
        aiScore: json.aiScore,
        aiVisibility: json.aiVisibility,
        reviewSentiment: null,
        enrichmentErrors: json.enrichmentErrors,
        reviewGrowth: await fetchReviewGrowth(supabaseAdmin, b.id),
        previousSignals: null,
        changeEvents: [],
      };
      return { isOwn: b.is_own_business, business };
    }),
  );

  const own = businesses.find((b) => b.isOwn)?.business;
  if (!own) return { missing: 'project has no own business' };

  const { data: projRow } = await supabaseAdmin
    .from('projects')
    .select('primary_service, location')
    .eq('id', projectId)
    .single();

  return {
    own,
    competitors: businesses.filter((b) => !b.isOwn).map((b) => b.business),
    primaryService: (projRow?.primary_service ?? undefined) as ServiceCategory | undefined,
    location: projRow?.location ?? null,
  };
}

/**
 * Generate and persist priority actions for a project from its already-persisted
 * enrichment data — WITHOUT depending on a crawl run finishing.
 *
 * The crawl worker generates actions as its final step (`priority-actions`), but
 * that only runs if the whole pipeline completes. When runs hang or queue, the
 * action plan stays empty even though the underlying data is complete. This is
 * the decoupled recovery path: it reads the latest businesses/signals/scores and
 * produces the plan synchronously.
 */
export async function generateAndPersistProjectActions(
  projectId: ProjectId,
): Promise<ActionGenerationResult> {
  // This is the ONLY action-generation path — the crawl worker calls it too.
  const loaded = await loadProjectForActions(projectId);
  if ('missing' in loaded) return { inserted: 0, reason: loaded.missing };
  const { own: ownBusiness, competitors: competitorBusinesses, primaryService, location } = loaded;

  const previousActions = await fetchPreviousActionBatch(projectId);
  const useHistory = previousActions.length > 0 && !!ownBusiness.signals;
  const previousSignals = useHistory ? await fetchPreviousSignals(ownBusiness.id) : null;

  // Actions still live or recently completed. Loaded before generation so live
  // templates are skipped and the next best fresh gaps are chosen instead.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existingActions } = await supabaseAdmin
    .from('priority_actions')
    .select('action, template_id, status, actioned_at')
    .eq('project_id', projectId);

  const liveExisting = (existingActions ?? []).filter((e) => {
    if (['active', 'snoozed', 'queued'].includes(e.status as string)) return true;
    if (e.status === 'completed' && e.actioned_at && (e.actioned_at as string) >= thirtyDaysAgo)
      return true;
    return false;
  });
  const existingSet = new Set(liveExisting.map((e) => e.action as string));
  // Template actions match on id so a copy edit does not re-add the same gap.
  const existingTemplateIds = new Set(
    liveExisting.map((e) => e.template_id).filter((id): id is string => id != null),
  );
  const genOpts = {
    location,
    excludeTemplateIds: [...existingTemplateIds],
  };

  let rawActions: PriorityAction[];
  try {
    rawActions =
      useHistory && ownBusiness.signals
        ? await generatePriorityActionsWithHistory(
            ownBusiness,
            competitorBusinesses,
            previousActions,
            previousSignals,
            ownBusiness.signals,
            primaryService,
            genOpts,
          )
        : await generatePriorityActions(ownBusiness, competitorBusinesses, primaryService, genOpts);
  } catch (e) {
    if (e instanceof AIUnavailableError) {
      logger.warn('priorityActions', 'AI unavailable', { projectId, kind: e.kind });
      return {
        inserted: 0,
        reason: 'AI temporarily unavailable',
        ownBusinessId: ownBusiness.id,
        retryAt: e.retryAt,
      };
    }
    throw e;
  }

  if (!rawActions.length)
    return { inserted: 0, reason: 'generation returned 0 actions', ownBusinessId: ownBusiness.id };

  const newActions = rawActions.filter(
    (a) => !existingSet.has(a.action) && !(a.templateId && existingTemplateIds.has(a.templateId)),
  );
  if (!newActions.length)
    return {
      inserted: 0,
      reason: 'all generated actions already exist',
      ownBusinessId: ownBusiness.id,
    };

  const { count: activeCount } = await supabaseAdmin
    .from('priority_actions')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .in('status', ['active', 'snoozed']);

  const openSlots = Math.max(0, 15 - (activeCount ?? 0));

  const { error: insertError } = await supabaseAdmin.from('priority_actions').insert(
    newActions.map((a, i) => ({
      project_id: projectId,
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
      template_id: a.templateId ?? null,
    })),
  );

  if (insertError) {
    logger.error('priorityActions', 'Insert failed', { error: insertError });
    return {
      inserted: 0,
      reason: `${INSERT_FAILED_PREFIX}: ${insertError.message}`,
      ownBusinessId: ownBusiness.id,
    };
  }

  return { inserted: newActions.length, ownBusinessId: ownBusiness.id };
}

/** Latest batch of priority actions (all rows sharing the most recent generated_at). */
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

/** The previous (second-most-recent) extracted_signals row for a business. */
async function fetchPreviousSignals(businessId: string): Promise<ExtractedSignals | null> {
  const { data } = await supabaseAdmin
    .from('extracted_signals')
    .select('seo, trust, content, engagement')
    .eq('business_id', businessId)
    .order('scanned_at', { ascending: false })
    .limit(2);
  return rowToSignals(data?.[1]);
}
