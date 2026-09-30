import { describe, it, expect } from 'vitest';
import {
  PRIORITY_TEMPLATES,
  applyTemplates,
  applyTemplatesWithHistory,
  diagnoseTemplates,
} from '@/lib/priorityTemplates';
import { buildBusiness, buildSignals, buildGoogleData, buildAction } from '@/test/builders';

const noPhone = () =>
  buildBusiness({
    signals: buildSignals({
      engagement: { ...buildSignals().engagement, hasPhoneNumberProminent: false },
    }),
  });

describe('PRIORITY_TEMPLATES', () => {
  it('have unique ids and complete copy', () => {
    const ids = PRIORITY_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of PRIORITY_TEMPLATES) {
      expect(t.action, t.id).toBeTruthy();
      expect(t.reason.split(/\s+/).length, `${t.id} reason ≤15 words`).toBeLessThanOrEqual(15);
      expect(t.steps.length, t.id).toBeGreaterThanOrEqual(2);
      expect(t.outcome, t.id).toBeTruthy();
    }
  });

  it('never throw on a business with no enrichment data', () => {
    const bare = buildBusiness({ signals: null, googleData: null, serpData: null });
    expect(() => diagnoseTemplates(bare)).not.toThrow();
  });
});

describe('applyTemplates', () => {
  it('fires no_phone_on_homepage and numbers actions from 1', () => {
    const { actions, firedIds } = applyTemplates(noPhone());
    expect(firedIds).toContain('no_phone_on_homepage');
    expect(actions[0]).toMatchObject({
      priority: 1,
      status: 'active',
      _source: 'template',
      competitorReference: null,
    });
    actions.forEach((a, i) => expect(a.priority).toBe(i + 1));
  });

  it('caps actions at 5 but still records every fired id', () => {
    const empty = buildSignals();
    empty.engagement = {
      ...empty.engagement,
      hasContactForm: false,
      hasCallToAction: false,
      hasPhoneNumberProminent: false,
      socialLinksPresent: [],
    };
    empty.seo = {
      ...empty.seo,
      hasSitemap: false,
      schemaMarkupTypes: [],
      metaDescription: '',
      h1Tags: [],
    };
    empty.trust = {
      ...empty.trust,
      accreditations: [],
      reviewPlatformsLinked: [],
      teamPageExists: false,
    };
    empty.content = { ...empty.content, hasBlog: false, hasFAQ: false, servicesListed: [] };
    const { actions, firedIds } = applyTemplates(
      buildBusiness({
        signals: empty,
        googleData: buildGoogleData({ reviewCount: 3, photos: 0, recentReviews: [] }),
      }),
    );
    expect(actions.length).toBeLessThanOrEqual(5);
    expect(firedIds.length).toBeGreaterThanOrEqual(actions.length);
    expect(firedIds.length).toBeGreaterThan(3);
  });

  it('skips signal-dependent templates when extraction failed', () => {
    const b = noPhone();
    b.enrichmentErrors = { extract: 'timeout' };
    const { firedIds } = applyTemplates(b);
    expect(firedIds).not.toContain('no_phone_on_homepage');
    for (const id of firedIds) {
      expect(PRIORITY_TEMPLATES.find((t) => t.id === id)?.requiresSiteSignals, id).toBe(false);
    }
  });

  it('no_recent_reviews fires only with >5 reviews and none in the last 90 days', () => {
    const stale = buildGoogleData({
      reviewCount: 20,
      recentReviews: [
        { rating: 5, text: 'old', time: Date.now() - 200 * 86400_000, authorName: 'X' },
      ],
    });
    expect(applyTemplates(buildBusiness({ googleData: stale })).firedIds).toContain(
      'no_recent_reviews',
    );
    expect(
      applyTemplates(buildBusiness({ googleData: { ...stale, reviewCount: 4 } })).firedIds,
    ).not.toContain('no_recent_reviews');
    expect(applyTemplates(buildBusiness()).firedIds).not.toContain('no_recent_reviews');
  });

  const GOOGLE_TEMPLATES = [
    'no_recent_reviews',
    'no_business_hours',
    'no_gbp_description',
    'low_gbp_photos',
    'low_review_count',
  ];

  it('skips Google templates when there is no Google data', () => {
    const { firedIds } = applyTemplates(buildBusiness({ googleData: null }));
    for (const id of GOOGLE_TEMPLATES) expect(firedIds, id).not.toContain(id);
  });

  it('skips Google templates when the Google fetch errored', () => {
    const b = buildBusiness({
      googleData: buildGoogleData({ reviewCount: 3, photos: 0, openingHours: [] }),
      enrichmentErrors: { google: 'quota' },
    });
    const { firedIds } = applyTemplates(b);
    for (const id of GOOGLE_TEMPLATES) expect(firedIds, id).not.toContain(id);
    expect(applyTemplatesWithHistory(b, []).firedIds).not.toContain('low_review_count');
  });

  it('no_gbp_description never claims the owner description is missing', () => {
    // googleData.description is Google's own summary, so we cannot know the owner's text.
    const t = PRIORITY_TEMPLATES.find((x) => x.id === 'no_gbp_description')!;
    const copy = [t.action, t.reason, t.whyItMattersTemplate, ...t.steps].join(' ');
    expect(copy).not.toMatch(/missing|too short|no description/i);
  });

  it('low_review_count does not treat a missing review count as zero', () => {
    const gd = buildGoogleData();
    delete (gd as Partial<typeof gd>).reviewCount;
    expect(applyTemplates(buildBusiness({ googleData: gd })).firedIds).not.toContain(
      'low_review_count',
    );
    expect(
      applyTemplates(buildBusiness({ googleData: buildGoogleData({ reviewCount: 3 }) })).firedIds,
    ).toContain('low_review_count');
  });
});

describe('applyTemplatesWithHistory', () => {
  it('marks repeated actions as still outstanding', () => {
    const prev = [buildAction()];
    const { actions } = applyTemplatesWithHistory(noPhone(), prev);
    const phone = actions.find((a) => a.action === prev[0].action);
    expect(phone?.continuityNote).toBe('Still outstanding from last week.');
    expect(
      actions.filter((a) => a.action !== prev[0].action).every((a) => a.continuityNote === null),
    ).toBe(true);
  });

  it("reports last week's actions whose category no longer fires as closed", () => {
    const prev = [buildAction({ category: 'Conversion' })];
    const { closedFromLastWeek, firedIds } = applyTemplatesWithHistory(buildBusiness(), prev);
    const conversionStillFires = firedIds.some(
      (id) => PRIORITY_TEMPLATES.find((t) => t.id === id)?.category === 'Conversion',
    );
    expect(closedFromLastWeek).toEqual(conversionStillFires ? [] : [prev[0].action]);
  });

  it('ignores previous actions from non-template categories', () => {
    const prev = [buildAction({ category: 'Made Up Category' })];
    expect(applyTemplatesWithHistory(buildBusiness(), prev).closedFromLastWeek).toEqual([]);
  });
});
