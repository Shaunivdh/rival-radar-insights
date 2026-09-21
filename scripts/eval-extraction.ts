/**
 * Full-path extraction eval: deterministic parser + Haiku page extraction,
 * merged exactly as the orchestrator does, scored against the hand-labelled
 * fixtures in scripts/fixtures/sites (accuracy plan §5.3).
 *
 * Opt-in — every run spends real money (≈$0.01 per fixture with Haiku 4.5).
 *
 * Usage:
 *   bunx tsx scripts/eval-extraction.ts            # all fixtures
 *   bunx tsx scripts/eval-extraction.ts wix-       # fixtures whose slug contains "wix-"
 *   bunx tsx scripts/eval-extraction.ts --no-ai    # deterministic only (same as the vitest run)
 *
 * Requires ANTHROPIC_API_KEY in env (or .env.local). Paste the printed table into the PR
 * for any prompt or extraction change.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { extractPageSignals, prepareHtmlForExtraction } from '../src/services/ai';
import { EXTRACTION_PROMPT } from '../src/lib/crawl/extraction-prompt';
import {
  extractDeterministic,
  extractWithAI,
  scoreFixture,
  aggregate,
  formatTable,
  describeMisses,
  type Fixture,
  type FixtureScore,
  type ExpectedSignals,
} from '../src/lib/extractionEval';

const FIXTURE_DIR = path.resolve(__dirname, 'fixtures/sites');

function loadFixtures(filter?: string): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.expected.json'))
    .map((f) => f.replace(/\.expected\.json$/, ''))
    .filter((slug) => !filter || slug.includes(filter))
    .map((slug) => {
      const expected = JSON.parse(
        readFileSync(path.join(FIXTURE_DIR, `${slug}.expected.json`), 'utf8'),
      ) as ExpectedSignals & { _url?: string };
      return {
        slug,
        url: expected._url ?? `https://${slug}.example/`,
        html: readFileSync(path.join(FIXTURE_DIR, `${slug}.html`), 'utf8'),
        expected,
      };
    });
}

async function main() {
  const args = process.argv.slice(2);
  const noAI = args.includes('--no-ai');
  const filter = args.find((a) => !a.startsWith('--'));
  const fixtures = loadFixtures(filter);
  if (!fixtures.length) {
    console.error('No fixtures matched.');
    process.exit(1);
  }
  if (!noAI && !process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY missing — set it or pass --no-ai.');
    process.exit(1);
  }

  const detScores: FixtureScore[] = [];
  const aiScores: FixtureScore[] = [];
  const misses: string[] = [];
  let failures = 0;

  for (const fx of fixtures) {
    const det = await extractDeterministic(fx);
    detScores.push(scoreFixture(fx.expected, det));

    if (noAI) continue;
    const t0 = Date.now();
    let aiJson: Record<string, unknown> = {};
    try {
      aiJson = await extractPageSignals(fx.html, EXTRACTION_PROMPT);
    } catch (e) {
      failures++;
      console.warn(`[${fx.slug}] AI extraction failed: ${(e as Error).message}`);
    }
    const full = await extractWithAI(fx, aiJson);
    aiScores.push(scoreFixture(fx.expected, full));
    for (const m of describeMisses(fx, full)) misses.push(`${fx.slug}: ${m}`);
    console.log(
      `[${fx.slug}] ${Date.now() - t0}ms, ${prepareHtmlForExtraction(fx.html).length} chars sent`,
    );
  }

  console.log(
    '\n' + formatTable(aggregate(detScores), `Deterministic only — ${fixtures.length} fixtures`),
  );
  if (!noAI) {
    console.log(
      '\n' +
        formatTable(
          aggregate(aiScores),
          `Deterministic + Haiku — ${fixtures.length} fixtures, ${failures} extraction failure(s)`,
        ),
    );
    if (misses.length) console.log('\nMisses / extras (full path):\n  ' + misses.join('\n  '));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
