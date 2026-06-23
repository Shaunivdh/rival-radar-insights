import type { Business, PriorityAction } from '@/types';

export type PriorityTemplate = {
  id: string;
  trigger: (b: Business) => boolean;
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
};

export const PRIORITY_TEMPLATES: PriorityTemplate[] = [
  {
    id: 'no_phone_on_homepage',
    trigger: (b) => b.signals?.engagement?.hasPhoneNumberProminent === false,
    category: 'Conversion',
    effort: 'low',
    estimatedImpact: 'high',
    timeframe: '1–2 days',
    action: 'Add your phone number to the homepage',
    reason: 'No phone number visible on your homepage',
    whyItMattersTemplate:
      'When someone lands on your site ready to call, they should not have to hunt for your number. A visible phone number in the header or hero section is one of the easiest ways to turn a visitor into a lead.',
    steps: [
      'Add your main phone number to the top of your homepage — ideally in the header so it shows on every page.',
      'Make it a clickable link so mobile visitors can tap to call.',
      'If you use a booking system instead of phone calls, make sure that link is just as prominent.',
    ],
    outcome: 'More calls from website visitors',
  },
  {
    id: 'no_recent_reviews',
    trigger: (b) => {
      const reviews = b.googleData?.recentReviews;
      const totalCount = b.googleData?.reviewCount ?? 0;
      if (totalCount <= 5) return false;
      if (!reviews || reviews.length === 0) return true;
      const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
      // r.time is stored in milliseconds (see scores.ts) — do NOT multiply by 1000.
      return !reviews.some((r) => r.time > ninetyDaysAgo);
    },
    category: 'Reviews',
    effort: 'medium',
    estimatedImpact: 'high',
    timeframe: '2–4 weeks',
    action: 'Get fresh reviews — yours have gone quiet',
    reason: 'No new reviews in the last 90 days',
    whyItMattersTemplate:
      'You have reviews, but none are recent. Google and potential customers both notice when the last review is months old. A steady trickle of new reviews signals that you are active and people are still choosing you.',
    steps: [
      'Pick 3 happy customers from the last month and send them a short text or email with your Google review link.',
      'Add a "Leave us a review" link to your email signature and invoices.',
      'After each completed job, ask in person — a simple "Would you mind leaving us a quick Google review?" works well.',
      'Set a reminder to ask one customer per week so reviews keep coming in steadily.',
    ],
    outcome: 'Steady stream of recent reviews',
    requiresSiteSignals: false,
  },
  {
    id: 'missing_h1',
    trigger: (b) => {
      const h1s = b.signals?.seo?.h1Tags;
      return h1s != null && h1s.length === 0;
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
      'Open your homepage editor and add a clear heading that says what you do and where — for example "Reliable Plumbing in Manchester".',
      'Make sure it is marked as an H1 (the "Heading 1" option in your editor).',
      'Keep it under 60 characters and include your main service and location.',
    ],
    outcome: 'Clearer page for search engines and visitors',
  },
  {
    id: 'no_business_hours',
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
  },
  {
    id: 'no_gbp_description',
    trigger: (b) => {
      const desc = b.googleData?.description;
      return !desc || desc.trim().length < 50;
    },
    category: 'Local SEO',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '30 minutes',
    action: 'Write a proper Google Business description',
    reason: 'Your Google Business description is missing or too short',
    whyItMattersTemplate:
      'Your Google Business description is one of the first things people read when they find you in search results. A clear description that mentions your services and area helps Google match you to the right searches and helps customers understand what you offer before they even visit your site.',
    steps: [
      'Go to business.google.com and click "Edit profile", then "Description".',
      'Write 2–3 sentences covering: what you do, where you operate, and what makes you different.',
      'Include your main service and location naturally — do not stuff keywords.',
      'Keep it under 750 characters (the Google limit).',
    ],
    outcome: 'Better visibility in local search results',
    requiresSiteSignals: false,
  },
  {
    id: 'no_website_meta_description',
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
      'When your site appears in Google, the short description below the title is your chance to convince someone to click. Without one, Google picks random text from your page — which often looks messy and does not sell what you do.',
    steps: [
      'Open your website editor or CMS and find the "meta description" or "SEO description" field for your homepage.',
      'Write 1–2 sentences (under 160 characters) that say what you do, where, and why someone should choose you.',
      'Include your main service and location naturally.',
      'If you use WordPress, the Yoast or Rank Math plugin makes this easy — look for the "SEO" box below the editor.',
    ],
    outcome: 'Better click-through from search results',
  },
  {
    id: 'no_schema_markup',
    trigger: (b) => {
      const types = b.signals?.seo?.schemaMarkupTypes;
      return types != null && types.length === 0;
    },
    category: 'Website',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '1–2 hours',
    action: 'Help Google understand what your business does',
    reason: 'Your site has no structured business information for Google',
    whyItMattersTemplate:
      'Google uses behind-the-scenes labels on your website to understand your business type, location, and services. Without them, you miss out on rich results — things like star ratings and opening hours showing directly in search. Adding them takes less than an hour with most website builders.',
    steps: [
      'If you use WordPress, install the free "Schema & Structured Data for WP & AMP" plugin — it adds the labels automatically.',
      'If you use Wix, Squarespace, or Shopify, look in your site\'s SEO settings for "Structured data" or "Schema" and enable it.',
      'At minimum, add your business name, address, phone number, opening hours, and business type.',
      "Test it using Google's Rich Results Test (search for it) to confirm Google can read it.",
    ],
    outcome: 'Richer appearance in Google search results',
  },
  {
    id: 'low_gbp_photos',
    trigger: (b) => {
      const photos = b.googleData?.photos;
      return photos != null && photos < 5;
    },
    category: 'Local SEO',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '1–2 hours',
    action: 'Add more photos to your Google listing',
    reason: 'Your Google listing has fewer than 5 photos',
    whyItMattersTemplate:
      'Listings with more photos get significantly more clicks and calls. When someone is choosing between two similar businesses, photos are often the deciding factor — they show you are real, active, and trustworthy. A few good photos can make your listing stand out in the map results.',
    steps: [
      'Go to business.google.com and click "Add photos".',
      'Upload at least 5–10 photos: your shopfront or premises, your team at work, finished jobs or products, and any before/after shots.',
      'Use your phone — the photos do not need to be professional, just clear and recent.',
      'Add a new photo every month or two to keep your listing looking active.',
    ],
    outcome: 'More clicks and calls from your Google listing',
    requiresSiteSignals: false,
  },
  {
    id: 'missing_alt_tags',
    trigger: (b) => b.signals?.seo?.altTagCoverage === 'none',
    category: 'Website',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '1–2 hours',
    action: 'Add descriptions to your website images',
    reason: 'Your website images have no text descriptions',
    whyItMattersTemplate:
      'Search engines cannot see images — they read the text description attached to each one. Without descriptions, your images are invisible to Google, which means you are missing out on image search traffic and making your site harder to rank. Adding them takes a few minutes per image.',
    steps: [
      'In your website editor, click on each image and look for an "Alt text" or "Image description" field.',
      'Write a short description of what is in the photo — for example "Bathroom renovation completed in Manchester" rather than just "photo1".',
      'Include your service and location naturally where it makes sense.',
      'Work through your homepage images first, then your services pages.',
    ],
    outcome: 'More visibility in Google image search',
  },
  {
    id: 'no_contact_form',
    trigger: (b) => b.signals?.engagement?.hasContactForm === false,
    category: 'Conversion',
    effort: 'low',
    estimatedImpact: 'high',
    timeframe: '1–2 hours',
    action: 'Add a contact form to your website',
    reason: 'Your website has no contact form',
    whyItMattersTemplate:
      'Not everyone wants to call — especially outside business hours. A contact form lets people reach you on their terms, which means you capture enquiries that would otherwise go to a competitor. It also makes you look more professional and established.',
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
    trigger: (b) => {
      const services = b.signals?.content?.servicesListed;
      return services != null && services.length === 0;
    },
    category: 'Website',
    effort: 'low',
    estimatedImpact: 'high',
    timeframe: '1–2 hours',
    action: 'List your services clearly on your website',
    reason: 'Your website does not clearly list what you offer',
    whyItMattersTemplate:
      'When someone lands on your site, they need to immediately see whether you do what they need. If your services are not listed clearly, visitors leave — and so does your Google ranking, since search engines also read service lists to understand what to rank you for.',
    steps: [
      'Create a dedicated "Services" page or section on your homepage.',
      'List each service with a short description (2–3 sentences) explaining what it includes and who it is for.',
      'Include your main service terms naturally — for example "Emergency boiler repair" not just "Heating".',
      'If you offer multiple services, give each its own section or sub-page.',
    ],
    outcome: 'More qualified visitors and better Google rankings',
  },
  {
    id: 'no_service_areas',
    trigger: (b) => {
      const areas = b.signals?.content?.serviceAreasMentioned;
      return areas != null && areas.length === 0;
    },
    category: 'Local SEO',
    effort: 'low',
    estimatedImpact: 'medium',
    timeframe: '30–60 minutes',
    action: 'Tell Google and visitors where you work',
    reason: 'Your website does not mention your service area',
    whyItMattersTemplate:
      'Google needs to see location references on your site to rank you for local searches. If your site never mentions the towns or areas you cover, you are unlikely to show up when people nearby search for what you do. Adding a clear service area section is one of the fastest local SEO wins available.',
    steps: [
      'Add a short "Areas we cover" section to your homepage or contact page.',
      'List the towns, cities, or postcodes you serve — be specific.',
      'Mention your location naturally in your homepage headline or introduction too.',
      'If you cover a wide area, consider creating a short page for each main town you serve.',
    ],
    outcome: 'Appear in more local searches across your coverage area',
  },
  {
    id: 'no_faq',
    trigger: (b) => b.signals?.content?.hasFAQ === false,
    category: 'Website',
    effort: 'medium',
    estimatedImpact: 'medium',
    timeframe: '2–3 hours',
    action: 'Add a FAQ section to your website',
    reason: 'Your website has no FAQ section',
    whyItMattersTemplate:
      'People searching for your services often have the same questions before they call — price ranges, what is included, how to book. A FAQ section answers these upfront, builds trust, and keeps visitors on your site longer. Google also picks up FAQ content for direct answers in search results.',
    steps: [
      'Write down the 5–8 questions you get asked most often by new customers.',
      'Answer each one in 2–4 plain sentences.',
      'Add the FAQ to your homepage or a dedicated page — most website builders have a FAQ block.',
      'Include questions about pricing, what areas you cover, your process, and any guarantees you offer.',
    ],
    outcome: 'More confident enquiries and better search visibility',
  },
  {
    id: 'no_team_page',
    trigger: (b) => b.signals?.trust?.teamPageExists === false,
    category: 'Trust',
    effort: 'medium',
    estimatedImpact: 'medium',
    timeframe: '2–4 hours',
    action: 'Add an About or Team page to your website',
    reason: 'Your website has no About or Team page',
    whyItMattersTemplate:
      'People hire people, not companies. An About page showing who is behind the business — even just a photo and a few sentences — builds the kind of trust that turns a browsing visitor into a paying customer. It is especially important for service businesses where someone is inviting you into their home or handing over an important job.',
    steps: [
      'Create a simple "About us" page with a photo of yourself or your team.',
      'Write 2–3 paragraphs: who you are, how long you have been doing this, and why you started the business.',
      'Mention any qualifications, accreditations, or notable experience.',
      'Add a short personal note about your values or approach — customers respond to authenticity.',
    ],
    outcome: 'More trust, more enquiries from website visitors',
  },
  {
    id: 'no_review_links',
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
      'If you have good reviews, make sure visitors can see them. Linking to your Google or Trustpilot profile from your website reassures people who are on the fence — and signals confidence. A simple "See our reviews on Google" badge or link can be the final nudge that gets someone to call.',
    steps: [
      'Find your Google Business review link (go to business.google.com → share review form).',
      'Add a "Read our Google reviews" button or link to your homepage or contact page.',
      'If you have reviews on other platforms (Trustpilot, Facebook, Checkatrade), link to those too.',
      'Consider adding a widget that shows your star rating directly on the page.',
    ],
    outcome: 'Turn website visitors into enquiries faster',
  },
  {
    id: 'not_in_local_pack',
    trigger: (b) => b.serpData?.localPackPresent === false,
    category: 'Local SEO',
    effort: 'high',
    estimatedImpact: 'high',
    timeframe: '4–8 weeks',
    action: 'Get your business into the Google map results',
    reason: "Your business is not showing in Google's map section",
    whyItMattersTemplate:
      'The map section at the top of Google search results (the box showing three businesses with a map) gets the majority of clicks for local searches. If you are not there, most people searching for what you do nearby will never find you. Getting into this section is the single biggest lever for local visibility.',
    steps: [
      'Make sure your Google Business Profile is fully complete — hours, description, photos, and services.',
      'Ensure your business name, address, and phone number are identical on your website and Google profile.',
      'Ask recent customers for Google reviews — review count and recency are key ranking signals.',
      'Add your location and service area to your website content, not just your Google profile.',
      'If you have not already, submit your site to Google Search Console so Google can crawl it properly.',
    ],
    outcome: 'Appear in the map results for local searches',
    requiresSiteSignals: false,
  },
  {
    id: 'low_review_count',
    trigger: (b) => {
      const count = b.googleData?.reviewCount ?? 0;
      return count < 10;
    },
    category: 'Reviews',
    effort: 'medium',
    estimatedImpact: 'high',
    timeframe: '2–4 weeks',
    action: 'Build up your Google review count',
    reason: 'You have fewer than 10 Google reviews',
    whyItMattersTemplate:
      'With fewer than 10 reviews, many potential customers will hesitate — a small number of reviews feels unproven. Google also uses review count as a ranking signal for local searches. Getting to 15–20 reviews puts you on solid footing and makes your listing look established.',
    steps: [
      'Message your last 10 satisfied customers directly and ask them to leave a Google review — include your review link.',
      'Add a "Leave us a review" link to your email footer and any invoices or receipts you send.',
      'After completing a job, ask in person — "Would you mind leaving us a quick Google review? It really helps us out."',
      'Set a goal of getting 2–3 new reviews per month and track it.',
    ],
    outcome: 'A review profile that builds instant trust',
    requiresSiteSignals: false,
  },
  {
    id: 'slow_mobile_site',
    trigger: (b) => {
      const score = b.pagespeedData?.mobile?.performanceScore;
      return score != null && score < 50;
    },
    category: 'Website',
    effort: 'high',
    estimatedImpact: 'high',
    timeframe: '1–2 weeks',
    action: 'Speed up your website on mobile',
    reason: 'Your website loads slowly on mobile phones',
    whyItMattersTemplate:
      'More than half of local searches happen on mobile. If your site takes more than 3 seconds to load, most visitors will leave before seeing anything. A slow site also ranks lower in Google search results. Improving your site speed is one of the few actions that directly affects both visitors and your Google ranking at the same time.',
    steps: [
      'Run your site through Google PageSpeed Insights (free, search for it) to see the specific issues.',
      'The most common fixes are: compressing large images, removing unused plugins, and enabling caching — your web developer or hosting provider can do this quickly.',
      'If you use WordPress, install a caching plugin like WP Rocket or W3 Total Cache.',
      'Consider upgrading your hosting plan if your current plan is a basic shared package.',
    ],
    outcome: 'Faster site that keeps visitors and ranks better',
    requiresSiteSignals: false,
  },
  {
    id: 'low_ai_visibility',
    trigger: (b) => {
      const score = b.aiVisibility?.aiPresenceScore;
      return score != null && score < 30;
    },
    category: 'AI Visibility',
    effort: 'medium',
    estimatedImpact: 'medium',
    timeframe: '4–8 weeks',
    action: 'Get your business mentioned by AI assistants',
    reason: 'Your business rarely shows up when AI tools recommend local services',
    whyItMattersTemplate:
      "More and more people are asking AI tools like ChatGPT and Google's AI to recommend local businesses. If your name is not coming up, you are missing a growing source of referrals. AI tools tend to recommend businesses with strong Google profiles, plenty of reviews, and clear information online — improving these gives you a better chance of being named.",
    steps: [
      'Make sure your Google Business Profile is complete with a detailed description, all services listed, and recent photos.',
      'Build up your Google reviews — businesses with more reviews are more likely to be referenced by AI tools.',
      'Ensure your website clearly states your business name, location, and the specific services you offer.',
      'If you have been featured in any local news, directories, or industry sites, ask them to include a link to your website.',
    ],
    outcome: 'Get recommended by AI tools searching for local services',
    requiresSiteSignals: false,
  },
  {
    id: 'no_cta',
    trigger: (b) => b.signals?.engagement?.hasCallToAction === false,
    category: 'Conversion',
    effort: 'low',
    estimatedImpact: 'high',
    timeframe: '1–2 hours',
    action: 'Add a clear "next step" button to your homepage',
    reason: 'Your homepage has no clear action for visitors to take',
    whyItMattersTemplate:
      'When someone lands on your site interested in what you do, they need to be told what to do next. Without a clear button or prompt — "Call us", "Get a free quote", "Book online" — many people simply leave. A single prominent action button is one of the easiest ways to turn more visitors into enquiries.',
    steps: [
      'Decide on the single most valuable action a visitor can take: calling you, filling in a form, or booking online.',
      'Add a prominent button near the top of your homepage with a clear label — "Get a free quote" or "Call us today".',
      'Make the button a contrasting colour so it stands out from the rest of the page.',
      'Repeat the button lower on the page too — not everyone reads from top to bottom.',
    ],
    outcome: 'More calls and enquiries from the same number of visitors',
  },
];

