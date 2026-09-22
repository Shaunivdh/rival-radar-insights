'use server';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { supabaseAdmin } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';
import { calculateScores } from '@/services/scores';
import { mapPriorityActionRow } from '@/lib/priorityActionRow';
import { CRAWL_INTERVAL_MS } from '@/lib/crawl/config';
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
import { normalizeUrl, extractDomain, isValidUrl } from '@/lib/url';

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
async function requireProjectOwnership(projectId: string): Promise<string> {
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
async function requireBusinessOwnership(businessId: string): Promise<string> {
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('project_id')
    .eq('id', businessId)
    .maybeSingle();
  if (!biz?.project_id) throw new Error('Not authorized');
  return requireProjectOwnership(biz.project_id as string);
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function rowsToProject(p: ProjectRow, businesses: BusinessRow[]): Project {
  const own = businesses.find((b) => b.is_own_business);
  const competitors = businesses.filter((b) => !b.is_own_business);
  return {
    id: p.id,
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

  console.log(
    `[createProject] userId=${userId} name="${name}" own="${ownBusiness.name}" competitors=${competitors.length}`,
  );

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
    console.error(`[createProject] project insert failed userId=${userId}:`, projectError.message);
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
    console.error(
      `[createProject] businesses insert failed projectId=${project.id}:`,
      bizError.message,
    );
    // Clean up orphaned project
    await supabaseAdmin.from('projects').delete().eq('id', project.id);
    throw new Error(bizError.message);
  }

  console.log(
    `[createProject] created projectId=${project.id} businesses=${businesses?.length ?? 0}`,
  );
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
    id: project.id as string,
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

export async function triggerInitialScans(projectId: string): Promise<void> {
  await requireProjectOwnership(projectId);
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id, last_crawled_at')
    .eq('project_id', projectId);

  if (!businesses?.length) {
    console.warn(`[triggerInitialScans] no businesses found for projectId=${projectId}`);
    return;
  }

  const stale = businesses.filter((b) => isStale(b.last_crawled_at as string | null));
  if (!stale.length) {
    console.log(
      `[triggerInitialScans] all businesses fresh, skipping projectId=${projectId} total=${businesses.length}`,
    );
    return;
  }

  console.log(
    `[triggerInitialScans] queuing ${stale.length}/${businesses.length} businesses for projectId=${projectId} ids=${stale.map((b) => b.id).join(',')}`,
  );

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
  console.log(`[triggerInitialScans] inngest events sent for projectId=${projectId}`);
}

export async function syncProject(projectId: string): Promise<{
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

export async function triggerSingleScan(businessId: string): Promise<void> {
  await requireBusinessOwnership(businessId);
  await supabaseAdmin.from('businesses').update({ crawl_status: 'pending' }).eq('id', businessId);

  await inngest.send({
    name: 'crawl/business.scan',
    data: { businessId, mode: 'initial' as const },
  });
}

export async function rescanAll(projectId: string): Promise<void> {
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
  projectId: string,
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

async function queryPriorityActions(projectId: string): Promise<PriorityAction[]> {
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

export async function fetchPriorityActions(projectId: string): Promise<PriorityAction[]> {
  await requireProjectOwnership(projectId);
  return queryPriorityActions(projectId);
}

// ── Action status management ───────────────────────────────────────────────────

async function promoteQueuedActions(projectId: string): Promise<void> {
  // Count current active + snoozed
  const { count } = await supabaseAdmin
    .from('priority_actions')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .in('status', ['active', 'snoozed']);

  const slots = Math.max(0, 15 - (count ?? 0));
  if (slots === 0) return;

  // Fetch oldest queued actions to promote
  const { data: queued } = await supabaseAdmin
    .from('priority_actions')
    .select('id')
    .eq('project_id', projectId)
    .eq('status', 'queued')
    .order('generated_at', { ascending: true })
    .order('priority', { ascending: true })
    .limit(slots);

  if (!queued?.length) return;

  await supabaseAdmin
    .from('priority_actions')
    .update({ status: 'active' })
    .in(
      'id',
      queued.map((q) => q.id),
    );
}

export async function updateActionStatus(
  actionId: string,
  projectId: string,
  status: 'active' | 'snoozed' | 'completed',
  note?: string,
): Promise<PriorityAction[]> {
  await requireProjectOwnership(projectId);
  await supabaseAdmin
    .from('priority_actions')
    .update({
      status,
      note: note ?? null,
      actioned_at: status !== 'active' ? new Date().toISOString() : null,
    })
    .eq('id', actionId)
    .eq('project_id', projectId);

  // When completing, open a slot for queued actions
  if (status === 'completed') {
    await promoteQueuedActions(projectId);
  }

  return queryPriorityActions(projectId);
}

export async function updateProjectBusinessDetails(
  projectId: string,
  details: { primaryService: string; location: string; postcode: string | null },
): Promise<void> {
  const userId = await getSessionUserId();
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
