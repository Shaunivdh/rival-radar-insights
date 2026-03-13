import type { CrawlOptions, RawCrawlResult } from '@/types';

export async function startCrawl(_url: string, _options: CrawlOptions): Promise<string> {
  // TODO: Implement Cloudflare /crawl API call
  console.log('startCrawl stub called');
  return 'stub-job-id';
}

export async function pollCrawlStatus(_jobId: string): Promise<{ status: string }> {
  // TODO: Poll GET /crawl/{jobId}?limit=1
  console.log('pollCrawlStatus stub called');
  return { status: 'completed' };
}

export async function getCrawlResults(_jobId: string): Promise<RawCrawlResult> {
  // TODO: GET /crawl/{jobId}
  console.log('getCrawlResults stub called');
  return { status: 'completed', pages: [] };
}

export async function startIncrementalCrawl(_url: string, _modifiedSince: number): Promise<string> {
  // TODO: Same as startCrawl but with modifiedSince
  console.log('startIncrementalCrawl stub called');
  return 'stub-incremental-job-id';
}