export type ApplyResult = { actions: PriorityAction[]; firedIds: string[] };

/**
 * Run all Tier-1 priority templates against a business and return matching
 * PriorityAction objects (at most 3, numbered starting at 1) along with the
 * `firedIds` array listing every template that triggered — useful for
 * observability and understanding which templates pull weight over time.
 */
export function applyTemplates(b: Business): ApplyResult {
  const actions: PriorityAction[] = [];
  const firedIds: string[] = [];
  // When on-site extraction failed, signal-dependent triggers are unreliable
  // (empty arrays look the same as "missing" vs "truly absent"), so skip them.
  const extractFailed = Boolean(b.enrichmentErrors?.extract);

  for (const tpl of PRIORITY_TEMPLATES) {
    if (extractFailed && tpl.requiresSiteSignals !== false) continue;
    if (!tpl.trigger(b)) continue;

    firedIds.push(tpl.id);

    if (actions.length < 5) {
      actions.push({
        id: '',
        status: 'active',
        priority: (actions.length + 1) as PriorityAction['priority'],
        category: tpl.category,
        effort: tpl.effort,
        estimatedImpact: tpl.estimatedImpact,
        timeframe: tpl.timeframe,
        action: tpl.action,
        reason: tpl.reason,
        whyItMatters: tpl.whyItMattersTemplate,
        steps: tpl.steps,
        outcome: tpl.outcome,
        competitorReference: null,
        _source: 'template',
      });
    }
  }

  return { actions, firedIds };
}

