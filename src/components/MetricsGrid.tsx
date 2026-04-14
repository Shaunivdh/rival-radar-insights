import { cn } from '@/lib/utils';
import type { Business, PageSpeedMetrics } from '@/types';

interface MetricCardProps {
  emoji: string;
  title: string;
  score: number;
  subtitle: string;
  detail: string;
  source: string;
  error?: string;    // enrichment error — amber warning
  noData?: string;   // "Not yet tested" / "Insufficient data" — grey
}

function scoreColor(s: number) {
  if (s >= 70) return { bar: 'bg-green-500', text: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30' };
  if (s >= 40) return { bar: 'bg-amber-400', text: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' };
  return { bar: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30' };
}

function MetricCard({ emoji, title, score, subtitle, detail, source, error, noData }: MetricCardProps) {
  const overrideMsg = error ?? noData;
  const colors = overrideMsg
    ? (error
        ? { bar: '', text: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' }
        : { bar: '', text: 'text-muted-foreground', bg: '' })
    : scoreColor(score);

  return (
    <div className={cn('card-surface flex flex-col gap-3', colors.bg)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{emoji}</span>
          <p className="text-sm font-semibold text-foreground">{title}</p>
        </div>
        {overrideMsg ? (
          <span className={cn('text-xs font-medium text-right max-w-[60%]', colors.text)}>
            {error && <span className="mr-1">⚠</span>}{overrideMsg}
          </span>
        ) : (
          <span className={cn('text-2xl font-bold tabular-nums', colors.text)}>{score}</span>
        )}
      </div>
      {!overrideMsg && (
        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', colors.bar)}
            style={{ width: `${score}%` }}
          />
        </div>
      )}
      <div>
        <p className="text-xs font-medium text-foreground">{subtitle}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
      </div>
      <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mt-auto">Source: {source}</p>
    </div>
  );
}

interface MetricsGridProps {
  business: Business;
}

function formatLcp(ms: number | null) {
  if (ms === null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function psiSubtitle(m: PageSpeedMetrics) {
  const lcp = formatLcp(m.lcp);
  const cls = m.cls !== null ? m.cls.toFixed(2) : '—';
  const inp = m.inp !== null ? `${Math.round(m.inp)}ms` : '—';
  return `LCP ${lcp} · CLS ${cls} · INP ${inp}`;
}

export function MetricsGrid({ business }: MetricsGridProps) {
  const { aiScore, googleData, serpData, aiVisibility, pagespeedData, enrichmentErrors, trustpilotData } = business;
  if (!aiScore) return null;

  const getErr = (score: number, key: keyof NonNullable<typeof enrichmentErrors>) =>
    score === 0 ? enrichmentErrors?.[key] : undefined;

  const localPackPos = serpData?.localVisabilityPosition ?? null;
  const localPackLabel =
    localPackPos === 1 ? '#1 in local 3-pack'
    : localPackPos === 2 ? '#2 in local 3-pack'
    : localPackPos === 3 ? '#3 in local 3-pack'
    : localPackPos != null ? `Position ${localPackPos}`
    : 'Not in top 7';

  const ratingLabel = googleData
    ? `${googleData.googleRating.toFixed(1)}★ · ${googleData.reviewCount.toLocaleString()} reviews`
    : 'No Google data';

  const recent30 = googleData?.recentReviews.filter((r) => r.time >= Date.now() - 30 * 86400000) ?? [];
  const recencyLabel = recent30.length > 0
    ? `${recent30.length} review${recent30.length > 1 ? 's' : ''} in last 30 days`
    : 'No reviews in last 30 days';

  const aiLabel = aiVisibility
    ? `Mentioned in ${aiVisibility.mentionCount} of ${aiVisibility.totalPrompts} test prompts`
    : 'Not yet tested';

  const gbpFields = googleData ? [
    googleData.photos > 0,
    (googleData.openingHours?.length ?? 0) > 0,
    !!googleData.phoneNumber,
    !!googleData.address,
    !!googleData.description,
    !!googleData.website,
  ].filter(Boolean).length : 0;

  const gbpLabel = googleData ? `${gbpFields} of 6 key fields complete` : 'No GBP data';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <MetricCard
        emoji="🌟"
        title="Reputation Score"
        score={aiScore.reputationScore}
        subtitle={ratingLabel}
        detail={recencyLabel}
        source="Google Places"
        error={getErr(aiScore.reputationScore, 'google')}
      />
      <MetricCard
        emoji="📍"
        title="Local Visibility"
        score={aiScore.localVisibilityScore}
        subtitle={localPackLabel}
        detail="Position 1 = 100 · Position 10 = 10 · >10 = 0"
        source="SerpAPI"
        error={getErr(aiScore.localVisibilityScore, 'serp')}
      />
      <MetricCard
        emoji="🌐"
        title="Website Health"
        score={aiScore.websiteHealthScore}
        subtitle="Page structure & contact signals"
        detail="Phone, CTA, H1, sitemap, schema"
        source="Cloudflare Crawl"
        error={getErr(aiScore.websiteHealthScore, 'crawl')}
      />
      <MetricCard
        emoji="📋"
        title="GBP Completeness"
        score={aiScore.gbpCompletenessScore}
        subtitle={gbpLabel}
        detail="Photos, hours, phone, description, website"
        source="Google Places"
        error={getErr(aiScore.gbpCompletenessScore, 'google')}
      />
      <MetricCard
        emoji="🤖"
        title="AI Search Presence"
        score={aiScore.aiPresenceScore}
        subtitle={aiLabel}
        detail="Simulated ChatGPT / Perplexity queries"
        source="Claude API"
        noData={!aiVisibility ? 'Not yet tested' : undefined}
      />
      <MetricCard
        emoji="⚡"
        title="Review Velocity (Google)"
        score={aiScore.reviewVelocityScore}
        subtitle="New Google reviews per 30 days"
        detail="5 reviews/month = 100 · 0 = losing ground"
        source="Google Places"
        noData={aiScore.weeklyDelta === null ? 'Insufficient data' : undefined}
      />
      <MetricCard
        emoji="⭐"
        title="Review Velocity (Trustpilot)"
        score={aiScore.trustpilotVelocityScore ?? 0}
        subtitle={trustpilotData?.trustpilotReviewCount != null
          ? `${trustpilotData.trustpilotRating?.toFixed(1) ?? '?'}★ · ${trustpilotData.trustpilotReviewCount.toLocaleString()} reviews`
          : 'Not found on Trustpilot'}
        detail="5 reviews/month = 100 · 0 = losing ground"
        source="Trustpilot (CF Crawl)"
        noData={aiScore.trustpilotVelocityScore === null ? 'Not found on Trustpilot' : undefined}
      />
      <MetricCard
        emoji="📱"
        title="Mobile Page Speed"
        score={pagespeedData?.mobile.performanceScore ?? 0}
        subtitle={pagespeedData ? psiSubtitle(pagespeedData.mobile) : '—'}
        detail="Lighthouse performance · Core Web Vitals"
        source="Google PageSpeed"
        noData={!pagespeedData ? 'Not yet scanned' : undefined}
      />
      <MetricCard
        emoji="🖥️"
        title="Desktop Page Speed"
        score={pagespeedData?.desktop.performanceScore ?? 0}
        subtitle={pagespeedData ? psiSubtitle(pagespeedData.desktop) : '—'}
        detail="Lighthouse performance · Core Web Vitals"
        source="Google PageSpeed"
        noData={!pagespeedData ? 'Not yet scanned' : undefined}
      />
    </div>
  );
}
