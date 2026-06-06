import { defineConfig, devices } from '@playwright/test';

const defaultBaseURL = process.env.BASE_URL || process.env.OPENPRISM_PUBLIC_URL || 'http://10.30.0.22:8787';

/**
 * Paper Agent Playwright E2E 测试配置
 *
 * 使用方式：
 *   npx playwright test                    # 运行所有测试
 *   npx playwright test --project=chromium # 只跑 Chromium
 *   npx playwright test tests/e2e/         # 只跑 e2e 目录
 *   npx playwright test --ui               # 打开 Playwright UI 模式
 *   npx playwright show-report             # 查看测试报告
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',

  /* 每个测试最长 30 秒 */
  timeout: 30_000,

  /* 每个 expect 最长 5 秒 */
  expect: { timeout: 5_000 },

  /* 并行执行 */
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  /* 报告 */
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  /* 全局设置 */
  use: {
    baseURL: defaultBaseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
    actionTimeout: 10_000,
  },

  /* 浏览器项目 */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath:
            process.env.CHROMIUM_PATH ||
            '/data01/home/xuzk/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    },
  ],

  /* 不自动启动 webServer —— 假设 dev 已在运行 */
  /* 如需自动启动，取消注释：
  webServer: {
    command: 'npm run dev',
    url: defaultBaseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  */
});
