/**
 * crawl-worker step order via @inngest/test's InngestTestEngine (0.1.9 exports
 * InngestTestEngine, so the worker is testable as shipped — no refactor needed).
 *
 * `ctx.step` comes back as a spy, so `ctx.step.run.mock.calls` is the ordered
 * list of step ids the run actually executed. That is what we assert on.
 *
 * Every external boundary is mocked: the orchestrator, the AI service and the
 * enrichment actions. This is a step-ordering test, not an integration test —
 * orchestrator behaviour is covered in src/lib/crawl/__tests__/orchestrator.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InngestTestEngine } from '@inngest/test';

const { orchestrator } = vi.hoisted(() => ({
  orchestrator: {
    startBusinessCrawl: vi.fn(async () => 'job_test_0001'),
    checkCrawlStatus: vi.fn(async () => 'completed'),
    extractAndPersistSignals: vi.fn(async () => undefined),
    markCrawlFailed: vi.fn(async () => undefined),
  },
}));

vi.mock('@/lib/supabase/server', async () => ({
  supabaseAdmin: (await import('@/test/supabase-fake')).fakeDb,
}));
vi.mock('@/services/crawl.cache', () => ({ saveToCache: vi.fn(), loadFromCache: () => null }));
vi.mock('@/lib/crawl/orchestrator', () => ({
  ...orchestrator,
  DIRECT_FETCH_DONE: 'direct-fetch-done',
  CRAWL_DISALLOWED: 'crawl-disallowed',
}));
vi.mock('@/services/ai', () => ({
  generatePriorityActions: vi.fn(async () => []),
  generatePriorityActionsWithHistory: vi.fn(async () => []),
  generateChangeSummary: vi.fn(async () => null),
  generateReviewSentiment: vi.fn(async () => null),
  checkAIVisibility: vi.fn(async () => null),
  extractPageSignals: vi.fn(async () => ({})),
  AIUnavailableError: class AIUnavailableError extends Error {
    retryAt = 'later';
  },
}));
vi.mock('@/actions/enrichment', () => ({
  fetchGoogleData: vi.fn(async () => null),
  fetchSerpData: vi.fn(async () => null),
}));

import { inngest } from '@/inngest/client';
import { crawlBusinessFunction } from '@/inngest/crawl-worker';
import { fakeDb as db } from '@/test/supabase-fake';

const BUSINESS_ID = 'biz_own';
const PROJECT_ID = 'proj_1';

function seedProject({ withProject = true } = {}) {
  if (withProject) {
    db.seed('projects', [
      {
        id: PROJECT_ID,
        name: 'Northwind vs Competitors',
        primary_service: 'dentist',
        location: 'Chester',
        postcode: 'CH1 1AA',
      },
    ]);
  }
  db.seed('businesses', [
    {
      id: BUSINESS_ID,
      project_id: withProject ? PROJECT_ID : null,
      name: 'Northwind Dental',
      url: 'https://northwind-dental.test',
      domain: 'northwind-dental.test',
      is_own_business: true,
      google_place_id: null,
      last_crawled_at: null,
      crawl_job_id: 'job_test_0001',
    },
  ]);
}

/** Ordered step ids executed by a run. */
const stepIds = (out: { ctx: { step: { run: { mock: { calls: unknown[][] } } } } }) =>
  out.ctx.step.run.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  orchestrator.startBusinessCrawl.mockResolvedValue('job_test_0001');
  orchestrator.checkCrawlStatus.mockResolvedValue('completed');
});

