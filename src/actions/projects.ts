'use server';

import { supabaseAdmin } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';
import { generateHealthScore } from '@/services/ai';
import type { Project, Business, ExtractedSignals, AIHealthScore, PriorityAction } from '@/types';

export async function createProject(
  userId: string,
  data: { name: string; ownBusiness: Pick<Business, 'name' | 'url' | 'domain'>; competitors: Pick<Business, 'name' | 'url' | 'domain'>[] }
): Promise<Project> {
  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .insert({ user_id: userId, name: data.name })
    .select()
    .single();

  if (projectError) throw new Error(projectError.message);

  const businessRows = [
    { project_id: project.id, ...data.ownBusiness, is_own_business: true },
    ...data.competitors.map((c) => ({ project_id: project.id, ...c, is_own_business: false })),
  ];

  const { data: businesses, error: bizError } = await supabaseAdmin
    .from('businesses')
    .insert(businessRows)
    .select();

  if (bizError) throw new Error(bizError.message);

  return rowsToProject(project, businesses);
}

export async function triggerInitialScans(projectId: string): Promise<void> {
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('project_id', projectId);

  if (!businesses?.length) return;

  await supabaseAdmin
    .from('businesses')
    .update({ crawl_status: 'pending' })
    .eq('project_id', projectId);

  await inngest.send(
    businesses.map((b) => ({
      name: 'crawl/business.scan' as const,
      data: { businessId: b.id as string, mode: 'initial' as const },
    }))
  );
}

export async function syncProject(projectId: string): Promise<{
  businesses: { id: string; crawlStatus: Business['crawlStatus']; signals: ExtractedSignals | null; aiScore: AIHealthScore | null }[];
  priorityActions: PriorityAction[];
}> {
  const { data: rows } = await supabaseAdmin
    .from('businesses')
    .select('id, crawl_status')
    .eq('project_id', projectId);

  if (!rows?.length) return { businesses: [], priorityActions: [] };

  const businesses = await Promise.all(
    rows.map(async (b) => {
      let signals: ExtractedSignals | null = null;
      let aiScore: AIHealthScore | null = null;

      if (b.crawl_status === 'complete') {
        const { data: sig } = await supabaseAdmin
          .from('extracted_signals')
          .select('seo,pricing,trust,content,engagement,features')
          .eq('business_id', b.id)
          .eq('is_current', true)
          .maybeSingle();

        if (sig) {
          signals = sig as ExtractedSignals;

          const { data: score } = await supabaseAdmin
            .from('ai_health_scores')
            .select('*')
            .eq('business_id', b.id)
            .order('generated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (score) {
            aiScore = {
              overallScore: score.overall_score,
              seoScore: score.seo_score,
              trustScore: score.trust_score,
              contentScore: score.content_score,
              engagementScore: score.engagement_score,
              pricingTransparencyScore: score.pricing_transparency_score,
              summary: score.summary,
            };
          } else {
            try {
              aiScore = await generateHealthScore(signals);
              await supabaseAdmin.from('ai_health_scores').insert({
                business_id: b.id,
                overall_score: aiScore.overallScore,
                seo_score: aiScore.seoScore,
                trust_score: aiScore.trustScore,
                content_score: aiScore.contentScore,
                engagement_score: aiScore.engagementScore,
                pricing_transparency_score: aiScore.pricingTransparencyScore,
                summary: aiScore.summary,
              });
            } catch { /* leave null */ }
          }
        }
      }

      return { id: b.id as string, crawlStatus: b.crawl_status as Business['crawlStatus'], signals, aiScore };
    })
  );

  // Fetch persisted priority actions if all done
  const allDone = businesses.every((b) => b.crawlStatus === 'complete' || b.crawlStatus === 'failed');
  let priorityActions: PriorityAction[] = [];

  if (allDone) {
    const { data: actions } = await supabaseAdmin
      .from('priority_actions')
      .select('*')
      .eq('project_id', projectId)
      .order('generated_at', { ascending: false })
      .limit(10);

    if (actions?.length) {
      priorityActions = actions.map((r) => ({
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

export async function rescanAll(projectId: string): Promise<void> {
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('project_id', projectId);

  if (!businesses?.length) return;

  await supabaseAdmin
    .from('businesses')
    .update({ crawl_status: 'pending' })
    .eq('project_id', projectId);

  await inngest.send(
    businesses.map((b) => ({
      name: 'crawl/business.scan' as const,
      data: { businessId: b.id as string, mode: 'incremental' as const },
    }))
  );
}

export async function listProjects(userId: string): Promise<Project[]> {
  const { data: projects, error } = await supabaseAdmin
    .from('projects')
    .select('*, businesses(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (projects ?? []).map((p) => rowsToProject(p, p.businesses ?? []));
}

function rowsToProject(p: Record<string, unknown>, businesses: Record<string, unknown>[]): Project {
  const mapBusiness = (b: Record<string, unknown>): Business => ({
    id: b.id as string,
    name: b.name as string,
    url: b.url as string,
    domain: b.domain as string,
    lastCrawledAt: b.last_crawled_at ? new Date(b.last_crawled_at as string).getTime() : null,
    crawlJobId: (b.crawl_job_id as string) ?? null,
    crawlStatus: (b.crawl_status as Business['crawlStatus']) ?? 'idle',
    signals: null,
    googleData: null,
    serpData: null,
    trustpilotData: null,
    aiScore: null,
    previousSignals: null,
    changeEvents: [],
  });

  const own = businesses.find((b) => b.is_own_business);
  const competitors = businesses.filter((b) => !b.is_own_business);

  return {
    id: p.id as string,
    name: p.name as string,
    createdAt: new Date(p.created_at as string).getTime(),
    ownBusiness: mapBusiness(own!),
    competitors: competitors.map(mapBusiness),
  };
}
