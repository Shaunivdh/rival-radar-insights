import type { ExtractedSignals, SignalDiff } from '@/types';

export function diffSignals(previous: ExtractedSignals, current: ExtractedSignals): SignalDiff {
  const changedFields: string[] = [];
  const before: Partial<ExtractedSignals> = {};
  const after: Partial<ExtractedSignals> = {};

  for (const key of Object.keys(current) as (keyof ExtractedSignals)[]) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(current[key])) {
      changedFields.push(key);
      (before as any)[key] = previous[key];
      (after as any)[key] = current[key];
    }
  }

  return {
    hasChanges: changedFields.length > 0,
    changedFields,
    before,
    after,
  };
}
