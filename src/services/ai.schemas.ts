import { z } from 'zod';

/**
 * Zod mirrors of the JSON schemas embedded in the prompts in `ai.ts`.
 *
 * The prompt-side schema strings stay where they are — the model needs them.
 * These are the runtime counterpart, passed to `askClaude` so LLM output is
 * checked against the shape the prompt asked for.
 *
 * SHADOW MODE: a mismatch logs a `schema_shadow` telemetry event and the
 * unvalidated data is still returned. Nothing is rejected, nothing changes for
 * users.
 *
 * TODO: flip to enforcing after a week of clean schema_mismatch telemetry.
 *
 * Each schema mirrors its prompt text exactly. Do not loosen one to silence a
 * shadow failure — a failure means the prompt and the model disagree, and the
 * fix belongs in the prompt.
 */

/** Mirrors the sentiment prompt in `generateReviewSentiment`. */
export const reviewSentimentSchema = z.object({
  positiveThemes: z.array(z.string()),
  negativeThemes: z.array(z.string()),
  summary: z.string(),
});

/**
 * Mirrors `PRIORITY_SCHEMA_BASE`.
 *
 * NOTE: the prompt permits only "high" | "medium" for estimatedImpact, while
 * the `PriorityAction` TS type also allows "low". The prompt is mirrored here
 * deliberately — if the model returns "low" in practice, shadow telemetry will
 * surface it and the prompt (or the type) can then be reconciled.
 */
const priorityActionBaseSchema = z.object({
  priority: z.number().int(),
  category: z.string(),
  effort: z.enum(['low', 'medium', 'high']),
  action: z.string(),
  reason: z.string(),
  whyItMatters: z.string(),
  steps: z.array(z.string()),
  outcome: z.string(),
  competitorReference: z.string().nullable(),
  estimatedImpact: z.enum(['high', 'medium']),
  timeframe: z.string(),
});

export const priorityActionsSchema = z.array(priorityActionBaseSchema);

/** Mirrors `PRIORITY_SCHEMA_WITH_CONTINUITY`. */
export const priorityActionsWithContinuitySchema = z.array(
  priorityActionBaseSchema.extend({ continuityNote: z.string().nullable() }),
);

/** Mirrors the patch prompt in `validateActionsHybrid`. */
export const validationPatchesSchema = z.object({
  patches: z.array(
    z.object({
      actionIndex: z.number().int(),
      field: z.string(),
      newValue: z.string().nullable(),
    }),
  ),
});

/** Mirrors the change-summary prompt in `generateChangeSummary`. */
export const changeSummarySchema = z.object({
  hasSignificantChanges: z.boolean(),
  severity: z.enum(['high', 'medium', 'low']),
  summary: z.string(),
  changes: z.array(
    z.object({
      category: z.string(),
      description: z.string(),
      significance: z.string(),
      actionItem: z.string().nullable(),
    }),
  ),
});

/** Mirrors the extraction prompt in `extractMentionedBusinesses`. */
export const mentionedBusinessesSchema = z.array(
  z.object({
    name: z.string(),
    position: z.number().int(),
    context: z.enum(['recommended', 'mentioned', 'compared', 'dismissed']),
  }),
);
