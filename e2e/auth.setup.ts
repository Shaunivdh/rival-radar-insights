/**
 * Seeded-project setup (local only — needs .env.test with a service-role key).
 *
 * 1. Creates/resets the e2e user with the repo's create-test-user script.
 * 2. Seeds a full project for that user with seed-test-project (deletes the
 *    user's previous projects first — never point .env.test at data you value).
 * 3. Inserts a few priority actions so the Action Plan page has rows.
 * 4. Logs in through the UI once and saves storageState for the seeded specs.
 *
 * No crawl is ever triggered: the seed writes rows directly and the tests
 * never submit the setup form.
 */
import { test as setup, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';
import { createClient, type User } from '@supabase/supabase-js';

export const E2E_EMAIL = 'e2e@rivalradar.test';
const E2E_PASSWORD = `E2e-${randomBytes(9).toString('base64url')}`;
const STORAGE_STATE = 'e2e/.auth/user.json';

setup('seed project and sign in', async ({ page }) => {
  setup.setTimeout(180_000);
  const env = { ...process.env };

  execFileSync('bun', ['run', 'scripts/create-test-user.ts', E2E_EMAIL, E2E_PASSWORD], {
    env,
    stdio: 'inherit',
  });
  execFileSync('bun', ['run', 'scripts/seed-test-project.ts', E2E_EMAIL], {
    env,
    stdio: 'inherit',
  });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 });
  const users: User[] = listed?.users ?? [];
  const user = users.find((u) => u.email === E2E_EMAIL);
  expect(user, 'e2e user exists').toBeTruthy();
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user!.id)
    .single();
  expect(project, 'seeded project exists').toBeTruthy();

  const { error } = await admin.from('priority_actions').insert([
    {
      project_id: project!.id,
      priority: 1,
      status: 'active',
      category: 'Conversion',
      action: 'Add your phone number to the homepage',
      reason: 'No phone number visible on your homepage',
      why_it_matters: 'Visitors who are ready to call should not have to hunt for your number.',
      steps: ['Add the number to the header', 'Make it tap-to-call on mobile'],
      effort: 'low',
      outcome: 'More calls from website visitors',
      competitor_reference: null,
      estimated_impact: 'high',
      timeframe: '1–2 days',
    },
    {
      project_id: project!.id,
      priority: 2,
      status: 'active',
      category: 'Reviews',
      action: 'Ask 3 recent customers for reviews',
      reason: 'Review velocity is below competitors',
      why_it_matters:
        'Fresh reviews keep your rating credible and help you rank in the local pack.',
      steps: ['Pick three happy customers', 'Send them your Google review link'],
      effort: 'low',
      outcome: 'Steady flow of new reviews',
      competitor_reference: null,
      estimated_impact: 'high',
      timeframe: '1 week',
    },
  ]);
  expect(error, 'priority_actions insert').toBeNull();

  await page.goto('/');
  await page.getByPlaceholder('you@example.com').first().fill(E2E_EMAIL);
  await page.getByPlaceholder('••••••••').first().fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL('**/dashboard', { timeout: 60_000 });
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
