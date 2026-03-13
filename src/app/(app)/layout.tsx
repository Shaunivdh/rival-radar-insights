'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppSidebar } from '@/components/AppSidebar';
import { useRivalRadarStore } from '@/store/rivalradar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, project, isDemoMode } = useRivalRadarStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!project && !isDemoMode) {
      router.replace(user ? '/setup' : '/');
    }
  }, [mounted, project, isDemoMode, user, router]);

  if (!mounted || (!project && !isDemoMode)) return null;

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}
