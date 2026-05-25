import { chatCompletion, chatWithTools, chatCompletionStream } from '../services/llmService.js';
import { assemblePrompt } from '../services/skillEngine.js';
import { appendMessage, getConversation } from '../services/conversationStore.js';
import { readTextFile, writeTextFile, listDir } from '../services/fileManager.js';
import { executeScript } from '../services/codeExecutor.js';
import { join, resolve } from 'path';
import { safeJoin } from '../utils/pathUtils.js';
import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import { getProjectRoot } from '../services/projectService.js';
import { diffLines } from 'diff';

export async function resolveProjectPath(projectPath) {
  if (projectPath && projectPath.startsWith('__openprism__:')) {
    const id = projectPath.replace('__openprism__:', '');
    return await getProjectRoot(id);
  }
  return projectPath;
}

const TOOL_DEFINITIONS = [
  { name: 'read_chapter', description: 'Read a chapter file', input_schema: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] } },
  { name: 'list_chapters', description: 'List all chapter files', input_schema: { type: 'object', properties: {} } },
  { name: 'propose_edit', description: 'Propose an edit to a chapter (returns diff for user confirmation)', input_schema: { type: 'object', properties: { filename: { type: 'string' }, new_content: { type: 'string' } }, required: ['filename', 'new_content'] } },
  { name: 'list_code', description: 'List files and directories under code/ directory', input_schema: { type: 'object', properties: { path: { type: 'string' } } } },
  { name: 'read_code', description: 'Read a file from code/ directory', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'write_code', description: 'Write a file to code/ directory', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'run_code', description: 'Execute a script in code/ directory', input_schema: { type: 'object', properties: { script: { type: 'string' }, args: { type: 'array', items: { type: 'string' } } }, required: ['script'] } },
  { name: 'read_references', description: 'Read references.bib', input_schema: { type: 'object', properties: {} } },
];

const AGENT_TOOL_NAMES = new Set(['read_chapter', 'list_chapters', 'propose_edit', 'read_references']);

export function getToolsForMode(mode) {
  if (mode === 'agent') {
    return TOOL_DEFINITIONS.filter(tool => AGENT_TOOL_NAMES.has(tool.name));
  }
  if (mode === 'tools') {
    return TOOL_DEFINITIONS;
  }
  return [];
}

export function appendModeGuidance(systemPrompt, mode) {
  const guidance = {
    chat: 'Mode: Chat. Discuss, explain, and reason only. Do not modify files or claim that files were changed.',
    agent: 'Mode: Agent. Inspect context and propose paper edits for user confirmation. Use propose_edit for changes; do not directly write files, run code, or perform code-directory workflows.',
    tools: 'Mode: Tools. Use available tools for multi-step tasks, including controlled code/ file work when the user asks for it. Report tool actions and results clearly.',
  }[mode] || 'Mode: Unknown. Ask the user to choose Chat, Agent, or Tools.';
  return [systemPrompt, guidance].filter(Boolean).join('\n\n');
}

function normalizeCodePath(inputPath = '') {
  return String(inputPath).replace(/\\/g, '/').replace(/^\/+/, '').replace(/^code\/?/, '');
}

function resolveCodePath(projectPath, inputPath = '') {
  const codeRoot = resolve(projectPath, 'code');
  return safeJoin(codeRoot, normalizeCodePath(inputPath));
}

/** Build auto-injected context messages based on conversation scope */
async function buildContextMessages(conv, resolvedPath, projectConfig) {
  const ctx = [];
  try {
    if (conv.context_scope.type === 'chapter' && conv.context_scope.file) {
      const chapterContent = await readTextFile(join(resolvedPath, 'sec', conv.context_scope.file)).catch(() => '');
      if (chapterContent) {
        ctx.push({ role: 'user', content: `[System: Current chapter content — ${conv.context_scope.file}]\n\`\`\`latex\n${chapterContent}\n\`\`\`` });
        ctx.push({ role: 'assistant', content: 'I have read the current chapter content. Ready to help.' });
      }
    } else if (conv.context_scope.type === 'global') {
      const secDir = join(resolvedPath, 'sec');
      const chapDir = join(resolvedPath, 'chapters');
      const dir = existsSync(secDir) ? secDir : (existsSync(chapDir) ? chapDir : null);
      if (dir) {
        const entries = await listDir(dir);
        const texFiles = entries.filter(e => e.type === 'file' && e.name.endsWith('.tex')).slice(0, 10);
        const summaries = [];
        for (const f of texFiles) {
          try {
            const content = await readTextFile(join(dir, f.name));
            summaries.push(`## ${f.name}\n${content.slice(0, 400)}...`);
          } catch {}
        }
        if (summaries.length > 0) {
          ctx.push({ role: 'user', content: `[System: Paper structure overview]\n${summaries.join('\n\n')}` });
          ctx.push({ role: 'assistant', content: 'I have reviewed the paper structure. Ready to help.' });
        }
      }
    }
    // Inject references if not free scope
    if (conv.context_scope.type !== 'free') {
      try {
        const refsPath = join(resolvedPath, 'references.bib');
        if (existsSync(refsPath)) {
          const refs = await readTextFile(refsPath);
          if (refs.trim()) {
            ctx.unshift({ role: 'user', content: `[System: References]\n\`\`\`bibtex\n${refs.slice(0, 4000)}\n\`\`\`` });
            ctx.splice(1, 0, { role: 'assistant', content: 'I have read the references.' });
          }
        }
      } catch {}
    }
  } catch (e) {
    console.warn('Context injection failed:', e.message);
  }
  return ctx;
}

