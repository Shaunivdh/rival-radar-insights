'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useRivalRadarStore } from '@/store/rivalradar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, project, isDemoMode, deleteProject, initAuth } = useRivalRadarStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    setMounted(true);
    initAuth().finally(() => setAuthReady(true));
  }, [initAuth]);

  useEffect(() => {
    if (!mounted || !authReady) return;
    // Real user stuck in demo mode — clear it and send to setup
    if (user && isDemoMode) {
      deleteProject();
      router.replace('/setup');
      return;
    }
    if (!project && !isDemoMode) {
      router.replace(user ? '/setup' : '/');
    }
  }, [mounted, authReady, user, project, isDemoMode, deleteProject, router]);

  if (!mounted) return null;

  // Show spinner while auth + project fetch is in flight
  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // Redirect is in flight
  if (!project) return null;

  return <AppShell>{children}</AppShell>;
}
