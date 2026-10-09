'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { registerBetaInterest } from '@/actions/contact';

const INCLUDED = [
  'One business and up to five local competitors',
  'Regular scans across all six scoring dimensions',
  'Ranked priority actions, refreshed every scan',
  'Change alerts when a rival moves',
  'AI visibility checks on local search prompts',
  'Free for the whole beta',
];

/** Beta waitlist. Stands in for pricing until billing is wired up. */
const BetaSignup = () => {
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentRef = useRef<HTMLParagraphElement>(null);

  // The form unmounts on success, so hand focus to the confirmation; screen readers
  // announce the focused text, so no live region is needed (it would read twice).
  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;

    setSending(true);
    setError(null);
    try {
      const result = await registerBetaInterest({ email, businessName, website });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(true);
    } catch {
      // The action itself failed to run (offline, deploy mid request).
      setError('Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

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
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-primary">Beta</p>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-5xl">
            Join the free beta
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">
            We are opening Scoutly to a small group of local businesses first. Register your
            interest and we will invite you to the beta.
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
            <ul className="space-y-3">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-foreground/85">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Check className="h-3 w-3 text-primary" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            {sent ? (
              <div className="mt-8 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
                <p
                  ref={sentRef}
                  tabIndex={-1}
                  className="mt-3 font-display text-lg font-bold outline-none"
                >
                  You are on the list
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  We will email you an invite when your beta place is ready.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="beta-email" className="text-xs">
                    Your email
                  </Label>
                  <Input
                    id="beta-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourbusiness.co.uk"
                    required
                    maxLength={254}
                    disabled={sending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="beta-business" className="text-xs">
                    Business name
                  </Label>
                  <Input
                    id="beta-business"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Your business"
                    required
                    maxLength={120}
                    disabled={sending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="beta-website" className="text-xs">
                    Website
                  </Label>
                  <Input
                    id="beta-website"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="yourbusiness.co.uk"
                    required
                    maxLength={254}
                    disabled={sending}
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="hero"
                  size="lg"
                  className="h-12 w-full rounded-full text-base"
                  disabled={sending}
                >
                  {sending ? 'Sending...' : 'Register interest'}
                  {!sending && <ArrowRight className="ml-1 h-4 w-4" />}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  No card needed. We only use your details to invite you to the beta.
                </p>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default BetaSignup;
