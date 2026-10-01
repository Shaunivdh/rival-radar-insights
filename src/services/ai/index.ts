/**
 * Public surface of the AI service. The implementation is split by concern
 * across this folder and every call routes through `callLLMRaw` in `./client`.
 * Import from `@/services/ai`; the sibling modules are internal.
 *
 * `__tests__/ai.barrel.test.ts` locks this list.
 */
export { AIUnavailableError, TruncatedOutputError, callLLMRaw, classifyAIFailure } from './client';
export type { AIFailureKind } from './client';
export { generateReviewSentiment } from './extraction';
export { resolveEvidence, dropUngroundedActions } from './evidence';
// Type-only, so it does not widen the runtime surface the barrel test locks.
export type { EvidenceResolution } from './evidence';
export {
  AI_FILL_THRESHOLD,
  checkCategoryDistribution,
  generatePriorityActions,
  generatePriorityActionsWithHistory,
} from './actions';
export { generateChangeSummary } from './summary';
export {
  clearMentionsCache,
  checkAIVisibility,
  runVisibilityQuery,
  AI_PRESENCE_WINDOW,
} from './visibility';
