import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';
import { supabaseAdmin } from '@/lib/supabase/server';

// Simple in-memory rate limiter: max 10 POST requests per IP per minute
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

const VALID_MODES = new Set(['initial', 'incremental']);

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id, name, crawl_status')
    .eq('project_id', projectId);

  return NextResponse.json({ businesses: businesses ?? [] });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { businessId, mode } = (await req.json()) as {
    businessId: string;
    mode: string;
  };

  if (!businessId || !mode) {
    return NextResponse.json({ error: 'Missing businessId or mode' }, { status: 400 });
  }

  if (!VALID_MODES.has(mode)) {
    return NextResponse.json({ error: 'Invalid mode, must be "initial" or "incremental"' }, { status: 400 });
  }

  await inngest.send({ name: 'crawl/business.scan', data: { businessId, mode: mode as 'initial' | 'incremental' } });

  return NextResponse.json({ ok: true });
}
