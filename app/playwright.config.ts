import { defineConfig, devices } from '@playwright/test';

const defaultBaseURL = process.env.BASE_URL || process.env.OPENPRISM_PUBLIC_URL || 'http://127.0.0.1:8787';
const e2eApiToken = String(process.env.OPENPRISM_E2E_API_TOKEN || '').trim();

/**
 * Paper Agent Playwright E2E 测试配置
 *
 * 使用方式：
 *   npm run test:e2e                       # 通过隔离 runner 运行
 *   npm run test:e2e:ui                    # 通过隔离 runner 打开 UI 模式
 *   npx playwright test                    # 仅在显式设置 OPENPRISM_ALLOW_NON_ISOLATED_E2E=true 时允许
 */
const isolatedE2E = process.env.OPENPRISM_E2E_ISOLATED === '1';
const allowNonIsolatedE2E = process.env.OPENPRISM_ALLOW_NON_ISOLATED_E2E === 'true';
if (!isolatedE2E && !allowNonIsolatedE2E) {
  throw new Error('Refusing direct Playwright execution. Use npm run test:e2e (isolated runner), or explicitly set OPENPRISM_ALLOW_NON_ISOLATED_E2E=true for a controlled target.');
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results',

  /* 每个测试最长 30 秒 */
  timeout: 30_000,

  /* 每个 expect 最长 5 秒 */
  expect: { timeout: 5_000 },

  /*
   * The isolated runner owns one stateful backend and one temporary data root.
   * Running files in parallel makes project, RAG, provider, and locale mutations
   * race with each other, so this suite is intentionally serial until the
   * runner can provision one backend/data root per worker.
   */
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,

  /* 报告 */
  reporter: [
    ['html', { open: 'never', outputFolder: process.env.PLAYWRIGHT_HTML_REPORT || 'playwright-report' }],
    ['list'],
  ],

  /* 全局设置 */
  use: {
    baseURL: defaultBaseURL,
    // Retries are intentionally disabled because the isolated runner owns one
    // stateful backend/data root. Retain traces on the first failure instead of
    // waiting for a retry that will never occur.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
    actionTimeout: 10_000,
    extraHTTPHeaders: e2eApiToken
      ? { Authorization: `Bearer ${e2eApiToken}` }
      : undefined,
  },

  /* 浏览器项目 */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    },
  ],

  // `npm run test:e2e` owns an isolated backend and temporary data directory.
  // Keeping lifecycle control in one wrapper also guarantees cleanup on failure.
});
