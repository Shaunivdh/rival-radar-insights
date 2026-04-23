/**
 * AI function test script
 *
 * Usage:
 *   npx tsx scripts/test-ai.ts                  # run all tests
 *   npx tsx scripts/test-ai.ts actions           # priority actions only (week1 + week2)
 *   npx tsx scripts/test-ai.ts changes           # change summary only (week1 → week2 diff)
 *   npx tsx scripts/test-ai.ts visibility        # AI visibility check only
 *
 * Requires ANTHROPIC_API_KEY in env (or .env.local)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { generatePriorityActions } from '../src/services/ai';
import { generateChangeSummary } from '../src/services/ai';
import { checkAIVisibility } from '../src/services/ai';
import type { Business } from '../src/types';

import week1Data from './fixtures/week1.json';
import week2Data from './fixtures/week2.json';

const DIVIDER = '\n' + '='.repeat(70) + '\n';

// ---------- helpers ----------

function printActions(label: string, actions: unknown[]) {
  console.log(DIVIDER);
  console.log(`📋 ${label}`);
  console.log(DIVIDER);
  console.log(JSON.stringify(actions, null, 2));
  console.log(`\n→ ${actions.length} actions returned`);
}

// ---------- tests ----------

async function testPriorityActions() {
  // Week 1 — first scan, no history
  console.log('\n🔵 WEEK 1: First scan priority actions');
  const week1Actions = await generatePriorityActions(
    week1Data.ownBusiness as Business,
    week1Data.competitors as Business[],
  );
  printActions('Week 1 actions', week1Actions);

  // Week 2 — after following advice
  console.log('\n🟢 WEEK 2: After improvements');
  const week2Actions = await generatePriorityActions(
    week2Data.ownBusiness as Business,
    week2Data.competitors as Business[],
  );
  printActions('Week 2 actions', week2Actions);

  // Compare: are week1 issues resolved in week2?
  console.log(DIVIDER);
  console.log('📊 COMPARISON');
  console.log(DIVIDER);
  const w1Categories = new Set(week1Actions.map((a: any) => a.category));
  const w2Categories = new Set(week2Actions.map((a: any) => a.category));
  const resolved = [...w1Categories].filter((c) => !w2Categories.has(c));
  const newIssues = [...w2Categories].filter((c) => !w1Categories.has(c));
  const persistent = [...w1Categories].filter((c) => w2Categories.has(c));
  console.log('Resolved categories:', resolved.length ? resolved : '(none)');
  console.log('New categories:    ', newIssues.length ? newIssues : '(none)');
  console.log('Persistent:        ', persistent.length ? persistent : '(none)');
}

async function testChangeSummary() {
  console.log(DIVIDER);
  console.log('🔄 CHANGE SUMMARY: Week 1 → Week 2');
  console.log(DIVIDER);

  const own = week2Data.ownBusiness as Business;
  if (!own.previousSignals) {
    console.log('⚠️  No previousSignals in week2 fixture — skipping');
    return;
  }

  const summary = await generateChangeSummary(
    own.name,
    own.previousSignals,
    own.signals,
    false, // own business, not competitor
  );
  console.log(JSON.stringify(summary, null, 2));
}

async function testAIVisibility() {
  console.log(DIVIDER);
  console.log('🤖 AI VISIBILITY CHECK: Evolve IT');
  console.log(DIVIDER);

  // Force fresh check by passing no existingVisibility
  const result = await checkAIVisibility(
    'IT Support',    // primaryService
    'Bristol',       // location
    'Evolve IT',     // businessName
    null,            // no existing — forces fresh check
  );
  console.log(JSON.stringify(result, null, 2));

  // Also test a competitor that should NOT appear
  console.log('\n🤖 AI VISIBILITY CHECK: Fake Company (should score 0)');
  const fakeResult = await checkAIVisibility(
    'IT Support',
    'Bristol',
    'Zzyzx Nonexistent IT Corp',
    null,
  );
  console.log(JSON.stringify(fakeResult, null, 2));
}

// ---------- main ----------

async function main() {
  const arg = process.argv[2];

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set. Add it to .env.local');
    process.exit(1);
  }

  console.log('🚀 AI Test Runner');
  console.log(`   Mode: ${arg || 'all'}`);

  try {
    if (!arg || arg === 'actions') await testPriorityActions();
    if (!arg || arg === 'changes') await testChangeSummary();
    if (!arg || arg === 'visibility') await testAIVisibility();
  } catch (e) {
    console.error('❌ Test failed:', e);
    process.exit(1);
  }

  console.log(DIVIDER);
  console.log('✅ Done');
}

main();
