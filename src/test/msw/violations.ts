/**
 * Contract violations recorded by msw handlers. Throwing inside a handler
 * only yields a 500 the service under test may swallow, so we record and
 * assert in `afterEach` (see src/test/setup.ts) to fail loudly.
 */
import type { ZodError, ZodTypeAny } from 'zod';

export const contractViolations: string[] = [];

export function drainViolations(): string[] {
  const out = contractViolations.splice(0);
  return out;
}

export function check<T extends ZodTypeAny>(label: string, schema: T, value: unknown): void {
  const r = schema.safeParse(value);
  if (!r.success) {
    const err = r.error as ZodError;
    contractViolations.push(
      `${label}: ${err.issues.map((i) => `${i.path.join('.') || '<root>'} ${i.message}`).join('; ')}`,
    );
  }
}
