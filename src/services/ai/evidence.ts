import type { Business, PriorityAction } from '@/types';
import { logger } from '@/lib/logger';
import { summariseBiz } from './businessView';

// ── Evidence grounding ───────────────────────────────────────────────
// Every LLM action must cite the data it used ("own.signals.engagement.hasContactForm=false").
// The code resolves each path against the real objects: a path that does not exist
// drops the action; a value that does not match is flagged for the fact-checker.

type EvidenceResolution =
  | { ok: true; path: string }
  | { ok: false; path: string; reason: 'missing_path' | 'value_mismatch'; actual?: unknown };

function walkPath(root: unknown, segments: string[]): { found: boolean; value: unknown } {
  let cur: unknown = root;
  for (const seg of segments) {
    if (cur == null || typeof cur !== 'object') return { found: false, value: undefined };
    if (!(seg in (cur as object))) return { found: false, value: undefined };
    cur = (cur as Record<string, unknown>)[seg];
  }
  return { found: true, value: cur };
}

function evidenceValueMatches(actual: unknown, expected: string): boolean {
  const exp = expected.trim();
  if (exp === '') return true;
  if (exp === 'null') return actual == null;
  if (exp === 'true' || exp === 'false') return actual === (exp === 'true');
  if (typeof actual === 'number') {
    const n = Number(exp);
    return Number.isFinite(n) && Math.abs(n - actual) < 0.051;
  }
  if (Array.isArray(actual)) {
    if (exp === '[]') return actual.length === 0;
    try {
      const parsed = JSON.parse(exp);
      if (Array.isArray(parsed)) {
        return parsed.every((p) =>
          actual.some((a) => String(a).toLowerCase() === String(p).toLowerCase()),
        );
      }
    } catch {
      /* not JSON — fall through to single-item check */
    }
    const item = exp.replace(/^["']|["']$/g, '').toLowerCase();
    return actual.some((a) => String(a).toLowerCase() === item);
  }
  if (actual == null) return false;
  const a = String(actual).toLowerCase();
  const e = exp.replace(/^["']|["']$/g, '').toLowerCase();
  return a === e || a.includes(e);
}

/**
 * Resolve one evidence string against the real data. Paths are tried against
 * the summarised view the model was shown (`summariseBiz`) and the raw
 * `Business` object, so both "own.scores.reputation=70" and
 * "own.aiScore.reputationScore=70" resolve. Exported for unit tests.
 */
export function resolveEvidence(
  evidence: string,
  own: Business,
  competitors: Business[],
): EvidenceResolution {
  const eqIdx = evidence.indexOf('=');
  const path = (eqIdx === -1 ? evidence : evidence.slice(0, eqIdx)).trim();
  const expected = eqIdx === -1 ? '' : evidence.slice(eqIdx + 1);
  const segments = path.split('.').filter(Boolean);
  if (segments.length < 2) return { ok: false, path, reason: 'missing_path' };

  let roots: unknown[] = [];
  let rest: string[] = [];
  const head = segments[0].toLowerCase();
  if (head === 'own') {
    roots = [summariseBiz(own, true), own];
    rest = segments.slice(1);
  } else if (head === 'competitor' || head === 'competitors') {
    // Competitor names may contain dots — try progressively longer name joins.
    for (let n = 1; n < segments.length && roots.length === 0; n++) {
      const name = segments
        .slice(1, 1 + n)
        .join('.')
        .toLowerCase();
      const comp = competitors.find((c) => c.name.toLowerCase() === name);
      if (comp) {
        roots = [summariseBiz(comp, false), comp];
        rest = segments.slice(1 + n);
      }
    }
    if (roots.length === 0) return { ok: false, path, reason: 'missing_path' };
  } else {
    return { ok: false, path, reason: 'missing_path' };
  }
  if (rest.length === 0) return { ok: false, path, reason: 'missing_path' };

  let lastActual: unknown;
  let found = false;
  for (const root of roots) {
    const r = walkPath(root, rest);
    if (!r.found) continue;
    found = true;
    lastActual = r.value;
    if (evidenceValueMatches(r.value, expected)) return { ok: true, path };
  }
  if (!found) return { ok: false, path, reason: 'missing_path' };
  return { ok: false, path, reason: 'value_mismatch', actual: lastActual };
}

/**
 * Drop LLM actions whose evidence cites a path that does not exist in the data.
 * Value mismatches are kept and flagged later by `deterministicChecks`.
 */
export function dropUngroundedActions(
  actions: PriorityAction[],
  own: Business,
  competitors: Business[],
): PriorityAction[] {
  return actions.filter((a) => {
    const evidence = Array.isArray(a.evidence) ? a.evidence : [];
    for (const ev of evidence) {
      const r = resolveEvidence(ev, own, competitors);
      if (!r.ok && r.reason === 'missing_path') {
        logger.warn('evidence', 'Dropping action — path not in data', {
          action: a.action,
          path: r.path,
        });
        return false;
      }
    }
    return true;
  });
}
