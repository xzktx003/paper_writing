import { expect, test as base } from '@playwright/test';

const TOKEN = String(process.env.OPENPRISM_E2E_API_TOKEN || '').trim();

export const test = base.extend({
  page: async ({ page }, use) => {
    if (TOKEN) {
      await page.addInitScript((token) => {
        window.sessionStorage.setItem('paper-agent-server-access-token', token);
      }, TOKEN);
    }
    await use(page);
  },
});

export { expect };