export function registerAIRoutes(fastify) {
  // ── SSE Streaming endpoint ──────────────────────────────
  fastify.post('/api/ai/stream', async (request, reply) => {
    const { projectId, convId, projectPath, userMessage, projectConfig } = request.body;

    const resolvedPath = await resolveProjectPath(projectPath);
    const conv = await getConversation(projectId, convId);
    await appendMessage(projectId, convId, { role: 'user', content: userMessage });

    const globalSkills = projectConfig?.global_skills || [];
    let chapterSkills = [];
    if (conv.context_scope.type === 'chapter') {
      const chapterConfig = (projectConfig?.chapters || []).find(c => c.file === conv.context_scope.file);
      chapterSkills = chapterConfig?.skills || [];
    }
    const manualSkill = conv.active_skills?.[0] || null;
    const systemPrompt = appendModeGuidance(assemblePrompt({ globalSkills, chapterSkills, manualSkill }), conv.mode);

    // Auto context injection: read current chapter / paper structure / references
    const contextMessages = await buildContextMessages(conv, resolvedPath, projectConfig);

    const messages = [...contextMessages, ...conv.history, { role: 'user', content: userMessage }];
    const modelOverride = conv.model || undefined;

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event, data) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      if (conv.mode === 'chat') {
        const result = await chatCompletionStream({
          systemPrompt, messages, model: modelOverride,
          onToken: (text) => sendEvent('token', { text }),
        });
        await appendMessage(projectId, convId, { role: 'assistant', content: result.fullText });
        sendEvent('done', { fullText: result.fullText });
      } else {
        // agent/tools mode with streaming
        let fullText = '';
        const result = await chatCompletionStream({
          systemPrompt, messages, tools: getToolsForMode(conv.mode), model: modelOverride,
          onToken: (text) => { fullText += text; sendEvent('token', { text }); },
          onToolUse: async (name, input) => {
            sendEvent('tool_use', { name, input });
            return await executeTool(name, input, resolvedPath);
          },
          onToolResult: (name, result) => {
            sendEvent('tool_result', { name, result: typeof result === 'string' ? result.slice(0, 2000) : String(result).slice(0, 2000) });
          },
        });
        await appendMessage(projectId, convId, { role: 'assistant', content: result.fullText });
        sendEvent('done', { fullText: result.fullText });
      }
    } catch (err) {
      const errorMsg = err.status === 402
        ? 'API quota exceeded. Please check your Claude API billing.'
        : `AI error: ${err.message || String(err)}`;
      sendEvent('error', { message: errorMsg });
    }

    reply.raw.end();
  });

  // ── Legacy non-streaming endpoint ────────────────────────
  fastify.post('/api/ai/send', async (request) => {
    const { projectId, convId, projectPath, userMessage, projectConfig } = request.body;

    const resolvedPath = await resolveProjectPath(projectPath);
    const conv = await getConversation(projectId, convId);
    await appendMessage(projectId, convId, { role: 'user', content: userMessage });

    const globalSkills = projectConfig?.global_skills || [];
    let chapterSkills = [];
    if (conv.context_scope.type === 'chapter') {
      const chapterConfig = (projectConfig?.chapters || []).find(c => c.file === conv.context_scope.file);
      chapterSkills = chapterConfig?.skills || [];
    }
    const manualSkill = conv.active_skills?.[0] || null;

    const systemPrompt = appendModeGuidance(assemblePrompt({ globalSkills, chapterSkills, manualSkill }), conv.mode);

    // Auto context injection
    const contextMessages = await buildContextMessages(conv, resolvedPath, projectConfig);
    const messages = [...contextMessages, ...conv.history, { role: 'user', content: userMessage }];
    const modelOverride = conv.model || undefined;

    try {
      if (conv.mode === 'chat') {
        const response = await chatCompletion({ systemPrompt, messages, model: modelOverride });
        const textBlock = response.content.find(b => b.type === 'text');
        const assistantMsg = textBlock?.text || '';
        await appendMessage(projectId, convId, { role: 'assistant', content: assistantMsg });
        return { reply: assistantMsg };
      }

      if (conv.mode === 'tools' || conv.mode === 'agent') {
        const result = await chatWithTools({
          systemPrompt,
          messages,
          tools: getToolsForMode(conv.mode),
          model: modelOverride,
          onToolUse: async (name, input) => {
            return await executeTool(name, input, resolvedPath);
          },
        });
        const lastContent = result.response.content;
        const textBlock = lastContent.find(b => b.type === 'text');
        const assistantMsg = textBlock?.text || '';
        await appendMessage(projectId, convId, { role: 'assistant', content: assistantMsg });
        return { reply: assistantMsg };
      }

      return { reply: 'Unknown mode' };
    } catch (err) {
      const errorMsg = err.status === 402
        ? 'API quota exceeded. Please check your Claude API billing.'
        : `AI error: ${err.message || String(err)}`;
      return { reply: errorMsg, error: true };
    }
  });
}

