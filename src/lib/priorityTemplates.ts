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
      return !reviews.some((r) => r.time * 1000 > ninetyDaysAgo);
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

  for (const tpl of PRIORITY_TEMPLATES) {
    if (!tpl.trigger(b)) continue;

    firedIds.push(tpl.id);

    if (actions.length < 3) {
      actions.push({
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
  previousActions: PriorityAction[]
): ApplyWithHistoryResult {
  const actions: PriorityAction[] = [];
  const firedIds: string[] = [];

  for (const tpl of PRIORITY_TEMPLATES) {
    if (!tpl.trigger(b)) continue;

    firedIds.push(tpl.id);

    if (actions.length < 3) {
      // Check if this template was also present last week
      const actionLower = tpl.action.toLowerCase();
      const wasPresent = previousActions.some(
        (prev) =>
          prev.category === tpl.category &&
          (prev.action.toLowerCase().includes(actionLower) ||
            actionLower.includes(prev.action.toLowerCase()))
      );

      actions.push({
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
        })
    )
    .map((prev) => prev.action);

  return { actions, firedIds, closedFromLastWeek };
}

/** Diagnostic: which templates would fire for this business? */
export function diagnoseTemplates(b: Business): { id: string; fired: boolean }[] {
  return PRIORITY_TEMPLATES.map((tpl) => ({ id: tpl.id, fired: tpl.trigger(b) }));
}
