'use client';

import { motion } from 'framer-motion';
import {
  Search,
  Globe,
  Star,
  Brain,
  Gauge,
  Shield,
  FileText,
  MousePointerClick,
  MapPin,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Hash,
  List,
  Link2,
  Image,
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  Newspaper,
  Award,
  Users,
  Bookmark,
  Zap,
  BarChart3,
  Clock,
  Eye,
  Layers,
  Monitor,
  Smartphone,
  TrendingUp,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';

type Signal = {
  name: string;
  field: string;
  description: string;
  icon: React.ElementType;
};

type Category = {
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  signals: Signal[];
};

const categories: Category[] = [
  {
    title: 'SEO Signals',
    description: 'Technical foundations we extract from crawling your website.',
    icon: Search,
    color: 'text-primary',
    signals: [
      {
        name: 'Page Title',
        field: 'title',
        description:
          "Your page's title tag — the clickable headline shown in search results. A well-crafted title with your location and service boosts click-through rate.",
        icon: FileText,
      },
      {
        name: 'Meta Description',
        field: 'metaDescription',
        description:
          'The short summary shown under your title in Google. Think of it as your 160-character elevator pitch to potential customers.',
        icon: FileText,
      },
      {
        name: 'H1 Headings',
        field: 'h1Tags',
        description:
          'The main headings on your page. Google uses these to understand what each page is about. Ideally, one clear H1 per page.',
        icon: Hash,
      },
      {
        name: 'Sitemap',
        field: 'hasSitemap',
        description:
          'Whether your site has a sitemap.xml — a roadmap that tells Google which pages exist. Without one, some pages may never get indexed.',
        icon: Layers,
      },
      {
        name: 'Robots.txt',
        field: 'hasRobotsTxt',
        description:
          "A file that tells search engines which pages they can and can't crawl. Missing or misconfigured robots.txt can hide your site from Google.",
        icon: FileText,
      },
      {
        name: 'Internal Links',
        field: 'internalLinkCount',
        description:
          'How many links connect your pages together. Good internal linking helps Google discover content and helps visitors navigate.',
        icon: Link2,
      },
      {
        name: 'Schema Markup',
        field: 'schemaMarkupTypes',
        description:
          'Structured data (like LocalBusiness or FAQ schema) that helps Google understand your business details and show rich results.',
        icon: Layers,
      },
      {
        name: 'Canonical Tags',
        field: 'canonicalTagsPresent',
        description:
          "Tags that tell Google which version of a page is the 'official' one — prevents duplicate content issues.",
        icon: Bookmark,
      },
      {
        name: 'Image Alt Text',
        field: 'altTagCoverage',
        description:
          "Whether your images have descriptive text for accessibility and SEO. Google can't 'see' images — alt text tells it what's there.",
        icon: Image,
      },
    ],
  },
  {
    title: 'Trust Signals',
    description: 'Credentials and social proof that build customer confidence.',
    icon: Shield,
    color: 'text-score-excellent',
    signals: [
      {
        name: 'Accreditations',
        field: 'accreditations',
        description:
          'Professional accreditations displayed on your site (e.g. Gas Safe, NICEIC, FCA). These are strong trust builders.',
        icon: Award,
      },
      {
        name: 'Certifications',
        field: 'certifications',
        description:
          "Industry certifications and qualifications. Customers want to know you're qualified before they hire you.",
        icon: Award,
      },
      {
        name: 'Awards & Memberships',
        field: 'awardsAndMemberships',
        description:
          'Industry awards or trade body memberships (e.g. Checkatrade, Federation of Master Builders).',
        icon: Award,
      },
      {
        name: 'Review Platform Links',
        field: 'reviewPlatformsLinked',
        description:
          "Links to your profiles on Trustpilot, Google, Yell, etc. Showing you're active on review sites builds confidence.",
        icon: Star,
      },
      {
        name: 'Team Page',
        field: 'teamPageExists',
        description:
          'Whether you have a team or about page. Putting faces to your business makes you more relatable and trustworthy.',
        icon: Users,
      },
      {
        name: 'Insurance Mentioned',
        field: 'insuranceMentioned',
        description:
          'Whether you mention being insured. For trades and services, this is often the first thing customers look for.',
        icon: Shield,
      },
      {
        name: 'Guarantees',
        field: 'guaranteesMentioned',
        description:
          'Any guarantees or warranties you offer. These reduce perceived risk and increase conversion.',
        icon: CheckCircle2,
      },
    ],
  },
  {
    title: 'Content Signals',
    description: 'The substance of your site — services, areas, and helpful content.',
    icon: FileText,
    color: 'text-primary',
    signals: [
      {
        name: 'Services Listed',
        field: 'servicesListed',
        description:
          'Individual services mentioned on your site. Google matches these to search queries — the more specific, the better.',
        icon: List,
      },
      {
        name: 'Service Areas',
        field: 'serviceAreasMentioned',
        description:
          "Geographic areas you mention serving. Critical for appearing in 'near me' and location-based searches.",
        icon: MapPin,
      },
      {
        name: 'Blog',
        field: 'hasBlog',
        description:
          'Whether you have a blog. Regular, helpful content signals expertise to Google and keeps your site fresh.',
        icon: Newspaper,
      },
      {
        name: 'Portfolio / Gallery',
        field: 'hasPortfolio',
        description:
          'A portfolio or gallery showing your work. For visual trades (builders, landscapers, designers), this is essential.',
        icon: Image,
      },
      {
        name: 'Portfolio Items',
        field: 'portfolioItemCount',
        description:
          'How many portfolio items you have. More examples of your work = more confidence for potential customers.',
        icon: Image,
      },
      {
        name: 'FAQ Section',
        field: 'hasFAQ',
        description:
          'A frequently asked questions section. Great for SEO (Google loves Q&A content) and for AI visibility.',
        icon: MessageSquare,
      },
    ],
  },
  {
    title: 'Engagement Signals',
    description: 'How easy it is for customers to take action on your site.',
    icon: MousePointerClick,
    color: 'text-accent',
    signals: [
      {
        name: 'Contact Form',
        field: 'hasContactForm',
        description:
          'Whether you have a contact form. Many customers prefer filling out a form over calling — especially outside business hours.',
        icon: Mail,
      },
      {
        name: 'Booking System',
        field: 'hasBookingSystem',
        description:
          'Whether you have online booking. Letting customers book instantly can dramatically increase conversions.',
        icon: Calendar,
      },
      {
        name: 'Booking Provider',
        field: 'bookingProvider',
        description:
          'Which booking system you use (Calendly, SimplyBook, etc.). We track this to benchmark against competitors.',
        icon: Calendar,
      },
      {
        name: 'Call to Action',
        field: 'hasCallToAction',
        description:
          'Whether your site has clear CTAs. Every page should tell visitors what to do next — call, book, get a quote.',
        icon: MousePointerClick,
      },
      {
        name: 'CTA Text',
        field: 'ctaText',
        description:
          "The actual text on your CTA buttons. 'Get a Free Quote' converts better than 'Submit'. We track what works.",
        icon: MousePointerClick,
      },
      {
        name: 'Newsletter Signup',
        field: 'hasNewsletterSignup',
        description:
          'Whether you capture email addresses. Building a mailing list lets you market to interested prospects for free.',
        icon: Mail,
      },
      {
        name: 'Social Links',
        field: 'socialLinksPresent',
        description:
          'Links to your social media profiles. Active social presence builds trust and expands your reach.',
        icon: Globe,
      },
      {
        name: 'Phone Number',
        field: 'hasPhoneNumberProminent',
        description:
          'Whether your phone number is prominently displayed. For local businesses, a visible phone number is crucial.',
        icon: Phone,
      },
    ],
  },
  {
    title: 'Google Business Profile',
    description: 'Your presence on Google Maps and local search — powered by the Places API.',
    icon: MapPin,
    color: 'text-primary',
    signals: [
      {
        name: 'Google Rating',
        field: 'googleRating',
        description:
          'Your average star rating on Google. This is the single most visible trust signal in local search results.',
        icon: Star,
      },
      {
        name: 'Review Count',
        field: 'reviewCount',
        description:
          'Total number of Google reviews. More reviews = more trust. Businesses with 40+ reviews see significantly higher click rates.',
        icon: MessageSquare,
      },
      {
        name: 'Business Category',
        field: 'businessCategory',
        description:
          'Your primary Google category. Getting this right determines which searches you appear in.',
        icon: Layers,
      },
      {
        name: 'Opening Hours',
        field: 'openingHours',
        description:
          'Your listed opening hours. Incomplete or incorrect hours frustrate customers and hurt your ranking.',
        icon: Clock,
      },
      {
        name: 'Recent Reviews',
        field: 'recentReviews',
        description:
          'Your latest reviews including rating, text, and whether you replied. Google favours businesses with fresh, responded-to reviews.',
        icon: MessageSquare,
      },
      {
        name: 'Photos',
        field: 'photos',
        description:
          'Photo count on your Google profile. Businesses with 100+ photos get 520% more calls than those with fewer than 10.',
        icon: Image,
      },
      {
        name: 'Description',
        field: 'description',
        description:
          'Your Google Business description. 750 characters to tell customers and Google what makes you different.',
        icon: FileText,
      },
    ],
  },
  {
    title: 'Local Search Results (SERP)',
    description: 'Where you appear when customers search for your services.',
    icon: Search,
    color: 'text-score-good',
    signals: [
      {
        name: 'Local Pack Position',
        field: 'localVisabilityPosition',
        description:
          "Your position in Google's local 3-pack — the map results shown at the top. Position 1–3 gets the vast majority of clicks.",
        icon: BarChart3,
      },
      {
        name: 'Local Pack Present',
        field: 'localPackPresent',
        description:
          'Whether a local pack appears for your target keywords. If it does, you need to be in it.',
        icon: MapPin,
      },
      {
        name: 'Featured Snippet',
        field: 'featuredSnippet',
        description:
          "Whether your content appears in Google's featured snippet — the answer box at the top of results.",
        icon: Eye,
      },
      {
        name: 'Knowledge Panel',
        field: 'knowledgePanelPresent',
        description:
          'Whether Google shows a knowledge panel for your business. This typically comes from a well-optimised Google Business Profile.',
        icon: Layers,
      },
      {
        name: 'Sitelinks',
        field: 'sitelinks',
        description:
          'Whether Google shows sitelinks under your result — links to specific pages. This indicates Google trusts your site structure.',
        icon: Link2,
      },
      {
        name: 'Ads Above Results',
        field: 'adsAboveResults',
        description:
          'How many paid ads appear above organic results for your keywords. More ads = organic results pushed further down.',
        icon: BarChart3,
      },
    ],
  },
  {
    title: 'AI Visibility',
    description: 'Whether AI assistants like ChatGPT and Google AI recommend your business.',
    icon: Brain,
    color: 'text-primary',
    signals: [
      {
        name: 'AI Presence Score',
        field: 'aiPresenceScore',
        description:
          'A 0–100 score measuring how often AI assistants mention your business when asked about your services in your area.',
        icon: Zap,
      },
      {
        name: 'Mention Count',
        field: 'mentionCount',
        description:
          'How many of our test prompts returned a mention of your business. More mentions = stronger AI visibility.',
        icon: MessageSquare,
      },
      {
        name: 'Total Prompts Tested',
        field: 'totalPrompts',
        description:
          'The total number of AI prompts we test for your industry and location. We use realistic questions real customers ask.',
        icon: List,
      },
    ],
  },
  {
    title: 'Website Speed (PageSpeed)',
    description: 'How fast your site loads on mobile and desktop — via Google PageSpeed Insights.',
    icon: Gauge,
    color: 'text-accent',
    signals: [
      {
        name: 'Performance Score',
        field: 'performanceScore',
        description:
          "Google's overall performance score (0–100). Scores below 50 on mobile hurt your search ranking and frustrate visitors.",
        icon: Zap,
      },
      {
        name: 'Largest Contentful Paint',
        field: 'lcp',
        description:
          "How long until the main content is visible. Under 2.5s is good; over 4s means you're losing visitors.",
        icon: Clock,
      },
      {
        name: 'Cumulative Layout Shift',
        field: 'cls',
        description:
          'How much your page layout shifts while loading. High CLS means buttons jump around — frustrating for users.',
        icon: Monitor,
      },
      {
        name: 'Interaction to Next Paint',
        field: 'inp',
        description:
          'How quickly your site responds to user interactions (clicks, taps). Under 200ms feels instant; over 500ms feels broken.',
        icon: MousePointerClick,
      },
      {
        name: 'First Contentful Paint',
        field: 'fcp',
        description:
          "How long until the first visible content appears. This is the user's first impression of your site's speed.",
        icon: Smartphone,
      },
    ],
  },
  {
    title: 'Your Performance (Google Business Profile)',
    description:
      'Pulled live from your connected Google profile — your business only, never competitors. Tracked month-on-month so you can see your growth.',
    icon: BarChart3,
    color: 'text-primary',
    signals: [
      {
        name: 'Search impressions',
        field: 'searchImpressions',
        description:
          'How many times you appeared in Google Search results this month — and how that compares to last month. The headline number for proving your visibility is growing.',
        icon: Search,
      },
      {
        name: 'Maps impressions',
        field: 'mapsImpressions',
        description:
          'How many times you appeared in Google Maps this month vs last. The single best measure of local visibility for any local business.',
        icon: MapPin,
      },
      {
        name: 'Website clicks',
        field: 'websiteClicks',
        description:
          'Clicks from your Google Business Profile through to your website, month-on-month. Real intent — real customers about to convert.',
        icon: MousePointerClick,
      },
      {
        name: 'Month-on-month change',
        field: 'momChange',
        description:
          "Every metric is shown next to last month's number so you can see exactly how much you've grown.",
        icon: TrendingUp,
      },
    ],
  },
];

const WhatWeTrack = () => {
  const totalSignals = categories.reduce((sum, cat) => sum + cat.signals.length, 0);

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Eye className="w-5 h-5 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold">What We Track</h1>
        </div>
        <p className="text-muted-foreground text-sm ml-12 mb-6">
          Every week, Scoutly checks{' '}
          <span className="font-semibold text-foreground">{totalSignals} signals</span> across{' '}
          {categories.length} categories for your business and each competitor. Here's exactly what
          we look at and why it matters.
        </p>

        {/* Category quick-nav pills */}
        <div className="flex flex-wrap gap-2 ml-12">
          {categories.map((cat) => (
            <a
              key={cat.title}
              href={`#${cat.title.toLowerCase().replace(/\s+/g, '-')}`}
              className="neu rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <cat.icon className="w-3.5 h-3.5" />
              {cat.title}
            </a>
          ))}
        </div>
      </motion.div>

      <div className="space-y-8">
        {categories.map((cat, i) => (
          <motion.div
            key={cat.title}
            id={cat.title.toLowerCase().replace(/\s+/g, '-')}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * i }}
            className="neu rounded-2xl overflow-hidden"
          >
            {/* Category header */}
            <div className="p-6 pb-4 border-b border-border/50">
              <div className="flex items-center gap-3 mb-1.5">
                <cat.icon className={`w-5 h-5 ${cat.color}`} />
                <h2 className="font-display text-lg font-semibold">{cat.title}</h2>
                <Badge variant="outline" className="ml-auto text-xs">
                  {cat.signals.length} signals
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground ml-8">{cat.description}</p>
            </div>

            {/* Signals accordion */}
            <Accordion type="multiple" className="px-6">
              {cat.signals.map((signal) => (
                <AccordionItem key={signal.field} value={signal.field} className="border-border/40">
                  <AccordionTrigger className="hover:no-underline py-3.5 text-sm">
                    <div className="flex items-center gap-2.5 text-left">
                      <signal.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="font-medium">{signal.name}</span>
                      <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
                        {signal.field}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed pl-6.5 pb-4">
                    {signal.description}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default WhatWeTrack;
