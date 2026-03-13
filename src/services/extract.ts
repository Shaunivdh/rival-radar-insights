import type { RawCrawlResult, ExtractedSignals } from '@/types';

export async function extractSignals(_rawResult: RawCrawlResult): Promise<ExtractedSignals> {
  // TODO: Parse jsonOptions JSON from crawl result
  console.log('extractSignals stub called');
  throw new Error('Not implemented — use mock data');
}
