/**
 * Project-scoped cache for external lookups that depend only on the project's
 * service + location (AI visibility web searches, SerpAPI local packs), so a
 * project's 6 business crawls share one result instead of each paying for it.
 *
 * Fails soft everywhere: a read error is a miss and a write error is logged, so
 * if the `project_cache` table is unavailable the caller behaves exactly as it
 * did before the cache existed.
 */
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/server';
import { toJson } from '@/lib/supabase/mappers';
import { isRateLimited } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

export type ProjectCacheKind = 'ai_visibility' | 'serp';

export async function readProjectCache<T>(
  projectId: string,
  kind: ProjectCacheKind,
  key: string,
  maxAgeMs: number,
): Promise<T | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('project_cache')
      .select('payload, fetched_at')
      .eq('project_id', projectId)
      .eq('kind', kind)
      .eq('key', key)
      .maybeSingle();
    if (error || !data) return null;
    if (Date.now() - new Date(data.fetched_at).getTime() > maxAgeMs) return null;
    return data.payload as T;
  } catch (e) {
    logger.warn('project-cache', 'Read failed, treating as miss', { kind, error: e });
    return null;
  }
}

export async function writeProjectCache<T>(
  projectId: string,
  kind: ProjectCacheKind,
  key: string,
  payload: T,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('project_cache').upsert(
      {
        project_id: projectId,
        kind,
        key,
        payload: toJson(payload),
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,kind,key' },
    );
    if (error) logger.warn('project-cache', 'Write failed', { kind, error });
  } catch (e) {
    logger.warn('project-cache', 'Write failed', { kind, error: e });
  }
}

export interface SharedOptions {
  /** A cached payload older than this is recomputed. */
  ttlMs: number;
  /** How long one caller holds the right to compute before another may take over. */
  leaseMs: number;
  /** How long a caller that lost the claim waits for the holder's result. */
  waitMs: number;
  pollMs: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Return the cached payload for (project, kind, key), or compute it once for the
 * whole project. Concurrent callers are coordinated with a check_rate_limit
 * claim: the winner computes and writes, the others poll for its result and
 * compute themselves only if it never arrives. `compute` throwing is not cached.
 */
export async function getOrComputeShared<T>(
  projectId: string,
  kind: ProjectCacheKind,
  key: string,
  opts: SharedOptions,
  compute: () => Promise<T>,
): Promise<{ value: T; cacheHit: boolean }> {
  const cached = await readProjectCache<T>(projectId, kind, key, opts.ttlMs);
  if (cached !== null) return { value: cached, cacheHit: true };

  let acquired = true;
  try {
    const claimKey = `project-cache:${kind}:${projectId}:${createHash('sha1').update(key).digest('hex')}`;
    acquired = !(await isRateLimited(claimKey, { limit: 1, windowMs: opts.leaseMs }));
  } catch (e) {
    logger.warn('project-cache', 'Claim unavailable, computing', { kind, error: e });
  }

  if (!acquired) {
    for (let waited = 0; waited < opts.waitMs; waited += opts.pollMs) {
      await sleep(opts.pollMs);
      const ready = await readProjectCache<T>(projectId, kind, key, opts.ttlMs);
      if (ready !== null) return { value: ready, cacheHit: true };
    }
    logger.warn('project-cache', 'Claim holder produced nothing in time, computing', { kind });
  }

  const value = await compute();
  await writeProjectCache(projectId, kind, key, value);
  return { value, cacheHit: false };
}
