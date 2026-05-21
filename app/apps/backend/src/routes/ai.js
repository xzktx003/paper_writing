import { chatCompletion, chatWithTools } from '../services/claudeService.js';
import { assemblePrompt } from '../services/skillEngine.js';
import { appendMessage, getConversation } from '../services/conversationStore.js';
import { readTextFile, writeTextFile, listDir } from '../services/fileManager.js';
import { executeScript } from '../services/codeExecutor.js';
import { join } from 'path';

const AI_TOOLS = [
  { name: 'read_chapter', description: 'Read a chapter file', input_schema: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] } },
  { name: 'list_chapters', description: 'List all chapter files', input_schema: { type: 'object', properties: {} } },
  { name: 'propose_edit', description: 'Propose an edit to a chapter (returns diff for user confirmation)', input_schema: { type: 'object', properties: { filename: { type: 'string' }, new_content: { type: 'string' } }, required: ['filename', 'new_content'] } },
  { name: 'read_code', description: 'Read a file from code/ directory', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'write_code', description: 'Write a file to code/ directory', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'run_code', description: 'Execute a script in code/ directory', input_schema: { type: 'object', properties: { script: { type: 'string' }, args: { type: 'array', items: { type: 'string' } } }, required: ['script'] } },
  { name: 'read_references', description: 'Read references.bib', input_schema: { type: 'object', properties: {} } },
];

export function registerAIRoutes(fastify) {
  fastify.post('/api/ai/send', async (request) => {
    const { projectId, convId, projectPath, userMessage, projectConfig } = request.body;

    const conv = await getConversation(projectId, convId);
    await appendMessage(projectId, convId, { role: 'user', content: userMessage });

    const globalSkills = projectConfig.global_skills || [];
    let chapterSkills = [];
    if (conv.context_scope.type === 'chapter') {
      const chapterConfig = (projectConfig.chapters || []).find(c => c.file === conv.context_scope.file);
      chapterSkills = chapterConfig?.skills || [];
    }
    const manualSkill = conv.active_skills?.[0] || null;

    const systemPrompt = assemblePrompt({ globalSkills, chapterSkills, manualSkill });

    const messages = [...conv.history, { role: 'user', content: userMessage }];

    if (conv.mode === 'chat') {
      const response = await chatCompletion({ systemPrompt, messages });
      const assistantMsg = response.content[0].text;
      await appendMessage(projectId, convId, { role: 'assistant', content: assistantMsg });
      return { reply: assistantMsg };
    }

    if (conv.mode === 'tools' || conv.mode === 'agent') {
      const result = await chatWithTools({
        systemPrompt,
        messages,
        tools: AI_TOOLS,
        onToolUse: async (name, input) => {
          return await executeTool(name, input, projectPath);
        },
      });
      const lastContent = result.response.content;
      const textBlock = lastContent.find(b => b.type === 'text');
      const assistantMsg = textBlock?.text || '';
      await appendMessage(projectId, convId, { role: 'assistant', content: assistantMsg });
      return { reply: assistantMsg };
    }

    return { reply: 'Unknown mode' };
  });
}

async function executeTool(name, input, projectPath) {
  switch (name) {
    case 'read_chapter':
      return await readTextFile(join(projectPath, 'chapters', input.filename));
    case 'list_chapters':
      return JSON.stringify(await listDir(join(projectPath, 'chapters')));
    case 'propose_edit':
      return JSON.stringify({ filename: input.filename, new_content: input.new_content, action: 'pending_approval' });
    case 'read_code':
      return await readTextFile(join(projectPath, 'code', input.path));
    case 'write_code':
      await writeTextFile(join(projectPath, 'code', input.path), input.content);
      return 'File written successfully';
    case 'run_code':
      const result = await executeScript(join(projectPath, 'code', input.script), { cwd: join(projectPath, 'code'), args: input.args || [] });
      return `Exit code: ${result.code}\nStdout:\n${result.stdout}\nStderr:\n${result.stderr}`;
    case 'read_references':
      return await readTextFile(join(projectPath, 'references.bib'));
    default:
      return `Tool ${name} not implemented`;
  }
}
