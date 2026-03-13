'use client';

import { useRivalRadarStore } from '@/store/rivalradar';
import { ChangeEventCard, SeverityBadge } from '@/components/Badges';
import { Bell, Filter } from 'lucide-react';
import { useState } from 'react';
import type { ChangeEvent as CE } from '@/types';
import { cn } from '@/lib/utils';

const ChangesPage = () => {
  const { project } = useRivalRadarStore();
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [competitorFilter, setCompetitorFilter] = useState<string | null>(null);

  if (!project) return null;

  const allChanges: (CE & { competitorName: string })[] = project.competitors
    .flatMap((c) => c.changeEvents.map((e) => ({ ...e, competitorName: c.name })))
    .sort((a, b) => b.detectedAt - a.detectedAt);

  const filtered = allChanges
    .filter((e) => !severityFilter || e.severity === severityFilter)
    .filter((e) => !competitorFilter || e.competitorName === competitorFilter);

  const competitors = [...new Set(allChanges.map((e) => e.competitorName))];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
        <Bell className="w-5 h-5 text-primary" />
        All Changes
      </h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <button
          onClick={() => setSeverityFilter(null)}
          className={cn('score-chip', !severityFilter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}
        >
          All
        </button>
        {(['high', 'medium', 'low'] as const).map((s) => (
          <button key={s} onClick={() => setSeverityFilter(s === severityFilter ? null : s)}>
            <SeverityBadge severity={s} />
          </button>
        ))}
        <span className="text-border">|</span>
        {competitors.map((c) => (
          <button
            key={c}
            onClick={() => setCompetitorFilter(c === competitorFilter ? null : c)}
            className={cn('score-chip', competitorFilter === c ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}
          >
            {c}
          </button>
        ))}
      </div>

      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((event) => (
            <ChangeEventCard key={event.id} event={event} competitorName={event.competitorName} />
          ))}
        </div>
      ) : (
        <div className="card-surface text-center py-12">
          <p className="text-sm text-muted-foreground">No changes match the selected filters</p>
        </div>
      )}
    </div>
  );
};

export default ChangesPage;
