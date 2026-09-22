/** PageSpeed Insights client against msw with contract validation. */
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { PSI_URL } from '@/test/msw/handlers';
import { fetchPageSpeedData } from '@/services/pagespeed';

describe('fetchPageSpeedData', () => {
  it('fetches mobile and desktop and maps scores to 0-100', async () => {
    const data = await fetchPageSpeedData('https://acme-plumbing.test/');
    expect(data.mobile).toEqual({
      performanceScore: 62,
      lcp: 2800,
      cls: 0.05,
      inp: 180,
      fcp: 1400,
    });
    expect(data.desktop.performanceScore).toBe(91);
    expect(Date.parse(data.fetchedAt)).not.toBeNaN();
  });

  it('throws when a strategy fails', async () => {
    server.use(http.get(PSI_URL, () => HttpResponse.json({}, { status: 429 })));
    await expect(fetchPageSpeedData('https://acme-plumbing.test/')).rejects.toThrow(
      /PSI (mobile|desktop) returned 429/,
    );
  });
});
