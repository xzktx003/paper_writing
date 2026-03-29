import { defineConfig } from '@playwright/test';

declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
};

const testPath = [
  `${process.cwd()}/.playwright-bin`,
  process.env.PATH ?? '',
].join(':');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    headless: true,
  },
  webServer: [
    {
      command: 'pnpm --filter server dev',
      env: {
        ...process.env,
        PATH: testPath,
      },
      url: 'http://127.0.0.1:4000/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter web dev',
      env: {
        ...process.env,
        PATH: testPath,
      },
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});