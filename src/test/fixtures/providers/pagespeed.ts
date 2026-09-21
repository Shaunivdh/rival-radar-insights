/** Recorded-shape PageSpeed Insights v5 response (trimmed). */
export const psiResponse = (strategy: 'mobile' | 'desktop') => ({
  id: 'https://acme-plumbing.test/',
  lighthouseResult: {
    requestedUrl: 'https://acme-plumbing.test/',
    configSettings: { formFactor: strategy },
    categories: { performance: { id: 'performance', score: strategy === 'mobile' ? 0.62 : 0.91 } },
    audits: {
      'largest-contentful-paint': { id: 'largest-contentful-paint', numericValue: 2800 },
      'cumulative-layout-shift': { id: 'cumulative-layout-shift', numericValue: 0.05 },
      'interaction-to-next-paint': { id: 'interaction-to-next-paint', numericValue: 180 },
      'first-contentful-paint': { id: 'first-contentful-paint', numericValue: 1400 },
    },
  },
});
