'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRivalRadarStore } from '@/store/rivalradar';
import { StarRating } from '@/components/StarRating';
import type { Business } from '@/types';
import { ExternalLink } from 'lucide-react';

function daysAgo(ts: number): number {
  return Math.floor((Date.now() - ts) / 86400000);
}

function timeAgoLabel(ts: number): string {
  const days = daysAgo(ts);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function LocalPackBadge({ pos, searchTerm }: { pos: number | null; searchTerm?: string | null }) {
  if (pos === null) {
    return <span className="text-xs text-muted-foreground" title={searchTerm ?? undefined}>Not in top 10</span>;
  }
  const color =
    pos <= 3 ? 'bg-green-100 text-green-700' :
    pos <= 6 ? 'bg-amber-100 text-amber-700' :
               'bg-red-100 text-red-700';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`} title={searchTerm ?? undefined}>
      {ordinal(pos)}
    </span>
  );
}

const Row = ({ biz, isOwn }: { biz: Business; isOwn?: boolean }) => {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  const lastChange = biz.changeEvents.length
    ? biz.changeEvents.reduce((a, b) => (a.detectedAt > b.detectedAt ? a : b))
    : null;

  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => router.push(`/competitors/${biz.id}`)}
      >
        {/* Business */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{biz.name}</span>
            {isOwn && <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">YOU</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            {biz.domain} <ExternalLink className="w-3 h-3" />
          </p>
        </td>

        {/* Google Rating */}
        <td className="px-4 py-3">
          {biz.googleData ? (
            <div>
              <StarRating rating={biz.googleData.googleRating} />
              <p className="text-[10px] text-muted-foreground mt-0.5">via Google</p>
              {biz.lastCrawledAt && (
                <p className="text-[10px] text-muted-foreground">
                  Last scanned: {timeAgoLabel(biz.lastCrawledAt)}
                </p>
              )}
            </div>
          ) : <span className="text-xs text-muted-foreground">—</span>}
        </td>

        {/* Reviews */}
        <td className="px-4 py-3 text-center">
          {biz.googleData
            ? <span className="text-sm font-semibold">{biz.googleData.reviewCount}</span>
            : <span className="text-xs text-muted-foreground">—</span>}
        </td>

        {/* Local Pack */}
        <td className="px-4 py-3 text-center">
          <LocalPackBadge
            pos={biz.serpData?.localPackPosition ?? null}
            searchTerm={biz.serpData?.searchTerm}
          />
        </td>

        {/* Website Changes */}
        <td
          className="px-4 py-3 text-center"
          onClick={(e) => {
            if (!lastChange) return;
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {!lastChange ? (
            <span className="text-xs text-muted-foreground">No changes detected</span>
          ) : (
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full cursor-pointer ${
                daysAgo(lastChange.detectedAt) <= 7
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {timeAgoLabel(lastChange.detectedAt)}
            </span>
          )}
        </td>

        {/* AI Search */}
        <td className="px-4 py-3 text-center">
          {biz.aiVisibility == null ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : biz.aiVisibility.mentioned ? (
            <span className="text-xs font-medium text-green-600" title={biz.aiVisibility.excerpt ?? undefined}>
              ✓ Mentioned
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">✗ Not found</span>
          )}
        </td>

        {/* Overall Score */}
        <td className="px-4 py-3 text-center">
          <span className="metric-value text-xl">{biz.aiScore?.overallScore ?? '—'}</span>
        </td>
      </tr>

      {expanded && lastChange && (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={7} className="px-6 py-3 text-sm text-muted-foreground">
            {lastChange.summary}
          </td>
        </tr>
      )}
    </>
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
            {['Business', 'Google Rating', 'Reviews', 'Local Pack', 'Website Changes', 'AI Search', 'Overall Score'].map((h) => (
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
