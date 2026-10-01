/**
 * Copy style checks from CLAUDE.md for user-readable text: no dashes or arrows
 * as punctuation, and UK spelling. Used by tests over template copy and by
 * scripts/eval-action-plan.ts over generated plans.
 */
export type CopyIssue = { kind: 'dash' | 'us-spelling'; match: string };

// Em dash, en dash, arrow, or a hyphen with spaces either side standing in for a dash.
const DASH = /[—–→]| - /g;

// Word starts that are only ever US spellings. Kept to stems with no common UK
// look-alike: "size", "prize" and "meter" (a gas meter) must not match.
const US_SPELLING = new RegExp(
  String.raw`\b(?:` +
    [
      'organiz',
      'personaliz',
      'optimiz',
      'prioritiz',
      'customiz',
      'recogniz',
      'specializ',
      'summariz',
      'categoriz',
      'maximiz',
      'minimiz',
      'utiliz',
      'emphasiz',
      'analyz',
      'apologiz',
      'realiz',
      'colors?\\b',
      'colored',
      'favorites?\\b',
      'behaviors?\\b',
      'honors?\\b',
      'neighbors?\\b',
      'centers?\\b',
      'theaters?\\b',
      'inquir',
      'catalogs?\\b',
      'canceled',
      'traveled',
      'labeled',
      'modeling',
      'fulfill\\b',
      'enroll\\b',
      'jewelry',
      'gray\\b',
      'defense',
    ].join('|') +
    String.raw`)[a-z]*`,
  'gi',
);

export function lintCopy(text: string): CopyIssue[] {
  const issues: CopyIssue[] = [];
  for (const m of text.matchAll(DASH)) issues.push({ kind: 'dash', match: m[0] });
  for (const m of text.matchAll(US_SPELLING)) issues.push({ kind: 'us-spelling', match: m[0] });
  return issues;
}
