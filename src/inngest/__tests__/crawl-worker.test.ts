/**
 * crawl-worker pipeline against an in-memory Supabase, msw for every external
 * HTTP provider (contract-validated), and a schema-driven Anthropic mock.
 *
 * Three paths (see testing plan): happy path, crawl failure + onFailure,
 * change detection → confirmation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InngestTestEngine } from '@inngest/test';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { CF_BASE, cloudflareHandlers, siteProbeHandlers } from '@/test/msw/handlers';
import { cfSampleHtml } from '@/test/fixtures/providers/cloudflare';
import { anthropicResponder } from '@/test/anthropic-mock';
import { fakeDb as db } from '@/test/supabase-fake';

const { mockCreate } = vi.hoisted(() => {
  // Keep priority-page crawls to one so the multi-page path runs without 5 parallel jobs.
  process.env.CRAWL_PRIORITY_PAGES = '1';
  return { mockCreate: vi.fn() };
});

vi.mock('@/lib/supabase/server', async () => ({
  supabaseAdmin: (await import('@/test/supabase-fake')).fakeDb,
}));
vi.mock('@/services/crawl.cache', () => ({ saveToCache: vi.fn(), loadFromCache: () => null }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: mockCreate };
    constructor() {}
  },
}));

import { crawlBusinessFunction, confirmChangeFunction } from '@/inngest/crawl-worker';

const BUSINESS_ID = 'biz_own';
const PROJECT_ID = 'proj_1';

function seedProject(overrides: Record<string, unknown> = {}) {
  db.seed('projects', [
    {
      id: PROJECT_ID,
      name: 'Acme vs Competitors',
      primary_service: 'trades',
      location: 'Bristol',
      postcode: 'BS1 1AA',
    },
  ]);
  db.seed('businesses', [
    {
      id: BUSINESS_ID,
      project_id: PROJECT_ID,
      name: 'Acme Plumbing',
      url: 'https://acme-plumbing.test',
      domain: 'acme-plumbing.test',
      is_own_business: true,
      google_place_id: null,
      last_crawled_at: null,
      ...overrides,
    },
  ]);
}

const row = (table: string, id: string) => db.rows(table).find((r) => r.id === id)!;

const runCrawl = (mode: 'initial' | 'incremental') =>
  new InngestTestEngine({
    function: crawlBusinessFunction,
    steps: stepMocks(),
    events: [{ name: 'crawl/business.scan', data: { businessId: BUSINESS_ID, mode } }],
  }).execute();

const runConfirm = (data: Record<string, unknown>) =>
  new InngestTestEngine({
    function: confirmChangeFunction,
    steps: stepMocks(),
    events: [{ name: 'crawl/change.confirm', data }],
  }).execute();

/**
 * @inngest/test cannot complete `step.sleep` (it re-executes forever) and
 * `step.sendEvent` would call the Inngest API, so both are mocked as
 * already-ran steps. The sendEvent spy on `ctx.step` still records the call.
 *
 * The engine appends memoised step results to the array it is given, so every
 * execution must get a fresh engine and a fresh list — never reuse either.
 */
const stepMocks = () => [
  ...Array.from({ length: 8 }, (_, i) => i + 1).flatMap((n) => [
    { id: `poll-wait-${n}`, handler: () => null },
    { id: `confirm-poll-wait-${n}`, handler: () => null },
  ]),
  { id: 'schedule-change-confirmation', handler: () => ({ ids: ['evt_test'] }) },
  { id: 'schedule-retry-crawl', handler: () => ({ ids: ['evt_test'] }) },
];

