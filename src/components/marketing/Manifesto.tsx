'use client';

import { motion } from 'framer-motion';

const Manifesto = () => {
  return (
    <section className="relative overflow-hidden py-32 md:py-48">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.05] blur-[140px]" />

      <div className="container relative">
        <div className="mx-auto max-w-6xl">
          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="mb-16 max-w-4xl font-display text-3xl font-bold leading-[1.05] tracking-[-0.02em] md:text-5xl lg:text-6xl"
          >
            Being good is <span className="text-muted-foreground">not the same as</span>
            <br />
            being <span className="text-gradient-hero">found</span>.
          </motion.h2>

          <div className="grid gap-8 md:grid-cols-12 md:gap-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="md:col-span-5 md:col-start-2"
            >
              <p className="text-lg leading-relaxed text-foreground/85 md:text-xl">
                You're great at what you do. Your customers love you. But online, the business two
                streets over is winning calls you should be getting.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="md:col-span-5"
            >
              <p className="text-lg leading-relaxed text-foreground/85 md:text-xl">
                Scoutly closes that gap. Not with another dashboard you'll never open, but with one
                short email that tells you exactly what to fix, every Monday at 7am.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Manifesto;
