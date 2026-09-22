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
    // A project already in the store means an earlier page primed auth, so the
    // page renders straight away while initAuth revalidates in the background.
    if (useRivalRadarStore.getState().project) setAuthReady(true);
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

  // The shell stays mounted throughout, so moving in from a public page keeps
  // the sidebar and topbar on screen and only swaps the content area.
  return (
    <AppShell>
      {mounted && authReady && project ? (
        children
      ) : (
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      )}
    </AppShell>
  );
}
