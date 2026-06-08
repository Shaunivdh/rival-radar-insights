'use client';

import { useRivalRadarStore } from '@/store/rivalradar';

function scoreColor(s: number) {
  if (s >= 70) return 'text-green-600';
  if (s >= 40) return 'text-amber-500';
  return 'text-red-500';
}

function Trend({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0)
    return <span className="text-xs text-gray-400 tabular-nums">— 0</span>;
  if (delta > 0)
    return <span className="text-xs text-green-500 tabular-nums font-medium">↗ +{delta}</span>;
  return <span className="text-xs text-red-500 tabular-nums font-medium">↘ {delta}</span>;
}

export function CompetitorComparisonCard() {
  const { project } = useRivalRadarStore();
  if (!project) return null;

  const own = project.ownBusiness;
  const competitors = project.competitors;
  const total = competitors.length;

  return (
    <div className="card-surface space-y-1 p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Competitors</h2>
        {total > 0 && (
          <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            {total} tracked
          </span>
        )}
      </div>

      {/* Own business row */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#5B4EE8]/8 border-b border-[#5B4EE8]/10">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#5B4EE8] truncate">You — {own.name}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {own.aiScore?.weeklyDelta !== undefined && (
            <Trend delta={own.aiScore.weeklyDelta ?? null} />
          )}
          <span
            className={`text-sm font-bold tabular-nums ${own.aiScore ? scoreColor(own.aiScore.overallScore) : 'text-muted-foreground'}`}
          >
            {own.aiScore?.overallScore ?? '—'}
          </span>
          {own.googleData && (
            <span className="text-xs text-gray-500 tabular-nums w-10 text-right">
              {own.googleData.googleRating.toFixed(1)}★
            </span>
          )}
        </div>
      </div>

      {/* Competitor rows */}
      {competitors.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No competitors added yet</p>
      ) : (
        competitors.map((c, i) => (
          <div
            key={c.id}
            className={`flex items-center gap-3 px-4 py-3 ${i < competitors.length - 1 ? 'border-b border-border' : ''}`}
          >
            {/* Name + review count */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
              {c.googleData && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {c.googleData.reviewCount.toLocaleString()} reviews
                </p>
              )}
            </div>

            {/* Trend | Score | Rating */}
            <div className="flex items-center gap-3 shrink-0">
              <Trend delta={c.aiScore?.weeklyDelta ?? null} />
              <span
                className={`text-sm font-bold tabular-nums w-6 text-right ${c.aiScore ? scoreColor(c.aiScore.overallScore) : 'text-muted-foreground'}`}
              >
                {c.aiScore?.overallScore ?? '—'}
              </span>
              <span className="text-xs text-gray-500 tabular-nums w-10 text-right">
                {c.googleData ? `${c.googleData.googleRating.toFixed(1)}★` : '—'}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
