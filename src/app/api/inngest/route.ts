import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { crawlBusinessFunction } from '@/inngest/crawl-worker';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [crawlBusinessFunction],
});
