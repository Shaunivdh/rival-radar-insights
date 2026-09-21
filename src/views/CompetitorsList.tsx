'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useRivalRadarStore } from '@/store/rivalradar';
import { addCompetitor, triggerSingleScan } from '@/actions/projects';
import type { Business } from '@/types';
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  Globe,
  MapPin,
  ExternalLink,
  Eye,
  Trophy,
  Target,
  AlertCircle,
  Archive,
  ArchiveRestore,
  Clock,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ── helpers ────────────────────────────────────────────────────────────────

const getScoreColor = (s: number) =>
  s >= 80
    ? 'text-[hsl(142,71%,35%)]'
    : s >= 60
      ? 'text-primary'
      : s >= 40
        ? 'text-[hsl(38,92%,40%)]'
        : 'text-destructive';

const TrendIcon = ({ delta }: { delta: number | null }) => {
  if (!delta || delta === 0)
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground text-xs font-semibold">
        <Minus className="w-3.5 h-3.5" />0
      </span>
    );
  if (delta > 0)
    return (
      <span className="inline-flex items-center gap-1 text-[hsl(142,71%,35%)] text-xs font-semibold">
        <TrendingUp className="w-3.5 h-3.5" />+{delta}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-destructive text-xs font-semibold">
      <TrendingDown className="w-3.5 h-3.5" />
      {delta}
    </span>
  );
};

const getStrengths = (biz: Business): string[] => {
  if (!biz.aiScore) return [];
  const s: string[] = [];
  if (biz.aiScore.reputationScore !== null && biz.aiScore.reputationScore >= 70) s.push('Reviews');
  if (biz.aiScore.localVisibilityScore >= 70) s.push('Local SEO');
  if (biz.aiScore.websiteHealthScore !== null && biz.aiScore.websiteHealthScore >= 70)
    s.push('Website');
  if (biz.aiScore.gbpCompletenessScore !== null && biz.aiScore.gbpCompletenessScore >= 70)
    s.push('GBP');
  return s;
};

const getWeaknesses = (biz: Business): string[] => {
  if (!biz.aiScore) return [];
  const w: string[] = [];
  if (biz.aiScore.reputationScore !== null && biz.aiScore.reputationScore < 40) w.push('Reviews');
  if (biz.aiScore.localVisibilityScore < 40) w.push('Local SEO');
  if (biz.aiScore.websiteHealthScore !== null && biz.aiScore.websiteHealthScore < 40)
    w.push('Website');
  if (biz.aiScore.gbpCompletenessScore !== null && biz.aiScore.gbpCompletenessScore < 40)
    w.push('GBP');
  return w;
};

// show just the city/town from a full address
const extractCity = (address: string | undefined) => {
  if (!address) return null;
  const parts = address.split(',');
  return parts.length >= 2 ? parts[parts.length - 2].trim() : parts[0].trim();
};

// ── main component ──────────────────────────────────────────────────────────

type ArchivedEntry = { biz: Business; archivedAt: string };

const isDev = process.env.NODE_ENV === 'development';

