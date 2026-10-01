import { describe, it, expect } from 'vitest';
import {
  PRIORITY_TEMPLATES,
  applyTemplates,
  applyTemplatesWithHistory,
  diagnoseTemplates,
} from '@/lib/priorityTemplates';
import { buildBusiness, buildSignals, buildGoogleData, buildAction } from '@/test/builders';
import { asBusinessId } from '@/types';
import { resolveTemplateContext } from '@/lib/templateContext';

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

  describe('no_recent_reviews (review count history)', () => {
    const stale = buildGoogleData({
      reviewCount: 96,
      recentReviews: [
        { rating: 5, text: 'old', time: Date.now() - 200 * 86400_000, authorName: 'X' },
      ],
    });
    const growth = (gained: number, days: number) => ({
      gained,
      days,
      baselineCount: 96 - gained,
      since: '2026-08-03T09:00:00Z',
    });
    const fires = (overrides: Parameters<typeof buildBusiness>[0]) =>
      applyTemplates(buildBusiness({ googleData: stale, ...overrides })).firedIds.includes(
        'no_recent_reviews',
      );

    it('fires only after 60+ days of history with no new reviews', () => {
      expect(fires({ reviewGrowth: growth(0, 75) })).toBe(true);
      expect(fires({ reviewGrowth: growth(0, 59) })).toBe(false);
      expect(fires({ reviewGrowth: growth(2, 75) })).toBe(false);
    });

    it('stays silent without history, however old the sampled reviews look', () => {
      expect(fires({ reviewGrowth: null })).toBe(false);
      expect(fires({})).toBe(false);
    });

    it('stays silent when a sampled review proves recent activity', () => {
      const recent = buildGoogleData({ reviewCount: 96 });
      expect(
        applyTemplates(buildBusiness({ googleData: recent, reviewGrowth: growth(0, 75) })).firedIds,
      ).not.toContain('no_recent_reviews');
    });

    it('stays silent for businesses with 5 or fewer reviews', () => {
      expect(fires({ googleData: { ...stale, reviewCount: 4 }, reviewGrowth: growth(0, 75) })).toBe(
        false,
      );
    });

    it('states the stalled count and date, and names a competitor that is gaining', () => {
      const own = buildBusiness({ googleData: stale, reviewGrowth: growth(0, 75) });
      const rival = buildBusiness({
        id: asBusinessId('c_pro'),
        name: 'Pro beauty clinic',
        reviewGrowth: { gained: 4, days: 20, baselineCount: 146, since: '2026-09-11T00:00:00Z' },
      });
      const a = applyTemplates(own, [rival]).actions.find(
        (x) => x.templateId === 'no_recent_reviews',
      )!;
      expect(
        a.whyItMatters.startsWith('Your Google review count has stayed at 96 since 3 August.'),
      ).toBe(true);
      expect(a.competitorReference).toBe(
        'Pro beauty clinic gained 4 Google reviews in the last 20 days.',
      );
    });
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

describe('competitor comparison and personalisation', () => {
  const rival = (name: string, overrides: Parameters<typeof buildBusiness>[0] = {}) =>
    buildBusiness({ id: asBusinessId(`c_${name}`), name, ...overrides });
  const lowReviews = () => buildBusiness({ googleData: buildGoogleData({ reviewCount: 6 }) });
  const ref = (
    actions: { templateId?: string | null; competitorReference: string | null }[],
    id: string,
  ) => actions.find((a) => a.templateId === id)?.competitorReference;

  it('names the strongest competitor with real numbers', () => {
    const comps = [
      rival('Small Co', { googleData: buildGoogleData({ reviewCount: 20 }) }),
      rival('Big Co', { googleData: buildGoogleData({ reviewCount: 140 }) }),
    ];
    const { actions } = applyTemplates(lowReviews(), comps);
    expect(ref(actions, 'low_review_count')).toBe('Big Co has 140 Google reviews; you have 6.');
  });

  it('leaves the reference null when no competitor is strictly better', () => {
    const comps = [rival('Tiny Co', { googleData: buildGoogleData({ reviewCount: 6 }) })];
    expect(ref(applyTemplates(lowReviews(), comps).actions, 'low_review_count')).toBeNull();
  });

  it('lists competitors that have a missing feature, skipping ones whose crawl failed', () => {
    const own = noPhone();
    const comps = [
      rival('Alpha'),
      rival('Beta'),
      rival('Gamma', { enrichmentErrors: { crawl: 'timeout' } }),
    ];
    expect(ref(applyTemplates(own, comps).actions, 'no_phone_on_homepage')).toBe(
      'Alpha and Beta both show their phone number on their homepage.',
    );
  });

  it('reports the Google photo cap as "10 or more"', () => {
    const own = buildBusiness({ googleData: buildGoogleData({ photos: 2 }) });
    const comps = [rival('Snappy', { googleData: buildGoogleData({ photos: 10 }) })];
    expect(ref(applyTemplates(own, comps).actions, 'low_gbp_photos')).toBe(
      'Snappy has 10 or more photos on Google; you have 2.',
    );
  });

  it('personalises steps but never the headline', () => {
    const s = buildSignals();
    s.seo = { ...s.seo, homepageH1Count: 0 };
    s.content = { ...s.content, servicesListed: ['Boiler repair'] };
    const own = buildBusiness({ signals: s });
    const plain = applyTemplates(own).actions.find((a) => a.templateId === 'missing_h1')!;
    const filled = applyTemplates(own, [], { location: 'Bristol' }).actions.find(
      (a) => a.templateId === 'missing_h1',
    )!;
    expect(filled.action).toBe(plain.action);
    expect(filled.steps.join(' ')).toContain('"Boiler repair in Bristol"');
  });

  it('rendered copy has no dashes or arrows and never trips the validator weakness check', () => {
    // Every gap open, every competitor stronger, so every template fires with a comparison.
    const own = buildBusiness({
      signals: {
        seo: {
          ...buildSignals().seo,
          homepageH1Count: 0,
          metaDescription: '',
          schemaMarkupTypes: [],
          altTagCoverage: 'none',
        },
        trust: { ...buildSignals().trust, teamPageExists: false, reviewPlatformsLinked: [] },
        content: {
          ...buildSignals().content,
          servicesListed: [],
          serviceAreasMentioned: [],
          hasFAQ: false,
        },
        engagement: {
          ...buildSignals().engagement,
          hasPhoneNumberProminent: false,
          hasContactForm: false,
          hasCallToAction: false,
        },
      },
      googleData: buildGoogleData({
        reviewCount: 0,
        photos: 0,
        openingHours: [],
        recentReviews: [],
      }),
      serpData: { ...buildBusiness().serpData!, localPackPresent: false },
      pagespeedData: { mobile: { performanceScore: 20 } } as never,
      aiVisibility: { aiPresenceScore: 0 } as never,
    });
    const comps = [
      rival('Rival One', {
        googleData: buildGoogleData({ reviewCount: 90, photos: 10 }),
        serpData: { ...buildBusiness().serpData!, localPackPresent: true },
        pagespeedData: { mobile: { performanceScore: 85 } } as never,
        aiVisibility: { aiPresenceScore: 70 } as never,
      }),
    ];
    for (const id of PRIORITY_TEMPLATES.map((t) => t.id)) {
      const tpl = PRIORITY_TEMPLATES.find((t) => t.id === id)!;
      const refText =
        tpl.compare?.(own, comps, resolveTemplateContext(own, 'Bristol', 'trades')) ?? null;
      const copy = [
        tpl.action,
        tpl.reason,
        tpl.whyItMattersTemplate,
        ...tpl.steps,
        tpl.outcome,
        refText,
      ]
        .filter(Boolean)
        .join(' ');
      expect(copy, id).not.toMatch(/[—–→]| - /);
      if (refText) expect(refText, id).not.toMatch(/\b(zero|lack|none)\b|\bno\s|\b0\s/i);
    }
    for (const a of applyTemplates(own, comps, { location: 'Bristol' }).actions) {
      const copy = [a.whyItMatters, ...a.steps, a.competitorReference].join(' ');
      expect(copy, a.templateId ?? '').not.toMatch(/[—–→]|\[\[|\]\]|\{|\}| - /);
    }
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

describe('catalogue batch 1', () => {
  const sig = (patch: (s: ReturnType<typeof buildSignals>) => void) => {
    const s = buildSignals();
    patch(s);
    return s;
  };
  const fired = (
    b: ReturnType<typeof buildBusiness>,
    opts: Parameters<typeof applyTemplates>[2] = {},
    comps: ReturnType<typeof buildBusiness>[] = [],
  ) => applyTemplates(b, comps, opts).firedIds;
  const rival = (name: string, overrides: Parameters<typeof buildBusiness>[0] = {}) =>
    buildBusiness({ id: asBusinessId(`c_${name}`), name, ...overrides });
  const refFor = (
    id: string,
    b: ReturnType<typeof buildBusiness>,
    comps: ReturnType<typeof buildBusiness>[],
    opts: Parameters<typeof applyTemplates>[2] = {},
  ) => {
    const tpl = PRIORITY_TEMPLATES.find((t) => t.id === id)!;
    return tpl.compare?.(b, comps, {
      ...resolveTemplateContext(b, opts.location, opts.serviceCategory),
    });
  };

  it('title_missing_town fires only when a known town is absent from the title', () => {
    const b = buildBusiness({ signals: sig((s) => (s.seo.title = 'Acme Plumbing')) });
    expect(fired(b, { location: 'Bristol' })).toContain('title_missing_town');
    expect(fired(buildBusiness(), { location: 'bristol' })).not.toContain('title_missing_town');
    expect(fired(buildBusiness({ googleData: null, signals: b.signals }))).not.toContain(
      'title_missing_town',
    );
    expect(refFor('title_missing_town', b, [rival('Pipes Co')], { location: 'Bristol' })).toBe(
      'Pipes Co includes Bristol in their homepage title.',
    );
  });

  it('title_missing_town accepts the town without a direction prefix', () => {
    const b = buildBusiness({
      signals: sig((s) => (s.seo.title = 'Polished Dulwich | Nail Salon')),
    });
    expect(fired(b, { location: 'East Dulwich' })).not.toContain('title_missing_town');
    expect(fired(b, { location: 'North Finchley' })).toContain('title_missing_town');
  });

  it('no_sitemap needs robots.txt reachable, so a failed check never fires it', () => {
    expect(fired(buildBusiness({ signals: sig((s) => (s.seo.hasSitemap = false)) }))).toContain(
      'no_sitemap',
    );
    const unreachable = sig((s) => {
      s.seo.hasSitemap = false;
      s.seo.hasRobotsTxt = false;
    });
    expect(fired(buildBusiness({ signals: unreachable }))).not.toContain('no_sitemap');
  });

  it('no_booking_competitor_has fires only when a rival takes bookings, naming the provider', () => {
    const booker = rival('Dr Boo', {
      signals: sig((s) => {
        s.engagement.hasBookingSystem = true;
        s.engagement.bookingProvider = 'Fresha';
      }),
    });
    expect(fired(buildBusiness())).not.toContain('no_booking_competitor_has');
    expect(fired(buildBusiness(), {}, [booker])).toContain('no_booking_competitor_has');
    expect(refFor('no_booking_competitor_has', buildBusiness(), [booker])).toBe(
      'Dr Boo takes bookings online through Fresha.',
    );
  });

  it('gbp_missing_website fires when the Google listing has no website link', () => {
    const b = buildBusiness({ googleData: buildGoogleData({ website: undefined }) });
    expect(fired(b)).toContain('gbp_missing_website');
    expect(fired(buildBusiness())).not.toContain('gbp_missing_website');
  });

  it('no_accreditations_shown is limited to regulated categories', () => {
    const none = buildBusiness({ signals: sig((s) => (s.trust.accreditations = [])) });
    expect(fired(none, { serviceCategory: 'trades' })).toContain('no_accreditations_shown');
    expect(fired(none, { serviceCategory: 'retail' })).not.toContain('no_accreditations_shown');
    expect(fired(buildBusiness(), { serviceCategory: 'trades' })).not.toContain(
      'no_accreditations_shown',
    );
  });

  it('no_social_links fires when no social profiles are linked', () => {
    expect(
      fired(buildBusiness({ signals: sig((s) => (s.engagement.socialLinksPresent = [])) })),
    ).toContain('no_social_links');
    expect(fired(buildBusiness())).not.toContain('no_social_links');
  });

  it('vague_cta fires only when every button label is vague', () => {
    const vague = sig((s) => (s.engagement.ctaText = ['Submit', 'Learn more']));
    const mixed = sig((s) => (s.engagement.ctaText = ['Get a free quote', 'Submit']));
    const empty = sig((s) => (s.engagement.ctaText = []));
    expect(fired(buildBusiness({ signals: vague }))).toContain('vague_cta');
    expect(fired(buildBusiness({ signals: mixed }))).not.toContain('vague_cta');
    expect(fired(buildBusiness({ signals: empty }))).not.toContain('vague_cta');
  });

  it('no_guarantee and no_insurance_mentioned are limited to hands-on trades', () => {
    const b = buildBusiness({ signals: sig((s) => (s.trust.insuranceMentioned = false)) });
    expect(fired(b, { serviceCategory: 'trades' })).toEqual(
      expect.arrayContaining(['no_guarantee', 'no_insurance_mentioned']),
    );
    expect(fired(b, { serviceCategory: 'legal' })).not.toContain('no_guarantee');
    expect(fired(b, { serviceCategory: 'legal' })).not.toContain('no_insurance_mentioned');
  });

  it('thin_portfolio fires for visual categories with under 3 examples', () => {
    const few = buildBusiness({
      signals: sig((s) => {
        s.content.hasPortfolio = true;
        s.content.portfolioItemCount = 2;
      }),
    });
    const many = buildBusiness({
      signals: sig((s) => {
        s.content.hasPortfolio = true;
        s.content.portfolioItemCount = 5;
      }),
    });
    expect(fired(few, { serviceCategory: 'beauty' })).toContain('thin_portfolio');
    expect(fired(many, { serviceCategory: 'beauty' })).not.toContain('thin_portfolio');
    expect(fired(few, { serviceCategory: 'accounting' })).not.toContain('thin_portfolio');
  });
});
