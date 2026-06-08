export interface AIEvent {
  event:
    | 'generation'
    | 'validation'
    | 'visibility'
    | 'sentiment'
    | 'change_summary'
    | 'change_summary_skipped'
    | 'extract_signals';
  model: string;
  success: boolean;
  durationMs: number;
  serviceCategory?: string;
  flagsFound?: number;
  mentionConfidence?: 'exact' | 'high' | 'medium' | 'low' | 'none';
  errorType?: string;
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
