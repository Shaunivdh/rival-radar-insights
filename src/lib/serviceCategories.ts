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
  | 'fitness'
  | 'education'
  | 'it_services'
  | 'marketing'
  | 'cleaning'
  | 'other';

export interface ServiceCategoryConfig {
  label: string;
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
    dashboardPriority: ['reviews', 'local_visibility', 'website_health'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
    aiQueryTemplates: GENERIC_AI_QUERY_TEMPLATES,
    countryModifier: 'UK',
  },
  veterinary: {
    label: 'Veterinary & Animal Care',
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
    dashboardPriority: ['reviews', 'website_health', 'local_visibility'],
    keyMetrics: ['reviews', 'website_health', 'local_visibility'],
    aiQueryTemplates: GENERIC_AI_QUERY_TEMPLATES,
    countryModifier: 'UK',
  },
  healthcare: {
    label: 'Healthcare & Medical',
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
    dashboardPriority: ['website_health', 'reviews', 'local_visibility'],
    keyMetrics: ['website_health', 'reviews', 'local_visibility'],
    aiQueryTemplates: GENERIC_AI_QUERY_TEMPLATES,
    countryModifier: 'UK',
  },
  construction: {
    label: 'Construction & Building',
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
    dashboardPriority: ['website_health', 'reviews', 'local_visibility'],
    keyMetrics: ['website_health', 'reviews', 'local_visibility'],
    aiQueryTemplates: GENERIC_AI_QUERY_TEMPLATES,
    countryModifier: 'UK',
  },
  beauty: {
    label: 'Beauty, Hair & Salons',
    dashboardPriority: ['reviews', 'gbp_completeness', 'local_visibility'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
    aiQueryTemplates: [
      'Best hair salon in {location}',
      'Top rated {service} near {location}',
      'Where should I get my nails done in {location}',
    ],
    countryModifier: 'UK',
  },
  fitness: {
    label: 'Fitness & Gyms',
    dashboardPriority: ['reviews', 'website_health', 'local_visibility'],
    keyMetrics: ['reviews', 'website_health', 'local_visibility'],
    aiQueryTemplates: GENERIC_AI_QUERY_TEMPLATES,
    countryModifier: 'UK',
  },
  education: {
    label: 'Education & Tutoring',
    dashboardPriority: ['website_health', 'reviews', 'local_visibility'],
    keyMetrics: ['website_health', 'reviews', 'local_visibility'],
    aiQueryTemplates: GENERIC_AI_QUERY_TEMPLATES,
    countryModifier: 'UK',
  },
  it_services: {
    label: 'IT Services & Tech',
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
    dashboardPriority: ['website_health', 'reviews', 'local_visibility'],
    keyMetrics: ['website_health', 'reviews', 'local_visibility'],
    aiQueryTemplates: GENERIC_AI_QUERY_TEMPLATES,
    countryModifier: 'UK',
  },
  cleaning: {
    label: 'Cleaning Services',
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
  other: {
    label: 'Other',
    dashboardPriority: ['reviews', 'website_health', 'local_visibility'],
    keyMetrics: ['reviews', 'website_health', 'local_visibility'],
    aiQueryTemplates: GENERIC_AI_QUERY_TEMPLATES,
    countryModifier: 'UK',
  },
};

export const SERVICE_CATEGORY_OPTIONS = (Object.keys(SERVICE_CATEGORIES) as ServiceCategory[]).map(
  (key) => ({ value: key, label: SERVICE_CATEGORIES[key].label })
);
