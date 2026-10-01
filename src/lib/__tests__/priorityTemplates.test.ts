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

describe('template ranking', () => {
  // Fires no_faq, no_team_page, missing_alt_tags, no_schema_markup, no_review_links (all
  // early in file order) plus no_services_listed and no_phone_on_homepage (later or first).
  const manyGaps = () => {
    const s = buildSignals();
    s.content = { ...s.content, hasFAQ: false, servicesListed: [] };
    s.trust = { ...s.trust, teamPageExists: false, reviewPlatformsLinked: [] };
    s.seo = { ...s.seo, altTagCoverage: 'none', schemaMarkupTypes: [] };
    s.engagement = { ...s.engagement, hasPhoneNumberProminent: false };
    return buildBusiness({ signals: s });
  };

  it('every template declares a weight from 1 to 5 and a score key', () => {
    for (const t of PRIORITY_TEMPLATES) {
      expect(t.impactWeight, t.id).toBeGreaterThanOrEqual(1);
      expect(t.impactWeight, t.id).toBeLessThanOrEqual(5);
      expect(t.scoreKey, t.id).toBeTruthy();
    }
  });

  it('picks the top 5 by score, not by position in the file', () => {
    const { actions, firedIds } = applyTemplates(manyGaps());
    expect(firedIds.length).toBeGreaterThan(5);
    expect(actions.map((a) => a.templateId)).toEqual(firedIds.slice(0, 5));
    expect(actions[0].templateId).toBe('no_services_listed');
    expect(actions[1].templateId).toBe('no_phone_on_homepage');
    // weight 2, medium effort: the lowest scorers drop out
    expect(actions.map((a) => a.templateId)).not.toContain('no_faq');
    expect(actions.map((a) => a.templateId)).not.toContain('no_team_page');
  });

  it('a weak score in a category lifts its templates', () => {
    const b = manyGaps();
    b.googleData = buildGoogleData({ reviewCount: 3 });
    const base = {
      overallScore: 50,
      weeklyDelta: null,
      localVisibilityScore: 50,
      gbpCompletenessScore: 90,
      aiPresenceScore: null,
      reviewVelocityScore: null,
      generatedAt: '2026-09-30T00:00:00Z',
    };
    b.aiScore = { ...base, reputationScore: 95, websiteHealthScore: 20 };
    const strongReviews = applyTemplates(b).actions.map((a) => a.templateId);
    b.aiScore = { ...base, reputationScore: 10, websiteHealthScore: 95 };
    const weakReviews = applyTemplates(b).actions.map((a) => a.templateId);
    expect(weakReviews.indexOf('low_review_count')).toBeLessThan(
      strongReviews.includes('low_review_count') ? strongReviews.indexOf('low_review_count') : 99,
    );
    expect(weakReviews[0]).toBe('low_review_count');
  });

  it('breaks ties on template id so the order is stable', () => {
    const ids = applyTemplates(manyGaps()).firedIds;
    expect(applyTemplates(manyGaps()).firedIds).toEqual(ids);
    // no_schema_markup, no_review_links and missing_alt_tags all score 2.0 × 0.5
    const tied = ids.filter((id) =>
      ['missing_alt_tags', 'no_review_links', 'no_schema_markup'].includes(id),
    );
    expect(tied).toEqual(['missing_alt_tags', 'no_review_links', 'no_schema_markup']);
  });
});

describe('applyTemplatesWithHistory', () => {
  it('tags every template action with its template id', () => {
    const { actions } = applyTemplates(noPhone());
    expect(
      actions.find((a) => a.action === 'Add your phone number to the homepage')?.templateId,
    ).toBe('no_phone_on_homepage');
    for (const a of applyTemplatesWithHistory(noPhone(), []).actions) {
      expect(a.templateId, a.action).toBeTruthy();
    }
  });

  it('marks repeated actions as still outstanding by template id, even after a copy edit', () => {
    const prev = [
      buildAction({ templateId: 'no_phone_on_homepage', action: 'Old headline wording' }),
    ];
    const { actions } = applyTemplatesWithHistory(noPhone(), prev);
    const phone = actions.find((a) => a.templateId === 'no_phone_on_homepage');
    expect(phone?.continuityNote).toBe('Still outstanding from last week.');
    expect(
      actions
        .filter((a) => a.templateId !== 'no_phone_on_homepage')
        .every((a) => a.continuityNote === null),
    ).toBe(true);
  });

  it("reports last week's template actions that no longer fire as closed", () => {
    const prev = [buildAction({ templateId: 'no_phone_on_homepage' })];
    expect(applyTemplatesWithHistory(buildBusiness(), prev).closedFromLastWeek).toEqual([
      prev[0].action,
    ]);
    expect(applyTemplatesWithHistory(noPhone(), prev).closedFromLastWeek).toEqual([]);
  });

  it('never reports LLM actions as closed, even when their category has no template firing', () => {
    const prev = [buildAction({ templateId: null, action: 'Ask 3 recent customers for reviews' })];
    expect(applyTemplatesWithHistory(buildBusiness(), prev).closedFromLastWeek).toEqual([]);
  });

  it('does not report a template as closed when it was skipped for missing data', () => {
    const prev = [buildAction({ templateId: 'low_review_count', category: 'Reviews' })];
    const noGoogle = buildBusiness({ googleData: null });
    expect(applyTemplatesWithHistory(noGoogle, prev).closedFromLastWeek).toEqual([]);
    const extractFailed = noPhone();
    extractFailed.enrichmentErrors = { extract: 'timeout' };
    const prevPhone = [buildAction({ templateId: 'no_phone_on_homepage' })];
    expect(applyTemplatesWithHistory(extractFailed, prevPhone).closedFromLastWeek).toEqual([]);
  });
});
