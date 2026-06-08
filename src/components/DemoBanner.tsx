'use client';

import { X } from 'lucide-react';
import { useRivalRadarStore } from '@/store/rivalradar';
import { useRouter } from 'next/navigation';

export const DemoBanner = () => {
  const { isDemoMode, demoBannerDismissed, dismissDemoBanner } = useRivalRadarStore();
  const router = useRouter();

  if (!isDemoMode || demoBannerDismissed) return null;

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2.5 flex items-center justify-between mb-6">
      <p className="text-sm text-foreground">
        <span className="font-medium">Demo mode</span> — you're viewing sample data.{' '}
        <button
          onClick={() => router.push('/')}
          className="text-primary font-medium hover:underline"
        >
          Sign up to track your own business →
        </button>
      </p>
      <button
        onClick={dismissDemoBanner}
        className="text-muted-foreground hover:text-foreground ml-4 shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
