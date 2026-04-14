import type { TrustpilotData } from '@/types';
import { startCrawl, pollCrawlStatus, getCrawlResults } from '@/services/crawl';

interface CFCredentials {
  accountId: string;
  apiToken: string;
}

function extractBaseDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  }
}

const NULL_RESULT: TrustpilotData = {
  trustpilotRating: null,
  trustpilotReviewCount: null,
  trustpilotTrustScore: null,
  recentTrustpilotReviews: [],
};

export async function getTrustpilotData(
  domain: string,
  cfCredentials: CFCredentials
): Promise<TrustpilotData> {
  const baseDomain = extractBaseDomain(domain);
  const trustpilotUrl = `https://www.trustpilot.com/review/${baseDomain}`;

  let jobId: string;
  try {
    jobId = await startCrawl(
      trustpilotUrl,
      {
        maxDepth: 0,
        maxPages: 1,
        outputFormats: ['json'],
        jsonOptions: {
          prompt:
            'Extract: trustpilotRating (number), trustpilotReviewCount (number), trustpilotTrustScore (string like "Excellent"), and recentTrustpilotReviews as array of {rating, title, date}. Return ONLY valid JSON. If no page found return all nulls.',
        },
      },
      cfCredentials
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('robots.txt') || msg.includes('400') || msg.includes('403')) {
      console.warn(`[enrich-trustpilot] Skipping ${trustpilotUrl} — blocked: ${msg}`);
      return NULL_RESULT;
    }
    throw e;
  }

  // Poll until complete (max 60s)
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const { status } = await pollCrawlStatus(jobId, cfCredentials);
    if (status === 'completed') break;
    if (
      status === 'errored' ||
      status === 'cancelled_due_to_timeout' ||
      status === 'cancelled_due_to_limits' ||
      status === 'cancelled_by_user'
    ) {
      return NULL_RESULT;
    }
    if (i === maxAttempts - 1) return NULL_RESULT;
  }

  const result = await getCrawlResults(jobId, cfCredentials);
  const page = result.pages[0];
  if (!page?.json) return NULL_RESULT;

  const raw = page.json as Partial<TrustpilotData & { recentTrustpilotReviews: unknown }>;

  return {
    trustpilotRating: typeof raw.trustpilotRating === 'number' ? raw.trustpilotRating : null,
    trustpilotReviewCount:
      typeof raw.trustpilotReviewCount === 'number' ? raw.trustpilotReviewCount : null,
    trustpilotTrustScore:
      typeof raw.trustpilotTrustScore === 'string' ? raw.trustpilotTrustScore : null,
    recentTrustpilotReviews: Array.isArray(raw.recentTrustpilotReviews)
      ? (raw.recentTrustpilotReviews as TrustpilotData['recentTrustpilotReviews'])
      : [],
  };
}
