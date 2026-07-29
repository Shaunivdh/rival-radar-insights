'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRivalRadarStore } from '@/store/rivalradar';

const DashboardTopbar = () => {
  const { user, project, settings } = useRivalRadarStore();

  const businessName = project?.ownBusiness?.name ?? 'My Business';
  const initials = businessName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <header className="flex items-center justify-between gap-4 px-4 lg:px-8 py-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{businessName}</p>
          {settings?.location && (
            <p className="text-xs text-muted-foreground truncate">{settings.location}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-4 h-4" />
        </Button>
        <div className="w-8 h-8 rounded-full bg-gradient-hero flex items-center justify-center text-primary-foreground text-xs font-bold">
          {user?.email?.[0]?.toUpperCase() ?? 'U'}
        </div>
      </div>
    </header>
  );
};

export default DashboardTopbar;
