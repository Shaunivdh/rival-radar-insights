/**
 * Type-level guard for the evidence-path resolver.
 *
 * `resolveEvidence` returns a discriminated union, and the two callers rely on
 * the discriminant: `dropUngroundedActions` only reads `reason` after checking
 * `!r.ok`, and the fact-checker only forwards `actual` on a value mismatch.
 * Flattening the union into optional fields would silently let a caller read
 * `reason` on a success, so these assertions are checked by `bun run typecheck`.
 */
import { describe, it, expectTypeOf } from 'vitest';
import { resolveEvidence, type EvidenceResolution } from '@/services/ai';
import type { Business } from '@/types';

type Resolved = Extract<EvidenceResolution, { ok: true }>;
type Unresolved = Extract<EvidenceResolution, { ok: false }>;

describe('resolveEvidence types', () => {
  it('takes the evidence string plus the businesses it is resolved against', () => {
    expectTypeOf(resolveEvidence).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(resolveEvidence).parameter(1).toEqualTypeOf<Business>();
    expectTypeOf(resolveEvidence).parameter(2).toEqualTypeOf<Business[]>();
    expectTypeOf(resolveEvidence).returns.toEqualTypeOf<EvidenceResolution>();
  });

  it('discriminates on ok, so a success carries only the path', () => {
    expectTypeOf<Resolved>().toEqualTypeOf<{ ok: true; path: string }>();
    expectTypeOf<Resolved>().not.toHaveProperty('reason');
    expectTypeOf<Resolved>().not.toHaveProperty('actual');
  });

  it('keeps the failure reasons closed, so a new one forces callers to handle it', () => {
    expectTypeOf<Unresolved['reason']>().toEqualTypeOf<'missing_path' | 'value_mismatch'>();
    expectTypeOf<Unresolved['path']>().toEqualTypeOf<string>();
    // The cited value is whatever was in the data, so callers must narrow it.
    expectTypeOf<Unresolved['actual']>().toEqualTypeOf<unknown>();
  });

  it('narrows to the failure branch once ok is ruled out', () => {
    // Reading `r.reason` here only compiles because the discriminant narrowed,
    // and the return type pins the reason union without a second declaration.
    const reasonOf = (r: EvidenceResolution) => (r.ok ? null : r.reason);
    expectTypeOf(reasonOf).returns.toEqualTypeOf<'missing_path' | 'value_mismatch' | null>();
    expectTypeOf<Exclude<EvidenceResolution, Resolved>>().toEqualTypeOf<Unresolved>();
  });
});
