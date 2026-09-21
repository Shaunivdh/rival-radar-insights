/**
 * Deterministic extraction eval against the ground-truth fixture set
 * (accuracy plan §5.2). No AI calls: parseHtmlSignals → extractSignals only.
 *
 * Prints per-field precision/recall and fails when recall for h1, contact
 * form or services — or services precision — drops below the committed
 * baseline in scripts/fixtures/sites/baseline.json.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import {
  extractDeterministic,
  scoreFixture,
  aggregate,
  formatTable,
  describeMisses,
  type Fixture,
  type FixtureScore,
  type ExpectedSignals,
} from '@/lib/extractionEval';

const FIXTURE_DIR = path.resolve(__dirname, '../../../scripts/fixtures/sites');

interface Baseline {
  minRecall: Record<string, number>;
  minPrecision: Record<string, number>;
}

function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.expected.json'))
    .map((f) => {
      const slug = f.replace(/\.expected\.json$/, '');
      const expected = JSON.parse(
        readFileSync(path.join(FIXTURE_DIR, f), 'utf8'),
      ) as ExpectedSignals & { _url?: string };
      return {
        slug,
        url: expected._url ?? `https://${slug}.example/`,
        html: readFileSync(path.join(FIXTURE_DIR, `${slug}.html`), 'utf8'),
        expected,
      };
    });
}

describe('extraction fixtures (deterministic, no AI)', () => {
  const fixtures = loadFixtures();
  const baseline = JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, 'baseline.json'), 'utf8'),
  ) as Baseline;

  it('has fixtures to score', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it('meets the committed precision/recall baseline', async () => {
    const scores: FixtureScore[] = [];
    const misses: string[] = [];
    for (const fx of fixtures) {
      const actual = await extractDeterministic(fx);
      scores.push(scoreFixture(fx.expected, actual));
      for (const m of describeMisses(fx, actual)) misses.push(`${fx.slug}: ${m}`);
    }
    const metrics = aggregate(scores);

    console.log(
      '\n' + formatTable(metrics, `Deterministic extraction — ${fixtures.length} fixtures`),
    );
    if (misses.length) console.log('\nMisses / extras:\n  ' + misses.join('\n  '));

    const byField = Object.fromEntries(metrics.map((m) => [m.field, m]));
    for (const [field, min] of Object.entries(baseline.minRecall)) {
      const recall = byField[field]?.recall;
      expect(recall, `${field} recall ${recall} < baseline ${min}`).not.toBeNull();
      expect(recall!, `${field} recall ${recall} < baseline ${min}`).toBeGreaterThanOrEqual(min);
    }
    for (const [field, min] of Object.entries(baseline.minPrecision)) {
      const precision = byField[field]?.precision;
      expect(precision, `${field} precision ${precision} < baseline ${min}`).not.toBeNull();
      expect(
        precision!,
        `${field} precision ${precision} < baseline ${min}`,
      ).toBeGreaterThanOrEqual(min);
    }
  });

  // Plan §2.4/§2.5 "done when": deterministic fallbacks report these with no AI.
  it('detects newsletter, portfolio, service areas and embedded forms without AI', async () => {
    const bySlug = Object.fromEntries(fixtures.map((f) => [f.slug, f]));

    const wix = await extractDeterministic(bySlug['wix-beauty-salon']);
    expect(wix.engagement.hasNewsletterSignup).toBe(true); // email input next to "Subscribe"
    expect(wix.engagement.socialLinksPresent).toEqual(
      expect.arrayContaining(['Instagram', 'Facebook']),
    );

    const shopify = await extractDeterministic(bySlug['shopify-florist']);
    expect(shopify.engagement.hasNewsletterSignup).toBe(true); // Klaviyo embed
    expect(shopify.engagement.hasContactForm).toBe(true); // Typeform iframe, no <form>

    const squarespace = await extractDeterministic(bySlug['squarespace-photographer']);
    expect(squarespace.content.hasPortfolio).toBe(true); // /portfolio link

    const plumber = await extractDeterministic(bySlug['wordpress-elementor-plumber']);
    expect(plumber.engagement.hasContactForm).toBe(true); // hbspt.forms.create, no <form>
    expect(plumber.content.serviceAreasMentioned).toEqual(
      expect.arrayContaining(['Manchester', 'Salford', 'Stockport', 'Trafford', 'M1']),
    );
    // "Why Choose Us" / "Areas We Cover" / "Get In Touch" must not be reported as services
    expect(plumber.content.servicesListed).not.toEqual(expect.arrayContaining(['Why Choose Us']));

    const accountant = await extractDeterministic(bySlug['static-accountant']);
    expect(accountant.seo.homepageH1Count).toBe(0); // no h1 → missing_h1 can fire
    expect(accountant.engagement.hasNewsletterSignup).toBe(false); // plain contact form ≠ newsletter
  });

  it('reports homepage h1 as null when the root page is a challenge page', async () => {
    const fx = fixtures[0];
    const challenge: Fixture = {
      ...fx,
      html: '<html><head><title>Just a moment...</title></head><body><h1>Checking your browser</h1></body></html>',
    };
    const actual = await extractDeterministic(challenge);
    expect(actual.seo.homepageH1Count).toBeNull();
  });
});
