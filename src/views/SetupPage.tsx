'use client';

import { useRivalRadarStore } from '@/store/rivalradar';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';

const SetupPage = () => {
  const { user, project, login, signup, loadMockData, initAuth } = useRivalRadarStore();
  const router = useRouter();

  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && project) router.replace('/dashboard');
  }, [user, project, router]);

  if (user) return null;

  const handleDemo = () => {
    loadMockData();
    router.push('/dashboard');
  };

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password.trim()) return;
    setLoading(true);

    const result = tab === 'login'
      ? await login(email.trim(), password)
      : await signup(email.trim(), password, name.trim() || undefined);

    if (!result.ok) {
      setError(result.error ?? 'Something went wrong.');
      setLoading(false);
      return;
    }

    // Fetch project from Supabase before deciding where to send the user
    await initAuth();
    const { project: fetched } = useRivalRadarStore.getState();
    router.push(fetched ? '/dashboard' : '/setup');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Competitive intelligence, simplified</h1>
          <p className="text-sm text-muted-foreground mt-1">Track your competitors and stay ahead.</p>
        </div>

        <div className="flex bg-muted rounded-lg p-1">
          {(['login', 'signup'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'login' ? 'Log In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <div className="card-surface space-y-4">
          {tab === 'signup' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Jane Smith"
                autoFocus
              />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="you@example.com"
              autoFocus={tab === 'login'}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={!email || !password || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Please wait…' : tab === 'login' ? 'Log In' : 'Create Account'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>

        <div className="text-center">
          <button onClick={handleDemo} className="text-sm text-primary font-medium hover:underline">
            Explore with demo data →
          </button>
        </div>
      </div>
    </div>
  );
};

export default SetupPage;
