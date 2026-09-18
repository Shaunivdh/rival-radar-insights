import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parseHtmlSignals, mergePageSignals, MERGE_ARRAY_KEYS } from '@/lib/crawl/html-parser';
import { cfSampleHtml } from '@/test/fixtures/providers/cloudflare';

const SITES = path.resolve(__dirname, '../../../../scripts/fixtures/sites');
const site = (slug: string) => readFileSync(path.join(SITES, `${slug}.html`), 'utf8');

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
