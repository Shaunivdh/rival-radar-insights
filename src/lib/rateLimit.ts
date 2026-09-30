/**
 * Shared rate limiting, backed by the `check_rate_limit` Postgres function.
 *
 * The previous implementation was an in-process Map, so every serverless cold
 * start forgot its counters and each instance limited independently. The RPC
 * does the read, the increment and the comparison in one locked statement, so
 * concurrent requests for the same key cannot both pass.
 *
 * FAILS OPEN BY DEFAULT: if the RPC errors, times out, or the network is down we
 * return false, which lets the request through. A limiter outage must never block
 * real users. The timeout matters as much as the error branch: without it a
 * hanging Supabase connection would stall the request instead of failing open.
 *
 * Callers that meter something expensive can pass `failClosed` to invert that on
 * their route. Use it where a refusal is cheap for the caller but letting the
 * request through is not, for example a manual recovery endpoint that spends
 * money on paid model calls and has no UI caller waiting on it.
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

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
  /**
   * What to do when the limiter cannot reach a verdict. Default false (allow).
   * Pass true on routes where an unmetered request costs real money.
   */
  failClosed?: boolean;
}

/**
 * Returns true when `key` is over its limit and the caller should reject with
 * 429. Namespace the key per route, for example `regenerate-actions:${userId}`,
 * because the underlying table is shared. Prefer a stable authenticated
 * identifier over a client-supplied header, which a caller can rotate to get a
 * fresh bucket.
 */
export async function isRateLimited(key: string, options: RateLimitOptions = {}): Promise<boolean> {
  const { limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS, failClosed = false } = options;

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
    logger.error(
      'rateLimit',
      failClosed
        ? 'check_rate_limit failed, refusing request'
        : 'check_rate_limit failed, allowing request',
      { key, error },
    );
    return failClosed;
  }

  // A verdict is strictly true or false. Anything else (a null body, a shape the
  // RPC should never return) is as indeterminate as an error, so it follows the
  // same policy rather than being read as "under the limit".
  if (typeof data !== 'boolean') {
    logger.error('rateLimit', 'check_rate_limit returned no verdict', { key, failClosed });
    return failClosed;
  }

  return data;
}
