import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeDb as db } from '@/test/supabase-fake';
import { buildBusiness, buildSignals } from '@/test/builders';

vi.mock('@/lib/supabase/server', async () => ({
  supabaseAdmin: (await import('@/test/supabase-fake')).fakeDb,
}));
vi.mock('@/services/ai', () => ({
  generatePriorityActions: vi.fn(),
  generatePriorityActionsWithHistory: vi.fn(),
  AIUnavailableError: class extends Error {},
}));

import { checkActionsAgainstScan } from '@/lib/priorityActionsGenerator';
import { asBusinessId, asProjectId } from '@/types';

const PROJECT_ID = asProjectId('proj_1');
const SCANNED_AT = '2026-09-20T00:00:00Z';

function seed(
  actions: Record<string, unknown>[],
  own: Record<string, unknown> = { crawl_status: 'complete', last_crawled_at: SCANNED_AT },
  rivals: Record<string, unknown>[] = [],
) {
  db.seed('businesses', [
    { id: 'biz_own', project_id: PROJECT_ID, is_own_business: true, ...own },
    ...rivals.map((r) => ({ project_id: PROJECT_ID, is_own_business: false, ...r })),
  ]);
  db.seed(
    'priority_actions',
    actions.map((a, i) => ({
      id: `pa_${i}`,
      project_id: PROJECT_ID,
      status: 'completed',
      actioned_at: '2026-09-15T00:00:00Z',
      verification: null,
      ...a,
    })),
  );
}

const withTeamPage = (exists: boolean) =>
  buildBusiness({
    signals: buildSignals({ trust: { ...buildSignals().trust, teamPageExists: exists } }),
  });

const verificationOf = (id: string) =>
  db.rows('priority_actions').find((r) => r.id === id)?.verification ?? null;

