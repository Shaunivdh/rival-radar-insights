'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRivalRadarStore } from '@/store/rivalradar';
import { fetchPlanHistory, fetchPriorityActions, updateActionStatus } from '@/actions/projects';
import type { OwnScanState } from '@/actions/projects';
import { CRAWL_INTERVAL_MS, DAY_MS } from '@/lib/crawl/config';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Lightbulb,
  Star,
  Globe,
  Brain,
  Shield,
  MousePointerClick,
  Clock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Flame,
  Target,
  Zap,
  MapPin,
  MessageSquare,
  TrendingUp,
  Check,
  RotateCcw,
  Hourglass,
  ShieldCheck,
  EyeOff,
} from 'lucide-react';
import type { PriorityAction, PriorityActionId } from '@/types';
import { MOCK_PRIORITY_ACTIONS } from '@/lib/mockActionPlan';

// Dev-only: preview the plan with sample data when a project has no real actions yet.
const IS_DEV = process.env.NODE_ENV !== 'production';

type Priority = 'critical' | 'high' | 'medium' | 'quick-win';
// 'unchecked': an AI-written action has no deterministic check, so no scan promise is made.
type VerificationState = NonNullable<PriorityAction['verification']> | 'pending' | 'unchecked';

type Recommendation = {
  id: PriorityActionId;
  dbId: PriorityActionId;
  dbStatus: 'active' | 'snoozed' | 'completed';
  dbNote: string | null;
  dbActionedAt: string | null;
  priority: Priority;
  category: string;
  categoryIcon: React.ElementType;
  title: string;
  dataPoint: string;
  whyItMatters: string;
  competitorReference: string | null;
  steps: string[];
  impact: string;
  effort: 'Low' | 'Medium' | 'High';
  timeframe: string;
  continuityNote: string | null;
  generatedAt: string | null;
  verification: VerificationState;
  verifiedAt: string | null;
  autoResolved: boolean;
};

type ActionStatus = {
  done: boolean;
  doneAt?: string;
  note?: string;
  verification: VerificationState;
  dismissed?: boolean;
  dismissedAt?: string;
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'AI Visibility': Brain,
  Reviews: Star,
  'Local SEO': MapPin,
  Website: Globe,
  Trust: Shield,
  Conversion: MousePointerClick,
  'Review Replies': MessageSquare,
  Reputation: AlertTriangle,
};

function toPriorityBucket(action: PriorityAction): Priority {
  if (action.estimatedImpact === 'high') return 'critical';
  if (action.estimatedImpact === 'medium') return 'high';
  if (action.effort === 'low') return 'quick-win';
  return 'medium';
}

/** Ticked over two scans ago and still not checkable (e.g. its data keeps failing): stop promising a check. */
const checkOverdue = (actionedAt?: string | null) =>
  !!actionedAt && Date.now() - new Date(actionedAt).getTime() > 2 * CRAWL_INTERVAL_MS;

function mapAction(action: PriorityAction): Recommendation {
  return {
    id: action.id,
    dbId: action.id,
    dbStatus: (action.status === 'queued' ? 'active' : action.status) as
      | 'active'
      | 'snoozed'
      | 'completed',
    dbNote: action.note ?? null,
    dbActionedAt: action.actionedAt ?? null,
    priority: toPriorityBucket(action),
    category: action.category,
    categoryIcon: CATEGORY_ICONS[action.category] ?? Lightbulb,
    title: action.action,
    dataPoint: action.reason,
    whyItMatters: action.whyItMatters,
    competitorReference: action.competitorReference,
    steps: action.steps,
    impact: action.outcome,
    effort: action.effort === 'low' ? 'Low' : action.effort === 'medium' ? 'Medium' : 'High',
    timeframe: action.timeframe,
    continuityNote: action.continuityNote ?? null,
    generatedAt: action.generatedAt ?? null,
    verification: !action.templateId
      ? 'unchecked'
      : (action.verification ?? (checkOverdue(action.actionedAt) ? 'unchecked' : 'pending')),
    verifiedAt: action.verifiedAt ?? null,
    autoResolved: action.autoResolved ?? false,
  };
}

