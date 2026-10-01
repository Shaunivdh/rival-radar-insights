import { supabaseAdmin } from '@/lib/supabase/server';
import type { ProjectId } from '@/types';

/** Most actions a plan shows at once (active + snoozed); the rest wait as 'queued'. */
export const MAX_LIVE_ACTIONS = 15;

/** Fill free plan slots with the oldest queued actions. */
export async function promoteQueuedActions(projectId: ProjectId): Promise<void> {
  // Count current active + snoozed
  const { count } = await supabaseAdmin
    .from('priority_actions')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .in('status', ['active', 'snoozed']);

  const slots = Math.max(0, MAX_LIVE_ACTIONS - (count ?? 0));
  if (slots === 0) return;

  // Fetch oldest queued actions to promote
  const { data: queued } = await supabaseAdmin
    .from('priority_actions')
    .select('id')
    .eq('project_id', projectId)
    .eq('status', 'queued')
    .order('generated_at', { ascending: true })
    .order('priority', { ascending: true })
    .limit(slots);

  if (!queued?.length) return;

  await supabaseAdmin
    .from('priority_actions')
    .update({ status: 'active' })
    .in(
      'id',
      queued.map((q) => q.id),
    );
}
