'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  X,
  Building2,
  Globe,
  MapPin,
  Tag,
  Users,
  Mail,
  Lock,
  Info,
  Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Logo } from '@/components/Logo';
import { toast } from '@/hooks/use-toast';
import { useRivalRadarStore } from '@/store/rivalradar';
import { createProject, triggerInitialScans } from '@/actions/projects';
import { SERVICE_CATEGORY_OPTIONS, type ServiceCategory } from '@/lib/serviceCategories';
import { normalizeUrl, extractDomain, isValidUrl } from '@/lib/url';

// High-competition UK cities
const SUGGESTED_CITIES: { city: string; postcode: string; note: string }[] = [
  { city: 'London', postcode: 'EC1A 1BB', note: '🔥 Hyper-competitive' },
  { city: 'Manchester', postcode: 'M1 1AE', note: '🔥 Very competitive' },
  { city: 'Birmingham', postcode: 'B1 1BB', note: '🔥 Very competitive' },
  { city: 'Bristol', postcode: 'BS1 4DJ', note: 'High competition' },
  { city: 'Leeds', postcode: 'LS1 4DT', note: 'High competition' },
  { city: 'Glasgow', postcode: 'G1 1XQ', note: 'High competition' },
  { city: 'Edinburgh', postcode: 'EH1 1YZ', note: 'High competition' },
  { city: 'Liverpool', postcode: 'L1 8JQ', note: 'High competition' },
];

type FormData = {
  name: string;
  email: string;
  password: string;
  businessName: string;
  website: string;
  category: ServiceCategory | '';
  city: string;
  postcode: string;
  competitors: string[];
};

const initialData: FormData = {
  name: '',
  email: '',
  password: '',
  businessName: '',
  website: '',
  category: '',
  city: '',
  postcode: '',
  competitors: [''],
};

