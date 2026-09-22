'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Building2, Globe, MapPin, Sparkles, Star, TrendingUp } from 'lucide-react';

const DIMENSIONS = [
  {
    icon: Star,
    title: 'Reputation',
    body: 'Star ratings, review volume and what people actually complain about, yours and theirs side by side.',
  },
  {
    icon: MapPin,
    title: 'Local SEO visibility',
    body: 'Who shows up when someone nearby searches for what you sell, and how far off the pace you are.',
  },
  {
    icon: Globe,
    title: 'Website quality',
    body: 'Speed, structure, pricing pages, booking links and the trust signals customers look for before they call.',
  },
  {
    icon: Building2,
    title: 'Google Business Profile',
    body: 'Hours, photos, services, attributes and posts. The free listing most businesses half fill in and forget.',
  },
  {
    icon: Sparkles,
    title: 'AI visibility',
    body: 'When someone asks an AI assistant for a local recommendation, we check whether your name comes up at all.',
  },
  {
    icon: TrendingUp,
    title: 'Review velocity',
    body: 'Not just how many reviews you have, but how fast they are arriving compared with everyone around you.',
  },
];

const Dimensions = () => {
  return (
    <section className="relative overflow-hidden py-24 md:py-32">
      <div className="pointer-events-none absolute right-0 top-1/3 h-[500px] w-[500px] rounded-full bg-accent/[0.06] blur-[140px]" />

      <div className="container relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-primary">
            What we track
          </p>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-5xl">
            Six things that decide who gets the call
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">
            Every business in your project is scored the same way, every week, so the gap between
            you and them is a number you can watch move.
          </p>
        </motion.div>

        <div className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {DIMENSIONS.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
                className="card-surface"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/what-we-track"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-opacity hover:opacity-80"
          >
            See every signal we check
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Dimensions;