beforeEach(() => {
  db.reset();
  mockCreate.mockReset();
  mockCreate.mockImplementation(anthropicResponder());
  server.use(...cloudflareHandlers({ pollsBeforeDone: 1 }));
  if (!process.env.WORKER_TEST_LOGS) vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('crawlBusinessFunction — happy path', () => {
  it('crawls, extracts, enriches, scores and generates priority actions', async () => {
    seedProject();
    const t = new InngestTestEngine({
      function: crawlBusinessFunction,
      steps: stepMocks(),
      events: [{ name: 'crawl/business.scan', data: { businessId: BUSINESS_ID, mode: 'initial' } }],
    });

    const { result, error, ctx } = await t.execute();
    expect(error).toBeUndefined();
    expect(result).toEqual({ businessId: BUSINESS_ID, jobId: 'job_test_0001', status: 'complete' });

    // Crawl lifecycle
    const biz = row('businesses', BUSINESS_ID);
    expect(biz.crawl_status).toBe('complete');
    expect(biz.crawl_job_id).toBe('job_test_0001');
    expect(biz.last_crawled_at).toBeTruthy();
    expect(db.rows('crawl_jobs').map((j) => j.status)).toEqual(['completed']);

    // Signals persisted: AI extraction merged with deterministic parser, robots/sitemap from direct checks
    const sig = db.rows('extracted_signals');
    expect(sig).toHaveLength(1);
    const seo = sig[0].seo as Record<string, unknown>;
    expect(seo.title).toBe('Acme Plumbing | Emergency Plumbers in Bristol');
    expect(seo.schemaMarkupTypes).toContain('LocalBusiness');
    expect(seo.hasRobotsTxt).toBe(true);
    expect(seo.hasSitemap).toBe(true);
    expect(sig[0].status).toBe('confirmed');

    // Enrichment
    expect((biz.google_data as { placeId: string }).placeId).toBe('ChIJtest_acme_plumbing');
    expect(biz.google_place_id).toBe('ChIJtest_acme_plumbing');
    expect((biz.serp_data as { localVisibilityPosition: number }).localVisibilityPosition).toBe(2);
    expect(
      (biz.serp_data as { previousLocalVisibilityPosition?: unknown })
        .previousLocalVisibilityPosition,
    ).toBeUndefined();
    expect(
      (biz.pagespeed_data as { mobile: { performanceScore: number } }).mobile.performanceScore,
    ).toBe(62);
    expect(
      (biz.ai_visibility as { mentionCount: number; totalPrompts: number }).mentionCount,
    ).toBeGreaterThan(0);
    expect(biz.review_sentiment).toMatchObject({ summary: expect.any(String) });
    expect(biz.enrichment_errors).toBeNull();

    // Scores + snapshot
    const score = biz.ai_score as Record<string, unknown>;
    expect(score.overallScore).toEqual(expect.any(Number));
    expect(score.weeklyDelta).toBeNull();
    expect(db.rows('score_snapshots')).toHaveLength(1);
    expect(db.rows('ai_health_scores')).toHaveLength(1);

    // Priority actions from templates (LLM mock returns none)
    const actions = db.rows('priority_actions');
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.project_id === PROJECT_ID && a.status === 'active')).toBe(true);

    // No change confirmation on a first scan
    expect(ctx.step.sendEvent).not.toHaveBeenCalled();
    expect(db.rows('change_events')).toHaveLength(0);
  }, 30_000);
});

