import { chromium } from 'playwright';

const CHROMIUM_PATH = '/data01/home/xuzk/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome';
const FRONTEND_URL = process.env.BASE_URL || process.env.OPENPRISM_PUBLIC_URL || 'http://10.30.0.22:8787';
const BACKEND_URL = process.env.BACKEND_URL || process.env.OPENPRISM_PUBLIC_URL || 'http://10.30.0.22:8787';

let browser, page;
let passed = 0, failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

async function main() {
  console.log('Starting E2E smoke tests...\n');

  browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  page = await browser.newPage();

  // === Backend Health ===
  console.log('Backend:');
  await test('health endpoint returns ok', async () => {
    const res = await fetch(`${BACKEND_URL}/api/health`);
    const data = await res.json();
    if (!data.ok) throw new Error(`Expected ok, got ${JSON.stringify(data)}`);
  });

  await test('config endpoint returns defaults', async () => {
    const res = await fetch(`${BACKEND_URL}/api/config`);
    const data = await res.json();
    if (!data.claude_model) throw new Error('Missing claude_model in config');
  });

  await test('skills endpoint returns 20 skills', async () => {
    const res = await fetch(`${BACKEND_URL}/api/skills`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Expected array');
    if (data.length < 20) throw new Error(`Expected >=20 skills, got ${data.length}`);
  });

  // === Frontend Rendering ===
  console.log('\nFrontend:');
  await test('page loads without errors', async () => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });
    // Allow minor React dev warnings but not crashes
    const critical = errors.filter(e => !e.includes('Warning'));
    if (critical.length > 0) throw new Error(`Page errors: ${critical.join('; ')}`);
  });

  await test('three-panel layout renders', async () => {
    // Left panel (Project)
    const leftText = await page.textContent('body');
    if (!leftText.includes('Project')) throw new Error('Left panel "Project" text not found');
  });

  await test('shows "No project open" state', async () => {
    const text = await page.textContent('body');
    if (!text.includes('No project open')) throw new Error('"No project open" not found');
  });

  await test('shows "Open a file from the project tree" in center', async () => {
    const text = await page.textContent('body');
    if (!text.includes('Open a file from the project tree')) throw new Error('Center panel placeholder not found');
  });

  await test('shows "+ New Conversation" button in right panel', async () => {
    const btn = await page.locator('button:has-text("New Conversation")');
    if (await btn.count() === 0) throw new Error('New Conversation button not found');
  });

  await test('terminal toggle button exists', async () => {
    const btn = await page.locator('button:has-text("Terminal")');
    if (await btn.count() === 0) throw new Error('Terminal toggle button not found');
  });

  await test('clicking terminal toggle shows terminal panel', async () => {
    await page.locator('button:has-text("Terminal")').click();
    await page.waitForTimeout(500);
    const terminalEl = await page.locator('text=Terminal').first();
    if (await terminalEl.count() === 0) throw new Error('Terminal panel not visible after toggle');
  });

  await test('Open Project button exists', async () => {
    const btn = await page.locator('button:has-text("Open Project")');
    if (await btn.count() === 0) throw new Error('Open Project button not found');
  });

  await test('New Project button exists', async () => {
    const btn = await page.locator('button:has-text("New Project")');
    if (await btn.count() === 0) throw new Error('New Project button not found');
  });

  await test('clicking New Conversation opens dialog', async () => {
    await page.locator('button:has-text("New Conversation")').click();
    await page.waitForTimeout(300);
    const dialog = await page.locator('text=New Conversation').first();
    if (await dialog.count() === 0) throw new Error('New Conversation dialog not opened');
    // Check dialog has scope options
    const scopeSelect = await page.locator('select');
    if (await scopeSelect.count() === 0) throw new Error('No select elements in dialog');
  });

  await test('conversation dialog has mode options', async () => {
    const text = await page.textContent('body');
    if (!text.includes('Chat')) throw new Error('Chat mode option not found');
    if (!text.includes('Agent')) throw new Error('Agent mode option not found');
  });

  await test('cancel closes dialog', async () => {
    await page.locator('button:has-text("Cancel")').click();
    await page.waitForTimeout(200);
    const dialogs = await page.locator('h3:has-text("New Conversation")');
    if (await dialogs.count() > 0) throw new Error('Dialog still visible after cancel');
  });

  // === Summary ===
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(40)}`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
