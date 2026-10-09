/** SerpApi client against msw with contract validation. */
import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { serpHandlers, SERP_URL } from '@/test/msw/handlers';
import { serpEmptyResponse, serpErrorResponse } from '@/test/fixtures/providers/serp';
import { getRankingData, type LocalPackFetcher } from '@/services/serp';

const KEY = 'serp-key-test';
const silence = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('getRankingData', () => {
  it('finds the business by domain and reports ads', async () => {
    const data = await getRankingData(
      'Acme Plumbing',
      'trades',
      'Bristol',
      KEY,
      'https://www.acme-plumbing.test',
    );
    expect(data).toMatchObject({
      localVisibilityPosition: 2,
      localPackPresent: true,
      adsAboveResults: 1,
      featuredSnippet: false,
      knowledgePanelPresent: false,
    });
    expect(data.searchTerm).toMatch(/Bristol$/);
  });

  it('searches by service alone with a 16z ll param when coords are given', async () => {
    let seenQuery = '';
    server.use(
      http.get(SERP_URL, ({ request }) => {
        seenQuery = request.url;
        return HttpResponse.json(serpEmptyResponse);
      }),
    );
    const data = await getRankingData(
      'Acme Plumbing',
      'trades',
      'Bristol',
      KEY,
      'acme-plumbing.test',
      { lat: 51.45, lng: -2.58 },
    );
    expect(seenQuery).toContain('ll=@51.45,-2.58,16z');
    expect(data.searchTerm).not.toContain('Bristol');
  });

  it('falls back to a name match when no website matches', async () => {
    const data = await getRankingData('Pipes R Us', 'trades', 'Bristol', KEY, 'unrelated.test');
    expect(data.localVisibilityPosition).toBe(3);
  });

  it('returns an empty result on API error, empty results, or HTTP failure', async () => {
    const err = silence();
    server.use(...serpHandlers({ response: serpErrorResponse }));
    expect(
      (await getRankingData('Acme', 'trades', 'Bristol', KEY, 'acme-plumbing.test'))
        .localPackPresent,
    ).toBe(false);
    server.use(...serpHandlers({ response: serpEmptyResponse }));
    expect(
      (await getRankingData('Acme', 'trades', 'Bristol', KEY, 'acme-plumbing.test'))
        .localVisibilityPosition,
    ).toBeNull();
    server.use(http.get(SERP_URL, () => HttpResponse.text('nope', { status: 500 })));
    expect(
      (await getRankingData('Acme', 'trades', 'Bristol', KEY, 'acme-plumbing.test'))
        .localPackPresent,
    ).toBe(false);
    err.mockRestore();
  });

  it('routes the fetch through a shared fetcher keyed without the API key', async () => {
    const keys: string[] = [];
    const shared = new Map<string, unknown>();
    const fetcher: LocalPackFetcher = async (key, live) => {
      keys.push(key);
      if (!shared.has(key)) shared.set(key, await live());
      return shared.get(key) as Awaited<ReturnType<typeof live>>;
    };
    const a = await getRankingData(
      'Acme Plumbing',
      'trades',
      'Bristol',
      KEY,
      'acme-plumbing.test',
      undefined,
      fetcher,
    );
    // A second business reuses the response but is matched on its own identity.
    server.use(http.get(SERP_URL, () => HttpResponse.text('not called', { status: 500 })));
    const b = await getRankingData(
      'Nobody Here',
      'trades',
      'Bristol',
      KEY,
      'nobody.test',
      undefined,
      fetcher,
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toContain(KEY);
    expect(a.localVisibilityPosition).toBe(2);
    expect(b).toMatchObject({ localPackPresent: true, localVisibilityPosition: null });
  });

  it('does not hand a failed response to the fetcher to cache', async () => {
    const err = silence();
    server.use(...serpHandlers({ response: serpErrorResponse }));
    let stored = false;
    const fetcher: LocalPackFetcher = async (_key, live) => {
      const v = await live();
      stored = true;
      return v;
    };
    const r = await getRankingData(
      'Acme',
      'trades',
      'Bristol',
      KEY,
      'acme-plumbing.test',
      undefined,
      fetcher,
    );
    expect(r.localPackPresent).toBe(false);
    expect(stored).toBe(false);
    err.mockRestore();
  });
});
