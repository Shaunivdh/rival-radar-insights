'use client';

import { motion } from 'framer-motion';

const STEPS = [
  {
    step: '01',
    title: 'Tell us who you compete with',
    body: 'Add your business and up to five local rivals. It takes about five minutes, and you only do it once.',
  },
  {
    step: '02',
    title: 'Scoutly does the digging',
    body: 'Every week we scan their reviews, search rankings, websites, Google profiles and what AI assistants say when someone asks for a local recommendation.',
  },
  {
    step: '03',
    title: 'You get three things to fix',
    body: 'Ranked by impact, written in plain English, with the evidence behind each one. No jargon, no 40 page report.',
  },
];

const HowItWorks = () => {
  return (
    <section className="relative py-24 md:py-32">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-primary">
            How it works
          </p>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-5xl">
            Three steps, then it runs itself
          </h2>
        </motion.div>

        <div className="mx-auto mt-16 grid max-w-5xl gap-6 md:grid-cols-3">
          {STEPS.map((item, i) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="card-surface"
            >
              <span className="font-display text-sm font-bold text-primary">{item.step}</span>
              <h3 className="mt-3 font-display text-xl font-semibold tracking-tight">
                {item.title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
