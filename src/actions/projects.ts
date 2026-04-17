'use server';

import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';
import { calculateScores } from '@/services/scores';
import type { Project, Business, ExtractedSignals, AIHealthScore, PriorityAction, ChangeEvent, AIVisibility, PageSpeedData, ReviewSentiment } from '@/types';
import { normalizeUrl, extractDomain } from '@/lib/url';

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getSessionUserId(): Promise<string> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.getAll().find(
    c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
  );
  if (!authCookie?.value) throw new Error('Not authenticated');

  let raw = authCookie.value;

  if (raw.startsWith('base64-')) {
    raw = Buffer.from(raw.slice(7), 'base64').toString('utf-8');
  }
  const parsed = JSON.parse(raw);
  const session = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!session?.access_token) throw new Error('Not authenticated');
  const { data } = await supabaseAdmin.auth.getUser(session.access_token);
  if (!data.user) throw new Error('Not authenticated');
  return data.user.id;
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function mapBusiness(
  b: Record<string, unknown>,
  signals: ExtractedSignals | null = null,
  changeEvents: ChangeEvent[] = []
): Business {
  return {
    id: b.id as string,
    name: b.name as string,
    url: b.url as string,
    domain: b.domain as string,
    lastCrawledAt: b.last_crawled_at ? new Date(b.last_crawled_at as string).getTime() : null,
    crawlJobId: (b.crawl_job_id as string) ?? null,
    crawlStatus: (b.crawl_status as Business['crawlStatus']) ?? 'idle',
    signals,
    googleData: (b.google_data as Business['googleData']) ?? null,
    serpData: (b.serp_data as Business['serpData']) ?? null,
    aiScore: (b.ai_score as AIHealthScore) ?? null,
    aiVisibility: (b.ai_visibility as AIVisibility) ?? null,
    pagespeedData: (b.pagespeed_data as PageSpeedData) ?? null,
    reviewSentiment: (b.review_sentiment as ReviewSentiment) ?? null,
    enrichmentErrors: (b.enrichment_errors as Business['enrichmentErrors']) ?? null,
    previousSignals: null,
    changeEvents,
  };
}

function rowsToProject(p: Record<string, unknown>, businesses: Record<string, unknown>[]): Project {
  const own = businesses.find(b => b.is_own_business);
  const competitors = businesses.filter(b => !b.is_own_business);
  return {
    id: p.id as string,
    name: p.name as string,
    createdAt: new Date(p.created_at as string).getTime(),
    ownBusiness: mapBusiness(own!),
    competitors: competitors.map(b => mapBusiness(b)),
  };
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function createProject(
  name: string,
  ownBusiness: Pick<Business, 'name' | 'url' | 'domain'>,
  competitors: Pick<Business, 'name' | 'url' | 'domain'>[]
): Promise<Project> {
  const userId = await getSessionUserId();

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .insert({ user_id: userId, name })
    .select()
    .single();

  if (projectError) throw new Error(projectError.message);

  const normalizeEntry = <T extends { url: string; domain: string }>(b: T) => ({
    ...b,
    url: normalizeUrl(b.url),
    domain: extractDomain(b.url),
  });

  const businessRows = [
    { project_id: project.id, ...normalizeEntry(ownBusiness), is_own_business: true },
    ...competitors.map(c => ({ project_id: project.id, ...normalizeEntry(c), is_own_business: false })),
  ];

  const { data: businesses, error: bizError } = await supabaseAdmin
    .from('businesses')
    .insert(businessRows)
    .select();

  if (bizError) throw new Error(bizError.message);

  return rowsToProject(project, businesses);
}

export async function getProject(userId: string): Promise<Project | null> {
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('*, businesses(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!project) return null;

  const bizRows: Record<string, unknown>[] = project.businesses ?? [];

  const enriched = await Promise.all(
    bizRows.map(async b => {
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
          .order('detected_at', { ascending: false }),
      ]);

      const parseField = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;
      const signals = sig?.seo
        ? ({
            seo: parseField(sig.seo),
            trust: parseField(sig.trust),
            content: parseField(sig.content),
            engagement: parseField(sig.engagement),
          } as ExtractedSignals)
        : null;
      const changeEvents: ChangeEvent[] = (events ?? []).map(e => ({
        id: e.id as string,
        detectedAt: new Date(e.detected_at as string).getTime(),
        severity: e.severity as ChangeEvent['severity'],
        summary: e.summary as string,
        changes: e.changes as ChangeEvent['changes'],
      }));

      let aiScore = (b.ai_score as AIHealthScore) ?? null;
      if (signals && (!aiScore || aiScore.websiteHealthScore === 0)) {
        aiScore = calculateScores(
          b.google_data as Parameters<typeof calculateScores>[0],
          b.serp_data as Parameters<typeof calculateScores>[1],
          b.ai_visibility as Parameters<typeof calculateScores>[2],
          signals,
        );
        await supabaseAdmin.from('businesses').update({ ai_score: aiScore }).eq('id', b.id);
      }

      return { business: mapBusiness({ ...b, ai_score: aiScore }, signals, changeEvents), isOwn: b.is_own_business as boolean };
    })
  );

  return {
    id: project.id as string,
    name: project.name as string,
    createdAt: new Date(project.created_at as string).getTime(),
    ownBusiness: enriched.find(e => e.isOwn)!.business,
    competitors: enriched.filter(e => !e.isOwn).map(e => e.business),
  };
}

