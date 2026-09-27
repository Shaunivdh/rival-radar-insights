/**
 * Type-level guard for the branded id types.
 *
 * These assertions are checked by `bun run typecheck`, not at runtime: if
 * someone widens `Business['id']` back to `string`, or drops the brand from
 * `asBusinessId`, this file stops compiling. The bodies still run under vitest
 * so the file is reported alongside the rest of the suite.
 */
import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  Business,
  BusinessId,
  PriorityAction,
  PriorityActionId,
  Project,
  ProjectId,
} from '@/types';
import { asBusinessId, asPriorityActionId, asProjectId } from '@/types';

describe('branded ids', () => {
  it('are strings, so they flow into anything that takes a string', () => {
    expectTypeOf<BusinessId>().toExtend<string>();
    expectTypeOf<ProjectId>().toExtend<string>();
    expectTypeOf<PriorityActionId>().toExtend<string>();
  });

  it('cannot be created from a bare string without going through a constructor', () => {
    expectTypeOf<string>().not.toExtend<BusinessId>();
    expectTypeOf<string>().not.toExtend<ProjectId>();
    expectTypeOf<string>().not.toExtend<PriorityActionId>();
  });

  it('are not interchangeable with each other', () => {
    expectTypeOf<BusinessId>().not.toEqualTypeOf<ProjectId>();
    expectTypeOf<ProjectId>().not.toEqualTypeOf<PriorityActionId>();
    expectTypeOf<BusinessId>().not.toExtend<ProjectId>();
  });

  it('are what the domain types carry', () => {
    expectTypeOf<Business['id']>().toEqualTypeOf<BusinessId>();
    expectTypeOf<Project['id']>().toEqualTypeOf<ProjectId>();
    expectTypeOf<PriorityAction['id']>().toEqualTypeOf<PriorityActionId>();
  });

  it('are produced by the constructors and erased at runtime', () => {
    expectTypeOf(asBusinessId).returns.toEqualTypeOf<BusinessId>();
    expectTypeOf(asProjectId).returns.toEqualTypeOf<ProjectId>();
    expectTypeOf(asPriorityActionId).returns.toEqualTypeOf<PriorityActionId>();
    // The brand exists only in the type system: same string in, same string out.
    expect(asBusinessId('biz_1')).toBe('biz_1');
    expect(asProjectId('proj_1')).toBe('proj_1');
    expect(asPriorityActionId('act_1')).toBe('act_1');
  });
});
