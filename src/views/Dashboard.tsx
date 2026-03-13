'use client';

import { useRivalRadarStore } from '@/store/rivalradar';
import { DemoBanner } from '@/components/DemoBanner';
import { BenchmarkTable } from '@/components/BenchmarkTable';
import { PriorityActionsPanel } from '@/components/PriorityActionsPanel';
import { ChangeEventCard } from '@/components/Badges';
import { ScoreChip } from '@/components/ScoreChip';
import { Bell, TrendingUp } from 'lucide-react';
import type { ChangeEvent as CE } from '@/types';

const Dashboard = () => {
  const { project } = useRivalRadarStore();

  if (!project) return null;

  const own = project.ownBusiness;
  const allChanges: (CE & { competitorName: string })[] = project.competitors
    .flatMap((c) => c.changeEvents.map((e) => ({ ...e, competitorName: c.name })))
    .sort((a, b) => b.detectedAt - a.detectedAt);

  return (
    <div className="space-y-6">
      <DemoBanner />

      {/* Own business snapshot */}
      <div className="card-surface">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{own.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{own.url}</p>
          </div>
          <div className="text-right">
            <p className="metric-label">Overall Score</p>
            <p className="metric-value">{own.aiScore?.overallScore ?? '—'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {own.aiScore && (
            <>
              <ScoreChip label="SEO" score={own.aiScore.seoScore} size="md" />
              <ScoreChip label="Trust" score={own.aiScore.trustScore} size="md" />
              <ScoreChip label="Content" score={own.aiScore.contentScore} size="md" />
              <ScoreChip label="Engagement" score={own.aiScore.engagementScore} size="md" />
              <ScoreChip label="Pricing" score={own.aiScore.pricingTransparencyScore} size="md" />
            </>
          )}
        </div>
        {own.aiScore?.summary && (
          <p className="text-sm text-muted-foreground mt-3 border-t border-border pt-3">{own.aiScore.summary}</p>
        )}
      </div>

      {/* Benchmark Table */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Competitor Benchmark
        </h2>
        <BenchmarkTable />
      </div>

      {/* Priority Actions */}
      <PriorityActionsPanel />

      {/* Recent Changes */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          Recent Changes
        </h2>
        {allChanges.length > 0 ? (
          <div className="space-y-3">
            {allChanges.map((event) => (
              <ChangeEventCard key={event.id} event={event} competitorName={event.competitorName} />
            ))}
          </div>
        ) : (
          <div className="card-surface text-center py-8">
            <p className="text-sm text-muted-foreground">No changes detected yet</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
