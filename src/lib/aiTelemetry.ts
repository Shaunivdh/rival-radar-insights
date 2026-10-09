import { logger } from '@/lib/logger';

export interface AIEvent {
  event:
    | 'generation'
    | 'validation'
    | 'visibility'
    | 'sentiment'
    | 'change_summary'
    | 'change_summary_skipped'
    | 'usage';
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
  /** Call-site label passed to callLLMRaw, e.g. 'ai-presence'. */
  label?: string;
  // Token counts. Not named "*Tokens": the logger redacts any field matching /token/i.
  usageIn?: number;
  usageOut?: number;
  usageCacheRead?: number;
  webSearchRequests?: number;
}

/**
 * Emit a structured log line for every AI call so we can later answer
 * questions like "which industry produces the worst priority actions"
 * or "how often does the validator find issues." The [ai-event] prefix
 * makes these lines grep-able in any log aggregator.
 */
export function logAIEvent(event: AIEvent): void {
  logger.info('ai-event', event.event, { ...event });
}
