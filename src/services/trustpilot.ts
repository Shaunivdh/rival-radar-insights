import type { TrustpilotData } from '@/types';

export async function getTrustpilotData(_domain: string): Promise<TrustpilotData> {
  // TODO: Crawl trustpilot.com/review/{domain} with maxPages:1
  console.log('getTrustpilotData stub called');
  throw new Error('Not implemented — use mock data');
}
