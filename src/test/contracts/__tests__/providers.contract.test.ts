/**
 * Live provider contract checks. Only run via `bun run test:contract`
 * (RUN_REAL_API=1); each provider is skipped unless its key is in .env.test.
 * These spend real API credit — keep them to one cheap call per provider.
 */
import { describe, it, expect } from 'vitest';
import { config } from 'dotenv';
import * as C from '@/test/contracts';

config({ path: '.env.test' });

const cf = process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN;
const google = process.env.GOOGLE_PLACES_API_KEY;
const serp = process.env.SERP_API_KEY;

describe('live provider contracts', () => {
  it.skipIf(!google)('Google Places searchText matches the contract', async () => {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': google!,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.types,places.location',
      },
      body: JSON.stringify({ textQuery: 'plumber Bristol' }),
    });
    expect(res.ok).toBe(true);
    expect(C.PlacesSearchTextResponse.safeParse(await res.json()).success).toBe(true);
  });

  it('postcodes.io matches the contract', async () => {
    const res = await fetch('https://api.postcodes.io/postcodes/BS11AA');
    expect(C.PostcodesIoResponse.safeParse(await res.json()).success).toBe(true);
  });

  it.skipIf(!serp)('SerpApi google_maps matches the contract', async () => {
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent('plumber')}&engine=google_maps&api_key=${serp}&gl=gb&hl=en&ll=@51.4545,-2.5879,16z`;
    const res = await fetch(url);
    expect(res.ok).toBe(true);
    expect(C.SerpResponse.safeParse(await res.json()).success).toBe(true);
  });

  it('PageSpeed Insights matches the contract', async () => {
    const key = process.env.GOOGLE_PAGESPEED_API_KEY
      ? `&key=${process.env.GOOGLE_PAGESPEED_API_KEY}`
      : '';
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent('https://example.com/')}&strategy=mobile${key}`,
    );
    expect(res.ok).toBe(true);
    expect(C.PsiResponse.safeParse(await res.json()).success).toBe(true);
  }, 90_000);

  it.skipIf(!cf)(
    'Cloudflare crawl start + status match the contract',
    async () => {
      const base = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/browser-rendering`;
      const headers = {
        Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      };
      const body = {
        url: 'https://example.com/',
        render: true,
        limit: 1,
        gotoOptions: { waitUntil: 'networkidle0', timeout: 30000 },
      };
      expect(C.CfCrawlStartRequest.safeParse(body).success).toBe(true);
      const start = await fetch(`${base}/crawl`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const startJson = await start.json();
      expect(C.CfCrawlStartResponse.safeParse(startJson).success).toBe(true);
      const status = await fetch(`${base}/crawl/${startJson.result}?limit=1`, { headers });
      expect(C.CfCrawlResultsResponse.safeParse(await status.json()).success).toBe(true);
    },
    60_000,
  );
});
