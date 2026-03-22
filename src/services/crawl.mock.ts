import type { CrawlOptions, RawCrawlResult } from '@/types';

let jobCounter = 0;

const MOCK_PAGES: RawCrawlResult['pages'] = [
  {
    url: 'https://example.com',
    markdown: '# Example Business\n\nWe offer great services at competitive prices.',
    json: { title: 'Example Business', description: 'Great services' },
  },
  {
    url: 'https://example.com/pricing',
    markdown: '## Pricing\n\n- Basic: $9/mo\n- Pro: $29/mo\n- Enterprise: $99/mo',
    json: { title: 'Pricing', plans: ['Basic', 'Pro', 'Enterprise'] },
  },
];

export async function startCrawl(
  url: string,
  _options: CrawlOptions,
  _credentials: { accountId: string; apiToken: string }
): Promise<string> {
  const jobId = `mock-job-${++jobCounter}-${Date.now()}`;
  console.log(`[mock crawl] startCrawl url=${url} → jobId=${jobId}`);
  return jobId;
}

export async function pollCrawlStatus(
  jobId: string,
  _credentials: { accountId: string; apiToken: string }
): Promise<{ status: string }> {
  console.log(`[mock crawl] pollCrawlStatus jobId=${jobId} → completed`);
  return { status: 'completed' };
}

export async function getCrawlResults(
  jobId: string,
  _credentials: { accountId: string; apiToken: string }
): Promise<RawCrawlResult> {
  console.log(`[mock crawl] getCrawlResults jobId=${jobId}`);
  return { status: 'completed', pages: MOCK_PAGES };
}

export async function startIncrementalCrawl(
  url: string,
  _modifiedSince: number,
  credentials: { accountId: string; apiToken: string }
): Promise<string> {
  return startCrawl(url, { maxDepth: 2, maxPages: 10, render: false, outputFormats: ['json', 'markdown'] }, credentials);
}
