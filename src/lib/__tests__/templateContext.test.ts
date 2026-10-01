import { describe, it, expect } from 'vitest';
import { fillTemplate, resolveTemplateContext, joinNames } from '@/lib/templateContext';
import { buildBusiness, buildGoogleData, buildSignals } from '@/test/builders';

describe('fillTemplate', () => {
  const ctx = { service: 'boiler repair', town: 'Bristol' };

  it('fills tokens inside a segment when every token resolves', () => {
    expect(fillTemplate('Try [["{Service} in {town}"||"your service"]].', ctx)).toBe(
      'Try "Boiler repair in Bristol".',
    );
  });

  it('uses the fallback when a token is missing', () => {
    expect(fillTemplate('Try [["{Service} in {town}"||"your service"]].', { service: 'x' })).toBe(
      'Try "your service".',
    );
  });

  it('drops a segment with no fallback when a token is missing', () => {
    expect(fillTemplate('Add a heading[[, for example "{Service} in {town}"]].', {})).toBe(
      'Add a heading.',
    );
  });

  it('leaves text without segments untouched', () => {
    expect(fillTemplate('Plain text.', ctx)).toBe('Plain text.');
  });
});

describe('resolveTemplateContext', () => {
  it('prefers the project location for town', () => {
    expect(resolveTemplateContext(buildBusiness(), 'Clifton').town).toBe('Clifton');
  });

  it('parses the town from a Google address, dropping postcode and country', () => {
    const b = buildBusiness({
      googleData: buildGoogleData({ address: '12 Pipe St, Bristol BS1 1AA, UK' }),
    });
    expect(resolveTemplateContext(b).town).toBe('Bristol');
  });

  it('leaves town undefined when there is nothing usable', () => {
    expect(resolveTemplateContext(buildBusiness({ googleData: null })).town).toBeUndefined();
  });

  it('prefers a short listed service, then the humanised Google category', () => {
    const s = buildSignals();
    s.content = { ...s.content, servicesListed: ['Boiler repair'] };
    expect(resolveTemplateContext(buildBusiness({ signals: s })).service).toBe('boiler repair');

    s.content = { ...s.content, servicesListed: [] };
    const b = buildBusiness({
      signals: s,
      googleData: buildGoogleData({ businessCategory: 'nail_salon' }),
    });
    expect(resolveTemplateContext(b).service).toBe('nail salon');

    s.content = { ...s.content, servicesListed: ['Outsourced IT Support'] };
    expect(resolveTemplateContext(buildBusiness({ signals: s })).service).toBe(
      'outsourced IT Support',
    );
    s.content = { ...s.content, servicesListed: ['IT repairs'] };
    expect(resolveTemplateContext(buildBusiness({ signals: s })).service).toBe('IT repairs');
  });
});

describe('joinNames', () => {
  it('reads naturally for one, two and many names', () => {
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A and B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
    expect(joinNames(['A', 'B', 'C', 'D', 'E'])).toBe('A, B and 3 others');
  });
});

describe('resolveTemplateContext extras', () => {
  it('carries the business name and service category', () => {
    const ctx = resolveTemplateContext(buildBusiness({ name: 'Acme Plumbing' }), null, 'trades');
    expect(ctx).toMatchObject({ name: 'Acme Plumbing', serviceCategory: 'trades' });
  });

  it('fills {name} tokens', () => {
    expect(
      fillTemplate('[["{Service} in {town} | {name}"||x]]', {
        service: 'plumber',
        town: 'Bristol',
        name: 'Acme',
      }),
    ).toBe('"Plumber in Bristol | Acme"');
  });
});
