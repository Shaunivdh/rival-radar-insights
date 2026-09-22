import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parseHtmlSignals, mergePageSignals, MERGE_ARRAY_KEYS } from '@/lib/crawl/html-parser';
import { cfSampleHtml } from '@/test/fixtures/providers/cloudflare';
import {
  cloudflareChallengeHtml,
  cookieOverlayHtml,
  nearEmptyHtml,
  schemaRichHtml,
} from '@/test/fixtures/html';

const SITES = path.resolve(__dirname, '../../../../scripts/fixtures/sites');
const site = (slug: string) => readFileSync(path.join(SITES, `${slug}.html`), 'utf8');
const ROOT = 'https://northwind-dental.test/';

describe('parseHtmlSignals — head signals', () => {
  it('reads title, meta description, h1, canonical and ld+json types', () => {
    const s = parseHtmlSignals(cfSampleHtml, 'https://acme-plumbing.test/');
    expect(s.title).toBe('Acme Plumbing | Emergency Plumbers in Bristol');
    expect(s.metaDescription).toMatch(/^Gas Safe registered plumbers/);
    expect(s.h1Tags).toEqual(['Acme Plumbing Bristol']);
    expect(s.canonicalTagsPresent).toBe(true);
    expect(s.schemaMarkupTypes).toEqual(['LocalBusiness']);
  });

  it('decodes entities in the title and reads content-first meta tags', () => {
    const s = parseHtmlSignals(
      `<title>Smith &amp; Sons &quot;Plumbing&quot;</title><meta content="Desc here" name="description">`,
    );
    expect(s.title).toBe('Smith & Sons "Plumbing"');
    expect(s.metaDescription).toBe('Desc here');
  });

  it('strips inline tags from h1 and drops Cloudflare email-protection h1s', () => {
    const s = parseHtmlSignals(`<h1><strong>Bold</strong> plumbing</h1><h1>Email Protection</h1>`);
    expect(s.h1Tags).toEqual(['Bold plumbing']);
  });

  it('collects @graph and array @type values, ignoring malformed json', () => {
    const s = parseHtmlSignals(`
      <script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":["WebSite","Thing"]}]}</script>
      <script type="application/ld+json">{not json</script>`);
    expect(s.schemaMarkupTypes).toEqual(['Organization', 'WebSite', 'Thing']);
  });

  it('omits absent signals rather than emitting empties', () => {
    const s = parseHtmlSignals('<html><body><p>hi</p></body></html>');
    expect(s.title).toBeUndefined();
    expect(s.h1Tags).toBeUndefined();
    expect(s.schemaMarkupTypes).toBeUndefined();
    expect(s.canonicalTagsPresent).toBe(false);
  });
});

describe('parseHtmlSignals — fixture sites', () => {
  it.each([
    'react-spa-dentist',
    'shopify-florist',
    'squarespace-photographer',
    'static-accountant',
  ])('%s parses without throwing and yields well-typed signals', (slug) => {
    const expected = JSON.parse(readFileSync(path.join(SITES, `${slug}.expected.json`), 'utf8'));
    const s = parseHtmlSignals(site(slug), expected._url);
    expect(typeof s.title).toBe('string');
    expect(typeof s.canonicalTagsPresent).toBe('boolean');
    if (s.h1Tags !== undefined) {
      expect(Array.isArray(s.h1Tags)).toBe(true);
      expect((s.h1Tags as string[]).every((h) => typeof h === 'string' && h.length > 0)).toBe(true);
    }
  });
});

describe('mergePageSignals', () => {
  it('lets parsed scalars win and unions array keys', () => {
    const ai = { title: '', h1Tags: ['Home'], servicesListed: ['A'], hasBlog: true } as Record<
      string,
      unknown
    >;
    const parsed = { title: 'Parsed', h1Tags: ['Services'], servicesListed: ['B', 'A'] } as Record<
      string,
      unknown
    >;
    const merged = mergePageSignals(ai, parsed);
    expect(merged.title).toBe('Parsed');
    expect(merged.hasBlog).toBe(true);
    expect(merged.h1Tags).toEqual(['Home', 'Services']);
    expect(merged.servicesListed).toEqual(['A', 'B']);
    expect(MERGE_ARRAY_KEYS).toContain('h1Tags');
  });

  it('does not union when only one side has the array', () => {
    const merged = mergePageSignals({ accreditations: ['CQC'] }, {});
    expect(merged.accreditations).toEqual(['CQC']);
  });
});

