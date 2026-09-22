'use client';

import { Info } from 'lucide-react';
import type { Business } from '@/types';

interface Props {
  own: Business;
  competitors: Business[];
}

function timeAgo(ts: number | null): string {
  if (!ts) return 'Not yet scanned';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `Updated ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Updated ${hrs}h ago`;
  return `Updated ${Math.floor(hrs / 24)}d ago`;
}

function CircleScore({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        Overall
      </p>
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
          <circle
            cx="44"
            cy="44"
            r={r}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circ}`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-primary">
          {score}
        </span>
      </div>
    </div>
  );
}

const METRICS: {
  label: string;
  key:
    | 'reputationScore'
    | 'localVisibilityScore'
    | 'websiteHealthScore'
    | 'gbpCompletenessScore'
    | 'aiPresenceScore'
    | 'reviewVelocityScore';
  color: string;
}[] = [
  { label: 'Online Reputation', key: 'reputationScore', color: 'hsl(var(--metric-reputation))' },
  {
    label: 'Local Search Visibility',
    key: 'localVisibilityScore',
    color: 'hsl(var(--metric-visibility))',
  },
  { label: 'Website Performance', key: 'websiteHealthScore', color: 'hsl(var(--metric-website))' },
  {
    label: 'Google Business Profile',
    key: 'gbpCompletenessScore',
    color: 'hsl(var(--metric-gbp))',
  },
  { label: 'AI Visibility', key: 'aiPresenceScore', color: 'hsl(var(--metric-ai))' },
  { label: 'Review Momentum', key: 'reviewVelocityScore', color: 'hsl(var(--metric-reviews))' },
];

function MetricRow({
  label,
  score,
  competitorScore,
  color,
  tooltip,
}: {
  label: string;
  score: number | null;
  competitorScore: number | null;
  color: string;
  tooltip: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="relative group flex items-center gap-1">
          <span className="text-sm text-muted-foreground">{label}</span>
          <Info className="w-3 h-3 text-muted-foreground/50 cursor-default shrink-0" />
          <div className="absolute left-0 top-5 z-20 opacity-0 group-hover:opacity-100 transition-opacity w-60 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none leading-relaxed">
            {tooltip}
          </div>
        </div>
        <span className="text-base font-bold text-foreground tabular-nums">
          {score === null ? '—' : score}
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-muted overflow-visible">
        {score !== null && (
          <div
            className="h-full rounded-full"
            style={{ width: `${score}%`, backgroundColor: color }}
          />
        )}
        {competitorScore !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-foreground/40 rounded-full"
            style={{ left: `${competitorScore}%` }}
          />
        )}
      </div>
    </div>
  );
}

export function BusinessScoreCard({ own, competitors }: Props) {
  const score = own.aiScore;

  return (
    <div className="card-surface space-y-6 p-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-1">
            How you're doing
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{own.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {own.googleData?.address ? <>{own.googleData.address}</> : <>{own.domain}</>}
            {own.lastCrawledAt && (
              <> &middot; Last checked {timeAgo(own.lastCrawledAt).replace('Updated ', '')}</>
            )}
          </p>
        </div>
        {score && <CircleScore score={score.overallScore} />}
      </div>

      {/* Score summary blurb */}
      {score && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {score.overallScore >= 70 ? (
            <>
              You're <span className="font-semibold text-foreground">performing well</span> in your
              area. Keep up the momentum and focus on your top priority actions.
            </>
          ) : score.overallScore >= 45 ? (
            <>
              You're <span className="font-semibold text-foreground">solidly mid-pack</span> in your
              area — with the biggest room to grow on your lower-scoring signals. Let's tackle that
              together.
            </>
          ) : (
            <>
              There's <span className="font-semibold text-foreground">real room to grow</span> your
              local visibility. Start with the priority actions on the right to move the needle
              quickly.
            </>
          )}
        </p>
      )}

      {/* Metric rows */}
      {score && (
        <div className="space-y-4">
          {METRICS.map(({ label, key, color }) => {
            const ownScore = score[key];
            const competitorScores = competitors
              .map((c) => c.aiScore?.[key])
              .filter((s): s is number => typeof s === 'number');
            const topCompetitorScore = competitorScores.length
              ? Math.max(...competitorScores)
              : null;

            let tooltip = '';
            const g = own.googleData;
            const s = own.serpData;
            const v = own.aiVisibility;
            if (key === 'reputationScore') {
              tooltip = g
                ? `${g.googleRating}★ Google rating · ${g.reviewCount} reviews`
                : 'Based on Google rating and review count';
            } else if (key === 'localVisibilityScore') {
              tooltip =
                s?.localVisibilityPosition != null
                  ? `#${s.localVisibilityPosition} in Google local pack`
                  : s != null
                    ? 'Not found in top 10 local results'
                    : 'No search ranking data yet';
            } else if (key === 'websiteHealthScore') {
              const parts: string[] = [];
              if (own.signals?.engagement.hasContactForm) parts.push('contact form ✓');
              if (own.signals?.engagement.hasCallToAction) parts.push('CTA ✓');
              if (own.signals?.seo.hasSitemap) parts.push('sitemap ✓');
              if (own.pagespeedData) {
                const avg = Math.round(
                  (own.pagespeedData.mobile.performanceScore +
                    own.pagespeedData.desktop.performanceScore) /
                    2,
                );
                parts.push(`PageSpeed ${avg}/100`);
              }
              tooltip = parts.length
                ? parts.join(' · ')
                : 'Crawl-based: contact info, CTA, SEO tags, page speed';
            } else if (key === 'gbpCompletenessScore') {
              if (g) {
                const filled: string[] = [];
                if (g.address) filled.push('address');
                if (g.phoneNumber) filled.push('phone');
                if (g.openingHours?.length) filled.push('hours');
                if (g.photos > 0) filled.push(`${g.photos} photos`);
                if (g.description) filled.push('description');
                if (g.website) filled.push('website');
                tooltip = filled.length
                  ? `GBP fields present: ${filled.join(', ')}`
                  : 'No Google Business Profile fields found';
              } else {
                tooltip =
                  'Google Business Profile completeness (address, phone, hours, photos, etc.)';
              }
            } else if (key === 'aiPresenceScore') {
              tooltip = v
                ? `Mentioned in ${v.mentionCount} of ${v.totalPrompts} AI prompts`
                : 'How often your business appears in AI-generated answers';
            } else if (key === 'reviewVelocityScore') {
              if (g) {
                const cutoff = Date.now() - 30 * 86400000;
                const recent = g.recentReviews.filter((r) => r.time >= cutoff).length;
                const replied = g.recentReviews.filter((r) => r.ownerReply).length;
                tooltip = `~${recent} new reviews in last 30 days · ${replied}/${g.recentReviews.length} replies`;
              } else {
                tooltip = 'New Google reviews per month + owner reply rate bonus';
              }
            }

            return (
              <MetricRow
                key={key}
                label={label}
                score={ownScore}
                competitorScore={topCompetitorScore}
                color={color}
                tooltip={tooltip}
              />
            );
          })}
        </div>
      )}

      {/* Legend */}
      {score && (
        <div className="flex items-center gap-4 pt-1">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-2 rounded-full bg-[hsl(var(--metric-reputation))]" />
            <span className="text-xs text-muted-foreground">You</span>
          </div>
          <span className="text-border text-sm">|</span>
          <div className="flex items-center gap-1.5">
            <div className="w-0.5 h-4 bg-foreground/40 rounded-full" />
            <span className="text-xs text-muted-foreground">Top Competitor</span>
          </div>
        </div>
      )}
    </div>
  );
}
