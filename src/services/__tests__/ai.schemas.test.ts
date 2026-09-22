/**
 * One test per zod schema in `ai.schemas.ts`, each fed a payload of the shape
 * the existing AI tests already assert against (ai.changeSummary.test.ts,
 * ai.pipeline.test.ts) so the mirrors stay honest about real LLM output.
 *
 * A failure here means a schema drifted from its prompt — fix the schema or the
 * prompt, don't loosen the fixture.
 */
import { describe, it, expect } from 'vitest';
import {
  reviewSentimentSchema,
  priorityActionsSchema,
  priorityActionsWithContinuitySchema,
  validationPatchesSchema,
  changeSummarySchema,
  mentionedBusinessesSchema,
} from '@/services/ai.schemas';

/** Shape returned by the generation prompts (`PRIORITY_SCHEMA_BASE`). */
const llmAction = {
  priority: 1,
  category: 'AI Visibility',
  effort: 'medium',
  action: 'Get listed in AI recommendations',
  reason: 'AI assistants do not mention you yet',
  whyItMatters:
    'More people use AI to find local services. Your AI presence score is 20, meaning most AI tools skip you entirely.',
  steps: [
    'Claim your listing on major directories',
    'Add structured data to your site',
    'Encourage reviews mentioning your services',
  ],
  outcome: 'Appear in AI recommendations',
  competitorReference: null,
  estimatedImpact: 'high',
  timeframe: '2-4 weeks',
};

describe('ai.schemas', () => {
  it('reviewSentimentSchema accepts a sentiment payload', () => {
    const result = reviewSentimentSchema.safeParse({
      positiveThemes: ['Fast response', 'Friendly staff', 'Fair pricing'],
      negativeThemes: ['Late arrivals'],
      summary: 'Customers praise speed and friendliness, some note late arrivals.',
    });
    expect(result.success).toBe(true);
  });

  it('priorityActionsSchema accepts a generated action list', () => {
    const result = priorityActionsSchema.safeParse([
      llmAction,
      { ...llmAction, priority: 2, category: 'Reviews', effort: 'low', estimatedImpact: 'medium' },
    ]);
    expect(result.success).toBe(true);
  });

  it('priorityActionsWithContinuitySchema accepts actions carrying continuityNote', () => {
    const result = priorityActionsWithContinuitySchema.safeParse([
      { ...llmAction, continuityNote: 'Still outstanding from last week' },
      { ...llmAction, priority: 2, continuityNote: null },
    ]);
    expect(result.success).toBe(true);
  });

  it('validationPatchesSchema accepts a fact-checker patch set', () => {
    const result = validationPatchesSchema.safeParse({
      patches: [
        {
          actionIndex: 0,
          field: 'whyItMatters',
          newValue:
            'Bob Plumbing received 12 reviews this month while you received none. Fresh reviews help you rank higher.',
        },
        { actionIndex: 1, field: 'competitorReference', newValue: null },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('changeSummarySchema accepts a change summary', () => {
    const result = changeSummarySchema.safeParse({
      hasSignificantChanges: true,
      severity: 'medium',
      summary: 'Competitor launched a blog — they may pull search traffic.',
      changes: [
        {
          category: 'Content',
          description: 'Competitor added a blog.',
          significance: 'medium',
          actionItem: 'Consider starting your own blog focused on local search terms.',
        },
        {
          category: 'Trust',
          description: 'New CIPHE accreditation added.',
          significance: 'high',
          actionItem: null,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('mentionedBusinessesSchema accepts an extracted mention list', () => {
    const result = mentionedBusinessesSchema.safeParse([
      { name: 'AquaFix Plumbing', position: 1, context: 'recommended' },
      { name: 'DrainMaster', position: 2, context: 'compared' },
    ]);
    expect(result.success).toBe(true);
  });
});