describe('parseHtmlSignals — near-empty page', () => {
  it('is the <500 char shape §6 calls unusable', () => {
    expect(nearEmptyHtml.length).toBeLessThan(500);
  });

  it('yields a title but no h1, links or schema', () => {
    const s = parseHtmlSignals(nearEmptyHtml, ROOT);
    expect(s.title).toBe('Northwind Dental');
    expect(s.h1Tags).toBeUndefined();
    expect(s.internalLinkCount).toBe(0);
    expect(s.schemaMarkupTypes).toBeUndefined();
    expect(s.canonicalTagsPresent).toBe(false);
  });
});

describe('parseHtmlSignals — Cloudflare challenge page', () => {
  it('reports the challenge screen, not the site — why §6 discards these pages', () => {
    const s = parseHtmlSignals(cloudflareChallengeHtml, ROOT);
    // The parser has no notion of a challenge: it faithfully returns the
    // blocker's title and h1. Detecting that is the orchestrator's job, and
    // this is the contamination it exists to prevent.
    expect(s.title).toBe('Just a moment...');
    expect(s.h1Tags).toEqual(['Checking your browser before accessing northwind-dental.test']);
    expect(s.internalLinkCount).toBe(0);
    expect(s.schemaMarkupTypes).toBeUndefined();
  });

  it('carries the real site name only in og:title, which the parser does not read', () => {
    expect(cloudflareChallengeHtml).toContain('og:title');
    const s = parseHtmlSignals(cloudflareChallengeHtml, ROOT);
    expect(s.title).not.toContain('Northwind Dental');
  });
});

describe('parseHtmlSignals — overlay over real content', () => {
  it('reads the real title, h1 and links despite the cookie overlay', () => {
    const s = parseHtmlSignals(cookieOverlayHtml, ROOT);
    expect(s.title).toBe('Northwind Dental | Private Dentist in Chester');
    expect(s.h1Tags).toEqual(['Private Dentistry in Chester']);
    expect(s.canonicalTagsPresent).toBe(true);
  });

  it('counts internal links and excludes tel: and off-domain hrefs', () => {
    const s = parseHtmlSignals(cookieOverlayHtml, ROOT);
    // 6 relative nav links + 1 same-host absolute + the canonical <link>;
    // tel: and trustpilot.com are excluded. The count is href-based rather than
    // anchor-based, so <link rel="canonical"> counts too.
    expect(s.internalLinkCount).toBe(8);
  });

  it('still finds trust and contact signals under the overlay', () => {
    const s = parseHtmlSignals(cookieOverlayHtml, ROOT);
    expect(s.reviewPlatformsLinked).toContain('Trustpilot');
    expect(s.teamPageExists).toBe(true);
    expect(s.hasBlog).toBe(true);
    expect(s.hasPhoneNumberProminent).toBe(true);
  });
});

describe('parseHtmlSignals — ld+json schema', () => {
  it('collects @graph types and array @type values, ignoring malformed json', () => {
    const s = parseHtmlSignals(schemaRichHtml, 'https://northwind-dental.test/treatments');
    expect(s.schemaMarkupTypes).toEqual(['Dentist', 'WebSite', 'Organization', 'Service']);
  });

  it('pulls service names out of Service nodes', () => {
    const s = parseHtmlSignals(schemaRichHtml, 'https://northwind-dental.test/treatments');
    expect(s.servicesListed).toEqual(
      expect.arrayContaining(['Dental Implants', 'Teeth Whitening']),
    );
  });

  it('counts only same-host links and grades alt coverage', () => {
    const s = parseHtmlSignals(schemaRichHtml, 'https://northwind-dental.test/treatments');
    // 3 relative + 1 same-host absolute + the canonical <link>;
    // partner-lab.test and mailto: are excluded.
    expect(s.internalLinkCount).toBe(5);
    expect(s.altTagCoverage).toBe('partial');
  });

  it('drops absolute links, canonical included, when no baseUrl is supplied', () => {
    // Without a base host the parser cannot tell same-host from off-host, so
    // every absolute href drops out and only the 3 relative links remain.
    const s = parseHtmlSignals(schemaRichHtml);
    expect(s.internalLinkCount).toBe(3);
  });
});
