import { useRivalRadarStore } from '@/store/rivalradar';
import { ChevronDown, ChevronUp, Target } from 'lucide-react';
import { useState } from 'react';
import { SeverityBadge } from '@/components/Badges';

const impactColors = {
  high: 'text-[hsl(142,71%,35%)]',
  medium: 'text-[hsl(38,92%,40%)]',
  low: 'text-muted-foreground',
};

export const PriorityActionsPanel = () => {
  const { priorityActions } = useRivalRadarStore();
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!priorityActions.length) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
        <Target className="w-4 h-4 text-primary" />
        Priority Actions
      </h2>
      {priorityActions.map((action, i) => (
        <div key={i} className="card-surface">
          <button
            className="w-full flex items-start gap-3 text-left"
            onClick={() => setExpanded(expanded === i ? null : i)}
          >
            <span className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center mt-0.5">
              {action.priority}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{action.action}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-muted-foreground">{action.category}</span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className={`text-xs font-medium ${impactColors[action.estimatedImpact]}`}>
                  {action.estimatedImpact} impact
                </span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">{action.timeframe}</span>
              </div>
            </div>
            {expanded === i ? <ChevronUp className="w-4 h-4 text-muted-foreground mt-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground mt-1" />}
          </button>
          {expanded === i && (
            <div className="mt-3 pt-3 border-t border-border ml-9">
              <p className="text-sm text-muted-foreground">{action.reason}</p>
              <p className="text-xs text-primary font-medium mt-2">
                vs {action.competitorReference}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
