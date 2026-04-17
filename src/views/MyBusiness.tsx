'use client';

import { useRivalRadarStore } from '@/store/rivalradar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Globe, Star, Search, Gauge, Shield, FileText, MousePointerClick,
  CheckCircle2, XCircle, Hash, Link2, Image, Phone, Mail, Calendar,
  MessageSquare, Award, Users, Zap, BarChart3, Clock, Monitor, Smartphone,
  MapPin, Brain, ExternalLink, AlertTriangle, Info,
} from 'lucide-react';

const StatusIcon = ({ ok }: { ok: boolean }) =>
  ok ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-destructive" />;

const InfoTip = ({ text }: { text: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help inline ml-1" />
    </TooltipTrigger>
    <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
  </Tooltip>
);

const ScoreRing = ({ score, label, size = 'lg' }: { score: number; label: string; size?: 'sm' | 'lg' }) => {
  const color = score >= 90 ? 'text-green-500' : score >= 50 ? 'text-amber-500' : 'text-destructive';
  const dim = size === 'lg' ? 'w-28 h-28' : 'w-20 h-20';
  const textSize = size === 'lg' ? 'text-3xl' : 'text-xl';
  const circumference = size === 'lg' ? 2 * Math.PI * 48 : 2 * Math.PI * 34;
  const radius = size === 'lg' ? 48 : 34;
  const center = size === 'lg' ? 56 : 40;
  const viewBox = size === 'lg' ? '0 0 112 112' : '0 0 80 80';
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative ${dim}`}>
        <svg className="transform -rotate-90" viewBox={viewBox}>
          <circle cx={center} cy={center} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
          <circle
            cx={center} cy={center} r={radius} fill="none"
            stroke="currentColor" strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (score / 100) * circumference}
            strokeLinecap="round"
            className={color}
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center ${textSize} font-bold ${color}`}>{score}</span>
      </div>
      <span className="text-sm text-muted-foreground font-medium">{label}</span>
    </div>
  );
};

const MetricRow = ({ label, value, info, icon: Icon }: { label: string; value: React.ReactNode; info?: string; icon?: React.ElementType }) => (
  <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {Icon && <Icon className="w-4 h-4" />}
      <span>{label}</span>
      {info && <InfoTip text={info} />}
    </div>
    <div className="text-sm font-medium">{value}</div>
  </div>
);

