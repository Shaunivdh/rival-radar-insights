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
}

export const SERVICE_CATEGORIES: Record<ServiceCategory, ServiceCategoryConfig> = {
  accounting: {
    label: 'Accounting & Finance',
    dashboardPriority: ['reviews', 'local_visibility', 'website_health'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
  },
  veterinary: {
    label: 'Veterinary & Animal Care',
    dashboardPriority: ['reviews', 'gbp_completeness', 'local_visibility'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
  },
  legal: {
    label: 'Legal Services',
    dashboardPriority: ['reviews', 'website_health', 'local_visibility'],
    keyMetrics: ['reviews', 'website_health', 'local_visibility'],
  },
  healthcare: {
    label: 'Healthcare & Medical',
    dashboardPriority: ['reviews', 'gbp_completeness', 'local_visibility'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
  },
  dental: {
    label: 'Dental',
    dashboardPriority: ['reviews', 'gbp_completeness', 'local_visibility'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
  },
  real_estate: {
    label: 'Real Estate & Property',
    dashboardPriority: ['website_health', 'reviews', 'local_visibility'],
    keyMetrics: ['website_health', 'reviews', 'local_visibility'],
  },
  construction: {
    label: 'Construction & Building',
    dashboardPriority: ['reviews', 'local_visibility', 'website_health'],
    keyMetrics: ['reviews', 'local_visibility', 'gbp_completeness'],
  },
  hospitality: {
    label: 'Hospitality & Restaurants',
    dashboardPriority: ['reviews', 'gbp_completeness', 'local_visibility'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
  },
  retail: {
    label: 'Retail',
    dashboardPriority: ['website_health', 'reviews', 'local_visibility'],
    keyMetrics: ['website_health', 'reviews', 'local_visibility'],
  },
  beauty: {
    label: 'Beauty, Hair & Salons',
    dashboardPriority: ['reviews', 'gbp_completeness', 'local_visibility'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
  },
  fitness: {
    label: 'Fitness & Gyms',
    dashboardPriority: ['reviews', 'website_health', 'local_visibility'],
    keyMetrics: ['reviews', 'website_health', 'local_visibility'],
  },
  education: {
    label: 'Education & Tutoring',
    dashboardPriority: ['website_health', 'reviews', 'local_visibility'],
    keyMetrics: ['website_health', 'reviews', 'local_visibility'],
  },
  it_services: {
    label: 'IT Services & Tech',
    dashboardPriority: ['website_health', 'reviews', 'local_visibility'],
    keyMetrics: ['website_health', 'reviews', 'local_visibility'],
  },
  marketing: {
    label: 'Marketing & Agencies',
    dashboardPriority: ['website_health', 'reviews', 'local_visibility'],
    keyMetrics: ['website_health', 'reviews', 'local_visibility'],
  },
  cleaning: {
    label: 'Cleaning Services',
    dashboardPriority: ['reviews', 'gbp_completeness', 'local_visibility'],
    keyMetrics: ['reviews', 'gbp_completeness', 'local_visibility'],
  },
  other: {
    label: 'Other',
    dashboardPriority: ['reviews', 'website_health', 'local_visibility'],
    keyMetrics: ['reviews', 'website_health', 'local_visibility'],
  },
};

export const SERVICE_CATEGORY_OPTIONS = (Object.keys(SERVICE_CATEGORIES) as ServiceCategory[]).map(
  (key) => ({ value: key, label: SERVICE_CATEGORIES[key].label })
);
