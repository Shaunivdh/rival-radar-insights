import type { ExtractedSignals, PriorityAction, Business } from '@/types';
import { logAIEvent } from '@/lib/aiTelemetry';
import { VALIDATION_PATCHES_SCHEMA } from '../aiSchemas';
import { logger } from '@/lib/logger';
import { AI_MODEL_SMART, SKIP_AI, askClaude, errorTypeOf } from './client';
import { CATEGORY_SCORE_MAP_FULL } from './businessView';
import { resolveEvidence } from './evidence';

const SCOUTLY_FACT_CHECKER_SYSTEM = `You are Scoutly's fact-checker. Your only job is to fix flagged issues in already-generated priority actions with the smallest possible text change. You never invent new facts, you never rewrite well-formed sentences, and you never patch unflagged fields. Output valid JSON matching the schema in the user prompt and nothing else. Never use dash punctuation (em dash, en dash, or hyphen as a dash) in patched text; if a flagged sentence contains one, replace it with a comma, colon, or full stop.`;

/** Action category → relevant signal buckets, used to scope competitor signals sent to the validator. */
const CATEGORY_SIGNAL_BUCKETS: Record<string, Array<keyof ExtractedSignals>> = {
  Reviews: ['trust'],
  'Local SEO': ['seo'],
  Website: ['seo', 'engagement', 'content'],
  Trust: ['trust'],
  'AI Visibility': ['seo', 'content'],
  Conversion: ['engagement', 'content'],
};

interface ValidationFlag {
  actionIndex: number;
  type:
    | 'unverified_average'
    | 'recommends_existing'
    | 'score_contradiction'
    | 'self_contradiction'
    | 'evidence_mismatch';
  detail: string;
}

// ── Existence checks (generated from the signal shape) ───────────────
// Every boolean `hasX` / `xExists` / `xMentioned` maps to "add/set up/create X"
// phrases; every non-empty array maps to "add/list/get" + item. Replaces the
// four hand-written entries so contact form, FAQ, blog, schema, social links,
// newsletter and team page are all covered.

const FLAG_SIGNAL_LABELS: Record<string, string[]> = {
  'engagement.hasContactForm': ['contact form', 'enquiry form', 'inquiry form', 'web form'],
  'engagement.hasBookingSystem': ['booking system', 'online booking', 'booking'],
  'engagement.hasPhoneNumberProminent': ['phone number', 'your phone'],
  'engagement.hasCallToAction': ['call to action', 'call-to-action', 'cta'],
  'engagement.hasNewsletterSignup': ['newsletter', 'mailing list', 'email signup', 'email sign-up'],
  'content.hasBlog': ['blog', 'news section', 'articles section'],
  'content.hasFAQ': ['faq', 'faqs', 'frequently asked questions'],
  'content.hasPortfolio': ['portfolio', 'gallery', 'case studies'],
  'trust.teamPageExists': ['team page', 'meet the team page', 'about page', 'about us page'],
  'trust.insuranceMentioned': ['insurance details', 'insurance information', 'insurance'],
  'seo.hasSitemap': ['sitemap'],
  'seo.hasRobotsTxt': ['robots.txt'],
  'seo.canonicalTagsPresent': ['canonical tag', 'canonical tags'],
};

const ARRAY_SIGNAL_LABELS: Record<string, string> = {
  'trust.accreditations': 'accreditation',
  'trust.certifications': 'certification',
  'trust.awardsAndMemberships': 'award or membership',
  'trust.reviewPlatformsLinked': 'review platform',
  'trust.guaranteesMentioned': 'guarantee',
  'content.servicesListed': 'service',
  'content.serviceAreasMentioned': 'service area',
  'engagement.socialLinksPresent': 'social link',
  'seo.schemaMarkupTypes': 'schema markup',
};

const ADD_VERBS = [
  'add',
  'set up',
  'setup',
  'create',
  'install',
  'enable',
  'build',
  'launch',
  'start',
];
const LIST_VERBS = ['add', 'get', 'obtain', 'pursue', 'list', 'offer', 'link', 'join', 'display'];

