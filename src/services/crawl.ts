import type { CrawlOptions, RawCrawlResult } from '@/types';
import { logger } from '@/lib/logger';

export interface CrawlCredentials {
  accountId: string;
  apiToken: string;
}

/** Thrown when the target site blocks CF crawl via Content-Signal directive. */
export class CrawlDisallowedError extends Error {
  constructor(url: string, detail: string) {
    super(`Crawl disallowed by site: ${url} — ${detail}`);
    this.name = 'CrawlDisallowedError';
  }
}

const PRIORITY_KEYWORDS = [
  'services',
  'service',
  'blog',
  'articles',
  'article',
  'news',
  'resources',
  'pricing',
  'price',
  'about',
  'treatments',
  'treatment',
  'contact',
  'accreditation',
  'certification',
  'award',
  'quality',
  'standards',
  'team',
  'people',
  'faq',
  'faqs',
  'help',
  'support',
];

const normalizeHost = (h: string) => h.replace(/^www\./i, '').toLowerCase();

/**
 * Extract unique internal links from raw HTML, sorted by priority keyword score.
 * Returns at most `limit` URLs (excluding the base URL itself).
 */
export function extractPriorityLinks(html: string, baseUrl: string, limit: number): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const baseHost = normalizeHost(base.hostname);
  const seen = new Set<string>();
  const scored: Array<{ url: string; score: number }> = [];
  const hrefRe = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;

  while ((m = hrefRe.exec(html)) !== null) {
    try {
      const resolved = new URL(m[1], baseUrl);
      if (normalizeHost(resolved.hostname) !== baseHost) continue;
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
      // Strip query/hash; normalise trailing slash. Use base.origin so www/non-www
      // links to the same path dedupe naturally via `seen`.
      const clean = base.origin + (resolved.pathname.replace(/\/$/, '') || '/');
      const baseClean = base.origin + (base.pathname.replace(/\/$/, '') || '/');
      if (clean === baseClean) continue;
      if (seen.has(clean)) continue;
      seen.add(clean);
      // Tokenise on any non-alphanumeric run AND split camelCase, so '/our-services',
      // '/about.html', and '/serviceArea' all surface their keywords, while '/newsletter'
      // still doesn't match 'news'. Set dedupes 'services'+'service' double-counting.
      const tokens = new Set(
        resolved.pathname
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter(Boolean),
      );
      const score = PRIORITY_KEYWORDS.filter((kw) => tokens.has(kw)).length;
      scored.push({ url: clean, score });
    } catch {
      /* skip invalid */
    }
  }

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .slice(0, limit)
    .map((s) => s.url);
}

// Statuses that mean the job is definitively done and failed — anything else
// (queued, pending, running, etc.) means "keep polling".
const TERMINAL_FAILURE_STATES = new Set(['failed', 'canceled', 'cancelled', 'error']);
const MAX_CONSECUTIVE_POLL_ERRORS = 3;

/**
 * Start a CF crawl for a single URL (limit=1), poll to completion, return the page record.
 * Returns null on error or timeout rather than throwing.
 *
 * Defaults to 40 attempts × 3s = 120s, since render:true + networkidle0 can take
 * 30s+ server-side before completion. Override via `pollOptions` for tighter limits.
 */
