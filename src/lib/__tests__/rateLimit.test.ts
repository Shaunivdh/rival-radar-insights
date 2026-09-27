/**
 * isRateLimited, the Supabase-backed limiter behind /api/regenerate-actions.
 *
 * supabaseAdmin is mocked (the real module is `server-only` and needs service
 * credentials), so these assert the contract around the RPC: the boolean is
 * passed through, an abort signal is always attached, and anything that comes
 * back as an error fails open.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type RpcResult = { data: boolean | null; error: unknown };

let rpcResult: RpcResult = { data: false, error: null };
const rpcCalls: Array<[string, Record<string, unknown>]> = [];
/** The signal the module hands to postgrest, captured per call. */
let capturedSignal: AbortSignal | null = null;

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push([fn, args]);
      return {
        abortSignal(signal: AbortSignal) {
          capturedSignal = signal;
          return Promise.resolve(rpcResult);
        },
      };
    },
  },
}));

const loggedErrors: Array<{ scope: string; message: string }> = [];

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (scope: string, message: string) => {
      loggedErrors.push({ scope, message });
    },
  },
}));

import { isRateLimited, RATE_LIMIT, RATE_WINDOW_MS, RATE_LIMIT_TIMEOUT_MS } from '@/lib/rateLimit';

describe('isRateLimited', () => {
  beforeEach(() => {
    rpcResult = { data: false, error: null };
    rpcCalls.length = 0;
    capturedSignal = null;
    loggedErrors.length = 0;
  });

  it('returns false when the caller is under the limit', async () => {
    rpcResult = { data: false, error: null };

    await expect(isRateLimited('regenerate-actions:1.2.3.4')).resolves.toBe(false);
  });

  it('returns true when the caller is over the limit', async () => {
    rpcResult = { data: true, error: null };

    await expect(isRateLimited('regenerate-actions:1.2.3.4')).resolves.toBe(true);
  });

  it('fails open and logs when the RPC errors', async () => {
    rpcResult = { data: null, error: { message: 'connection refused' } };

    await expect(isRateLimited('regenerate-actions:1.2.3.4')).resolves.toBe(false);
    expect(loggedErrors).toHaveLength(1);
    expect(loggedErrors[0]).toMatchObject({ scope: 'rateLimit' });
  });

  it('passes the key and the unchanged limit and window to the RPC', async () => {
    await isRateLimited('regenerate-actions:1.2.3.4');

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0][0]).toBe('check_rate_limit');
    expect(rpcCalls[0][1]).toEqual({
      p_key: 'regenerate-actions:1.2.3.4',
      p_limit: RATE_LIMIT,
      p_window_ms: RATE_WINDOW_MS,
    });
    expect(RATE_LIMIT).toBe(5);
    expect(RATE_WINDOW_MS).toBe(60_000);
  });

  it('fails open when the RPC returns a null body without an error', async () => {
    rpcResult = { data: null, error: null };

    await expect(isRateLimited('regenerate-actions:1.2.3.4')).resolves.toBe(false);
  });

  it('attaches a timeout signal so a hanging database cannot stall the request', async () => {
    await isRateLimited('regenerate-actions:1.2.3.4');

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    // Not already spent when the request goes out.
    expect(capturedSignal?.aborted).toBe(false);
    expect(RATE_LIMIT_TIMEOUT_MS).toBe(2_000);
  });

  it('fails open when the request is aborted by that timeout', async () => {
    // Shape postgrest-js returns for an abort: an error, never a throw.
    rpcResult = {
      data: null,
      error: {
        message: 'AbortError: This operation was aborted',
        hint: 'Request was aborted (timeout or manual cancellation)',
        code: '',
      },
    };

    await expect(isRateLimited('regenerate-actions:1.2.3.4')).resolves.toBe(false);
    expect(loggedErrors).toHaveLength(1);
    expect(loggedErrors[0]).toMatchObject({ scope: 'rateLimit' });
  });
});
