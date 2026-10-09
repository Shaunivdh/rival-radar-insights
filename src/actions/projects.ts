'use server';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { supabaseAdmin } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';
import { calculateScores } from '@/services/scores';
import { mapPriorityActionRow } from '@/lib/priorityActionRow';
import { promoteQueuedActions } from '@/lib/promoteQueuedActions';
import { CRAWL_INTERVAL_MS, DAY_MS } from '@/lib/crawl/config';
import {
  businessJson,
  rowToBusiness,
  rowToChangeEvent,
  rowToSignals,
  toJson,
  type BusinessRow,
} from '@/lib/supabase/mappers';
import type {
  Project,
  Business,
  ExtractedSignals,
  AIHealthScore,
  PriorityAction,
  ChangeEvent,
} from '@/types';
import { asProjectId, type BusinessId, type PriorityActionId, type ProjectId } from '@/types';
import { normalizeUrl, extractDomain, isValidUrl } from '@/lib/url';
import { logger } from '@/lib/logger';

type ProjectRow = Database['public']['Tables']['projects']['Row'];

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getSessionUserId(): Promise<string> {
  const cookieStore = await cookies();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not authenticated');
  return user.id;
}

/** Verify the session user owns `projectId`. Throws if not. Returns userId. */
async function requireProjectOwnership(projectId: ProjectId): Promise<string> {
  const userId = await getSessionUserId();
  const { data } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) throw new Error('Not authorized');
  return userId;
}

