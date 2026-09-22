'use client';

import { useRivalRadarStore } from '@/store/rivalradar';
import { GreetingIcon, type DayPart } from '@/components/GreetingIcon';

function getDayPart(): DayPart {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const GREETING: Record<DayPart, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
};

export function DashboardGreeting() {
  const { user, project } = useRivalRadarStore();

  const dayPart = getDayPart();

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
        <GreetingIcon part={dayPart} className="w-12 h-12 shrink-0 drop-shadow-sm" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {GREETING[dayPart]}
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
