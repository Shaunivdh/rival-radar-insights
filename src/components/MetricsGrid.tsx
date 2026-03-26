import { cn } from '@/lib/utils';
import type { Business } from '@/types';

interface MetricCardProps {
  emoji: string;
  title: string;
  score: number;
  subtitle: string;
  detail: string;
  source: string;
}

function scoreColor(s: number) {
  if (s >= 70) return { bar: 'bg-green-500', text: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30' };
  if (s >= 40) return { bar: 'bg-amber-400', text: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' };
  return { bar: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30' };
}

function MetricCard({ emoji, title, score, subtitle, detail, source }: MetricCardProps) {
  const colors = scoreColor(score);
  return (
    <div className={cn('card-surface flex flex-col gap-3', colors.bg)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{emoji}</span>
          <p className="text-sm font-semibold text-foreground">{title}</p>
        </div>
        <span className={cn('text-2xl font-bold tabular-nums', colors.text)}>{score}</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', colors.bar)}
          style={{ width: `${score}%` }}
        />
      </div>
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

export function MetricsGrid({ business }: MetricsGridProps) {
  const { aiScore, googleData, serpData, aiVisibility } = business;
  if (!aiScore) return null;

  const localPackPos = serpData?.localPackPosition ?? null;
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
      />
      <MetricCard
        emoji="📍"
        title="Local Visibility"
        score={aiScore.localVisibilityScore}
        subtitle={localPackLabel}
        detail="Position 1 = 100 · Not in top 7 = 0"
        source="SerpAPI"
      />
      <MetricCard
        emoji="🌐"
        title="Website Health"
        score={aiScore.websiteHealthScore}
        subtitle="Page structure & contact signals"
        detail="Phone, CTA, H1, sitemap, schema"
        source="Cloudflare Crawl"
      />
      <MetricCard
        emoji="📋"
        title="GBP Completeness"
        score={aiScore.gbpCompletenessScore}
        subtitle={gbpLabel}
        detail="Photos, hours, phone, description, website"
        source="Google Places"
      />
      <MetricCard
        emoji="🤖"
        title="AI Search Presence"
        score={aiScore.aiPresenceScore}
        subtitle={aiLabel}
        detail="Simulated ChatGPT / Perplexity queries"
        source="Claude API"
      />
      <MetricCard
        emoji="⚡"
        title="Review Velocity"
        score={aiScore.reviewVelocityScore}
        subtitle="New reviews per 30 days"
        detail="5 reviews/month = 100 · 0 = losing ground"
        source="Google Places"
      />
    </div>
  );
}
