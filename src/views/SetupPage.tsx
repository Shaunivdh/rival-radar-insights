'use client';

import { useRivalRadarStore } from '@/store/rivalradar';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { resetPasswordForEmail } from '@/lib/supabase/auth';
import { SERVICE_CATEGORY_OPTIONS, type ServiceCategory } from '@/lib/serviceCategories';
import { isValidUKPostcode } from '@/lib/utils';
import { createProject, triggerInitialScans } from '@/actions/projects';
import type { Project } from '@/types';

type SignupData = {
  name: string;
  email: string;
  password: string;
  businessName: string;
  website: string;
  category: ServiceCategory | '';
  city: string;
  postcode: string;
  competitors: { name: string; url: string }[];
};

const initialSignupData: SignupData = {
  name: '',
  email: '',
  password: '',
  businessName: '',
  website: '',
  category: '',
  city: '',
  postcode: '',
  competitors: [{ name: '', url: '' }],
};

const getDomain = (url: string) => {
  const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  try {
    return new URL(normalized).hostname;
  } catch {
    return url.trim();
  }
};

const inputCls =
  'w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors';

const TOTAL_STEPS = 4;

const STATUS_STYLES: Record<string, string> = {
  idle: 'text-muted-foreground',
  pending: 'text-yellow-500',
  running: 'text-blue-500',
  complete: 'text-green-500',
  failed: 'text-destructive',
};

const STATUS_LABELS: Record<string, string> = {
  idle: 'Idle',
  pending: 'Pending',
  running: 'Running…',
  complete: 'Complete',
  failed: 'Failed',
};

// ---------------------------------------------------------------------------

