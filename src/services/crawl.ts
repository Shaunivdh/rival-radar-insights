import type { CrawlOptions, RawCrawlResult } from '@/types';

export interface CrawlCredentials {
  accountId: string;
  apiToken: string;
}

const USE_MOCK = process.env.USE_MOCK_CRAWL === 'true';
const mock = USE_MOCK ? (require('@/services/crawl.mock') as typeof import('@/services/crawl.mock')) : null;

const PRIORITY_KEYWORDS = ['services', 'service', 'blog', 'articles', 'article', 'news', 'resources', 'pricing', 'price', 'about', 'treatments', 'treatment', 'contact', 'accreditation', 'certification', 'award', 'quality', 'standards', 'team', 'people', 'faq', 'faqs', 'help', 'support'];

/**
 * Extract unique internal links from raw HTML, sorted by priority keyword score.
 * Returns at most `limit` URLs (excluding the base URL itself).
 */
export function extractPriorityLinks(html: string, baseUrl: string, limit: number): string[] {
  let base: URL;
  try { base = new URL(baseUrl); } catch { return []; }

  const seen = new Set<string>();
  const scored: Array<{ url: string; score: number }> = [];
  const hrefRe = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;

  while ((m = hrefRe.exec(html)) !== null) {
    try {
      const resolved = new URL(m[1], baseUrl);
      if (resolved.hostname !== base.hostname) continue;
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
      // Strip query/hash; normalise trailing slash
      const clean = resolved.origin + (resolved.pathname.replace(/\/$/, '') || '/');
      const baseClean = base.origin + (base.pathname.replace(/\/$/, '') || '/');
      if (clean === baseClean) continue;
      if (seen.has(clean)) continue;
      seen.add(clean);
      const path = resolved.pathname.toLowerCase();
      const score = PRIORITY_KEYWORDS.filter(kw => path.includes(kw)).length;
      scored.push({ url: clean, score });
    } catch { /* skip invalid */ }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .slice(0, limit)
    .map(s => s.url);
}

/**
 * Start a CF crawl for a single URL (limit=1), poll to completion, return the page record.
 * Returns null on error or timeout rather than throwing.
 */
export async function crawlSinglePage(
  url: string,
  prompt: string,
  credentials: CrawlCredentials
): Promise<RawCrawlResult['pages'][0] | null> {
  let jobId: string;
  try {
    jobId = await startCrawl(url, { maxPages: 1, render: true, outputFormats: ['json', 'html'], jsonOptions: { prompt } }, credentials);
  } catch (e) {
    console.warn(`[crawlSinglePage] Failed to start crawl for ${url}:`, e);
    return null;
  }

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const { status } = await pollCrawlStatus(jobId, credentials);
      if (status === 'completed') {
        const result = await getCrawlResults(jobId, credentials);
        return result.pages[0] ?? null;
      }
      if (status !== 'running') return null;
    } catch {
      return null;
    }
  }
  console.warn(`[crawlSinglePage] Timeout for ${url}`);
  return null;
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
      ...(options.jsonOptions ? { jsonOptions: options.jsonOptions } : {}),
      ...(options.modifiedSince ? { modifiedSince: Math.floor(options.modifiedSince / 1000) } : {}),
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
