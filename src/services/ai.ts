/**
 * Barrel for the AI service. The implementation lives in `src/services/ai/`,
 * split by concern; every call still routes through `callLLMRaw` in
 * `ai/client.ts`. Import from `@/services/ai` so the split stays internal.
 */
export { AIUnavailableError, TruncatedOutputError, callLLMRaw } from './ai/client';
export {
  prepareHtmlForExtraction,
  extractPageSignals,
  generateReviewSentiment,
} from './ai/extraction';
export { resolveEvidence, dropUngroundedActions } from './ai/evidence';
export {
  checkCategoryDistribution,
  generatePriorityActions,
  generatePriorityActionsWithHistory,
} from './ai/actions';
export { generateChangeSummary } from './ai/summary';
export { clearMentionsCache, checkAIVisibility, AI_PRESENCE_WINDOW } from './ai/visibility';
