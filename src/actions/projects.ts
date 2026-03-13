'use server';

import { supabaseAdmin } from '@/lib/supabase/server';
import type { Project, Business } from '@/types';

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
    crawlStatus: b.crawl_status as Business['crawlStatus'],
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
