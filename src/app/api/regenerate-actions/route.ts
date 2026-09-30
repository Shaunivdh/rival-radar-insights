import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/server';
import { generateAndPersistProjectActions } from '@/lib/priorityActionsGenerator';
import { asProjectId } from '@/types';
import { isRateLimited } from '@/lib/rateLimit';
import { handleAIError } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger';

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

  // Keyed on the authenticated user, not on x-forwarded-for. This route spends
  // money on every call (SMART generation plus the fact-checker pass), and a
  // client-supplied header is the wrong thing to meter it by: rotating the header
  // gives each fake value its own bucket, while a shared office IP or NAT would
  // throttle unrelated users against each other.
  // failClosed: this route spends money on every call and nothing in the UI
  // waits on it, so when the limiter cannot reach a verdict a 429 is the cheap
  // outcome and an unmetered paid call is not.
  if (await isRateLimited(`regenerate-actions:${userId}`, { failClosed: true })) {
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
    const result = await generateAndPersistProjectActions(asProjectId(projectId));
    logger.info('regenerate-actions', 'Regenerated', {
      userId,
      projectId,
      inserted: result.inserted,
      reason: result.reason ?? 'ok',
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error('regenerate-actions', 'Failed', { projectId, error: e });
    return handleAIError(e);
  }
}
