import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/server';
import { generateAndPersistProjectActions } from '@/lib/priorityActionsGenerator';

// Simple in-memory rate limiter: max 5 POST requests per IP per minute.
// NOTE: resets per cold start and not shared across instances in serverless deployments.
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
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
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Recovery route with no frontend caller — invoked manually with { projectId }. */
const postBodySchema = z.object({
  projectId: z.string().uuid(),
});

/**
 * POST /api/regenerate-actions  { projectId }
 *
 * Generates the priority-action plan from a project's already-persisted
 * enrichment data, independent of the crawl pipeline. Use this to recover a
 * project whose action plan is empty because its crawl run never reached the
 * final generation step.
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const parsed = postBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { projectId } = parsed.data;

  // Verify the caller owns this project.
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  try {
    const result = await generateAndPersistProjectActions(projectId);
    console.log(
      `[regenerate-actions] userId=${userId} projectId=${projectId} inserted=${result.inserted} reason=${result.reason ?? 'ok'}`,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error(`[regenerate-actions] failed projectId=${projectId}:`, e);
    return NextResponse.json({ error: 'Failed to generate recommendations' }, { status: 500 });
  }
}
