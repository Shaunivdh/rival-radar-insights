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

export interface FilteredDiff {
  hasChanges: boolean;
  /** Genuinely changed leaves, as "category.field" paths (e.g. "content.servicesListed"). */
  changedPaths: string[];
  /** Oscillating leaves suppressed from the diff, as "category.field" paths. */
  suppressedPaths: string[];
  /** Copy of `current` with oscillating leaf values reverted to the `previous` value,
   *  so downstream consumers (AI summary, confirmation compare) never see them. */
  filteredCurrent: ExtractedSignals;
}

/**
 * Leaf-level diff with oscillation suppression.
 *
 * Extraction is not perfectly deterministic scan-to-scan (partial renders, popup
 * variance), which produces flip-flopping values that read as "added"/"removed"
 * alerts. A changed leaf whose NEW value already appeared in any of the `history`
 * snapshots is oscillation, not a real site change — it is reverted silently.
 *
 * `history` should be confirmed snapshots older than `previous` (typically ~4).
 */
export function suppressOscillatingChanges(
  previous: ExtractedSignals,
  current: ExtractedSignals,
  history: ExtractedSignals[],
): FilteredDiff {
  const changedPaths: string[] = [];
  const suppressedPaths: string[] = [];
  const filteredCurrent = JSON.parse(JSON.stringify(current)) as ExtractedSignals;

  for (const category of Object.keys(current) as (keyof ExtractedSignals)[]) {
    if (DIFF_SKIP_FIELDS.has(category)) continue;
    // Same rule as diffSignals: categories absent from the previous snapshot are
    // schema additions, never "changed from nothing"
    if (previous[category] === undefined || previous[category] === null) continue;

    const prevCat = previous[category] as unknown as Record<string, unknown>;
    const currCat = current[category] as unknown as Record<string, unknown>;
    const filteredCat = filteredCurrent[category] as unknown as Record<string, unknown>;
    const leaves = new Set([...Object.keys(prevCat ?? {}), ...Object.keys(currCat ?? {})]);

    for (const leaf of leaves) {
      const prevVal = JSON.stringify(prevCat?.[leaf]);
      const currVal = JSON.stringify(currCat?.[leaf]);
      if (prevVal === currVal) continue;

      const seenBefore = history.some(
        (h) =>
          JSON.stringify(
            (h[category] as unknown as Record<string, unknown> | undefined)?.[leaf],
          ) === currVal,
      );
      if (seenBefore) {
        suppressedPaths.push(`${category}.${leaf}`);
        if (prevCat?.[leaf] === undefined) delete filteredCat[leaf];
        else filteredCat[leaf] = prevCat[leaf];
      } else {
        changedPaths.push(`${category}.${leaf}`);
      }
    }
  }

  return { hasChanges: changedPaths.length > 0, changedPaths, suppressedPaths, filteredCurrent };
}

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
