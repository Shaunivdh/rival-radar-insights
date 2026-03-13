import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { crawlBusinessFunction, weeklyIncrementalCrawl } from '@/inngest/crawl-worker';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [crawlBusinessFunction, weeklyIncrementalCrawl],
});
