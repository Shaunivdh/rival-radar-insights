/**
 * Orchestrator decision logic against msw, with every Cloudflare request
 * captured so the CLAUDE.md §6 rendering invariants can be asserted as
 * properties of the whole run rather than of one call site.
 *
 * Covers: retry on empty HTML, retry on a challenge page, direct-fetch
 * fallback ordering, and cache-after-enrichment ordering.
 *
 * Timers are faked: the retry path sleeps 5s and every crawlSinglePage sleeps
 * 3s before its first poll, so a real-clock run would take ~30s.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { CF_BASE } from '@/test/msw/handlers';
import * as C from '@/test/contracts';
import { check } from '@/test/msw/violations';
import {
  CF_JOB_ID,
  cfStartResponse,
  cfSampleHtml,
  cfCompletedResponse,
} from '@/test/fixtures/providers/cloudflare';
import { cloudflareChallengeHtml, nearEmptyHtml } from '@/test/fixtures/html';
import type { RawCrawlResult } from '@/types';

const { saveToCacheMock, loadFromCacheMock, extractPageSignalsMock, priorPages, priorMax } =
  vi.hoisted(() => {
    // Read at orchestrator import time — keep priority-page enrichment to one crawl.
    const priorPages = process.env.CRAWL_PRIORITY_PAGES;
    const priorMax = process.env.CRAWL_MAX_PAGES;
    process.env.CRAWL_PRIORITY_PAGES = '1';
    process.env.CRAWL_MAX_PAGES = '15';
    return {
      priorPages,
      priorMax,
      saveToCacheMock: vi.fn(),
      loadFromCacheMock: vi.fn(() => null),
      extractPageSignalsMock: vi.fn(async () => ({})),
    };
  });

// The env vars above are process-wide; restore them so other test files sharing
// this worker are not silently reconfigured.
afterAll(() => {
  if (priorPages === undefined) delete process.env.CRAWL_PRIORITY_PAGES;
  else process.env.CRAWL_PRIORITY_PAGES = priorPages;
  if (priorMax === undefined) delete process.env.CRAWL_MAX_PAGES;
  else process.env.CRAWL_MAX_PAGES = priorMax;
});

vi.mock('@/lib/supabase/server', async () => ({
  supabaseAdmin: (await import('@/test/supabase-fake')).fakeDb,
}));
vi.mock('@/services/crawl.cache', () => ({
  saveToCache: saveToCacheMock,
  loadFromCache: loadFromCacheMock,
}));
vi.mock('@/services/ai', () => ({ extractPageSignals: extractPageSignalsMock }));

import { startBusinessCrawl, extractAndPersistSignals } from '@/lib/crawl/orchestrator';
import { fakeDb as db } from '@/test/supabase-fake';

const BUSINESS_ID = 'biz_own';
const SITE = 'https://northwind-dental.test';

/** Ordered log of everything the run did that we assert ordering on. */
let timeline: string[] = [];
/** Every body POSTed to the Cloudflare crawl endpoint during a test. */
let crawlStarts: Array<Record<string, unknown>> = [];

function cfHandlers(opts: { results?: unknown } = {}) {
  const results = opts.results ?? cfCompletedResponse;
  return [
    http.post(`${CF_BASE}/crawl`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      crawlStarts.push(body);
      timeline.push(`crawl-start:${String(body.url)}`);
      // Same contract the shared handlers enforce — a bad body fails in afterEach.
      check('cf.start.request', C.CfCrawlStartRequest, body);
      return HttpResponse.json(cfStartResponse);
    }),
    // Status poll (limit=1) and results share a path; both complete immediately.
    http.get(`${CF_BASE}/crawl/:jobId`, ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get('limit') === '1') {
        return HttpResponse.json({ success: true, result: { status: 'completed' } });
      }
      timeline.push('crawl-results');
      return HttpResponse.json(results);
    }),
  ];
}

/** Drive a promise to settlement while advancing faked timers. */
async function runWithTimers<T>(p: Promise<T>): Promise<T> {
  let settled = false;
  const tracked = p.then(
    (v) => ((settled = true), v),
    (e) => {
      settled = true;
      throw e;
    },
  );
  for (let i = 0; i < 200 && !settled; i++) await vi.advanceTimersByTimeAsync(1000);
  return tracked;
}

