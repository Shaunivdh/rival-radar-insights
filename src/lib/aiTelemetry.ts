export interface AIEvent {
  event:
    | 'generation'
    | 'validation'
    | 'visibility'
    | 'sentiment'
    | 'change_summary'
    | 'change_summary_skipped'
    | 'extract_signals'
    | 'schema_shadow';
  model: string;
  success: boolean;
  durationMs: number;
  serviceCategory?: string;
  flagsFound?: number;
  mentionConfidence?: 'exact' | 'high' | 'medium' | 'low' | 'none';
  errorType?: string;
  /** schema_shadow only: which askClaude call site produced the mismatch. */
  label?: string;
  /** schema_shadow only: JSON-stringified zod `error.flatten()`. */
  issues?: string;
  cacheHits?: number;
  templatesUsed?: number;
  templatesFired?: string[];
}

/**
 * Emit a structured log line for every AI call so we can later answer
 * questions like "which industry produces the worst priority actions"
 * or "how often does the validator find issues." The [ai-event] prefix
 * makes these lines grep-able in any log aggregator.
 */
export function logAIEvent(event: AIEvent): void {
  console.log(`[ai-event] ${JSON.stringify(event)}`);
}
