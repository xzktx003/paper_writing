import { expect, test } from '@playwright/test';

declare const process: {
  cwd(): string;
};

test.describe('Discovery Dialog', () => {
  test('TopBar has scan tmux dropdown button', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // TopBar should have the tmux scan button
    const scanTmuxBtn = page.locator('text=扫描 tmux');
    await expect(scanTmuxBtn).toBeVisible();
  });

  test('TopBar has scan apps dropdown button', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const scanAppsBtn = page.locator('text=扫描会话');
    await expect(scanAppsBtn).toBeVisible();
  });

  test('clicking scan tmux opens host dropdown then dialog', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Click the tmux scan button
    const scanTmuxBtn = page.locator('text=扫描 tmux');
    await scanTmuxBtn.click();

    // Should see host dropdown with 本机 option
    const localOption = page.locator('.host-dropdown-item', { hasText: '本机' });
    await expect(localOption).toBeVisible();

    // Select local host
    await localOption.click();

    // Dialog should open
    const dialog = page.locator('.discovery-dialog');
    await expect(dialog).toBeVisible();

    // Title should indicate tmux
    await expect(
      page.locator('.discovery-dialog-title'),
    ).toContainText('发现 tmux 会话');
  });

  test('clicking scan apps opens host dropdown then dialog', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const scanAppsBtn = page.locator('text=扫描会话');
    await scanAppsBtn.click();

    const localOption = page.locator('.host-dropdown-item', { hasText: '本机' });
    await expect(localOption).toBeVisible();

    await localOption.click();

    const dialog = page.locator('.discovery-dialog');
    await expect(dialog).toBeVisible();

    await expect(
      page.locator('.discovery-dialog-title'),
    ).toContainText('发现会话');
  });

  test('host dropdown menu keeps a scrollable container for long machine lists', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    await page.locator('text=扫描 tmux').click();

    const menu = page.locator('.host-dropdown-menu');
    await expect(menu).toBeVisible();

    const styles = await menu.evaluate((element) => {
      const computed = window.getComputedStyle(element);
      return {
        overflowY: computed.overflowY,
        maxHeight: computed.maxHeight,
      };
    });

    expect(styles.overflowY).toBe('auto');
    expect(styles.maxHeight).not.toBe('none');
  });

  test('Cmd+Shift+S opens tmux discovery dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Press Cmd+Shift+S (Meta on macOS)
    await page.keyboard.press('Meta+Shift+KeyS');

    const dialog = page.locator('.discovery-dialog');
    await expect(dialog).toBeVisible();

    await expect(
      page.locator('.discovery-dialog-title'),
    ).toContainText('发现 tmux 会话');
  });

  test('ESC closes the discovery dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Open dialog via keyboard
    await page.keyboard.press('Meta+Shift+KeyS');

    const dialog = page.locator('.discovery-dialog');
    await expect(dialog).toBeVisible();

    // Press ESC
    await page.keyboard.press('Escape');

    // Dialog should be gone
    await expect(dialog).not.toBeVisible();
  });

  test('clicking overlay closes the discovery dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    await page.keyboard.press('Meta+Shift+KeyS');

    const dialog = page.locator('.discovery-dialog');
    await expect(dialog).toBeVisible();

    // Click on overlay (outside dialog)
    const overlay = page.locator('.discovery-overlay');
    await overlay.click({ position: { x: 10, y: 10 } });

    await expect(dialog).not.toBeVisible();
  });

  test('tmux panel shows refresh button and search', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    await page.keyboard.press('Meta+Shift+KeyS');

    const dialog = page.locator('.discovery-dialog');
    await expect(dialog).toBeVisible();

    // Should have search input
    const search = dialog.locator('.discovery-search');
    await expect(search).toBeVisible();

    // Should have refresh button
    const refreshBtn = dialog.locator('text=刷新');
    await expect(refreshBtn).toBeVisible();
  });

  test('scanning tmux does not auto-add sessions into the grid', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const beforeCount = await page.locator('.grid-card').count();

    await page.locator('text=扫描 tmux').click();
    await page.locator('.host-dropdown-item', { hasText: '本机' }).click();

    await expect(page.locator('.discovery-dialog')).toBeVisible();
    await page.waitForTimeout(1500);

    await expect(page.locator('.grid-card')).toHaveCount(beforeCount);
    await expect(page.locator('.discovery-error')).toHaveCount(0);
  });

  test('layout fold toggle works', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const collapseBtn = page.locator('.top-bar-collapse-btn');
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();

    await expect(page.locator('.top-bar--collapsed')).toBeVisible();

    const expandBtn = page.locator('.top-bar-expand-btn');
    await expandBtn.click();

    await expect(page.locator('.top-bar--collapsed')).toHaveCount(0);
    await expect(page.locator('.top-bar-title')).toContainText('Coding Kanban');
  });
});
