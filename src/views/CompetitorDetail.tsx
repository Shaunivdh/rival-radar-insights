'use client';

import { useParams, useRouter } from 'next/navigation';
import { useRivalRadarStore } from '@/store/rivalradar';
import { ScoreChip } from '@/components/ScoreChip';
import { StarRating } from '@/components/StarRating';
import { SeverityBadge, ChangeEventCard } from '@/components/Badges';
import { ArrowLeft, ExternalLink, RefreshCw, Shield, FileText, Search, Bell } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'seo', label: 'SEO', icon: Search },
  { id: 'reputation', label: 'Reputation', icon: Shield },
  { id: 'trust', label: 'Trust & Credibility', icon: Shield },
  { id: 'content', label: 'Content & Engagement', icon: FileText },
  { id: 'changes', label: 'Changes', icon: Bell },
];

const CompetitorDetail = () => {
  const params = useParams();
  const id = params?.id as string | undefined;
  const router = useRouter();
  const { getBusinessById } = useRivalRadarStore();
  const [activeTab, setActiveTab] = useState('seo');
  const [scanning, setScanning] = useState(false);

  const handleScan = async () => {
    if (!biz || scanning) return;
    setScanning(true);
    try {
      const mode = biz.lastCrawledAt ? 'incremental' : 'initial';
      await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: biz.id, mode }),
      });
    } finally {
      setScanning(false);
    }
  };

  const biz = getBusinessById(id || '');
  if (!biz) return <div className="p-8 text-center text-muted-foreground">Business not found</div>;

  const s = biz.signals;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="text-2xl font-semibold text-foreground">{biz.name}</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
            {biz.url} <ExternalLink className="w-3 h-3" />
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Last crawled: {biz.lastCrawledAt ? new Date(biz.lastCrawledAt).toLocaleDateString() : 'Never'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="metric-label">Score</p>
            <p className="metric-value">{biz.aiScore?.overallScore ?? '—'}</p>
          </div>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning…' : 'Re-scan'}
          </button>
        </div>
      </div>

      {/* Score chips */}
      {biz.aiScore && (
        <div className="flex flex-wrap gap-2">
          <ScoreChip label="Reputation" score={biz.aiScore.reputationScore} size="md" />
          <ScoreChip label="Local Visibility" score={biz.aiScore.localVisibilityScore} size="md" />
          <ScoreChip label="Website Health" score={biz.aiScore.websiteHealthScore} size="md" />
          <ScoreChip label="GBP" score={biz.aiScore.gbpCompletenessScore} size="md" />
          <ScoreChip label="AI Presence" score={biz.aiScore.aiPresenceScore} size="md" />
          <ScoreChip label="Review Velocity" score={biz.aiScore.reviewVelocityScore} size="md" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="card-surface">
        {activeTab === 'seo' && s && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="metric-label mb-2">Title Tag</h3>
              <p className="text-sm text-foreground">{s.seo.title}</p>
            </div>
            <div>
              <h3 className="metric-label mb-2">Meta Description</h3>
              <p className="text-sm text-foreground">{s.seo.metaDescription}</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><p className="metric-label">Pages</p><p className="text-lg font-bold">{s.seo.pageCount}</p></div>
              <div><p className="metric-label">Blog Posts</p><p className="text-lg font-bold">{s.seo.blogPostCount}</p></div>
              <div><p className="metric-label">Internal Links</p><p className="text-lg font-bold">{s.seo.internalLinkCount}</p></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><p className="metric-label">Sitemap</p><p className="text-sm font-medium">{s.seo.hasSitemap ? '✓ Yes' : '✗ No'}</p></div>
              <div><p className="metric-label">Robots.txt</p><p className="text-sm font-medium">{s.seo.hasRobotsTxt ? '✓ Yes' : '✗ No'}</p></div>
              <div><p className="metric-label">Alt Tags</p><p className="text-sm font-medium capitalize">{s.seo.altTagCoverage}</p></div>
            </div>
            <div>
              <h3 className="metric-label mb-2">Schema Markup</h3>
              <div className="flex flex-wrap gap-1">
                {s.seo.schemaMarkupTypes.length ? s.seo.schemaMarkupTypes.map((t) => (
                  <span key={t} className="score-chip bg-muted text-muted-foreground">{t}</span>
                )) : <span className="text-sm text-muted-foreground">None detected</span>}
              </div>
            </div>
            {biz.serpData && (
              <div className="grid grid-cols-2 gap-4">
                <div><p className="metric-label">Organic Position</p><p className="text-lg font-bold">{biz.serpData.organicPosition ? `#${biz.serpData.organicPosition}` : '—'}</p></div>
                <div><p className="metric-label">Local Pack</p><p className="text-lg font-bold">{biz.serpData.localPackPosition ? `#${biz.serpData.localPackPosition}` : '—'}</p></div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'reputation' && (
          <div className="space-y-6">
            {biz.googleData && (
              <div>
                <h3 className="metric-label mb-3">Google Reviews</h3>
                <div className="flex items-center gap-4 mb-4">
                  <StarRating rating={biz.googleData.googleRating} />
                  <span className="text-sm text-muted-foreground">({biz.googleData.reviewCount} reviews)</span>
                </div>
                <div className="space-y-2">
                  {biz.googleData.recentReviews.map((r, i) => (
                    <div key={i} className="bg-muted/30 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{r.authorName}</span>
                        <StarRating rating={r.rating} />
                      </div>
                      <p className="text-sm text-muted-foreground">{r.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'trust' && s && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="metric-label mb-2">Accreditations</h3>
              <div className="flex flex-wrap gap-1">{s.trust.accreditations.map((a) => <span key={a} className="score-chip bg-primary/10 text-primary">{a}</span>)}</div>
            </div>
            <div>
              <h3 className="metric-label mb-2">Certifications</h3>
              <div className="flex flex-wrap gap-1">{s.trust.certifications.map((c) => <span key={c} className="score-chip bg-muted text-muted-foreground">{c}</span>)}</div>
            </div>
            <div>
              <h3 className="metric-label mb-2">Awards & Memberships</h3>
              <div className="flex flex-wrap gap-1">{s.trust.awardsAndMemberships.length ? s.trust.awardsAndMemberships.map((a) => <span key={a} className="score-chip bg-warning/10 text-[hsl(38,92%,40%)]">{a}</span>) : <span className="text-sm text-muted-foreground">None</span>}</div>
            </div>
            <div>
              <h3 className="metric-label mb-2">Named Clients</h3>
              <div className="flex flex-wrap gap-1">{s.trust.namedClientsOrPartners.length ? s.trust.namedClientsOrPartners.map((c) => <span key={c} className="score-chip bg-muted text-foreground">{c}</span>) : <span className="text-sm text-muted-foreground">None listed</span>}</div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><p className="metric-label">Case Studies</p><p className="text-lg font-bold">{s.trust.caseStudyCount}</p></div>
              <div><p className="metric-label">Testimonials</p><p className="text-lg font-bold">{s.trust.testimonialCount}</p></div>
              <div><p className="metric-label">Team Members</p><p className="text-lg font-bold">{s.trust.namedTeamMemberCount}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="metric-label">Years in Business</p><p className="text-lg font-bold">{s.trust.yearsInBusiness ?? '—'}</p></div>
              <div><p className="metric-label">Video Testimonials</p><p className="text-sm font-medium">{s.trust.videoTestimonials ? '✓ Yes' : '✗ No'}</p></div>
            </div>
            <div>
              <h3 className="metric-label mb-2">Guarantees</h3>
              {s.trust.guaranteesMentioned.length ? s.trust.guaranteesMentioned.map((g) => <p key={g} className="text-sm">• {g}</p>) : <span className="text-sm text-muted-foreground">None mentioned</span>}
            </div>
          </div>
        )}

        {activeTab === 'content' && s && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="metric-label mb-2">Services Listed</h3>
              <div className="flex flex-wrap gap-1">{s.content.servicesListed.map((sv) => <span key={sv} className="score-chip bg-muted text-foreground">{sv}</span>)}</div>
            </div>
            <div>
              <h3 className="metric-label mb-2">Service Areas</h3>
              <div className="flex flex-wrap gap-1">{s.content.serviceAreasMentioned.map((a) => <span key={a} className="score-chip bg-muted text-muted-foreground">{a}</span>)}</div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><p className="metric-label">Portfolio Items</p><p className="text-lg font-bold">{s.content.portfolioItemCount}</p></div>
              <div><p className="metric-label">FAQ Count</p><p className="text-lg font-bold">{s.content.faqCount}</p></div>
              <div><p className="metric-label">Total Pages</p><p className="text-lg font-bold">{s.content.totalPages}</p></div>
            </div>
            <div>
              <h3 className="metric-label mb-3">Engagement Tools</h3>
              <div className="space-y-2 text-sm">
                <p>{s.engagement.hasChatWidget ? `✓ Chat: ${s.engagement.chatProvider}` : '✗ No chat widget'}</p>
                <p>{s.engagement.hasBookingSystem ? `✓ Booking: ${s.engagement.bookingProvider}` : '✗ No booking system'}</p>
                <p>{s.engagement.hasContactForm ? '✓ Contact form' : '✗ No contact form'}</p>
                <p>{s.engagement.hasNewsletterSignup ? '✓ Newsletter signup' : '✗ No newsletter'}</p>
              </div>
            </div>
            <div>
              <h3 className="metric-label mb-2">CTAs Found</h3>
              <div className="flex flex-wrap gap-1">{s.engagement.ctaText.map((c) => <span key={c} className="score-chip bg-primary/10 text-primary">{c}</span>)}</div>
            </div>
            <div>
              <h3 className="metric-label mb-2">Social Platforms</h3>
              <div className="flex flex-wrap gap-1">{s.engagement.socialLinksPresent.map((p) => <span key={p} className="score-chip bg-muted text-muted-foreground">{p}</span>)}</div>
            </div>
          </div>
        )}

        {activeTab === 'changes' && (
          <div className="space-y-3">
            {biz.changeEvents.length > 0 ? (
              biz.changeEvents
                .sort((a, b) => b.detectedAt - a.detectedAt)
                .map((event) => <ChangeEventCard key={event.id} event={event} />)
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No changes detected yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CompetitorDetail;