describe('crawl-business — main path', () => {
  it('runs crawl, persist and enrichment steps in order', async () => {
    seedProject();
    const out = await new InngestTestEngine({
      function: crawlBusinessFunction,
      events: [{ name: 'crawl/business.scan', data: { businessId: BUSINESS_ID, mode: 'initial' } }],
    }).execute();

    const ids = stepIds(out as never);

    // Crawl must be started, polled and persisted before anything enriches.
    expect(ids[0]).toBe('start-crawl');
    expect(ids).toContain('poll-status-0');
    expect(ids).toContain('persist-signals');
    expect(ids.indexOf('persist-signals')).toBeGreaterThan(ids.indexOf('poll-status-0'));

    // Enrichment and scoring only make sense once signals exist.
    for (const later of ['enrich-google', 'enrich-serp', 'calculate-scores', 'priority-actions']) {
      expect(ids.indexOf(later)).toBeGreaterThan(ids.indexOf('persist-signals'));
    }

    // Scores must be calculated before they are snapshotted or decayed.
    expect(ids.indexOf('save-score-snapshot')).toBeGreaterThan(ids.indexOf('calculate-scores'));
    expect(ids.indexOf('apply-score-decay')).toBeGreaterThan(ids.indexOf('calculate-scores'));
  }, 30000);

  it('starts the crawl in the mode the event asked for', async () => {
    seedProject();
    await new InngestTestEngine({
      function: crawlBusinessFunction,
      events: [
        { name: 'crawl/business.scan', data: { businessId: BUSINESS_ID, mode: 'incremental' } },
      ],
    }).execute();

    expect(orchestrator.startBusinessCrawl).toHaveBeenCalledWith(BUSINESS_ID, 'incremental');
  }, 30000);
});

/**
 * The retry path lives in the function's `onFailure` handler. @inngest/test
 * addresses InngestFunctions, and a failure handler is not exposed as one, so
 * we wrap the handler in a function of our own and supply the `error` argument
 * that Inngest's middleware would normally inject from the failure event.
 * The handler body — and therefore its step order — is the real one.
 */
type FailureHandler = (ctx: Record<string, unknown>) => Promise<unknown>;
const onFailureHandler = (crawlBusinessFunction as unknown as { onFailureFn: FailureHandler })
  .onFailureFn;

const failureUnderTest = inngest.createFunction(
  { id: 'crawl-business-failure-under-test' },
  { event: 'crawl/business.failed.test' },
  async (ctx) =>
    onFailureHandler({
      ...ctx,
      error: new Error((ctx.event.data as { reason: string }).reason),
    }),
);

const runFailure = (reason = 'CF crawl start failed: 502') =>
  new InngestTestEngine({
    function: failureUnderTest,
    events: [
      {
        name: 'crawl/business.failed.test',
        data: { reason, event: { data: { businessId: BUSINESS_ID } } },
      },
    ],
  }).execute();

describe('crawl-business — retry path (onFailure)', () => {
  it('marks the crawl failed before scheduling the retry', async () => {
    seedProject();
    const out = await runFailure();
    const ids = stepIds(out as never);

    expect(ids[0]).toBe('mark-failed-on-error');
    expect(orchestrator.markCrawlFailed).toHaveBeenCalledWith(BUSINESS_ID, 'job_test_0001');
  }, 30000);

  it('still generates priority actions for the project before retrying', async () => {
    seedProject();
    const out = await runFailure();
    const ids = stepIds(out as never);

    expect(ids).toEqual(['mark-failed-on-error', 'check-generate-priority-actions']);
  }, 30000);

  it('schedules an incremental re-crawl 24h out', async () => {
    seedProject();
    const out = (await runFailure()) as unknown as {
      ctx: { step: { sendEvent: { mock: { calls: unknown[][] } } } };
    };

    const calls = out.ctx.step.sendEvent.mock.calls;
    expect(calls).toHaveLength(1);
    const [stepId, payload] = calls[0] as [string, { name: string; data: unknown; ts: number }];
    expect(stepId).toBe('schedule-retry-crawl');
    expect(payload.name).toBe('crawl/business.scan');
    expect(payload.data).toEqual({ businessId: BUSINESS_ID, mode: 'incremental' });
    // 24h out, per the comment in the worker: fail fast, retry sooner than the
    // regular 7-day cadence.
    expect(payload.ts - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(payload.ts - Date.now()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  }, 30000);

  it('records the failure reason against the business', async () => {
    seedProject();
    await runFailure('CF crawl start failed: 502');

    const biz = db.rows('businesses').find((r) => r.id === BUSINESS_ID)!;
    const errs = biz.enrichment_errors as Record<string, string> | null;
    expect(errs?.crawl).toMatch(/CF crawl start failed: 502/);
    expect(errs?.crawl).toMatch(/retry automatically/i);
  }, 30000);

  it('skips priority-action generation when the business has no project', async () => {
    seedProject({ withProject: false });
    const out = await runFailure();

    expect(stepIds(out as never)).toEqual(['mark-failed-on-error']);
  }, 30000);
});
