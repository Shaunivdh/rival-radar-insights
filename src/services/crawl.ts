import type { CrawlOptions, RawCrawlResult } from '@/types';

const USE_MOCK = process.env.USE_MOCK_CRAWL === 'true';
const mock = USE_MOCK ? (require('@/services/crawl.mock') as typeof import('@/services/crawl.mock')) : null;

interface CrawlCredentials {
  accountId: string;
  apiToken: string;
}

function cfBase(accountId: string) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering`;
}

function cfHeaders(apiToken: string) {
  return { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' };
}

export async function startCrawl(
  url: string,
  options: CrawlOptions,
  credentials: CrawlCredentials
): Promise<string> {
  if (USE_MOCK) return mock!.startCrawl(url, options, credentials);

  const res = await fetch(`${cfBase(credentials.accountId)}/crawl`, {
    method: 'POST',
    headers: cfHeaders(credentials.apiToken),
    body: JSON.stringify({
      url,
      render: options.render ?? false,
      limit: options.maxPages ?? 20,
      maxDepth: options.maxDepth ?? 2,
      ...(options.jsonOptions ? { jsonOptions: options.jsonOptions } : {}),
      ...(options.modifiedSince ? { modifiedSince: options.modifiedSince } : {}),
    }),
  });

  if (!res.ok) throw new Error(`CF crawl start failed: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as { success: boolean; result: string };
  if (!data.success) throw new Error('CF crawl start: success=false');
  return data.result;
}

export async function pollCrawlStatus(
  jobId: string,
  credentials: CrawlCredentials
): Promise<{ status: string }> {
  if (USE_MOCK) return mock!.pollCrawlStatus(jobId, credentials);

  const res = await fetch(`${cfBase(credentials.accountId)}/crawl/${jobId}?limit=1`, {
    headers: cfHeaders(credentials.apiToken),
  });

  if (!res.ok) throw new Error(`CF poll failed: ${res.status}`);

  const data = (await res.json()) as { success: boolean; result: { status: string } };
  return { status: data.result.status };
}

export async function getCrawlResults(
  jobId: string,
  credentials: CrawlCredentials
): Promise<RawCrawlResult> {
  if (USE_MOCK) return mock!.getCrawlResults(jobId, credentials);

  const res = await fetch(`${cfBase(credentials.accountId)}/crawl/${jobId}`, {
    headers: cfHeaders(credentials.apiToken),
  });

  if (!res.ok) throw new Error(`CF results failed: ${res.status}`);

  const data = (await res.json()) as {
    success: boolean;
    result: {
      status: RawCrawlResult['status'];
      records: Array<{ url: string; json?: Record<string, unknown>; markdown?: string; html?: string }>;
    };
  };
  if (!data.success) throw new Error('CF get results: success=false');
  return {
    status: data.result.status,
    pages: data.result.records ?? [],
  };
}

export async function startIncrementalCrawl(
  url: string,
  modifiedSince: number,
  credentials: CrawlCredentials
): Promise<string> {
  return startCrawl(
    url,
    {
      maxDepth: 2,
      maxPages: 10,
      render: false,
      outputFormats: ['json', 'markdown'],
      modifiedSince,
    },
    credentials
  );
}
