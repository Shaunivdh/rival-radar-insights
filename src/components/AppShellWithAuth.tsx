'use client';

import { useEffect } from 'react';
import { useRivalRadarStore } from '@/store/rivalradar';
import AppShell from '@/components/AppShell';

/**
 * App chrome for pages outside the (app) group, which have no layout of their
 * own to prime the store. Renders immediately and fills in as auth resolves,
 * so a signed-in visitor never waits on a spinner for public content.
 */
export default function AppShellWithAuth({ children }: { children: React.ReactNode }) {
  const initAuth = useRivalRadarStore((s) => s.initAuth);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return <AppShell>{children}</AppShell>;
}
