import { defineConfig } from 'vitest/config';
import path from 'path';

// Contract tests hit real provider APIs and only run via `bun run test:contract`.
const runRealApi = process.env.RUN_REAL_API === '1';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // `server-only` throws outside RSC; stub it so server modules import in tests.
      'server-only': path.resolve(__dirname, 'src/test/stubs/server-only.ts'),
    },
  },
  test: {
    include: runRealApi ? ['src/**/*.contract.test.ts'] : ['src/**/*.test.{ts,tsx}'],
    exclude: runRealApi
      ? ['node_modules']
      : ['node_modules', 'src/**/*.contract.test.ts', 'e2e/**'],
    setupFiles: ['src/test/setup.ts'],
    environment: 'node',
  },
});
