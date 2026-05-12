import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { crawlBusinessFunction } from '@/inngest/crawl-worker';
import { crawlHealthCheckFunction } from '@/inngest/crawl-health-check';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [crawlBusinessFunction, crawlHealthCheckFunction],
});
