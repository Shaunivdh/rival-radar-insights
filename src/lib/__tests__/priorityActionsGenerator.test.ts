import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeDb as db } from '@/test/supabase-fake';
import { buildAction } from '@/test/builders';
import type { PriorityAction } from '@/types';

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('@/lib/supabase/server', async () => ({
  supabaseAdmin: (await import('@/test/supabase-fake')).fakeDb,
}));
vi.mock('@/services/ai', () => ({
  generatePriorityActions: generate,
  generatePriorityActionsWithHistory: generate,
  AIUnavailableError: class extends Error {},
}));

import { generateAndPersistProjectActions } from '@/lib/priorityActionsGenerator';
import { asProjectId } from '@/types';

const PROJECT_ID = asProjectId('proj_1');

function seed(existing: Record<string, unknown>[] = []) {
  db.seed('projects', [{ id: PROJECT_ID, primary_service: 'trades' }]);
  db.seed('businesses', [
    { id: 'biz_own', project_id: PROJECT_ID, name: 'Acme', is_own_business: true },
  ]);
  db.seed(
    'priority_actions',
    existing.map((e, i) => ({
      id: `pa_${i}`,
      project_id: PROJECT_ID,
      priority: 1,
      category: 'Local SEO',
      reason: 'r',
      estimated_impact: 'medium',
      timeframe: '1 day',
      generated_at: '2026-09-01T00:00:00Z',
      ...e,
    })),
  );
}

const descAction = (): PriorityAction =>
  buildAction({
    category: 'Local SEO',
    action: 'Check your Google Business description',
    templateId: 'no_gbp_description',
  });

describe('generateAndPersistProjectActions', () => {
  beforeEach(() => {
    db.reset();
    generate.mockReset();
  });

  it('saves the template id on inserted actions', async () => {
    seed();
    generate.mockResolvedValue([descAction()]);
    const res = await generateAndPersistProjectActions(PROJECT_ID);
    expect(res.inserted).toBe(1);
    expect(db.rows('priority_actions')[0].template_id).toBe('no_gbp_description');
  });

  it('skips a template action whose id is already live, even under old headline copy', async () => {
    seed([
      {
        action: 'Write a proper Google Business description',
        template_id: 'no_gbp_description',
        status: 'active',
      },
    ]);
    generate.mockResolvedValue([descAction()]);
    const res = await generateAndPersistProjectActions(PROJECT_ID);
    expect(res.reason).toBe('all generated actions already exist');
    expect(db.rows('priority_actions')).toHaveLength(1);
  });
});
