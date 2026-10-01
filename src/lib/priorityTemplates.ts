import type { AIHealthScore, Business, PriorityAction } from '@/types';
import { asPriorityActionId } from '@/types';
import type { ServiceCategory } from '@/lib/serviceCategories';
import {
  fillTemplate,
  joinNames,
  resolveTemplateContext,
  type TemplateContext,
} from '@/lib/templateContext';

type ScoreKey = keyof Pick<
  AIHealthScore,
  | 'reputationScore'
  | 'localVisibilityScore'
  | 'websiteHealthScore'
  | 'gbpCompletenessScore'
  | 'aiPresenceScore'
  | 'reviewVelocityScore'
>;

export type PriorityTemplate = {
  id: string;
  /** How much closing this gap moves enquiries or local ranking, 1 (minor) to 5 (major). */
  impactWeight: 1 | 2 | 3 | 4 | 5;
  /** The health score this gap feeds; a weaker score ranks the template higher. */
  scoreKey: ScoreKey;
  trigger: (b: Business, ctx: TemplateContext) => boolean;
  category: PriorityAction['category'];
  effort: PriorityAction['effort'];
  estimatedImpact: 'high' | 'medium';
  timeframe: string;
  action: string;
  reason: string;
  whyItMattersTemplate: string;
  steps: string[];
  outcome: string;
  /**
   * True (default) if the trigger reads from `b.signals.*` — i.e. depends on
   * a successful on-site extraction. Set to false for templates that only
   * read from googleData / serpData / aiVisibility / pagespeedData, so they
   * still fire when `enrichmentErrors.extract` is set.
   */
  requiresSiteSignals?: boolean;
  /**
   * True if the trigger reads from `b.googleData`. Such templates are skipped
   * when Google data is missing or the Google fetch errored, so a failed fetch
   * is not reported to the owner as a gap in their profile.
   */
  requiresGoogleData?: boolean;
  /**
   * Deterministic competitor comparison for `competitorReference`. Returns null
   * unless a named competitor is strictly better on this exact gap. Never phrase
   * our side as "0", "no" or "none": the validator flags those as contradictions.
   */
  compare?: (own: Business, competitors: Business[], ctx: TemplateContext) => string | null;
  /** Optional factual opening sentence for whyItMatters, built from the own business data. */
  detail?: (own: Business) => string | null;
};

/** Days of review count history needed before saying reviews have gone quiet. */
export const QUIET_REVIEW_MIN_DAYS = 60;

// ── Competitor comparison helpers ──────────────────────────────────────

const siteOk = (c: Business) =>
  !!c.signals && !c.enrichmentErrors?.crawl && !c.enrichmentErrors?.extract;
const googleOk = (c: Business) => !!c.googleData && !c.enrichmentErrors?.google;

