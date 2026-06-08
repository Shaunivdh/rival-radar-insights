'use client';

import { motion } from 'framer-motion';
import { Mail, Search, BarChart3, Users, Star, Sparkles, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const steps = [
  {
    icon: Search,
    title: 'Scanning your business',
    detail: 'Pulling your Google profile, website signals, and local listings.',
  },
  {
    icon: Users,
    title: 'Mapping local competitors',
    detail: "Identifying who's ranking near you and gathering their public data.",
  },
  {
    icon: Star,
    title: 'Analysing reviews',
    detail: 'Reading every review (yours and theirs) for sentiment and themes.',
  },
  {
    icon: BarChart3,
    title: 'Building your baseline',
    detail: 'Calculating your score across all 6 dimensions.',
  },
];

export default function DashboardLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#EEF2FF] via-[#F5F3FF] to-[#FFF7ED] p-8 md:p-12 text-center border border-[#E8E4FF]"
      >
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-[#5B4EE8]/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-[#5B4EE8]/15 blur-3xl pointer-events-none" />

        <div className="relative">
          {/* Owl with pulsing rings */}
          <div className="relative w-28 h-28 mx-auto mb-6">
            <motion.div
              animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              className="absolute inset-0 rounded-full bg-[#5B4EE8]/30"
            />
            <motion.div
              animate={{ scale: [1, 1.6, 1], opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
              className="absolute inset-0 rounded-full bg-[#5B4EE8]/20"
            />
            <div className="relative w-full h-full rounded-full bg-white shadow-md flex items-center justify-center">
              <span className="text-5xl" role="img" aria-label="owl">
                🦉
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur px-4 py-1.5 text-xs font-medium text-[#5B4EE8] border border-[#5B4EE8]/15 mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Setting things up
          </div>

          <h1 className="font-display text-3xl md:text-4xl font-semibold leading-tight mb-3">
            We're getting your info together
          </h1>
          <p className="text-foreground/70 max-w-xl mx-auto leading-relaxed">
            Your first scan takes{' '}
            <span className="font-semibold text-foreground">10–15 minutes</span>. We'll send you an
            email the moment your dashboard is ready — no need to wait around.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 backdrop-blur px-4 py-2 text-sm border border-border/40">
              <Mail className="w-4 h-4 text-[#5B4EE8]" />
              <span className="text-foreground/80">You'll be emailed when ready</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 backdrop-blur px-4 py-2 text-sm border border-border/40">
              <Clock className="w-4 h-4 text-[#5B4EE8]" />
              <span className="text-foreground/80">~10–15 minutes</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Steps */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl bg-card/70 backdrop-blur-sm p-6 md:p-8 border border-border/40 neu"
      >
        <div className="mb-6">
          <h2 className="font-display text-lg font-semibold">What we're doing right now</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            A peek behind the scenes while Scoutly does its thing.
          </p>
        </div>

        <div className="space-y-3">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.1 }}
              className="flex items-start gap-4 p-4 rounded-xl bg-background/60 border border-border/30"
            >
              <div className="relative shrink-0">
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.3 }}
                  className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"
                >
                  <step.icon className="w-5 h-5" />
                </motion.div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-foreground">{step.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {step.detail}
                </p>
              </div>
              <div className="shrink-0">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  className="w-4 h-4 rounded-full border-2 border-primary/20 border-t-primary"
                />
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* What to do next */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 gap-4"
      >
        <div className="rounded-2xl bg-card p-6 border border-border/40 text-center">
          <h3 className="font-display font-semibold text-base mb-1">Curious what we track?</h3>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            See the 6 dimensions Scoutly scores you on every week.
          </p>
          <Button asChild variant="outline" className="rounded-xl">
            <Link href="/what-we-track">See what we track</Link>
          </Button>
        </div>
      </motion.div>

      {/* Footer reassurance */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-center text-xs text-muted-foreground"
      >
        You can safely close this tab — we'll email you the moment your dashboard is ready.
      </motion.p>
    </div>
  );
}
