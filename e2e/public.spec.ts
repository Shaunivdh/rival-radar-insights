/**
 * Public / demo-mode checks — no database needed, so these run in CI.
 * Middleware behaviour is asserted at the request level (redirect status)
 * and the login page at the UI level.
 */
import { test, expect } from '@playwright/test';

test.describe('landing page', () => {
  test('renders the marketing hero at /', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: /Win your local street/i }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start your free scan' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  });

  test('shows the mocked price', async ({ page }) => {
    // Placeholder until Stripe lands, so pin it: a silent change is a bug.
    await page.goto('/');
    await page.locator('#pricing').scrollIntoViewIfNeeded();
    await expect(page.getByText('£12.99')).toBeVisible();
  });

  test('serves /what-we-track and /contact to signed out visitors', async ({ page }) => {
    await page.goto('/what-we-track');
    await expect(page.getByRole('heading', { name: 'What We Track' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Get started' }).first()).toBeVisible();

    await page.goto('/contact');
    await expect(page.getByRole('heading', { name: 'Contact us' })).toBeVisible();
    await expect(page.getByPlaceholder('you@yourbusiness.co.uk')).toBeVisible();
  });
});

test.describe('login page', () => {
  test('renders the sign-in form at /login', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com').first()).toBeVisible();
    await expect(page.getByPlaceholder('••••••••').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /log in/i })).toBeDisabled();
  });

  test('enables sign-in once email and password are filled', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').first().fill('someone@example.com');
    await page.getByPlaceholder('••••••••').first().fill('not-the-password');
    await expect(page.getByRole('button', { name: /log in/i })).toBeEnabled();
  });

  test('signup page renders its own heading', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByPlaceholder('you@yourbusiness.co.uk')).toBeVisible();
  });
});

test.describe('middleware', () => {
  test('site lock is off: / is served, not redirected to /unlock', async ({ request }) => {
    const res = await request.get('/', { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });

  test('protected routes redirect unauthenticated visitors to /', async ({ request }) => {
    for (const path of ['/dashboard', '/competitors', '/changes', '/settings', '/setup']) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(new URL(res.headers()['location'], 'http://localhost:3000').pathname, path).toBe('/');
    }
  });

  test('the rr-demo=1 cookie bypasses the auth redirect', async ({ request }) => {
    const res = await request.get('/dashboard', {
      maxRedirects: 0,
      headers: { cookie: 'rr-demo=1' },
    });
    expect(res.status()).toBe(200);
  });

  test('in the browser, demo mode without a project still lands on /', async ({
    context,
    page,
  }) => {
    // Nothing in the app sets isDemoMode, so the client layout bounces demo
    // visitors with no project back to /, which is now the landing page rather
    // than the login form. This pins that behaviour.
    await context.addCookies([{ name: 'rr-demo', value: '1', url: 'http://localhost:3000' }]);
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/');
  });
});
