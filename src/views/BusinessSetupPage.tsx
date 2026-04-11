'use client';

import { useRivalRadarStore } from '@/store/rivalradar';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { useEffect, useState } from 'react';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import type { Business, Project } from '@/types';
import { createProject, triggerInitialScans } from '@/actions/projects';

const emptyBusiness = (): Business => ({
  id: crypto.randomUUID(),
  name: '',
  url: '',
  domain: '',
  lastCrawledAt: null,
  crawlJobId: null,
  crawlStatus: 'idle',
  signals: null,
  googleData: null,
  serpData: null,
  trustpilotData: null,
  aiScore: null,
  aiVisibility: null,
  enrichmentErrors: null,
  previousSignals: null,
  changeEvents: [],
});

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

const StatusBadge = ({ status }: { status: string }) => (
  <span className={`text-xs font-medium ${STATUS_STYLES[status] ?? 'text-muted-foreground'}`}>
    {STATUS_LABELS[status] ?? status}
  </span>
);

const getDomain = (url: string) => {
  try { return new URL(url).hostname; } catch { return url; }
};

const BusinessSetupPage = () => {
  const { user, project, setProject, setSettings, initAuth } = useRivalRadarStore();
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);
  const [step, setStep] = useState(0);
  const [own, setOwn] = useState<Business>(emptyBusiness());
  const [primaryService, setPrimaryService] = useState('');
  const [location, setLocation] = useState('');
  const [postcode, setPostcode] = useState('');
  const [competitors, setCompetitors] = useState([emptyBusiness()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [bizStatuses, setBizStatuses] = useState<Array<{ id: string; name: string; crawl_status: string }>>([]);
  const [savedProjectRef, setSavedProjectRef] = useState<Project | null>(null);

  useEffect(() => {
    initAuth().finally(() => setAuthReady(true));
  }, [initAuth]);

  useEffect(() => {
    if (!authReady) return;
    if (!user) router.replace('/');
    else if (project) router.replace('/dashboard');
  }, [authReady, user, project, router]);

  useEffect(() => {
    if (step !== 2 || !projectId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/crawl?projectId=${projectId}`);
        const data = await res.json();
        setBizStatuses(data.businesses ?? []);
        const allDone = (data.businesses ?? []).every(
          (b: { crawl_status: string }) => b.crawl_status === 'complete' || b.crawl_status === 'failed'
        );
        if (allDone) {
          clearInterval(interval);
          const anyFailed = (data.businesses ?? []).some(
            (b: { crawl_status: string }) => b.crawl_status === 'failed'
          );
          if (anyFailed) {
            setError('Some scans failed. You can retry from the dashboard.');
          }
          // Commit project to store now — doing it earlier would unmount this component
          if (savedProjectRef) setProject(savedProjectRef);
          router.push('/dashboard');
        }
      } catch {
        // network error — keep polling
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [step, projectId, router, savedProjectRef, setProject]);

  if (!authReady) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );

  if (!user || project) return null;

  const updateOwn = (field: 'name' | 'url', val: string) =>
    setOwn((b) => ({ ...b, [field]: val }));

  const updateCompetitor = (i: number, field: 'name' | 'url', val: string) => {
    const c = [...competitors];
    c[i] = { ...c[i], [field]: val };
    setCompetitors(c);
  };

  const addCompetitor = () => {
    if (competitors.length < 5) setCompetitors([...competitors, emptyBusiness()]);
  };

  const removeCompetitor = (i: number) =>
    setCompetitors(competitors.filter((_, idx) => idx !== i));

  const handleFinish = async () => {
    setLoading(true);
    setError('');
    try {
      const ownFinal = { name: own.name, url: own.url, domain: getDomain(own.url) };
      const competitorsFinal = competitors
        .filter((c) => c.name && c.url)
        .map((c) => ({ name: c.name, url: c.url, domain: getDomain(c.url) }));

      const savedProject = await createProject(
        `${ownFinal.name} vs Competitors`,
        ownFinal,
        competitorsFinal,
      );

      // Don't call setProject yet — it would trigger the redirect guard and unmount this component.
      // We set it right before router.push in the polling effect instead.
      setSettings({ primaryService, location, postcode });

      const allBiz = [savedProject.ownBusiness, ...savedProject.competitors];
      setBizStatuses(allBiz.map((b) => ({ id: b.id, name: b.name, crawl_status: 'pending' })));
      setProjectId(savedProject.id);
      // Store the project to commit to store when done
      setSavedProjectRef(savedProject);
      await triggerInitialScans(savedProject.id);
      setLoading(false);
      setStep(2);
    } catch (e) {
      setError('Failed to create project. Please try again.');
      setLoading(false);
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Set up your competitive radar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome, <span className="font-medium text-foreground">{user.email}</span>
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {[0, 1].map((s) => (
            <div
              key={s}
              className={`w-8 h-1 rounded-full ${step >= s ? 'bg-primary' : 'bg-border'}`}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="card-surface space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Your Business</h2>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Business Name</label>
              <input
                value={own.name}
                onChange={(e) => updateOwn('name', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="e.g. Apex Builders"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Website URL</label>
              <input
                value={own.url}
                onChange={(e) => updateOwn('url', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="https://yourbusiness.co.uk"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Primary Service</label>
              <input
                value={primaryService}
                onChange={(e) => setPrimaryService(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="e.g. building contractor"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Location</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="e.g. Manchester"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Postcode</label>
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="e.g. M1 1AA"
              />
            </div>
            <button
              onClick={() => setStep(1)}
              disabled={!own.name || !own.url}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="card-surface space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Your Competitors</h2>
            <p className="text-xs text-muted-foreground">Add up to 5 competitors to track.</p>
            {competitors.map((comp, i) => (
              <div key={comp.id} className="flex gap-2">
                <input
                  value={comp.name}
                  onChange={(e) => updateCompetitor(i, 'name', e.target.value)}
                  className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Competitor name"
                />
                <input
                  value={comp.url}
                  onChange={(e) => updateCompetitor(i, 'url', e.target.value)}
                  className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="https://competitor.co.uk"
                />
                {competitors.length > 1 && (
                  <button onClick={() => removeCompetitor(i)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {competitors.length < 5 && (
              <button onClick={addCompetitor} className="text-sm text-primary font-medium flex items-center gap-1 hover:opacity-80">
                <Plus className="w-4 h-4" /> Add competitor
              </button>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep(0)}
                className="px-4 py-2.5 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80"
              >
                Back
              </button>
              <button
                onClick={handleFinish}
                disabled={competitors.every((c) => !c.name || !c.url) || loading}
                className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {loading ? 'Setting up…' : 'Start Scanning'}
              </button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="card-surface space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Scanning your businesses…</h2>
            <p className="text-xs text-muted-foreground">This may take a minute. You'll be redirected when complete.</p>
            <div className="space-y-2">
              {bizStatuses.map((b) => (
                <div key={b.id} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-foreground truncate">{b.name}</span>
                  <StatusBadge status={b.crawl_status} />
                </div>
              ))}
            </div>
          </div>
        )}
        {error && <p className="text-xs text-destructive text-center">{error}</p>}
      </div>
    </div>
  );
};

export default BusinessSetupPage;
