import { X } from 'lucide-react';
import { useRivalRadarStore } from '@/store/rivalradar';

export const DemoBanner = () => {
  const { isDemoMode, demoBannerDismissed, dismissDemoBanner } = useRivalRadarStore();

  if (!isDemoMode || demoBannerDismissed) return null;

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2.5 flex items-center justify-between mb-6">
      <p className="text-sm text-foreground">
        <span className="font-medium">Demo mode</span> — add your API keys in Settings to enable live scanning
      </p>
      <button onClick={dismissDemoBanner} className="text-muted-foreground hover:text-foreground">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
