import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';

const frontend = (...parts) => join(process.cwd(), 'apps/frontend/src', ...parts);

const panelContracts = [
  {
    file: 'CenterPanel.tsx',
    keys: [
      'Loading editor surface…',
      'Open a file from the project tree',
      'Main document',
      'Current file',
      'Compile final PDF',
    ],
  },
  {
    file: 'RightPanel.tsx',
    keys: [
      'Loading panel…',
      'No active conversation',
      'New Conversation',
      'Remove file',
      'Attach image',
    ],
  },
  {
    file: 'ReviewReportPanel.tsx',
    keys: [
      'Running peer review...',
      'No review report yet',
      'Run Structured Review',
      'Summary',
      'Revision Checklist',
    ],
  },
  {
    file: 'PipelinePanelV2.tsx',
    keys: [
      'Composable multi-stage workflows with typed executors',
      'New pipeline',
      'Start Pipeline',
      'Optional feedback or edits...',
      'Output',
    ],
  },
  {
    file: 'CitationVerificationPanel.tsx',
    keys: [
      'Citation Verification',
      'Citation verification failed: {{error}}',
      'Cross-checking project citations...',
      'No citations to verify',
      'Bibliography',
    ],
  },
  {
    file: 'AntiAiPanel.tsx',
    keys: [
      'AI Writing Detection Score',
      'AI Probability',
      'Human Probability',
      'Scanning writing patterns...',
      'No quick scan results yet. Click "Re-scan" above to start.',
    ],
  },
  {
    file: 'DrawPanel.tsx',
    keys: [
      'Step 1: Generate Image Prompt',
      'Paper Content',
      'Generated Prompt',
      'Step 2: Generate Image',
      'Select Image to Edit',
      'Server-managed image API',
    ],
  },
];

describe('primary workspace panel localization contracts', () => {
  it.each(panelContracts)('$file routes audited user-visible copy through i18n', async ({ file, keys }) => {
    const source = await readFile(frontend('app/components', file), 'utf8');
    expect(source).toContain('useTranslation');
    for (const key of keys) {
      expect(source, `${file} must translate ${JSON.stringify(key)}`).toContain(`t('${key}'`);
    }
  });

  it('defines every audited key in both locales with a real Chinese translation', async () => {
    const [en, zh] = await Promise.all([
      import('../apps/frontend/src/i18n/locales/en-US.json', { with: { type: 'json' } }),
      import('../apps/frontend/src/i18n/locales/zh-CN.json', { with: { type: 'json' } }),
    ]);
    const keys = panelContracts.flatMap(({ keys }) => keys);
    for (const key of keys) {
      expect(en.default[key], `missing en-US key: ${key}`).toBeTypeOf('string');
      expect(zh.default[key], `missing zh-CN key: ${key}`).toBeTypeOf('string');
      expect(zh.default[key], `zh-CN must translate: ${key}`).not.toBe(en.default[key]);
    }
  });
});
