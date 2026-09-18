/**
 * Cloudflare Browser Rendering client against msw. Every request is validated
 * by the zod contract in src/test/contracts/cloudflare.ts — a call that drops
 * render:true / networkidle0 or re-adds modifiedSince fails here.
 */
import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { CF_BASE, cloudflareHandlers } from '@/test/msw/handlers';
import {
  CF_JOB_ID,
  cfCompletedResponse,
  cfErroredResponse,
} from '@/test/fixtures/providers/cloudflare';
import {
  startCrawl,
  startIncrementalCrawl,
  pollCrawlStatus,
  getCrawlResults,
  crawlSinglePage,
  fetchPageDirect,
  CrawlDisallowedError,
} from '@/services/crawl';

const creds = { accountId: 'cf-account-test', apiToken: 'cf-token-test' };
const FULL = {
  render: true,
  maxPages: 10,
  gotoOptions: { waitUntil: 'networkidle0', timeout: 30000 },
};

describe('startCrawl', () => {
  it('posts a contract-valid body and returns the job id', async () => {
    const jobId = await startCrawl('https://acme-plumbing.test', FULL, creds);
    expect(jobId).toBe(CF_JOB_ID);
  });

  it('throws CrawlDisallowedError on a Content-Signal 400', async () => {
    server.use(
      http.post(`${CF_BASE}/crawl`, () =>
        HttpResponse.text('Crawl disallowed by Content-Signal directive', { status: 400 }),
      ),
    );
    await expect(startCrawl('https://blocked.test', FULL, creds)).rejects.toBeInstanceOf(
      CrawlDisallowedError,
    );
  });

  it('throws a plain error on other HTTP failures', async () => {
    server.use(http.post(`${CF_BASE}/crawl`, () => HttpResponse.text('boom', { status: 502 })));
    await expect(startCrawl('https://acme-plumbing.test', FULL, creds)).rejects.toThrow(
      /CF crawl start failed: 502/,
    );
  });
});

describe('startIncrementalCrawl', () => {
  it('ignores modifiedSince and still renders with networkidle0', async () => {
    // Contract is .strict(): if modifiedSince leaked into the body the afterEach assertion fails.
    const jobId = await startIncrementalCrawl(
      'https://acme-plumbing.test',
      Date.now() - 86400_000,
      creds,
    );
    expect(jobId).toBe(CF_JOB_ID);
  });
});

describe('pollCrawlStatus / getCrawlResults', () => {
  it('reads status via limit=1 and then fetches records', async () => {
    server.use(...cloudflareHandlers({ pollsBeforeDone: 0 }));
    const { status } = await pollCrawlStatus(CF_JOB_ID, creds);
    expect(status).toBe('completed');
    const results = await getCrawlResults(CF_JOB_ID, creds);
    expect(results.status).toBe('completed');
    expect(results.pages.map((p) => p.url)).toEqual(
      cfCompletedResponse.result.records.map((r) => r.url),
    );
  });
});

describe('crawlSinglePage', () => {
  const poll = { attempts: 5, intervalMs: 1 };

  it('polls until completed and returns the first page', async () => {
    server.use(...cloudflareHandlers({ pollsBeforeDone: 2 }));
    const page = await crawlSinglePage(
      'https://acme-plumbing.test',
      'extract',
      creds,
      undefined,
      poll,
    );
    expect(page?.url).toBe('https://acme-plumbing.test/');
    expect(page?.html).toContain('<h1>Acme Plumbing Bristol</h1>');
  });

  it('returns null when the job errors', async () => {
    server.use(...cloudflareHandlers({ pollsBeforeDone: 0, results: cfErroredResponse }));
    const page = await crawlSinglePage(
      'https://acme-plumbing.test',
      'extract',
      creds,
      undefined,
      poll,
    );
    expect(page).toBeNull();
  });

  it('returns null on poll timeout', async () => {
    server.use(...cloudflareHandlers({ pollsBeforeDone: 99 }));
    const page = await crawlSinglePage('https://acme-plumbing.test', 'extract', creds, undefined, {
      attempts: 2,
      intervalMs: 1,
    });
    expect(page).toBeNull();
  });

  it('returns null when start is disallowed instead of throwing', async () => {
    server.use(
      http.post(`${CF_BASE}/crawl`, () =>
        HttpResponse.text('disallowed by robots', { status: 400 }),
      ),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const page = await crawlSinglePage('https://blocked.test', 'extract', creds, undefined, poll);
    expect(page).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Crawl disallowed'));
    warn.mockRestore();
  });
});

describe('fetchPageDirect', () => {
  it('returns html for a 200 with enough content', async () => {
    const html = `<html><body>${'x'.repeat(400)}</body></html>`;
    server.use(http.get('https://direct.test/', () => HttpResponse.text(html)));
    expect(await fetchPageDirect('https://direct.test/')).toBe(html);
  });

  it('returns null for short bodies and non-200s', async () => {
    server.use(
      http.get('https://short.test/', () => HttpResponse.text('<html></html>')),
      http.get('https://gone.test/', () => HttpResponse.text('', { status: 404 })),
    );
    expect(await fetchPageDirect('https://short.test/')).toBeNull();
    expect(await fetchPageDirect('https://gone.test/')).toBeNull();
  });
});
