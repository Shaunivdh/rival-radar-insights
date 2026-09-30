/**
 * The three public generators collapse every failure into `AIUnavailableError`,
 * which is what the crawl worker and the action generator catch. Before `kind`
 * existed, the reason a scan produced no recommendations survived only in
 * telemetry, so an empty action plan looked identical whether the model had been
 * truncated, rate limited, or had returned unparseable JSON.
 *
 * Runtime assertions cover the classification; the type assertion keeps the set
 * closed so a new kind cannot be introduced without the callers seeing it.
 */
import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  AIUnavailableError,
  TruncatedOutputError,
  classifyAIFailure,
  type AIFailureKind,
} from '@/services/ai';

describe('classifyAIFailure', () => {
  it('reports a response cut off at max_tokens as truncated', () => {
    expect(classifyAIFailure(new TruncatedOutputError('askClaude', 512))).toBe('truncated');
  });

  it('reports an unparseable body as a parse failure', () => {
    // parseStructured hands the text block straight to JSON.parse.
    let thrown: unknown;
    try {
      JSON.parse('{"actions":[');
    } catch (e) {
      thrown = e;
    }
    expect(classifyAIFailure(thrown)).toBe('parse');
  });

  it('falls back to unknown for anything else, including SDK API errors', () => {
    // An upstream API failure is already recorded by name via errorTypeOf, so it
    // is deliberately not classified here. See the note on AIFailureKind.
    expect(classifyAIFailure(new Error('upstream 503'))).toBe('unknown');
    expect(classifyAIFailure('a string')).toBe('unknown');
    expect(classifyAIFailure(undefined)).toBe('unknown');
  });
});

describe('AIUnavailableError', () => {
  it('carries the underlying kind through the collapse', () => {
    const e = new AIUnavailableError(new TruncatedOutputError('generation', 900));
    expect(e.kind).toBe('truncated');
    // The existing contract is unchanged: still an Error, still retryAt.
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('AIUnavailableError');
    expect(e.retryAt).toEqual(expect.any(String));
    expect(e.message).toBe('AI generation unavailable');
  });

  it('keeps the kind set closed', () => {
    expectTypeOf<AIFailureKind>().toEqualTypeOf<'truncated' | 'parse' | 'unknown'>();
    expectTypeOf(classifyAIFailure).returns.toEqualTypeOf<AIFailureKind>();
    expectTypeOf<AIUnavailableError['kind']>().toEqualTypeOf<AIFailureKind>();
  });
});