/** "Alpha shows…", "Alpha and Beta both show…", "Alpha, Beta and Gamma all show…". */
function competitorsWith(
  competitors: Business[],
  usable: (c: Business) => boolean,
  has: (c: Business) => boolean,
  [singular, plural]: [string, string],
): string | null {
  const names = competitors.filter((c) => usable(c) && has(c)).map((c) => c.name);
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} ${singular}.`;
  return `${joinNames(names)} ${names.length === 2 ? 'both' : 'all'} ${plural}.`;
}

const siteFeature =
  (has: (c: Business) => boolean, phrase: [string, string]) =>
  (_own: Business, competitors: Business[]) =>
    competitorsWith(competitors, siteOk, has, phrase);

/** The competitor with the highest value, only when strictly above our own. */
function strongest(
  own: Business,
  competitors: Business[],
  get: (b: Business) => number | null | undefined,
): { name: string; value: number; ownValue: number } | null {
  const ownValue = get(own);
  if (ownValue == null) return null;
  let best: { name: string; value: number } | null = null;
  for (const c of competitors) {
    const v = get(c);
    if (v != null && v > ownValue && (!best || v > best.value)) best = { name: c.name, value: v };
  }
  return best ? { ...best, ownValue } : null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Categories where customers expect proof of regulation or trade body membership. */
const REGULATED_CATEGORIES = new Set<ServiceCategory>([
  'trades',
  'construction',
  'dental',
  'healthcare',
  'legal',
  'accounting',
  'childcare',
  'veterinary',
]);
/** Categories that work in or on customer property, where guarantees and insurance matter. */
const HANDS_ON_CATEGORIES = new Set<ServiceCategory>([
  'trades',
  'construction',
  'cleaning',
  'automotive',
  'petcare',
]);
/** Categories where customers choose on the look of past work. */
const VISUAL_CATEGORIES = new Set<ServiceCategory>([
  'construction',
  'trades',
  'beauty',
  'tattoo',
  'photography',
  'events',
  'marketing',
]);
/** True when the text names the town, with or without a direction prefix ("East Dulwich" matches "Dulwich"). */
function mentionsTown(text: string, town: string): boolean {
  const t = text.toLowerCase();
  const full = town.toLowerCase();
  const core = full.replace(/^(east|west|north|south|upper|lower|central|greater|old|new)\s+/, '');
  return t.includes(full) || (core.length >= 4 && t.includes(core));
}

/** Button labels that do not say what happens next. */
const VAGUE_CTA =
  /^(submit|send|go|enter|continue|learn more|read more|find out more|click here|more info|more information)$/i;

export const PRIORITY_TEMPLATES: PriorityTemplate[] = [
  {
    id: 'no_phone_on_homepage',
    impactWeight: 4,
    scoreKey: 'websiteHealthScore',
    compare: siteFeature(
      (c) => c.signals!.engagement.hasPhoneNumberProminent,
      ['shows their phone number on their homepage', 'show their phone number on their homepage'],
    ),
    trigger: (b) => b.signals?.engagement?.hasPhoneNumberProminent === false,
    category: 'Conversion',
    effort: 'low',
    estimatedImpact: 'high',
    timeframe: '1 to 2 days',
    action: 'Add your phone number to the homepage',
    reason: 'No phone number visible on your homepage',
    whyItMattersTemplate:
      'When someone lands on your site ready to call, they should not have to hunt for your number. A visible phone number in the header or hero section is one of the easiest ways to turn a visitor into a lead.',
    steps: [
      'Add your main phone number to the top of your homepage, ideally in the header so it shows on every page.',
      'Make it a clickable link so mobile visitors can tap to call.',
      'If you use a booking system instead of phone calls, make sure that link is just as prominent.',
    ],
    outcome: 'More calls from website visitors',
  },
  {
    id: 'no_recent_reviews',
    impactWeight: 4,
    scoreKey: 'reviewVelocityScore',
    // Places returns 5 "most relevant" reviews, not the newest, so their dates
    // cannot prove a business has gone quiet. Only google_data count history can.
    compare: (_own, competitors) => {
      let best: { name: string; gained: number; days: number } | null = null;
      for (const c of competitors) {
        const g = c.reviewGrowth;
        if (g && g.gained > 0 && (!best || g.gained > best.gained))
          best = { name: c.name, gained: g.gained, days: g.days };
      }
      if (!best) return null;
      return `${best.name} gained ${plural(best.gained, 'Google review')} in the last ${plural(best.days, 'day')}.`;
    },
    detail: (b) => {
      const g = b.reviewGrowth;
      if (!g) return null;
      const date = new Date(g.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
      return `Your Google review count has stayed at ${g.baselineCount} since ${date}.`;
    },
    trigger: (b) => {
      if ((b.googleData?.reviewCount ?? 0) <= 5) return false;
      // A sampled review inside 90 days proves activity. r.time is in milliseconds.
      const ninetyDaysAgo = Date.now() - 90 * 86_400_000;
      if (b.googleData?.recentReviews?.some((r) => r.time > ninetyDaysAgo)) return false;
      const g = b.reviewGrowth;
      return g != null && g.days >= QUIET_REVIEW_MIN_DAYS && g.gained === 0;
    },
    category: 'Reviews',
    effort: 'medium',
    estimatedImpact: 'high',
    timeframe: '2 to 4 weeks',
    action: 'Get fresh reviews: yours have gone quiet',
    reason: 'Your Google review count has not grown in over two months',
    whyItMattersTemplate:
      'You have reviews, but none are recent. Google and potential customers both notice when the last review is months old. A steady trickle of new reviews signals that you are active and people are still choosing you.',
    steps: [
      'Pick 3 happy customers from the last month and send them a short text or email with your Google review link.',
      'Add a "Leave us a review" link to your email signature and invoices.',
      'After each completed job, ask in person. A simple "Would you mind leaving us a quick Google review?" works well.',
      'Set a reminder to ask one customer per week so reviews keep coming in steadily.',
    ],
    outcome: 'Steady stream of recent reviews',
    requiresSiteSignals: false,
    requiresGoogleData: true,
  },
  {
    id: 'missing_h1',
    impactWeight: 3,
    scoreKey: 'websiteHealthScore',
    compare: siteFeature(
      (c) => (c.signals!.seo.homepageH1Count ?? c.signals!.seo.h1Tags?.length ?? 0) > 0,
      ['has a clear main heading on their homepage', 'have a clear main heading on their homepage'],
    ),
    trigger: (b) => {
      // Homepage-only signal: `h1Tags` is a site-wide union, so a site with an h1 on
      // /services but none on / must still fire. null = root page unusable → do not fire.
      const seo = b.signals?.seo;
      if (!seo) return false;
      if (seo.homepageH1Count !== undefined) return seo.homepageH1Count === 0;
      // Legacy rows (pre-homepageH1Count): fall back to the site-wide union.
      return seo.h1Tags != null && seo.h1Tags.length === 0;
    },
    category: 'Website',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '1 day',
    action: 'Add a main heading to your homepage',
    reason: 'Your homepage has no main heading',
    whyItMattersTemplate:
      'Search engines look for a main heading to understand what your page is about. Without one, your site is harder to rank for the searches that matter to you.',
    steps: [
      'Open your homepage editor and add a clear heading that says what you do and where, for example [["{Service} in {town}"||"Reliable Plumbing in Manchester"]].',
      'Make sure it is marked as an H1 (the "Heading 1" option in your editor).',
      'Keep it under 60 characters and include your main service and location.',
    ],
    outcome: 'Clearer page for search engines and visitors',
  },
  {
    id: 'no_business_hours',
    impactWeight: 3,
    scoreKey: 'gbpCompletenessScore',
    compare: (_own, competitors) =>
      competitorsWith(competitors, googleOk, (c) => (c.googleData!.openingHours?.length ?? 0) > 0, [
        'shows their opening hours on Google',
        'show their opening hours on Google',
      ]),
    trigger: (b) => {
      const hours = b.googleData?.openingHours;
      return !hours || hours.length === 0;
    },
    category: 'Trust',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '10 minutes',
    action: 'Set your opening hours on Google',
    reason: 'Your Google Business Profile has no opening hours',
    whyItMattersTemplate:
      'When someone searches for you, Google shows your opening hours right in the results. If they are missing, people may assume you are closed or unreliable. Setting them takes a few minutes and immediately makes your listing look more complete.',
    steps: [
      'Go to business.google.com and sign in.',
      'Click "Edit profile" and then "Hours".',
      'Enter your regular opening hours for each day of the week.',
      'If your hours vary seasonally, set a reminder to update them each season.',
    ],
    outcome: 'Complete Google listing that builds trust',
    requiresSiteSignals: false,
    requiresGoogleData: true,
  },
  {
    id: 'no_gbp_description',
    impactWeight: 2,
    scoreKey: 'gbpCompletenessScore',
    // googleData.description is Google's own summary (editorialSummary / generativeSummary),
    // not the owner's description, so the copy asks for a check rather than claiming a gap.
    trigger: (b) => {
      const desc = b.googleData?.description;
      return !desc || desc.trim().length < 50;
    },
    category: 'Local SEO',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '15 minutes',
    action: 'Check your Google Business description',
    reason: 'Make sure your Google description names your services and town',
    whyItMattersTemplate:
      'Your Google Business description is one of the first things people read when they find you. A description that names your main services and the area you cover helps Google match you to the right searches and tells customers straight away that you do what they need.',
    steps: [
      'Go to business.google.com, click "Edit profile", then "Description", and read what is there.',
      'If it is empty or vague, write 2 to 3 sentences covering what you do, where you work, and what makes you different.',
      '[[Make sure "{service}" and "{town}" both appear naturally, without stuffing in keywords.||Make sure your main service and your town appear naturally, without stuffing in keywords.]]',
      'Keep it under 750 characters, which is the Google limit.',
    ],
    outcome: 'Better visibility in local search results',
    requiresSiteSignals: false,
    requiresGoogleData: true,
  },
  {
    id: 'no_website_meta_description',
    impactWeight: 3,
    scoreKey: 'websiteHealthScore',
    compare: siteFeature(
      (c) => (c.signals!.seo.metaDescription?.trim().length ?? 0) >= 50,
      ['has a written search result description', 'have a written search result description'],
    ),
    trigger: (b) => {
      const meta = b.signals?.seo?.metaDescription;
      return meta != null && meta.trim().length < 50;
    },
    category: 'Website',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '30 minutes',
    action: 'Add a proper description to your homepage',
    reason: 'Your homepage is missing a search result description',
    whyItMattersTemplate:
      'When your site appears in Google, the short description below the title is your chance to convince someone to click. Without one, Google picks random text from your page, which often looks messy and does not sell what you do.',
    steps: [
      'Open your website editor or CMS and find the "meta description" or "SEO description" field for your homepage.',
      'Write 1 to 2 sentences (under 160 characters) that say what you do, where, and why someone should choose you[[, for example: "{Service} in {town}. See our services and reviews, then get in touch today."]].',
      'Include your main service and location naturally.',
      'If you use WordPress, the Yoast or Rank Math plugin makes this easy: look for the "SEO" box below the editor.',
    ],
    outcome: 'Better click-through from search results',
  },
  {
    id: 'no_schema_markup',
    impactWeight: 2,
    scoreKey: 'websiteHealthScore',
    compare: siteFeature(
      (c) => (c.signals!.seo.schemaMarkupTypes?.length ?? 0) > 0,
      ['labels their business details for Google', 'label their business details for Google'],
    ),
    trigger: (b) => {
      const types = b.signals?.seo?.schemaMarkupTypes;
      return types != null && types.length === 0;
    },
    category: 'Website',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '1 to 2 hours',
    action: 'Help Google understand what your business does',
    reason: 'Your site has no structured business information for Google',
    whyItMattersTemplate:
      'Google uses behind-the-scenes labels on your website to understand your business type, location, and services. Without them, you miss out on rich results such as star ratings and opening hours showing directly in search. Adding them takes less than an hour with most website builders.',
    steps: [
      'If you use WordPress, install the free "Schema & Structured Data for WP & AMP" plugin, which adds the labels automatically.',
      'If you use Wix, Squarespace, or Shopify, look in your site\'s SEO settings for "Structured data" or "Schema" and enable it.',
      'At minimum, add your business name, address, phone number, opening hours, and business type.',
      "Test it using Google's Rich Results Test (search for it) to confirm Google can read it.",
    ],
    outcome: 'Richer appearance in Google search results',
  },
  {
    id: 'low_gbp_photos',
    impactWeight: 3,
    scoreKey: 'gbpCompletenessScore',
    compare: (own, competitors) => {
      const s = strongest(own, competitors.filter(googleOk), (b) => b.googleData?.photos);
      if (!s) return null;
      const theirs = s.value >= 10 ? '10 or more photos' : plural(s.value, 'photo');
      const yours = s.ownValue > 0 ? `you have ${s.ownValue}` : 'you have not added any yet';
      return `${s.name} has ${theirs} on Google; ${yours}.`;
    },
    trigger: (b) => {
      const photos = b.googleData?.photos;
      return photos != null && photos < 5;
    },
    category: 'Local SEO',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '1 to 2 hours',
    action: 'Add more photos to your Google listing',
    reason: 'Your Google listing has fewer than 5 photos',
    whyItMattersTemplate:
      'Listings with more photos get significantly more clicks and calls. When someone is choosing between two similar businesses, photos are often the deciding factor: they show you are real, active, and trustworthy. A few good photos can make your listing stand out in the map results.',
    steps: [
      'Go to business.google.com and click "Add photos".',
      'Upload at least 5 to 10 photos: your shopfront or premises, your team at work, finished jobs or products, and any before/after shots.',
      'Use your phone. The photos do not need to be professional, just clear and recent.',
      'Add a new photo every month or two to keep your listing looking active.',
    ],
    outcome: 'More clicks and calls from your Google listing',
    requiresSiteSignals: false,
    requiresGoogleData: true,
  },
  {
    id: 'missing_alt_tags',
    impactWeight: 2,
    scoreKey: 'websiteHealthScore',
    compare: siteFeature(
      (c) => c.signals!.seo.altTagCoverage !== 'none',
      ['describes their website images for Google', 'describe their website images for Google'],
    ),
    trigger: (b) => b.signals?.seo?.altTagCoverage === 'none',
    category: 'Website',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '1 to 2 hours',
    action: 'Add descriptions to your website images',
    reason: 'Your website images have no text descriptions',
    whyItMattersTemplate:
      'Search engines cannot see images; they read the text description attached to each one. Without descriptions, your images are invisible to Google, which means you are missing out on image search traffic and making your site harder to rank. Adding them takes a few minutes per image.',
    steps: [
      'In your website editor, click on each image and look for an "Alt text" or "Image description" field.',
      'Write a short description of what is in the photo, for example [["{Service} completed in {town}"||"Bathroom renovation completed in Manchester"]] rather than just "photo1".',
      'Include your service and location naturally where it makes sense.',
      'Work through your homepage images first, then your services pages.',
    ],
    outcome: 'More visibility in Google image search',
  },
  {
    id: 'no_contact_form',
    impactWeight: 4,
    scoreKey: 'websiteHealthScore',
    compare: siteFeature(
      (c) => c.signals!.engagement.hasContactForm,
      ['has a contact form on their website', 'have a contact form on their website'],
    ),
    trigger: (b) => b.signals?.engagement?.hasContactForm === false,
    category: 'Conversion',
    effort: 'low',
    estimatedImpact: 'high',
    timeframe: '1 to 2 hours',
    action: 'Add a contact form to your website',
    reason: 'Your website has no contact form',
    whyItMattersTemplate:
      'Not everyone wants to call, especially outside business hours. A contact form lets people reach you on their terms, which means you capture enquiries that would otherwise go to a competitor. It also makes you look more professional and established.',
    steps: [
      "Add a contact form to your website using your builder's built-in form tool (all major builders have one).",
      'Keep it short: name, phone number or email, and a message field.',
      'Make sure form submissions send to an email you check regularly.',
      'Add a note like "We reply within 24 hours" to set expectations and encourage more people to submit.',
    ],
    outcome: 'Capture more enquiries, especially out of hours',
  },
  {
    id: 'no_services_listed',
    impactWeight: 5,
    scoreKey: 'websiteHealthScore',
    compare: siteFeature(
      (c) => (c.signals!.content.servicesListed?.length ?? 0) > 0,
      ['lists their services on their website', 'list their services on their website'],
    ),
    trigger: (b) => {
      const services = b.signals?.content?.servicesListed;
      return services != null && services.length === 0;
    },
    category: 'Website',
    effort: 'low',
    estimatedImpact: 'high',
    timeframe: '1 to 2 hours',
    action: 'List your services clearly on your website',
    reason: 'Your website does not clearly list what you offer',
    whyItMattersTemplate:
      'When someone lands on your site, they need to immediately see whether you do what they need. If your services are not listed clearly, visitors leave, and so does your Google ranking, since search engines also read service lists to understand what to rank you for.',
    steps: [
      'Create a dedicated "Services" page or section on your homepage.',
      'List each service with a short description (2 to 3 sentences) explaining what it includes and who it is for.',
      'Include your main service terms naturally, for example "Emergency boiler repair" rather than just "Heating".',
      'If you offer multiple services, give each its own section or sub-page.',
    ],
    outcome: 'More qualified visitors and better Google rankings',
  },
  {
    id: 'no_service_areas',
    impactWeight: 4,
    scoreKey: 'localVisibilityScore',
    compare: siteFeature(
      (c) => (c.signals!.content.serviceAreasMentioned?.length ?? 0) > 0,
      ['names the areas they cover on their website', 'name the areas they cover on their website'],
    ),
    trigger: (b) => {
      const areas = b.signals?.content?.serviceAreasMentioned;
      return areas != null && areas.length === 0;
    },
    category: 'Local SEO',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '30 to 60 minutes',
    action: 'Tell Google and visitors where you work',
    reason: 'Your website does not mention your service area',
    whyItMattersTemplate:
      'Google needs to see location references on your site to rank you for local searches. If your site never mentions the towns or areas you cover, you are unlikely to show up when people nearby search for what you do. Adding a clear service area section is one of the fastest local SEO wins available.',
    steps: [
      'Add a short "Areas we cover" section to your homepage or contact page.',
      'List the towns, cities, or postcodes you serve, and be specific.',
      '[[Mention {town} naturally in your homepage headline or introduction too.||Mention your location naturally in your homepage headline or introduction too.]]',
      'If you cover a wide area, consider creating a short page for each main town you serve.',
    ],
    outcome: 'Appear in more local searches across your coverage area',
  },
  {
    id: 'no_faq',
    impactWeight: 2,
    scoreKey: 'websiteHealthScore',
    compare: siteFeature(
      (c) => c.signals!.content.hasFAQ,
      ['has a FAQ section on their website', 'have a FAQ section on their website'],
    ),
    trigger: (b) => b.signals?.content?.hasFAQ === false,
    category: 'Website',
    effort: 'medium',
    estimatedImpact: 'medium',
    timeframe: '2 to 3 hours',
    action: 'Add a FAQ section to your website',
    reason: 'Your website has no FAQ section',
    whyItMattersTemplate:
      'People searching for your services often have the same questions before they call: price ranges, what is included, how to book. A FAQ section answers these upfront, builds trust, and keeps visitors on your site longer. Google also picks up FAQ content for direct answers in search results.',
    steps: [
      'Write down the 5 to 8 questions you get asked most often by new customers.',
      'Answer each one in 2 to 4 plain sentences.',
      'Add the FAQ to your homepage or a dedicated page. Most website builders have a FAQ block.',
      'Include questions about pricing, what areas you cover, your process, and any guarantees you offer.',
    ],
    outcome: 'More confident enquiries and better search visibility',
  },
  {
    id: 'no_team_page',
    impactWeight: 2,
    scoreKey: 'websiteHealthScore',
    compare: siteFeature(
      (c) => c.signals!.trust.teamPageExists,
      ['has an About or Team page', 'have an About or Team page'],
    ),
    trigger: (b) => b.signals?.trust?.teamPageExists === false,
    category: 'Trust',
    effort: 'medium',
    estimatedImpact: 'medium',
    timeframe: '2 to 4 hours',
    action: 'Add an About or Team page to your website',
    reason: 'Your website has no About or Team page',
    whyItMattersTemplate:
      'People hire people, not companies. An About page showing who is behind the business, even just a photo and a few sentences, builds the kind of trust that turns a browsing visitor into a paying customer. It is especially important for service businesses where someone is inviting you into their home or handing over an important job.',
    steps: [
      'Create a simple "About us" page with a photo of yourself or your team.',
      'Write 2 to 3 paragraphs: who you are, how long you have been doing this, and why you started the business.',
      'Mention any qualifications, accreditations, or notable experience.',
      'Add a short personal note about your values or approach. Customers respond to authenticity.',
    ],
    outcome: 'More trust, more enquiries from website visitors',
  },
  {
    id: 'no_review_links',
    impactWeight: 2,
    scoreKey: 'reputationScore',
    compare: siteFeature(
      (c) => (c.signals!.trust.reviewPlatformsLinked?.length ?? 0) > 0,
      ['links to their reviews from their website', 'link to their reviews from their website'],
    ),
    trigger: (b) => {
      const platforms = b.signals?.trust?.reviewPlatformsLinked;
      return platforms != null && platforms.length === 0;
    },
    category: 'Reviews',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '30 minutes',
    action: 'Link to your reviews from your website',
    reason: 'Your website does not link to any review platforms',
    whyItMattersTemplate:
      'If you have good reviews, make sure visitors can see them. Linking to your Google or Trustpilot profile from your website reassures people who are on the fence, and signals confidence. A simple "See our reviews on Google" badge or link can be the final nudge that gets someone to call.',
    steps: [
      'Find your Google Business review link (go to business.google.com and open the share review form).',
      'Add a "Read our Google reviews" button or link to your homepage or contact page.',
      'If you have reviews on other platforms (Trustpilot, Facebook, Checkatrade), link to those too.',
      'Consider adding a widget that shows your star rating directly on the page.',
    ],
    outcome: 'Turn website visitors into enquiries faster',
  },
  {
    id: 'not_in_local_pack',
    impactWeight: 5,
    scoreKey: 'localVisibilityScore',
    compare: (_own, competitors) =>
      competitorsWith(
        competitors,
        (c) => !!c.serpData && !c.enrichmentErrors?.serp,
        (c) => c.serpData!.localPackPresent,
        [
          'appears in the Google map results for your area',
          'appear in the Google map results for your area',
        ],
      ),
    trigger: (b) => b.serpData?.localPackPresent === false,
    category: 'Local SEO',
    effort: 'high',
    estimatedImpact: 'high',
    timeframe: '4 to 8 weeks',
    action: 'Get your business into the Google map results',
    reason: "Your business is not showing in Google's map section",
    whyItMattersTemplate:
      'The map section at the top of Google search results (the box showing three businesses with a map) gets the majority of clicks for local searches. If you are not there, most people searching for what you do nearby will never find you. Getting into this section is the single biggest lever for local visibility.',
    steps: [
      'Make sure your Google Business Profile is fully complete: hours, description, photos, and services.',
      'Ensure your business name, address, and phone number are identical on your website and Google profile.',
      'Ask recent customers for Google reviews. Review count and recency are key ranking signals.',
      'Add your location and service area to your website content, not just your Google profile.',
      'If you have not already, submit your site to Google Search Console so Google can crawl it properly.',
    ],
    outcome: 'Appear in the map results for local searches',
    requiresSiteSignals: false,
  },
  {
    id: 'low_review_count',
    impactWeight: 5,
    scoreKey: 'reputationScore',
    compare: (own, competitors) => {
      const s = strongest(own, competitors.filter(googleOk), (b) => b.googleData?.reviewCount);
      if (!s) return null;
      const yours = s.ownValue > 0 ? `you have ${s.ownValue}` : 'you have not collected any yet';
      return `${s.name} has ${plural(s.value, 'Google review')}; ${yours}.`;
    },
    trigger: (b) => {
      const count = b.googleData?.reviewCount;
      return count != null && count < 10;
    },
    category: 'Reviews',
    effort: 'medium',
    estimatedImpact: 'high',
    timeframe: '2 to 4 weeks',
    action: 'Build up your Google review count',
    reason: 'You have fewer than 10 Google reviews',
    whyItMattersTemplate:
      'With fewer than 10 reviews, many potential customers will hesitate, because a small number of reviews feels unproven. Google also uses review count as a ranking signal for local searches. Getting 15 to 20 reviews puts you on solid footing and makes your listing look established.',
    steps: [
      'Message your last 10 satisfied customers directly and ask them to leave a Google review, and include your review link.',
      '[[Copy this message: "Thanks for choosing us for your {service}! Would you leave us a quick Google review? It really helps a small {town} business like ours."||Copy this message: "Thanks for choosing us! Would you leave us a quick Google review? It really helps a small local business like ours."]]',
      'Add a "Leave us a review" link to your email footer and any invoices or receipts you send.',
      'After completing a job, ask in person: "Would you mind leaving us a quick Google review? It really helps us out."',
      'Set a goal of getting 2 to 3 new reviews per month and track it.',
    ],
    outcome: 'A review profile that builds instant trust',
    requiresSiteSignals: false,
    requiresGoogleData: true,
  },
  {
    id: 'slow_mobile_site',
    impactWeight: 4,
    scoreKey: 'websiteHealthScore',
    compare: (own, competitors) => {
      const s = strongest(own, competitors, (b) => b.pagespeedData?.mobile?.performanceScore);
      if (!s || s.value < 50) return null;
      return `${s.name} scores ${s.value} out of 100 for mobile speed; you score ${s.ownValue}.`;
    },
    trigger: (b) => {
      const score = b.pagespeedData?.mobile?.performanceScore;
      return score != null && score < 50;
    },
    category: 'Website',
    effort: 'high',
    estimatedImpact: 'high',
    timeframe: '1 to 2 weeks',
    action: 'Speed up your website on mobile',
    reason: 'Your website loads slowly on mobile phones',
    whyItMattersTemplate:
      'More than half of local searches happen on mobile. If your site takes more than 3 seconds to load, most visitors will leave before seeing anything. A slow site also ranks lower in Google search results. Improving your site speed is one of the few actions that directly affects both visitors and your Google ranking at the same time.',
    steps: [
      'Run your site through Google PageSpeed Insights (free, search for it) to see the specific issues.',
      'The most common fixes are: compressing large images, removing unused plugins, and enabling caching. Your web developer or hosting provider can do this quickly.',
      'If you use WordPress, install a caching plugin like WP Rocket or W3 Total Cache.',
      'Consider upgrading your hosting plan if your current plan is a basic shared package.',
    ],
    outcome: 'Faster site that keeps visitors and ranks better',
    requiresSiteSignals: false,
  },
  {
    id: 'low_ai_visibility',
    impactWeight: 2,
    scoreKey: 'aiPresenceScore',
    compare: (own, competitors) => {
      const s = strongest(own, competitors, (b) => b.aiVisibility?.aiPresenceScore);
      if (!s) return null;
      return `${s.name} scores ${s.value} out of 100 for AI visibility; you score ${s.ownValue}.`;
    },
    trigger: (b) => {
      const score = b.aiVisibility?.aiPresenceScore;
      return score != null && score < 30;
    },
    category: 'AI Visibility',
    effort: 'medium',
    estimatedImpact: 'medium',
    timeframe: '4 to 8 weeks',
    action: 'Get your business mentioned by AI assistants',
    reason: 'Your business rarely shows up when AI tools recommend local services',
    whyItMattersTemplate:
      "More and more people are asking AI tools like ChatGPT and Google's AI to recommend local businesses. If your name is not coming up, you are missing a growing source of referrals. AI tools tend to recommend businesses with strong Google profiles, plenty of reviews, and clear information online. Improving these gives you a better chance of being named.",
    steps: [
      'Make sure your Google Business Profile is complete with a detailed description, all services listed, and recent photos.',
      'Build up your Google reviews. Businesses with more reviews are more likely to be referenced by AI tools.',
      'Ensure your website clearly states your business name, location, and the specific services you offer.',
      'If you have been featured in any local news, directories, or industry sites, ask them to include a link to your website.',
    ],
    outcome: 'Get recommended by AI tools searching for local services',
    requiresSiteSignals: false,
  },
  {
    id: 'no_cta',
    impactWeight: 4,
    scoreKey: 'websiteHealthScore',
    compare: siteFeature(
      (c) => c.signals!.engagement.hasCallToAction,
      [
        'gives visitors a clear next step on their homepage',
        'give visitors a clear next step on their homepage',
      ],
    ),
    trigger: (b) => b.signals?.engagement?.hasCallToAction === false,
    category: 'Conversion',
    effort: 'low',
    estimatedImpact: 'high',
    timeframe: '1 to 2 hours',
    action: 'Add a clear "next step" button to your homepage',
    reason: 'Your homepage has no clear action for visitors to take',
    whyItMattersTemplate:
      'When someone lands on your site interested in what you do, they need to be told what to do next. Without a clear button or prompt such as "Call us", "Get a free quote" or "Book online", many people simply leave. A single prominent action button is one of the easiest ways to turn more visitors into enquiries.',
    steps: [
      'Decide on the single most valuable action a visitor can take: calling you, filling in a form, or booking online.',
      'Add a prominent button near the top of your homepage with a clear label such as "Get a free quote" or "Call us today".',
      'Make the button a contrasting colour so it stands out from the rest of the page.',
      'Repeat the button lower on the page too, since not everyone reads from top to bottom.',
    ],
    outcome: 'More calls and enquiries from the same number of visitors',
  },
  // ── Catalogue batch 1 ────────────────────────────────────────────────
  {
    id: 'title_missing_town',
    impactWeight: 4,
    scoreKey: 'websiteHealthScore',
    compare: (_own, competitors, ctx) => {
      const town = ctx.town;
      if (!town) return null;
      return competitorsWith(
        competitors,
        siteOk,
        (c) => mentionsTown(c.signals!.seo.title ?? '', town),
        [`includes ${town} in their homepage title`, `include ${town} in their homepage titles`],
      );
    },
    trigger: (b, ctx) => {
      const title = b.signals?.seo?.title;
      if (title == null || !ctx.town) return false;
      return !mentionsTown(title, ctx.town);
    },
    category: 'Local SEO',
    effort: 'low',
    estimatedImpact: 'high',
    timeframe: '1 to 2 weeks',
    action: 'Put your town in your homepage title',
    reason: 'Your homepage title does not mention the town you serve',
    whyItMattersTemplate:
      'Your homepage title is the blue link people see in Google, and one of the strongest clues Google uses to decide which local searches you appear in. If your town is not in it, you are leaving easy local rankings to competitors who include theirs.',
    steps: [
      'Open your website editor or SEO settings and find the "page title" or "SEO title" for your homepage.',
      '[[Change it to something like: "{Service} in {town} | {name}".||Change it to your main service, your town and your business name, for example "Plumber in Bristol | Acme Plumbing".]]',
      'Keep it under 60 characters so Google shows it in full.',
      'If you use WordPress, the Yoast or Rank Math box below the editor has an "SEO title" field.',
    ],
    outcome: 'Rank for searches in your town',
  },
  {
    id: 'no_sitemap',
    impactWeight: 2,
    scoreKey: 'websiteHealthScore',
    compare: siteFeature(
      (c) => c.signals!.seo.hasSitemap,
      [
        'has a sitemap that lists every page for Google',
        'have a sitemap that lists every page for Google',
      ],
    ),
    // hasSitemap is false when the check itself fails, so require robots.txt to
    // have been reached before treating a missing sitemap as real.
    trigger: (b) => b.signals?.seo?.hasSitemap === false && b.signals.seo.hasRobotsTxt === true,
    category: 'Website',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '1 to 2 weeks',
    action: 'Give Google a map of your website',
    reason: 'Your website has no sitemap telling Google which pages exist',
    whyItMattersTemplate:
      'A sitemap is a simple list of every page on your site that Google reads to find your pages. Without one, newer or deeper pages such as individual services can take much longer to show up in search.',
    steps: [
      'If you use WordPress, install Yoast or Rank Math: both create a sitemap automatically.',
      'Wix, Squarespace and Shopify create one for you. Check it exists by adding /sitemap.xml to the end of your web address.',
      'Sign in to Google Search Console (free), open "Sitemaps" and submit your sitemap address.',
    ],
    outcome: 'Every page found by Google',
  },
  {
    id: 'no_booking_competitor_has',
    impactWeight: 3,
    scoreKey: 'websiteHealthScore',
    compare: (_own, competitors) => {
      const bookers = competitors.filter(
        (c) => siteOk(c) && c.signals!.engagement.hasBookingSystem,
      );
      if (bookers.length === 0) return null;
      if (bookers.length === 1) {
        const provider = bookers[0].signals!.engagement.bookingProvider;
        return `${bookers[0].name} takes bookings online${provider ? ` through ${provider}` : ''}.`;
      }
      const names = bookers.map((c) => c.name);
      return `${joinNames(names)} ${names.length === 2 ? 'both' : 'all'} take bookings online.`;
    },
    trigger: (b, ctx) =>
      b.signals?.engagement?.hasBookingSystem === false &&
      (ctx.competitors ?? []).some((c) => siteOk(c) && c.signals!.engagement.hasBookingSystem),
    category: 'Conversion',
    effort: 'medium',
    estimatedImpact: 'high',
    timeframe: '1 to 2 weeks',
    action: 'Let customers book online like your rivals',
    reason: 'Competitors take online bookings and you do not yet',
    whyItMattersTemplate:
      'Many customers would rather pick a time on their phone than call during working hours. When a competitor lets them book in a few taps and you do not, the enquiry often goes to them, especially in the evenings and at weekends.',
    steps: [
      'Choose a booking tool that suits your work, for example Fresha, Booksy, Calendly, Square Appointments or Setmore. Most have a free plan.',
      'Add your services, prices and the hours you are available.',
      'Put a "Book online" button at the top of your homepage and on your Google Business Profile.',
      'Make a test booking yourself from your phone before you share it.',
    ],
    outcome: 'More bookings outside working hours',
  },
  {
    id: 'gbp_missing_website',
    impactWeight: 4,
    scoreKey: 'gbpCompletenessScore',
    compare: (_own, competitors) =>
      competitorsWith(competitors, googleOk, (c) => !!c.googleData!.website?.trim(), [
        'links their Google listing to their website',
        'link their Google listings to their websites',
      ]),
    trigger: (b) => !b.googleData?.website?.trim(),
    category: 'Local SEO',
    effort: 'low',
    estimatedImpact: 'high',
    timeframe: '10 minutes',
    action: 'Add your website to your Google listing',
    reason: 'Your Google Business Profile does not link to your website',
    whyItMattersTemplate:
      'People who find you on Google Maps often want to check your website before they call. Without a link they have to search again, and many will click a competitor instead. The link also helps Google connect your listing to your site, which supports your local ranking.',
    steps: [
      'Go to business.google.com and click "Edit profile".',
      'Under "Contact", add your website address, starting with https://.',
      'Open your listing on your phone and check the link goes to your homepage.',
    ],
    outcome: 'More visits from your Google listing',
    requiresSiteSignals: false,
    requiresGoogleData: true,
  },
  {
    id: 'no_accreditations_shown',
    impactWeight: 3,
    scoreKey: 'websiteHealthScore',
    compare: (_own, competitors) => {
      const shown = competitors.filter(
        (c) => siteOk(c) && (c.signals!.trust.accreditations?.length ?? 0) > 0,
      );
      if (shown.length === 0) return null;
      if (shown.length === 1) {
        const badges = joinNames(shown[0].signals!.trust.accreditations.slice(0, 2));
        return `${shown[0].name} shows ${badges} on their website.`;
      }
      const names = shown.map((c) => c.name);
      return `${joinNames(names)} ${names.length === 2 ? 'both' : 'all'} show their accreditations on their websites.`;
    },
    trigger: (b, ctx) => {
      const t = b.signals?.trust;
      if (!t || !ctx.serviceCategory || !REGULATED_CATEGORIES.has(ctx.serviceCategory))
        return false;
      return t.accreditations?.length === 0 && (t.certifications?.length ?? 0) === 0;
    },
    category: 'Trust',
    effort: 'low',
    estimatedImpact: 'high',
    timeframe: '1 hour',
    action: 'Show your trade body memberships',
    reason: 'Your website does not show any accreditations or memberships',
    whyItMattersTemplate:
      'In your line of work, customers look for proof that you are qualified and regulated before they get in touch. Badges from recognised bodies are a quick way to build that trust, and they help you stand out against competitors who show theirs.',
    steps: [
      'List every accreditation, registration, trade body and certification you hold, for example Gas Safe, NICEIC, Which? Trusted Trader, the GDC or the SRA.',
      'Download the official logo or badge from the member area of each body.',
      'Add the badges near the top of your homepage and in your website footer, linking each one to your entry on the official register where possible.',
      'Mention them in your Google Business description too.',
    ],
    outcome: 'Instant trust from new visitors',
  },
  {
    id: 'no_social_links',
    impactWeight: 2,
    scoreKey: 'websiteHealthScore',
    compare: siteFeature(
      (c) => (c.signals!.engagement.socialLinksPresent?.length ?? 0) > 0,
      [
        'links to their social media profiles from their website',
        'link to their social media profiles from their websites',
      ],
    ),
    trigger: (b) => b.signals?.engagement?.socialLinksPresent?.length === 0,
    category: 'Trust',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '30 minutes',
    action: 'Link your website to your social profiles',
    reason: 'Your website does not link to any social media profiles',
    whyItMattersTemplate:
      'Links to your Facebook, Instagram or LinkedIn pages show visitors you are active and real, and they give Google and AI assistants more ways to confirm who you are. It is one of the quickest ways to make a small business look established.',
    steps: [
      'Pick the profiles you actually keep up to date. One active profile is better than three empty ones.',
      'Add small icons linking to them in your website footer. Most builders have a "Social links" option.',
      'Make sure each profile links back to your website and uses the same business name, address and phone number.',
    ],
    outcome: 'A business that looks active and established',
  },
  {
    id: 'vague_cta',
    impactWeight: 3,
    scoreKey: 'websiteHealthScore',
    trigger: (b) => {
      const e = b.signals?.engagement;
      if (!e?.hasCallToAction) return false;
      const labels = (e.ctaText ?? []).map((t) => t.trim()).filter(Boolean);
      return labels.length > 0 && labels.every((t) => VAGUE_CTA.test(t));
    },
    category: 'Conversion',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '30 minutes',
    action: 'Make your main button say what happens next',
    reason: 'Your website buttons use vague labels like "Submit" or "Learn more"',
    whyItMattersTemplate:
      'Buttons that say "Submit" or "Learn more" make visitors guess what happens when they click. A label that names the result, such as "Get a free quote" or "Book a visit", tells them exactly what they get and is one of the cheapest ways to turn more visitors into enquiries.',
    steps: [
      'Find the main button on your homepage and the button on your contact form.',
      '[[Rename them to say what the visitor gets, for example "Book your {service}" or "Call for a quote".||Rename them to say what the visitor gets, for example "Book a visit" or "Call for a quote".]]',
      'Use the same wording on every page so the next step is always clear.',
    ],
    outcome: 'More clicks on your main button',
  },
  {
    id: 'no_guarantee',
    impactWeight: 3,
    scoreKey: 'websiteHealthScore',
    compare: siteFeature(
      (c) => (c.signals!.trust.guaranteesMentioned?.length ?? 0) > 0,
      ['states a guarantee on their website', 'state a guarantee on their websites'],
    ),
    trigger: (b, ctx) =>
      !!ctx.serviceCategory &&
      HANDS_ON_CATEGORIES.has(ctx.serviceCategory) &&
      b.signals?.trust?.guaranteesMentioned?.length === 0,
    category: 'Trust',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '30 minutes',
    action: 'Tell customers what you guarantee',
    reason: 'Your website does not mention any guarantee on your work',
    whyItMattersTemplate:
      'Hiring someone new feels risky. A clear promise, such as a workmanship guarantee or a "we will put it right" policy, removes that worry and gives people a reason to pick you over a similar business that does not offer one.',
    steps: [
      'Write down the promise you already keep in practice, for example how long your work is guaranteed or what happens if something is not right.',
      'Add it in one plain sentence near the top of your homepage and on your quotes and invoices.',
      'Only promise what you can stand behind. A short, honest guarantee beats a vague one.',
    ],
    outcome: 'More confidence to choose you',
  },
  {
    id: 'no_insurance_mentioned',
    impactWeight: 2,
    scoreKey: 'websiteHealthScore',
    compare: siteFeature(
      (c) => c.signals!.trust.insuranceMentioned,
      ['mentions being insured on their website', 'mention being insured on their websites'],
    ),
    trigger: (b, ctx) =>
      !!ctx.serviceCategory &&
      HANDS_ON_CATEGORIES.has(ctx.serviceCategory) &&
      b.signals?.trust?.insuranceMentioned === false,
    category: 'Trust',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '15 minutes',
    action: 'Say that you are fully insured',
    reason: 'Your website does not mention your insurance',
    whyItMattersTemplate:
      'When someone lets you into their home or onto their property, they want to know they are covered if something goes wrong. A short line saying you are fully insured answers that question before they have to ask.',
    steps: [
      'Check what cover you hold, for example public liability insurance, and the amount.',
      'Add a line such as "Fully insured with £2 million public liability cover" to your homepage and contact page, using your real figure.',
      'Keep a copy of your certificate ready to send when customers ask.',
    ],
    outcome: 'Fewer doubts before customers call',
  },
  {
    id: 'thin_portfolio',
    impactWeight: 3,
    scoreKey: 'websiteHealthScore',
    compare: (own, competitors) => {
      const count = (b: Business) =>
        b.signals?.content?.hasPortfolio ? (b.signals.content.portfolioItemCount ?? 0) : 0;
      const s = strongest(own, competitors.filter(siteOk), count);
      if (!s || s.value < 3) return null;
      return `${s.name} shows ${plural(s.value, 'example')} of their work.`;
    },
    trigger: (b, ctx) => {
      const c = b.signals?.content;
      if (!c || !ctx.serviceCategory || !VISUAL_CATEGORIES.has(ctx.serviceCategory)) return false;
      return c.hasPortfolio === false || (c.portfolioItemCount ?? 0) < 3;
    },
    category: 'Website',
    effort: 'medium',
    estimatedImpact: 'high',
    timeframe: '2 to 3 hours',
    action: 'Show off your recent work',
    reason: 'Your website shows fewer than 3 examples of your work',
    whyItMattersTemplate:
      'People want to see what you can do before they get in touch. A gallery of real jobs is the most convincing proof you can offer, and photos with a short caption also give Google more to understand about your services and area.',
    steps: [
      'Pick 6 to 10 recent jobs you are proud of and take clear photos on your phone, with before and after shots where it makes sense.',
      '[[Add an "Our work" page or gallery with one line per photo, for example "{Service} in {town}".||Add an "Our work" page or gallery with one short line per photo saying what you did and where.]]',
      'Ask customers before sharing photos of their homes or faces.',
      'Add a new example every month to keep it fresh.',
    ],
    outcome: 'Visitors see proof before they call',
  },
];

const EFFORT_FACTOR: Record<PriorityAction['effort'], number> = { low: 1, medium: 0.7, high: 0.4 };

/**
 * Rank score: impactWeight × weakness × effortFactor. Weakness has a 0.3 floor so
 * a strong overall score cannot bury a real, cheap gap; a missing score counts as 0.5.
 */
export function rankScore(tpl: PriorityTemplate, b: Business): number {
  const score = b.aiScore?.[tpl.scoreKey];
  const weakness = score == null ? 0.5 : 0.3 + (0.7 * (100 - score)) / 100;
  return tpl.impactWeight * weakness * EFFORT_FACTOR[tpl.effort];
}

/**
 * Evaluate every template that has the data it needs, and return the ones that
 * fired, highest rank first (ties broken on id so the order is stable).
 */
function evaluateTemplates(
  b: Business,
  ctx: TemplateContext,
): {
  ranked: PriorityTemplate[];
  evaluatedIds: Set<string>;
} {
  // When on-site extraction failed, signal-dependent triggers are unreliable
  // (empty arrays look the same as "missing" vs "truly absent"), so skip them.
  const extractFailed = Boolean(b.enrichmentErrors?.extract);
  const googleMissing = !b.googleData || Boolean(b.enrichmentErrors?.google);
  const evaluatedIds = new Set<string>();
  const fired: { tpl: PriorityTemplate; score: number }[] = [];

  for (const tpl of PRIORITY_TEMPLATES) {
    if (extractFailed && tpl.requiresSiteSignals !== false) continue;
    if (googleMissing && tpl.requiresGoogleData) continue;
    evaluatedIds.add(tpl.id);
    if (tpl.trigger(b, ctx)) fired.push({ tpl, score: rankScore(tpl, b) });
  }

  fired.sort((x, y) => y.score - x.score || x.tpl.id.localeCompare(y.tpl.id));
  return { ranked: fired.map((f) => f.tpl), evaluatedIds };
}

/** Inputs that personalise template copy. All optional: templates fall back to generic text. */
export type TemplateOptions = {
  location?: string | null;
  serviceCategory?: ServiceCategory;
};

function toAction(
  tpl: PriorityTemplate,
  index: number,
  own: Business,
  competitors: Business[],
  ctx: TemplateContext,
): PriorityAction {
  return {
    id: asPriorityActionId(''),
    status: 'active',
    priority: (index + 1) as PriorityAction['priority'],
    category: tpl.category,
    effort: tpl.effort,
    estimatedImpact: tpl.estimatedImpact,
    timeframe: tpl.timeframe,
    // Headline stays static: dedup and continuity match on it for LLM rows.
    action: tpl.action,
    reason: tpl.reason,
    whyItMatters: [tpl.detail?.(own), fillTemplate(tpl.whyItMattersTemplate, ctx)]
      .filter(Boolean)
      .join(' '),
    steps: tpl.steps.map((s) => fillTemplate(s, ctx)).filter(Boolean),
    outcome: tpl.outcome,
    competitorReference: tpl.compare?.(own, competitors, ctx) ?? null,
    templateId: tpl.id,
    _source: 'template',
  };
}

export type ApplyResult = { actions: PriorityAction[]; firedIds: string[] };

/**
 * Run all Tier-1 priority templates against a business and return the top 5
 * by rank as PriorityAction objects (numbered from 1), along with `firedIds`:
 * every template that triggered, in rank order. Competitors feed the
 * deterministic `competitorReference`; options personalise the copy.
 */
export function applyTemplates(
  b: Business,
  competitors: Business[] = [],
  opts: TemplateOptions = {},
): ApplyResult {
  const ctx = {
    ...resolveTemplateContext(b, opts.location, opts.serviceCategory),
    competitors,
  };
  const { ranked } = evaluateTemplates(b, ctx);
  return {
    actions: ranked.slice(0, 5).map((tpl, i) => toAction(tpl, i, b, competitors, ctx)),
    firedIds: ranked.map((t) => t.id),
  };
}

export type ApplyWithHistoryResult = {
  actions: PriorityAction[];
  firedIds: string[];
  closedFromLastWeek: string[];
};

/**
 * Like `applyTemplates`, but participates in the continuity story:
 * - Sets `continuityNote: 'Still outstanding from last week.'` on template actions
 *   whose template id also appears in `previousActions`.
 * - Computes `closedFromLastWeek`: headlines of previous template actions whose
 *   template was evaluated this week and no longer fires, indicating the user
 *   likely fixed the underlying issue. LLM actions (no template id) are never
 *   counted, and neither are templates skipped for missing data.
 */
export function applyTemplatesWithHistory(
  b: Business,
  previousActions: PriorityAction[],
  competitors: Business[] = [],
  opts: TemplateOptions = {},
): ApplyWithHistoryResult {
  const ctx = {
    ...resolveTemplateContext(b, opts.location, opts.serviceCategory),
    competitors,
  };
  const { ranked, evaluatedIds } = evaluateTemplates(b, ctx);
  const firedIds = ranked.map((t) => t.id);
  const previousIds = new Set(previousActions.map((p) => p.templateId).filter(Boolean));

  const actions = ranked.slice(0, 5).map((tpl, i) => ({
    ...toAction(tpl, i, b, competitors, ctx),
    continuityNote: previousIds.has(tpl.id) ? 'Still outstanding from last week.' : null,
  }));

  const closedFromLastWeek: string[] = previousActions
    .filter(
      (prev) =>
        prev.templateId != null &&
        evaluatedIds.has(prev.templateId) &&
        !firedIds.includes(prev.templateId),
    )
    .map((prev) => prev.action);

  return { actions, firedIds, closedFromLastWeek };
}

/** Diagnostic: which templates would fire for this business? */
export function diagnoseTemplates(b: Business): { id: string; fired: boolean }[] {
  return PRIORITY_TEMPLATES.map((tpl) => ({
    id: tpl.id,
    fired: tpl.trigger(b, resolveTemplateContext(b)),
  }));
}
