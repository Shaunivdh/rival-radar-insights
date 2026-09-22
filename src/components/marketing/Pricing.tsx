'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Placeholder price. Replace with the Stripe plan once billing is wired up. */
const PRICE = '£12.99';

const INCLUDED = [
  'One business and up to five local competitors',
  'Weekly scans across all six scoring dimensions',
  'Three ranked priority actions every week',
  'Change alerts when a rival moves',
  'AI visibility checks on local search prompts',
  'Cancel whenever you like',
];

const Pricing = () => {
  return (
    <section className="relative overflow-hidden py-24 md:py-32">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.06] blur-[150px]" />

      <div className="container relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-primary">Pricing</p>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-5xl">
            One plan, everything in it
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">
            Less than a round of coffees, and a lot more useful than the agency retainer you were
            quoted.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mx-auto mt-14 max-w-md"
        >
          <div className="neu rounded-2xl p-8">
            <p className="text-center font-display text-sm font-semibold uppercase tracking-[0.14em] text-primary">
              Scoutly
            </p>

            <div className="mt-4 flex items-baseline justify-center gap-2">
              <span className="font-display text-5xl font-bold tracking-tight">{PRICE}</span>
              <span className="text-sm text-muted-foreground">per month</span>
            </div>

            <ul className="mt-8 space-y-3">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-foreground/85">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Check className="h-3 w-3 text-primary" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <Button
              variant="hero"
              size="lg"
              className="mt-8 h-12 w-full rounded-full text-base"
              asChild
            >
              <Link href="/signup">
                Start your free scan
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              No card needed to run your first scan.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Pricing;