export async function updateBusiness(
  businessId: string,
  partial: Partial<Pick<Business, 'crawlStatus' | 'crawlJobId' | 'lastCrawledAt' | 'aiScore' | 'googleData' | 'serpData' | 'aiVisibility' | 'pagespeedData' | 'reviewSentiment'>>,
  extras?: { googlePlaceId?: string }
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (partial.crawlStatus !== undefined) row.crawl_status = partial.crawlStatus;
  if (partial.crawlJobId !== undefined) row.crawl_job_id = partial.crawlJobId;
  if (partial.lastCrawledAt !== undefined)
    row.last_crawled_at = partial.lastCrawledAt ? new Date(partial.lastCrawledAt).toISOString() : null;
  if (partial.aiScore !== undefined) row.ai_score = partial.aiScore;
  if (partial.googleData !== undefined) row.google_data = partial.googleData;
  if (partial.serpData !== undefined) row.serp_data = partial.serpData;
  if (partial.aiVisibility !== undefined) row.ai_visibility = partial.aiVisibility;
  if (partial.pagespeedData !== undefined) row.pagespeed_data = partial.pagespeedData;
  if (partial.reviewSentiment !== undefined) row.review_sentiment = partial.reviewSentiment;
  if (extras?.googlePlaceId !== undefined) row.google_place_id = extras.googlePlaceId;

  const { error } = await supabaseAdmin.from('businesses').update(row).eq('id', businessId);
  if (error) throw new Error(error.message);
}

export async function saveChangeEvent(businessId: string, event: ChangeEvent): Promise<void> {
  const { error } = await supabaseAdmin.from('change_events').insert({
    id: event.id,
    business_id: businessId,
    detected_at: new Date(event.detectedAt).toISOString(),
    severity: event.severity,
    summary: event.summary,
    changes: event.changes,
  });
  if (error) throw new Error(error.message);
}

const CRAWL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isStale(lastCrawledAt: string | null): boolean {
  if (!lastCrawledAt) return true;
  return Date.now() - new Date(lastCrawledAt).getTime() > CRAWL_TTL_MS;
}

export async function triggerInitialScans(projectId: string): Promise<void> {
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id, last_crawled_at')
    .eq('project_id', projectId);

  if (!businesses?.length) return;

  const stale = businesses.filter(b => isStale(b.last_crawled_at as string | null));
  if (!stale.length) return;

  await supabaseAdmin
    .from('businesses')
    .update({ crawl_status: 'pending' })
    .in('id', stale.map(b => b.id));

  await inngest.send(
    stale.map((b, i) => ({
      name: 'crawl/business.scan' as const,
      data: { businessId: b.id as string, mode: 'initial' as const },
      ts: Date.now() + i * 15000, // stagger by 15s each
    }))
  );
}

