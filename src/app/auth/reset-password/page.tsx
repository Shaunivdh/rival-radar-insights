'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { supabase } from '@/lib/supabase/client';
import { ArrowRight } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.replace('/dashboard');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Set a new password</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a strong password for your account.
          </p>
        </div>

        <div className="card-surface space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="••••••••"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={!password || !confirm || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Updating…' : 'Update Password'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
