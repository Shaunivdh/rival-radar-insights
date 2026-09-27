/**
 * Type-level guard for the action-generation result.
 *
 * `runProjectActionGeneration` in the crawl worker decides which enrichment
 * error to write by comparing `result.reason` against three exact strings. Those
 * comparisons are the only thing standing between a failed generation and an
 * action plan that is silently empty, so the reason set is closed and checked by
 * `bun run typecheck`: rewording a message at the return site now fails to
 * compile at the branch that reads it.
 *
 * Imports are type-only, so this file never loads the server-only module.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type {
  ActionGenerationReason,
  ActionGenerationResult,
} from '@/lib/priorityActionsGenerator';
import type { BusinessId } from '@/types';

describe('ActionGenerationResult types', () => {
  it('carries a closed reason set and a branded business id', () => {
    expectTypeOf<ActionGenerationResult['reason']>().toEqualTypeOf<
      ActionGenerationReason | undefined
    >();
    expectTypeOf<ActionGenerationResult['ownBusinessId']>().toEqualTypeOf<BusinessId | undefined>();
    expectTypeOf<ActionGenerationResult['inserted']>().toEqualTypeOf<number>();
  });

  it('includes every string the crawl worker branches on', () => {
    expectTypeOf<'AI temporarily unavailable'>().toExtend<ActionGenerationReason>();
    expectTypeOf<'generation returned 0 actions'>().toExtend<ActionGenerationReason>();
    // The insert case keeps the Postgres message, so it stays a template literal.
    expectTypeOf<'insert failed: duplicate key value'>().toExtend<ActionGenerationReason>();
  });

  it('rejects a reason that is not one of the declared outcomes', () => {
    expectTypeOf<'AI is temporarily unavailable'>().not.toExtend<ActionGenerationReason>();
    expectTypeOf<string>().not.toExtend<ActionGenerationReason>();
  });
});
