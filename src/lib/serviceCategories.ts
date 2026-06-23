export type ServiceCategory =
  | 'accounting'
  | 'veterinary'
  | 'legal'
  | 'healthcare'
  | 'dental'
  | 'real_estate'
  | 'construction'
  | 'hospitality'
  | 'retail'
  | 'beauty'
  | 'tattoo'
  | 'fitness'
  | 'education'
  | 'it_services'
  | 'marketing'
  | 'cleaning'
  | 'automotive'
  | 'trades'
  | 'petcare'
  | 'photography'
  | 'childcare'
  | 'events'
  | 'other';

export interface ServiceCategoryConfig {
  label: string;
  /**
   * Natural-language phrase used to build the Google Maps SERP query (e.g. "tattoo studio Brighton"),
   * keeping queries human instead of the raw category key (which gave "it_services Brighton").
   */
  searchTerm: string;
  /** Dashboard sections to surface prominently for this industry */
  dashboardPriority: string[];
  /** Signal keys to highlight in the competitor comparison */
  keyMetrics: string[];
  /** Conversational query templates for AI visibility checks. Use {service} and {location} as placeholders. */
  aiQueryTemplates: string[];
  /** Country modifier appended to AI visibility queries (e.g. 'UK', 'Ireland'). */
  countryModifier: string;
}

/** Fallback templates used when a category doesn't define its own. */
export const GENERIC_AI_QUERY_TEMPLATES = [
  'Best {service} in {location}',
  'Top rated {service} near {location}',
  'Who would you recommend for {service} in {location}',
];

