'use client';

import { useRouter } from 'next/navigation';
import { useRivalRadarStore } from '@/store/rivalradar';
import { ScoreChip } from '@/components/ScoreChip';
import { StarRating } from '@/components/StarRating';
import { TransparencyBadge } from '@/components/Badges';
import type { Business } from '@/types';
import { ExternalLink } from 'lucide-react';

function timeAgo(ts: number | null): string {
  if (!ts) return '—';
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

const Row = ({ biz, isOwn }: { biz: Business; isOwn?: boolean }) => {
  const router = useRouter();
  const lastChange = biz.changeEvents.length
    ? biz.changeEvents.reduce((a, b) => (a.detectedAt > b.detectedAt ? a : b))
    : null;

  return (
    <tr
      className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={() => router.push(`/competitors/${biz.id}`)}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{biz.name}</span>
          {isOwn && <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">YOU</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
          {biz.domain} <ExternalLink className="w-3 h-3" />
        </p>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="metric-value text-xl">{biz.aiScore?.overallScore ?? '—'}</span>
      </td>
      <td className="px-4 py-3">
        {biz.googleData ? (
          <div>
            <StarRating rating={biz.googleData.googleRating} />
            <p className="text-xs text-muted-foreground">{biz.googleData.reviewCount} reviews</p>
          </div>
        ) : '—'}
      </td>
      <td className="px-4 py-3 text-center">
        {biz.trustpilotData?.trustpilotRating ? (
          <div>
            <span className="text-sm font-semibold">{biz.trustpilotData.trustpilotRating}</span>
            <p className="text-xs text-muted-foreground">{biz.trustpilotData.trustpilotReviewCount} reviews</p>
          </div>
        ) : <span className="text-xs text-muted-foreground">—</span>}
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-semibold">{biz.serpData?.organicPosition ? `#${biz.serpData.organicPosition}` : '—'}</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-semibold">{biz.serpData?.localPackPosition ? `#${biz.serpData.localPackPosition}` : '—'}</span>
      </td>
      <td className="px-4 py-3 text-center">
        {biz.signals?.pricing.priceTransparencyScore ? (
          <TransparencyBadge level={biz.signals.pricing.priceTransparencyScore} />
        ) : '—'}
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-semibold">{biz.signals?.trust ? (biz.signals.trust.accreditations.length + biz.signals.trust.certifications.length + biz.signals.trust.awardsAndMemberships.length) : '—'}</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-semibold">{biz.aiScore?.contentScore ?? '—'}</span>
      </td>
      <td className="px-4 py-3 text-center text-xs text-muted-foreground">
        {lastChange ? timeAgo(lastChange.detectedAt) : '—'}
      </td>
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
            {['Business', 'Score', 'Google', 'Trustpilot', 'Rank', 'Local Pack', 'Pricing', 'Trust', 'Content', 'Last Change'].map((h) => (
              <th key={h} className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
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
