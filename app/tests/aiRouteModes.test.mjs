import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getToolsForMode, appendModeGuidance, executeTool, buildUserMessageContent,
  buildConversationHistory, buildConversationAttachmentMessages, normalizeProposedFileContent,
} from '../apps/backend/src/routes/ai.js';
import { buildOpenAIMessages } from '../apps/backend/src/services/llmService.js';

describe('AI PDF attachments', () => {
  it('includes text-like attachments instead of sending only their filename', async () => {
    const payload = Buffer.from('{"metric": 0.91}\n').toString('base64');
    const content = await buildUserMessageContent('Inspect this result', [{
      dataUrl: `data:application/json;base64,${payload}`,
      name: 'results.json',
      type: 'application/json',
    }]);
    expect(content.at(-1).text).toContain('{"metric": 0.91}');
  });

  it('rejects unsupported document formats instead of silently sending a filename', async () => {
    const payload = Buffer.from('binary-doc').toString('base64');
    await expect(buildUserMessageContent('Read this document', [{
      dataUrl: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${payload}`,
      name: 'draft.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }])).rejects.toMatchObject({ code: 'UNSUPPORTED_ATTACHMENT_TYPE' });
  });

  it('extracts PDF text into the user message sent to the model', async () => {
    const pdf = await readFile(join(process.cwd(), 'templates/arxiv/template.pdf'));
    const content = await buildUserMessageContent('Summarize this PDF', [{
      dataUrl: 'data:application/pdf;base64,' + pdf.toString('base64'),
      name: 'template.pdf',
      type: 'application/pdf',
      isImage: false,
      size: pdf.length,
    }]);

    expect(content[0]).toEqual({ type: 'text', text: 'Summarize this PDF' });
    expect(content[1].type).toBe('text');
    expect(content[1].text).toContain('[Attached PDF: template.pdf]');
    expect(content[1].text).toContain('A TEMPLATE FOR THE arxiv STYLE');

    const openAIMessages = buildOpenAIMessages('system', [{ role: 'user', content }]);
    expect(openAIMessages[1].role).toBe('user');
    expect(openAIMessages[1].content.map(block => block.text).join('\n')).toContain('Summarize this PDF');
    expect(openAIMessages[1].content.map(block => block.text).join('\n')).toContain('A TEMPLATE FOR THE arxiv STYLE');
  });

  it('keeps PDF text and prior messages as persistent conversation context', () => {
    const conv = {
      history: [
        { role: 'user', content: 'What is the paper about?' },
        { role: 'assistant', content: 'It studies testing.' },
      ],
      attachments: [{ name: 'paper.pdf', text: 'Persistent extracted PDF text.' }],
    };
    expect(buildConversationHistory(conv)).toEqual(conv.history);
    const attachmentMessages = buildConversationAttachmentMessages(conv);
    expect(attachmentMessages[0].content).toContain('paper.pdf');
    expect(attachmentMessages[0].content).toContain('Persistent extracted PDF text.');
  });
});

describe('AI conversation modes', () => {
  it('keeps Chat read-only, Agent proposal-only, and Tools fully tooled', () => {
    expect(getToolsForMode('chat')).toEqual([]);

    const agentTools = getToolsForMode('agent').map(tool => tool.name).sort();
    expect(agentTools).toEqual(['list_chapters', 'propose_edit', 'read_chapter', 'read_references'].sort());
    expect(agentTools).not.toContain('write_code');
    expect(agentTools).not.toContain('run_code');

    const toolsModeTools = getToolsForMode('tools').map(tool => tool.name);
    expect(toolsModeTools).toContain('write_code');
    expect(toolsModeTools).toContain('run_code');
    expect(toolsModeTools).toContain('propose_edit');
  });

  it('adds explicit mode guidance to the system prompt', () => {
    expect(appendModeGuidance('base prompt', 'chat')).toContain('Mode: Chat');
    expect(appendModeGuidance('base prompt', 'agent')).toContain('Use propose_edit');
    expect(appendModeGuidance('base prompt', 'agent')).toContain('do not directly write files');
    expect(appendModeGuidance('base prompt', 'agent')).toContain('COMPLETE updated file content');
    expect(appendModeGuidance('base prompt', 'agent')).toContain('click Accept or Reject');
    expect(appendModeGuidance('base prompt', 'agent')).toContain('Never claim that a file was changed');
    expect(appendModeGuidance('base prompt', 'tools')).toContain('controlled code/ file work');
  });
});

describe('Agent edit proposals', () => {
  let projectRoot;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'agent-edit-proposal-'));
    await mkdir(join(projectRoot, 'sec'), { recursive: true });
    await writeFile(join(projectRoot, 'sec', 'intro.tex'), 'Original line\n', 'utf8');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('returns a complete, non-writing diff proposal with the resolved project path', async () => {
    const result = JSON.parse(await executeTool('propose_edit', {
      filename: 'intro.tex',
      new_content: 'Revised line\nAdded line\n',
    }, projectRoot));

    expect(result.filename).toBe('sec/intro.tex');
    expect(result.original).toBe('Original line\n');
    expect(result.new_content).toBe('Revised line\nAdded line\n');
    expect(result.stats.added).toBeGreaterThan(0);
    expect(result.stats.removed).toBeGreaterThan(0);
    await expect(readFile(join(projectRoot, 'sec', 'intro.tex'), 'utf8')).resolves.toBe('Original line\n');
  });

  it('merges a paragraph-only rewrite back into the complete file', () => {
    const first = 'Academic writing is a complex document engineering process involving source files, citations, figures, templates, compilation logs, and collaboration across interconnected components.';
    const second = 'The emergence of large language models introduces new possibilities for assisted writing while creating verification and integration challenges.';
    const tail = '\\begin{itemize}\n  \\item Keep this entire list.\n\\end{itemize}\n';
    const original = `\\section{Introduction}\n\n${first}\n\n${second}\n\n${tail.repeat(12)}`;
    const revised = 'Academic writing is fundamentally a document engineering process involving source files, citations, figures, templates, compiler logs, and collaboration across tightly interconnected components.';

    const result = normalizeProposedFileContent(original, revised);
    expect(result.autoMerged).toBe(true);
    expect(result.content).toContain(revised);
    expect(result.content).toContain(second);
    expect(result.content).toContain('Keep this entire list.');
    expect(result.content.length).toBeGreaterThan(original.length * 0.8);
  });

  it('rejects an unmatched partial replacement instead of deleting the file tail', () => {
    const original = `\\section{Introduction}\n\n${'Original research discussion with citations and experimental evidence. '.repeat(30)}\n\n${'A separate conclusion that must remain intact. '.repeat(20)}`;
    expect(() => normalizeProposedFileContent(original, 'Completely unrelated short replacement text with no matching terminology.'))
      .toThrow(/prevent data loss/);
  });
});

describe('AI code tools', () => {
  let projectRoot;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'ai-code-tools-'));
    await mkdir(join(projectRoot, 'code'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('writes only inside the project code directory', async () => {
    await executeTool('write_code', { path: 'src/example.py', content: 'print("ok")\n' }, projectRoot);
    await expect(readFile(join(projectRoot, 'code', 'src', 'example.py'), 'utf8')).resolves.toBe('print("ok")\n');
  });

  it('rejects code path traversal attempts', async () => {
    await expect(executeTool('write_code', { path: '../outside.py', content: 'bad' }, projectRoot)).rejects.toThrow(/Path traversal/);
    await expect(access(join(projectRoot, 'outside.py'))).rejects.toThrow();

    await writeFile(join(projectRoot, 'outside.py'), 'secret', 'utf8');
    await expect(executeTool('read_code', { path: '../outside.py' }, projectRoot)).rejects.toThrow(/Path traversal/);
    await expect(executeTool('run_code', { script: '../outside.py' }, projectRoot)).rejects.toThrow(/Path traversal/);
  });
});
