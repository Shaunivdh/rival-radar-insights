import { describe, it, expect } from 'vitest';
import { extractPriorityLinks } from '@/services/crawl';

const BASE = 'https://acme.test/';
const html = (links: string[]) => links.map((h) => `<a href="${h}">x</a>`).join('');

describe('extractPriorityLinks', () => {
  it('ranks by keyword score, then alphabetically, and caps at limit', () => {
    const out = extractPriorityLinks(
      html(['/about', '/services/pricing', '/blog', '/contact', '/gallery', '/pricing']),
      BASE,
      3,
    );
    expect(out).toEqual([
      'https://acme.test/services/pricing',
      'https://acme.test/about',
      'https://acme.test/blog',
    ]);
  });

  it('drops external, non-http, base-url and duplicate links; strips query and hash', () => {
    const out = extractPriorityLinks(
      html([
        'https://other.test/services',
        'mailto:hi@acme.test',
        'tel:0117',
        '/',
        'https://www.acme.test/services?utm=1',
        '/services#top',
        '/services/',
      ]),
      BASE,
      10,
    );
    expect(out).toEqual(['https://acme.test/services']);
  });

  it('tokenises camelCase and file extensions but not substrings', () => {
    const out = extractPriorityLinks(
      html(['/serviceArea', '/about.html', '/newsletter']),
      BASE,
      10,
    );
    expect(out).toEqual(['https://acme.test/about.html', 'https://acme.test/serviceArea']);
  });

  it('returns [] for an invalid base url', () => {
    expect(extractPriorityLinks(html(['/about']), 'not a url', 5)).toEqual([]);
  });
});
