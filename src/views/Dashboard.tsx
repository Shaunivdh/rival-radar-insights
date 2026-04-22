'use client';

import { useEffect, useRef } from 'react';
import { useRivalRadarStore } from '@/store/rivalradar';
import { syncProject } from '@/actions/projects';
import { DemoBanner } from '@/components/DemoBanner';
import { CompetitorComparisonCard } from '@/components/CompetitorComparisonCard';
import { PriorityActionsPanel } from '@/components/PriorityActionsPanel';
import { BusinessScoreCard } from '@/components/BusinessScoreCard';
import { TrendingUp, TrendingDown, Star, Bot, Bell, Loader2, CheckCircle2, XCircle, Clock, RefreshCw, Plus, X, AlertTriangle } from 'lucide-react';
import { triggerSingleScan, rescanAll, addCompetitor } from '@/actions/projects';
import { useState } from 'react';
import type { ChangeEvent as CE } from '@/types';
import { DashboardGreeting } from '@/components/DashboardGreeting';
import { ScoreTrend } from '@/components/ScoreTrend';

const STATUS_ICON: Record<string, React.ReactNode> = {
  idle: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
  pending: <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />,
  running: <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />,
  complete: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
  failed: <XCircle className="w-3.5 h-3.5 text-destructive" />,
};

const isDev = process.env.NODE_ENV === 'development';