export async function syncProject(projectId: string): Promise<{
  businesses: { id: string; crawlStatus: Business['crawlStatus']; signals: ExtractedSignals | null; aiScore: AIHealthScore | null; enrichmentErrors: Business['enrichmentErrors']; changeEvents: ChangeEvent[] }[];
  priorityActions: PriorityAction[];
}> {
  const { data: rows } = await supabaseAdmin
    .from('businesses')
    .select('id, crawl_status, ai_score, google_data, serp_data, ai_visibility, enrichment_errors')
    .eq('project_id', projectId);

  if (!rows?.length) return { businesses: [], priorityActions: [] };

  // Reset stale "running" jobs — if started_at > 35 min ago, mark as failed
  // CF poll loop max: 120 attempts × 5s = 10 min, plus Inngest step overhead per step
  const staleThreshold = new Date(Date.now() - 35 * 60 * 1000).toISOString();
  const runningIds = rows.filter(b => b.crawl_status === 'running').map(b => b.id as string);
  if (runningIds.length) {
    const { data: staleJobs } = await supabaseAdmin
      .from('crawl_jobs')
      .select('business_id')
      .in('business_id', runningIds)
      .eq('status', 'running')
      .lt('started_at', staleThreshold);

    if (staleJobs?.length) {
      const staleBusinessIds = staleJobs.map(j => j.business_id as string);
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
    rows.map(async b => {
      let signals: ExtractedSignals | null = null;
      let aiScore: AIHealthScore | null = (b.ai_score as AIHealthScore) ?? null;

      if (b.crawl_status === 'complete') {
        const { data: sig } = await supabaseAdmin
          .from('extracted_signals')
          .select('seo, trust, content, engagement')
          .eq('business_id', b.id)
          .order('scanned_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sig?.seo) {
          const parseField = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;
          signals = {
            seo: parseField(sig.seo),
            trust: parseField(sig.trust),
            content: parseField(sig.content),
            engagement: parseField(sig.engagement),
          } as ExtractedSignals;
        }

        // Recalculate if missing, websiteHealthScore is 0 with signals, or localVisibilityScore is 0 with serp data
        if (!aiScore || (signals && aiScore.websiteHealthScore === 0) || (b.serp_data && aiScore && aiScore.localVisibilityScore === 0)) {
          aiScore = calculateScores(
            b.google_data as Parameters<typeof calculateScores>[0],
            b.serp_data as Parameters<typeof calculateScores>[1],
            b.ai_visibility as Parameters<typeof calculateScores>[2],
            signals
          );
          await supabaseAdmin.from('businesses').update({ ai_score: aiScore }).eq('id', b.id);
        }
      }

      const { data: events } = await supabaseAdmin
        .from('change_events')
        .select('id, detected_at, severity, summary, changes')
        .eq('business_id', b.id)
        .order('detected_at', { ascending: false });

      const changeEvents: ChangeEvent[] = (events ?? []).map(e => ({
        id: e.id as string,
        detectedAt: new Date(e.detected_at as string).getTime(),
        severity: e.severity as ChangeEvent['severity'],
        summary: e.summary as string,
        changes: e.changes as ChangeEvent['changes'],
      }));

      return { id: b.id as string, crawlStatus: b.crawl_status as Business['crawlStatus'], signals, aiScore, enrichmentErrors: (b.enrichment_errors as Business['enrichmentErrors']) ?? null, googleData: (b.google_data as Business['googleData']) ?? null, serpData: (b.serp_data as Business['serpData']) ?? null, changeEvents };
    })
  );

  const allDone = businesses.every(b => b.crawlStatus === 'complete' || b.crawlStatus === 'failed');
  let priorityActions: PriorityAction[] = [];

  if (allDone) {
    const { data: actions } = await supabaseAdmin
      .from('priority_actions')
      .select('*')
      .eq('project_id', projectId)
      .order('generated_at', { ascending: false })
      .limit(10);

    if (actions?.length) {
      priorityActions = actions.map(r => ({
        priority: r.priority as 1 | 2 | 3,
        category: r.category,
        action: r.action,
        reason: r.reason,
        competitorReference: r.competitor_reference ?? '',
        estimatedImpact: r.estimated_impact as PriorityAction['estimatedImpact'],
        timeframe: r.timeframe,
      }));
    }
  }

  return { businesses, priorityActions };
}

export async function triggerSingleScan(businessId: string): Promise<void> {
  await supabaseAdmin
    .from('businesses')
    .update({ crawl_status: 'pending' })
    .eq('id', businessId);

  await inngest.send({
    name: 'crawl/business.scan',
    data: { businessId, mode: 'initial' as const },
  });
}

export async function rescanAll(projectId: string): Promise<void> {
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('project_id', projectId);

  if (!businesses?.length) return;

  await supabaseAdmin
    .from('businesses')
    .update({ crawl_status: 'pending' })
    .in('id', businesses.map(b => b.id));

  await inngest.send(
    businesses.map((b, i) => ({
      name: 'crawl/business.scan' as const,
      data: { businessId: b.id as string, mode: 'incremental' as const },
      ts: Date.now() + i * 15000,
    }))
  );
}

export async function addCompetitor(
  projectId: string,
  competitor: Pick<Business, 'name' | 'url' | 'domain'>
): Promise<Business> {
  await getSessionUserId();

  const { data: existing } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_own_business', false);

  if ((existing?.length ?? 0) >= 5) throw new Error('Maximum of 5 competitors allowed');

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
    data: { businessId: row.id as string, mode: 'initial' as const },
  });

  return mapBusiness({ ...row, crawl_status: 'pending' });
}

export async function listProjects(userId: string): Promise<Project[]> {
  const { data: projects, error } = await supabaseAdmin
    .from('projects')
    .select('*, businesses(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (projects ?? []).map(p => rowsToProject(p, p.businesses ?? []));
}
