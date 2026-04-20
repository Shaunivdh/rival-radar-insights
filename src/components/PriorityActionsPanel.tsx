import { useRivalRadarStore } from '@/store/rivalradar';
import { ChevronRight } from 'lucide-react';

const IMPACT: Record<string, { label: string; badge: string; pts: number }> = {
  high: { label: 'Start here', badge: 'bg-amber-100 text-amber-700', pts: 8 },
  medium: { label: 'When you can', badge: 'bg-primary/10 text-primary', pts: 4 },
  low: { label: 'Quick win', badge: 'bg-muted text-muted-foreground', pts: 1 },
};

export const PriorityActionsPanel = () => {
  const { priorityActions } = useRivalRadarStore();

  if (!priorityActions.length) return null;

  return (
    <div className="card-surface flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Where to focus next</h2>
        <p className="text-xs text-muted-foreground mt-0.5">A few friendly suggestions, ordered by impact</p>
      </div>
      <div className="space-y-2 flex-1">
        {priorityActions.slice(0, 5).map((action, i) => {
          const cfg = IMPACT[action.estimatedImpact] ?? IMPACT.low;
          return (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-border hover:bg-muted/40 transition-colors cursor-pointer group">
              <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-md whitespace-nowrap mt-0.5 ${cfg.badge}`}>
                {cfg.label}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground leading-snug">{action.action}</p>
                <p className="text-xs text-green-600 font-medium mt-0.5">Est. +{cfg.pts} pts</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-foreground transition-colors" />
            </div>
          );
        })}
      </div>
    </div>
  );
};
