/** SerpApi client against msw with contract validation. */
import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { serpHandlers, SERP_URL } from '@/test/msw/handlers';
import { serpEmptyResponse, serpErrorResponse } from '@/test/fixtures/providers/serp';
import { getRankingData } from '@/services/serp';

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
});
