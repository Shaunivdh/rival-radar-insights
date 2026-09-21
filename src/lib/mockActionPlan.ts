import type { PriorityAction } from '@/types';

/**
 * Dev-only sample action plan. Used by the Action Plan view as a fallback when the
 * store has no real priority actions (e.g. a freshly seeded project), so the page
 * can be previewed with realistic content. Never served in production.
 */
export const MOCK_PRIORITY_ACTIONS: PriorityAction[] = [
  {
    id: 'mock-ai-visibility',
    priority: 1,
    status: 'active',
    category: 'AI Visibility',
    effort: 'medium',
    action: "You're invisible to AI assistants right now",
    reason: 'Not mentioned in any of 8 AI answers for your core services',
    whyItMatters:
      'More customers are asking ChatGPT and Google’s AI for local recommendations before they ever search. Two of your competitors already show up in those answers, so if you’re not mentioned you’re missing buyers at the exact moment they’re choosing who to call.',
    steps: [
      'Add clear, plain-language service descriptions to your homepage and service pages',
      'Publish an FAQ that answers the questions customers actually ask',
      'Make sure your business name, area, and services appear together in your page copy',
      'Add LocalBusiness schema markup so AI can parse your details',
    ],
    outcome: 'Start appearing in AI-generated recommendations',
    competitorReference: 'AquaFix and DrainMaster are both recommended by ChatGPT for your area.',
    estimatedImpact: 'high',
    timeframe: '2 to 3 hours',
    continuityNote: 'Still outstanding from last week',
  },
  {
    id: 'mock-review-replies',
    priority: 1,
    status: 'active',
    category: 'Review Replies',
    effort: 'low',
    action: 'Reply to 12 Google reviews waiting on you',
    reason: '12 unanswered reviews, including 3 from the last 30 days',
    whyItMatters:
      'Replying to reviews is one of the strongest trust signals Google looks at, and customers read your responses when deciding. A quick, warm reply, even to positive reviews, lifts your reputation score and shows you’re active and responsive.',
    steps: [
      'Reply to the 3 most recent reviews first',
      'Thank happy customers by name and keep it genuine',
      'For any critical review, acknowledge it and offer to make it right',
    ],
    outcome: 'Lift your reputation score and win back trust',
    competitorReference: 'Your top competitor replies to ~90% of their reviews within 48 hours.',
    estimatedImpact: 'high',
    timeframe: '30 to 45 mins',
    continuityNote: null,
  },
  {
    id: 'mock-local-seo',
    priority: 2,
    status: 'active',
    category: 'Local SEO',
    effort: 'medium',
    action: 'Climb out of the local pack’s back row',
    reason: 'Ranking #5 for your main "near me" search',
    whyItMatters:
      'The top 3 map results get the overwhelming majority of clicks and calls. You’re close, and a few focused improvements to your profile and citations could move you into that pack and noticeably increase inbound enquiries.',
    steps: [
      'Add your primary service as a category on your Google Business Profile',
      'Get 3 to 4 recent reviews that mention the service and your town',
      'Make sure your name, address and phone match everywhere online',
    ],
    outcome: 'Move into the top 3 map results',
    competitorReference: 'The #2 result has 40% fewer reviews than you, so this is winnable.',
    estimatedImpact: 'medium',
    timeframe: '1 to 2 hours',
    continuityNote: null,
  },
  {
    id: 'mock-website-speed',
    priority: 2,
    status: 'active',
    category: 'Website',
    effort: 'medium',
    action: 'Speed up your mobile site',
    reason: 'Mobile pages take 2.8s to load, slower than 70% of local rivals',
    whyItMatters:
      'Most of your visitors are on their phones, and every extra second of load time loses roughly 10% of them before the page even appears. A faster site keeps more people around long enough to call or book.',
    steps: [
      'Compress and correctly size your largest images',
      'Remove any unused scripts or plugins on the homepage',
      'Enable browser caching and a simple CDN if your host supports it',
    ],
    outcome: 'Keep more visitors and improve your website score',
    competitorReference: null,
    estimatedImpact: 'medium',
    timeframe: '1 to 2 hours',
    continuityNote: null,
  },
  {
    id: 'mock-gbp-photos',
    priority: 4,
    status: 'active',
    category: 'Conversion',
    effort: 'low',
    action: 'Add a few more photos to your Google profile',
    reason: 'Only 4 photos, and profiles with 10+ get noticeably more clicks',
    whyItMatters:
      'Photos are often the first thing people see and they build instant trust. Businesses with more, recent photos get more profile views and direction requests, at basically no cost to you.',
    steps: [
      'Upload 6 to 8 recent photos of your team, work and vehicles',
      'Include at least one clear exterior shot',
      'Set a strong, well-lit image as your cover photo',
    ],
    outcome: 'More profile views and clicks through to you',
    competitorReference: null,
    estimatedImpact: 'low',
    timeframe: '15 mins',
    continuityNote: null,
  },
  {
    id: 'mock-hours',
    priority: 5,
    status: 'active',
    category: 'Trust',
    effort: 'low',
    action: 'Pop in your bank-holiday hours',
    reason: 'No special hours set for the upcoming holiday',
    whyItMatters:
      'When your hours look wrong or uncertain, people call the competitor who looks open. Setting holiday hours takes a minute and avoids losing ready-to-buy customers over a small detail.',
    steps: [
      'Open the "Special hours" section of your Google Business Profile',
      'Set your hours for the next public holiday',
    ],
    outcome: 'Avoid losing customers to unclear availability',
    competitorReference: null,
    estimatedImpact: 'low',
    timeframe: '5 mins',
    continuityNote: null,
  },
];