const Dashboard = () => {
  const { project, isDemoMode, syncBusinesses, setPriorityActions, addCompetitorToStore } = useRivalRadarStore();
  const [rescanning, setRescanning] = useState(false);
  const [rescanningId, setRescanningId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', url: '', domain: '' });
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasScanningRef = useRef(false);
  const trackedProjectIdRef = useRef<string | null>(null);

  const allBusinesses = project ? [project.ownBusiness, ...project.competitors] : [];
  const isScanning = allBusinesses.some((b) => b.crawlStatus === 'pending' || b.crawlStatus === 'running');
  const noneScanned = allBusinesses.every((b) => b.crawlStatus === 'idle');
  const anyFailed = allBusinesses.some((b) => b.crawlStatus === 'failed');

  const handleRescan = async () => {
    if (!project) return;
    setRescanning(true);
    await rescanAll(project.id);
    syncBusinesses(allBusinesses.map((b) => ({ id: b.id, crawlStatus: 'pending', signals: b.signals, aiScore: b.aiScore })));
    setRescanning(false);
  };

  const handleAddCompetitor = async () => {
    if (!project) return;
    setAddError('');
    if (!addForm.name.trim() || !addForm.url.trim() || !addForm.domain.trim()) {
      setAddError('All fields are required.');
      return;
    }
    setAddLoading(true);
    try {
      const business = await addCompetitor(project.id, addForm);
      addCompetitorToStore(business);
      setShowAddModal(false);
      setAddForm({ name: '', url: '', domain: '' });
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : 'Failed to add competitor.');
    } finally {
      setAddLoading(false);
    }
  };

  const handleRescanOne = async (businessId: string) => {
    setRescanningId(businessId);
    await triggerSingleScan(businessId);
    syncBusinesses([{ id: businessId, crawlStatus: 'pending', signals: null, aiScore: null }]);
    setRescanningId(null);
  };

  useEffect(() => {
    if (!project || isDemoMode) return;

    // Reset scan tracking when the project changes
    if (trackedProjectIdRef.current !== project.id) {
      trackedProjectIdRef.current = project.id;
      wasScanningRef.current = false;
    }

    const poll = async () => {
      const result = await syncProject(project.id);
      syncBusinesses(result.businesses);
      if (result.priorityActions?.length) setPriorityActions(result.priorityActions);
    };

    if (isScanning) {
      wasScanningRef.current = true;
      poll();
      intervalRef.current = setInterval(poll, 5000);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }

    // Scanning just finished — one trailing poll to catch any in-flight state changes.
    // Delay matches the crawl system's own poll interval so we don't read mid-transition.
    if (wasScanningRef.current) {
      wasScanningRef.current = false;
      const timer = setTimeout(poll, 5000);
      return () => clearTimeout(timer);
    }
  }, [isScanning, project?.id, isDemoMode]);

  if (!project) return null;

  // Detect competitors sharing the same root domain
  const domainGroups = project.competitors.reduce<Record<string, string[]>>((acc, c) => {
    const root = c.domain.replace(/^www\./, '');
    (acc[root] ??= []).push(c.name);
    return acc;
  }, {});
  const duplicateDomains = Object.entries(domainGroups).filter(([, names]) => names.length > 1);

  const own = project.ownBusiness;
  const allChanges: (CE & { competitorName: string })[] = project.competitors
    .flatMap((c) => c.changeEvents.map((e) => ({ ...e, competitorName: c.name })))
    .sort((a, b) => b.detectedAt - a.detectedAt);

  function alertIcon(summary: string) {
    const s = summary.toLowerCase();
    if (s.includes('search') || s.includes('local') || s.includes('ranking') || s.includes('climbing')) return <TrendingUp className="w-4 h-4 text-orange-500" />;
    if (s.includes('review') || s.includes('rating') || s.includes('star')) return <Star className="w-4 h-4 text-yellow-500" />;
    if (s.includes('ai') || s.includes('gpt') || s.includes('mention') || s.includes('chatgpt')) return <Bot className="w-4 h-4 text-blue-500" />;
    if (s.includes('down') || s.includes('error') || s.includes('outage') || s.includes('500')) return <TrendingDown className="w-4 h-4 text-green-600" />;
    return <Bell className="w-4 h-4 text-muted-foreground" />;
  }

  function alertIconBg(summary: string) {
    const s = summary.toLowerCase();
    if (s.includes('search') || s.includes('local') || s.includes('ranking') || s.includes('climbing')) return 'bg-orange-50';
    if (s.includes('review') || s.includes('rating') || s.includes('star')) return 'bg-yellow-50';
    if (s.includes('ai') || s.includes('gpt') || s.includes('mention') || s.includes('chatgpt')) return 'bg-blue-50';
    if (s.includes('down') || s.includes('error') || s.includes('outage') || s.includes('500')) return 'bg-green-50';
    return 'bg-muted';
  }

  return (
    <div className="space-y-6">
      <DemoBanner />

      {/* Duplicate domain warning */}
      {duplicateDomains.length > 0 && (
        <div className="card-surface border-amber-200 bg-amber-50 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-800">Duplicate competitor domains detected</p>
            {duplicateDomains.map(([domain, names]) => (
              <p key={domain} className="text-xs text-amber-700">
                <span className="font-medium">{names.join(' & ')}</span> share the same domain (<span className="font-mono">{domain}</span>) — their data may overlap.
              </p>
            ))}
          </div>
        </div>
      )}

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
            {isDev && (anyFailed || noneScanned || isScanning) && (
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
              <div key={b.id} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 text-xs">
                  {STATUS_ICON[b.crawlStatus]}
                  <span className="font-medium text-foreground truncate">{b.name}</span>
                  <span className="text-muted-foreground capitalize">{b.crawlStatus}</span>
                  {isDev && b.crawlStatus === 'failed' && (
                    <button
                      onClick={() => handleRescanOne(b.id)}
                      disabled={rescanningId === b.id}
                      className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${rescanningId === b.id ? 'animate-spin' : ''}`} />
                      Retry
                    </button>
                  )}
                </div>
                {b.crawlStatus === 'complete' && b.enrichmentErrors && (
                  <div className="ml-5 flex flex-col gap-0.5">
                    {b.enrichmentErrors.crawl && (
                      <span className="text-[11px] text-amber-600">{b.enrichmentErrors.crawl}</span>
                    )}
                    {b.enrichmentErrors.google && (
                      <span className="text-[11px] text-amber-600">Google data unavailable</span>
                    )}
                    {b.enrichmentErrors.serp && (
                      <span className="text-[11px] text-amber-600">Search ranking unavailable</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Greeting */}
      <DashboardGreeting />

      {/* Score overview + right column */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 relative">
          {isDev && !isDemoMode && !isScanning && (
            <div className="absolute top-4 right-4 z-10">
              <button
                onClick={handleRescan}
                disabled={rescanning}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted disabled:opacity-50 bg-background"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${rescanning ? 'animate-spin' : ''}`} />
                {rescanning ? 'Starting…' : 'Re-scan All'}
              </button>
            </div>
          )}
          <BusinessScoreCard own={own} competitors={project.competitors} />
        </div>

        {/* Right column: priority actions + what's happening */}
        <div className="space-y-6">
          <PriorityActionsPanel />

          {/* What's happening */}
          <div className="card-surface">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-foreground">What's happening around you</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Friendly heads-ups from this week</p>
            </div>
            {allChanges.length > 0 ? (
              <div className="space-y-4">
                {allChanges.slice(0, 5).map((event) => (
                  <div key={event.id} className="flex gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${alertIconBg(event.summary)}`}>
                      {alertIcon(event.summary)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground leading-snug">{event.competitorName}</p>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {(() => {
                            const diff = Date.now() - event.detectedAt;
                            const h = Math.floor(diff / 3600000);
                            const d = Math.floor(diff / 86400000);
                            if (h < 1) return 'Just now';
                            if (h < 24) return `${h}h ago`;
                            return `${d}d ago`;
                          })()}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{event.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No changes detected yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Score trend */}
      <ScoreTrend />

      {/* Competitors */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Competitors
          </h2>
          {!isDemoMode && project.competitors.length < 5 && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Competitor
            </button>
          )}
        </div>
        <CompetitorComparisonCard />
      </div>
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border border-border rounded-xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Add Competitor</h3>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {(['name', 'url', 'domain'] as const).map((field) => (
                <div key={field}>
                  <label className="text-xs text-muted-foreground capitalize mb-1 block">{field}</label>
                  <input
                    className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder={field === 'url' ? 'https://example.com' : field === 'domain' ? 'example.com' : 'Competitor Name'}
                    value={addForm[field]}
                    onChange={(e) => setAddForm((f) => ({ ...f, [field]: e.target.value }))}
                  />
                </div>
              ))}
              {addError && <p className="text-xs text-destructive">{addError}</p>}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCompetitor}
                disabled={addLoading}
                className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
              >
                {addLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {addLoading ? 'Adding…' : 'Add Competitor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
