import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one database, so run files sequentially.
    fileParallelism: false,
    setupFiles: ['tests/setup.ts'],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://care:care@localhost:5432/care_marketplace_test',
      JWT_SECRET: 'test-secret',
      PLATFORM_FEE_PERCENT: '15',
      PAYMENT_GATEWAY: 'mock',
    },
  },
});
