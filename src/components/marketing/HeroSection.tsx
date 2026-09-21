'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DashboardPreview from './DashboardPreview';

const HeroSection = () => {
  return (
    <section className="relative overflow-hidden pb-16 pt-28 md:pt-32">
      {/* Background glows */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[700px] w-[1100px] -translate-x-1/2 rounded-full bg-primary/[0.10] blur-[160px]" />
      <div className="pointer-events-none absolute right-0 top-[20%] h-[500px] w-[500px] rounded-full bg-accent/[0.07] blur-[140px]" />

      <div className="container relative z-[1]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 text-center"
        >
          <span className="text-xs tracking-wide text-muted-foreground md:text-sm">
            UK local competitor intelligence, built for small businesses
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mx-auto max-w-4xl text-center font-display text-4xl font-bold leading-[1.05] tracking-tight [text-wrap:balance] md:text-6xl lg:text-7xl"
        >
          Win your local street with <span className="text-gradient-hero">Scoutly</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mx-auto mt-6 max-w-xl text-center text-base leading-relaxed text-muted-foreground md:text-lg"
        >
          Scoutly tracks every business you compete with locally: reviews, rankings, even AI
          mentions, and tells you the three things to fix this week.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <Button variant="hero" size="lg" className="h-12 rounded-full px-6 text-base" asChild>
            <Link href="/signup">
              Start your free scan
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="h-12 rounded-full px-5 text-base hover:bg-secondary hover:text-foreground"
            asChild
          >
            <a href="#how">
              <Play className="h-4 w-4" />
              See how it works
            </a>
          </Button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-5 text-center text-xs text-muted-foreground"
        >
          No card · Setup in 5 minutes · Cancel anytime
        </motion.p>

        <div className="mt-16 md:mt-20">
          <DashboardPreview />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
