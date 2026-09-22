/**
 * Global Vitest setup.
 * - Starts the msw server so no test can reach a real external API by accident.
 * - Provides dummy env so modules that read env at import time do not throw.
 */
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import { server } from './msw/server';
import { drainViolations } from './msw/violations';

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.CF_ACCOUNT_ID ??= 'cf-account-test';
process.env.CF_API_TOKEN ??= 'cf-token-test';
process.env.GOOGLE_PLACES_API_KEY ??= 'google-key-test';
process.env.SERP_API_KEY ??= 'serp-key-test';
process.env.ANTHROPIC_API_KEY ??= 'anthropic-key-test';

if (process.env.RUN_REAL_API !== '1') {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    server.resetHandlers();
    const violations = drainViolations();
    expect(violations, 'external API contract violations').toEqual([]);
  });
  afterAll(() => server.close());
}
