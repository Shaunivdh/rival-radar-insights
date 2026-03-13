'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppSidebar } from '@/components/AppSidebar';
import { useRivalRadarStore } from '@/store/rivalradar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, project, isDemoMode, deleteProject, initAuth } = useRivalRadarStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    if (!mounted) return;
    // Real user stuck in demo mode — clear it and send to setup
    if (user && isDemoMode) {
      deleteProject();
      router.replace('/setup');
      return;
    }
    if (!project && !isDemoMode) {
      router.replace(user ? '/setup' : '/');
    }
  }, [mounted, user, project, isDemoMode, deleteProject, router]);

  // Show nothing only before hydration — avoids flash of login page
  if (!mounted) return null;

  // Real user with no project — don't render app chrome, redirect is in flight
  if (!project) return null;

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}
