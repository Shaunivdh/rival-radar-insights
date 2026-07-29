'use client';

import { useRivalRadarStore } from '@/store/rivalradar';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardGreeting() {
  const { user, project } = useRivalRadarStore();

  const displayName = user?.username
    ? user.username.charAt(0).toUpperCase() + user.username.slice(1)
    : '';

  const recentChanges =
    project?.competitors
      .flatMap((c) => c.changeEvents)
      .filter((e) => Date.now() - e.detectedAt < 7 * 86400000).length ?? 0;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-greeting p-6 border border-primary/10">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shrink-0 shadow-sm">
          <span className="text-2xl">🦉</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {getGreeting()}
            {displayName ? `, ${displayName}` : ''}
          </h1>
          <p className="text-sm text-gray-600 mt-1 max-w-xl leading-relaxed">
            {recentChanges > 0 ? (
              <>
                There{recentChanges === 1 ? "'s" : ' are'}{' '}
                <span className="text-primary font-semibold">
                  {recentChanges} new {recentChanges === 1 ? 'change' : 'changes'}
                </span>{' '}
                detected this week. I've spotted a few things we could tidy up together to keep the
                momentum going.
              </>
            ) : (
              "Things are looking steady this week. I've spotted a few small things we could tidy up together to keep the momentum going. No pressure, take it one step at a time."
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
