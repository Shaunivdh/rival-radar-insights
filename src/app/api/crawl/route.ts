import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { inngest } from '@/inngest/client';
import { supabaseAdmin } from '@/lib/supabase/server';

// Simple in-memory rate limiter: max 10 POST requests per IP per minute
// NOTE: resets per cold start and not shared across instances in serverless deployments
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

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

const VALID_MODES = new Set(['initial', 'incremental']);

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    console.warn('[crawl-api] GET unauthorized - no session');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });

  // Verify user owns this project
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!project) {
    console.warn(`[crawl-api] GET project not found projectId=${projectId} userId=${userId}`);
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id, name, crawl_status')
    .eq('project_id', projectId);

  console.log(`[crawl-api] GET status poll userId=${userId} projectId=${projectId} businesses=${JSON.stringify((businesses ?? []).map(b => ({ id: b.id, name: b.name, status: b.crawl_status })))}`);
  return NextResponse.json({ businesses: businesses ?? [] });
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    console.warn('[crawl-api] POST unauthorized - no session');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    console.warn(`[crawl-api] POST rate-limited ip=${ip} userId=${userId}`);
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { businessId, mode } = (await req.json()) as {
    businessId: string;
    mode: string;
  };

  if (!businessId || !mode) {
    console.warn(`[crawl-api] POST missing params businessId=${businessId} mode=${mode} userId=${userId}`);
    return NextResponse.json({ error: 'Missing businessId or mode' }, { status: 400 });
  }

  if (!VALID_MODES.has(mode)) {
    console.warn(`[crawl-api] POST invalid mode="${mode}" businessId=${businessId} userId=${userId}`);
    return NextResponse.json({ error: 'Invalid mode, must be "initial" or "incremental"' }, { status: 400 });
  }

  // Verify user owns this business via its project
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('project_id')
    .eq('id', businessId)
    .single();
  if (!biz) {
    console.warn(`[crawl-api] POST business not found businessId=${businessId} userId=${userId}`);
    return NextResponse.json({ error: 'Business not found' }, { status: 404 });
  }

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', biz.project_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!project) {
    console.warn(`[crawl-api] POST not authorized businessId=${businessId} userId=${userId} projectId=${biz.project_id}`);
    return NextResponse.json({ error: 'Not authorized for this business' }, { status: 403 });
  }

  console.log(`[crawl-api] POST scan triggered userId=${userId} businessId=${businessId} mode=${mode}`);
  await inngest.send({ name: 'crawl/business.scan', data: { businessId, mode: mode as 'initial' | 'incremental' } });

  return NextResponse.json({ ok: true });
}