// These match weakness/strength language only when it appears near competitor
// references, to reduce false positives on neutral phrases like "maintain your rating".
const WEAKNESS_RE = /\b(weak|poor|lacking|behind|falling|low|missing)\b|\bno\s/;
const STRENGTH_RE = /\b(strong|maintain|active|consistent|leading)\b/;
const COMPETITOR_WEAKNESS_RE = /\b(zero|lack|none)\b|\bno\s|\b0\s/;

/**
 * Test whether `pattern` matches within ~50 characters of a competitor reference.
 * Returns the first match found, or null.
 */
function matchesNearCompetitor(
  text: string,
  pattern: RegExp,
  competitorNames: string[],
): RegExpMatchArray | null {
  const lower = text.toLowerCase();
  const anchors = [
    'competitor',
    'competitors',
    'rival',
    'rivals',
    ...competitorNames.map((n) => n.toLowerCase()),
  ];

  for (const anchor of anchors) {
    let searchFrom = 0;

    while (true) {
      const pos = lower.indexOf(anchor, searchFrom);
      if (pos === -1) break;
      const start = Math.max(0, pos - 50);
      const end = Math.min(lower.length, pos + anchor.length + 50);
      const window = lower.slice(start, end);
      const m = pattern.exec(window);
      if (m) return m;
      searchFrom = pos + 1;
    }
  }

  return null;
}

const ALLOWED_PATCH_FIELDS = new Set([
  'action',
  'reason',
  'whyItMatters',
  'competitorReference',
  'timeframe',
  'outcome',
]);
/** Subset of ALLOWED_PATCH_FIELDS where null is also valid. All others require a string. */
const NULLABLE_PATCH_FIELDS = new Set(['competitorReference']);

type ExistenceCheck =
  | {
      kind: 'list';
      signalPath: (b: Business) => string[] | null | undefined;
      keywords: string[];
      label: string;
    }
  | { kind: 'flag'; signalPath: (b: Business) => boolean; pattern: RegExp; label: string };

