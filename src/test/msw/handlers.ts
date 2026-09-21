/**
 * Default msw handlers for every external provider RivalRadar calls.
 * Each handler validates the outgoing request against the zod contract and
 * validates the fixture it returns, so a bad request or stale fixture fails
 * the test via `contractViolations`.
 */
import { http, HttpResponse } from 'msw';
import * as C from '@/test/contracts';
import { check, contractViolations } from './violations';
import * as cf from '@/test/fixtures/providers/cloudflare';
import * as g from '@/test/fixtures/providers/google';
import * as s from '@/test/fixtures/providers/serp';
import { psiResponse } from '@/test/fixtures/providers/pagespeed';

export const CF_BASE = 'https://api.cloudflare.com/client/v4/accounts/:accountId/browser-rendering';
export const PLACES_BASE = 'https://places.googleapis.com/v1/places';
export const SERP_URL = 'https://serpapi.com/search.json';
export const PSI_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
export const POSTCODES_URL = 'https://api.postcodes.io/postcodes/:postcode';

function requireBearer(label: string, req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (!/^Bearer \S+$/.test(auth)) contractViolations.push(`${label}: missing Bearer token`);
}

/** Cloudflare: start → running once → completed. Override in tests for failure paths. */
export function cloudflareHandlers(opts: { pollsBeforeDone?: number; results?: unknown } = {}) {
  let polls = 0;
  const pollsBeforeDone = opts.pollsBeforeDone ?? 1;
  const results = opts.results ?? cf.cfCompletedResponse;
  return [
    http.post(`${CF_BASE}/crawl`, async ({ request }) => {
      requireBearer('cf.start.headers', request);
      check('cf.start.request', C.CfCrawlStartRequest, await request.json());
      check('cf.start.response', C.CfCrawlStartResponse, cf.cfStartResponse);
      return HttpResponse.json(cf.cfStartResponse);
    }),
    http.get(`${CF_BASE}/crawl/:jobId`, ({ request }) => {
      requireBearer('cf.poll.headers', request);
      const url = new URL(request.url);
      const done = polls >= pollsBeforeDone;
      if (url.searchParams.get('limit') === '1') {
        polls++;
        const body = done
          ? {
              ...cf.cfRunningResponse,
              result: { status: (results as { result: { status: string } }).result.status },
            }
          : cf.cfRunningResponse;
        check('cf.poll.response', C.CfCrawlResultsResponse, body);
        return HttpResponse.json(body);
      }
      check('cf.results.response', C.CfCrawlResultsResponse, results);
      return HttpResponse.json(results);
    }),
  ];
}

export function googleHandlers(opts: { search?: unknown; postcodes?: unknown } = {}) {
  const search = opts.search ?? g.placesSearchResponse;
  return [
    http.post(`${PLACES_BASE}:searchText`, async ({ request }) => {
      check('places.searchText.headers', C.PlacesHeaders, {
        'x-goog-api-key': request.headers.get('x-goog-api-key'),
        'x-goog-fieldmask': request.headers.get('x-goog-fieldmask'),
      });
      check('places.searchText.request', C.PlacesSearchTextRequest, await request.json());
      const mask = request.headers.get('x-goog-fieldmask') ?? '';
      const latLngOnly = mask === 'places.location';
      const body = latLngOnly ? g.placesLatLngResponse : search;
      check(
        'places.searchText.response',
        latLngOnly ? C.PlacesLatLngResponse : C.PlacesSearchTextResponse,
        body,
      );
      return HttpResponse.json(body);
    }),
    http.get(`${PLACES_BASE}/:placeId`, ({ request }) => {
      check('places.get.headers', C.PlacesHeaders, {
        'x-goog-api-key': request.headers.get('x-goog-api-key'),
        'x-goog-fieldmask': request.headers.get('x-goog-fieldmask'),
      });
      check('places.get.response', C.Place, g.placeAcme);
      return HttpResponse.json(g.placeAcme);
    }),
    http.get(POSTCODES_URL, () => {
      const body = opts.postcodes ?? g.postcodesIoResponse;
      check('postcodes.response', C.PostcodesIoResponse, body);
      return HttpResponse.json(body);
    }),
  ];
}

export function serpHandlers(opts: { response?: unknown } = {}) {
  const body = opts.response ?? s.serpLocalResponse;
  return [
    http.get(SERP_URL, ({ request }) => {
      const q = Object.fromEntries(new URL(request.url).searchParams.entries());
      check('serp.request', C.SerpRequestQuery, q);
      check('serp.response', C.SerpResponse, body);
      return HttpResponse.json(body);
    }),
  ];
}

export function pagespeedHandlers() {
  return [
    http.get(PSI_URL, ({ request }) => {
      const q = Object.fromEntries(new URL(request.url).searchParams.entries());
      check('psi.request', C.PsiRequestQuery, q);
      const body = psiResponse(q.strategy as 'mobile' | 'desktop');
      check('psi.response', C.PsiResponse, body);
      return HttpResponse.json(body);
    }),
  ];
}

/** robots.txt + sitemap probes made by checkDirectSignals for any host. */
export function siteProbeHandlers(opts: { robots?: boolean; sitemap?: boolean } = {}) {
  const robots = opts.robots ?? true;
  const sitemap = opts.sitemap ?? true;
  return [
    http.get('*/robots.txt', () =>
      robots
        ? HttpResponse.text('User-agent: *\nAllow: /\nSitemap: /sitemap.xml', {
            headers: { 'content-type': 'text/plain' },
          })
        : HttpResponse.text('not found', { status: 404 }),
    ),
    http.get('*/sitemap.xml', () =>
      sitemap
        ? HttpResponse.text(
            '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://acme-plumbing.test/</loc></url></urlset>',
            { headers: { 'content-type': 'application/xml' } },
          )
        : HttpResponse.text('not found', { status: 404 }),
    ),
    http.get('*/sitemap_index.xml', () => HttpResponse.text('not found', { status: 404 })),
    http.get('*/wp-sitemap.xml', () => HttpResponse.text('not found', { status: 404 })),
  ];
}

export const defaultHandlers = [
  ...siteProbeHandlers(),
  ...cloudflareHandlers(),
  ...googleHandlers(),
  ...serpHandlers(),
  ...pagespeedHandlers(),
];
