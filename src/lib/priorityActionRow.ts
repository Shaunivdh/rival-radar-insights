import type { PriorityAction } from '@/types';
import { asPriorityActionId } from '@/types';

export function mapPriorityActionRow(r: Record<string, unknown>): PriorityAction {
  return {
    id: asPriorityActionId(r.id as string),
    priority: r.priority as PriorityAction['priority'],
    status: (r.status as PriorityAction['status']) ?? 'active',
    category: r.category as string,
    action: r.action as string,
    reason: r.reason as string,
    whyItMatters: (r.why_it_matters as string) ?? '',
    steps: (r.steps as string[]) ?? [],
    effort: ((r.effort as string) ?? 'medium') as PriorityAction['effort'],
    outcome: (r.outcome as string) ?? '',
    competitorReference: (r.competitor_reference as string | null) ?? null,
    estimatedImpact: r.estimated_impact as PriorityAction['estimatedImpact'],
    timeframe: r.timeframe as string,
    note: (r.note as string | null) ?? null,
    actionedAt: (r.actioned_at as string | null) ?? null,
    continuityNote: (r.continuity_note as string | null) ?? null,
    templateId: (r.template_id as string | null) ?? null,
    generatedAt: (r.generated_at as string | null) ?? null,
    verification: (r.verification as PriorityAction['verification']) ?? null,
    verifiedAt: (r.verified_at as string | null) ?? null,
    autoResolved: (r.auto_resolved as boolean | null) ?? false,
  };
}