describe('checkActionsAgainstScan', () => {
  beforeEach(() => db.reset());

  it('verifies a done action whose gap is gone', async () => {
    seed([{ template_id: 'no_team_page' }]);
    await checkActionsAgainstScan(PROJECT_ID, { own: withTeamPage(true), competitors: [] });
    expect(verificationOf('pa_0')).toBe('verified');
    expect(db.rows('priority_actions')[0].verified_at).toBeTruthy();
  });

  it('flags a done action whose gap is still there', async () => {
    seed([{ template_id: 'no_team_page' }]);
    await checkActionsAgainstScan(PROJECT_ID, { own: withTeamPage(false), competitors: [] });
    expect(verificationOf('pa_0')).toBe('not_verified');
  });

  it('re-checks a not_verified action and upgrades it once fixed', async () => {
    seed([{ template_id: 'no_team_page', verification: 'not_verified' }]);
    await checkActionsAgainstScan(PROJECT_ID, { own: withTeamPage(true), competitors: [] });
    expect(verificationOf('pa_0')).toBe('verified');
  });

  it('skips actions marked done after the scan, AI actions, and open actions', async () => {
    seed([
      { template_id: 'no_team_page', actioned_at: '2026-09-25T00:00:00Z' },
      { template_id: null },
      { template_id: 'no_team_page', status: 'active' },
    ]);
    await checkActionsAgainstScan(PROJECT_ID, { own: withTeamPage(true), competitors: [] });
    expect(db.rows('priority_actions').map((r) => r.verification ?? null)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('does nothing when the own scan failed', async () => {
    seed([{ template_id: 'no_team_page' }], {
      crawl_status: 'failed',
      last_crawled_at: SCANNED_AT,
    });
    await checkActionsAgainstScan(PROJECT_ID, { own: withTeamPage(true), competitors: [] });
    expect(verificationOf('pa_0')).toBeNull();
  });

  it('leaves a Google template unchecked when Google data is missing', async () => {
    seed([{ template_id: 'no_business_hours' }]);
    await checkActionsAgainstScan(PROJECT_ID, {
      own: buildBusiness({ googleData: null }),
      competitors: [],
    });
    expect(verificationOf('pa_0')).toBeNull();
  });

  describe('open actions (two scans must agree)', () => {
    const row = (id: string) => db.rows('priority_actions').find((r) => r.id === id)!;

    it('records the first scan that finds the gap gone, without resolving', async () => {
      seed([{ template_id: 'no_team_page', status: 'active', actioned_at: null }]);
      await checkActionsAgainstScan(PROJECT_ID, { own: withTeamPage(true), competitors: [] });
      expect(row('pa_0').status).toBe('active');
      expect(row('pa_0').gone_since).toBe(new Date(SCANNED_AT).toISOString());
    });

    it('resolves once a later scan still finds it gone', async () => {
      seed([
        {
          template_id: 'no_team_page',
          status: 'active',
          actioned_at: null,
          gone_since: '2026-09-13T00:00:00Z',
        },
      ]);
      await checkActionsAgainstScan(PROJECT_ID, { own: withTeamPage(true), competitors: [] });
      expect(row('pa_0')).toMatchObject({
        status: 'completed',
        verification: 'verified',
        auto_resolved: true,
        gone_since: null,
      });
      expect(row('pa_0').actioned_at).toBeTruthy();
    });

    it('does not resolve twice off the same scan', async () => {
      seed([
        {
          template_id: 'no_team_page',
          status: 'active',
          actioned_at: null,
          gone_since: SCANNED_AT,
        },
      ]);
      await checkActionsAgainstScan(PROJECT_ID, { own: withTeamPage(true), competitors: [] });
      expect(row('pa_0').status).toBe('active');
    });

    it('resets the count when the gap comes back', async () => {
      seed([
        {
          template_id: 'no_team_page',
          status: 'active',
          actioned_at: null,
          gone_since: '2026-09-13T00:00:00Z',
        },
      ]);
      await checkActionsAgainstScan(PROJECT_ID, { own: withTeamPage(false), competitors: [] });
      expect(row('pa_0')).toMatchObject({ status: 'active', gone_since: null });
    });

    it('waits when the confirming scan is under 3 days after the first', async () => {
      seed([
        {
          template_id: 'no_team_page',
          status: 'active',
          actioned_at: null,
          gone_since: '2026-09-19T00:00:00Z',
        },
      ]);
      await checkActionsAgainstScan(PROJECT_ID, { own: withTeamPage(true), competitors: [] });
      expect(row('pa_0').status).toBe('active');
    });

    it('promotes a queued action into the freed slot', async () => {
      seed([
        {
          template_id: 'no_team_page',
          status: 'active',
          actioned_at: null,
          gone_since: '2026-09-13T00:00:00Z',
        },
        { template_id: null, status: 'queued', actioned_at: null, generated_at: SCANNED_AT },
      ]);
      await checkActionsAgainstScan(PROJECT_ID, { own: withTeamPage(true), competitors: [] });
      expect(row('pa_1').status).toBe('active');
    });
  });

  describe('competitor triggers', () => {
    // no_booking_competitor_has fires when we lack online booking and a rival has it.
    const noBooking = buildBusiness({
      signals: buildSignals({
        engagement: { ...buildSignals().engagement, hasBookingSystem: false },
      }),
    });
    // Fresh data says the rival has no booking either, so the gap is gone.
    const rival = buildBusiness({
      id: asBusinessId('biz_rival'),
      name: 'Rival',
      signals: noBooking.signals,
    });

    it('verifies when every rival was freshly scanned', async () => {
      seed([{ template_id: 'no_booking_competitor_has' }], undefined, [
        { id: 'biz_rival', crawl_status: 'complete', last_crawled_at: SCANNED_AT },
      ]);
      await checkActionsAgainstScan(PROJECT_ID, {
        own: noBooking,
        competitors: [rival],
      });
      expect(verificationOf('pa_0')).toBe('verified');
    });

    it('leaves it unchecked while a rival scan failed', async () => {
      seed([{ template_id: 'no_booking_competitor_has' }], undefined, [
        { id: 'biz_rival', crawl_status: 'failed', last_crawled_at: SCANNED_AT },
      ]);
      await checkActionsAgainstScan(PROJECT_ID, {
        own: noBooking,
        competitors: [rival],
      });
      expect(verificationOf('pa_0')).toBeNull();
    });

    it('still checks site-only templates while a rival is stale', async () => {
      seed([{ template_id: 'no_team_page' }], undefined, [
        { id: 'biz_rival', crawl_status: 'complete', last_crawled_at: '2026-09-01T00:00:00Z' },
      ]);
      await checkActionsAgainstScan(PROJECT_ID, { own: withTeamPage(true), competitors: [] });
      expect(verificationOf('pa_0')).toBe('verified');
    });
  });
});

describe('checkActionsAgainstScan data guards', () => {
  beforeEach(() => db.reset());

  it('leaves site templates unchecked while the latest snapshot awaits confirmation', async () => {
    seed([{ template_id: 'no_team_page' }]);
    db.seed('extracted_signals', [
      { business_id: 'biz_own', scanned_at: SCANNED_AT, status: 'pending' },
    ]);
    await checkActionsAgainstScan(PROJECT_ID, { own: withTeamPage(true), competitors: [] });
    expect(verificationOf('pa_0')).toBeNull();
  });

  it('checks site templates once the latest snapshot is confirmed', async () => {
    seed([{ template_id: 'no_team_page' }]);
    db.seed('extracted_signals', [
      { business_id: 'biz_own', scanned_at: SCANNED_AT, status: 'confirmed' },
    ]);
    await checkActionsAgainstScan(PROJECT_ID, { own: withTeamPage(true), competitors: [] });
    expect(verificationOf('pa_0')).toBe('verified');
  });

  it('treats a rival whose site could not be read as stale', async () => {
    const own = buildBusiness({
      signals: buildSignals({
        engagement: { ...buildSignals().engagement, hasBookingSystem: false },
      }),
    });
    const rival = buildBusiness({
      id: asBusinessId('biz_rival'),
      signals: own.signals,
      enrichmentErrors: { extract: 'failed' },
    });
    seed([{ template_id: 'no_booking_competitor_has' }], undefined, [
      { id: 'biz_rival', crawl_status: 'complete', last_crawled_at: SCANNED_AT },
    ]);
    await checkActionsAgainstScan(PROJECT_ID, { own, competitors: [rival] });
    expect(verificationOf('pa_0')).toBeNull();
  });

  const visible = (testedAt: string) =>
    buildBusiness({
      aiVisibility: {
        aiPresenceScore: 60,
        mentionCount: 3,
        totalPrompts: 5,
        tested_at: testedAt,
        averagePosition: 2,
        recommendedCount: 1,
        competitorsAhead: [],
      },
    });

  it('waits for AI visibility data newer than the tick', async () => {
    seed([{ template_id: 'low_ai_visibility' }]);
    await checkActionsAgainstScan(PROJECT_ID, {
      own: visible('2026-09-10T00:00:00Z'),
      competitors: [],
    });
    expect(verificationOf('pa_0')).toBeNull();
  });

  it('verifies AI visibility once it was re-tested after the tick', async () => {
    seed([{ template_id: 'low_ai_visibility' }]);
    await checkActionsAgainstScan(PROJECT_ID, {
      own: visible('2026-09-18T00:00:00Z'),
      competitors: [],
    });
    expect(verificationOf('pa_0')).toBe('verified');
  });
});