const priorityConfig: Record<
  Priority,
  { label: string; icon: React.ElementType; color: string; description: string }
> = {
  critical: {
    label: 'Start with these',
    icon: Flame,
    color: 'text-destructive',
    description: 'These are costing you visibility right now',
  },
  high: {
    label: "When you've got a moment",
    icon: Target,
    color: 'text-amber-600',
    description: "A bit more effort, but they'll genuinely move the needle",
  },
  medium: {
    label: 'Worth a look soon',
    icon: TrendingUp,
    color: 'text-primary',
    description: "Nice gains when you've got half an hour spare",
  },
  'quick-win': {
    label: 'Easy wins',
    icon: Zap,
    color: 'text-green-600',
    description: 'Little changes you could do today that all add up',
  },
};

const effortColor: Record<string, string> = {
  Low: 'bg-green-50 text-green-700 border-green-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  High: 'bg-red-50 text-red-700 border-red-200',
};

const formatDaysAgo = (iso?: string) => {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
};

/**
 * Scan badge text, from the own business's scan state. "Last scan" is the latest scan
 * that produced data, so a failed attempt never poses as fresh data. The next scan is
 * due a crawl interval after the latest attempt (the daily cron re-queues it).
 */
const scanTimingLabel = (scan: OwnScanState | null): string => {
  if (!scan?.lastSuccessAt) return 'Re-checked each scan';
  const lastFull = formatDaysAgo(scan.lastSuccessAt);
  if (scan.status === 'pending' || scan.status === 'running')
    return `Scanning now · last full scan ${lastFull}`;
  if (scan.status === 'failed') return `Latest scan didn't complete · last full scan ${lastFull}`;
  const from = new Date(scan.lastAttemptAt ?? scan.lastSuccessAt).getTime();
  const daysToNext = Math.ceil((from + CRAWL_INTERVAL_MS - Date.now()) / DAY_MS);
  const next =
    daysToNext > 1
      ? `next in about ${daysToNext} days`
      : daysToNext === 1
        ? 'next scan tomorrow'
        : 'next scan due today';
  return `Last scan ${lastFull} · ${next}`;
};

