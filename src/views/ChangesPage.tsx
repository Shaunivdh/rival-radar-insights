'use client';

import { useRivalRadarStore } from '@/store/rivalradar';
import { ChangeEventCard, SeverityBadge } from '@/components/Badges';
import { Bell, Filter, Building2, Users } from 'lucide-react';
import { useState } from 'react';
import type { ChangeEvent as CE } from '@/types';
import { cn } from '@/lib/utils';

const ChangesPage = () => {
  const { project } = useRivalRadarStore();
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [competitorFilter, setCompetitorFilter] = useState<string | null>(null);

  if (!project) return null;

  const ownName = project.ownBusiness.name;

  const allChanges: (CE & { competitorName: string; isOwn: boolean })[] = [
    ...project.ownBusiness.changeEvents.map((e) => ({
      ...e,
      competitorName: ownName,
      isOwn: true,
    })),
    ...project.competitors.flatMap((c) =>
      c.changeEvents.map((e) => ({ ...e, competitorName: c.name, isOwn: false })),
    ),
  ].sort((a, b) => b.detectedAt - a.detectedAt);

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

      {allChanges.length === 0 ? (
        <div className="card-surface text-center py-16 space-y-3">
          <Bell className="w-10 h-10 text-muted-foreground/50 mx-auto" />
          <p className="text-sm font-medium text-muted-foreground">No changes detected yet</p>
          <p className="text-xs text-muted-foreground/70 max-w-sm mx-auto">
            We compare your competitors&apos; websites on each scan. Changes will appear here after
            the next rescan.
          </p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <button
              onClick={() => setSeverityFilter(null)}
              className={cn(
                'score-chip',
                !severityFilter
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
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
                className={cn(
                  'score-chip flex items-center gap-1',
                  competitorFilter === c
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {c === ownName ? <Building2 className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                {c}
              </button>
            ))}
          </div>

          {filtered.length > 0 ? (
            <div className="space-y-3">
              {filtered.map((event) => (
                <div key={event.id} className="relative">
                  {event.isOwn && (
                    <span className="absolute -top-2 right-3 text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1 z-10">
                      <Building2 className="w-3 h-3" />
                      Your Business
                    </span>
                  )}
                  <ChangeEventCard event={event} competitorName={event.competitorName} />
                </div>
              ))}
            </div>
          ) : (
            <div className="card-surface text-center py-12">
              <p className="text-sm text-muted-foreground">No changes match the selected filters</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ChangesPage;
