// The active Paper Writer Playwright configuration lives in app/.
// Keep this root shim explicit so `npx playwright test` cannot silently run
// the retired Coding Kanban suite from the repository root.
import config from './app/playwright.config.ts';

export default config;
