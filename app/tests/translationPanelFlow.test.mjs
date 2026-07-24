import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';

const centerPanelUrl = new URL('../apps/frontend/src/app/components/CenterPanel.tsx', import.meta.url);
const conversationApiUrl = new URL('../apps/frontend/src/app/api/conversationApi.ts', import.meta.url);
const aiRouteUrl = new URL('../apps/backend/src/routes/ai.js', import.meta.url);

describe('preview translation flow', () => {
  it('uses the streaming AI path and always cleans up its temporary conversation', async () => {
    const [source, conversationApi, aiRoute] = await Promise.all([
      readFile(centerPanelUrl, 'utf8'),
      readFile(conversationApiUrl, 'utf8'),
      readFile(aiRouteUrl, 'utf8'),
    ]);

    expect(source).toContain('sendMessageStream(');
    expect(source).toContain('onToken:');
    expect(source).toContain('onDone:');
    expect(source).toContain('onError:');
    expect(source).toContain('{ ephemeralConversation: true }');
    expect(source).not.toContain('translateConvIdRef');
    expect(source).not.toContain('await sendMessage(projectId, convId');
    expect(conversationApi).toContain('ephemeralConversation: options.ephemeralConversation === true');
    expect(aiRoute).toContain('ephemeralConversation');
    expect(aiRoute).toContain('await deleteConversation(conversationStoreProjectId, convId)');
  });

  it('renders per-file Markdown translations with math and only replaces them on explicit retranslation', async () => {
    const source = await readFile(centerPanelUrl, 'utf8');

    expect(source).toContain('Record<string, TranslationState>');
    expect(source).toContain('translations[activeFile.filename]');
    expect(source).toContain("handleTranslate(false)");
    expect(source).toContain("handleTranslate(true)");
    expect(source).toContain("t('Retranslate')");
    expect(source).toContain('filename="translation.md"');
    expect(source).toContain('content={translationResult}');
    expect(source).toContain('将行内公式转换为 `$...$`');
    expect(source).toContain('将独立公式转换为 `$$...$$`');
    expect(source).toContain('展开为 KaTeX 支持的标准 LaTeX 命令');
    expect(source).toContain('移除公式内部的');
    expect(source).toContain('KaTeX 不支持的命令');
  });
});