const VerificationBadge = ({ state }: { state: VerificationState }) => {
  if (state === 'unchecked') return null;
  if (state === 'verified') {
    return (
      <Badge
        variant="outline"
        className="text-[11px] bg-green-50 text-green-700 border-green-200 gap-1"
      >
        <ShieldCheck className="w-3 h-3" /> Confirmed by last scan
      </Badge>
    );
  }
  if (state === 'not_verified') {
    return (
      <Badge
        variant="outline"
        className="text-[11px] bg-amber-50 text-amber-700 border-amber-200 gap-1"
      >
        <AlertTriangle className="w-3 h-3" /> Not picked up yet
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-[11px] bg-muted text-muted-foreground border-border gap-1"
    >
      <Hourglass className="w-3 h-3" /> We'll check on the next scan
    </Badge>
  );
};

// The "done" panel per verification state: look and message. `when` reads "3 days ago".
const DONE_PANEL: Record<
  VerificationState,
  {
    className: string;
    icon: React.ElementType;
    message: (when: string, autoResolved: boolean) => string;
  }
> = {
  verified: {
    className: 'bg-success/10 text-success-strong',
    icon: CheckCircle2,
    message: (when, autoResolved) =>
      autoResolved
        ? "We spotted you'd sorted this: your last two scans both confirm it. Nice work."
        : `Our latest scan confirms this is sorted. Marked done ${when}.`,
  },
  not_verified: {
    className: 'bg-warning/10 text-warning-strong',
    icon: AlertTriangle,
    message: (when) =>
      `You marked this done ${when}, but our last scan hasn't picked up a change yet. Worth a quick double-check.`,
  },
  pending: {
    className: 'bg-muted/50 text-muted-foreground',
    icon: Hourglass,
    message: (when) => `Marked done ${when}. We'll re-check on the next scan.`,
  },
  unchecked: {
    className: 'bg-muted/50 text-muted-foreground',
    icon: CheckCircle2,
    message: (when) => `Marked done ${when}. Nice one.`,
  },
};

const RecommendationCard = ({
  rec,
  index,
  status,
  onMarkDone,
  onUndo,
  onDismiss,
  onRestore,
}: {
  rec: Recommendation;
  index: number;
  status?: ActionStatus;
  onMarkDone: (id: PriorityActionId, note?: string) => void;
  onUndo: (id: PriorityActionId) => void;
  onDismiss: (id: PriorityActionId) => void;
  onRestore: (id: PriorityActionId) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const isDone = rec.dbStatus === 'completed' || !!status?.done;
  const isDismissed = rec.dbStatus === 'snoozed' || !!status?.dismissed;
  const verification: VerificationState =
    rec.verification === 'unchecked' ? 'unchecked' : (status?.verification ?? rec.verification);
  const doneWhen = formatDaysAgo(status?.doneAt ?? rec.dbActionedAt ?? undefined);
  const DoneIcon = DONE_PANEL[verification].icon;

  const handleQuickDone = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMarkDone(rec.id);
  };

  const handleSaveWithNote = () => {
    onMarkDone(rec.id, note.trim() || undefined);
    setShowNote(false);
    setNote('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * index }}
      layout
    >
      <Card
        className={`neu overflow-hidden hover:shadow-lg transition-shadow ${isDone || isDismissed ? 'opacity-90' : ''}`}
      >
        <CardContent className="p-0">
          <div
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpanded(!expanded);
              }
            }}
            className="w-full text-left p-6 pb-4 cursor-pointer"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <rec.categoryIcon className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {rec.category}
                </span>
                {isDone && <VerificationBadge state={verification} />}
                {isDismissed && (
                  <Badge
                    variant="outline"
                    className="text-[11px] bg-muted text-muted-foreground border-border gap-1"
                  >
                    <EyeOff className="w-3 h-3" /> Snoozed
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!isDone && !isDismissed && (
                  <Badge variant="outline" className={`text-[11px] ${effortColor[rec.effort]}`}>
                    {rec.effort} effort
                  </Badge>
                )}
                {expanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <button
                onClick={
                  isDone
                    ? (e) => {
                        e.stopPropagation();
                        onUndo(rec.id);
                      }
                    : isDismissed
                      ? (e) => {
                          e.stopPropagation();
                          onRestore(rec.id);
                        }
                      : handleQuickDone
                }
                aria-label={
                  isDone ? 'Mark as not done' : isDismissed ? 'Restore action' : 'Mark as done'
                }
                disabled={isDismissed}
                className={`mt-0.5 shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                  isDone
                    ? 'bg-primary border-primary text-primary-foreground'
                    : isDismissed
                      ? 'border-border bg-muted cursor-default'
                      : 'border-border bg-background hover:border-primary hover:bg-primary/5'
                }`}
              >
                {isDone && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                {isDismissed && <EyeOff className="w-3 h-3 text-muted-foreground" />}
              </button>
              <div className="flex-1 min-w-0">
                <h3
                  className={`font-display text-base font-semibold ${rec.continuityNote ? 'mb-1' : 'mb-2'} ${isDone || isDismissed ? 'text-muted-foreground' : ''} ${isDone ? 'line-through' : ''}`}
                >
                  {rec.title}
                </h3>
                {rec.continuityNote && (
                  <p className="text-xs text-muted-foreground/80 italic mb-2">
                    {rec.continuityNote}
                  </p>
                )}
                {!isDone && !isDismissed && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-muted-foreground leading-relaxed">{rec.dataPoint}</p>
                  </div>
                )}
                {!isDone && !isDismissed && rec.generatedAt && (
                  <p className="text-xs text-muted-foreground mt-2 pl-1">
                    First spotted {formatDaysAgo(rec.generatedAt)}
                  </p>
                )}
                {isDismissed && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                    <EyeOff className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      You marked this as not a priority{' '}
                      {formatDaysAgo(status?.dismissedAt ?? rec.dbActionedAt ?? undefined)}. We'll
                      keep monitoring and flag it again if it gets worse.
                    </p>
                  </div>
                )}
                {isDone && (
                  <div
                    className={`flex items-start gap-2 p-3 rounded-lg text-sm ${DONE_PANEL[verification].className}`}
                  >
                    <DoneIcon className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      {DONE_PANEL[verification].message(doneWhen, rec.autoResolved)}
                    </p>
                  </div>
                )}
                {isDone && (status?.note || rec.dbNote) && (
                  <p className="text-xs text-muted-foreground italic mt-2 pl-1">
                    "{status?.note ?? rec.dbNote}"
                  </p>
                )}
              </div>
            </div>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-6 pb-6 space-y-5 overflow-hidden"
              >
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-primary" />
                    Why this matters for your business
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {rec.whyItMatters}
                  </p>
                </div>

                {rec.competitorReference && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm">
                    <TrendingUp className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-muted-foreground leading-relaxed">
                      {rec.competitorReference}
                    </p>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-semibold mb-3">What to do</h4>
                  <div className="space-y-3">
                    {rec.steps.map((step, j) => (
                      <div key={j} className="flex gap-3 text-sm">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold mt-0.5">
                          {j + 1}
                        </span>
                        <p className="leading-relaxed">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border/50 flex-wrap gap-3">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ArrowRight className="w-3 h-3" />
                      {rec.impact}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {rec.timeframe}
                    </span>
                  </div>
                  {!isDone && !isDismissed && !showNote && (
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDismiss(rec.id)}
                        className="gap-1.5 text-muted-foreground"
                      >
                        <EyeOff className="w-3.5 h-3.5" /> Not a priority
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowNote(true)}>
                        Add a note
                      </Button>
                      <Button size="sm" onClick={() => onMarkDone(rec.id)} className="gap-1.5">
                        <Check className="w-3.5 h-3.5" /> Mark as done
                      </Button>
                    </div>
                  )}
                  {isDone && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onUndo(rec.id)}
                      className="gap-1.5 text-muted-foreground"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Undo
                    </Button>
                  )}
                  {isDismissed && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRestore(rec.id)}
                      className="gap-1.5 text-muted-foreground"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Bring back
                    </Button>
                  )}
                </div>

                {showNote && !isDone && (
                  <div className="space-y-2 pt-1">
                    <Textarea
                      placeholder="Optional: a quick note on what you did"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="min-h-[70px] text-sm"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowNote(false);
                          setNote('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveWithNote} className="gap-1.5">
                        <Check className="w-3.5 h-3.5" /> Save & mark done
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const EmptyState = ({ aiError }: { aiError?: string }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="p-3 rounded-xl bg-primary/10 mb-4">
      {aiError ? (
        <AlertTriangle className="w-6 h-6 text-amber-500" />
      ) : (
        <Lightbulb className="w-6 h-6 text-primary" />
      )}
    </div>
    {aiError ? (
      <>
        <h2 className="font-semibold text-base mb-1">Recommendations temporarily unavailable</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          We couldn&apos;t generate this week&apos;s actions. We&apos;ll retry automatically on the
          next scan. Your previous recommendations are still saved.
        </p>
      </>
    ) : (
      <>
        <h2 className="font-semibold text-base mb-1">No recommendations yet</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Run a scan from the dashboard to generate your personalised action plan.
        </p>
      </>
    )}
  </div>
);

const ActionPlan = () => {
  const { priorityActions, project, setPriorityActions } = useRivalRadarStore();
  // Local state only for optimistic updates + verification tracking (not persisted)
  const [statuses, setStatuses] = useState<Record<string, ActionStatus>>({});

  // Done in the last 30 days, with their scan verification. Kept out of the store so
  // the sidebar badge and dashboard panel still count live actions only.
  const [completedActions, setCompletedActions] = useState<PriorityAction[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);
  const [scan, setScan] = useState<OwnScanState | null>(null);
  const projectId = project?.id;

  const reload = useCallback(() => {
    if (!projectId) return;
    Promise.all([fetchPriorityActions(projectId), fetchPlanHistory(projectId)])
      .then(([live, history]) => {
        setPriorityActions(live);
        setCompletedActions(history.completed);
        setQueuedCount(history.queuedCount);
        setScan(history.scan);
      })
      .catch((err) => {
        console.error('[ActionPlan] Failed to fetch priority actions:', err);
      });
  }, [projectId, setPriorityActions]);

  // Reload on mount and when the tab comes back into view: the weekly scan can
  // rebuild the plan while this page sits open.
  useEffect(() => {
    reload();
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  // Fall back to sample data in dev so the page can be previewed when empty.
  const usingMock = !priorityActions.length && !completedActions.length && IS_DEV;
  const effectiveActions = usingMock ? MOCK_PRIORITY_ACTIONS : priorityActions;

  const recommendations = useMemo(() => {
    const liveIds = new Set(effectiveActions.map((a) => a.id));
    return [...effectiveActions, ...completedActions.filter((a) => !liveIds.has(a.id))].map((a) =>
      mapAction(a),
    );
  }, [effectiveActions, completedActions]);

  const handleMarkDone = (id: PriorityActionId, note?: string) => {
    // Optimistic update
    setStatuses((prev) => ({
      ...prev,
      [id]: { done: true, doneAt: new Date().toISOString(), note, verification: 'pending' },
    }));
    if (usingMock || !project?.id) return;
    updateActionStatus(id, project.id, 'completed', note).then(reload);
  };

  const handleUndo = (id: PriorityActionId) => {
    setStatuses((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (usingMock || !project?.id) return;
    updateActionStatus(id, project.id, 'active').then(reload);
  };

  const handleDismiss = (id: PriorityActionId) => {
    // Optimistic update
    setStatuses((prev) => ({
      ...prev,
      [id]: {
        done: false,
        verification: 'pending',
        dismissed: true,
        dismissedAt: new Date().toISOString(),
      },
    }));
    if (usingMock || !project?.id) return;
    updateActionStatus(id, project.id, 'snoozed').then(reload);
  };

  const handleRestore = (id: PriorityActionId) => {
    setStatuses((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (usingMock || !project?.id) return;
    updateActionStatus(id, project.id, 'active').then(reload);
  };

  const { active, completed, dismissed } = useMemo(() => {
    const active: Recommendation[] = [];
    const completed: Recommendation[] = [];
    const dismissed: Recommendation[] = [];
    recommendations.forEach((r) => {
      const s = statuses[r.dbId];
      const isDone = r.dbStatus === 'completed' || !!s?.done;
      const isSnoozed = r.dbStatus === 'snoozed' || !!s?.dismissed;
      if (isSnoozed) dismissed.push(r);
      else if (isDone) completed.push(r);
      else active.push(r);
    });
    return { active, completed, dismissed };
  }, [recommendations, statuses]);

  const aiError = project?.ownBusiness?.enrichmentErrors?.ai_actions;
  if (!recommendations.length) return <EmptyState aiError={aiError} />;
  const showAiWarning = !!aiError && !usingMock;

  const priorities: Priority[] = ['critical', 'high', 'medium', 'quick-win'];
  const verifiedCount = completed.filter((r) => r.verification === 'verified').length;

  const weekAgo = Date.now() - 7 * DAY_MS;
  const inLastWeek = (iso: string | null) => !!iso && new Date(iso).getTime() >= weekAgo;
  const newThisWeek = active.filter((r) => inLastWeek(r.generatedAt)).length;
  const fixedThisWeek = completed.filter(
    (r) => r.verification === 'verified' && inLastWeek(r.verifiedAt),
  ).length;
  const waitingForScan = completed.filter((r) => r.verification === 'pending').length;
  // Queued actions are open gaps too, just not shown until a slot frees up.
  const openTotal = active.length + queuedCount;
  const businessName = project?.ownBusiness.name ?? 'your business';

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-greeting p-6 border border-primary/10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shrink-0 shadow-sm">
              <Lightbulb className="w-6 h-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold text-foreground">
                Here's what I'd focus on for {businessName}
              </h1>
              <p className="text-muted-foreground text-sm mt-1 max-w-2xl leading-relaxed">
                Based on your latest crawl, Google data, and competitor analysis. Tick things off as
                you go and I'll confirm they've landed on the next scan.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {showAiWarning && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              We couldn&apos;t refresh your recommendations on the last scan, so we&apos;re showing
              your most recent actions below. We&apos;ll retry on the next scan.
            </p>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-8"
      >
        <Card className="neu">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium mb-1">Your plan</p>
                <p className="text-xs text-muted-foreground">
                  {active.length} to look at · {completed.length} sorted · {verifiedCount} confirmed
                </p>
              </div>
              <Badge
                variant="outline"
                className="text-[11px] gap-1 bg-accent/10 text-accent-strong border-accent/30"
              >
                <Clock className="w-3 h-3" />
                {scanTimingLabel(scan)}
              </Badge>
            </div>
            {!usingMock && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 rounded-xl bg-muted/40">
                {[
                  {
                    value: fixedThisWeek,
                    label: 'Confirmed fixed this week',
                    tone: 'text-success-strong',
                  },
                  {
                    value: waitingForScan,
                    label: 'Ticked, waiting for next scan',
                    tone: 'text-muted-foreground',
                  },
                  { value: newThisWeek, label: 'New this week', tone: 'text-primary' },
                  { value: openTotal, label: 'Open in total', tone: 'text-foreground' },
                ].map((s) => (
                  <div key={s.label}>
                    <p className={`font-display text-xl font-extrabold ${s.tone}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {priorities.map((p) => {
                const config = priorityConfig[p];
                const count = active.filter((r) => r.priority === p).length;
                return (
                  <div key={p} className="flex items-center gap-2 text-sm">
                    <config.icon className={`w-4 h-4 ${config.color}`} />
                    <span className="text-muted-foreground">
                      {count} {config.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="space-y-10">
        {priorities.map((priority) => {
          const config = priorityConfig[priority];
          const recs = active.filter((r) => r.priority === priority);
          if (!recs.length) return null;
          return (
            <div key={priority}>
              <div className="flex items-center gap-2 mb-4">
                <config.icon className={`w-5 h-5 ${config.color}`} />
                <h2 className="font-display text-lg font-semibold">{config.label}</h2>
                <span className="text-xs text-muted-foreground ml-1">· {config.description}</span>
              </div>
              <div className="space-y-4">
                {recs.map((rec, i) => (
                  <RecommendationCard
                    key={rec.id}
                    rec={rec}
                    index={i}
                    status={statuses[rec.dbId]}
                    onMarkDone={handleMarkDone}
                    onUndo={handleUndo}
                    onDismiss={handleDismiss}
                    onRestore={handleRestore}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {completed.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <h2 className="font-display text-lg font-semibold">Nice work, you've sorted these</h2>
              <span className="text-xs text-muted-foreground ml-1">
                · {verifiedCount} confirmed · {waitingForScan} waiting for next scan
              </span>
            </div>
            <div className="space-y-4">
              {completed.map((rec, i) => (
                <RecommendationCard
                  key={rec.id}
                  rec={rec}
                  index={i}
                  status={statuses[rec.dbId]}
                  onMarkDone={handleMarkDone}
                  onUndo={handleUndo}
                  onDismiss={handleDismiss}
                  onRestore={handleRestore}
                />
              ))}
            </div>
          </div>
        )}

        {dismissed.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <EyeOff className="w-5 h-5 text-muted-foreground" />
              <h2 className="font-display text-lg font-semibold">Not a priority right now</h2>
              <span className="text-xs text-muted-foreground ml-1">
                · we'll keep monitoring quietly and flag any of these if the signal gets worse
              </span>
            </div>
            <div className="space-y-4">
              {dismissed.map((rec, i) => (
                <RecommendationCard
                  key={rec.id}
                  rec={rec}
                  index={i}
                  status={statuses[rec.dbId]}
                  onMarkDone={handleMarkDone}
                  onUndo={handleUndo}
                  onDismiss={handleDismiss}
                  onRestore={handleRestore}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActionPlan;