function signalAt(b: Business, dotted: string): unknown {
  const [bucket, key] = dotted.split('.');
  const sig = b.signals as Record<string, Record<string, unknown>> | null | undefined;
  return sig?.[bucket]?.[key];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildExistenceChecks(): ExistenceCheck[] {
  const checks: ExistenceCheck[] = [];
  for (const [dotted, label] of Object.entries(ARRAY_SIGNAL_LABELS)) {
    checks.push({
      kind: 'list',
      signalPath: (b) => signalAt(b, dotted) as string[] | null | undefined,
      keywords: LIST_VERBS,
      label,
    });
  }
  for (const [dotted, labels] of Object.entries(FLAG_SIGNAL_LABELS)) {
    const verbs = ADD_VERBS.map(escapeRe).join('|');
    const nouns = labels.map(escapeRe).join('|');
    checks.push({
      kind: 'flag',
      signalPath: (b) => signalAt(b, dotted) === true,
      // "add a contact form", "set up an online booking system", "create your FAQ page"
      pattern: new RegExp(`\\b(?:${verbs})\\b(?:\\s+\\w+){0,3}?\\s+(?:${nouns})\\b`, 'i'),
      label: labels[0],
    });
  }
  return checks;
}

const EXISTENCE_CHECKS: ExistenceCheck[] = buildExistenceChecks();

/**
 * Run fast, deterministic checks against priority actions to catch common
 * failure modes (unverified averages, recommending existing features,
 * score-vs-claim contradictions, internal contradictions) without an LLM call.
 * Returns an array of flags describing each issue found.
 */
function deterministicChecks(
  actions: PriorityAction[],
  own: Business,
  competitors: Business[],
): ValidationFlag[] {
  const flags: ValidationFlag[] = [];

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const text = [a.action, a.reason, a.whyItMatters, a.competitorReference, a.outcome]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    // (a) unverified_average — regex for average claims
    if (/competitors?\s+average|on average|industry average/.test(text)) {
      flags.push({
        actionIndex: i,
        type: 'unverified_average',
        detail: `Action "${a.action}" references an unverified average`,
      });
    }

    // (b) recommends_existing — check signals the business already has
    // Templates are trusted by construction; skip existence checks for them.
    if (a._source !== 'template') {
      let existenceFlags = 0;
      for (const check of EXISTENCE_CHECKS) {
        if (existenceFlags >= 2) break;

        if (check.kind === 'list') {
          const items = check.signalPath(own);
          if (!items?.length) continue;
          for (const item of items) {
            const escaped = item.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`(${check.keywords.join('|')})\\s+.*?${escaped}`, 'i');
            if (pattern.test(text)) {
              flags.push({
                actionIndex: i,
                type: 'recommends_existing',
                detail: `Recommends adding "${item}" but business already has it (signal: ${check.label})`,
              });
              existenceFlags++;
              break; // one flag per check — avoid duplicates from multi-item matches
            }
          }
        } else {
          // flag check: skip if business doesn't have this feature
          if (!check.signalPath(own)) continue;
          const m = check.pattern.exec(text);
          if (m) {
            flags.push({
              actionIndex: i,
              type: 'recommends_existing',
              detail: `Recommends "${m[0]}" but business already has it (signal: ${check.label})`,
            });
            existenceFlags++;
          }
        }
      }

      // (b2) evidence_mismatch — cited path exists but the value differs from the data
      for (const ev of Array.isArray(a.evidence) ? a.evidence : []) {
        const r = resolveEvidence(ev, own, competitors);
        if (!r.ok && r.reason === 'value_mismatch') {
          flags.push({
            actionIndex: i,
            type: 'evidence_mismatch',
            detail: `Cites "${ev}" but the data shows ${r.path}=${JSON.stringify(r.actual)}`,
          });
        }
      }
    }

    // (c) score_contradiction — high score but weakness language near competitor refs in whyItMatters
    const scoreField = CATEGORY_SCORE_MAP_FULL[a.category];
    if (scoreField && own.aiScore) {
      const score = own.aiScore[scoreField];
      if (typeof score === 'number' && score >= 85 && a.whyItMatters) {
        const compNames = competitors.map((c) => c.name);
        const weakMatch = matchesNearCompetitor(a.whyItMatters, WEAKNESS_RE, compNames);
        if (weakMatch) {
          const wim = a.whyItMatters.toLowerCase();
          const matchIdx = wim.indexOf(weakMatch[0].trim());
          const ctxStart = Math.max(0, matchIdx - 20);
          const ctxEnd = Math.min(wim.length, matchIdx + weakMatch[0].trim().length + 20);
          const context = wim.slice(ctxStart, ctxEnd);
          flags.push({
            actionIndex: i,
            type: 'score_contradiction',
            detail: `${a.category} score is ${score} (≥85) but whyItMatters uses weakness language ("...${context}...")`,
          });
        }
      }
    }

    // (d) self_contradiction — competitorReference weakness + whyItMatters strength
    if (a.competitorReference && a.whyItMatters) {
      const cr = a.competitorReference.toLowerCase();
      const wim = a.whyItMatters.toLowerCase();
      if (COMPETITOR_WEAKNESS_RE.test(cr) && STRENGTH_RE.test(wim)) {
        flags.push({
          actionIndex: i,
          type: 'self_contradiction',
          detail: `competitorReference implies weakness but whyItMatters implies strength`,
        });
      }
    }
  }

  return flags;
}

// Internal fields — never persisted or sent to clients.
function stripSource(actions: PriorityAction[]): PriorityAction[] {
  return actions.map(({ _source, evidence: _evidence, ...rest }) => rest);
}

/**
 * Hybrid validation: runs deterministic checks first, and only calls the LLM
 * when code-based checks find issues. When the LLM is needed, it receives only
 * the flagged actions and returns targeted patches rather than full rewrites.
 * Falls back to original actions if the LLM call fails.
 */
