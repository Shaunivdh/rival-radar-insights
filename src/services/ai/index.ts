/**
 * Public surface of the AI service. The implementation is split by concern
 * across this folder and every call routes through `callLLMRaw` in `./client`.
 * Import from `@/services/ai`; the sibling modules are internal.
 *
 * `__tests__/ai.barrel.test.ts` locks this list.
 */
export { AIUnavailableError, TruncatedOutputError, callLLMRaw } from './client';
export {
  prepareHtmlForExtraction,
  extractPageSignals,
  generateReviewSentiment,
} from './extraction';
export { resolveEvidence, dropUngroundedActions } from './evidence';
export {
  checkCategoryDistribution,
  generatePriorityActions,
  generatePriorityActionsWithHistory,
} from './actions';
export { generateChangeSummary } from './summary';
export { clearMentionsCache, checkAIVisibility, AI_PRESENCE_WINDOW } from './visibility';
