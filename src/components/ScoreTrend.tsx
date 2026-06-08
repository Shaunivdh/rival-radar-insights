'use client';

import { motion } from 'framer-motion';
import { Sparkles, CalendarClock } from 'lucide-react';
import { useRivalRadarStore } from '@/store/rivalradar';

export function ScoreTrend() {
  const { project } = useRivalRadarStore();
  if (!project) return null;

  const ownScore = project.ownBusiness.aiScore?.overallScore;
  if (!ownScore) return null;

  const topCompScore =
    project.competitors.length > 0
      ? Math.max(...project.competitors.map((c) => c.aiScore?.overallScore ?? 0))
      : null;

  if (!topCompScore) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-2xl bg-gradient-to-br from-violet-50 via-white to-indigo-50 dark:from-violet-950/30 dark:via-background dark:to-indigo-950/20 p-8 border border-primary/10 shadow-sm"
    >
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">Score Trend</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Week 1 · Baseline established</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-background/70 backdrop-blur px-3 py-1.5 text-xs font-medium text-primary border border-primary/15">
          <Sparkles className="w-3.5 h-3.5" />
          Tracking started
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl bg-background/80 backdrop-blur p-5 border border-border/40"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Your Score
            </p>
          </div>
          <p className="font-display text-4xl font-bold text-foreground">{ownScore}</p>
          <p className="text-xs text-muted-foreground mt-1.5">Starting baseline this week</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl bg-background/80 backdrop-blur p-5 border border-border/40"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-accent" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Top Competitor
            </p>
          </div>
          <p className="font-display text-4xl font-bold text-foreground">{topCompScore}</p>
          <p className="text-xs text-muted-foreground mt-1.5">Their baseline this week</p>
        </motion.div>
      </div>

      <div className="rounded-xl bg-background/60 backdrop-blur border border-dashed border-primary/20 p-5">
        <div className="flex items-end justify-between gap-2 h-20 mb-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ height: 0, opacity: 0 }}
              animate={{
                height: i === 0 ? '70%' : `${20 + (i % 4) * 8}%`,
                opacity: i === 0 ? 1 : 0.25,
              }}
              transition={{ delay: 0.5 + i * 0.04, duration: 0.5 }}
              className={`flex-1 rounded-t-md ${i === 0 ? 'bg-gradient-to-t from-violet-600 to-indigo-400' : 'bg-muted-foreground/20'}`}
            />
          ))}
        </div>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 shrink-0">
            <CalendarClock className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Your trend chart unlocks as we gather more data
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Scoutly scans your business and competitors every week. Come back next Monday to see
              your first movement — and a richer chart with every week that passes.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