export async function crawlSinglePage(
  url: string,
  prompt: string,
  credentials: CrawlCredentials,
  extraOptions?: Pick<CrawlOptions, 'gotoOptions' | 'waitForSelector'>,
  pollOptions?: { attempts?: number; intervalMs?: number },
): Promise<RawCrawlResult['pages'][0] | null> {
  const attempts = pollOptions?.attempts ?? 40;
  const intervalMs = pollOptions?.intervalMs ?? 3000;

  let jobId: string;
  try {
    jobId = await startCrawl(
      url,
      {
        maxPages: 1,
        render: true,
        jsonOptions: { prompt },
        // Per CLAUDE.md §6, all crawls must use networkidle0+30s. Spread last so
        // a caller-supplied gotoOptions still overrides.
        gotoOptions: { waitUntil: 'networkidle0', timeout: 30000 },
        ...extraOptions,
      },
      credentials,
    );
  } catch (e) {
    if (e instanceof CrawlDisallowedError) {
      logger.warn('crawlSinglePage', 'Crawl disallowed', { url, error: e.message });
    } else {
      logger.warn('crawlSinglePage', 'Failed to start crawl', { url, error: e });
    }
    return null;
  }

  let completed = false;
  let consecutiveErrors = 0;
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const { status } = await pollCrawlStatus(jobId, credentials);
      consecutiveErrors = 0;
      if (status === 'completed') {
        completed = true;
        break;
      }
      if (TERMINAL_FAILURE_STATES.has(status)) {
        logger.warn('crawlSinglePage', 'Job ended without completing', { jobId, url, status });
        return null;
      }
      // Any other status (running, queued, pending, etc.) — keep polling.
    } catch (e) {
      consecutiveErrors++;
      if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        logger.warn('crawlSinglePage', 'Consecutive poll errors, giving up', {
          consecutiveErrors,
          url,
          error: e,
        });
        return null;
      }
      logger.warn('crawlSinglePage', 'Poll error, retrying', {
        consecutiveErrors,
        maxConsecutiveErrors: MAX_CONSECUTIVE_POLL_ERRORS,
        url,
        error: e,
      });
    }
  }

  if (!completed) {
    logger.warn('crawlSinglePage', 'Timeout', { url, seconds: (attempts * intervalMs) / 1000 });
    return null;
  }

  // Fetch results outside the poll loop so a transient failure here doesn't burn
  // the whole poll budget re-polling a job we already know is done.
  try {
    const result = await getCrawlResults(jobId, credentials);
    // Empty-completed: site likely blocks crawling via robots/Content-Signal
    // even though it didn't 400 at start time.
    if (result.pages.length === 0) {
      logger.warn(
        'crawlSinglePage',
        'Job completed with zero pages — likely blocked by robots/Content-Signal directive',
        { jobId, url },
      );
      return null;
    }
    return result.pages[0] ?? null;
  } catch (e) {
    logger.warn('crawlSinglePage', 'getCrawlResults failed after completion', { url, error: e });
    return null;
  }
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
  credentials: CrawlCredentials,
): Promise<string> {
  const body = {
    url,
    render: options.render ?? false,
    limit: options.maxPages ?? 20,
    ...(options.jsonOptions ? { jsonOptions: options.jsonOptions } : {}),
    ...(options.modifiedSince ? { modifiedSince: Math.floor(options.modifiedSince / 1000) } : {}),
    ...(options.gotoOptions ? { gotoOptions: options.gotoOptions } : {}),
    ...(options.waitForSelector ? { waitForSelector: options.waitForSelector } : {}),
  };
  logger.info('crawl', 'startCrawl request', { body });

  const res = await fetch(`${cfBase(credentials.accountId)}/crawl`, {
    method: 'POST',
    headers: cfHeaders(credentials.apiToken),
    body: JSON.stringify(body),
  });

  const resText = await res.text();
  if (!res.ok) {
    if (
      res.status === 400 &&
      (resText.includes('Content-Signal directive') || resText.includes('disallowed by robots'))
    ) {
      throw new CrawlDisallowedError(url, resText);
    }
    throw new Error(`CF crawl start failed: ${res.status} ${resText}`);
  }

  const data = JSON.parse(resText) as { success: boolean; result: string };
  logger.info('crawl', 'startCrawl response', { jobId: data.result, success: data.success });
  if (!data.success) throw new Error('CF crawl start: success=false');
  return data.result;
}

export async function pollCrawlStatus(
  jobId: string,
  credentials: CrawlCredentials,
): Promise<{ status: string }> {
  // limit=1 is CF's documented lightweight-poll idiom — we only read .status here.
  // limit=0 is undocumented and CF list APIs typically reject it.
  const res = await fetch(`${cfBase(credentials.accountId)}/crawl/${jobId}?limit=1`, {
    headers: cfHeaders(credentials.apiToken),
  });

  if (!res.ok) throw new Error(`CF poll failed: ${res.status}`);

  const data = (await res.json()) as { success: boolean; result: { status: string } };
  logger.info('crawl', 'pollCrawlStatus', { jobId, status: data.result.status });
  return { status: data.result.status };
}

export async function getCrawlResults(
  jobId: string,
  credentials: CrawlCredentials,
): Promise<RawCrawlResult> {
  const res = await fetch(`${cfBase(credentials.accountId)}/crawl/${jobId}`, {
    headers: cfHeaders(credentials.apiToken),
  });

  if (!res.ok) throw new Error(`CF results failed: ${res.status}`);

  const data = (await res.json()) as {
    success: boolean;
    result: {
      status: RawCrawlResult['status'];
      records: Array<{
        url: string;
        json?: Record<string, unknown>;
        markdown?: string;
        html?: string;
      }>;
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
  _modifiedSince: number,
  credentials: CrawlCredentials,
): Promise<string> {
  // NOTE: modifiedSince was removed (caused CF jobs to hang). render:true is required
  // because many modern sites (SPAs, React/Vue) return near-empty HTML without JS execution.
  logger.info('crawl', 'startIncrementalCrawl (JS rendering enabled, expect 3-5s per page)', {
    url,
  });
  return startCrawl(
    url,
    {
      maxPages: 10,
      render: true,
      gotoOptions: { waitUntil: 'networkidle0', timeout: 30000 },
    },
    credentials,
  );
}

/**
 * Fallback: fetch a page directly via HTTP (no JS rendering).
 * Returns the raw HTML string or null on failure.
 */
export async function fetchPageDirect(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RivalRadar/1.0)',
        Accept: 'text/html',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      logger.warn('fetchPageDirect', 'Non-OK response', { url, status: res.status });
      return null;
    }
    const html = await res.text();
    if (!html || html.length < 300) {
      logger.warn('fetchPageDirect', 'Too little content returned', { url, chars: html.length });
      return null;
    }
    logger.info('fetchPageDirect', 'Fetched OK', { url, chars: html.length });
    return html;
  } catch (e) {
    logger.warn('fetchPageDirect', 'Failed', { url, error: e });
    return null;
  }
}
