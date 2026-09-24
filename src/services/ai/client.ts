import Anthropic from '@anthropic-ai/sdk';
import { withRetry } from '@/lib/aiRetry';
import { type JsonSchema } from '../aiSchemas';

export class AIUnavailableError extends Error {
  readonly retryAt: string;
  constructor(cause: unknown) {
    super('AI generation unavailable');
    this.name = 'AIUnavailableError';
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

/** Telemetry error label: `truncated` is counted separately from parse/API errors. */
export function errorTypeOf(e: unknown): string {
  if (e instanceof TruncatedOutputError) return 'truncated';
  return (e as Error)?.name ?? 'Error';
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
  return withRetry(() => getClient().messages.create(params), {
    label: retryOpts?.label ?? 'callLLMRaw',
    ...(retryOpts?.backoffMs ? { backoffMs: retryOpts.backoffMs } : {}),
  });
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
