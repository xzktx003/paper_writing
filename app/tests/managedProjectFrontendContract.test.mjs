import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import {
  externalProjectRequest,
  managedProjectRequest,
  projectRequestBody,
  projectRequestFromReference,
} from '../apps/frontend/src/app/api/projectRequestContext.ts';

const read = relative => readFile(new URL(relative, import.meta.url), 'utf8');

function functionBody(source, name) {
  const signature = `function ${name}`;
  const signatureIndex = source.indexOf(signature);
  expect(signatureIndex, `${name} should be declared`).toBeGreaterThanOrEqual(0);
  const parametersStart = source.indexOf('(', signatureIndex);
  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === '(') parameterDepth += 1;
    if (source[index] === ')') {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        bodyStart = source.indexOf('{', index);
        break;
      }
    }
  }
  expect(bodyStart, `${name} should have a body`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(bodyStart + 1, index);
  }
  throw new Error(`Unable to read ${name} body`);
}

describe('formal React managed-project request contract', () => {
  it('serializes managed and explicit external contexts without the marker protocol', () => {
    expect(projectRequestBody(managedProjectRequest('managed-project'))).toEqual({
      projectId: 'managed-project',
    });
    expect(projectRequestBody(externalProjectRequest('/tmp/external-project'))).toEqual({
      externalProjectPath: '/tmp/external-project',
    });
    expect(projectRequestFromReference('__paper_agent__:legacy-project')).toEqual({
      kind: 'managed',
      projectId: 'legacy-project',
    });
    expect(() => managedProjectRequest('../escape')).toThrow(/valid managed projectId/i);
    expect(() => externalProjectRequest('relative/project')).toThrow(/absolute external project path/i);
  });

  it('uses projectId plus relativePath in every formal chapter API function', async () => {
    const projectApi = await read('../apps/frontend/src/app/api/projectApi.ts');
    const functions = {
      readChapter: ['chapters/read', 'relativePath'],
      writeChapter: ['chapters/write', 'relativePath'],
      createChapter: ['chapters/create', 'relativePath'],
      reorderChapters: ['chapters/reorder', 'order'],
    };
    for (const [name, [endpoint, field]] of Object.entries(functions)) {
      const body = functionBody(projectApi, name);
      expect(body).toContain(endpoint);
      expect(body).toContain('projectRequestBody(context)');
      expect(body).toContain(field);
      expect(body).not.toMatch(/\bprojectPath\b|__paper_agent__/);
    }
  });

  it('uses managed context in AI, review, anti-AI, citation and pipeline request functions', async () => {
    const conversationApi = await read('../apps/frontend/src/app/api/conversationApi.ts');
    for (const name of [
      'sendMessage',
      'sendMessageStream',
      'structuredReview',
      'detectAntiAi',
      'detectAntiAiDeep',
      'detectAntiAiGPTZero',
      'startPipelineV2',
      'verifyCitations',
      'verifyTexCitations',
      'crossCheckCitations',
    ]) {
      const body = functionBody(conversationApi, name);
      expect(body).toContain('projectRequestBody(context)');
      expect(body).not.toMatch(/\bprojectPath\b|__paper_agent__/);
    }
  });

  it('does not opt formal paper-writing backend routes into arbitrary external project paths', async () => {
    for (const relative of [
      '../apps/backend/src/routes/ai.js',
      '../apps/backend/src/routes/review.js',
      '../apps/backend/src/routes/antiAi.js',
      '../apps/backend/src/routes/citationVerification.js',
      '../apps/backend/src/routes/pipelineV2.js',
    ]) {
      const source = await read(relative);
      expect(source, relative).not.toContain('allowExternalProjectPath: true');
    }
  });

  it('uses projectId query parameters for managed watcher and terminal sockets', async () => {
    const watcher = await read('../apps/frontend/src/app/hooks/useFileWatcher.ts');
    const terminal = await read('../apps/frontend/src/app/components/TerminalPanel.tsx');
    const watcherBody = functionBody(watcher, 'useFileWatcher');
    const terminalBody = functionBody(terminal, 'TerminalPanel');
    expect(watcherBody).toContain('new URLSearchParams({ projectId })');
    expect(watcherBody).not.toMatch(/projectPath|__paper_agent__/);
    expect(terminalBody).toMatch(/new URLSearchParams\(\{[\s\S]*projectId,[\s\S]*\}\)/);
    expect(terminalBody).not.toMatch(/\bcwd\b|projectPath|__paper_agent__/);
  });

  it('passes managed request contexts from the formal React call sites', async () => {
    const appContext = await read('../apps/frontend/src/app/context/AppContext.tsx');
    const conversations = await read('../apps/frontend/src/app/hooks/useConversations.ts');
    const rightPanel = await read('../apps/frontend/src/app/components/RightPanel.tsx');
    const pipelinePanel = await read('../apps/frontend/src/app/components/PipelinePanelV2.tsx');
    expect(appContext).toMatch(/projectId\s*\?\s*managedProjectRequest\(projectId\)/);
    expect(appContext).toContain('readChapter(requestContext, file.path)');
    expect(appContext).toContain('writeChapter(requestContext, file.filename, file.content)');
    expect(conversations).toContain('sendMessageStream(projectId, activeConv.id, requestContext');
    expect(conversations).toContain('writeChapter(requestContext, chapterFilename, edit.new_content)');
    for (const call of [
      'structuredReview(requestContext)',
      'detectAntiAi(requestContext)',
      'detectAntiAiDeep(requestContext)',
      'detectAntiAiGPTZero(requestContext)',
      'verifyCitations(requestContext',
      'crossCheckCitations(requestContext',
    ]) expect(rightPanel).toContain(call);
    expect(pipelinePanel).toContain('startPipelineV2(selectedPreset, managedProjectRequest(projectId), chapterScope)');
  });

  it('retains explicit absolute-path contracts for external code and MCP capabilities', async () => {
    const projectApi = await read('../apps/frontend/src/app/api/projectApi.ts');
    const codeRoutes = await read('../apps/backend/src/routes/code.js');
    const mcpServer = await read('../apps/backend/src/services/mcpServer.js');
    expect(functionBody(projectApi, 'readCodeFile')).toContain('{ projectPath, filePath }');
    expect(functionBody(projectApi, 'getCodeTree')).toContain('{ projectPath }');
    expect(codeRoutes).toContain('const { projectPath, filePath } = request.body');
    expect(codeRoutes).toContain('assertWithinDataDir(projectPath)');
    expect(mcpServer).toContain("required: ['projectPath']");
  });
});
