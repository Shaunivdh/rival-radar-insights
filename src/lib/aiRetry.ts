import { logger } from '@/lib/logger';

interface RetryOptions {
  maxAttempts?: number;
  backoffMs?: number;
  label?: string;
}

/**
 * Retry wrapper for Anthropic API calls. Retries on 429 rate-limit errors
 * with linear backoff (attempt * backoffMs). Throws immediately on any
 * other error. If all retries are exhausted, throws the last 429 error.
 */
export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const backoffMs = options?.backoffMs ?? 5000;
  const label = options?.label ?? 'withRetry';

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * backoffMs));
    try {
      return await fn();
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 429 && attempt < maxAttempts - 1) {
        logger.warn(label, '429 rate limit, retrying', { attempt: attempt + 1, maxAttempts });
        lastError = e;
        continue;
      }
      throw e;
    }
  }
  // Unreachable: the loop always returns or throws from inside. This satisfies the type checker.
  throw lastError;
}
