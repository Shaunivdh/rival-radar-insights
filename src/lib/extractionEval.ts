/**
 * Ground-truth extraction eval (accuracy plan §5).
 *
 * Fixtures live in `scripts/fixtures/sites/<slug>.html` + `<slug>.expected.json`.
 * The deterministic path (vitest) runs `parseHtmlSignals` → `extractSignals` with
 * no AI; the full path (`scripts/eval-extraction.ts`) adds Haiku extraction on top,
 * merged exactly as the orchestrator does.
 */
import { parseHtmlSignals, mergePageSignals } from '@/lib/crawl/html-parser';
import { extractSignals } from '@/services/extract';
import type { ExtractedSignals, RawCrawlResult } from '@/types';

/** Hand-labelled truth for one fixture homepage. */
export interface ExpectedSignals {
  /** Exact homepage h1 text, or null when the homepage has no h1. */
  homepageH1: string | null;
  /** Every distinct service named on the page (≥5 for a service business). */
  services: string[];
  /** Native <form> with inputs, or a known embedded form (HubSpot, Typeform, Jotform…). */
  hasContactForm: boolean;
  bookingProvider: string | null;
  socialLinks: string[];
  /** Union of accreditations, certifications and awards/memberships. */
  accreditations: string[];
  reviewPlatforms: string[];
  /** Whether /sitemap.xml exists — needs the network, not scored offline. */
  sitemap?: boolean;
}

export interface Fixture {
  slug: string;
  url: string;
  html: string;
  expected: ExpectedSignals;
}

export const LIST_FIELDS = [
  'services',
  'socialLinks',
  'accreditations',
  'reviewPlatforms',
] as const;
export const BOOL_FIELDS = ['homepageH1', 'hasContactForm', 'bookingProvider'] as const;
export type EvalField = (typeof LIST_FIELDS)[number] | (typeof BOOL_FIELDS)[number];

export interface Counts {
  tp: number;
  fp: number;
  fn: number;
}

export type FixtureScore = Record<EvalField, Counts>;

export interface FieldMetrics {
  field: EvalField;
  precision: number | null;
  recall: number | null;
  tp: number;
  fp: number;
  fn: number;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9&' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function listCounts(expected: string[], actual: string[]): Counts {
  const exp = new Set(expected.map(norm));
  const act = new Set(actual.map(norm));
  let tp = 0;
  for (const e of exp) if (act.has(e)) tp++;
  return { tp, fp: act.size - tp, fn: exp.size - tp };
}

function boolCounts(expected: boolean, actual: boolean): Counts {
  if (expected && actual) return { tp: 1, fp: 0, fn: 0 };
  if (expected && !actual) return { tp: 0, fp: 0, fn: 1 };
  if (!expected && actual) return { tp: 0, fp: 1, fn: 0 };
  return { tp: 0, fp: 0, fn: 0 };
}

/** Build the single-page RawCrawlResult the pipeline would see for a fixture homepage. */
export function fixtureToRawResult(
  fixture: Fixture,
  aiJson: Record<string, unknown> = {},
): RawCrawlResult {
  const parsed = parseHtmlSignals(fixture.html, fixture.url);
  return {
    status: 'completed',
    pages: [{ url: fixture.url, html: fixture.html, json: mergePageSignals(aiJson, parsed) }],
  };
}

/** Deterministic-only extraction (no AI), mirroring the orchestrator merge. */
export async function extractDeterministic(fixture: Fixture): Promise<ExtractedSignals> {
  return extractSignals(fixtureToRawResult(fixture));
}

/** Extraction with an AI page-JSON blob supplied by the caller (full-path eval). */
export async function extractWithAI(
  fixture: Fixture,
  aiJson: Record<string, unknown>,
): Promise<ExtractedSignals> {
  return extractSignals(fixtureToRawResult(fixture, aiJson));
}