const SignUpPage = () => {
  const router = useRouter();
  const { signup, setSettings, setProject } = useRivalRadarStore();

  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const totalSteps = 4;

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  const addCompetitor = () => {
    if (data.competitors.length >= 5) return;
    update('competitors', [...data.competitors, '']);
  };

  const removeCompetitor = (i: number) =>
    update(
      'competitors',
      data.competitors.filter((_, idx) => idx !== i),
    );

  const setCompetitor = (i: number, val: string) =>
    update(
      'competitors',
      data.competitors.map((c, idx) => (idx === i ? val : c)),
    );

  const pickSuggested = (city: string, postcode: string) => {
    update('city', city);
    update('postcode', postcode);
  };

  const canProceed = () => {
    if (step === 1)
      return !!data.name.trim() && data.email.includes('@') && data.password.length >= 8;
    if (step === 2) return !!data.businessName.trim() && isValidUrl(data.website);
    if (step === 3) return !!data.category && !!data.city.trim() && !!data.postcode.trim();
    return true;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Create auth account
      const {
        ok,
        needsConfirmation,
        error: signupError,
      } = await signup(data.email, data.password, data.name.trim());
      if (!ok) throw new Error(signupError ?? 'Signup failed.');
      if (needsConfirmation) {
        setAwaitingConfirmation(true);
        setLoading(false);
        return;
      }

      // 2. Build business entries
      const websiteNorm = normalizeUrl(data.website);
      const ownBusiness = {
        name: data.businessName.trim(),
        url: websiteNorm,
        domain: extractDomain(websiteNorm),
      };
      const validCompetitors = data.competitors
        .map((c) => c.trim())
        .filter((c) => c && isValidUrl(normalizeUrl(c)))
        .map((c) => {
          const url = normalizeUrl(c);
          const domain = extractDomain(url);
          return { name: domain, url, domain };
        });

      // 3. Create project
      const savedProject = await createProject(
        `${ownBusiness.name} vs Competitors`,
        ownBusiness,
        validCompetitors,
        {
          primaryService: data.category as ServiceCategory,
          location: data.city,
          postcode: data.postcode,
        },
      );

      // 4. Save settings + hydrate store
      setSettings({
        primaryService: data.category as ServiceCategory,
        location: data.city,
        postcode: data.postcode,
      });
      setProject(savedProject);

      // 5. Kick off crawls
      await triggerInitialScans(savedProject.id);

      toast({
        title: 'Account created!',
        description: "We're preparing your first competitor scan.",
      });
      router.push('/dashboard?setup=1');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const next = () => {
    if (step < totalSteps) setStep(step + 1);
    else handleSubmit();
  };

  const back = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-primary/[0.06] blur-[120px] pointer-events-none" />

      <div className="container relative z-10 max-w-2xl py-10 md:py-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
          </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        </div>

        {/* Progress */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Step {step} of {totalSteps}
            </span>
            <span className="text-xs text-muted-foreground">
              {Math.round((step / totalSteps) * 100)}% complete
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(step / totalSteps) * 100}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Email confirmation gate */}
        {awaitingConfirmation && (
          <div className="neu rounded-3xl p-8 md:p-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Mail className="w-6 h-6" />
            </div>
            <h2 className="font-display text-2xl font-bold">Check your inbox</h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              We sent a confirmation link to{' '}
              <strong className="text-foreground">{data.email}</strong>. Click it to verify your
              account — you'll be taken straight into setup.
            </p>
          </div>
        )}

        {/* Card */}
        {!awaitingConfirmation && (
          <div className="neu rounded-3xl p-8 md:p-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                {step === 1 && (
                  <Step
                    icon={<Mail className="w-5 h-5" />}
                    title="Create your account"
                    subtitle="We'll email your weekly competitor reports here."
                  >
                    <div className="space-y-5">
                      {/* Google — wired up once OAuth is configured */}
                      <button
                        type="button"
                        onClick={() =>
                          toast({
                            title: 'Coming soon',
                            description: 'Google sign-in is being set up. Use email for now.',
                          })
                        }
                        className="w-full h-12 rounded-md border border-border bg-background hover:bg-muted/40 transition-colors inline-flex items-center justify-center gap-3 text-sm font-medium"
                      >
                        <GoogleIcon />
                        Continue with Google
                      </button>

                      <div className="relative flex items-center">
                        <div className="flex-1 h-px bg-border" />
                        <span className="px-3 text-xs uppercase tracking-wider text-muted-foreground">
                          or
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </div>

                      <Field label="Your name">
                        <Input
                          type="text"
                          placeholder="e.g. Sarah"
                          value={data.name}
                          onChange={(e) => update('name', e.target.value)}
                          className="h-12"
                          autoComplete="given-name"
                        />
                      </Field>
                      <Field label="Work email">
                        <Input
                          type="email"
                          placeholder="you@yourbusiness.co.uk"
                          value={data.email}
                          onChange={(e) => update('email', e.target.value)}
                          className="h-12"
                          autoComplete="email"
                        />
                      </Field>
                      <Field label="Password" hint="Minimum 8 characters">
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            type="password"
                            placeholder="••••••••"
                            value={data.password}
                            onChange={(e) => update('password', e.target.value)}
                            className="h-12 pl-10"
                            autoComplete="new-password"
                          />
                        </div>
                      </Field>
                    </div>
                  </Step>
                )}

                {step === 2 && (
                  <Step
                    icon={<Building2 className="w-5 h-5" />}
                    title="Tell us about your business"
                    subtitle="This is the business we'll score and benchmark."
                  >
                    <div className="space-y-5">
                      <Field label="Business name">
                        <Input
                          placeholder="e.g. Smith & Sons Plumbing"
                          value={data.businessName}
                          onChange={(e) => update('businessName', e.target.value)}
                          className="h-12"
                        />
                      </Field>
                      <Field
                        label="Website URL"
                        hint="We'll crawl this to score your online presence"
                      >
                        <div className="relative">
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            placeholder="https://yourbusiness.co.uk"
                            value={data.website}
                            onChange={(e) => update('website', e.target.value)}
                            className="h-12 pl-10"
                          />
                        </div>
                      </Field>
                    </div>
                  </Step>
                )}

                {step === 3 && (
                  <Step
                    icon={<MapPin className="w-5 h-5" />}
                    title="What & where"
                    subtitle="Pick the town or city you actually compete in."
                  >
                    <div className="space-y-6">
                      <Field label="Business category">
                        <Select
                          value={data.category}
                          onValueChange={(v) => update('category', v as ServiceCategory)}
                        >
                          <SelectTrigger className="h-12">
                            <Tag className="w-4 h-4 text-muted-foreground mr-1" />
                            <SelectValue placeholder="Pick the closest match" />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {SERVICE_CATEGORY_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>

                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Town / City">
                          <Input
                            placeholder="Bristol"
                            value={data.city}
                            onChange={(e) => update('city', e.target.value)}
                            className="h-12"
                          />
                        </Field>
                        <Field label="Postcode">
                          <Input
                            placeholder="BS1 4DJ"
                            value={data.postcode}
                            onChange={(e) => update('postcode', e.target.value.toUpperCase())}
                            className="h-12"
                          />
                        </Field>
                      </div>

                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Flame className="w-4 h-4 text-primary" />
                          <p className="text-sm font-semibold">
                            Not sure? Try a high-competition city
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                          RivalRadar works best where there are real local rivals to benchmark
                          against.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {SUGGESTED_CITIES.map((s) => {
                            const active = data.city === s.city;
                            return (
                              <button
                                key={s.city}
                                type="button"
                                onClick={() => pickSuggested(s.city, s.postcode)}
                                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                                  active
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-background hover:border-primary/50 hover:bg-primary/5'
                                }`}
                                title={s.note}
                              >
                                {s.city}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-start gap-2 pt-2 text-xs text-muted-foreground border-t border-border/60">
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <p>
                          RivalRadar is purpose-built for{' '}
                          <strong className="text-foreground">UK local SEO</strong>. Pick the single
                          town or city you most want to win in.
                        </p>
                      </div>
                    </div>
                  </Step>
                )}

                {step === 4 && (
                  <Step
                    icon={<Users className="w-5 h-5" />}
                    title="Add your competitors"
                    subtitle={`Up to 5 local rivals. Leave blank — we'll auto-detect top ${
                      data.category
                        ? SERVICE_CATEGORY_OPTIONS.find((o) => o.value === data.category)?.label
                        : 'local'
                    } businesses near ${data.city || 'you'}.`}
                  >
                    <div className="space-y-3">
                      {data.competitors.map((c, i) => (
                        <div key={i} className="flex gap-2">
                          <div className="relative flex-1">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              placeholder={`Competitor ${i + 1} website`}
                              value={c}
                              onChange={(e) => setCompetitor(i, e.target.value)}
                              className="h-12 pl-10"
                            />
                          </div>
                          {data.competitors.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeCompetitor(i)}
                              className="h-12 w-12 shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      {data.competitors.length < 5 && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={addCompetitor}
                          className="w-full h-12 border-dashed"
                        >
                          <Plus className="w-4 h-4" /> Add another competitor
                        </Button>
                      )}
                    </div>
                  </Step>
                )}
              </motion.div>
            </AnimatePresence>

            {error && <p className="mt-4 text-sm text-destructive text-center">{error}</p>}

            {/* Actions */}
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-border/60">
              <Button
                variant="ghost"
                onClick={back}
                disabled={step === 1 || loading}
                className="text-muted-foreground"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button
                variant="default"
                onClick={next}
                disabled={!canProceed() || loading}
                size="lg"
                className="px-6"
              >
                {step === totalSteps ? (
                  loading ? (
                    'Setting up…'
                  ) : (
                    <>
                      <Check className="w-4 h-4" /> Register
                    </>
                  )
                ) : (
                  <>
                    Continue <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground mt-8">
          Already have an account?{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
        <p className="text-center text-xs text-muted-foreground mt-3">
          No credit card required. First scan is free.
        </p>
      </div>
    </div>
  );
};

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
    />
    <path
      fill="#EA4335"
      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
    />
  </svg>
);

const Step = ({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) => (
  <div>
    <div className="flex items-center gap-3 mb-2">
      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
        {icon}
      </div>
      <h1 className="font-display text-2xl md:text-3xl font-bold">{title}</h1>
    </div>
    <p className="text-muted-foreground mb-8 ml-[52px]">{subtitle}</p>
    {children}
  </div>
);

const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div>
    <Label className="text-sm font-medium mb-2 block">{label}</Label>
    {children}
    {hint && <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>}
  </div>
);

export default SignUpPage;
