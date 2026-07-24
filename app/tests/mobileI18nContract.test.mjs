import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';

const frontend = (...parts) => join(process.cwd(), 'apps/frontend/src', ...parts);

describe('mobile workspace and localization contracts', () => {
  it('keeps the document language synchronized with i18next', async () => {
    const source = await readFile(frontend('i18n/index.ts'), 'utf8');
    expect(source).toContain('document.documentElement.lang');
    expect(source).toContain("lng.startsWith('zh') ? 'zh-CN' : 'en-US'");
  });

  it('has local CJK-capable font fallbacks and responsive project-list rules', async () => {
    const css = await readFile(frontend('app/App.css'), 'utf8');
    expect(css).toMatch(/Noto Sans CJK SC|Noto Sans SC/);
    expect(css).toMatch(/Microsoft YaHei|PingFang SC/);
    expect(css).toContain('@media (max-width: 800px)');
    expect(css).toContain('.project-shell');
    expect(css).toContain('.project-table-row');
  });

  it('provides mutually exclusive Files, Editor, and Assistant mobile views', async () => {
    const layout = await readFile(frontend('app/components/Layout.tsx'), 'utf8');
    const css = await readFile(frontend('app/components/Layout.module.css'), 'utf8');
    expect(layout).toContain("type MobileView = 'files' | 'editor' | 'assistant'");
    expect(layout).toContain('mobileWorkspaceTabs');
    expect(layout).toContain('data-mobile-view');
    expect(css).toContain('@media (max-width: 800px)');
    expect(css).toContain('.mobileWorkspaceTabs');
  });

  it.each([
    ['app/components/Layout.tsx', 'AI Assistant'],
    ['app/components/ProjectTree.tsx', 'Upload'],
    ['app/components/NewConversationDialog.tsx', 'New Conversation'],
    ['app/components/PaperRagPanel.tsx', 'Research corpus'],
  ])('routes core user-visible text in %s through i18n', async (relativePath, key) => {
    const source = await readFile(frontend(...relativePath.split('/')), 'utf8');
    expect(source).toContain('useTranslation');
    expect(source).toContain(`t('${key}'`);
  });

  it('keeps English and Chinese locale key sets identical', async () => {
    const [en, zh] = await Promise.all([
      import('../apps/frontend/src/i18n/locales/en-US.json', { with: { type: 'json' } }),
      import('../apps/frontend/src/i18n/locales/zh-CN.json', { with: { type: 'json' } }),
    ]);
    expect(Object.keys(en.default).sort()).toEqual(Object.keys(zh.default).sort());
  });
});