export async function validateActionsHybrid(
  actions: PriorityAction[],
  own: Business,
  competitors: Business[],
): Promise<PriorityAction[]> {
  if (SKIP_AI || !actions.length) return stripSource(actions);
  const t0 = Date.now();

  const flags = deterministicChecks(actions, own, competitors);

  if (flags.length === 0) {
    logger.info('validator', 'No issues found, skipping LLM');
    logAIEvent({
      event: 'validation',
      model: AI_MODEL_SMART,
      success: true,
      durationMs: Date.now() - t0,
      flagsFound: 0,
    });
    return stripSource(actions);
  }

  logger.info('validator', 'Issues found, requesting LLM patches', { flags: flags.length });

  const flaggedIndices = Array.from(new Set(flags.map((f) => f.actionIndex)));
  const flaggedActions = flaggedIndices.map((i) => ({ index: i, action: actions[i] }));

  // Build a per-competitor snapshot tailored to the flagged categories.
  // This keeps the prompt tight while still giving the validator the data it
  // needs to fact-check — e.g. googleRating/reviewCount for Reviews flags,
  // aiPresenceScore for AI Visibility flags.
  const flaggedCategories = new Set(flaggedIndices.map((i) => actions[i].category));
  const relevantBuckets = new Set<keyof ExtractedSignals>();
  for (const cat of flaggedCategories) {
    for (const b of CATEGORY_SIGNAL_BUCKETS[cat] ?? []) relevantBuckets.add(b);
  }
  const competitorContext = competitors.map((c) => {
    const ctx: Record<string, unknown> = { name: c.name };
    if (c.signals && relevantBuckets.size > 0) {
      const scoped: Partial<ExtractedSignals> = {};
      for (const b of relevantBuckets) {
        if (c.signals[b] != null) (scoped as Record<string, unknown>)[b] = c.signals[b];
      }
      ctx.signals = scoped;
    }
    if (flaggedCategories.has('Reviews')) {
      ctx.googleRating = c.googleData?.googleRating ?? null;
      ctx.reviewCount = c.googleData?.reviewCount ?? null;
    }
    if (flaggedCategories.has('AI Visibility')) {
      ctx.aiPresenceScore = c.aiVisibility?.aiPresenceScore ?? null;
    }
    return ctx;
  });

  const prompt = `The following actions have been flagged by automated checks. Fix ONLY the flagged issues with minimal text changes. Keep the original meaning where possible. Do not invent new facts.

Flags:
${flags.map((f) => `- Action ${f.actionIndex} (${f.type}): ${f.detail}`).join('\n')}

Flagged actions:
${JSON.stringify(flaggedActions, null, 2)}

Own business signals: ${JSON.stringify(own.signals)}
Competitor context (scoped to flagged categories): ${JSON.stringify(competitorContext)}

Return JSON only. Each patch fixes one field on one action.
Allowed fields: action, reason, whyItMatters, competitorReference, timeframe, outcome.
newValue must be a string for all fields EXCEPT competitorReference, which may also be null.
Schema: {"patches":[{"actionIndex":0,"field":"string","newValue":"string|null"}]}`;

  try {
    const result = await askClaude<{
      patches: Array<{ actionIndex: number; field: string; newValue: string | null }>;
    }>(prompt, VALIDATION_PATCHES_SCHEMA, {
      maxTokens: 1500,
      system: SCOUTLY_FACT_CHECKER_SYSTEM,
      model: AI_MODEL_SMART,
    });
    const patched = actions.map((a) => ({ ...a }));

    for (const patch of result.patches) {
      if (patch.actionIndex < 0 || patch.actionIndex >= actions.length) {
        logger.warn('validator', 'Skipping patch: invalid index', {
          actionIndex: patch.actionIndex,
        });
        continue;
      }
      if (!ALLOWED_PATCH_FIELDS.has(patch.field)) {
        logger.warn('validator', 'Skipping patch: disallowed field', { field: patch.field });
        continue;
      }
      const isString = typeof patch.newValue === 'string';
      const isNull = patch.newValue === null;
      if (!isString && !(isNull && NULLABLE_PATCH_FIELDS.has(patch.field))) {
        logger.warn('validator', 'Skipping patch: null newValue not allowed for this field', {
          field: patch.field,
        });
        continue;
      }
      logger.info('validator', 'Patching action', {
        actionIndex: patch.actionIndex,
        field: patch.field,
      });
      (patched[patch.actionIndex] as Record<string, unknown>)[patch.field] = patch.newValue;
    }

    logAIEvent({
      event: 'validation',
      model: AI_MODEL_SMART,
      success: true,
      durationMs: Date.now() - t0,
      flagsFound: flags.length,
    });
    return stripSource(patched);
  } catch (e) {
    logAIEvent({
      event: 'validation',
      model: AI_MODEL_SMART,
      success: false,
      durationMs: Date.now() - t0,
      flagsFound: flags.length,
      errorType: errorTypeOf(e),
    });
    logger.warn('validator', 'LLM patch call failed, returning original actions', { error: e });
    return stripSource(actions);
  }
}
