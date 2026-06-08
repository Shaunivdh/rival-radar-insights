import type { PageSpeedData, PageSpeedMetrics } from '@/types';

const PSI_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

async function fetchStrategy(
  url: string,
  strategy: 'mobile' | 'desktop',
): Promise<PageSpeedMetrics> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  const keyParam = apiKey ? `&key=${apiKey}` : '';
  const res = await fetch(
    `${PSI_BASE}?url=${encodeURIComponent(url)}&strategy=${strategy}${keyParam}`,
    {
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(`PSI ${strategy} returned ${res.status}`);

  const json = await res.json();
  const audits = json?.lighthouseResult?.audits ?? {};
  const perfScore = json?.lighthouseResult?.categories?.performance?.score ?? null;

  return {
    performanceScore: perfScore !== null ? Math.round(perfScore * 100) : 0,
    lcp: audits['largest-contentful-paint']?.numericValue ?? null,
    cls: audits['cumulative-layout-shift']?.numericValue ?? null,
    inp: audits['interaction-to-next-paint']?.numericValue ?? null,
    fcp: audits['first-contentful-paint']?.numericValue ?? null,
  };
}

export async function fetchPageSpeedData(url: string): Promise<PageSpeedData> {
  const [mobile, desktop] = await Promise.all([
    fetchStrategy(url, 'mobile'),
    fetchStrategy(url, 'desktop'),
  ]);
  return { mobile, desktop, fetchedAt: new Date().toISOString() };
}