describe('crawlBusinessFunction — crawl failure', () => {
  it('fails the run when Cloudflare and the direct fetch both fail, and onFailure marks the business', async () => {
    seedProject();
    server.use(
      http.post(`${CF_BASE}/crawl`, () => HttpResponse.text('upstream down', { status: 502 })),
      http.get('https://acme-plumbing.test/', () => HttpResponse.text('', { status: 503 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const t = new InngestTestEngine({
      function: crawlBusinessFunction,
      steps: stepMocks(),
      events: [{ name: 'crawl/business.scan', data: { businessId: BUSINESS_ID, mode: 'initial' } }],
    });
    const { error } = await t.execute();
    expect(error).toBeTruthy();
    expect(String((error as { message?: string })?.message ?? error)).toMatch(
      /CF crawl start failed: 502/,
    );
    expect(row('businesses', BUSINESS_ID).crawl_status).toBe('idle');

    // @inngest/test does not run onFailure; invoke the real handler with a pass-through step.
    const sendEvent = vi.fn(async () => ({ ids: ['evt_1'] }));
    const step = { run: (_id: string, fn: () => unknown) => fn(), sendEvent };
    const onFailure = (
      crawlBusinessFunction as unknown as { onFailureFn: (args: unknown) => Promise<void> }
    ).onFailureFn;
    await onFailure({
      error: new Error('CF crawl start failed: 502 upstream down'),
      event: { data: { event: { data: { businessId: BUSINESS_ID, mode: 'initial' } } } },
      step,
    });

    const biz = row('businesses', BUSINESS_ID);
    expect(biz.crawl_status).toBe('failed');
    expect(biz.last_crawled_at).toBeTruthy();
    expect((biz.enrichment_errors as { crawl: string }).crawl).toMatch(
      /^Crawl failed: CF crawl start failed: 502/,
    );
    expect(sendEvent).toHaveBeenCalledWith(
      'schedule-retry-crawl',
      expect.objectContaining({
        name: 'crawl/business.scan',
        data: { businessId: BUSINESS_ID, mode: 'incremental' },
      }),
    );
    // Single failed business → project is "all done" → actions generated from whatever data exists
    expect(db.rows('priority_actions').length).toBeGreaterThan(0);
  }, 30_000);
});

describe('change detection → confirmation', () => {
  it('schedules a confirmation crawl, then confirms and records a change event', async () => {
    seedProject({ last_crawled_at: '2026-08-20T00:00:00.000Z' });
    // Baseline: what the previous (confirmed) scan saw — identical except the contact form existed.
    const first = await runCrawl('initial');
    expect(first.error).toBeUndefined();
    const baseline = db.rows('extracted_signals')[0];
    (baseline.engagement as Record<string, unknown>).hasContactForm = true;
    baseline.scanned_at = '2026-08-20T00:00:00.000Z';
    db.rows('priority_actions').length = 0;

    // Second scan (incremental): detection differs from baseline → pending + confirmation event
    server.use(...cloudflareHandlers({ pollsBeforeDone: 1 }));
    const second = await runCrawl('incremental');
    expect(second.error).toBeUndefined();
    const detection = db.rows('extracted_signals').find((r) => r.id !== baseline.id)!;
    expect(detection.status).toBe('pending');
    expect(second.ctx.step.sendEvent).toHaveBeenCalledWith(
      'schedule-change-confirmation',
      expect.objectContaining({
        name: 'crawl/change.confirm',
        data: expect.objectContaining({
          businessId: BUSINESS_ID,
          baselineId: baseline.id,
          detectionId: detection.id,
          changedPaths: expect.arrayContaining(['engagement.hasContactForm']),
        }),
      }),
    );
    expect(db.rows('change_events')).toHaveLength(0);
    // previousLocalVisibilityPosition now carried across scans
    expect(
      (row('businesses', BUSINESS_ID).serp_data as Record<string, unknown>)
        .previousLocalVisibilityPosition,
    ).toBe(2);

    // Confirmation crawl reproduces the change → detection confirmed, change event saved
    const sent = (second.ctx.step.sendEvent as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][1] as {
      data: Record<string, unknown>;
    };
    server.use(...cloudflareHandlers({ pollsBeforeDone: 0 }));
    const third = await runConfirm(sent.data);
    expect(third.error).toBeUndefined();
    expect(third.result).toEqual({
      businessId: BUSINESS_ID,
      jobId: 'job_test_0001',
      status: 'confirmed',
    });
    expect(row('extracted_signals', detection.id as string).status).toBe('confirmed');
    expect(db.rows('extracted_signals')).toHaveLength(3);
    const events = db.rows('change_events');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      business_id: BUSINESS_ID,
      severity: 'medium',
      summary: 'Contact form removed from the website',
    });
    expect(row('businesses', BUSINESS_ID).crawl_status).toBe('complete');
  }, 60_000);

  // Regression guard: 'confirm-persist-signals' must apply the same direct
  // robots/sitemap override as 'persist-signals'. Without it the confirmation
  // snapshot flips both fields to false, the diff reports a phantom
  // "seo.hasSitemap, seo.hasRobotsTxt" change, the quarantine branch never runs
  // and a spurious change event is saved for a change that did not reproduce.
  it('quarantines the detection when the confirmation crawl does not reproduce the change', async () => {
    seedProject({ last_crawled_at: '2026-08-20T00:00:00.000Z' });
    await runCrawl('initial');
    const baseline = db.rows('extracted_signals')[0];
    baseline.scanned_at = '2026-08-20T00:00:00.000Z';
    // Detection row: a phantom change the confirmation crawl will not see again
    const detection = db.withDefaults('extracted_signals', {
      ...structuredClone(baseline),
      id: undefined,
      status: 'pending',
      engagement: { ...(baseline.engagement as Record<string, unknown>), hasContactForm: true },
    });
    db.rows('extracted_signals').push(detection);

    server.use(...cloudflareHandlers({ pollsBeforeDone: 0 }));
    const { error } = await runConfirm({
      businessId: BUSINESS_ID,
      baselineId: baseline.id,
      detectionId: detection.id,
      changedPaths: ['engagement.hasContactForm'],
    });
    expect(error).toBeUndefined();
    expect(row('extracted_signals', detection.id as string).status).toBe('unconfirmed');
    expect(db.rows('change_events')).toHaveLength(0);
    expect(
      mockCreate.mock.calls.some(
        ([p]) =>
          (p as { output_config?: { format?: { schema?: unknown } } }).output_config?.format
            ?.schema && String(JSON.stringify(p)).includes('hasSignificantChanges'),
      ),
    ).toBe(false);
  }, 60_000);
});

describe('crawlBusinessFunction — disallowed site', () => {
  it('falls back to direct fetch when Cloudflare refuses the crawl and flags reduced data quality', async () => {
    seedProject();
    server.use(
      http.post(`${CF_BASE}/crawl`, () =>
        HttpResponse.text('Crawl disallowed by Content-Signal directive', { status: 400 }),
      ),
      http.get('https://acme-plumbing.test/', () => HttpResponse.text(cfSampleHtml)),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = new InngestTestEngine({
      function: crawlBusinessFunction,
      steps: stepMocks(),
      events: [{ name: 'crawl/business.scan', data: { businessId: BUSINESS_ID, mode: 'initial' } }],
    });
    const { result, error } = await t.execute();
    expect(error).toBeUndefined();
    expect(result).toMatchObject({ status: 'complete', jobId: 'direct-fetch-done' });
    const biz = row('businesses', BUSINESS_ID);
    expect(biz.crawl_status).toBe('complete');
    expect(db.rows('extracted_signals')).toHaveLength(1);
    expect((biz.enrichment_errors as { crawl?: string })?.crawl).toMatch(
      /blocks automated crawling/,
    );
  }, 30_000);

  // Regression guard: the direct-fetch fallback returns DIRECT_FETCH_DONE, which
  // sets skipCrawlSteps and bypasses the whole 'persist-signals' step. While the
  // robots/sitemap override lived in that step, these snapshots were the only
  // ones written without it, so they disagreed with every normally-crawled
  // snapshot by construction. The override belongs to extractAndPersistSignals
  // precisely so a path that skips the step still gets it.
  it('applies the robots/sitemap override on the direct-fetch path too', async () => {
    seedProject();
    server.use(
      http.post(`${CF_BASE}/crawl`, () =>
        HttpResponse.text('Crawl disallowed by Content-Signal directive', { status: 400 }),
      ),
      http.get('https://acme-plumbing.test/', () => HttpResponse.text(cfSampleHtml)),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { error } = await runCrawl('initial');
    expect(error).toBeUndefined();

    // cfSampleHtml carries neither file, so `true` here can only have come from
    // the direct probe — the same values a normally-crawled snapshot records.
    const seo = db.rows('extracted_signals')[0].seo as Record<string, unknown>;
    expect(seo.hasRobotsTxt).toBe(true);
    expect(seo.hasSitemap).toBe(true);
  }, 30_000);

  it('leaves robots/sitemap false when the probes find nothing', async () => {
    seedProject();
    server.use(
      ...siteProbeHandlers({ robots: false, sitemap: false }),
      http.post(`${CF_BASE}/crawl`, () =>
        HttpResponse.text('Crawl disallowed by Content-Signal directive', { status: 400 }),
      ),
      http.get('https://acme-plumbing.test/', () => HttpResponse.text(cfSampleHtml)),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { error } = await runCrawl('initial');
    expect(error).toBeUndefined();

    // The override only ever flips fields upwards; a negative probe must not
    // invent a positive.
    const seo = db.rows('extracted_signals')[0].seo as Record<string, unknown>;
    expect(seo.hasRobotsTxt).toBe(false);
    expect(seo.hasSitemap).toBe(false);
  }, 30_000);
});
