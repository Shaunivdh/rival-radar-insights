import { supabaseAdmin } from '@/lib/supabase/server';
import {
  generatePriorityActions,
  generatePriorityActionsWithHistory,
  AIUnavailableError,
} from '@/services/ai';
import { mapPriorityActionRow } from '@/lib/priorityActionRow';
import type {
  Business,
  ExtractedSignals,
  AIHealthScore,
  PageSpeedData,
  PriorityAction,
} from '@/types';
import type { ServiceCategory } from '@/lib/serviceCategories';

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
  projectId: string,
): Promise<{ inserted: number; reason?: string; ownBusinessId?: string }> {
  const { data: allBiz } = await supabaseAdmin
    .from('businesses')
    .select(
      'id, name, is_own_business, ai_score, google_data, pagespeed_data, serp_data, ai_visibility, enrichment_errors',
    )
    .eq('project_id', projectId);

  if (!allBiz?.length) return { inserted: 0, reason: 'no businesses in project' };

  const withData = await Promise.all(
    allBiz.map(async (b) => {
      const { data: sig } = await supabaseAdmin
        .from('extracted_signals')
        .select('seo, trust, content, engagement')
        .eq('business_id', b.id)
        .order('scanned_at', { ascending: false })
        .limit(1)
        .maybeSingle();
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
        aiScore: (b.ai_score as AIHealthScore) ?? null,
        googleData: (b.google_data as Business['googleData']) ?? null,
        pagespeedData: (b.pagespeed_data as PageSpeedData) ?? null,
        serpData: (b.serp_data as Business['serpData']) ?? null,
        aiVisibility: (b.ai_visibility as Business['aiVisibility']) ?? null,
        enrichmentErrors: (b.enrichment_errors as Business['enrichmentErrors']) ?? null,
      };
    }),
  );

  const ownRaw = withData.find((b) => b.isOwn);
  if (!ownRaw) return { inserted: 0, reason: 'project has no own business' };

  const { data: projRow } = await supabaseAdmin
    .from('projects')
    .select('primary_service')
    .eq('id', projectId)
    .single();

  // serpData/aiVisibility let the local-pack and AI-visibility templates fire;
  // enrichmentErrors lets the extract-failed gate and prompt warnings work.
  // This is the ONLY action-generation path — the crawl worker calls it too.
  const toBiz = (b: (typeof withData)[number]): Business => ({
    id: b.id,
    name: b.name,
    url: '',
    domain: '',
    lastCrawledAt: null,
    crawlJobId: null,
    crawlStatus: 'complete',
    signals: b.signals,
    googleData: b.googleData,
    serpData: b.serpData,
    pagespeedData: b.pagespeedData,
    aiScore: b.aiScore,
    aiVisibility: b.aiVisibility,
    reviewSentiment: null,
    enrichmentErrors: b.enrichmentErrors,
    previousSignals: null,
    changeEvents: [],
  });

  const ownBusiness = toBiz(ownRaw);
  const competitorBusinesses = withData.filter((b) => !b.isOwn).map(toBiz);

  const previousActions = await fetchPreviousActionBatch(projectId);
  const useHistory = previousActions.length > 0 && !!ownRaw.signals;
  const previousSignals = useHistory ? await fetchPreviousSignals(ownRaw.id) : null;

  let rawActions: PriorityAction[];
  try {
    rawActions =
      useHistory && ownRaw.signals
        ? await generatePriorityActionsWithHistory(
            ownBusiness,
            competitorBusinesses,
            previousActions,
            previousSignals,
            ownRaw.signals,
            projRow?.primary_service as ServiceCategory,
          )
        : await generatePriorityActions(
            ownBusiness,
            competitorBusinesses,
            projRow?.primary_service as ServiceCategory,
          );
  } catch (e) {
    if (e instanceof AIUnavailableError)
      return { inserted: 0, reason: 'AI temporarily unavailable', ownBusinessId: ownRaw.id };
    throw e;
  }

  if (!rawActions.length)
    return { inserted: 0, reason: 'generation returned 0 actions', ownBusinessId: ownRaw.id };

  // Deduplicate against actions that are still live or recently completed.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existingActions } = await supabaseAdmin
    .from('priority_actions')
    .select('action, status, actioned_at')
    .eq('project_id', projectId);

  const existingSet = new Set(
    (existingActions ?? [])
      .filter((e) => {
        if (['active', 'snoozed', 'queued'].includes(e.status as string)) return true;
        if (e.status === 'completed' && e.actioned_at && (e.actioned_at as string) >= thirtyDaysAgo)
          return true;
        return false;
      })
      .map((e) => e.action as string),
  );

  const newActions = rawActions.filter((a) => !existingSet.has(a.action));
  if (!newActions.length)
    return { inserted: 0, reason: 'all generated actions already exist', ownBusinessId: ownRaw.id };

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
    })),
  );

  if (insertError) {
    console.error('[priorityActions] insert failed:', insertError);
    return {
      inserted: 0,
      reason: `insert failed: ${insertError.message}`,
      ownBusinessId: ownRaw.id,
    };
  }

  return { inserted: newActions.length, ownBusinessId: ownRaw.id };
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
  const prev = data?.[1];
  if (!prev?.seo) return null;
  return {
    seo: prev.seo,
    trust: prev.trust,
    content: prev.content,
    engagement: prev.engagement,
  } as ExtractedSignals;
}
