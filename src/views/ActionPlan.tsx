'use client';

import { useState } from 'react';
import { useRivalRadarStore } from '@/store/rivalradar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Lightbulb, ChevronDown, ChevronUp, Flame, Target, TrendingUp,
  Zap, Clock, Users, AlertTriangle,
} from 'lucide-react';
import type { PriorityAction } from '@/types';

type PriorityLevel = 1 | 2 | 3;

const PRIORITY_CONFIG: Record<PriorityLevel, {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
}> = {
  1: { label: 'Fix Now', description: 'These issues are actively hurting your business', icon: Flame, color: 'text-destructive' },
  2: { label: 'High Impact', description: 'Big improvements that need some effort', icon: Target, color: 'text-amber-600' },
  3: { label: 'Worth Doing', description: 'Solid improvements when you have time', icon: TrendingUp, color: 'text-primary' },
};

const IMPACT_CONFIG: Record<PriorityAction['estimatedImpact'], {
  label: string;
  badge: string;
}> = {
  high: { label: 'High impact', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  medium: { label: 'Med impact', badge: 'bg-primary/10 text-primary border-primary/20' },
  low: { label: 'Quick win', badge: 'bg-green-50 text-green-700 border-green-200' },
};

const ActionCard = ({ action, index }: { action: PriorityAction; index: number }) => {
  const [expanded, setExpanded] = useState(false);
  const impactCfg = IMPACT_CONFIG[action.estimatedImpact] ?? IMPACT_CONFIG.low;

  return (
    <Card className="neu overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-0">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left p-5 pb-4"
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {action.category}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className={`text-[11px] ${impactCfg.badge}`}>
                {impactCfg.label}
              </Badge>
              {expanded
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>
          <h3 className="font-semibold text-sm mb-2 leading-snug">{action.action}</h3>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-muted-foreground leading-relaxed text-xs">{action.reason}</p>
          </div>
        </button>

        {expanded && (
          <div className="px-5 pb-5 space-y-4 border-t border-border/50 pt-4">
            {action.competitorReference && (
              <div>
                <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-primary" />
                  Competitor context
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{action.competitorReference}</p>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{action.timeframe}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="p-3 rounded-xl bg-primary/10 mb-4">
      <Lightbulb className="w-6 h-6 text-primary" />
    </div>
    <h2 className="font-semibold text-base mb-1">No recommendations yet</h2>
    <p className="text-sm text-muted-foreground max-w-xs">
      Run a scan from the dashboard to generate your personalised action plan.
    </p>
  </div>
);

const ActionPlan = () => {
  const { priorityActions } = useRivalRadarStore();

  if (!priorityActions.length) return <EmptyState />;

  const priorities: PriorityLevel[] = [1, 2, 3];
  const total = priorityActions.length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-primary/10">
            <Lightbulb className="w-5 h-5 text-primary" />
          </div>
          <h1 className="font-bold text-xl">Your Action Plan</h1>
        </div>
        <p className="text-muted-foreground text-sm ml-11">
          Personalised recommendations based on your website crawl, Google data, and competitor analysis.
        </p>
      </div>

      {/* Progress summary */}
      <Card className="neu">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{total} recommendation{total !== 1 ? 's' : ''} to review</span>
          </div>
          <Progress value={0} className="h-1.5 mb-4" />
          <div className="flex flex-wrap gap-4">
            {priorities.map((p) => {
              const cfg = PRIORITY_CONFIG[p];
              const count = priorityActions.filter((a) => a.priority === p).length;
              if (!count) return null;
              return (
                <div key={p} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <cfg.icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                  <span>{count} {cfg.label}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Grouped actions */}
      {priorities.map((priority) => {
        const cfg = PRIORITY_CONFIG[priority];
        const actions = priorityActions.filter((a) => a.priority === priority);
        if (!actions.length) return null;

        return (
          <section key={priority}>
            <div className="flex items-center gap-2 mb-3">
              <cfg.icon className={`w-5 h-5 ${cfg.color}`} />
              <h2 className="font-semibold text-base">{cfg.label}</h2>
              <span className="text-xs text-muted-foreground">— {cfg.description}</span>
            </div>
            <div className="space-y-3">
              {actions.map((action, i) => (
                <ActionCard key={i} action={action} index={i} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default ActionPlan;
