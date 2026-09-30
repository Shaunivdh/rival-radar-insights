/**
 * getOrComputeShared: one computation per (project, kind, key), shared by the
 * project's concurrent business crawls, with a stale entry recomputed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', async () => ({
  supabaseAdmin: (await import('@/test/supabase-fake')).fakeDb,
}));

import { fakeDb } from '@/test/supabase-fake';
import { getOrComputeShared } from '@/lib/projectCache';

const OPTS = { ttlMs: 60_000, leaseMs: 60_000, waitMs: 50, pollMs: 5 };

beforeEach(() => fakeDb.reset());

describe('getOrComputeShared', () => {
  it('computes once, then serves the cached payload', async () => {
    const compute = vi.fn(async () => 'answer');
    const a = await getOrComputeShared('p1', 'ai_visibility', 'q', OPTS, compute);
    const b = await getOrComputeShared('p1', 'ai_visibility', 'q', OPTS, compute);
    expect(a).toEqual({ value: 'answer', cacheHit: false });
    expect(b).toEqual({ value: 'answer', cacheHit: true });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('keeps projects and keys apart', async () => {
    await getOrComputeShared('p1', 'ai_visibility', 'q', OPTS, async () => 'p1');
    const other = await getOrComputeShared('p2', 'ai_visibility', 'q', OPTS, async () => 'p2');
    expect(other.value).toBe('p2');
  });

  it('recomputes a stale entry', async () => {
    fakeDb.seed('project_cache', [
      {
        project_id: 'p1',
        kind: 'serp',
        key: 'u',
        payload: 'old',
        fetched_at: new Date(Date.now() - 120_000).toISOString(),
      },
    ]);
    const r = await getOrComputeShared('p1', 'serp', 'u', OPTS, async () => 'new');
    expect(r).toEqual({ value: 'new', cacheHit: false });
  });

  it('waits for the claim holder instead of computing', async () => {
    const compute = vi.fn(async () => 'mine');
    const holder = getOrComputeShared('p1', 'ai_visibility', 'q', OPTS, async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 'holder';
    });
    const waiter = getOrComputeShared('p1', 'ai_visibility', 'q', OPTS, compute);
    expect((await holder).value).toBe('holder');
    expect(await waiter).toEqual({ value: 'holder', cacheHit: true });
    expect(compute).not.toHaveBeenCalled();
  });

  it('computes itself when the holder never delivers', async () => {
    void getOrComputeShared('p1', 'ai_visibility', 'q', OPTS, () => new Promise(() => {}));
    const r = await getOrComputeShared('p1', 'ai_visibility', 'q', OPTS, async () => 'fallback');
    expect(r).toEqual({ value: 'fallback', cacheHit: false });
  });

  it('does not cache a failed computation', async () => {
    await expect(
      getOrComputeShared('p1', 'serp', 'u', { ...OPTS, leaseMs: 0 }, async () => {
        throw new Error('down');
      }),
    ).rejects.toThrow('down');
    const r = await getOrComputeShared('p1', 'serp', 'u', OPTS, async () => 'ok');
    expect(r.cacheHit).toBe(false);
  });
});
