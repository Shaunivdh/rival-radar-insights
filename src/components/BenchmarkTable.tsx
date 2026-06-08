'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRivalRadarStore } from '@/store/rivalradar';
import { ScoreChip } from '@/components/ScoreChip';
import type { Business } from '@/types';
import { ExternalLink } from 'lucide-react';

const METRICS: { key: keyof NonNullable<Business['aiScore']>; emoji: string; label: string }[] = [
  { key: 'reputationScore', emoji: '🌟', label: 'Reputation' },
  { key: 'localVisibilityScore', emoji: '📍', label: 'Local Visibility' },
  { key: 'websiteHealthScore', emoji: '🌐', label: 'Website Health' },
  { key: 'gbpCompletenessScore', emoji: '📋', label: 'GBP Completeness' },
  { key: 'aiPresenceScore', emoji: '🤖', label: 'AI Presence' },
  { key: 'reviewVelocityScore', emoji: '⚡', label: 'Review Velocity (G)' },
];

const GOOGLE_METRICS = new Set<(typeof METRICS)[number]['key']>([
  'reputationScore',
  'gbpCompletenessScore',
  'reviewVelocityScore',
]);

function isDataMissing(key: keyof NonNullable<Business['aiScore']>, biz: Business): boolean {
  if (GOOGLE_METRICS.has(key)) return biz.googleData === null;
  if (key === 'localVisibilityScore') return biz.serpData === null;
  if (key === 'websiteHealthScore') return biz.signals === null;
  if (key === 'aiPresenceScore') return biz.aiVisibility === null;
  return false;
}

const Row = ({ biz, isOwn }: { biz: Business; isOwn?: boolean }) => {
  const router = useRouter();
  return (
    <tr
      className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={() => router.push(`/competitors/${biz.id}`)}
    >
      <td className="px-4 py-3 min-w-[160px]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{biz.name}</span>
          {isOwn && (
            <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              YOU
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
          {biz.domain} <ExternalLink className="w-3 h-3" />
        </p>
      </td>

      <td className="px-4 py-3 text-center">
        {biz.aiScore ? (
          <ScoreChip
            label=""
            score={biz.aiScore.overallScore}
            weeklyDelta={biz.aiScore.weeklyDelta}
          />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {METRICS.map(({ key }) => {
        const missing = isDataMissing(key, biz);
        if (!biz.aiScore || missing) {
          if (isOwn && missing && GOOGLE_METRICS.has(key)) {
            return (
              <td key={key} className="px-4 py-3 text-center">
                <Link
                  href="/settings"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 px-1.5 py-0.5 rounded whitespace-nowrap"
                >
                  Setup needed
                </Link>
              </td>
            );
          }
          return (
            <td key={key} className="px-4 py-3 text-center">
              <span
                className="text-xs text-muted-foreground"
                title={missing ? `No data found for ${biz.name}` : undefined}
              >
                —
              </span>
            </td>
          );
        }
        const val = biz.aiScore[key];
        if (val === null) {
          return (
            <td key={key} className="px-4 py-3 text-center">
              <span className="text-xs text-muted-foreground">—</span>
            </td>
          );
        }
        return (
          <td key={key} className="px-4 py-3 text-center">
            <ScoreChip label="" score={val as number} />
          </td>
        );
      })}
    </tr>
  );
};

export const BenchmarkTable = () => {
  const { project } = useRivalRadarStore();
  if (!project) return null;

  const allBiz = [project.ownBusiness, ...project.competitors];

  return (
    <div className="card-surface overflow-x-auto p-0">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Business
            </th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-center">
              Overall
            </th>
            {METRICS.map(({ emoji, label }) => (
              <th
                key={label}
                className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap"
              >
                {emoji} {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allBiz.map((biz) => (
            <Row key={biz.id} biz={biz} isOwn={biz.id === project.ownBusiness.id} />
          ))}
        </tbody>
      </table>
    </div>
  );
};
