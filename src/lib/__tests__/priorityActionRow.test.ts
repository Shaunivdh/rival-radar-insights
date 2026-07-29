import { describe, it, expect } from 'vitest';
import { mapPriorityActionRow } from '@/lib/priorityActionRow';

describe('mapPriorityActionRow', () => {
  it('maps a fully-populated DB row to camelCase', () => {
    const row = {
      id: 'a1',
      priority: 2,
      status: 'snoozed',
      category: 'Reviews',
      action: 'Ask for reviews',
      reason: 'Low count',
      why_it_matters: 'Reviews build trust.',
      steps: ['Ask 3 customers'],
      effort: 'low',
      outcome: 'More reviews',
      competitor_reference: 'Bob has 12',
      estimated_impact: 'high',
      timeframe: '1 week',
      note: 'follow up',
      actioned_at: '2026-07-01T00:00:00Z',
      continuity_note: 'Still outstanding',
    };

    expect(mapPriorityActionRow(row)).toEqual({
      id: 'a1',
      priority: 2,
      status: 'snoozed',
      category: 'Reviews',
      action: 'Ask for reviews',
      reason: 'Low count',
      whyItMatters: 'Reviews build trust.',
      steps: ['Ask 3 customers'],
      effort: 'low',
      outcome: 'More reviews',
      competitorReference: 'Bob has 12',
      estimatedImpact: 'high',
      timeframe: '1 week',
      note: 'follow up',
      actionedAt: '2026-07-01T00:00:00Z',
      continuityNote: 'Still outstanding',
    });
  });

  it('fills defaults for missing optional columns', () => {
    const mapped = mapPriorityActionRow({
      id: 'a2',
      priority: 1,
      category: 'Website',
      action: 'Add H1',
      reason: 'No heading',
      estimated_impact: 'medium',
      timeframe: '1 day',
    });

    expect(mapped.status).toBe('active');
    expect(mapped.whyItMatters).toBe('');
    expect(mapped.steps).toEqual([]);
    expect(mapped.effort).toBe('medium');
    expect(mapped.outcome).toBe('');
    expect(mapped.competitorReference).toBeNull();
    expect(mapped.note).toBeNull();
    expect(mapped.actionedAt).toBeNull();
    expect(mapped.continuityNote).toBeNull();
  });
});
