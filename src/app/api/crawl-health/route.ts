import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/server';

async function getAuthUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [{ data: latestReport }, { data: recentFailures }, { data: staleCrawls }] = await Promise.all([
    // Latest health report
    supabaseAdmin
      .from('crawl_health_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Recent failures (last 24h) for this user's businesses
    supabaseAdmin
      .from('crawl_logs')
      .select('business_id, step, message, meta, created_at')
      .eq('status', 'failed')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50),

    // Currently stuck crawls
    supabaseAdmin
      .from('businesses')
      .select('id, name, crawl_status, last_crawled_at')
      .eq('crawl_status', 'running'),
  ]);

  // Filter failures to only this user's businesses
  const { data: userBusinessIds } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .in('project_id',
      (await supabaseAdmin.from('projects').select('id').eq('user_id', userId)).data?.map((p) => p.id) ?? []
    );

  const userBizSet = new Set((userBusinessIds ?? []).map((b) => b.id));

  const filteredFailures = (recentFailures ?? []).filter((f) => userBizSet.has(f.business_id));
  const filteredStale = (staleCrawls ?? []).filter((s) => userBizSet.has(s.id));

  return NextResponse.json({
    latestReport: latestReport ?? null,
    recentFailures: filteredFailures,
    staleCrawls: filteredStale,
  });
}