/** Verify the session user owns the project that `businessId` belongs to. */
async function requireBusinessOwnership(businessId: BusinessId): Promise<string> {
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('project_id')
    .eq('id', businessId)
    .maybeSingle();
  if (!biz?.project_id) throw new Error('Not authorized');
  return requireProjectOwnership(asProjectId(biz.project_id as string));
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function rowsToProject(p: ProjectRow, businesses: BusinessRow[]): Project {
  const own = businesses.find((b) => b.is_own_business);
  const competitors = businesses.filter((b) => !b.is_own_business);
  return {
    id: asProjectId(p.id),
    name: p.name,
    createdAt: new Date(p.created_at).getTime(),
    ownBusiness: rowToBusiness(own!),
    competitors: competitors.map((b) => rowToBusiness(b)),
    primaryService: p.primary_service ?? null,
    location: p.location ?? null,
    postcode: p.postcode ?? null,
  };
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function createProject(
  name: string,
  ownBusiness: Pick<Business, 'name' | 'url' | 'domain'>,
  competitors: Pick<Business, 'name' | 'url' | 'domain'>[],
  businessDetails?: { primaryService?: string; location?: string; postcode?: string },
): Promise<Project> {
  const userId = await getSessionUserId();

  const allUrls = [ownBusiness.url, ...competitors.map((c) => c.url)];
  const invalidUrl = allUrls.find((u) => !isValidUrl(u));
  if (invalidUrl) throw new Error(`Invalid website URL: ${invalidUrl}`);
  if (competitors.length > 5) throw new Error('Maximum of 5 competitors allowed');

  logger.info('createProject', 'Creating', {
    userId,
    name,
    own: ownBusiness.name,
    competitors: competitors.length,
  });

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .insert({
      user_id: userId,
      name,
      primary_service: businessDetails?.primaryService ?? null,
      location: businessDetails?.location ?? null,
      postcode: businessDetails?.postcode ?? null,
    })
    .select()
    .single();

  if (projectError) {
    logger.error('createProject', 'Project insert failed', { userId, error: projectError.message });
    throw new Error(projectError.message);
  }

  const normalizeEntry = <T extends { url: string; domain: string }>(b: T) => ({
    ...b,
    url: normalizeUrl(b.url),
    domain: extractDomain(b.url),
  });

  const businessRows = [
    { project_id: project.id, ...normalizeEntry(ownBusiness), is_own_business: true },
    ...competitors.map((c) => ({
      project_id: project.id,
      ...normalizeEntry(c),
      is_own_business: false,
    })),
  ];

  const { data: businesses, error: bizError } = await supabaseAdmin
    .from('businesses')
    .insert(businessRows)
    .select();

  if (bizError) {
    logger.error('createProject', 'Businesses insert failed', {
      projectId: project.id,
      error: bizError.message,
    });
    // Clean up orphaned project
    await supabaseAdmin.from('projects').delete().eq('id', project.id);
    throw new Error(bizError.message);
  }

  logger.info('createProject', 'Created', {
    projectId: project.id,
    businesses: businesses?.length ?? 0,
  });
  return rowsToProject(project, businesses);
}

export async function getProject(): Promise<Project | null> {
  const userId = await getSessionUserId();
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('*, businesses(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!project) return null;

  const bizRows: BusinessRow[] = project.businesses ?? [];

  const enriched = await Promise.all(
    bizRows.map(async (b) => {
      const [{ data: sig }, { data: events }] = await Promise.all([
        supabaseAdmin
          .from('extracted_signals')
          .select('seo, trust, content, engagement')
          .eq('business_id', b.id)
          .order('scanned_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from('change_events')
          .select('id, detected_at, severity, summary, changes')
          .eq('business_id', b.id)
          .order('detected_at', { ascending: false })
          .limit(50),
      ]);

      const signals = rowToSignals(sig);
      const changeEvents: ChangeEvent[] = (events ?? []).map(rowToChangeEvent);

      const mapped = rowToBusiness(b, signals, changeEvents);
      let aiScore = mapped.aiScore;
      if (signals && (!aiScore || !aiScore.websiteHealthScore)) {
        aiScore = calculateScores({
          googleData: mapped.googleData,
          serpData: mapped.serpData,
          aiVisibility: mapped.aiVisibility,
          signals,
          pagespeedData: mapped.pagespeedData,
        });
        await supabaseAdmin
          .from('businesses')
          .update({ ai_score: toJson(aiScore) })
          .eq('id', b.id);
      }

      return {
        business: { ...mapped, aiScore },
        isOwn: b.is_own_business,
      };
    }),
  );

  return {
    id: asProjectId(project.id as string),
    name: project.name as string,
    createdAt: new Date(project.created_at as string).getTime(),
    ownBusiness: enriched.find((e) => e.isOwn)!.business,
    competitors: enriched.filter((e) => !e.isOwn).map((e) => e.business),
    primaryService: (project.primary_service as string | null) ?? null,
    location: (project.location as string | null) ?? null,
    postcode: (project.postcode as string | null) ?? null,
  };
}

// updateBusiness/saveChangeEvent moved to @/lib/supabase/business — they are
// worker-only and must not be exposed as server-action endpoints.

function isStale(lastCrawledAt: string | null): boolean {
  if (!lastCrawledAt) return true;
  return Date.now() - new Date(lastCrawledAt).getTime() > CRAWL_INTERVAL_MS;
}

export async function triggerInitialScans(projectId: ProjectId): Promise<void> {
  await requireProjectOwnership(projectId);
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id, last_crawled_at')
    .eq('project_id', projectId);

  if (!businesses?.length) {
    logger.warn('triggerInitialScans', 'No businesses found', { projectId });
    return;
  }

  const stale = businesses.filter((b) => isStale(b.last_crawled_at as string | null));
  if (!stale.length) {
    logger.info('triggerInitialScans', 'All businesses fresh, skipping', {
      projectId,
      total: businesses.length,
    });
    return;
  }

  logger.info('triggerInitialScans', 'Queuing businesses', {
    stale: stale.length,
    total: businesses.length,
    projectId,
    ids: stale.map((b) => b.id),
  });

  await supabaseAdmin
    .from('businesses')
    .update({ crawl_status: 'pending' })
    .in(
      'id',
      stale.map((b) => b.id),
    );

  await inngest.send(
    stale.map((b, i) => ({
      name: 'crawl/business.scan' as const,
      data: { businessId: b.id as string, mode: 'initial' as const },
      ts: Date.now() + i * 15000, // stagger by 15s each
    })),
  );
  logger.info('triggerInitialScans', 'Inngest events sent', { projectId });
}

export async function syncProject(projectId: ProjectId): Promise<{
  businesses: {
    id: string;
    crawlStatus: Business['crawlStatus'];
    signals: ExtractedSignals | null;
    aiScore: AIHealthScore | null;
    enrichmentErrors: Business['enrichmentErrors'];
    changeEvents: ChangeEvent[];
  }[];
  priorityActions: PriorityAction[];
}> {
  await requireProjectOwnership(projectId);
  const { data: rows } = await supabaseAdmin
    .from('businesses')
    .select(
      'id, crawl_status, ai_score, google_data, serp_data, ai_visibility, enrichment_errors, pagespeed_data',
    )
    .eq('project_id', projectId);

  if (!rows?.length) return { businesses: [], priorityActions: [] };

  // Reset stale "running" jobs — if started_at > 35 min ago, mark as failed
  // CF poll loop max: 120 attempts × 5s = 10 min, plus Inngest step overhead per step
  const staleThreshold = new Date(Date.now() - 35 * 60 * 1000).toISOString();
  const runningIds = rows.filter((b) => b.crawl_status === 'running').map((b) => b.id as string);
  if (runningIds.length) {
    const { data: staleJobs } = await supabaseAdmin
      .from('crawl_jobs')
      .select('business_id')
      .in('business_id', runningIds)
      .eq('status', 'running')
      .lt('started_at', staleThreshold);

    if (staleJobs?.length) {
      const staleBusinessIds = staleJobs.map((j) => j.business_id as string);
      await supabaseAdmin
        .from('businesses')
        .update({ crawl_status: 'failed' })
        .in('id', staleBusinessIds);
      await supabaseAdmin
        .from('crawl_jobs')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .in('business_id', staleBusinessIds)
        .eq('status', 'running');
      // Reflect in local rows so the response is consistent
      for (const row of rows) {
        if (staleBusinessIds.includes(row.id as string)) row.crawl_status = 'failed';
      }
    }
  }

  const businesses = await Promise.all(
    rows.map(async (b) => {
      const mapped = businessJson(b);
      let signals: ExtractedSignals | null = null;
      let aiScore: AIHealthScore | null = mapped.aiScore;

      if (b.crawl_status === 'complete') {
        const { data: sig } = await supabaseAdmin
          .from('extracted_signals')
          .select('seo, trust, content, engagement')
          .eq('business_id', b.id)
          .order('scanned_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        signals = rowToSignals(sig);

        // Recalculate if missing, websiteHealthScore is missing/0 with signals, or localVisibilityScore is 0 with serp data
        if (
          !aiScore ||
          (signals && !aiScore.websiteHealthScore) ||
          (b.serp_data && aiScore && aiScore.localVisibilityScore === 0)
        ) {
          aiScore = calculateScores({
            googleData: mapped.googleData,
            serpData: mapped.serpData,
            aiVisibility: mapped.aiVisibility,
            signals,
            pagespeedData: mapped.pagespeedData,
          });
          await supabaseAdmin
            .from('businesses')
            .update({ ai_score: toJson(aiScore) })
            .eq('id', b.id);
        }
      }

      const { data: events } = await supabaseAdmin
        .from('change_events')
        .select('id, detected_at, severity, summary, changes')
        .eq('business_id', b.id)
        .order('detected_at', { ascending: false })
        .limit(50);

      const changeEvents: ChangeEvent[] = (events ?? []).map(rowToChangeEvent);

      return {
        id: b.id,
        crawlStatus: b.crawl_status as Business['crawlStatus'],
        signals,
        aiScore,
        enrichmentErrors: mapped.enrichmentErrors,
        googleData: mapped.googleData,
        serpData: mapped.serpData,
        changeEvents,
      };
    }),
  );

  // Always load existing recommendations — don't hide them just because a scan
  // is mid-flight. Gating this on "all crawls done" meant a stuck/in-progress
  // scan made previously-generated actions disappear from the UI.
  const priorityActions = await queryPriorityActions(projectId);

  return { businesses, priorityActions };
}

export async function triggerSingleScan(businessId: BusinessId): Promise<void> {
  await requireBusinessOwnership(businessId);
  await supabaseAdmin.from('businesses').update({ crawl_status: 'pending' }).eq('id', businessId);

  await inngest.send({
    name: 'crawl/business.scan',
    data: { businessId, mode: 'initial' as const },
  });
}

export async function rescanAll(projectId: ProjectId): Promise<void> {
  await requireProjectOwnership(projectId);
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('project_id', projectId);

  if (!businesses?.length) return;

  await supabaseAdmin
    .from('businesses')
    .update({ crawl_status: 'pending' })
    .in(
      'id',
      businesses.map((b) => b.id),
    );

  await inngest.send(
    businesses.map((b, i) => ({
      name: 'crawl/business.scan' as const,
      data: { businessId: b.id as string, mode: 'incremental' as const },
      ts: Date.now() + i * 15000,
    })),
  );
}

export async function addCompetitor(
  projectId: ProjectId,
  competitor: Pick<Business, 'name' | 'url' | 'domain'>,
): Promise<Business> {
  await requireProjectOwnership(projectId);

  const { data: existing } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_own_business', false);

  if ((existing?.length ?? 0) >= 5) throw new Error('Maximum of 5 competitors allowed');
  if (!isValidUrl(competitor.url))
    throw new Error('Please enter a valid website URL (e.g. example.com)');

  const normalized = {
    ...competitor,
    url: normalizeUrl(competitor.url),
    domain: extractDomain(competitor.url),
  };

  const { data: row, error } = await supabaseAdmin
    .from('businesses')
    .insert({ project_id: projectId, ...normalized, is_own_business: false })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await supabaseAdmin.from('businesses').update({ crawl_status: 'pending' }).eq('id', row.id);

  await inngest.send({
    name: 'crawl/business.scan',
    data: { businessId: row.id, mode: 'initial' as const },
  });

  return rowToBusiness({ ...row, crawl_status: 'pending' });
}

async function queryPriorityActions(projectId: ProjectId): Promise<PriorityAction[]> {
  const { data: actions } = await supabaseAdmin
    .from('priority_actions')
    .select('*')
    .eq('project_id', projectId)
    .in('status', ['active', 'snoozed'])
    .order('generated_at', { ascending: false })
    .order('priority', { ascending: true })
    .limit(15);

  return (actions ?? []).map(mapPriorityActionRow);
}

export async function fetchPriorityActions(projectId: ProjectId): Promise<PriorityAction[]> {
  await requireProjectOwnership(projectId);
  return queryPriorityActions(projectId);
}

/** The own business's scan state, for the plan page's scan badge. */
export type OwnScanState = {
  status: Business['crawlStatus'];
  /** Latest scan that produced site data; a failed attempt never does. */
  lastSuccessAt: string | null;
  /** Latest attempt, failed or not; the weekly schedule runs from this. */
  lastAttemptAt: string | null;
};

/**
 * What the plan page needs beyond live actions: actions marked done in the last 30 days
 * (newest first, with their scan verification), how many open gaps wait in the queue,
 * and the own business's scan state.
 */
export async function fetchPlanHistory(
  projectId: ProjectId,
): Promise<{ completed: PriorityAction[]; queuedCount: number; scan: OwnScanState | null }> {
  await requireProjectOwnership(projectId);
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const [{ data }, { count }, { data: own }] = await Promise.all([
    supabaseAdmin
      .from('priority_actions')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'completed')
      .gte('actioned_at', since)
      .order('actioned_at', { ascending: false }),
    supabaseAdmin
      .from('priority_actions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'queued'),
    supabaseAdmin
      .from('businesses')
      .select('id, crawl_status, last_crawled_at')
      .eq('project_id', projectId)
      .eq('is_own_business', true)
      .maybeSingle(),
  ]);

  let scan: OwnScanState | null = null;
  if (own) {
    const { data: snapshot } = await supabaseAdmin
      .from('extracted_signals')
      .select('scanned_at')
      .eq('business_id', own.id)
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    scan = {
      status: own.crawl_status as Business['crawlStatus'],
      lastSuccessAt: snapshot?.scanned_at ?? null,
      lastAttemptAt: own.last_crawled_at,
    };
  }

  return { completed: (data ?? []).map(mapPriorityActionRow), queuedCount: count ?? 0, scan };
}

// ── Action status management ───────────────────────────────────────────────────

export async function updateActionStatus(
  actionId: PriorityActionId,
  projectId: ProjectId,
  status: 'active' | 'snoozed' | 'completed',
  note?: string,
): Promise<void> {
  await requireProjectOwnership(projectId);
  await supabaseAdmin
    .from('priority_actions')
    .update({
      status,
      note: note ?? null,
      actioned_at: status !== 'active' ? new Date().toISOString() : null,
      // Any status change restarts the scan check.
      verification: null,
      verified_at: null,
      gone_since: null,
      auto_resolved: false,
    })
    .eq('id', actionId)
    .eq('project_id', projectId);

  // When completing, open a slot for queued actions
  if (status === 'completed') {
    await promoteQueuedActions(projectId);
  }
}

export async function updateProjectBusinessDetails(
  projectId: ProjectId,
  details: { primaryService: string; location: string; postcode: string | null },
): Promise<void> {
  const userId = await getSessionUserId();
  const { data: before } = await supabaseAdmin
    .from('projects')
    .select('primary_service, location')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  const { error, count } = await supabaseAdmin
    .from('projects')
    .update(
      {
        primary_service: details.primaryService,
        location: details.location,
        postcode: details.postcode,
      },
      { count: 'exact' },
    )
    .eq('id', projectId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  if (count === 0) throw new Error('Project not found');

  // AI visibility is only rechecked every 14 days and averaged over three runs, so a
  // result for the old service or place would linger for weeks. Clear it so the
  // next scan checks the new one from scratch.
  if (
    before &&
    (before.primary_service !== details.primaryService || before.location !== details.location)
  ) {
    const { error: clearError } = await supabaseAdmin
      .from('businesses')
      .update({ ai_visibility: null })
      .eq('project_id', projectId);
    if (clearError) throw new Error(clearError.message);
  }
}

export async function listProjects(): Promise<Project[]> {
  const userId = await getSessionUserId();
  const { data: projects, error } = await supabaseAdmin
    .from('projects')
    .select('*, businesses(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (projects ?? []).map((p) => rowsToProject(p, p.businesses ?? []));
}