export const SERVICE_CATEGORIES: Record<ServiceCategory, ServiceCategoryConfig> = {
  accounting: {
    label: 'Accounting & Finance',
    searchTerm: 'accountant',
    dashboardPriority: ['reviews', 'local_visibility', 'website_health'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
    aiQueryTemplates: GENERIC_AI_QUERY_TEMPLATES,
    countryModifier: 'UK',
  },
  veterinary: {
    label: 'Veterinary & Animal Care',
    searchTerm: 'vet',
    dashboardPriority: ['reviews', 'gbp_completeness', 'local_visibility'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
    aiQueryTemplates: [
      'Best vet near {location}',
      'Where should I take my dog in {location}',
      'Top rated {service} in {location}',
      'Emergency vet open now near {location}',
    ],
    countryModifier: 'UK',
  },
  legal: {
    label: 'Legal Services',
    searchTerm: 'solicitor',
    dashboardPriority: ['reviews', 'website_health', 'local_visibility'],
    keyMetrics: ['reviews', 'website_health', 'local_visibility'],
    aiQueryTemplates: GENERIC_AI_QUERY_TEMPLATES,
    countryModifier: 'UK',
  },
  healthcare: {
    label: 'Healthcare & Medical',
    searchTerm: 'doctor',
    dashboardPriority: ['reviews', 'gbp_completeness', 'local_visibility'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
    aiQueryTemplates: [
      'Best {service} in {location}',
      'Where can I see a doctor quickly in {location}',
      'Top rated clinic near {location}',
      'Walk-in {service} open today in {location}',
    ],
    countryModifier: 'UK',
  },
  dental: {
    label: 'Dental',
    searchTerm: 'dentist',
    dashboardPriority: ['reviews', 'gbp_completeness', 'local_visibility'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
    aiQueryTemplates: [
      'Best dentist in {location}',
      'Top rated {service} near {location}',
      'Emergency dentist open now in {location}',
      'Who would you recommend for dental work in {location}',
    ],
    countryModifier: 'UK',
  },
  real_estate: {
    label: 'Real Estate & Property',
    searchTerm: 'estate agent',
    dashboardPriority: ['website_health', 'reviews', 'local_visibility'],
    keyMetrics: ['website_health', 'reviews', 'local_visibility'],
    aiQueryTemplates: GENERIC_AI_QUERY_TEMPLATES,
    countryModifier: 'UK',
  },
  construction: {
    label: 'Construction & Building',
    searchTerm: 'builder',
    dashboardPriority: ['reviews', 'local_visibility', 'website_health'],
    keyMetrics: ['reviews', 'local_visibility', 'gbp_completeness'],
    aiQueryTemplates: [
      'Who can fix a leak fast in {location}',
      'Best {service} near {location}',
      'Reliable plumber or builder in {location}',
      'Emergency {service} available today in {location}',
    ],
    countryModifier: 'UK',
  },
  hospitality: {
    label: 'Hospitality & Restaurants',
    searchTerm: 'restaurant',
    dashboardPriority: ['reviews', 'gbp_completeness', 'local_visibility'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
    aiQueryTemplates: [
      'Best place to eat in {location}',
      'Top rated {service} near {location}',
      'Where should I go for brunch in {location}',
      'Cosy café or restaurant in {location}',
    ],
    countryModifier: 'UK',
  },
  retail: {
    label: 'Retail',
    searchTerm: 'shop',
    dashboardPriority: ['website_health', 'reviews', 'local_visibility'],
    keyMetrics: ['website_health', 'reviews', 'local_visibility'],
    aiQueryTemplates: GENERIC_AI_QUERY_TEMPLATES,
    countryModifier: 'UK',
  },
  beauty: {
    label: 'Beauty, Hair & Salons',
    searchTerm: 'beauty salon',
    dashboardPriority: ['reviews', 'gbp_completeness', 'local_visibility'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
    aiQueryTemplates: [
      'Best {service} in {location}',
      'Top rated {service} near {location}',
      'Where should I get my nails done in {location}',
    ],
    countryModifier: 'UK',
  },
  tattoo: {
    label: 'Tattoo & Body Art',
    searchTerm: 'tattoo studio',
    dashboardPriority: ['reviews', 'gbp_completeness', 'local_visibility'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
    aiQueryTemplates: [
      'Best tattoo studio in {location}',
      'Top rated tattoo artist near {location}',
      'Where should I get a tattoo in {location}',
      'Who would you recommend for a tattoo in {location}',
    ],
    countryModifier: 'UK',
  },
  fitness: {
    label: 'Fitness & Gyms',
    searchTerm: 'gym',
    dashboardPriority: ['reviews', 'website_health', 'local_visibility'],
    keyMetrics: ['reviews', 'website_health', 'local_visibility'],
    aiQueryTemplates: GENERIC_AI_QUERY_TEMPLATES,
    countryModifier: 'UK',
  },
  education: {
    label: 'Education & Tutoring',
    searchTerm: 'tutor',
    dashboardPriority: ['website_health', 'reviews', 'local_visibility'],
    keyMetrics: ['website_health', 'reviews', 'local_visibility'],
    aiQueryTemplates: GENERIC_AI_QUERY_TEMPLATES,
    countryModifier: 'UK',
  },
  it_services: {
    label: 'IT Services & Tech',
    searchTerm: 'IT support',
    dashboardPriority: ['website_health', 'reviews', 'local_visibility'],
    keyMetrics: ['website_health', 'reviews', 'local_visibility'],
    aiQueryTemplates: [
      'Best {service} near {location}',
      'Who fixes computers in {location}',
      'Reliable IT support company in {location}',
      'Top rated tech help near {location}',
    ],
    countryModifier: 'UK',
  },
  marketing: {
    label: 'Marketing & Agencies',
    searchTerm: 'marketing agency',
    dashboardPriority: ['website_health', 'reviews', 'local_visibility'],
    keyMetrics: ['website_health', 'reviews', 'local_visibility'],
    aiQueryTemplates: GENERIC_AI_QUERY_TEMPLATES,
    countryModifier: 'UK',
  },
  cleaning: {
    label: 'Cleaning Services',
    searchTerm: 'cleaner',
    dashboardPriority: ['reviews', 'gbp_completeness', 'local_visibility'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
    aiQueryTemplates: [
      'Best {service} in {location}',
      'Who does a good deep clean in {location}',
      'Reliable cleaner near {location}',
      'Top rated {service} available this week in {location}',
    ],
    countryModifier: 'UK',
  },
  automotive: {
    label: 'Automotive & Car Services',
    searchTerm: 'car garage',
    dashboardPriority: ['reviews', 'local_visibility', 'gbp_completeness'],
    keyMetrics: ['reviews', 'local_visibility', 'gbp_completeness'],
    aiQueryTemplates: [
      'Best garage in {location}',
      'Top rated mechanic near {location}',
      'Where can I get my car serviced in {location}',
      'Who would you recommend for car repairs in {location}',
    ],
    countryModifier: 'UK',
  },
  trades: {
    label: 'Home Services & Trades',
    searchTerm: 'tradesperson',
    dashboardPriority: ['reviews', 'local_visibility', 'gbp_completeness'],
    keyMetrics: ['reviews', 'local_visibility', 'gbp_completeness'],
    aiQueryTemplates: [
      'Best plumber in {location}',
      'Reliable electrician near {location}',
      'Who would you recommend for home repairs in {location}',
      'Emergency tradesperson available in {location}',
    ],
    countryModifier: 'UK',
  },
  petcare: {
    label: 'Pet Services & Grooming',
    searchTerm: 'dog groomer',
    dashboardPriority: ['reviews', 'gbp_completeness', 'local_visibility'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
    aiQueryTemplates: [
      'Best dog groomer in {location}',
      'Top rated pet services near {location}',
      'Where can I get my dog groomed in {location}',
      'Who would you recommend for pet care in {location}',
    ],
    countryModifier: 'UK',
  },
  photography: {
    label: 'Photography',
    searchTerm: 'photographer',
    dashboardPriority: ['website_health', 'reviews', 'local_visibility'],
    keyMetrics: ['website_health', 'reviews', 'local_visibility'],
    aiQueryTemplates: [
      'Best photographer in {location}',
      'Top rated wedding photographer near {location}',
      'Who would you recommend for a photoshoot in {location}',
    ],
    countryModifier: 'UK',
  },
  childcare: {
    label: 'Childcare & Nurseries',
    searchTerm: 'nursery',
    dashboardPriority: ['reviews', 'gbp_completeness', 'local_visibility'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
    aiQueryTemplates: [
      'Best nursery in {location}',
      'Top rated childcare near {location}',
      'Who would you recommend for childcare in {location}',
    ],
    countryModifier: 'UK',
  },
  events: {
    label: 'Events & Entertainment',
    searchTerm: 'event venue',
    dashboardPriority: ['website_health', 'reviews', 'local_visibility'],
    keyMetrics: ['website_health', 'reviews', 'local_visibility'],
    aiQueryTemplates: [
      'Best event venue in {location}',
      'Top rated caterer near {location}',
      'Who would you recommend for events in {location}',
    ],
    countryModifier: 'UK',
  },
  other: {
    label: 'Other',
    searchTerm: 'local business',
    dashboardPriority: ['reviews', 'website_health', 'local_visibility'],
    keyMetrics: ['reviews', 'website_health', 'local_visibility'],
    aiQueryTemplates: GENERIC_AI_QUERY_TEMPLATES,
    countryModifier: 'UK',
  },
};

export const SERVICE_CATEGORY_OPTIONS = (Object.keys(SERVICE_CATEGORIES) as ServiceCategory[]).map(
  (key) => ({ value: key, label: SERVICE_CATEGORIES[key].label }),
);
