import { describe, it, expect } from 'vitest';
import { suppressOscillatingChanges } from '@/services/diff';
import type { ExtractedSignals } from '@/types';

function signals(overrides: {
  services?: string[];
  areas?: string[];
  awards?: string[];
  hasFAQ?: boolean;
}): ExtractedSignals {
  return {
    seo: {
      title: 'Dr Boo | Salon',
      metaDescription: 'A salon',
      h1Tags: ['Welcome'],
      hasSitemap: true,
      hasRobotsTxt: true,
      internalLinkCount: 20,
      schemaMarkupTypes: ['LocalBusiness'],
      canonicalTagsPresent: true,
      altTagCoverage: 'partial',
    },
    trust: {
      accreditations: [],
      certifications: [],
      awardsAndMemberships: overrides.awards ?? ['London Hair and Beauty Awards'],
      reviewPlatformsLinked: ['Google Reviews'],
      teamPageExists: true,
      insuranceMentioned: false,
      guaranteesMentioned: [],
    },
    content: {
      servicesListed: overrides.services ?? ['Waxing', 'Tanning', 'Massages'],
      serviceAreasMentioned: overrides.areas ?? ['London', 'SE22 9NG'],
      hasBlog: true,
      hasPortfolio: false,
      portfolioItemCount: 0,
      hasFAQ: overrides.hasFAQ ?? true,
    },
    engagement: {
      hasContactForm: true,
      hasBookingSystem: false,
      bookingProvider: null,
      hasCallToAction: true,
      ctaText: ['Book now'],
      hasNewsletterSignup: false,
      socialLinksPresent: ['instagram'],
      hasPhoneNumberProminent: true,
    },
  };
}

describe('suppressOscillatingChanges', () => {
  it('reports genuinely new changes', () => {
    const previous = signals({});
    const current = signals({ services: ['Waxing', 'Tanning', 'Massages', 'Radio Frequency'] });

    const result = suppressOscillatingChanges(previous, current, [signals({}), signals({})]);

    expect(result.hasChanges).toBe(true);
    expect(result.changedPaths).toEqual(['content.servicesListed']);
    expect(result.suppressedPaths).toEqual([]);
    expect(result.filteredCurrent.content.servicesListed).toContain('Radio Frequency');
  });

  it('suppresses a flip-flop (new value already seen in history)', () => {
    // The Pro Beauty postcode pattern: present → absent → present
    const previous = signals({ areas: ['London'] });
    const current = signals({ areas: ['London', 'SE22 9NG'] });
    const history = [signals({ areas: ['London', 'SE22 9NG'] })];

    const result = suppressOscillatingChanges(previous, current, history);

    expect(result.hasChanges).toBe(false);
    expect(result.suppressedPaths).toEqual(['content.serviceAreasMentioned']);
    // filteredCurrent reverts the oscillating leaf to the previous value
    expect(result.filteredCurrent.content.serviceAreasMentioned).toEqual(['London']);
  });

  it('suppresses a degraded-render recovery (values return after one bad scan)', () => {
    // The Dr Boo pattern: full list → junk-only scan → full list again
    const fullServices = ['Face', 'Body', 'Waxing', 'Tanning', 'Radio Frequency'];
    const previous = signals({ services: ['Recent Posts'], hasFAQ: false });
    const current = signals({ services: fullServices, hasFAQ: true });
    const history = [signals({ services: fullServices, hasFAQ: true })];

    const result = suppressOscillatingChanges(previous, current, history);

    expect(result.hasChanges).toBe(false);
    expect(result.suppressedPaths).toEqual(
      expect.arrayContaining(['content.servicesListed', 'content.hasFAQ']),
    );
  });

  it('keeps genuine changes while suppressing oscillating ones in the same scan', () => {
    const previous = signals({ areas: ['London'] });
    const current = signals({ areas: ['London', 'SE22 9NG'], awards: ['Feefo Gold'] });
    const history = [signals({ areas: ['London', 'SE22 9NG'] })];

    const result = suppressOscillatingChanges(previous, current, history);

    expect(result.hasChanges).toBe(true);
    expect(result.changedPaths).toEqual(['trust.awardsAndMemberships']);
    expect(result.suppressedPaths).toEqual(['content.serviceAreasMentioned']);
    expect(result.filteredCurrent.content.serviceAreasMentioned).toEqual(['London']);
    expect(result.filteredCurrent.trust.awardsAndMemberships).toEqual(['Feefo Gold']);
  });

  it('reports no changes for identical snapshots', () => {
    const result = suppressOscillatingChanges(signals({}), signals({}), []);
    expect(result.hasChanges).toBe(false);
    expect(result.changedPaths).toEqual([]);
    expect(result.suppressedPaths).toEqual([]);
  });
});
