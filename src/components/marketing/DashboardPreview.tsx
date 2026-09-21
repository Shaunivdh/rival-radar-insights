'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, ArrowUpRight, Circle } from 'lucide-react';

/**
 * Static, non-interactive mock of the Scoutly dashboard for the marketing hero.
 * All figures are illustrative. No data fetching, no crawl logic.
 */

const DIMENSIONS = [
  { label: 'Reputation', score: 84 },
  { label: 'Local SEO', score: 61 },
  { label: 'Website quality', score: 72 },
  { label: 'Google profile', score: 58 },
  { label: 'AI visibility', score: 40 },
  { label: 'Review velocity', score: 79 },
];

const LEADERBOARD = [
  { rank: 1, name: 'Riverside Dental Care', score: 81, you: false },
  { rank: 2, name: 'The Smile Rooms', score: 78, you: false },
  { rank: 3, name: 'Brightside Dental', score: 72, you: true },
  { rank: 4, name: 'Kings Road Dental', score: 66, you: false },
  { rank: 5, name: 'Parkview Dental', score: 59, you: false },
];

const ACTIONS = [
  {
    severity: 'High',
    className: 'severity-high',
    title: 'Add opening hours and services to your Google profile',
    meta: 'Riverside lists 14 services, you list 3',
  },
  {
    severity: 'Medium',
    className: 'severity-medium',
    title: 'Reply to the 14 reviews left in the last 30 days',
    meta: 'Response rate 22 percent, local average 68 percent',
  },
  {
    severity: 'Low',
    className: 'severity-low',
    title: 'Publish a Putney page with treatment pricing',
    meta: 'Three rivals rank for "dentist putney prices"',
  },
];

const scoreColour = (score: number) => {
  if (score >= 80) return 'hsl(var(--score-excellent))';
  if (score >= 65) return 'hsl(var(--score-good))';
  if (score >= 50) return 'hsl(var(--score-average))';
  return 'hsl(var(--score-poor))';
};

const DashboardPreview = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.45 }}
      aria-hidden="true"
      className="relative mx-auto max-w-5xl"
    >
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--neu-shadow-strong)]">
        {/* Browser chrome */}
        <div className="flex h-10 items-center gap-2 border-b border-border/60 bg-muted/50 px-4">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/50" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/40" />
          <div className="ml-3 hidden rounded-full bg-background px-3 py-1 text-[11px] text-muted-foreground sm:block">
            app.scoutly.io/dashboard
          </div>
        </div>

        {/* Dashboard body */}
        <div className="bg-gradient-canvas p-4 md:p-5">
          <div className="grid gap-4 md:grid-cols-5">
            {/* Health score */}
            <div className="card-surface md:col-span-2">
              <p className="metric-label">Your health score</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="metric-value">72</span>
                <span className="text-sm text-muted-foreground">/ 100</span>
                <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--success))]">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  +6 this month
                </span>
              </div>

              <div className="mt-4 space-y-2.5">
                {DIMENSIONS.map((d) => (
                  <div key={d.label}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">{d.label}</span>
                      <span className="font-medium text-foreground">{d.score}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${d.score}%`, background: scoreColour(d.score) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Leaderboard */}
            <div className="card-surface md:col-span-3">
              <div className="flex items-center justify-between">
                <p className="metric-label">Local leaderboard</p>
                <span className="text-[11px] text-muted-foreground">Putney, SW15</span>
              </div>

              <div className="mt-4 space-y-1">
                {LEADERBOARD.map((row) => (
                  <div
                    key={row.name}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                      row.you ? 'bg-primary/[0.07] ring-1 ring-primary/20' : ''
                    }`}
                  >
                    <span className="w-4 text-xs font-medium text-muted-foreground">
                      {row.rank}
                    </span>
                    <span
                      className={`flex-1 truncate text-sm ${row.you ? 'font-semibold text-foreground' : 'text-foreground/80'}`}
                    >
                      {row.name}
                      {row.you && (
                        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          You
                        </span>
                      )}
                    </span>
                    <span className="w-24 hidden sm:block">
                      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${row.score}%`, background: scoreColour(row.score) }}
                        />
                      </span>
                    </span>
                    <span className="w-7 text-right text-sm font-semibold text-foreground">
                      {row.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Priority actions */}
          <div className="card-surface mt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-accent" />
              <p className="metric-label">Fix these three this week</p>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {ACTIONS.map((action) => (
                <div key={action.title} className="rounded-xl bg-background/70 p-3">
                  <span className={`score-chip ${action.className}`}>
                    <Circle className="h-2 w-2 fill-current" />
                    {action.severity}
                  </span>
                  <p className="mt-2 text-xs font-medium leading-snug text-foreground">
                    {action.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    {action.meta}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default DashboardPreview;
