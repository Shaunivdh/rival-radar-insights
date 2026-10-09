/**
 * Extraction eval: the deterministic parser (the only page-signal source since AI
 * page extraction was removed), scored against the hand-labelled fixtures in
 * scripts/fixtures/sites (accuracy plan §5.3). Free to run, no network.
 *
 * Usage:
 *   bunx tsx scripts/eval-extraction.ts            # all fixtures
 *   bunx tsx scripts/eval-extraction.ts wix-       # fixtures whose slug contains "wix-"
 *
 * Paste the printed table into the PR for any parser or extraction change.
 */
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
  const filter = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const fixtures = loadFixtures(filter);
  if (!fixtures.length) {
    console.error('No fixtures matched.');
    process.exit(1);
  }

  const scores: FixtureScore[] = [];
  const misses: string[] = [];
  for (const fx of fixtures) {
    const actual = await extractDeterministic(fx);
    scores.push(scoreFixture(fx.expected, actual));
    for (const m of describeMisses(fx, actual)) misses.push(`${fx.slug}: ${m}`);
  }

  console.log('\n' + formatTable(aggregate(scores), `Deterministic, ${fixtures.length} fixtures`));
  if (misses.length) console.log('\nMisses / extras:\n  ' + misses.join('\n  '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