export function scoreFixture(expected: ExpectedSignals, actual: ExtractedSignals): FixtureScore {
  const h1Expected = expected.homepageH1 !== null;
  const h1Actual =
    actual.seo.homepageH1Count == null
      ? actual.seo.h1Tags.length > 0
      : actual.seo.homepageH1Count > 0;
  const trustUnion = [
    ...actual.trust.accreditations,
    ...actual.trust.certifications,
    ...actual.trust.awardsAndMemberships,
  ];
  return {
    homepageH1: boolCounts(h1Expected, h1Actual),
    hasContactForm: boolCounts(expected.hasContactForm, actual.engagement.hasContactForm),
    bookingProvider: boolCounts(
      expected.bookingProvider !== null,
      actual.engagement.bookingProvider !== null &&
        (expected.bookingProvider === null ||
          norm(actual.engagement.bookingProvider) === norm(expected.bookingProvider)),
    ),
    services: listCounts(expected.services, actual.content.servicesListed),
    socialLinks: listCounts(expected.socialLinks, actual.engagement.socialLinksPresent),
    accreditations: listCounts(expected.accreditations, trustUnion),
    reviewPlatforms: listCounts(expected.reviewPlatforms, actual.trust.reviewPlatformsLinked),
  };
}

export function aggregate(scores: FixtureScore[]): FieldMetrics[] {
  const fields: EvalField[] = [...BOOL_FIELDS, ...LIST_FIELDS];
  return fields.map((field) => {
    const c = scores.reduce(
      (acc, s) => ({
        tp: acc.tp + s[field].tp,
        fp: acc.fp + s[field].fp,
        fn: acc.fn + s[field].fn,
      }),
      { tp: 0, fp: 0, fn: 0 },
    );
    const precision = c.tp + c.fp > 0 ? c.tp / (c.tp + c.fp) : null;
    const recall = c.tp + c.fn > 0 ? c.tp / (c.tp + c.fn) : null;
    return { field, precision, recall, ...c };
  });
}

function pct(v: number | null): string {
  return v === null ? '   n/a' : `${(v * 100).toFixed(0).padStart(5)}%`;
}

export function formatTable(metrics: FieldMetrics[], title: string): string {
  const lines = [
    `${title}`,
    `${'field'.padEnd(16)} ${'precision'.padStart(9)} ${'recall'.padStart(9)}   tp  fp  fn`,
  ];
  for (const m of metrics) {
    lines.push(
      `${m.field.padEnd(16)} ${pct(m.precision).padStart(9)} ${pct(m.recall).padStart(9)}  ${String(m.tp).padStart(3)} ${String(m.fp).padStart(3)} ${String(m.fn).padStart(3)}`,
    );
  }
  return lines.join('\n');
}

/** Per-fixture misses and false positives, for debugging a regression. */
export function describeMisses(fixture: Fixture, actual: ExtractedSignals): string[] {
  const out: string[] = [];
  const e = fixture.expected;
  const h1Count = actual.seo.homepageH1Count ?? actual.seo.h1Tags.length;
  if ((e.homepageH1 !== null) !== h1Count > 0)
    out.push(`homepageH1: expected ${JSON.stringify(e.homepageH1)}, got count ${h1Count}`);
  if (e.hasContactForm !== actual.engagement.hasContactForm)
    out.push(
      `hasContactForm: expected ${e.hasContactForm}, got ${actual.engagement.hasContactForm}`,
    );
  if ((e.bookingProvider ?? null) !== (actual.engagement.bookingProvider ?? null))
    out.push(
      `bookingProvider: expected ${e.bookingProvider}, got ${actual.engagement.bookingProvider}`,
    );
  const lists: Array<[string, string[], string[]]> = [
    ['services', e.services, actual.content.servicesListed],
    ['socialLinks', e.socialLinks, actual.engagement.socialLinksPresent],
    [
      'accreditations',
      e.accreditations,
      [
        ...actual.trust.accreditations,
        ...actual.trust.certifications,
        ...actual.trust.awardsAndMemberships,
      ],
    ],
    ['reviewPlatforms', e.reviewPlatforms, actual.trust.reviewPlatformsLinked],
  ];
  for (const [name, exp, act] of lists) {
    const actSet = new Set(act.map(norm));
    const expSet = new Set(exp.map(norm));
    const missed = exp.filter((x) => !actSet.has(norm(x)));
    const extra = act.filter((x) => !expSet.has(norm(x)));
    if (missed.length) out.push(`${name} missed: ${missed.join(' | ')}`);
    if (extra.length) out.push(`${name} extra: ${extra.join(' | ')}`);
  }
  return out;
}
