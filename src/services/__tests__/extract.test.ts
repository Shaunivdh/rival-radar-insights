import { describe, it, expect } from 'vitest';
import { extractSignals } from '@/services/extract';
import type { RawCrawlResult } from '@/types';

/** Build a RawCrawlResult from per-page json/html blobs. */
function crawl(pages: Array<{ json?: Record<string, unknown>; html?: string }>): RawCrawlResult {
  return {
    status: 'completed',
    pages: pages.map((p, i) => ({ url: `https://x.co/${i}`, ...p })),
  };
}

describe('extractSignals', () => {
  it('aggregates and dedupes signals across pages', async () => {
    const result = await extractSignals(
      crawl([
        {
          json: {
            title: 'Just a moment...', // challenge title — must be skipped
            h1Tags: ['Welcome'],
            hasSitemap: true,
            internalLinkCount: 5,
            hasContactForm: false,
          },
        },
        {
          json: {
            title: 'Dr Boo | Salon',
            h1Tags: ['Book Now'],
            internalLinkCount: 20,
            schemaMarkupTypes: ['LocalBusiness'],
          },
          html: '<form><input name="email"/></form>',
        },
      ]),
    );

    // pickStr skips challenge titles and takes the first real one
    expect(result.seo.title).toBe('Dr Boo | Salon');
    // mergeStringArrays unions across pages
    expect(result.seo.h1Tags).toEqual(['Welcome', 'Book Now']);
    // maxNum takes the largest count
    expect(result.seo.internalLinkCount).toBe(20);
    // pickBool: any true wins
    expect(result.seo.hasSitemap).toBe(true);
    expect(result.seo.schemaMarkupTypes).toEqual(['LocalBusiness']);
    // hasContactForm falls back to HTML <form> + <input> detection
    expect(result.engagement.hasContactForm).toBe(true);
  });

  it('sanitises servicesListed: drops nav/blog/footer junk, keeps real services', async () => {
    const result = await extractSignals(
      crawl([
        {
          json: {
            servicesListed: [
              'Waxing',
              'Recent Posts', // nav junk
              'Blog', // nav junk
              'Facials &amp; Peels', // entity-decoded, kept
              '© 2020 Co', // year/© hint, dropped
              'ab', // too short (<3), dropped
              'waxing', // case-insensitive duplicate of Waxing
            ],
          },
        },
        { json: { servicesListed: ['Massage'] } },
      ]),
    );

    expect(result.content.servicesListed).toEqual(['Waxing', 'Facials & Peels', 'Massage']);
  });

  it('returns safe defaults for empty pages', async () => {
    const result = await extractSignals(crawl([{ json: {} }]));

    expect(result.seo.title).toBe('');
    expect(result.seo.h1Tags).toEqual([]);
    expect(result.seo.hasSitemap).toBe(false);
    expect(result.seo.altTagCoverage).toBe('none');
    expect(result.content.servicesListed).toEqual([]);
    expect(result.engagement.hasContactForm).toBe(false);
    expect(result.engagement.bookingProvider).toBeNull();
  });

  it('treats an explicit false boolean as false, not the fallback', async () => {
    const result = await extractSignals(crawl([{ json: { hasBookingSystem: false } }]));
    expect(result.engagement.hasBookingSystem).toBe(false);
  });
});
