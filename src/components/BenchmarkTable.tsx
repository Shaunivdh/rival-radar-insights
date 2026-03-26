'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRivalRadarStore } from '@/store/rivalradar';
import { ScoreChip } from '@/components/ScoreChip';
import type { Business } from '@/types';
import { ExternalLink } from 'lucide-react';

const METRICS: { key: keyof NonNullable<Business['aiScore']>; emoji: string; label: string }[] = [
  { key: 'reputationScore',      emoji: '🌟', label: 'Reputation' },
  { key: 'localVisibilityScore', emoji: '📍', label: 'Local Visibility' },
  { key: 'websiteHealthScore',   emoji: '🌐', label: 'Website Health' },
  { key: 'gbpCompletenessScore', emoji: '📋', label: 'GBP Completeness' },
  { key: 'aiPresenceScore',      emoji: '🤖', label: 'AI Presence' },
  { key: 'reviewVelocityScore',  emoji: '⚡', label: 'Review Velocity' },
];

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
          {isOwn && <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">YOU</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
          {biz.domain} <ExternalLink className="w-3 h-3" />
        </p>
      </td>

      <td className="px-4 py-3 text-center">
        {biz.aiScore
          ? <ScoreChip label="" score={biz.aiScore.overallScore} weeklyDelta={biz.aiScore.weeklyDelta} />
          : <span className="text-xs text-muted-foreground">—</span>}
      </td>

      {METRICS.map(({ key }) => (
        <td key={key} className="px-4 py-3 text-center">
          {biz.aiScore
            ? <ScoreChip label="" score={biz.aiScore[key] as number} />
            : <span className="text-xs text-muted-foreground">—</span>}
        </td>
      ))}
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
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Business</th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-center">Overall</th>
            {METRICS.map(({ emoji, label }) => (
              <th key={label} className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">
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
