import { expect, test } from './fixtures';

test('Provider settings explain server token, model credentials, CLI login, and read-only scope', async ({ page }) => {
  await page.goto('/projects');
  await page.getByRole('button', { name: '设置' }).click();

  const guide = page.getByTestId('provider-setup-guide');
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('模型配置是可选的；即使没有模型，也可以打开项目、编辑和保存文件');
  await expect(guide).toContainText('服务器访问令牌用于保护当前 Paper Writer 服务，它不是模型 API Key');
  await expect(page.getByTestId('setup-step-server-access')).toContainText('当前浏览器标签页已应用服务器访问令牌');
  await expect(page.getByTestId('setup-step-provider')).toContainText('HTTP 提供方需要 API 地址和凭据');

  await page.getByLabel('模型提供方').selectOption('codex-cli');
  await expect(page.getByTestId('setup-step-credentials')).toContainText('服务器必须已经安装并登录该 CLI');
  await expect(page.getByTestId('setup-step-credentials')).toContainText('仅用于只读 Chat');
  await expect(page.getByTestId('setup-step-connection')).toContainText('测试连接');
});