export async function executeTool(name, input, projectPath) {
  switch (name) {
    case 'read_chapter': {
      // Try sec/ first (OpenPrism), then chapters/ (new format)
      const filename = String(input.filename || '').replace(/^\/+/, '');
      const secPath = filename.startsWith('sec/') ? join(projectPath, filename) : join(projectPath, 'sec', filename);
      const chapPath = filename.startsWith('chapters/') ? join(projectPath, filename) : join(projectPath, 'chapters', filename);
      try {
        return await readTextFile(secPath);
      } catch {
        return await readTextFile(chapPath);
      }
    }
    case 'list_chapters': {
      const secDir = join(projectPath, 'sec');
      const chapDir = join(projectPath, 'chapters');
      const dir = existsSync(secDir) ? secDir : chapDir;
      return JSON.stringify(await listDir(dir));
    }
    case 'propose_edit': {
      // Read original file content for diff calculation
      const filename = String(input.filename || '').replace(/^\/+/, '');
      let original = '';
      for (const prefix of ['sec', 'chapters', '']) {
        try {
          const p = prefix ? join(projectPath, prefix, filename) : join(projectPath, filename);
          original = await readTextFile(p);
          break;
        } catch {}
      }
      const changes = diffLines(original, input.new_content);
      const added = changes.filter(c => c.added).reduce((n, c) => n + (c.count || 0), 0);
      const removed = changes.filter(c => c.removed).reduce((n, c) => n + (c.count || 0), 0);
      return JSON.stringify({
        filename: input.filename,
        original,
        new_content: input.new_content,
        stats: { added, removed },
        action: 'pending_approval'
      });
    }
    case 'list_code': {
      const rel = String(input.path || '').replace(/^\/+/, '').replace(/^code\/?/, '');
      const dir = resolveCodePath(projectPath, rel);
      return JSON.stringify(await listDir(dir));
    }
    case 'read_code':
      return await readTextFile(resolveCodePath(projectPath, input.path));
    case 'write_code':
      await writeTextFile(resolveCodePath(projectPath, input.path), input.content);
      return 'File written successfully';
    case 'run_code': {
      const codeRoot = resolve(projectPath, 'code');
      const args = Array.isArray(input.args) ? input.args.map(String) : [];
      const result = await executeScript(resolveCodePath(projectPath, input.script), { cwd: codeRoot, args });
      return `Exit code: ${result.code}\nStdout:\n${result.stdout}\nStderr:\n${result.stderr}`;
    }
    case 'read_references':
      return await readReferences(projectPath);
    default:
      return `Tool ${name} not implemented`;
  }
}

async function readReferences(projectPath) {
  const defaultPath = join(projectPath, 'references.bib');
  if (existsSync(defaultPath)) return await readTextFile(defaultPath);

  const entries = await fs.readdir(projectPath, { withFileTypes: true });
  const bib = entries
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.bib'))
    .map(entry => entry.name)
    .sort()[0];
  if (!bib) return 'No .bib file found in project root.';
  return await readTextFile(join(projectPath, bib));
}
