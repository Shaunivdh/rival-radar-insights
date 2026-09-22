/**
 * getServerUser / isDemoRequest, the shell picker behind the (public) layout.
 *
 * next/headers and @supabase/ssr are mocked the same way as the contact action
 * test: mutable module-level state stands in for the request's cookies and the
 * session lookup result.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Cookie = { name: string; value: string };

let cookieJar: Cookie[] = [];

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => cookieJar,
    get: (name: string) => cookieJar.find((c) => c.name === name),
  }),
}));

let getUserResult: { data: { user: unknown }; error: unknown } = {
  data: { user: null },
  error: null,
};

/** Cookie adapter the module hands to createServerClient, captured per call. */
let capturedCookies: { getAll: () => Cookie[]; setAll: (c: unknown[]) => void } | null = null;

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: never }) => {
    capturedCookies = options.cookies;
    return { auth: { getUser: async () => getUserResult } };
  },
}));

import { getServerUser, isDemoRequest } from '@/lib/supabase/serverAuth';

describe('getServerUser', () => {
  beforeEach(() => {
    cookieJar = [];
    capturedCookies = null;
    getUserResult = { data: { user: null }, error: null };
  });

  it('returns the user when the session resolves', async () => {
    const user = { id: 'user-1', email: 'owner@example.com' };
    getUserResult = { data: { user }, error: null };

    await expect(getServerUser()).resolves.toEqual(user);
  });

  it('returns null when there is no session', async () => {
    await expect(getServerUser()).resolves.toBeNull();
  });

  it('returns null when the session lookup errors', async () => {
    getUserResult = {
      data: { user: { id: 'user-1' } },
      error: { message: 'invalid refresh token' },
    };

    await expect(getServerUser()).resolves.toBeNull();
  });

  it('passes the request cookies through and never writes them back', async () => {
    cookieJar = [{ name: 'sb-test-auth-token', value: 'token' }];

    await getServerUser();

    expect(capturedCookies?.getAll()).toEqual(cookieJar);
    // An RSC cannot set cookies, so setAll must stay a silent no-op.
    expect(() => capturedCookies?.setAll([{ name: 'a', value: 'b', options: {} }])).not.toThrow();
  });
});

describe('isDemoRequest', () => {
  beforeEach(() => {
    cookieJar = [];
  });

  it('is true for rr-demo=1', async () => {
    cookieJar = [{ name: 'rr-demo', value: '1' }];
    await expect(isDemoRequest()).resolves.toBe(true);
  });

  it('is false when the cookie is absent', async () => {
    await expect(isDemoRequest()).resolves.toBe(false);
  });

  it('is false for any other value', async () => {
    cookieJar = [{ name: 'rr-demo', value: '0' }];
    await expect(isDemoRequest()).resolves.toBe(false);
  });
});