export type ApplyWithHistoryResult = {
  actions: PriorityAction[];
  firedIds: string[];
  closedFromLastWeek: string[];
};

/**
 * Like `applyTemplates`, but participates in the continuity story:
 * - Sets `continuityNote: 'Still outstanding from last week.'` on template actions
 *   that also appeared in `previousActions` (matched by category + substring).
 * - Computes `closedFromLastWeek`: headlines of previous actions whose category
 *   matches a known template category but whose template no longer fires this week,
 *   indicating the user likely fixed the underlying issue.
 */
export function applyTemplatesWithHistory(
  b: Business,
  previousActions: PriorityAction[],
): ApplyWithHistoryResult {
  const actions: PriorityAction[] = [];
  const firedIds: string[] = [];
  const extractFailed = Boolean(b.enrichmentErrors?.extract);

  for (const tpl of PRIORITY_TEMPLATES) {
    if (extractFailed && tpl.requiresSiteSignals !== false) continue;
    if (!tpl.trigger(b)) continue;

    firedIds.push(tpl.id);

    if (actions.length < 5) {
      // Check if this template was also present last week
      const actionLower = tpl.action.toLowerCase();
      const wasPresent = previousActions.some(
        (prev) =>
          prev.category === tpl.category &&
          (prev.action.toLowerCase().includes(actionLower) ||
            actionLower.includes(prev.action.toLowerCase())),
      );

      actions.push({
        id: '',
        status: 'active',
        priority: (actions.length + 1) as PriorityAction['priority'],
        category: tpl.category,
        effort: tpl.effort,
        estimatedImpact: tpl.estimatedImpact,
        timeframe: tpl.timeframe,
        action: tpl.action,
        reason: tpl.reason,
        whyItMatters: tpl.whyItMattersTemplate,
        steps: tpl.steps,
        outcome: tpl.outcome,
        competitorReference: null,
        continuityNote: wasPresent ? 'Still outstanding from last week.' : null,
        _source: 'template',
      });
    }
  }

  // Compute closedFromLastWeek: previous actions whose category matches a template
  // that no longer fires (user likely fixed the gap)
  const templateCategories = new Set(PRIORITY_TEMPLATES.map((t) => t.category));
  const closedFromLastWeek: string[] = previousActions
    .filter(
      (prev) =>
        templateCategories.has(prev.category) &&
        !firedIds.some((id) => {
          const tpl = PRIORITY_TEMPLATES.find((t) => t.id === id);
          return tpl && tpl.category === prev.category;
        }),
    )
    .map((prev) => prev.action);

  return { actions, firedIds, closedFromLastWeek };
}

/** Diagnostic: which templates would fire for this business? */
export function diagnoseTemplates(b: Business): { id: string; fired: boolean }[] {
  return PRIORITY_TEMPLATES.map((tpl) => ({ id: tpl.id, fired: tpl.trigger(b) }));
}
