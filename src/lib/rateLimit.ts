/**
 * Shared rate limiting, backed by the `check_rate_limit` Postgres function.
 *
 * The previous implementation was an in-process Map, so every serverless cold
 * start forgot its counters and each instance limited independently. The RPC
 * does the read, the increment and the comparison in one locked statement, so
 * concurrent requests for the same key cannot both pass.
 *
 * FAILS OPEN: if the RPC errors, times out, or the network is down we return
 * false, which lets the request through. A limiter outage must never block real
 * users. The timeout matters as much as the error branch: without it a hanging
 * Supabase connection would stall the request instead of failing open.
 */
import { supabaseAdmin } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/** Max requests per key per window. Unchanged from the in-memory limiter. */
export const RATE_LIMIT = 5;
/** Window length in milliseconds. Unchanged from the in-memory limiter. */
export const RATE_WINDOW_MS = 60_000;
/**
 * How long to wait for the RPC before giving up and letting the request
 * through. A rate-limit check is a single indexed upsert, so anything past this
 * means the database is in trouble and is not worth blocking a user over.
 */
export const RATE_LIMIT_TIMEOUT_MS = 2_000;

/**
 * Returns true when `key` is over its limit and the caller should reject with
 * 429. Namespace the key per route, for example `regenerate-actions:${ip}`,
 * because the underlying table is shared.
 */
export async function isRateLimited(
  key: string,
  limit: number = RATE_LIMIT,
  windowMs: number = RATE_WINDOW_MS,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .rpc('check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_ms: windowMs,
    })
    .abortSignal(AbortSignal.timeout(RATE_LIMIT_TIMEOUT_MS));

  // postgrest-js converts network failures and aborts into a returned error
  // rather than throwing, so the timeout lands here too.
  if (error) {
    logger.error('rateLimit', 'check_rate_limit failed, allowing request', {
      key,
      error,
    });
    return false;
  }

  return data === true;
}
