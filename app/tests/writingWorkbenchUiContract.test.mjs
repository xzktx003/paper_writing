import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = path => readFile(join(process.cwd(), path), 'utf8');

describe('formal paper writing workbench UI contract', () => {
  it('exposes the evidence-aware writing workflow from the supported project workspace', async () => {
    const rightPanel = await read('apps/frontend/src/app/components/RightPanel.tsx');
    const workbench = await read('apps/frontend/src/app/components/WritingWorkbenchPanel.tsx');

    expect(rightPanel).toContain("'writing'");
    expect(rightPanel).toContain('WritingWorkbenchPanel');
    expect(rightPanel).toContain('right-panel-writing-tab');
    expect(rightPanel).toContain('handleUseWritingDraft');
    expect(rightPanel).toContain('onUseDraft={handleUseWritingDraft}');

    expect(workbench).toContain('data-testid="writing-workbench-panel"');
    expect(workbench).toContain('getWritingWorkbenchContext');
    expect(workbench).toContain('reviewWritingAnswer');
    expect(workbench).toContain('taskStarters');
    expect(workbench).toContain('agentReadiness');
    expect(workbench).toContain('evidencePack');
    expect(workbench).toContain('skills?.recommendations');
    expect(workbench).toContain('只生成建议，不会自动修改论文文件');
    expect(workbench).toContain('保留公式、引用键、数字和 LaTeX 命令');
    expect(workbench).toContain('带到 AI 对话');
    expect(workbench).toContain('审查 AI 草稿');
  });

  it('uses authenticated managed-project workbench endpoints', async () => {
    const api = await read('apps/frontend/src/app/api/writingWorkbenchApi.ts');

    expect(api).toContain("${workbenchBase(projectId)}/context");
    expect(api).toContain("${workbenchBase(projectId)}/review-answer");
    expect(api).toContain('encodeURIComponent(projectId)');
    expect(api).toContain('getWritingWorkbenchContext');
    expect(api).toContain('reviewWritingAnswer');
  });
});