const SetupPage = () => {
  const { user, project, login, signup, setProject, setSettings, initAuth } = useRivalRadarStore();
  const router = useRouter();

  const [tab, setTab] = useState<'login' | 'signup'>('login');

  // Login state
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup wizard state
  const [step, setStep] = useState(1);
  const [data, setData] = useState<SignupData>(initialSignupData);
  const [postcodeError, setPostcodeError] = useState('');
  const [accountCreated, setAccountCreated] = useState(false);

  // Scanning state
  const [scanning, setScanning] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [bizStatuses, setBizStatuses] = useState<
    Array<{ id: string; name: string; crawl_status: string }>
  >([]);
  const [savedProjectRef, setSavedProjectRef] = useState<Project | null>(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && project) router.replace('/dashboard');
    else if (user && !project && tab !== 'signup') router.replace('/setup');
  }, [user, project, tab, router]);

  // Poll for scan completion
  useEffect(() => {
    if (!scanning || !projectId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/crawl?projectId=${projectId}`);
        const d = await res.json();
        setBizStatuses(d.businesses ?? []);
        const allDone = (d.businesses ?? []).every(
          (b: { crawl_status: string }) =>
            b.crawl_status === 'complete' || b.crawl_status === 'failed',
        );
        if (allDone) {
          clearInterval(interval);
          if (savedProjectRef) setProject(savedProjectRef);
          router.push('/dashboard');
        }
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [scanning, projectId, router, savedProjectRef, setProject]);

  // Redirect handled in the effect above; render nothing while it navigates.
  if (user && !project && tab !== 'signup') {
    return null;
  }

  const update = <K extends keyof SignupData>(key: K, value: SignupData[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  // --- Login handlers ---
  const handleForgot = async () => {
    setError('');
    if (!loginEmail.trim()) return;
    setLoading(true);
    try {
      await resetPasswordForEmail(loginEmail.trim(), `${window.location.origin}/auth/callback`);
      setForgotSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    setError('');
    if (!loginEmail.trim() || !loginPassword.trim()) return;
    setLoading(true);
    const result = await login(loginEmail.trim(), loginPassword);
    if (!result.ok) {
      setError(result.error ?? 'Something went wrong.');
      setLoading(false);
      return;
    }
    await initAuth();
    const { project: fetched } = useRivalRadarStore.getState();
    router.push(fetched ? '/dashboard' : '/setup');
  };

  // --- Signup wizard handlers ---
  const canProceed = () => {
    if (step === 1)
      return !!data.name.trim() && data.email.includes('@') && data.password.length >= 8;
    if (step === 2) return !!data.businessName.trim() && !!data.website.trim();
    if (step === 3) return !!data.category && !!data.postcode.trim() && !!data.city.trim();
    return true;
  };

  const handleNext = async () => {
    setError('');
    if (step === 1 && !accountCreated) {
      setLoading(true);
      const result = await signup(data.email.trim(), data.password, data.name.trim());
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong.');
        setLoading(false);
        return;
      }
      setAccountCreated(true);
      setLoading(false);
      setStep(2);
      return;
    }
    if (step === 3) {
      if (data.postcode && !isValidUKPostcode(data.postcode)) {
        setPostcodeError('Enter a valid UK postcode (e.g. M1 1AA)');
        return;
      }
      setPostcodeError('');
    }
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      return;
    }
    await handleFinish();
  };

  const handleFinish = async () => {
    setError('');
    setLoading(true);
    try {
      const ownFinal = {
        name: data.businessName,
        url: data.website,
        domain: getDomain(data.website),
      };
      const competitorsFinal = data.competitors
        .filter((c) => c.url.trim())
        .map((c) => {
          const url = c.url.trim();
          const domain = getDomain(url);
          return { name: c.name.trim() || domain, url, domain };
        });

      const savedProject = await createProject(
        `${ownFinal.name} vs Competitors`,
        ownFinal,
        competitorsFinal,
        {
          primaryService: data.category as ServiceCategory,
          location: data.city,
          postcode: data.postcode,
        },
      );

      setSettings({
        primaryService: data.category as ServiceCategory,
        location: data.city,
        postcode: data.postcode,
      });

      const allBiz = [savedProject.ownBusiness, ...savedProject.competitors];
      setBizStatuses(allBiz.map((b) => ({ id: b.id, name: b.name, crawl_status: 'pending' })));
      setProjectId(savedProject.id);
      setSavedProjectRef(savedProject);
      await triggerInitialScans(savedProject.id);
      setLoading(false);
      setScanning(true);
    } catch (e) {
      console.error('[createProject] failed:', e);
      setError('Failed to create project. Please try again.');
      setLoading(false);
    }
  };

  const switchToSignup = () => {
    setTab('signup');
    setStep(1);
    setError('');
    setAccountCreated(false);
  };

  const switchToLogin = () => {
    setTab('login');
    setForgotMode(false);
    setForgotSent(false);
    setError('');
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-primary/[0.06] blur-[120px] pointer-events-none" />

      <div className="container relative z-10 max-w-2xl py-10 md:py-16 px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-2">
            <Logo />
          </div>
        </div>

        {/* ── LOGIN TAB ── */}
        {tab === 'login' && (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-foreground">Welcome back</h1>
              <p className="text-sm text-muted-foreground mt-1">Sign in to your account.</p>
            </div>

            <div className="card-surface space-y-4">
              {forgotMode ? (
                forgotSent ? (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Check your email for a reset link.
                  </p>
                ) : (
                  <>
                    <Field label="Email">
                      <input
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleForgot()}
                        className={inputCls}
                        placeholder="you@example.com"
                        autoFocus
                      />
                    </Field>
                    {error && <p className="text-xs text-destructive">{error}</p>}
                    <PrimaryButton onClick={handleForgot} disabled={!loginEmail || loading}>
                      {loading ? (
                        'Sending…'
                      ) : (
                        <>
                          <span>Send Reset Link</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </PrimaryButton>
                    <GhostButton
                      onClick={() => {
                        setForgotMode(false);
                        setError('');
                      }}
                    >
                      Back to login
                    </GhostButton>
                  </>
                )
              ) : (
                <>
                  <Field label="Email">
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                      className={inputCls}
                      placeholder="you@example.com"
                      autoFocus
                    />
                  </Field>
                  <Field label="Password">
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                      className={inputCls}
                      placeholder="••••••••"
                    />
                  </Field>
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  <PrimaryButton
                    onClick={handleLogin}
                    disabled={!loginEmail || !loginPassword || loading}
                  >
                    {loading ? (
                      'Please wait…'
                    ) : (
                      <>
                        <span>Log In</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </PrimaryButton>
                  <GhostButton
                    onClick={() => {
                      setForgotMode(true);
                      setError('');
                    }}
                  >
                    Forgot password?
                  </GhostButton>
                </>
              )}
            </div>

            <p className="text-center text-sm text-muted-foreground mt-8">
              Don&apos;t have an account?{' '}
              <button onClick={switchToSignup} className="text-primary font-medium hover:underline">
                Sign up free
              </button>
            </p>
          </>
        )}

        {/* ── SIGNUP WIZARD ── */}
        {tab === 'signup' && (
          <>
            {/* Progress bar */}
            {!scanning && (
              <div className="mb-10">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Step {step} of {TOTAL_STEPS}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round((step / TOTAL_STEPS) * 100)}% complete
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  />
                </div>
              </div>
            )}

            <div className="card-surface">
              {/* Scanning state */}
              {scanning ? (
                <div className="space-y-2">
                  <StepHeader
                    icon={<Check className="w-5 h-5" />}
                    title="Scanning your businesses…"
                    subtitle="This may take a minute. You'll be redirected when complete."
                  />
                  <div className="space-y-2 mt-2">
                    {bizStatuses.map((b) => (
                      <div key={b.id} className="flex items-center justify-between py-1.5">
                        <span className="text-sm text-foreground truncate">{b.name}</span>
                        <span
                          className={`text-xs font-medium ${STATUS_STYLES[b.crawl_status] ?? 'text-muted-foreground'}`}
                        >
                          {STATUS_LABELS[b.crawl_status] ?? b.crawl_status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <AnimatePresence mode="wait">
                    {/* Step 1 – Account */}
                    {step === 1 && (
                      <motion.div
                        key="step-1"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                      >
                        <StepHeader
                          icon={<Mail className="w-5 h-5" />}
                          title="Create your account"
                          subtitle="We'll email your weekly competitor reports here."
                        />
                        <div className="space-y-5">
                          <Field label="Your name">
                            <input
                              type="text"
                              placeholder="e.g. Sarah"
                              value={data.name}
                              onChange={(e) => update('name', e.target.value)}
                              className={inputCls}
                              autoFocus
                              autoComplete="given-name"
                            />
                          </Field>
                          <Field label="Work email">
                            <input
                              type="email"
                              placeholder="you@yourbusiness.co.uk"
                              value={data.email}
                              onChange={(e) => update('email', e.target.value)}
                              className={inputCls}
                            />
                          </Field>
                          <Field label="Password" hint="Minimum 8 characters">
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <input
                                type="password"
                                placeholder="••••••••"
                                value={data.password}
                                onChange={(e) => update('password', e.target.value)}
                                className={`${inputCls} pl-10`}
                              />
                            </div>
                          </Field>
                        </div>
                      </motion.div>
                    )}

                    {/* Step 2 – Business */}
                    {step === 2 && (
                      <motion.div
                        key="step-2"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                      >
                        <StepHeader
                          icon={<Building2 className="w-5 h-5" />}
                          title="Tell us about your business"
                          subtitle="This is the business we'll score and benchmark."
                        />
                        <div className="space-y-5">
                          <Field label="Business name">
                            <input
                              placeholder="e.g. Smith & Sons Plumbing"
                              value={data.businessName}
                              onChange={(e) => update('businessName', e.target.value)}
                              className={inputCls}
                              autoFocus
                            />
                          </Field>
                          <Field
                            label="Website URL"
                            hint="We'll crawl this to score your online presence"
                          >
                            <div className="relative">
                              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <input
                                placeholder="https://yourbusiness.co.uk"
                                value={data.website}
                                onChange={(e) => update('website', e.target.value)}
                                className={`${inputCls} pl-10`}
                              />
                            </div>
                          </Field>
                        </div>
                      </motion.div>
                    )}

                    {/* Step 3 – Location & category */}
                    {step === 3 && (
                      <motion.div
                        key="step-3"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                      >
                        <StepHeader
                          icon={<MapPin className="w-5 h-5" />}
                          title="What & where"
                          subtitle="Helps us find the right local search results to compare you against."
                        />
                        <div className="space-y-5">
                          <Field label="Business category">
                            <div className="relative">
                              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
                              <select
                                value={data.category}
                                onChange={(e) =>
                                  update('category', e.target.value as ServiceCategory)
                                }
                                className={`${inputCls} pl-10 text-foreground`}
                              >
                                <option value="" disabled>
                                  Pick the closest match
                                </option>
                                {SERVICE_CATEGORY_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </Field>
                          <div className="grid grid-cols-2 gap-4">
                            <Field label="Town / City">
                              <input
                                placeholder="Manchester"
                                value={data.city}
                                onChange={(e) => update('city', e.target.value)}
                                className={inputCls}
                              />
                            </Field>
                            <Field label="Postcode">
                              <input
                                placeholder="M1 4PQ"
                                value={data.postcode}
                                onChange={(e) => {
                                  update('postcode', e.target.value.toUpperCase());
                                  setPostcodeError('');
                                }}
                                className={`${inputCls} ${postcodeError ? 'border-destructive' : ''}`}
                              />
                              {postcodeError && (
                                <p className="text-xs text-destructive mt-1">{postcodeError}</p>
                              )}
                            </Field>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Step 4 – Competitors */}
                    {step === 4 && (
                      <motion.div
                        key="step-4"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                      >
                        <StepHeader
                          icon={<Users className="w-5 h-5" />}
                          title="Add your competitors"
                          subtitle={`Up to 5 local rivals. Leave blank — we'll auto-detect top ${data.category || 'local'} businesses near ${data.city || 'you'}.`}
                        />
                        <div className="space-y-3">
                          {data.competitors.map((c, i) => (
                            <div key={i} className="flex gap-2 items-start">
                              <div className="flex-1 space-y-2">
                                <input
                                  placeholder={`Competitor ${i + 1} business name`}
                                  value={c.name}
                                  onChange={(e) => {
                                    const updated = [...data.competitors];
                                    updated[i] = { ...updated[i], name: e.target.value };
                                    update('competitors', updated);
                                  }}
                                  className={inputCls}
                                />
                                <div className="relative">
                                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                  <input
                                    placeholder={`Competitor ${i + 1} website`}
                                    value={c.url}
                                    onChange={(e) => {
                                      const updated = [...data.competitors];
                                      updated[i] = { ...updated[i], url: e.target.value };
                                      update('competitors', updated);
                                    }}
                                    className={`${inputCls} pl-10`}
                                  />
                                </div>
                              </div>
                              {data.competitors.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    update(
                                      'competitors',
                                      data.competitors.filter((_, idx) => idx !== i),
                                    )
                                  }
                                  className="h-10 w-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive transition-colors mt-1"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                          {data.competitors.length < 5 && (
                            <button
                              type="button"
                              onClick={() =>
                                update('competitors', [...data.competitors, { name: '', url: '' }])
                              }
                              className="w-full h-10 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                            >
                              <Plus className="w-4 h-4" /> Add another competitor
                            </button>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {error && <p className="text-xs text-destructive mt-4">{error}</p>}

                  {/* Navigation */}
                  <div className="flex items-center justify-between mt-8 pt-6 border-t border-border/60">
                    <button
                      onClick={() => (step > 1 ? setStep(step - 1) : switchToLogin())}
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={handleNext}
                      disabled={!canProceed() || loading}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {loading ? (
                        'Please wait…'
                      ) : step === TOTAL_STEPS ? (
                        <>
                          <Check className="w-4 h-4" /> Start my free scan
                        </>
                      ) : (
                        <>
                          <span>Continue</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>

            {!scanning && (
              <p className="text-center text-sm text-muted-foreground mt-8">
                Already have an account?{' '}
                <button
                  onClick={switchToLogin}
                  className="text-primary font-medium hover:underline"
                >
                  Sign in
                </button>
              </p>
            )}

            <p className="text-center text-xs text-muted-foreground mt-3">
              No credit card required. First scan is free.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const StepHeader = ({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) => (
  <div className="mb-6">
    <div className="flex items-center gap-3 mb-2">
      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
        {icon}
      </div>
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
    </div>
    <p className="text-sm text-muted-foreground ml-[52px]">{subtitle}</p>
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
    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>
    {children}
    {hint && <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>}
  </div>
);

const PrimaryButton = ({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
  >
    {children}
  </button>
);

const GhostButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className="w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
  >
    {children}
  </button>
);

export default SetupPage;
