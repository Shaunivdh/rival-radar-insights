/**
 * Authenticated flows against the seeded "Evolve IT vs Competitors" project.
 * Read paths plus one status update; nothing here triggers a crawl.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const OWN = 'Evolve IT';
const COMPETITORS = ['Netitude', 'Owen IT', 'Absolutely PC', 'Impact IT Solutions'];

test('signed-in visitors are sent from / to the dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('dashboard greets the user and shows the seeded businesses', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(
    page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  await expect(page.getByText(OWN).first()).toBeVisible();
  for (const name of COMPETITORS.slice(0, 2)) {
    await expect(page.getByText(name).first()).toBeVisible();
  }
});

test('sidebar navigation reaches every section', async ({ page }) => {
  await page.goto('/dashboard');
  const nav = page.getByRole('navigation').first();

  await nav.getByRole('link', { name: 'Competitors' }).click();
  await expect(page).toHaveURL(/\/competitors$/);
  await expect(page.getByRole('heading', { name: 'Competitors' })).toBeVisible();
  for (const name of COMPETITORS) await expect(page.getByText(name).first()).toBeVisible();

  await nav.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await nav.getByRole('link', { name: 'Action Plan' }).click();
  await expect(page).toHaveURL(/\/action-plan$/);
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(OWN) })).toBeVisible();
});

test('competitor detail page renders for a seeded competitor', async ({ page }) => {
  // No in-app link reaches /competitors/[id] today (BenchmarkTable, which
  // navigates there, is not rendered anywhere), so open the route directly.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: biz } = await admin
    .from('businesses')
    .select('id')
    .eq('name', COMPETITORS[0])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(biz, `seeded competitor ${COMPETITORS[0]}`).toBeTruthy();

  const path = `/competitors/${biz!.id}`;
  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByText(COMPETITORS[0]).first()).toBeVisible();
});

test('marking an action done persists across reload', async ({ page }) => {
  await page.goto('/action-plan');
  const title = 'Add your phone number to the homepage';
  const heading = page.getByRole('heading', { name: title });
  await expect(heading).toBeVisible();
  await expect(page.getByText('2 to look at')).toBeVisible();

  // The inline tick is a <button> nested inside the card's <button> (React logs a
  // hydration error for it), so expand the card and use its footer button. Scope
  // to the card: the other card's inline tick also matches "Mark as done".
  const card = page.locator('.neu').filter({ has: heading }).first();
  await heading.click();
  await card.getByRole('button', { name: 'Mark as done', exact: true }).last().click();
  await expect(card.getByRole('button', { name: 'Mark as not done', exact: true })).toBeVisible();

  // Completed actions leave the active list; the summary reflects it after a reload.
  await page.reload();
  await expect(page.getByText('1 to look at')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Ask 3 recent customers for reviews' }),
  ).toBeVisible();
  await expect(heading).toHaveCount(0);
});

test('changes page renders', async ({ page }) => {
  await page.goto('/changes');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
});
