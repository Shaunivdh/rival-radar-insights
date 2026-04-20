import type { ExtractedSignals, SignalDiff } from '@/types';

/**
 * Fields listed here are excluded from change detection.
 *
 * Use this when:
 * - A new field is added to ExtractedSignals (add it here until customers have 2 snapshots with it)
 * - Extraction logic for a field changes (add it here for one crawl cycle to suppress false positives)
 *
 * Remove entries once all customers have a baseline snapshot that includes the field.
 */
const DIFF_SKIP_FIELDS = new Set<string>([
  // example: 'sectorSpecific',
]);

export function diffSignals(previous: ExtractedSignals, current: ExtractedSignals): SignalDiff {
  const changedFields: string[] = [];
  const before: Partial<ExtractedSignals> = {};
  const after: Partial<ExtractedSignals> = {};

  for (const key of Object.keys(current) as (keyof ExtractedSignals)[]) {
    // Skip fields explicitly suppressed (new additions or logic changes)
    if (DIFF_SKIP_FIELDS.has(key)) continue;

    // Skip fields that didn't exist in the previous snapshot — new schema additions
    // should never generate a "changed from nothing" alert
    if (previous[key] === undefined || previous[key] === null) continue;

    // Skip if value is unchanged
    if (JSON.stringify(previous[key]) !== JSON.stringify(current[key])) {
      changedFields.push(key);
      (before as Record<string, unknown>)[key] = previous[key];
      (after as Record<string, unknown>)[key] = current[key];
    }
  }

  return {
    hasChanges: changedFields.length > 0,
    changedFields,
    before,
    after,
  };
}
