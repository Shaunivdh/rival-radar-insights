'use client';

import { useEffect, useRef } from 'react';
import { useRivalRadarStore } from '@/store/rivalradar';
import { syncProject } from '@/actions/projects';
import { DemoBanner } from '@/components/DemoBanner';
import { BenchmarkTable } from '@/components/BenchmarkTable';
import { PriorityActionsPanel } from '@/components/PriorityActionsPanel';
import { ChangeEventCard } from '@/components/Badges';
import { ScoreChip } from '@/components/ScoreChip';
import { Bell, TrendingUp, Loader2, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import { triggerInitialScans } from '@/actions/projects';
import { useState } from 'react';
import type { ChangeEvent as CE } from '@/types';

const STATUS_ICON: Record<string, React.ReactNode> = {
  idle: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
  pending: <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />,
  running: <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />,
  complete: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
  failed: <XCircle className="w-3.5 h-3.5 text-destructive" />,
};

const Dashboard = () => {
  const { project, isDemoMode, syncBusinesses, setPriorityActions } = useRivalRadarStore();
  const [rescanning, setRescanning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const allBusinesses = project ? [project.ownBusiness, ...project.competitors] : [];
  const isScanning = allBusinesses.some((b) => b.crawlStatus === 'pending' || b.crawlStatus === 'running');
  const noneScanned = allBusinesses.every((b) => b.crawlStatus === 'idle');
  const anyFailed = allBusinesses.some((b) => b.crawlStatus === 'failed');

  const handleRescan = async () => {
    if (!project) return;
    setRescanning(true);
    await triggerInitialScans(project.id);
    setRescanning(false);
  };

  useEffect(() => {
    if (!project || isDemoMode || !isScanning) return;

    const poll = async () => {
      const result = await syncProject(project.id);
      syncBusinesses(result.businesses);
      if (result.priorityActions?.length) setPriorityActions(result.priorityActions);
    };

    poll();
    intervalRef.current = setInterval(poll, 15000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isScanning, project?.id, isDemoMode]);

  if (!project) return null;

  const own = project.ownBusiness;
  const allChanges: (CE & { competitorName: string })[] = project.competitors
    .flatMap((c) => c.changeEvents.map((e) => ({ ...e, competitorName: c.name })))
    .sort((a, b) => b.detectedAt - a.detectedAt);

  return (
    <div className="space-y-6">
      <DemoBanner />

      {/* Scan status panel */}
      {!isDemoMode && (isScanning || noneScanned || anyFailed) && (
        <div className="card-surface border-primary/20 bg-primary/5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {isScanning && <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />}
              <p className="text-sm font-semibold text-foreground">
                {isScanning ? 'Scanning in progress…' : anyFailed ? 'Some scans failed' : 'Scans not started'}
              </p>
              {isScanning && (
                <p className="text-xs text-muted-foreground">Initial scan takes 2–8 min per site. This page auto-refreshes.</p>
              )}
            </div>
            {(anyFailed || noneScanned || isScanning) && (
              <button
                onClick={handleRescan}
                disabled={rescanning}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${rescanning ? 'animate-spin' : ''}`} />
                {rescanning ? 'Starting…' : 'Retry Scan'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {allBusinesses.map((b) => (
              <div key={b.id} className="flex items-center gap-2 text-xs">
                {STATUS_ICON[b.crawlStatus]}
                <span className="font-medium text-foreground truncate">{b.name}</span>
                <span className="text-muted-foreground capitalize">{b.crawlStatus}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
        {own.aiScore && (
          <div className="flex flex-wrap gap-2 mt-4">
            <ScoreChip label="SEO" score={own.aiScore.seoScore} size="md" />
            <ScoreChip label="Trust" score={own.aiScore.trustScore} size="md" />
            <ScoreChip label="Content" score={own.aiScore.contentScore} size="md" />
            <ScoreChip label="Engagement" score={own.aiScore.engagementScore} size="md" />
            <ScoreChip label="Pricing" score={own.aiScore.pricingTransparencyScore} size="md" />
          </div>
        )}
        {own.aiScore?.summary && (
          <p className="text-sm text-muted-foreground mt-3 border-t border-border pt-3">{own.aiScore.summary}</p>
        )}
      </div>

      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Competitor Benchmark
        </h2>
        <BenchmarkTable />
      </div>

      <PriorityActionsPanel />

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
