import Anthropic from '@anthropic-ai/sdk';
import { withRetry } from '@/lib/aiRetry';
import { logAIEvent } from '@/lib/aiTelemetry';
import type { JsonSchema } from '../aiSchemas';

export class AIUnavailableError extends Error {
  readonly retryAt: string;
  /** What actually failed underneath, preserved through the collapse. */
  readonly kind: AIFailureKind;
  constructor(cause: unknown) {
    super('AI generation unavailable');
    this.name = 'AIUnavailableError';
    this.kind = classifyAIFailure(cause);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    this.retryAt = tomorrow.toISOString();
    if (cause instanceof Error) this.cause = cause;
  }
}

/** The model hit `max_tokens` before finishing — output is unparseable by construction. */
export class TruncatedOutputError extends Error {
  constructor(label: string, maxTokens: number) {
    super(`${label}: model output truncated at max_tokens=${maxTokens}`);
    this.name = 'TruncatedOutputError';
  }
}

/**
 * Why an LLM call failed, as a closed set.
 *
 * The public generators collapse every failure into `AIUnavailableError`, so
 * without this the kind survives only in telemetry, and an empty action plan
 * looks the same whether the model was cut off mid-JSON or returned something
 * unparseable. Those two need different fixes: a bigger `max_tokens` versus a
 * prompt or schema problem.
 *
 * Deliberately does not branch on the SDK's own error classes. They only tell us
 * "the API call failed", which `errorTypeOf` already records by name for
 * telemetry, and depending on their class identity here would make the error path
 * break under any test that mocks the SDK module with a partial double.
 */
export type AIFailureKind = 'truncated' | 'parse' | 'unknown';

export function classifyAIFailure(cause: unknown): AIFailureKind {
  if (cause instanceof TruncatedOutputError) return 'truncated';
  // parseStructured hands the text block to JSON.parse, so an unparseable or
  // schema-invalid body arrives as a SyntaxError.
  if (cause instanceof SyntaxError) return 'parse';
  return 'unknown';
}

/** Telemetry error label: `truncated` is counted separately from parse/API errors. */
export function errorTypeOf(e: unknown): string {
  if (e instanceof TruncatedOutputError) return 'truncated';
  if (e instanceof Error) return e.name;
  if (typeof e === 'object' && e !== null && 'name' in e && typeof e.name === 'string') {
    return e.name;
  }
  return 'Error';
}

/** Structured-output text block → parsed JSON. Throws on truncation instead of parsing a partial. */
export function parseStructured<T>(msg: Anthropic.Message, label: string, maxTokens: number): T {
  if (msg.stop_reason === 'max_tokens') throw new TruncatedOutputError(label, maxTokens);
  const block = msg.content.find((c) => c.type === 'text') as { text: string } | undefined;
  return JSON.parse((block?.text ?? '').trim()) as T;
}

export const SKIP_AI = process.env.SKIP_AI_CALLS === 'true';

// Model defaults verified 2026-09-18 against:
// https://platform.claude.com/docs/en/about-claude/models/overview
// Model strings change over time. Re-verify against docs if you see
// 404 or invalid_model errors at runtime.
// FAST: extraction, sentiment, mention extraction, change summaries.
// SMART: advice generation + validation (accuracy plan §4.4) and AI-visibility queries.
export const AI_MODEL_FAST = process.env.AI_MODEL_FAST?.trim() || 'claude-haiku-4-5-20251001';
export const AI_MODEL_SMART = process.env.AI_MODEL_SMART?.trim() || 'claude-sonnet-5';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/**
 * Lowest-level LLM call wrapper. Every Anthropic `messages.create` in these
 * modules routes through here so integration tests can mock a single function.
 */
export async function callLLMRaw(
  params: Anthropic.MessageCreateParamsNonStreaming,
  retryOpts?: { backoffMs?: number; label?: string },
): Promise<Anthropic.Message> {
  const label = retryOpts?.label ?? 'callLLMRaw';
  const t0 = Date.now();
  const msg = await withRetry(() => getClient().messages.create(params), {
    label,
    ...(retryOpts?.backoffMs ? { backoffMs: retryOpts.backoffMs } : {}),
  });
  // Token usage per call, so cost estimates can be measured rather than guessed.
  logAIEvent({
    event: 'usage',
    model: params.model,
    success: true,
    durationMs: Date.now() - t0,
    label,
    inputTokens: msg.usage?.input_tokens,
    outputTokens: msg.usage?.output_tokens,
    cacheReadTokens: msg.usage?.cache_read_input_tokens ?? undefined,
    webSearchRequests: msg.usage?.server_tool_use?.web_search_requests ?? undefined,
  });
  return msg;
}

/**
 * Structured JSON call. `schema` is sent as `output_config.format`, so the
 * response is schema-valid JSON and is parsed directly. Truncated output
 * (`stop_reason === 'max_tokens'`) throws `TruncatedOutputError` rather than
 * being parsed.
 */
export async function askClaude<T>(
  prompt: string,
  schema: JsonSchema,
  opts: { maxTokens?: number; system?: string; model?: string } = {},
): Promise<T> {
  const maxTokens = opts.maxTokens ?? 512;
  const model = opts.model ?? AI_MODEL_FAST;
  const msg = await callLLMRaw(
    {
      model,
      max_tokens: maxTokens,
      output_config: { format: { type: 'json_schema', schema } },
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: 'user', content: prompt }],
    },
    { label: 'askClaude' },
  );
  return parseStructured<T>(msg, 'askClaude', maxTokens);
}
