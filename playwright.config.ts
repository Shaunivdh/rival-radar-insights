import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';

// .env.test is a copy of .env.local (git-ignored). Without it — e.g. in CI —
// only the public/demo-mode project runs and the seeded project is skipped.
if (existsSync('.env.test')) loadEnv({ path: '.env.test' });

const hasSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('.invalid');

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  // Dev server compiles routes on first hit and the app layout waits for auth + project load.
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'bun run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // Site lock stays off for e2e; the unlock flow is covered by request-level checks.
      SITE_PASSWORD: '',
      // Never let an e2e run enqueue real crawls.
      INNGEST_EVENT_KEY: '',
    },
  },
  projects: [
    {
      name: 'public',
      testMatch: /public\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    ...(hasSupabase
      ? [
          {
            name: 'setup',
            testMatch: /auth\.setup\.ts/,
            use: { ...devices['Desktop Chrome'] },
          },
          {
            name: 'seeded',
            testMatch: /seeded\.spec\.ts/,
            dependencies: ['setup'],
            use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
          },
        ]
      : []),
  ],
});