const CoreWebVitalCard = ({ label, value, unit, good, needs, info }: {
  label: string; value: number | null; unit: string; good: number; needs: number; info: string;
}) => {
  if (value === null) return (
    <div className="neu-flat p-5 space-y-3">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <p className="text-sm text-muted-foreground">No data</p>
    </div>
  );
  const status = value <= good ? 'good' : value <= needs ? 'needs-improvement' : 'poor';
  const color = status === 'good' ? 'text-green-500 bg-green-50' : status === 'needs-improvement' ? 'text-amber-500 bg-amber-50' : 'text-destructive bg-red-50';
  const statusLabel = status === 'good' ? 'Good' : status === 'needs-improvement' ? 'Needs Work' : 'Poor';
  return (
    <div className="neu-flat p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}<InfoTip text={info} /></span>
        <Badge variant="outline" className={`text-xs ${color} border-0`}>{statusLabel}</Badge>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${color.split(' ')[0]}`}>{value}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <div className="flex gap-1 text-[10px] text-muted-foreground">
        <span>Good: ≤{good}{unit}</span>
        <span>·</span>
        <span>Poor: &gt;{needs}{unit}</span>
      </div>
    </div>
  );
};

const MyBusiness = () => {
  const project = useRivalRadarStore((s) => s.project);
  const biz = project?.ownBusiness;

  if (!biz) return <div className="p-8 text-center text-muted-foreground">No business found.</div>;

  const s = biz.signals;
  const g = biz.googleData;
  const serp = biz.serpData;
  const ai = biz.aiVisibility;
  const ps = biz.pagespeedData;

  // PageSpeed API returns ms for LCP/FCP/INP; convert LCP+FCP to seconds for display
  const toS = (ms: number | null) => ms !== null ? Math.round((ms / 1000) * 10) / 10 : null;

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-3xl font-bold">{biz.name}</h1>
          <Badge variant="secondary" className="text-xs gap-1">
            <Globe className="w-3 h-3" />
            {biz.url.replace(/^https?:\/\//, '')}
          </Badge>
        </div>
        {biz.lastCrawledAt && (
          <p className="text-muted-foreground text-sm">
            Last scanned {new Date(biz.lastCrawledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Website Performance */}
      {ps ? (
        <Card className="neu">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Gauge className="w-5 h-5 text-primary" /> Website Performance</CardTitle>
            <CardDescription>Google Lighthouse scores from PageSpeed Insights</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="mobile">
              <TabsList className="mb-6">
                <TabsTrigger value="mobile" className="gap-1.5"><Smartphone className="w-4 h-4" />Mobile</TabsTrigger>
                <TabsTrigger value="desktop" className="gap-1.5"><Monitor className="w-4 h-4" />Desktop</TabsTrigger>
              </TabsList>
              {(['mobile', 'desktop'] as const).map(device => (
                <TabsContent key={device} value={device} className="space-y-6">
                  <div className="flex justify-center">
                    <ScoreRing score={ps[device].performanceScore} label="Performance Score" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <CoreWebVitalCard label="LCP" value={toS(ps[device].lcp)} unit="s" good={2.5} needs={4.0} info="Largest Contentful Paint — how quickly the main content appears." />
                    <CoreWebVitalCard label="CLS" value={ps[device].cls !== null ? Math.round(ps[device].cls! * 1000) / 1000 : null} unit="" good={0.1} needs={0.25} info="Cumulative Layout Shift — how much the layout shifts while loading." />
                    <CoreWebVitalCard label="INP" value={ps[device].inp !== null ? Math.round(ps[device].inp!) : null} unit="ms" good={200} needs={500} info="Interaction to Next Paint — how fast the page reacts to clicks." />
                    <CoreWebVitalCard label="FCP" value={toS(ps[device].fcp)} unit="s" good={1.8} needs={3.0} info="First Contentful Paint — how fast the first text or image appears." />
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      ) : (
        <Card className="neu">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Gauge className="w-5 h-5 text-primary" /> Website Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">No PageSpeed data yet. Run a scan to fetch performance metrics.</p>
          </CardContent>
        </Card>
      )}

      {/* SEO & Technical */}
      {s && (
        <Card className="neu">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Search className="w-5 h-5 text-primary" /> SEO & Technical</CardTitle>
            <CardDescription>What we found when crawling your website</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <MetricRow icon={FileText} label="Page Title" value={<span className="text-xs max-w-md truncate block text-right">{s.seo.title || '—'}</span>} info="The title tag shown in search results and browser tabs." />
            <MetricRow icon={FileText} label="Meta Description" value={<StatusIcon ok={!!s.seo.metaDescription} />} info="A short summary shown below your title in Google results." />
            <MetricRow icon={Hash} label="H1 Heading" value={<span className="text-xs max-w-sm truncate block text-right">{s.seo.h1Tags[0] || '—'}</span>} info="The main heading on your page." />
            <MetricRow icon={Globe} label="Sitemap" value={<StatusIcon ok={s.seo.hasSitemap} />} info="A sitemap.xml helps Google discover all pages on your site." />
            <MetricRow icon={Globe} label="Robots.txt" value={<StatusIcon ok={s.seo.hasRobotsTxt} />} info="Tells search engines which pages they can and can't index." />
            <MetricRow icon={Link2} label="Internal Links" value={s.seo.internalLinkCount} info="Links between your own pages help Google understand your site structure." />
            {s.seo.schemaMarkupTypes.length > 0 && (
              <MetricRow icon={BarChart3} label="Schema Markup" value={
                <div className="flex gap-1 flex-wrap justify-end">{s.seo.schemaMarkupTypes.map(t => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}</div>
              } info="Structured data that helps Google show rich results." />
            )}
            <MetricRow icon={Link2} label="Canonical Tags" value={<StatusIcon ok={s.seo.canonicalTagsPresent} />} info="Prevents duplicate content issues." />
            <MetricRow icon={Image} label="Image Alt Tags" value={
              <Badge variant={s.seo.altTagCoverage === 'full' ? 'default' : 'secondary'} className="text-xs">{s.seo.altTagCoverage}</Badge>
            } info="Alt text helps Google understand your images and improves accessibility." />
          </CardContent>
        </Card>
      )}

      {/* Trust + Content */}
      {s && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="neu h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Shield className="w-5 h-5 text-primary" /> Trust Signals</CardTitle>
              <CardDescription>Credentials and proof of quality found on your site</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {s.trust.accreditations.length > 0 && (
                <MetricRow icon={Award} label="Accreditations" value={
                  <div className="flex gap-1 flex-wrap justify-end">{s.trust.accreditations.map(a => <Badge key={a} variant="secondary" className="text-[10px]">{a}</Badge>)}</div>
                } info="Official accreditations build customer confidence." />
              )}
              {s.trust.certifications.length > 0 && (
                <MetricRow icon={Award} label="Certifications" value={s.trust.certifications.join(', ')} />
              )}
              {s.trust.awardsAndMemberships.length > 0 && (
                <MetricRow icon={Award} label="Awards & Memberships" value={s.trust.awardsAndMemberships.join(', ')} />
              )}
              {s.trust.reviewPlatformsLinked.length > 0 && (
                <MetricRow icon={Star} label="Review Platforms Linked" value={
                  <div className="flex gap-1 flex-wrap justify-end">{s.trust.reviewPlatformsLinked.map(r => <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>)}</div>
                } />
              )}
              <MetricRow icon={Users} label="Team Page" value={<StatusIcon ok={s.trust.teamPageExists} />} info="A team page makes your business feel personal and trustworthy." />
              <MetricRow icon={Shield} label="Insurance Mentioned" value={<StatusIcon ok={s.trust.insuranceMentioned} />} />
              <MetricRow icon={Shield} label="Guarantees Mentioned" value={<StatusIcon ok={s.trust.guaranteesMentioned.length > 0} />} />
            </CardContent>
          </Card>

          <Card className="neu h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><FileText className="w-5 h-5 text-primary" /> Content Signals</CardTitle>
              <CardDescription>Service pages, blog, portfolio, and FAQs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {s.content.servicesListed.length > 0 && (
                <MetricRow icon={FileText} label="Services Listed" value={
                  <div className="flex gap-1 flex-wrap justify-end">
                    {s.content.servicesListed.slice(0, 3).map(sv => <Badge key={sv} variant="secondary" className="text-[10px]">{sv}</Badge>)}
                    {s.content.servicesListed.length > 3 && <Badge variant="secondary" className="text-[10px]">+{s.content.servicesListed.length - 3}</Badge>}
                  </div>
                } />
              )}
              {s.content.serviceAreasMentioned.length > 0 && (
                <MetricRow icon={MapPin} label="Service Areas" value={
                  <div className="flex gap-1 flex-wrap justify-end">
                    {s.content.serviceAreasMentioned.slice(0, 3).map(a => <Badge key={a} variant="secondary" className="text-[10px]">{a}</Badge>)}
                    {s.content.serviceAreasMentioned.length > 3 && <Badge variant="secondary" className="text-[10px]">+{s.content.serviceAreasMentioned.length - 3}</Badge>}
                  </div>
                } info="Mentioning service areas helps you rank in local searches." />
              )}
              <MetricRow icon={FileText} label="Blog" value={<StatusIcon ok={s.content.hasBlog} />} info="A blog with helpful content boosts SEO and builds trust." />
              <MetricRow icon={Image} label="Portfolio" value={<StatusIcon ok={s.content.hasPortfolio} />} />
              {s.content.hasPortfolio && <MetricRow icon={Hash} label="Portfolio Items" value={s.content.portfolioItemCount} />}
              <MetricRow icon={MessageSquare} label="FAQ Section" value={<StatusIcon ok={s.content.hasFAQ} />} info="FAQs can appear as rich results in Google." />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Engagement + Google Business */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {s && (
          <Card className="neu h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><MousePointerClick className="w-5 h-5 text-primary" /> Engagement Signals</CardTitle>
              <CardDescription>How easy it is for customers to take action</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <MetricRow icon={Mail} label="Contact Form" value={<StatusIcon ok={s.engagement.hasContactForm} />} />
              <MetricRow icon={Calendar} label="Booking System" value={<StatusIcon ok={s.engagement.hasBookingSystem} />} />
              {s.engagement.bookingProvider && (
                <MetricRow icon={Calendar} label="Booking Provider" value={s.engagement.bookingProvider} />
              )}
              <MetricRow icon={MousePointerClick} label="Call to Action" value={<StatusIcon ok={s.engagement.hasCallToAction} />} info="Clear CTAs tell visitors what to do next." />
              {s.engagement.ctaText.length > 0 && (
                <MetricRow icon={MousePointerClick} label="CTA Text Found" value={
                  <div className="flex gap-1 flex-wrap justify-end">{s.engagement.ctaText.map(c => <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>)}</div>
                } />
              )}
              <MetricRow icon={Mail} label="Newsletter Signup" value={<StatusIcon ok={s.engagement.hasNewsletterSignup} />} />
              {s.engagement.socialLinksPresent.length > 0 && (
                <MetricRow icon={ExternalLink} label="Social Links" value={
                  <div className="flex gap-1 flex-wrap justify-end">{s.engagement.socialLinksPresent.map(sl => <Badge key={sl} variant="secondary" className="text-[10px]">{sl}</Badge>)}</div>
                } />
              )}
              <MetricRow icon={Phone} label="Phone Number Prominent" value={<StatusIcon ok={s.engagement.hasPhoneNumberProminent} />} info="A visible phone number makes it easy for customers to call." />
            </CardContent>
          </Card>
        )}

        {g && (
          <Card className="neu h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Star className="w-5 h-5 text-primary" /> Google Business Profile</CardTitle>
              <CardDescription>Data from Google Maps and Places API</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <MetricRow icon={Star} label="Google Rating" value={
                <span className="flex items-center gap-1 font-bold">
                  {g.googleRating} <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-muted-foreground font-normal text-xs">({g.reviewCount} reviews)</span>
                </span>
              } />
              <MetricRow icon={FileText} label="Business Category" value={g.businessCategory} />
              <MetricRow icon={MapPin} label="Address" value={<span className="text-xs text-right">{g.address}</span>} />
              <MetricRow icon={Phone} label="Phone" value={g.phoneNumber} />
              {g.openingHours.length > 0 && (
                <MetricRow icon={Clock} label="Opening Hours" value={<span className="text-xs">{g.openingHours[0]}</span>} />
              )}
              <MetricRow icon={Image} label="Photos" value={g.photos} info="Businesses with more photos get more clicks on Google Maps." />
              {g.description && (
                <MetricRow icon={FileText} label="Description" value={<span className="text-xs max-w-sm truncate block text-right">{g.description}</span>} />
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* SERP + AI Visibility */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {serp && (
          <Card className="neu h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Search className="w-5 h-5 text-primary" /> Local Search Results</CardTitle>
              {serp.searchTerm && <CardDescription>How you appear in Google for "{serp.searchTerm}"</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-1">
              {serp.localVisabilityPosition !== null && (
                <MetricRow icon={MapPin} label="Local Pack Position" value={
                  <span className="font-bold text-primary">#{serp.localVisabilityPosition}</span>
                } info="Your position in Google's local 3-pack. Top 3 get the most clicks." />
              )}
              <MetricRow icon={BarChart3} label="Local Pack Present" value={<StatusIcon ok={serp.localPackPresent} />} />
              <MetricRow icon={Zap} label="Featured Snippet" value={<StatusIcon ok={serp.featuredSnippet} />} info="Featured snippets appear at the very top of search results." />
              <MetricRow icon={Globe} label="Knowledge Panel" value={<StatusIcon ok={serp.knowledgePanelPresent} />} />
              <MetricRow icon={Link2} label="Sitelinks" value={<StatusIcon ok={serp.sitelinks} />} info="Extra links shown below your result — a sign Google trusts your site." />
              <MetricRow icon={AlertTriangle} label="Ads Above Results" value={
                <Badge variant={serp.adsAboveResults > 2 ? 'destructive' : 'secondary'} className="text-xs">{serp.adsAboveResults} ads</Badge>
              } info="More ads above results means organic clicks are pushed down." />
            </CardContent>
          </Card>
        )}

        {ai && (
          <Card className="neu h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Brain className="w-5 h-5 text-primary" /> AI Visibility</CardTitle>
              <CardDescription>How often AI assistants mention your business</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex justify-center pt-4">
                <ScoreRing score={ai.aiPresenceScore} label="AI Presence Score" />
              </div>
              <div className="neu-flat p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Mentions found</span>
                  <span className="font-bold">{ai.mentionCount} / {ai.totalPrompts} prompts</span>
                </div>
                <Progress value={(ai.mentionCount / ai.totalPrompts) * 100} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  We tested {ai.totalPrompts} prompts related to your industry and location. Your business was mentioned in {ai.mentionCount} of them.
                </p>
              </div>
              <div className="neu-flat p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">Why this matters</p>
                    <p>More customers are using ChatGPT, Gemini, and Copilot to find local services. If AI doesn't know about you, you're invisible to a growing audience.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {!s && !g && !serp && !ai && !ps && (
        <Card className="neu">
          <CardContent className="py-12 text-center text-muted-foreground">
            No scan data yet. Run a scan from the Dashboard to populate this page.
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MyBusiness;