const CompetitorsList = () => {
  const { project, addCompetitorToStore, syncBusinesses } = useRivalRadarStore();
  const searchParams = useSearchParams();
  const debugMode = isDev && searchParams.get('debug') === 'true';
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', url: '' });
  const [formError, setFormError] = useState('');
  const [adding, setAdding] = useState(false);
  const [archived, setArchived] = useState<ArchivedEntry[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [rescanningId, setRescanningId] = useState<string | null>(null);

  const handleRescanOne = async (businessId: string) => {
    setRescanningId(businessId);
    await triggerSingleScan(businessId);
    syncBusinesses([{ id: businessId, crawlStatus: 'pending', signals: null, aiScore: null }]);
    setRescanningId(null);
  };

  if (!project) return null;

  const own = project.ownBusiness;
  const ownScore = own.aiScore?.overallScore ?? 0;

  // Exclude locally-archived ones from active list
  const archivedIds = new Set(archived.map((a) => a.biz.id));
  const active = project.competitors.filter((c) => !archivedIds.has(c.id));
  const slotsLeft = Math.max(0, 5 - active.length);

  const archiveCompetitor = (biz: Business) => {
    const archivedAt = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    setArchived((prev) => [...prev, { biz, archivedAt }]);
  };

  const restoreCompetitor = (id: string) => {
    if (slotsLeft === 0) return;
    setArchived((prev) => prev.filter((a) => a.biz.id !== id));
  };

  const removeArchived = (id: string) => {
    setArchived((prev) => prev.filter((a) => a.biz.id !== id));
  };

  const handleAdd = async () => {
    setFormError('');
    if (!form.name.trim() || !form.url.trim()) {
      setFormError('Both fields are required.');
      return;
    }
    if (slotsLeft === 0) {
      setFormError('No slots left. Archive an active competitor first.');
      return;
    }
    setAdding(true);
    try {
      const newBiz = await addCompetitor(project.id, {
        name: form.name.trim(),
        url: form.url.trim(),
        domain: form.url.trim(),
      });
      addCompetitorToStore(newBiz);
      setForm({ name: '', url: '' });
      setOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to add competitor.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold mb-2">Competitors</h1>
          <p className="text-muted-foreground">
            Track up to 5 local rivals. Spot what they do better, and where you can overtake them.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-4 h-4" />
              Add competitor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a competitor</DialogTitle>
              <DialogDescription>
                Enter their business name and website URL. We'll start tracking within 24h.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="comp-name">Business name</Label>
                <Input
                  id="comp-name"
                  placeholder="e.g. AquaFix Plumbing"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comp-url">Website URL</Label>
                <Input
                  id="comp-url"
                  placeholder="https://example.co.uk"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                />
              </div>
              {formError && <p className="text-xs text-destructive">{formError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                disabled={adding}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {adding ? 'Adding…' : 'Start tracking'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Tracked', value: active.length, icon: Eye, color: 'text-primary' },
          {
            label: 'Above you',
            value: active.filter((c) => (c.aiScore?.overallScore ?? 0) > ownScore).length,
            icon: Trophy,
            color: 'text-[hsl(142,71%,35%)]',
          },
          {
            label: 'Below you',
            value: active.filter((c) => (c.aiScore?.overallScore ?? 0) <= ownScore).length,
            icon: Target,
            color: 'text-[hsl(38,92%,40%)]',
          },
          { label: 'Slots left', value: slotsLeft, icon: Plus, color: 'text-muted-foreground' },
        ].map((s) => (
          <div key={s.label} className="card-surface flex items-center gap-4">
            <div
              className={`w-11 h-11 rounded-xl bg-muted/60 flex items-center justify-center ${s.color}`}
            >
              <s.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Your row */}
      <div className="card-surface mb-4 bg-primary/5 flex items-center gap-6 flex-wrap">
        <Badge className="bg-primary text-primary-foreground">YOU</Badge>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">{own.name}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {extractCity(own.googleData?.address) ?? own.domain}
            {own.googleData && ` · ${own.googleData.reviewCount} reviews`}
          </p>
        </div>
        {own.googleData && (
          <div className="hidden md:flex items-center gap-1 text-sm">
            <Star className="w-4 h-4 fill-[hsl(38,92%,50%)] text-[hsl(38,92%,50%)]" />
            {own.googleData.googleRating}
          </div>
        )}
        <div className={`font-bold text-3xl ${getScoreColor(ownScore)}`}>
          {own.aiScore ? ownScore : '—'}
        </div>
      </div>

      {/* Competitor cards */}
      <div className="space-y-3">
        {active.map((c, i) => {
          const score = c.aiScore?.overallScore ?? null;
          const delta = c.aiScore?.weeklyDelta ?? null;
          const strengths = getStrengths(c);
          const weaknesses = getWeaknesses(c);
          const city = extractCity(c.googleData?.address) ?? c.domain;

          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className="card-surface hover:-translate-y-0.5 transition-transform">
                <div className="flex items-center gap-6 flex-wrap lg:flex-nowrap">
                  {/* Name / location */}
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold">{c.name}</p>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-primary"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <MapPin className="w-3 h-3" />
                      {city}
                      <span>·</span>
                      <Globe className="w-3 h-3" />
                      {c.domain}
                    </p>
                  </div>

                  {/* Rating */}
                  {c.googleData ? (
                    <div className="flex items-center gap-1 text-sm w-24">
                      <Star className="w-4 h-4 fill-[hsl(38,92%,50%)] text-[hsl(38,92%,50%)]" />
                      {c.googleData.googleRating}
                      <span className="text-xs text-muted-foreground">
                        ({c.googleData.reviewCount})
                      </span>
                    </div>
                  ) : (
                    <div className="w-24 text-xs text-muted-foreground">No data</div>
                  )}

                  {/* Trend */}
                  <div className="w-16">
                    <TrendIcon delta={delta} />
                  </div>

                  {/* Score */}
                  <div
                    className={`font-bold text-3xl w-14 text-right ${score !== null ? getScoreColor(score) : 'text-muted-foreground'}`}
                  >
                    {score ?? '—'}
                  </div>

                  {/* Dev rescan + Archive */}
                  <TooltipProvider delayDuration={200}>
                    {isDev && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRescanOne(c.id)}
                            disabled={rescanningId === c.id}
                            className="text-muted-foreground hover:text-yellow-500 disabled:opacity-50"
                          >
                            <RefreshCw
                              className={`w-4 h-4 ${rescanningId === c.id ? 'animate-spin' : ''}`}
                            />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>[DEV] Re-scan this competitor</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => archiveCompetitor(c)}
                          className="text-muted-foreground hover:text-primary"
                        >
                          <Archive className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Archive, keeps history and frees a slot</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Strengths / weaknesses */}
                {(strengths.length > 0 || weaknesses.length > 0) && (
                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border/50">
                    {strengths.map((s) => (
                      <Badge
                        key={s}
                        variant="secondary"
                        className="bg-[hsl(142,71%,35%)]/10 text-[hsl(142,71%,35%)] border-0"
                      >
                        ↑ {s}
                      </Badge>
                    ))}
                    {weaknesses.map((w) => (
                      <Badge
                        key={w}
                        variant="secondary"
                        className="bg-destructive/10 text-destructive border-0"
                      >
                        ↓ {w}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}

        {active.length === 0 && archived.length === 0 && (
          <div className="card-surface p-10 text-center">
            <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No competitors yet. Add one above.</p>
          </div>
        )}
      </div>

      {/* Archived section */}
      {archived.length > 0 && (
        <div className="mt-10">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-3 mb-4 group"
          >
            <div className="w-9 h-9 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
              <Archive className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="font-semibold flex items-center gap-2">
                Archived
                <Badge variant="secondary" className="bg-muted text-muted-foreground border-0">
                  {archived.length}
                </Badge>
              </p>
              <p className="text-xs text-muted-foreground">
                Historic data preserved · doesn't count toward your 5 slots
              </p>
            </div>
            <span className="ml-auto text-xs text-primary font-medium">
              {showArchived ? 'Hide' : 'Show'}
            </span>
          </button>

          {showArchived && (
            <div className="space-y-3">
              {archived.map(({ biz: c, archivedAt }, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <div className="card-surface opacity-75 hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-6 flex-wrap lg:flex-nowrap">
                      <Badge
                        variant="secondary"
                        className="bg-muted text-muted-foreground border-0 gap-1"
                      >
                        <Archive className="w-3 h-3" />
                        HISTORIC
                      </Badge>

                      <div className="flex-1 min-w-[180px]">
                        <p className="font-semibold text-muted-foreground line-through decoration-muted-foreground/40">
                          {c.name}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <MapPin className="w-3 h-3" />
                          {extractCity(c.googleData?.address) ?? c.domain}
                          <span>·</span>
                          <Clock className="w-3 h-3" />
                          Archived {archivedAt}
                        </p>
                      </div>

                      {c.googleData && (
                        <div className="hidden md:flex items-center gap-1 text-sm w-24 text-muted-foreground">
                          <Star className="w-4 h-4" />
                          {c.googleData.googleRating}
                          <span className="text-xs">({c.googleData.reviewCount})</span>
                        </div>
                      )}

                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Last score
                        </p>
                        <p className="font-bold text-2xl text-muted-foreground">
                          {c.aiScore?.overallScore ?? '—'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => restoreCompetitor(c.id)}
                                disabled={slotsLeft === 0}
                                className="text-muted-foreground hover:text-primary disabled:opacity-40"
                              >
                                <ArchiveRestore className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {slotsLeft === 0
                                ? 'No slots free, archive an active competitor first'
                                : 'Restore to active tracking'}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeArchived(c.id)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete permanently</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DEV DEBUG — raw DB snapshot, visible at ?debug=true in development only */}
      {debugMode &&
        (() => {
          const allBiz = [
            { biz: own, label: 'YOU' },
            ...project.competitors.map((c) => ({ biz: c, label: c.name })),
          ];
          const cols: { key: keyof Business; label: string }[] = [
            { key: 'signals', label: 'Signals' },
            { key: 'googleData', label: 'Google' },
            { key: 'serpData', label: 'SERP' },
            { key: 'aiScore', label: 'AI Score' },
            { key: 'aiVisibility', label: 'AI Vis' },
            { key: 'pagespeedData', label: 'PageSpeed' },
            { key: 'reviewSentiment', label: 'Sentiment' },
          ];
          const ok = (v: unknown) => v != null;
          return (
            <div className="mt-10 space-y-6">
              {/* Audit matrix */}
              <div className="p-4 rounded-xl border border-dashed border-yellow-400 bg-yellow-50/5">
                <p className="text-xs font-mono text-yellow-500 mb-3 uppercase tracking-widest">
                  [DEV] Data coverage audit
                </p>
                <div className="overflow-x-auto">
                  <table className="text-xs font-mono w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left pr-4 pb-2 text-muted-foreground">Business</th>
                        <th className="text-left pr-3 pb-2 text-muted-foreground">Status</th>
                        {cols.map((c) => (
                          <th key={c.key} className="px-3 pb-2 text-muted-foreground">
                            {c.label}
                          </th>
                        ))}
                        <th className="pl-3 pb-2 text-muted-foreground">Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allBiz.map(({ biz, label }) => {
                        const filled = cols.filter((c) => ok(biz[c.key])).length;
                        return (
                          <tr key={biz.id} className="border-t border-border/30">
                            <td className="pr-4 py-1.5 text-yellow-400 font-semibold whitespace-nowrap">
                              {label}
                            </td>
                            <td className="pr-3 py-1.5 whitespace-nowrap">
                              <span
                                className={
                                  biz.crawlStatus === 'complete'
                                    ? 'text-green-500'
                                    : biz.crawlStatus === 'failed'
                                      ? 'text-red-500'
                                      : biz.crawlStatus === 'running'
                                        ? 'text-blue-400'
                                        : 'text-muted-foreground'
                                }
                              >
                                {biz.crawlStatus}
                              </span>
                            </td>
                            {cols.map((c) => (
                              <td key={c.key} className="px-3 py-1.5 text-center">
                                {ok(biz[c.key]) ? '✓' : <span className="text-red-500">✗</span>}
                              </td>
                            ))}
                            <td className="pl-3 py-1.5">
                              {biz.enrichmentErrors ? (
                                <span className="text-red-400">
                                  {Object.keys(biz.enrichmentErrors).join(', ')}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Summary row */}
                      <tr className="border-t-2 border-yellow-400/40">
                        <td colSpan={2} className="pt-2 text-muted-foreground">
                          Coverage
                        </td>
                        {cols.map((c) => {
                          const n = allBiz.filter(({ biz }) => ok(biz[c.key])).length;
                          return (
                            <td key={c.key} className="px-3 pt-2 text-center">
                              <span
                                className={
                                  n === allBiz.length ? 'text-green-500' : 'text-yellow-400'
                                }
                              >
                                {n}/{allBiz.length}
                              </span>
                            </td>
                          );
                        })}
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              {/* Raw JSON */}
              <div className="p-4 rounded-xl border border-dashed border-yellow-400/40 bg-yellow-50/5">
                <p className="text-xs font-mono text-yellow-500/70 mb-3 uppercase tracking-widest">
                  [DEV] Raw project data
                </p>
                <pre className="text-xs font-mono text-muted-foreground overflow-auto max-h-[600px] whitespace-pre-wrap break-all">
                  {JSON.stringify(project, null, 2)}
                </pre>
              </div>
            </div>
          );
        })()}
    </motion.div>
  );
};

export default CompetitorsList;
