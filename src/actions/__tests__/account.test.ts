/**
 * deleteAccount and exportMyData (UK GDPR erasure and access).
 *
 * supabaseAdmin is a chainable fake: every query records its table and ops, and
 * resolves with the rows set in `tables`. The session comes from a mocked
 * @supabase/ssr client so the "who is asking" check is exercised for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Op = [string, ...unknown[]];
type Query = { table: string; ops: Op[] };

let tables: Record<string, unknown[]> = {};
let queries: Query[] = [];
let deleteUserError: unknown = null;
const deletedUsers: string[] = [];

function query(table: string) {
  const q: Query = { table, ops: [] };
  queries.push(q);
  const result = () => ({ data: tables[table] ?? [], error: null });
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    maybeSingle: () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null }),
  };
  for (const op of ['select', 'eq', 'in', 'like', 'delete']) {
    builder[op] = (...args: unknown[]) => {
      q.ops.push([op, ...args]);
      return builder;
    };
  }
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: (table: string) => query(table),
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          if (!deleteUserError) deletedUsers.push(id);
          return { error: deleteUserError };
        },
      },
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [] }),
}));

let currentUser: { id: string; email?: string; created_at?: string } | null = null;

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () =>
        currentUser
          ? { data: { user: currentUser }, error: null }
          : { data: { user: null }, error: new Error('no session') },
    },
  }),
}));

import { deleteAccount, exportMyData } from '@/actions/account';

const deletesOn = (table: string) =>
  queries.filter((q) => q.table === table && q.ops.some(([op]) => op === 'delete'));

describe('deleteAccount', () => {
  beforeEach(() => {
    tables = {};
    queries = [];
    deleteUserError = null;
    deletedUsers.length = 0;
    currentUser = { id: 'user-1', email: 'owner@example.com' };
  });

  it('refuses without a session and deletes nothing', async () => {
    currentUser = null;

    expect(await deleteAccount()).toEqual({
      ok: false,
      error: 'Please sign in again and retry.',
    });
    expect(queries).toHaveLength(0);
    expect(deletedUsers).toHaveLength(0);
  });

  it('clears serp_data and rate limits, then deletes the auth user', async () => {
    tables = { projects: [{ id: 'proj-1' }], businesses: [{ id: 'biz-1' }, { id: 'biz-2' }] };

    expect(await deleteAccount()).toEqual({ ok: true });

    const [serp] = deletesOn('serp_data');
    expect(serp.ops).toContainEqual(['in', 'business_id', ['biz-1', 'biz-2']]);

    const rateOps = deletesOn('rate_limits').flatMap((q) => q.ops);
    expect(rateOps).toContainEqual(['eq', 'key', 'regenerate-actions:user-1']);
    expect(rateOps).toContainEqual(['like', 'key', '%proj-1%']);

    expect(deletedUsers).toEqual(['user-1']);
  });

  it('only scopes queries to the signed-in user', async () => {
    tables = { projects: [{ id: 'proj-1' }], businesses: [] };
    await deleteAccount();

    const projectQuery = queries.find((q) => q.table === 'projects');
    expect(projectQuery?.ops).toContainEqual(['eq', 'user_id', 'user-1']);
  });

  it('skips serp_data when the user has no projects', async () => {
    tables = { projects: [] };

    expect(await deleteAccount()).toEqual({ ok: true });
    expect(deletesOn('serp_data')).toHaveLength(0);
    expect(deletedUsers).toEqual(['user-1']);
  });

  it('reports a friendly error when the auth delete fails', async () => {
    deleteUserError = new Error('foreign key violation');

    expect(await deleteAccount()).toEqual({
      ok: false,
      error: 'Could not delete your account. Please contact support.',
    });
  });
});

describe('exportMyData', () => {
  beforeEach(() => {
    tables = {};
    queries = [];
    currentUser = { id: 'user-1', email: 'owner@example.com', created_at: '2026-01-01' };
  });

  it('throws without a session', async () => {
    currentUser = null;
    await expect(exportMyData()).rejects.toThrow('Not authenticated');
  });

  it('returns the account, projects, businesses and actions for this user', async () => {
    tables = {
      users: [{ id: 'user-1' }],
      projects: [{ id: 'proj-1', user_id: 'user-1' }],
      businesses: [{ id: 'biz-1', project_id: 'proj-1' }],
      priority_actions: [{ id: 'act-1', project_id: 'proj-1' }],
    };

    const data = await exportMyData();

    expect(data.account).toMatchObject({ id: 'user-1', email: 'owner@example.com' });
    expect(data.projects).toHaveLength(1);
    expect(data.businesses).toHaveLength(1);
    expect(data.priorityActions).toHaveLength(1);
    expect(queries.find((q) => q.table === 'projects')?.ops).toContainEqual([
      'eq',
      'user_id',
      'user-1',
    ]);
  });
});