const rootResult = (html: string): RawCrawlResult => ({
  status: 'completed',
  pages: [{ url: `${SITE}/`, html }],
});

function seedBusiness(overrides: Record<string, unknown> = {}) {
  db.seed('businesses', [
    {
      id: BUSINESS_ID,
      name: 'Northwind Dental',
      url: SITE,
      domain: 'northwind-dental.test',
      last_crawled_at: null,
      ...overrides,
    },
  ]);
}

beforeEach(() => {
  db.reset();
  timeline = [];
  crawlStarts = [];
  saveToCacheMock.mockReset();
  saveToCacheMock.mockImplementation(() => {
    timeline.push('cache-write');
  });
  loadFromCacheMock.mockReset();
  loadFromCacheMock.mockReturnValue(null);
  extractPageSignalsMock.mockClear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  server.use(...cfHandlers());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('§6 rendering invariants', () => {
  it('sends render:true and networkidle0 on every crawl, and never modifiedSince', async () => {
    seedBusiness();
    await runWithTimers(
      extractAndPersistSignals(BUSINESS_ID, CF_JOB_ID, rootResult(nearEmptyHtml)),
    );

    // The run must have issued several crawls (retry + priority enrichment).
    expect(crawlStarts.length).toBeGreaterThan(1);
    for (const body of crawlStarts) {
      expect(body.render).toBe(true);
      expect((body.gotoOptions as Record<string, unknown>).waitUntil).toBe('networkidle0');
      expect(body).not.toHaveProperty('modifiedSince');
    }
  });

  it('uses a 30000ms timeout on the retry and enrichment crawls', async () => {
    seedBusiness();
    await runWithTimers(
      extractAndPersistSignals(BUSINESS_ID, CF_JOB_ID, rootResult(nearEmptyHtml)),
    );

    // Both the retry and the priority-page crawls go through crawlSinglePage,
    // which pins networkidle0 + 30s per §6.
    expect(crawlStarts.length).toBeGreaterThan(1);
    for (const body of crawlStarts) {
      expect((body.gotoOptions as Record<string, unknown>).timeout).toBe(30000);
    }
  });

  it('startBusinessCrawl renders with networkidle0 on the initial crawl', async () => {
    seedBusiness();
    await runWithTimers(startBusinessCrawl(BUSINESS_ID, 'initial'));

    expect(crawlStarts).toHaveLength(1);
    const body = crawlStarts[0];
    expect(body.render).toBe(true);
    expect((body.gotoOptions as Record<string, unknown>).waitUntil).toBe('networkidle0');
    expect(body).not.toHaveProperty('modifiedSince');
  });

  it('DEVIATION: the initial crawl omits the 30s timeout §6 requires', async () => {
    // §6 says every crawl must send gotoOptions { waitUntil: 'networkidle0',
    // timeout: 30000 }. startBusinessCrawl's initial branch passes waitUntil
    // only, so the request falls back to Cloudflare's default timeout. Pinned
    // here as current behaviour, not endorsed — fixing it means touching crawl
    // code, which is out of scope for this test work.
    seedBusiness();
    await runWithTimers(startBusinessCrawl(BUSINESS_ID, 'initial'));

    expect(crawlStarts).toHaveLength(1);
    expect(crawlStarts[0].gotoOptions).toEqual({ waitUntil: 'networkidle0' });
    expect((crawlStarts[0].gotoOptions as Record<string, unknown>).timeout).toBeUndefined();
  });

  it('incremental crawls render too, and drop modifiedSince', async () => {
    seedBusiness({ last_crawled_at: new Date(Date.now() - 86400_000).toISOString() });
    await runWithTimers(startBusinessCrawl(BUSINESS_ID, 'incremental'));

    expect(crawlStarts).toHaveLength(1);
    expect(crawlStarts[0].render).toBe(true);
    expect((crawlStarts[0].gotoOptions as Record<string, unknown>).waitUntil).toBe('networkidle0');
    expect((crawlStarts[0].gotoOptions as Record<string, unknown>).timeout).toBe(30000);
    expect(crawlStarts[0]).not.toHaveProperty('modifiedSince');
  });
});

describe('retry on unusable root HTML', () => {
  it('retries with networkidle0 + 30s when the root render came back near-empty', async () => {
    seedBusiness();
    await runWithTimers(
      extractAndPersistSignals(BUSINESS_ID, CF_JOB_ID, rootResult(nearEmptyHtml)),
    );

    // First crawl issued is the retry of the root URL itself. The orchestrator
    // retries the normalized business URL, not the page URL from the result.
    const retry = crawlStarts[0];
    expect(retry.url).toBe(SITE);
    expect(retry.gotoOptions).toEqual({ waitUntil: 'networkidle0', timeout: 30000 });
  });

  it('retries when the root render is a Cloudflare challenge page', async () => {
    seedBusiness();
    await runWithTimers(
      extractAndPersistSignals(BUSINESS_ID, CF_JOB_ID, rootResult(cloudflareChallengeHtml)),
    );

    const retry = crawlStarts[0];
    expect(retry.url).toBe(SITE);
    expect(retry.gotoOptions).toEqual({ waitUntil: 'networkidle0', timeout: 30000 });
  });

  it('does not retry the root when the first render is already usable', async () => {
    seedBusiness();
    await runWithTimers(extractAndPersistSignals(BUSINESS_ID, CF_JOB_ID, rootResult(cfSampleHtml)));

    // Only priority-page enrichment should crawl; the root is never re-fetched.
    expect(crawlStarts.length).toBeGreaterThan(0);
    expect(crawlStarts.map((b) => b.url)).not.toContain(SITE);
  });
});

describe('cache is written after enrichment', () => {
  it('saves to cache only after the priority pages have been crawled', async () => {
    seedBusiness();
    await runWithTimers(extractAndPersistSignals(BUSINESS_ID, CF_JOB_ID, rootResult(cfSampleHtml)));

    expect(saveToCacheMock).toHaveBeenCalledTimes(1);
    const cacheIdx = timeline.indexOf('cache-write');
    const lastCrawlIdx = timeline.map((t) => t.startsWith('crawl-start:')).lastIndexOf(true);
    // Both must be present: a missing crawl would leave lastCrawlIdx at -1 and
    // let the ordering assertion below pass with no enrichment at all.
    expect(cacheIdx).toBeGreaterThan(-1);
    expect(lastCrawlIdx).toBeGreaterThan(-1);
    expect(cacheIdx).toBeGreaterThan(lastCrawlIdx);
  });

  it('caches the enriched multi-page result, not the bare root page', async () => {
    seedBusiness();
    await runWithTimers(extractAndPersistSignals(BUSINESS_ID, CF_JOB_ID, rootResult(cfSampleHtml)));

    const [, cached] = saveToCacheMock.mock.calls[0] as [string, RawCrawlResult];
    expect(cached.pages.length).toBeGreaterThan(1);
  });

  it('does not re-crawl or re-cache when the result came from cache', async () => {
    seedBusiness();
    loadFromCacheMock.mockReturnValueOnce(rootResult(cfSampleHtml) as never);
    await runWithTimers(extractAndPersistSignals(BUSINESS_ID, CF_JOB_ID));

    expect(crawlStarts).toHaveLength(0);
    expect(saveToCacheMock).not.toHaveBeenCalled();
  });
});

describe('direct fetch fallback', () => {
  it('is not used while the render path is working', async () => {
    seedBusiness();
    await runWithTimers(startBusinessCrawl(BUSINESS_ID, 'initial'));

    expect(timeline).not.toContain('direct-fetch');
    expect(timeline.filter((t) => t.startsWith('crawl-start:'))).toHaveLength(1);
  });

  it('is used only after the render crawl is refused, never before', async () => {
    seedBusiness();
    server.use(
      http.post(`${CF_BASE}/crawl`, () => {
        timeline.push('crawl-start:refused');
        return HttpResponse.text('Crawl disallowed by Content-Signal directive', { status: 400 });
      }),
      http.get(`${SITE}/`, () => {
        timeline.push('direct-fetch');
        return HttpResponse.text(cfSampleHtml, { headers: { 'content-type': 'text/html' } });
      }),
    );

    const jobId = await runWithTimers(startBusinessCrawl(BUSINESS_ID, 'initial'));

    expect(jobId).toBe('direct-fetch-done');
    const refusedIdx = timeline.indexOf('crawl-start:refused');
    const directIdx = timeline.indexOf('direct-fetch');
    expect(refusedIdx).toBeGreaterThan(-1);
    expect(directIdx).toBeGreaterThan(-1);
    expect(directIdx).toBeGreaterThan(refusedIdx);
  });

  it('reports the blocked state when the render crawl and direct fetch both fail', async () => {
    seedBusiness();
    server.use(
      http.post(`${CF_BASE}/crawl`, () =>
        HttpResponse.text('Crawl disallowed by Content-Signal directive', { status: 400 }),
      ),
      http.get(`${SITE}/`, () => HttpResponse.text('nope', { status: 403 })),
    );

    const jobId = await runWithTimers(startBusinessCrawl(BUSINESS_ID, 'initial'));

    expect(jobId).toBe('crawl-disallowed');
    const biz = db.rows('businesses').find((r) => r.id === BUSINESS_ID)!;
    expect((biz.enrichment_errors as Record<string, string>).crawl).toMatch(
      /blocked all automated/i,
    );
  });
});

describe('recovered retry HTML surviving enrichment', () => {
  it('BUG: the priority-page merge discards the retried root HTML', async () => {
    seedBusiness();
    await runWithTimers(
      extractAndPersistSignals(BUSINESS_ID, CF_JOB_ID, rootResult(nearEmptyHtml)),
    );

    // The retry recovered a usable root page, but the merge that appends
    // priority pages rebuilds the list from `rootResult.pages` — the original,
    // pre-retry pages — so the recovered HTML is dropped and the near-empty
    // root is what gets cached and parsed. Pinned as current behaviour; the fix
    // is in crawl code and therefore out of scope here.
    const [, cached] = saveToCacheMock.mock.calls[0] as [string, RawCrawlResult];
    const root = cached.pages.find((p) => p.url === `${SITE}/`);
    expect(root?.html).toBe(nearEmptyHtml);
    expect(root?.html?.length).toBeLessThan(500);

    // The enrichment page did survive, so the run still persists mixed signals.
    expect(cached.pages.length).toBeGreaterThan(1);
  });

  it('keeps the retried HTML when no priority page is merged', async () => {
    seedBusiness();
    // Bound the bug above: the retried root only survives when `validPages` is
    // empty, so the merge branch is skipped entirely. Route by job id — the
    // root retry returns usable HTML, every enrichment crawl returns no
    // records, which makes crawlSinglePage return null.
    server.use(
      http.post(`${CF_BASE}/crawl`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        crawlStarts.push(body);
        timeline.push(`crawl-start:${String(body.url)}`);
        check('cf.start.request', C.CfCrawlStartRequest, body);
        return HttpResponse.json({
          ...cfStartResponse,
          result: body.url === SITE ? 'job-root-retry' : 'job-enrichment',
        });
      }),
      http.get(`${CF_BASE}/crawl/:jobId`, ({ request, params }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('limit') === '1') {
          return HttpResponse.json({ success: true, result: { status: 'completed' } });
        }
        if (params.jobId !== 'job-root-retry') {
          return HttpResponse.json({ success: true, result: { status: 'completed', records: [] } });
        }
        return HttpResponse.json({
          success: true,
          result: { status: 'completed', records: [{ url: SITE, html: cfSampleHtml }] },
        });
      }),
    );
    await runWithTimers(
      extractAndPersistSignals(BUSINESS_ID, CF_JOB_ID, rootResult(nearEmptyHtml)),
    );

    const [, cached] = saveToCacheMock.mock.calls[0] as [string, RawCrawlResult];
    // Nothing merged, so the recovered HTML is the only root page cached.
    expect(cached.pages).toHaveLength(1);
    expect(cached.pages[0].html).toBe(cfSampleHtml);
    // And an enrichment crawl really was attempted — otherwise this proves nothing.
    expect(crawlStarts.filter((b) => b.url !== SITE).length).toBeGreaterThan(0);
  });
});
