/**
 * Zustand store logic. Supabase client and server actions are mocked; these
 * tests cover the pure state transitions the dashboard relies on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildBusiness, buildProject } from '@/test/builders';
import { asBusinessId } from '@/types';

const { upsert, from } = vi.hoisted(() => {
  const upsert = vi.fn(() => Promise.resolve({ error: null }));
  const from = vi.fn(() => ({ upsert }));
  return { upsert, from };
});
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from,
    auth: { signOut: vi.fn(), getSession: vi.fn(), signUp: vi.fn(), signInWithPassword: vi.fn() },
  },
}));
vi.mock('@/actions/projects', () => ({ getProject: vi.fn(), fetchPriorityActions: vi.fn() }));

import { useScoutlyStore } from '@/store/scoutly';

const initial = useScoutlyStore.getState();

beforeEach(() => {
  useScoutlyStore.setState(initial, true);
  vi.clearAllMocks();
  (globalThis as { document?: unknown }).document = { cookie: '' };
});

describe('project state', () => {
  it('setProject stores the project and leaves demo mode', () => {
    useScoutlyStore.setState({ isDemoMode: true });
    useScoutlyStore.getState().setProject(buildProject());
    expect(useScoutlyStore.getState().project?.id).toBe('proj_1');
    expect(useScoutlyStore.getState().isDemoMode).toBe(false);
  });

  it('getBusinessById finds own business and competitors', () => {
    useScoutlyStore.getState().setProject(buildProject());
    const s = useScoutlyStore.getState();
    expect(s.getBusinessById(asBusinessId('biz_own'))?.name).toBe('Acme Plumbing');
    expect(s.getBusinessById(asBusinessId('biz_c1'))?.name).toBe('Bristol Plumbing Co');
    expect(s.getBusinessById(asBusinessId('nope'))).toBeUndefined();
  });

  it('addCompetitorToStore appends and is a no-op without a project', () => {
    useScoutlyStore.getState().addCompetitorToStore(buildBusiness({ id: asBusinessId('x') }));
    expect(useScoutlyStore.getState().project).toBeNull();
    useScoutlyStore.getState().setProject(buildProject());
    useScoutlyStore
      .getState()
      .addCompetitorToStore(buildBusiness({ id: asBusinessId('biz_c2'), name: 'New' }));
    expect(useScoutlyStore.getState().project?.competitors.map((c) => c.id)).toEqual([
      'biz_c1',
      'biz_c2',
    ]);
  });

  it('deleteProject clears project state and the demo cookie', () => {
    useScoutlyStore.getState().setProject(buildProject());
    useScoutlyStore.setState({ demoBannerDismissed: true });
    useScoutlyStore.getState().deleteProject();
    const s = useScoutlyStore.getState();
    expect(s.project).toBeNull();
    expect(s.priorityActions).toEqual([]);
    expect(s.demoBannerDismissed).toBe(false);
    expect((globalThis as { document: { cookie: string } }).document.cookie).toContain('rr-demo=;');
  });
});

describe('syncBusinesses', () => {
  it('patches matching businesses and preserves fields when an update omits them', () => {
    useScoutlyStore.getState().setProject(buildProject());
    const before = useScoutlyStore.getState().project!;
    useScoutlyStore
      .getState()
      .syncBusinesses([{ id: 'biz_c1', crawlStatus: 'running', signals: null, aiScore: null }]);
    const after = useScoutlyStore.getState().project!;
    expect(after.ownBusiness).toBe(before.ownBusiness);
    expect(after.competitors[0].crawlStatus).toBe('running');
    expect(after.competitors[0].signals).toBe(before.competitors[0].signals);
    expect(after.competitors[0].googleData).toBe(before.competitors[0].googleData);
  });

  it('applies explicit null googleData and is a no-op without a project', () => {
    useScoutlyStore
      .getState()
      .syncBusinesses([{ id: 'biz_own', crawlStatus: 'failed', signals: null, aiScore: null }]);
    expect(useScoutlyStore.getState().project).toBeNull();
    useScoutlyStore.getState().setProject(buildProject());
    useScoutlyStore
      .getState()
      .syncBusinesses([
        { id: 'biz_own', crawlStatus: 'failed', signals: null, aiScore: null, googleData: null },
      ]);
    expect(useScoutlyStore.getState().project?.ownBusiness.googleData).toBeNull();
  });
});

describe('setSettings', () => {
  it('merges settings and persists to app_settings when logged in', async () => {
    useScoutlyStore.getState().setUser({ id: 'u1', email: 'a@b.c' });
    useScoutlyStore.getState().setSettings({ location: 'Bristol', postcode: 'BS1 1AA' });
    expect(useScoutlyStore.getState().settings).toMatchObject({
      primaryService: 'accounting',
      location: 'Bristol',
    });
    expect(from).toHaveBeenCalledWith('app_settings');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        primary_service: 'accounting',
        location: 'Bristol',
        postcode: 'BS1 1AA',
      }),
      { onConflict: 'user_id' },
    );
  });

  it('does not persist when logged out', () => {
    useScoutlyStore.getState().setSettings({ location: 'Bath' });
    expect(from).not.toHaveBeenCalled();
  });
});
