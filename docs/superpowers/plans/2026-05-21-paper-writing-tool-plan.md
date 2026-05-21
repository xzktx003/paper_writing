# Paper Writing Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork OpenPrism and transform it into a local-first academic paper writing tool with Markdown/LaTeX dual-mode editing, multi-conversation AI panel, skill system, code execution, and embedded terminal.

**Architecture:** Three-panel layout (project tree | editor | AI conversations). Backend: Fastify 4 + Anthropic SDK + node-pty. Frontend: React 18 + CodeMirror 6 + xterm.js. All data local filesystem.

**Tech Stack:** React 18, Vite 5, Fastify 4, CodeMirror 6, @anthropic-ai/sdk, xterm.js, node-pty, pdfjs-dist, Pandoc

---

## Phase 1: Project Bootstrap & Cleanup

### Task 1: Fork and Strip OpenPrism

**Files:**
- Remove: `packages/shared/` (Yjs collab types)
- Remove: all Yjs/y-codemirror imports in `apps/frontend/src/`
- Remove: `apps/backend/src/routes/collab.js`
- Remove: localtunnel/ngrok/cloudflared references
- Modify: `apps/backend/src/index.js` (remove collab/tunnel route registration)
- Modify: `apps/frontend/package.json` (remove yjs, y-codemirror.next, y-protocols)
- Modify: `apps/backend/package.json` (remove yjs, y-protocols, lib0, localtunnel, @ngrok/ngrok)

- [ ] **Step 1: Clone OpenPrism**

```bash
cd /data01/home/xuzk/workspace/ai_agent/paper_wrighting
git clone https://github.com/OpenDCAI/OpenPrism.git app
cd app
git remote rename origin upstream
git checkout -b dev
```

- [ ] **Step 2: Remove Yjs collaboration packages from frontend**

```bash
cd apps/frontend
npm remove yjs y-codemirror.next y-protocols
```

- [ ] **Step 3: Remove Yjs collaboration packages from backend**

```bash
cd apps/backend
npm remove yjs y-protocols lib0 localtunnel @ngrok/ngrok
```

- [ ] **Step 4: Delete collab route and tunnel references**

Delete `apps/backend/src/routes/collab.js`. In `apps/backend/src/index.js`, remove the import and registration of the collab route. Remove any localtunnel/ngrok/cloudflared route registrations.

- [ ] **Step 5: Remove Yjs imports from EditorPage**

In `apps/frontend/src/app/EditorPage.tsx`, remove all imports from `y-codemirror.next`, `yjs`, and the collab provider (`../collab/provider`). Remove the Yjs document initialization and awareness setup. Keep the CodeMirror editor setup intact.

- [ ] **Step 6: Delete frontend collab directory**

```bash
rm -rf apps/frontend/src/collab/
```

- [ ] **Step 7: Verify the app still builds**

```bash
cd /data01/home/xuzk/workspace/ai_agent/paper_wrighting/app
npm install
npm run build
```

Expected: Build succeeds with no Yjs-related errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: strip Yjs collaboration and tunneling dependencies"
```


### Task 2: Replace LangChain with Anthropic SDK

**Files:**
- Modify: `apps/backend/package.json` (remove langchain, add @anthropic-ai/sdk)
- Create: `apps/backend/src/services/claudeService.js`
- Delete: `apps/backend/src/services/agentService.js`
- Delete: `apps/backend/src/services/llmService.js`
- Modify: `apps/backend/src/routes/agent.js` → rename to `apps/backend/src/routes/ai.js`

- [ ] **Step 1: Remove LangChain packages**

```bash
cd apps/backend
npm remove @langchain/core @langchain/openai @langchain/langgraph langchain
```

- [ ] **Step 2: Install Anthropic SDK**

```bash
cd apps/backend
npm install @anthropic-ai/sdk
```

- [ ] **Step 3: Create claudeService.js**

```javascript
// apps/backend/src/services/claudeService.js
import Anthropic from '@anthropic-ai/sdk';

let client = null;

export function initClaude(apiKey) {
  client = new Anthropic({ apiKey });
}

export async function chatCompletion({ systemPrompt, messages, tools, stream }) {
  const params = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: systemPrompt,
    messages,
  };
  if (tools && tools.length > 0) {
    params.tools = tools;
  }
  if (stream) {
    return client.messages.stream(params);
  }
  return client.messages.create(params);
}

export async function chatWithTools({ systemPrompt, messages, tools, onToolUse }) {
  let currentMessages = [...messages];
  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: currentMessages,
      tools,
    });
    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];
      for (const block of toolUseBlocks) {
        const result = await onToolUse(block.name, block.input);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }
      currentMessages.push({ role: 'assistant', content: response.content });
      currentMessages.push({ role: 'user', content: toolResults });
    } else {
      return { response, messages: currentMessages };
    }
  }
}
```

- [ ] **Step 4: Create new ai.js route**

```javascript
// apps/backend/src/routes/ai.js
import { chatCompletion, chatWithTools } from '../services/claudeService.js';

export default async function aiRoutes(fastify) {
  fastify.post('/api/ai/chat', async (request, reply) => {
    const { systemPrompt, messages } = request.body;
    const response = await chatCompletion({ systemPrompt, messages });
    return response;
  });

  fastify.post('/api/ai/agent', async (request, reply) => {
    const { systemPrompt, messages, tools } = request.body;
    const result = await chatWithTools({
      systemPrompt,
      messages,
      tools,
      onToolUse: async (name, input) => {
        // Tool execution delegated to tool registry
        return { error: `Tool ${name} not yet implemented` };
      },
    });
    return result;
  });
}
```

- [ ] **Step 5: Update index.js to register new route**

In `apps/backend/src/index.js`, replace the agent route import with the new ai route. Remove references to `agentService.js` and `llmService.js`.

- [ ] **Step 6: Delete old LangChain service files**

```bash
rm apps/backend/src/services/agentService.js
rm apps/backend/src/services/llmService.js
```

- [ ] **Step 7: Verify build**

```bash
cd /data01/home/xuzk/workspace/ai_agent/paper_wrighting/app
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: replace LangChain with @anthropic-ai/sdk"
```

---

## Phase 2: Core Backend Services

### Task 3: Implement Skill Engine

**Files:**
- Create: `apps/backend/src/services/skillEngine.js`
- Create: `apps/backend/src/routes/skills.js`
- Create: `apps/backend/skills/` (built-in skill directory)
- Create: `apps/backend/skills/academic-tone.yaml` (example built-in skill)

- [ ] **Step 1: Install yaml parser**

```bash
cd apps/backend
npm install yaml
```

- [ ] **Step 2: Create skillEngine.js**

```javascript
// apps/backend/src/services/skillEngine.js
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import YAML from 'yaml';

const builtinSkillsDir = join(import.meta.dirname, '../../skills');
let skillRegistry = new Map();

export async function loadSkills(projectSkillsDir) {
  skillRegistry.clear();
  // Load built-in skills
  await loadSkillsFromDir(builtinSkillsDir, 'builtin');
  // Load project-level custom skills
  if (projectSkillsDir) {
    await loadSkillsFromDir(projectSkillsDir, 'custom');
  }
}

async function loadSkillsFromDir(dir, source) {
  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
      const content = await readFile(join(dir, file), 'utf-8');
      const skill = YAML.parse(content);
      skill._source = source;
      skillRegistry.set(skill.name, skill);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

export function getSkill(name) {
  return skillRegistry.get(name);
}

export function listSkills() {
  return Array.from(skillRegistry.values()).map(s => ({
    name: s.name,
    display_name: s.display_name,
    description: s.description,
    type: s.type,
    trigger: s.trigger,
    source: s._source,
  }));
}

export function assemblePrompt({ globalSkills, chapterSkills, manualSkill }) {
  const parts = ['You are an academic writing assistant.'];
  for (const name of globalSkills || []) {
    const skill = skillRegistry.get(name);
    if (skill) parts.push(`[Global Rule - ${skill.display_name}]\n${skill.prompt}`);
  }
  for (const name of chapterSkills || []) {
    const skill = skillRegistry.get(name);
    if (skill) parts.push(`[Chapter Skill - ${skill.display_name}]\n${skill.prompt}`);
  }
  if (manualSkill) {
    const skill = skillRegistry.get(manualSkill);
    if (skill) parts.push(`[Active Skill - ${skill.display_name}]\n${skill.prompt}`);
  }
  return parts.join('\n\n---\n\n');
}
```

- [ ] **Step 3: Create skills route**

```javascript
// apps/backend/src/routes/skills.js
import { listSkills, getSkill, loadSkills } from '../services/skillEngine.js';

export default async function skillRoutes(fastify) {
  fastify.get('/api/skills', async () => {
    return listSkills();
  });

  fastify.get('/api/skills/:name', async (request) => {
    const skill = getSkill(request.params.name);
    if (!skill) return { error: 'Skill not found' };
    return skill;
  });

  fastify.post('/api/skills/reload', async (request) => {
    const { projectSkillsDir } = request.body;
    await loadSkills(projectSkillsDir);
    return { ok: true, count: listSkills().length };
  });
}
```

- [ ] **Step 4: Create example built-in skill**

```yaml
# apps/backend/skills/academic-tone.yaml
name: academic-tone
display_name: "学术语气规范"
description: "确保文本使用正式学术语气，避免口语化表达"
type: writing
trigger: auto

prompt: |
  请确保所有输出遵循学术写作规范：
  1. 使用第三人称或被动语态
  2. 避免口语化表达和缩写
  3. 使用精确的学术术语
  4. 保持客观中立的语气
  5. 句式结构多样化，避免重复

parameters: []
```

- [ ] **Step 5: Register skills route in index.js**

Add `import skillRoutes from './routes/skills.js'` and `fastify.register(skillRoutes)` in `apps/backend/src/index.js`.

- [ ] **Step 6: Verify build**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: implement skill engine with YAML loading and prompt assembly"
```


### Task 4: File Manager & Project Service

**Files:**
- Create: `apps/backend/src/services/fileManager.js`
- Create: `apps/backend/src/services/projectService.js`
- Create: `apps/backend/src/routes/projects.js`
- Create: `apps/backend/src/routes/chapters.js`

- [ ] **Step 1: Create fileManager.js**

```javascript
// apps/backend/src/services/fileManager.js
import { readdir, readFile, writeFile, mkdir, rm, rename, stat } from 'fs/promises';
import { join, relative, extname } from 'path';
import { watch } from 'fs';

const watchers = new Map();

export async function listDir(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries.map(e => ({
    name: e.name,
    type: e.isDirectory() ? 'directory' : 'file',
    path: join(dirPath, e.name),
  }));
}

export async function readTextFile(filePath) {
  return readFile(filePath, 'utf-8');
}

export async function writeTextFile(filePath, content) {
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
}

export async function deleteFile(filePath) {
  await rm(filePath, { recursive: true });
}

export async function renameFile(oldPath, newPath) {
  await rename(oldPath, newPath);
}

export function watchDirectory(dirPath, onChange) {
  if (watchers.has(dirPath)) return;
  const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
    if (filename) onChange({ eventType, filename, path: join(dirPath, filename) });
  });
  watchers.set(dirPath, watcher);
  return watcher;
}

export function unwatchDirectory(dirPath) {
  const watcher = watchers.get(dirPath);
  if (watcher) {
    watcher.close();
    watchers.delete(dirPath);
  }
}
```

- [ ] **Step 2: Create projectService.js**

```javascript
// apps/backend/src/services/projectService.js
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import YAML from 'yaml';

export async function loadProject(projectPath) {
  const configPath = join(projectPath, 'paper.yaml');
  const content = await readFile(configPath, 'utf-8');
  return YAML.parse(content);
}

export async function saveProject(projectPath, config) {
  const configPath = join(projectPath, 'paper.yaml');
  await writeFile(configPath, YAML.stringify(config), 'utf-8');
}

export async function createProject(projectPath, config) {
  await mkdir(projectPath, { recursive: true });
  await mkdir(join(projectPath, 'chapters'), { recursive: true });
  await mkdir(join(projectPath, 'code/src'), { recursive: true });
  await mkdir(join(projectPath, 'code/notebooks'), { recursive: true });
  await mkdir(join(projectPath, 'code/results'), { recursive: true });
  await mkdir(join(projectPath, 'code/figures'), { recursive: true });
  await mkdir(join(projectPath, 'figures'), { recursive: true });
  await mkdir(join(projectPath, 'skills'), { recursive: true });
  await mkdir(join(projectPath, 'output'), { recursive: true });
  await saveProject(projectPath, config);
  await writeFile(join(projectPath, 'references.bib'), '', 'utf-8');
}

export async function addChapter(projectPath, filename) {
  const config = await loadProject(projectPath);
  const filePath = join(projectPath, 'chapters', filename);
  await writeFile(filePath, `# ${filename.replace(/^\d+-/, '').replace('.md', '')}\n\n`, 'utf-8');
  config.chapters = config.chapters || [];
  config.chapters.push({ file: filename, skills: [] });
  await saveProject(projectPath, config);
  return config;
}

export async function reorderChapters(projectPath, newOrder) {
  const config = await loadProject(projectPath);
  const chapterMap = new Map(config.chapters.map(c => [c.file, c]));
  config.chapters = newOrder.map(file => chapterMap.get(file)).filter(Boolean);
  await saveProject(projectPath, config);
  return config;
}
```

- [ ] **Step 3: Create projects route**

```javascript
// apps/backend/src/routes/projects.js
import { loadProject, saveProject, createProject } from '../services/projectService.js';
import { listDir } from '../services/fileManager.js';

export default async function projectRoutes(fastify) {
  fastify.post('/api/projects/open', async (request) => {
    const { path } = request.body;
    const config = await loadProject(path);
    return { path, config };
  });

  fastify.post('/api/projects/create', async (request) => {
    const { path, config } = request.body;
    await createProject(path, config);
    return { path, config };
  });

  fastify.put('/api/projects/config', async (request) => {
    const { path, config } = request.body;
    await saveProject(path, config);
    return { ok: true };
  });

  fastify.post('/api/projects/tree', async (request) => {
    const { path } = request.body;
    return listDir(path);
  });
}
```

- [ ] **Step 4: Create chapters route**

```javascript
// apps/backend/src/routes/chapters.js
import { readTextFile, writeTextFile, deleteFile, renameFile } from '../services/fileManager.js';
import { addChapter, reorderChapters, loadProject } from '../services/projectService.js';
import { join } from 'path';

export default async function chapterRoutes(fastify) {
  fastify.get('/api/chapters/:projectPath', async (request) => {
    const config = await loadProject(request.params.projectPath);
    return config.chapters || [];
  });

  fastify.post('/api/chapters/read', async (request) => {
    const { projectPath, filename } = request.body;
    const content = await readTextFile(join(projectPath, 'chapters', filename));
    return { filename, content };
  });

  fastify.post('/api/chapters/write', async (request) => {
    const { projectPath, filename, content } = request.body;
    await writeTextFile(join(projectPath, 'chapters', filename), content);
    return { ok: true };
  });

  fastify.post('/api/chapters/create', async (request) => {
    const { projectPath, filename } = request.body;
    const config = await addChapter(projectPath, filename);
    return config;
  });

  fastify.post('/api/chapters/reorder', async (request) => {
    const { projectPath, order } = request.body;
    const config = await reorderChapters(projectPath, order);
    return config;
  });

  fastify.post('/api/chapters/delete', async (request) => {
    const { projectPath, filename } = request.body;
    await deleteFile(join(projectPath, 'chapters', filename));
    const config = await loadProject(projectPath);
    config.chapters = config.chapters.filter(c => c.file !== filename);
    const { saveProject } = await import('../services/projectService.js');
    await saveProject(projectPath, config);
    return { ok: true };
  });
}
```

- [ ] **Step 5: Register routes in index.js**

Add imports and registrations for `projectRoutes` and `chapterRoutes` in `apps/backend/src/index.js`.

- [ ] **Step 6: Verify build**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add file manager, project service, and chapter routes"
```

### Task 5: Code Executor Service

**Files:**
- Create: `apps/backend/src/services/codeExecutor.js`
- Create: `apps/backend/src/routes/code.js`

- [ ] **Step 1: Create codeExecutor.js**

```javascript
// apps/backend/src/services/codeExecutor.js
import { spawn } from 'child_process';
import { join } from 'path';

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function executeScript(scriptPath, { cwd, args = [], timeout = TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const ext = scriptPath.split('.').pop();
    let command;
    switch (ext) {
      case 'py': command = 'python3'; break;
      case 'r': case 'R': command = 'Rscript'; break;
      case 'jl': command = 'julia'; break;
      case 'sh': command = 'bash'; break;
      default: command = 'python3';
    }

    const proc = spawn(command, [scriptPath, ...args], {
      cwd,
      timeout,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

export function executeCommand(command, { cwd, timeout = TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const proc = spawn('bash', ['-c', command], {
      cwd,
      timeout,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}
```

- [ ] **Step 2: Create code route**

```javascript
// apps/backend/src/routes/code.js
import { executeScript, executeCommand } from '../services/codeExecutor.js';
import { readTextFile, writeTextFile, listDir } from '../services/fileManager.js';
import { join } from 'path';

export default async function codeRoutes(fastify) {
  fastify.post('/api/code/read', async (request) => {
    const { projectPath, filePath } = request.body;
    const content = await readTextFile(join(projectPath, 'code', filePath));
    return { filePath, content };
  });

  fastify.post('/api/code/write', async (request) => {
    const { projectPath, filePath, content } = request.body;
    await writeTextFile(join(projectPath, 'code', filePath), content);
    return { ok: true };
  });

  fastify.post('/api/code/run', async (request) => {
    const { projectPath, scriptPath, args } = request.body;
    const cwd = join(projectPath, 'code');
    const result = await executeScript(join(cwd, scriptPath), { cwd, args });
    return result;
  });

  fastify.post('/api/code/exec', async (request) => {
    const { projectPath, command } = request.body;
    const cwd = join(projectPath, 'code');
    const result = await executeCommand(command, { cwd });
    return result;
  });

  fastify.post('/api/code/tree', async (request) => {
    const { projectPath } = request.body;
    return listDir(join(projectPath, 'code'));
  });
}
```

- [ ] **Step 3: Register code route in index.js**

Add `import codeRoutes from './routes/code.js'` and `fastify.register(codeRoutes)` in index.js.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add code executor service and routes"
```


### Task 6: Conversation Store & AI Route Integration

**Files:**
- Create: `apps/backend/src/services/conversationStore.js`
- Create: `apps/backend/src/routes/conversations.js`
- Modify: `apps/backend/src/routes/ai.js` (integrate skill engine + conversation context)

- [ ] **Step 1: Create conversationStore.js**

```javascript
// apps/backend/src/services/conversationStore.js
import { readFile, writeFile, mkdir, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

const STORE_BASE = join(process.env.HOME, '.paper-writer', 'conversations');

function getProjectDir(projectId) {
  return join(STORE_BASE, projectId);
}

function getConvPath(projectId, convId) {
  return join(getProjectDir(projectId), `${convId}.json`);
}

export async function createConversation(projectId, { name, context_scope, active_skills, mode }) {
  const id = randomUUID().slice(0, 8);
  const conv = {
    id,
    name: name || `Conversation ${id}`,
    context_scope: context_scope || { type: 'free' },
    active_skills: active_skills || [],
    mode: mode || 'chat',
    history: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const dir = getProjectDir(projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(getConvPath(projectId, id), JSON.stringify(conv, null, 2), 'utf-8');
  return conv;
}

export async function getConversation(projectId, convId) {
  const content = await readFile(getConvPath(projectId, convId), 'utf-8');
  return JSON.parse(content);
}

export async function updateConversation(projectId, convId, updates) {
  const conv = await getConversation(projectId, convId);
  Object.assign(conv, updates, { updated_at: new Date().toISOString() });
  await writeFile(getConvPath(projectId, convId), JSON.stringify(conv, null, 2), 'utf-8');
  return conv;
}

export async function appendMessage(projectId, convId, message) {
  const conv = await getConversation(projectId, convId);
  conv.history.push(message);
  conv.updated_at = new Date().toISOString();
  await writeFile(getConvPath(projectId, convId), JSON.stringify(conv, null, 2), 'utf-8');
  return conv;
}

export async function listConversations(projectId) {
  const dir = getProjectDir(projectId);
  try {
    const files = await readdir(dir);
    const convs = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const content = await readFile(join(dir, file), 'utf-8');
      const conv = JSON.parse(content);
      convs.push({ id: conv.id, name: conv.name, context_scope: conv.context_scope, mode: conv.mode, updated_at: conv.updated_at });
    }
    return convs.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

export async function deleteConversation(projectId, convId) {
  await rm(getConvPath(projectId, convId));
}
```

- [ ] **Step 2: Create conversations route**

```javascript
// apps/backend/src/routes/conversations.js
import {
  createConversation, getConversation, updateConversation,
  listConversations, deleteConversation, appendMessage
} from '../services/conversationStore.js';

export default async function conversationRoutes(fastify) {
  fastify.get('/api/conversations/:projectId', async (request) => {
    return listConversations(request.params.projectId);
  });

  fastify.get('/api/conversations/:projectId/:convId', async (request) => {
    return getConversation(request.params.projectId, request.params.convId);
  });

  fastify.post('/api/conversations/:projectId', async (request) => {
    return createConversation(request.params.projectId, request.body);
  });

  fastify.put('/api/conversations/:projectId/:convId', async (request) => {
    return updateConversation(request.params.projectId, request.params.convId, request.body);
  });

  fastify.delete('/api/conversations/:projectId/:convId', async (request) => {
    await deleteConversation(request.params.projectId, request.params.convId);
    return { ok: true };
  });
}
```

- [ ] **Step 3: Update ai.js to integrate skill engine and conversation context**

```javascript
// apps/backend/src/routes/ai.js (full rewrite)
import { chatCompletion, chatWithTools } from '../services/claudeService.js';
import { assemblePrompt, getSkill } from '../services/skillEngine.js';
import { appendMessage, getConversation } from '../services/conversationStore.js';
import { readTextFile, listDir } from '../services/fileManager.js';
import { executeScript } from '../services/codeExecutor.js';
import { join } from 'path';

const AI_TOOLS = [
  { name: 'read_chapter', description: 'Read a chapter file', input_schema: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] } },
  { name: 'list_chapters', description: 'List all chapter files', input_schema: { type: 'object', properties: {} } },
  { name: 'propose_edit', description: 'Propose an edit to a chapter (returns diff for user confirmation)', input_schema: { type: 'object', properties: { filename: { type: 'string' }, new_content: { type: 'string' } }, required: ['filename', 'new_content'] } },
  { name: 'read_code', description: 'Read a file from code/ directory', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'write_code', description: 'Write a file to code/ directory', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'run_code', description: 'Execute a script in code/ directory', input_schema: { type: 'object', properties: { script: { type: 'string' }, args: { type: 'array', items: { type: 'string' } } }, required: ['script'] } },
  { name: 'search_arxiv', description: 'Search arXiv papers', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'read_references', description: 'Read references.bib', input_schema: { type: 'object', properties: {} } },
];

export default async function aiRoutes(fastify) {
  fastify.post('/api/ai/send', async (request) => {
    const { projectId, convId, projectPath, userMessage, projectConfig } = request.body;

    const conv = await getConversation(projectId, convId);
    await appendMessage(projectId, convId, { role: 'user', content: userMessage });

    // Determine which skills to load
    const globalSkills = projectConfig.global_skills || [];
    let chapterSkills = [];
    if (conv.context_scope.type === 'chapter') {
      const chapterConfig = (projectConfig.chapters || []).find(c => c.file === conv.context_scope.file);
      chapterSkills = chapterConfig?.skills || [];
    }
    const manualSkill = conv.active_skills?.[0] || null;

    const systemPrompt = assemblePrompt({ globalSkills, chapterSkills, manualSkill });

    // Build messages from history
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
      return { reply: assistantMsg, toolResults: result.toolResults };
    }
  });
}

async function executeTool(name, input, projectPath) {
  switch (name) {
    case 'read_chapter':
      return await readTextFile(join(projectPath, 'chapters', input.filename));
    case 'list_chapters':
      return JSON.stringify(await listDir(join(projectPath, 'chapters')));
    case 'read_code':
      return await readTextFile(join(projectPath, 'code', input.path));
    case 'write_code':
      const { writeTextFile } = await import('../services/fileManager.js');
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
```

- [ ] **Step 4: Register conversations route in index.js**

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add conversation store and integrate skill engine with AI routes"
```

### Task 7: Terminal WebSocket (node-pty)

**Files:**
- Create: `apps/backend/src/routes/terminal.js`
- Modify: `apps/backend/package.json` (add node-pty)

- [ ] **Step 1: Install node-pty**

```bash
cd apps/backend
npm install node-pty
```

- [ ] **Step 2: Create terminal route**

```javascript
// apps/backend/src/routes/terminal.js
import * as pty from 'node-pty';

const terminals = new Map();

export default async function terminalRoutes(fastify) {
  fastify.get('/api/terminal/ws', { websocket: true }, (socket, request) => {
    const { cols = 80, rows = 24, cwd = process.env.HOME } = request.query;

    const shell = process.env.SHELL || '/bin/bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: parseInt(cols),
      rows: parseInt(rows),
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    const termId = ptyProcess.pid.toString();
    terminals.set(termId, ptyProcess);

    // Send terminal ID to client
    socket.send(JSON.stringify({ type: 'id', id: termId }));

    // PTY → WebSocket
    ptyProcess.onData((data) => {
      try {
        socket.send(JSON.stringify({ type: 'data', data }));
      } catch (e) {
        // socket closed
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      socket.send(JSON.stringify({ type: 'exit', code: exitCode }));
      terminals.delete(termId);
      socket.close();
    });

    // WebSocket → PTY
    socket.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg.toString());
        switch (parsed.type) {
          case 'data':
            ptyProcess.write(parsed.data);
            break;
          case 'resize':
            ptyProcess.resize(parsed.cols, parsed.rows);
            break;
        }
      } catch (e) {
        // raw data fallback
        ptyProcess.write(msg.toString());
      }
    });

    socket.on('close', () => {
      ptyProcess.kill();
      terminals.delete(termId);
    });
  });
}
```

- [ ] **Step 3: Register terminal route in index.js**

Add `import terminalRoutes from './routes/terminal.js'` and `fastify.register(terminalRoutes)`.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add terminal WebSocket route with node-pty"
```


### Task 8: File Watcher WebSocket & Export Service

**Files:**
- Create: `apps/backend/src/routes/ws.js`
- Create: `apps/backend/src/services/exportService.js`
- Create: `apps/backend/src/routes/export.js`

- [ ] **Step 1: Create ws.js for file watcher events**

```javascript
// apps/backend/src/routes/ws.js
import { watchDirectory, unwatchDirectory } from '../services/fileManager.js';

const clients = new Set();

export default async function wsRoutes(fastify) {
  fastify.get('/api/ws/watch', { websocket: true }, (socket, request) => {
    const { projectPath } = request.query;
    clients.add(socket);

    if (projectPath) {
      watchDirectory(projectPath, (event) => {
        const msg = JSON.stringify({ type: 'file_change', ...event });
        for (const client of clients) {
          try { client.send(msg); } catch (e) { clients.delete(client); }
        }
      });
    }

    socket.on('close', () => {
      clients.delete(socket);
      if (clients.size === 0 && projectPath) {
        unwatchDirectory(projectPath);
      }
    });
  });
}
```

- [ ] **Step 2: Create exportService.js**

```javascript
// apps/backend/src/services/exportService.js
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';
import YAML from 'yaml';

export async function mergeChapters(projectPath) {
  const configContent = await readFile(join(projectPath, 'paper.yaml'), 'utf-8');
  const config = YAML.parse(configContent);
  const parts = [];

  for (const chapter of config.chapters || []) {
    const content = await readFile(join(projectPath, 'chapters', chapter.file), 'utf-8');
    parts.push(content);
  }

  return parts.join('\n\n---\n\n');
}

export async function exportToLatex(projectPath, template) {
  const merged = await mergeChapters(projectPath);
  const mergedPath = join(projectPath, 'output', 'merged.md');
  await writeFile(mergedPath, merged, 'utf-8');

  const outputTex = join(projectPath, 'output', 'paper.tex');
  const args = [mergedPath, '-o', outputTex, '--standalone'];
  if (template) {
    args.push('--template', template);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('pandoc', args, { cwd: projectPath });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve({ texPath: outputTex });
      else reject(new Error(`Pandoc failed: ${stderr}`));
    });
    proc.on('error', reject);
  });
}

export async function exportToPdf(projectPath, engine = 'xelatex') {
  const texPath = join(projectPath, 'output', 'paper.tex');
  const outputDir = join(projectPath, 'output');

  return new Promise((resolve, reject) => {
    const proc = spawn(engine, [
      '-interaction=nonstopmode',
      `-output-directory=${outputDir}`,
      texPath
    ], { cwd: projectPath });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      resolve({ code, stdout, stderr, pdfPath: join(outputDir, 'paper.pdf') });
    });
    proc.on('error', reject);
  });
}
```

- [ ] **Step 3: Create export route**

```javascript
// apps/backend/src/routes/export.js
import { mergeChapters, exportToLatex, exportToPdf } from '../services/exportService.js';

export default async function exportRoutes(fastify) {
  fastify.post('/api/export/merge', async (request) => {
    const { projectPath } = request.body;
    const merged = await mergeChapters(projectPath);
    return { content: merged };
  });

  fastify.post('/api/export/latex', async (request) => {
    const { projectPath, template } = request.body;
    const result = await exportToLatex(projectPath, template);
    return result;
  });

  fastify.post('/api/export/pdf', async (request) => {
    const { projectPath, engine } = request.body;
    await exportToLatex(projectPath);
    const result = await exportToPdf(projectPath, engine);
    return result;
  });
}
```

- [ ] **Step 4: Register ws and export routes in index.js**

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add file watcher WebSocket and export service (Pandoc + LaTeX)"
```

---

## Phase 3: Frontend - Layout & Project Tree

### Task 9: Restructure Frontend Layout

**Files:**
- Create: `apps/frontend/src/app/components/LeftPanel.tsx`
- Create: `apps/frontend/src/app/components/CenterPanel.tsx`
- Create: `apps/frontend/src/app/components/RightPanel.tsx`
- Create: `apps/frontend/src/app/components/Layout.tsx`
- Modify: `apps/frontend/src/app/EditorPage.tsx` (replace monolithic component with layout)

- [ ] **Step 1: Create Layout.tsx**

```typescript
// apps/frontend/src/app/components/Layout.tsx
import React, { useState, useRef } from 'react';
import { LeftPanel } from './LeftPanel';
import { CenterPanel } from './CenterPanel';
import { RightPanel } from './RightPanel';

export function Layout() {
  const [leftWidth, setLeftWidth] = useState(250);
  const [rightWidth, setRightWidth] = useState(380);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <div style={{ width: leftWidth, minWidth: 200, borderRight: '1px solid #e0e0e0', overflow: 'auto' }}>
        <LeftPanel />
      </div>
      <ResizeHandle onResize={(delta) => setLeftWidth(w => Math.max(200, w + delta))} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <CenterPanel />
      </div>
      <ResizeHandle onResize={(delta) => setRightWidth(w => Math.max(300, w - delta))} />
      <div style={{ width: rightWidth, minWidth: 300, borderLeft: '1px solid #e0e0e0', overflow: 'hidden' }}>
        <RightPanel />
      </div>
    </div>
  );
}

function ResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const handleMouseDown = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const handleMouseMove = (e: MouseEvent) => {
      onResize(e.clientX - startX);
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{ width: 4, cursor: 'col-resize', background: 'transparent' }}
    />
  );
}
```

- [ ] **Step 2: Create LeftPanel.tsx stub**

```typescript
// apps/frontend/src/app/components/LeftPanel.tsx
import React from 'react';

export function LeftPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '12px', fontWeight: 'bold', borderBottom: '1px solid #e0e0e0' }}>
        Project
      </div>
      <div style={{ flex: 1, padding: '8px' }}>
        {/* ProjectTree will go here */}
        <p style={{ color: '#888' }}>No project open</p>
      </div>
      <div style={{ borderTop: '1px solid #e0e0e0', padding: '8px' }}>
        {/* SkillPanel will go here */}
        <p style={{ color: '#888', fontSize: '12px' }}>Skills</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create CenterPanel.tsx stub**

```typescript
// apps/frontend/src/app/components/CenterPanel.tsx
import React from 'react';

export function CenterPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ height: '36px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
        {/* EditorTabs */}
        <span style={{ color: '#888' }}>No file open</span>
      </div>
      <div style={{ flex: 1 }}>
        {/* Editor area */}
      </div>
      <div style={{ height: '0px', borderTop: '1px solid #e0e0e0' }}>
        {/* Terminal panel (collapsed by default) */}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create RightPanel.tsx stub**

```typescript
// apps/frontend/src/app/components/RightPanel.tsx
import React from 'react';

export function RightPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ height: '36px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', padding: '0 8px', gap: '4px' }}>
        {/* ConversationTabs */}
        <span style={{ color: '#888', fontSize: '13px' }}>Conversations</span>
        <button style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer' }}>+</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {/* ChatView */}
        <p style={{ color: '#888' }}>Start a conversation</p>
      </div>
      <div style={{ borderTop: '1px solid #e0e0e0', padding: '8px' }}>
        {/* InputArea */}
        <textarea
          placeholder="Type a message..."
          style={{ width: '100%', minHeight: '60px', resize: 'vertical', border: '1px solid #ddd', borderRadius: '4px', padding: '8px' }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update EditorPage.tsx to use Layout**

Replace the monolithic EditorPage content with:

```typescript
// apps/frontend/src/app/EditorPage.tsx
import React from 'react';
import { Layout } from './components/Layout';

export default function EditorPage() {
  return <Layout />;
}
```

- [ ] **Step 6: Verify the app renders**

```bash
cd /data01/home/xuzk/workspace/ai_agent/paper_wrighting/app
npm run dev
```

Open browser, confirm three-panel layout renders without errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: restructure frontend into three-panel layout components"
```


### Task 10: Project Tree Component

**Files:**
- Create: `apps/frontend/src/app/components/ProjectTree.tsx`
- Create: `apps/frontend/src/app/hooks/useProject.ts`
- Create: `apps/frontend/src/app/api/projectApi.ts`
- Modify: `apps/frontend/src/app/components/LeftPanel.tsx`

- [ ] **Step 1: Create projectApi.ts**

```typescript
// apps/frontend/src/app/api/projectApi.ts
const BASE = '/api';

export async function openProject(path: string) {
  const res = await fetch(`${BASE}/projects/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return res.json();
}

export async function createProject(path: string, config: any) {
  const res = await fetch(`${BASE}/projects/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, config }),
  });
  return res.json();
}

export async function readChapter(projectPath: string, filename: string) {
  const res = await fetch(`${BASE}/chapters/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, filename }),
  });
  return res.json();
}

export async function writeChapter(projectPath: string, filename: string, content: string) {
  const res = await fetch(`${BASE}/chapters/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, filename, content }),
  });
  return res.json();
}

export async function createChapter(projectPath: string, filename: string) {
  const res = await fetch(`${BASE}/chapters/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, filename }),
  });
  return res.json();
}

export async function reorderChapters(projectPath: string, order: string[]) {
  const res = await fetch(`${BASE}/chapters/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, order }),
  });
  return res.json();
}

export async function getProjectTree(path: string) {
  const res = await fetch(`${BASE}/projects/tree`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return res.json();
}

export async function readCodeFile(projectPath: string, filePath: string) {
  const res = await fetch(`${BASE}/code/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, filePath }),
  });
  return res.json();
}

export async function getCodeTree(projectPath: string) {
  const res = await fetch(`${BASE}/code/tree`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath }),
  });
  return res.json();
}
```

- [ ] **Step 2: Create useProject hook**

```typescript
// apps/frontend/src/app/hooks/useProject.ts
import { useState, useCallback } from 'react';
import { openProject, createProject } from '../api/projectApi';

export interface ProjectConfig {
  title: string;
  authors: string[];
  template: string;
  editor_mode: 'markdown' | 'latex';
  chapters: { file: string; skills: string[] }[];
  global_skills: string[];
  code?: { language: string; entry: string };
}

export interface ProjectState {
  path: string | null;
  config: ProjectConfig | null;
  loading: boolean;
  error: string | null;
}

export function useProject() {
  const [project, setProject] = useState<ProjectState>({
    path: null, config: null, loading: false, error: null,
  });

  const open = useCallback(async (path: string) => {
    setProject(p => ({ ...p, loading: true, error: null }));
    try {
      const result = await openProject(path);
      setProject({ path: result.path, config: result.config, loading: false, error: null });
    } catch (e: any) {
      setProject(p => ({ ...p, loading: false, error: e.message }));
    }
  }, []);

  const create = useCallback(async (path: string, config: ProjectConfig) => {
    setProject(p => ({ ...p, loading: true, error: null }));
    try {
      const result = await createProject(path, config);
      setProject({ path: result.path, config: result.config, loading: false, error: null });
    } catch (e: any) {
      setProject(p => ({ ...p, loading: false, error: e.message }));
    }
  }, []);

  return { project, open, create, setProject };
}
```

- [ ] **Step 3: Create ProjectTree.tsx**

```typescript
// apps/frontend/src/app/components/ProjectTree.tsx
import React, { useState, useEffect } from 'react';
import { ProjectConfig } from '../hooks/useProject';

interface Props {
  projectPath: string;
  config: ProjectConfig;
  onFileSelect: (file: { path: string; type: 'chapter' | 'code' | 'other' }) => void;
  onChapterReorder: (newOrder: string[]) => void;
}

export function ProjectTree({ projectPath, config, onFileSelect, onChapterReorder }: Props) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['chapters', 'code']));

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  return (
    <div style={{ fontSize: '13px' }}>
      {/* Chapters section */}
      <div>
        <div
          onClick={() => toggleSection('chapters')}
          style={{ padding: '4px 8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <span>{expandedSections.has('chapters') ? '▼' : '▶'}</span>
          <span>Chapters</span>
        </div>
        {expandedSections.has('chapters') && (
          <div style={{ paddingLeft: '16px' }}>
            {(config.chapters || []).map((ch, i) => (
              <div
                key={ch.file}
                onClick={() => onFileSelect({ path: ch.file, type: 'chapter' })}
                style={{ padding: '3px 8px', cursor: 'pointer', borderRadius: '3px' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ color: '#666', marginRight: '6px' }}>{i + 1}.</span>
                {ch.file}
                {ch.skills.length > 0 && (
                  <span style={{ marginLeft: '8px', fontSize: '10px', color: '#999' }}>
                    [{ch.skills.length} skills]
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Code section */}
      <div style={{ marginTop: '8px' }}>
        <div
          onClick={() => toggleSection('code')}
          style={{ padding: '4px 8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <span>{expandedSections.has('code') ? '▼' : '▶'}</span>
          <span>Code</span>
        </div>
        {expandedSections.has('code') && (
          <div style={{ paddingLeft: '16px' }}>
            <div
              onClick={() => onFileSelect({ path: 'src/', type: 'code' })}
              style={{ padding: '3px 8px', cursor: 'pointer' }}
            >
              src/
            </div>
            <div
              onClick={() => onFileSelect({ path: 'notebooks/', type: 'code' })}
              style={{ padding: '3px 8px', cursor: 'pointer' }}
            >
              notebooks/
            </div>
          </div>
        )}
      </div>

      {/* Figures section */}
      <div style={{ marginTop: '8px' }}>
        <div
          onClick={() => toggleSection('figures')}
          style={{ padding: '4px 8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <span>{expandedSections.has('figures') ? '▼' : '▶'}</span>
          <span>Figures</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update LeftPanel.tsx to use ProjectTree**

```typescript
// apps/frontend/src/app/components/LeftPanel.tsx
import React from 'react';
import { ProjectTree } from './ProjectTree';
import { ProjectConfig } from '../hooks/useProject';

interface Props {
  projectPath: string | null;
  config: ProjectConfig | null;
  onFileSelect: (file: { path: string; type: 'chapter' | 'code' | 'other' }) => void;
  onChapterReorder: (newOrder: string[]) => void;
}

export function LeftPanel({ projectPath, config, onFileSelect, onChapterReorder }: Props) {
  if (!projectPath || !config) {
    return (
      <div style={{ padding: '16px', color: '#888' }}>
        <p>No project open</p>
        <button style={{ marginTop: '8px' }}>Open Project</button>
        <button style={{ marginTop: '8px', marginLeft: '8px' }}>New Project</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px 12px', fontWeight: 'bold', borderBottom: '1px solid #e0e0e0', fontSize: '14px' }}>
        {config.title || 'Untitled'}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        <ProjectTree
          projectPath={projectPath}
          config={config}
          onFileSelect={onFileSelect}
          onChapterReorder={onChapterReorder}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify renders correctly**

```bash
npm run dev
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add project tree component with chapter and code sections"
```

### Task 11: Markdown Editor with Preview

**Files:**
- Create: `apps/frontend/src/app/components/MarkdownEditor.tsx`
- Create: `apps/frontend/src/app/components/MarkdownPreview.tsx`
- Modify: `apps/frontend/src/app/components/CenterPanel.tsx`
- Modify: `apps/frontend/package.json` (add markdown dependencies)

- [ ] **Step 1: Install markdown dependencies**

```bash
cd apps/frontend
npm install @codemirror/lang-markdown @codemirror/language-data react-markdown remark-gfm remark-math rehype-katex katex
```

- [ ] **Step 2: Create MarkdownEditor.tsx**

```typescript
// apps/frontend/src/app/components/MarkdownEditor.tsx
import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';

interface Props {
  content: string;
  onChange: (content: string) => void;
}

export function MarkdownEditor({ content, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        syntaxHighlighting(defaultHighlightStyle),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-content': { fontFamily: 'monospace', fontSize: '14px' },
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => { view.destroy(); };
  }, []); // Only create once

  // Update content from outside
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentContent = view.state.doc.toString();
    if (currentContent !== content) {
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: content },
      });
    }
  }, [content]);

  return <div ref={containerRef} style={{ height: '100%' }} />;
}
```

- [ ] **Step 3: Create MarkdownPreview.tsx**

```typescript
// apps/frontend/src/app/components/MarkdownPreview.tsx
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface Props {
  content: string;
}

export function MarkdownPreview({ content }: Props) {
  return (
    <div style={{ padding: '16px 24px', overflow: 'auto', height: '100%', fontFamily: 'serif', lineHeight: 1.8 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 4: Update CenterPanel.tsx with editor + preview split**

```typescript
// apps/frontend/src/app/components/CenterPanel.tsx
import React, { useState } from 'react';
import { MarkdownEditor } from './MarkdownEditor';
import { MarkdownPreview } from './MarkdownPreview';

interface OpenFile {
  filename: string;
  content: string;
  type: 'chapter' | 'code' | 'other';
  dirty: boolean;
}

interface Props {
  openFiles: OpenFile[];
  activeFileIndex: number;
  onFileChange: (index: number, content: string) => void;
  onTabSelect: (index: number) => void;
  onTabClose: (index: number) => void;
  terminalVisible: boolean;
  onToggleTerminal: () => void;
}

export function CenterPanel({ openFiles, activeFileIndex, onFileChange, onTabSelect, onTabClose, terminalVisible, onToggleTerminal }: Props) {
  const [showPreview, setShowPreview] = useState(true);
  const activeFile = openFiles[activeFileIndex];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div style={{ height: '36px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', padding: '0 8px', gap: '2px', overflow: 'auto' }}>
        {openFiles.map((file, i) => (
          <div
            key={file.filename}
            onClick={() => onTabSelect(i)}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              borderRadius: '4px 4px 0 0',
              background: i === activeFileIndex ? '#fff' : '#f5f5f5',
              borderBottom: i === activeFileIndex ? '2px solid #1976d2' : 'none',
            }}
          >
            {file.filename}{file.dirty ? ' •' : ''}
            <span onClick={(e) => { e.stopPropagation(); onTabClose(i); }} style={{ marginLeft: '6px', color: '#999' }}>×</span>
          </div>
        ))}
        <button onClick={onToggleTerminal} style={{ marginLeft: 'auto', fontSize: '11px', border: 'none', background: 'none', cursor: 'pointer' }}>
          {terminalVisible ? '▼ Terminal' : '▲ Terminal'}
        </button>
      </div>

      {/* Editor + Preview */}
      {activeFile ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: showPreview ? 'column' : 'row', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <MarkdownEditor
              content={activeFile.content}
              onChange={(c) => onFileChange(activeFileIndex, c)}
            />
          </div>
          {showPreview && activeFile.type === 'chapter' && (
            <>
              <div style={{ height: '1px', background: '#e0e0e0' }} />
              <div style={{ flex: 1, overflow: 'auto' }}>
                <MarkdownPreview content={activeFile.content} />
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
          Open a file from the project tree
        </div>
      )}

      {/* Terminal area placeholder */}
      {terminalVisible && (
        <div style={{ height: '250px', borderTop: '1px solid #e0e0e0', background: '#1e1e1e' }}>
          {/* Terminal component will go here */}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify renders correctly**

```bash
npm run dev
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Markdown editor with CodeMirror 6 and KaTeX preview"
```


---

## Phase 4: Frontend - AI Conversations & Terminal

### Task 12: Multi-Conversation Panel

**Files:**
- Create: `apps/frontend/src/app/components/ConversationTabs.tsx`
- Create: `apps/frontend/src/app/components/ChatView.tsx`
- Create: `apps/frontend/src/app/components/NewConversationDialog.tsx`
- Create: `apps/frontend/src/app/api/conversationApi.ts`
- Create: `apps/frontend/src/app/hooks/useConversations.ts`
- Modify: `apps/frontend/src/app/components/RightPanel.tsx`

- [ ] **Step 1: Create conversationApi.ts**

```typescript
// apps/frontend/src/app/api/conversationApi.ts
const BASE = '/api';

export interface ConversationSummary {
  id: string;
  name: string;
  context_scope: { type: string; file?: string; path?: string };
  mode: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  name: string;
  context_scope: { type: string; file?: string; path?: string };
  active_skills: string[];
  mode: string;
  history: { role: string; content: string }[];
}

export async function listConversations(projectId: string): Promise<ConversationSummary[]> {
  const res = await fetch(`${BASE}/conversations/${projectId}`);
  return res.json();
}

export async function getConversation(projectId: string, convId: string): Promise<Conversation> {
  const res = await fetch(`${BASE}/conversations/${projectId}/${convId}`);
  return res.json();
}

export async function createConversation(projectId: string, data: {
  name: string;
  context_scope: { type: string; file?: string; path?: string };
  active_skills?: string[];
  mode?: string;
}): Promise<Conversation> {
  const res = await fetch(`${BASE}/conversations/${projectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteConversation(projectId: string, convId: string) {
  await fetch(`${BASE}/conversations/${projectId}/${convId}`, { method: 'DELETE' });
}

export async function sendMessage(projectId: string, convId: string, projectPath: string, userMessage: string, projectConfig: any) {
  const res = await fetch(`${BASE}/ai/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, convId, projectPath, userMessage, projectConfig }),
  });
  return res.json();
}
```

- [ ] **Step 2: Create useConversations hook**

```typescript
// apps/frontend/src/app/hooks/useConversations.ts
import { useState, useCallback } from 'react';
import {
  listConversations, getConversation, createConversation,
  deleteConversation, sendMessage, Conversation, ConversationSummary
} from '../api/conversationApi';

export function useConversations(projectId: string | null) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const list = await listConversations(projectId);
    setConversations(list);
  }, [projectId]);

  const select = useCallback(async (convId: string) => {
    if (!projectId) return;
    setLoading(true);
    const conv = await getConversation(projectId, convId);
    setActiveConv(conv);
    setLoading(false);
  }, [projectId]);

  const create = useCallback(async (data: { name: string; context_scope: any; active_skills?: string[]; mode?: string }) => {
    if (!projectId) return;
    const conv = await createConversation(projectId, data);
    setActiveConv(conv);
    await refresh();
    return conv;
  }, [projectId, refresh]);

  const remove = useCallback(async (convId: string) => {
    if (!projectId) return;
    await deleteConversation(projectId, convId);
    if (activeConv?.id === convId) setActiveConv(null);
    await refresh();
  }, [projectId, activeConv, refresh]);

  const send = useCallback(async (message: string, projectPath: string, projectConfig: any) => {
    if (!projectId || !activeConv) return;
    setActiveConv(prev => prev ? {
      ...prev,
      history: [...prev.history, { role: 'user', content: message }],
    } : null);
    setLoading(true);
    const result = await sendMessage(projectId, activeConv.id, projectPath, message, projectConfig);
    setActiveConv(prev => prev ? {
      ...prev,
      history: [...prev.history, { role: 'assistant', content: result.reply }],
    } : null);
    setLoading(false);
    return result;
  }, [projectId, activeConv]);

  return { conversations, activeConv, loading, refresh, select, create, remove, send };
}
```

- [ ] **Step 3: Create ChatView.tsx**

```typescript
// apps/frontend/src/app/components/ChatView.tsx
import React, { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: string;
  content: string;
}

interface Props {
  messages: Message[];
  loading: boolean;
}

export function ChatView({ messages, loading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
      {messages.map((msg, i) => (
        <div key={i} style={{
          marginBottom: '12px',
          padding: '8px 12px',
          borderRadius: '8px',
          background: msg.role === 'user' ? '#e3f2fd' : '#f5f5f5',
          maxWidth: '90%',
          marginLeft: msg.role === 'user' ? 'auto' : '0',
        }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
            {msg.role === 'user' ? 'You' : 'AI'}
          </div>
          <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        </div>
      ))}
      {loading && (
        <div style={{ color: '#888', fontSize: '13px', padding: '8px' }}>Thinking...</div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 4: Create ConversationTabs.tsx**

```typescript
// apps/frontend/src/app/components/ConversationTabs.tsx
import React from 'react';
import { ConversationSummary } from '../api/conversationApi';

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export function ConversationTabs({ conversations, activeId, onSelect, onClose, onNew }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', overflow: 'auto', padding: '0 4px' }}>
      {conversations.map(conv => (
        <div
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          style={{
            padding: '4px 10px',
            fontSize: '12px',
            cursor: 'pointer',
            borderRadius: '4px 4px 0 0',
            background: conv.id === activeId ? '#fff' : '#f5f5f5',
            borderBottom: conv.id === activeId ? '2px solid #1976d2' : 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {conv.name}
          <span onClick={(e) => { e.stopPropagation(); onClose(conv.id); }} style={{ marginLeft: '6px', color: '#999' }}>×</span>
        </div>
      ))}
      <button onClick={onNew} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px 8px' }}>+</button>
    </div>
  );
}
```

- [ ] **Step 5: Create NewConversationDialog.tsx**

```typescript
// apps/frontend/src/app/components/NewConversationDialog.tsx
import React, { useState } from 'react';

interface Props {
  chapters: { file: string }[];
  skills: { name: string; display_name: string }[];
  onSubmit: (data: { name: string; context_scope: any; active_skills: string[]; mode: string }) => void;
  onCancel: () => void;
}

export function NewConversationDialog({ chapters, skills, onSubmit, onCancel }: Props) {
  const [name, setName] = useState('');
  const [scopeType, setScopeType] = useState('free');
  const [scopeFile, setScopeFile] = useState('');
  const [mode, setMode] = useState('chat');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  const handleSubmit = () => {
    let context_scope: any = { type: scopeType };
    if (scopeType === 'chapter') context_scope.file = scopeFile;
    if (scopeType === 'code') context_scope.path = 'code/';
    onSubmit({ name: name || `New ${scopeType}`, context_scope, active_skills: selectedSkills, mode });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '8px', padding: '24px', width: '400px' }}>
        <h3 style={{ margin: '0 0 16px' }}>New Conversation</h3>

        <label style={{ display: 'block', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>Name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Write Introduction"
            style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px' }} />
        </label>

        <label style={{ display: 'block', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>Context Scope</span>
          <select value={scopeType} onChange={e => setScopeType(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px' }}>
            <option value="free">Free (no file binding)</option>
            <option value="global">Global (all chapters)</option>
            <option value="chapter">Chapter (specific)</option>
            <option value="code">Code</option>
          </select>
        </label>

        {scopeType === 'chapter' && (
          <label style={{ display: 'block', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Chapter</span>
            <select value={scopeFile} onChange={e => setScopeFile(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px' }}>
              <option value="">Select...</option>
              {chapters.map(ch => <option key={ch.file} value={ch.file}>{ch.file}</option>)}
            </select>
          </label>
        )}

        <label style={{ display: 'block', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>Mode</span>
          <select value={mode} onChange={e => setMode(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px' }}>
            <option value="chat">Chat (read-only discussion)</option>
            <option value="agent">Agent (propose edits)</option>
            <option value="tools">Tools (multi-step tasks)</option>
          </select>
        </label>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button onClick={onCancel} style={{ padding: '6px 16px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSubmit} style={{ padding: '6px 16px', border: 'none', borderRadius: '4px', background: '#1976d2', color: '#fff', cursor: 'pointer' }}>Create</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Update RightPanel.tsx to wire everything together**

```typescript
// apps/frontend/src/app/components/RightPanel.tsx
import React, { useState } from 'react';
import { ConversationTabs } from './ConversationTabs';
import { ChatView } from './ChatView';
import { NewConversationDialog } from './NewConversationDialog';
import { ConversationSummary, Conversation } from '../api/conversationApi';

interface Props {
  conversations: ConversationSummary[];
  activeConv: Conversation | null;
  loading: boolean;
  chapters: { file: string }[];
  skills: { name: string; display_name: string }[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: (data: any) => void;
  onSend: (message: string) => void;
}

export function RightPanel({ conversations, activeConv, loading, chapters, skills, onSelect, onClose, onCreate, onSend }: Props) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSend(inputValue.trim());
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ height: '36px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center' }}>
        <ConversationTabs
          conversations={conversations}
          activeId={activeConv?.id || null}
          onSelect={onSelect}
          onClose={onClose}
          onNew={() => setShowNewDialog(true)}
        />
      </div>

      {activeConv ? (
        <>
          <ChatView messages={activeConv.history} loading={loading} />
          <div style={{ borderTop: '1px solid #e0e0e0', padding: '8px' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
              {activeConv.context_scope.type === 'chapter' ? `Chapter: ${activeConv.context_scope.file}` :
               activeConv.context_scope.type === 'code' ? 'Code' :
               activeConv.context_scope.type === 'global' ? 'Global' : 'Free'} | Mode: {activeConv.mode}
            </div>
            <textarea
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
              style={{ width: '100%', minHeight: '60px', resize: 'vertical', border: '1px solid #ddd', borderRadius: '4px', padding: '8px', fontSize: '13px' }}
            />
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
          <button onClick={() => setShowNewDialog(true)} style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer' }}>
            + New Conversation
          </button>
        </div>
      )}

      {showNewDialog && (
        <NewConversationDialog
          chapters={chapters}
          skills={skills}
          onSubmit={(data) => { onCreate(data); setShowNewDialog(false); }}
          onCancel={() => setShowNewDialog(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Verify renders correctly**

```bash
npm run dev
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add multi-conversation panel with chat view and creation dialog"
```

### Task 13: Embedded Terminal (xterm.js)

**Files:**
- Create: `apps/frontend/src/app/components/TerminalPanel.tsx`
- Modify: `apps/frontend/src/app/components/CenterPanel.tsx` (integrate terminal)
- Modify: `apps/frontend/package.json` (add xterm dependencies)

- [ ] **Step 1: Install xterm.js**

```bash
cd apps/frontend
npm install xterm xterm-addon-fit xterm-addon-web-links
```

- [ ] **Step 2: Create TerminalPanel.tsx**

```typescript
// apps/frontend/src/app/components/TerminalPanel.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

interface Props {
  cwd: string;
}

export function TerminalPanel({ cwd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/terminal/ws?cols=${term.cols}&rows=${term.rows}&cwd=${encodeURIComponent(cwd)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'data') {
        term.write(msg.data);
      } else if (msg.type === 'id') {
        setTabs(prev => [...prev, msg.id]);
      }
    };

    term.onData((data) => {
      ws.send(JSON.stringify({ type: 'data', data }));
    });

    term.onResize(({ cols, rows }) => {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    });

    // Handle container resize
    const observer = new ResizeObserver(() => {
      fitAddon.fit();
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      ws.close();
      term.dispose();
    };
  }, [cwd]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: '28px', background: '#252526', display: 'flex', alignItems: 'center', padding: '0 8px', gap: '8px' }}>
        <span style={{ color: '#ccc', fontSize: '11px' }}>Terminal</span>
        <span style={{ color: '#888', fontSize: '11px', marginLeft: 'auto' }}>{cwd}</span>
      </div>
      <div ref={containerRef} style={{ flex: 1 }} />
    </div>
  );
}
```

- [ ] **Step 3: Integrate TerminalPanel into CenterPanel**

In `CenterPanel.tsx`, replace the terminal placeholder:

```typescript
// Replace the terminal area placeholder block with:
{terminalVisible && (
  <div style={{ height: '250px', borderTop: '1px solid #e0e0e0' }}>
    <TerminalPanel cwd={projectPath || process.env.HOME || '/'} />
  </div>
)}
```

Add `import { TerminalPanel } from './TerminalPanel';` at the top. Add `projectPath: string` to the Props interface.

- [ ] **Step 4: Verify terminal connects and works**

```bash
npm run dev
```

Open browser, toggle terminal, confirm shell prompt appears and commands work.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add embedded terminal with xterm.js and node-pty WebSocket"
```


---

## Phase 5: Skill Panel & Integration

### Task 14: Skill Panel UI

**Files:**
- Create: `apps/frontend/src/app/components/SkillPanel.tsx`
- Create: `apps/frontend/src/app/api/skillApi.ts`
- Modify: `apps/frontend/src/app/components/LeftPanel.tsx` (add SkillPanel)

- [ ] **Step 1: Create skillApi.ts**

```typescript
// apps/frontend/src/app/api/skillApi.ts
const BASE = '/api';

export interface SkillInfo {
  name: string;
  display_name: string;
  description: string;
  type: string;
  trigger: string;
  source: string;
}

export async function listSkills(): Promise<SkillInfo[]> {
  const res = await fetch(`${BASE}/skills`);
  return res.json();
}

export async function getSkill(name: string) {
  const res = await fetch(`${BASE}/skills/${name}`);
  return res.json();
}

export async function reloadSkills(projectSkillsDir: string) {
  const res = await fetch(`${BASE}/skills/reload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectSkillsDir }),
  });
  return res.json();
}
```

- [ ] **Step 2: Create SkillPanel.tsx**

```typescript
// apps/frontend/src/app/components/SkillPanel.tsx
import React, { useState, useEffect } from 'react';
import { listSkills, SkillInfo } from '../api/skillApi';

interface Props {
  globalSkills: string[];
  chapterSkills: string[];
  onActivateSkill: (skillName: string) => void;
}

export function SkillPanel({ globalSkills, chapterSkills, onActivateSkill }: Props) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    listSkills().then(setSkills);
  }, []);

  const filtered = skills.filter(s => {
    if (filter === 'all') return true;
    return s.type === filter;
  });

  const isActive = (name: string) => globalSkills.includes(name) || chapterSkills.includes(name);

  return (
    <div style={{ fontSize: '12px' }}>
      <div style={{ padding: '6px 8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {['all', 'writing', 'review', 'analysis', 'utility', 'code'].map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              padding: '2px 6px', fontSize: '10px', border: '1px solid #ddd',
              borderRadius: '3px', cursor: 'pointer',
              background: filter === t ? '#1976d2' : '#fff',
              color: filter === t ? '#fff' : '#333',
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div style={{ maxHeight: '200px', overflow: 'auto' }}>
        {filtered.map(skill => (
          <div
            key={skill.name}
            onClick={() => onActivateSkill(skill.name)}
            style={{
              padding: '4px 8px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
              background: isActive(skill.name) ? '#e8f5e9' : 'transparent',
            }}
          >
            <div style={{ fontWeight: 500 }}>{skill.display_name || skill.name}</div>
            <div style={{ color: '#888', fontSize: '10px' }}>{skill.description}</div>
            <div style={{ marginTop: '2px' }}>
              {isActive(skill.name) && <span style={{ fontSize: '9px', background: '#4caf50', color: '#fff', padding: '1px 4px', borderRadius: '2px' }}>active</span>}
              <span style={{ fontSize: '9px', color: '#999', marginLeft: '4px' }}>{skill.source}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Integrate SkillPanel into LeftPanel**

Update `LeftPanel.tsx` to include the SkillPanel at the bottom:

```typescript
// Add to LeftPanel.tsx imports:
import { SkillPanel } from './SkillPanel';

// Add to Props interface:
globalSkills: string[];
chapterSkills: string[];
onActivateSkill: (skillName: string) => void;

// Add at the bottom of the component, before closing </div>:
<div style={{ borderTop: '1px solid #e0e0e0', maxHeight: '40%', overflow: 'auto' }}>
  <div style={{ padding: '6px 8px', fontWeight: 600, fontSize: '12px' }}>Skills</div>
  <SkillPanel
    globalSkills={globalSkills}
    chapterSkills={chapterSkills}
    onActivateSkill={onActivateSkill}
  />
</div>
```

- [ ] **Step 4: Verify renders correctly**

```bash
npm run dev
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add skill panel UI with filtering and activation"
```

### Task 15: App State & Full Wiring

**Files:**
- Create: `apps/frontend/src/app/context/AppContext.tsx`
- Modify: `apps/frontend/src/app/EditorPage.tsx` (wire all components with state)
- Modify: `apps/frontend/src/app/components/Layout.tsx` (pass props down)

- [ ] **Step 1: Create AppContext.tsx**

```typescript
// apps/frontend/src/app/context/AppContext.tsx
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useProject, ProjectConfig } from '../hooks/useProject';
import { useConversations } from '../hooks/useConversations';
import { readChapter, writeChapter } from '../api/projectApi';
import { reloadSkills, SkillInfo, listSkills } from '../api/skillApi';

interface OpenFile {
  filename: string;
  content: string;
  type: 'chapter' | 'code' | 'other';
  dirty: boolean;
}

interface AppState {
  // Project
  project: { path: string | null; config: ProjectConfig | null; loading: boolean; error: string | null };
  openProject: (path: string) => Promise<void>;
  createNewProject: (path: string, config: ProjectConfig) => Promise<void>;

  // Files
  openFiles: OpenFile[];
  activeFileIndex: number;
  openFile: (file: { path: string; type: 'chapter' | 'code' | 'other' }) => Promise<void>;
  updateFileContent: (index: number, content: string) => void;
  saveFile: (index: number) => Promise<void>;
  closeFile: (index: number) => void;
  setActiveFileIndex: (index: number) => void;

  // Conversations
  conversations: any[];
  activeConv: any;
  convLoading: boolean;
  refreshConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  createConversation: (data: any) => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
  sendMessage: (message: string) => Promise<void>;

  // Skills
  skills: SkillInfo[];
  activateSkill: (name: string) => void;

  // Terminal
  terminalVisible: boolean;
  toggleTerminal: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { project, open, create } = useProject();
  const projectId = project.path ? btoa(project.path).slice(0, 12) : null;
  const convHook = useConversations(projectId);

  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(-1);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [terminalVisible, setTerminalVisible] = useState(false);

  // Load skills when project opens
  useEffect(() => {
    if (project.path) {
      reloadSkills(`${project.path}/skills`).then(() => listSkills().then(setSkills));
      convHook.refresh();
    }
  }, [project.path]);

  const openFile = useCallback(async (file: { path: string; type: 'chapter' | 'code' | 'other' }) => {
    const existing = openFiles.findIndex(f => f.filename === file.path);
    if (existing >= 0) {
      setActiveFileIndex(existing);
      return;
    }
    if (!project.path) return;
    let content = '';
    if (file.type === 'chapter') {
      const result = await readChapter(project.path, file.path);
      content = result.content;
    }
    const newFile: OpenFile = { filename: file.path, content, type: file.type, dirty: false };
    setOpenFiles(prev => [...prev, newFile]);
    setActiveFileIndex(openFiles.length);
  }, [openFiles, project.path]);

  const updateFileContent = useCallback((index: number, content: string) => {
    setOpenFiles(prev => prev.map((f, i) => i === index ? { ...f, content, dirty: true } : f));
  }, []);

  const saveFile = useCallback(async (index: number) => {
    const file = openFiles[index];
    if (!file || !project.path) return;
    if (file.type === 'chapter') {
      await writeChapter(project.path, file.filename, file.content);
    }
    setOpenFiles(prev => prev.map((f, i) => i === index ? { ...f, dirty: false } : f));
  }, [openFiles, project.path]);

  const closeFile = useCallback((index: number) => {
    setOpenFiles(prev => prev.filter((_, i) => i !== index));
    if (activeFileIndex >= index && activeFileIndex > 0) {
      setActiveFileIndex(activeFileIndex - 1);
    }
  }, [activeFileIndex]);

  const activateSkill = useCallback((name: string) => {
    // Toggle skill in active conversation
    if (convHook.activeConv) {
      // This would update the conversation's active_skills
    }
  }, [convHook.activeConv]);

  const sendMessage = useCallback(async (message: string) => {
    if (!project.path || !project.config) return;
    await convHook.send(message, project.path, project.config);
  }, [project.path, project.config, convHook]);

  const value: AppState = {
    project,
    openProject: open,
    createNewProject: create,
    openFiles,
    activeFileIndex,
    openFile,
    updateFileContent,
    saveFile,
    closeFile,
    setActiveFileIndex,
    conversations: convHook.conversations,
    activeConv: convHook.activeConv,
    convLoading: convHook.loading,
    refreshConversations: convHook.refresh,
    selectConversation: convHook.select,
    createConversation: convHook.create,
    removeConversation: convHook.remove,
    sendMessage,
    skills,
    activateSkill,
    terminalVisible,
    toggleTerminal: () => setTerminalVisible(v => !v),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
```

- [ ] **Step 2: Update EditorPage.tsx to use AppProvider**

```typescript
// apps/frontend/src/app/EditorPage.tsx
import React from 'react';
import { AppProvider } from './context/AppContext';
import { Layout } from './components/Layout';

export default function EditorPage() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}
```

- [ ] **Step 3: Update Layout.tsx to consume AppContext**

```typescript
// apps/frontend/src/app/components/Layout.tsx
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { LeftPanel } from './LeftPanel';
import { CenterPanel } from './CenterPanel';
import { RightPanel } from './RightPanel';

export function Layout() {
  const app = useApp();
  const [leftWidth, setLeftWidth] = useState(250);
  const [rightWidth, setRightWidth] = useState(380);

  const currentChapterSkills = (() => {
    if (app.activeFileIndex < 0) return [];
    const file = app.openFiles[app.activeFileIndex];
    if (!file || file.type !== 'chapter' || !app.project.config) return [];
    const ch = app.project.config.chapters?.find(c => c.file === file.filename);
    return ch?.skills || [];
  })();

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <div style={{ width: leftWidth, minWidth: 200, borderRight: '1px solid #e0e0e0', overflow: 'hidden' }}>
        <LeftPanel
          projectPath={app.project.path}
          config={app.project.config}
          onFileSelect={app.openFile}
          onChapterReorder={() => {}}
          globalSkills={app.project.config?.global_skills || []}
          chapterSkills={currentChapterSkills}
          onActivateSkill={app.activateSkill}
        />
      </div>
      <ResizeHandle onResize={(delta) => setLeftWidth(w => Math.max(200, w + delta))} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <CenterPanel
          openFiles={app.openFiles}
          activeFileIndex={app.activeFileIndex}
          onFileChange={app.updateFileContent}
          onTabSelect={app.setActiveFileIndex}
          onTabClose={app.closeFile}
          terminalVisible={app.terminalVisible}
          onToggleTerminal={app.toggleTerminal}
          projectPath={app.project.path || ''}
        />
      </div>
      <ResizeHandle onResize={(delta) => setRightWidth(w => Math.max(300, w - delta))} />
      <div style={{ width: rightWidth, minWidth: 300, borderLeft: '1px solid #e0e0e0', overflow: 'hidden' }}>
        <RightPanel
          conversations={app.conversations}
          activeConv={app.activeConv}
          loading={app.convLoading}
          chapters={app.project.config?.chapters || []}
          skills={app.skills}
          onSelect={app.selectConversation}
          onClose={app.removeConversation}
          onCreate={app.createConversation}
          onSend={app.sendMessage}
        />
      </div>
    </div>
  );
}

function ResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const handleMouseDown = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const handleMouseMove = (ev: MouseEvent) => onResize(ev.clientX - startX);
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  return <div onMouseDown={handleMouseDown} style={{ width: 4, cursor: 'col-resize' }} />;
}
```

- [ ] **Step 4: Verify full app renders and panels communicate**

```bash
npm run dev
```

Open browser. Confirm: left panel shows project tree, center shows editor, right shows conversation panel. All panels render without errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire all components together with AppContext state management"
```

### Task 16: WebSocket File Watcher (Frontend)

**Files:**
- Create: `apps/frontend/src/app/hooks/useFileWatcher.ts`
- Modify: `apps/frontend/src/app/context/AppContext.tsx` (integrate watcher)

- [ ] **Step 1: Create useFileWatcher.ts**

```typescript
// apps/frontend/src/app/hooks/useFileWatcher.ts
import { useEffect, useRef } from 'react';

interface FileChangeEvent {
  type: 'file_change';
  eventType: string;
  filename: string;
  path: string;
}

export function useFileWatcher(projectPath: string | null, onFileChange: (event: FileChangeEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!projectPath) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/api/ws/watch?projectPath=${encodeURIComponent(projectPath)}`;
    const ws = new WebSocket(url);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'file_change') {
          onFileChange(data);
        }
      } catch (e) {
        // ignore parse errors
      }
    };

    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [projectPath, onFileChange]);
}
```

- [ ] **Step 2: Integrate into AppContext**

Add to `AppContext.tsx`:

```typescript
import { useFileWatcher } from '../hooks/useFileWatcher';

// Inside AppProvider, after state declarations:
const handleFileChange = useCallback((event: any) => {
  // Check if the changed file is currently open
  const openIdx = openFiles.findIndex(f => event.filename.includes(f.filename));
  if (openIdx >= 0) {
    // Mark as externally modified - user will be prompted to reload
    setOpenFiles(prev => prev.map((f, i) => i === openIdx ? { ...f, externallyModified: true } : f));
  }
}, [openFiles]);

useFileWatcher(project.path, handleFileChange);
```

- [ ] **Step 3: Verify file changes are detected**

Open the app, edit a chapter file externally, confirm the app detects the change.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add WebSocket file watcher for real-time file change detection"
```


---

## Phase 6: Built-in Skills & Final Polish

### Task 17: Port Claude Scholar Built-in Skills

**Files:**
- Create: `apps/backend/skills/section-drafter.yaml`
- Create: `apps/backend/skills/hook-writing.yaml`
- Create: `apps/backend/skills/technical-writing.yaml`
- Create: `apps/backend/skills/prose-polisher.yaml`
- Create: `apps/backend/skills/nature-writing.yaml`
- Create: `apps/backend/skills/abstract-generator.yaml`
- Create: `apps/backend/skills/consistency-checker.yaml`
- Create: `apps/backend/skills/logic-reviewer.yaml`
- Create: `apps/backend/skills/technical-reviewer.yaml`
- Create: `apps/backend/skills/writing-reviewer.yaml`
- Create: `apps/backend/skills/literature-review.yaml`
- Create: `apps/backend/skills/research-analyst.yaml`
- Create: `apps/backend/skills/paper-crawler.yaml`
- Create: `apps/backend/skills/brainstormer.yaml`
- Create: `apps/backend/skills/citation-management.yaml`
- Create: `apps/backend/skills/formula-check.yaml`
- Create: `apps/backend/skills/figure-caption.yaml`
- Create: `apps/backend/skills/data-analysis.yaml`
- Create: `apps/backend/skills/code-generator.yaml`

- [ ] **Step 1: Create writing skills**

```yaml
# apps/backend/skills/section-drafter.yaml
name: section-drafter
display_name: "章节起草助手"
description: "帮助从零开始起草论文章节，提供结构化的写作框架"
type: writing
trigger: both

prompt: |
  你是一个学术论文章节起草专家。帮助用户从零开始撰写章节时：
  1. 先提出该章节的逻辑结构（3-5个子节）
  2. 每个子节包含核心论点和支撑材料
  3. 确保段落之间有清晰的逻辑过渡
  4. 开头段落明确该章节的目的和范围
  5. 结尾段落总结要点并过渡到下一章

parameters: []
```

```yaml
# apps/backend/skills/hook-writing.yaml
name: hook-writing
display_name: "开头写作"
description: "撰写引人入胜的论文开头，吸引读者注意力"
type: writing
trigger: both

prompt: |
  你是一个学术写作开头专家。帮助用户撰写论文开头时：
  1. 从宏观问题或现实意义切入
  2. 快速聚焦到具体研究问题
  3. 明确研究空白（gap）
  4. 简述本文贡献
  5. 使用具体数据或案例增强说服力
  6. 避免过于宽泛的陈述（如"随着...的发展"）

parameters: []
```

```yaml
# apps/backend/skills/technical-writing.yaml
name: technical-writing
display_name: "技术写作规范"
description: "确保技术描述准确、清晰、无歧义"
type: writing
trigger: both

prompt: |
  你是一个技术写作专家。确保所有技术描述遵循以下规范：
  1. 术语首次出现时给出定义或缩写展开
  2. 算法描述使用伪代码或数学符号，避免纯文字描述
  3. 实验设置描述要可复现（数据集、超参数、硬件环境）
  4. 数值结果保留适当有效数字
  5. 图表引用使用正确的交叉引用格式
  6. 避免模糊表述（"很多"、"显著提升"），使用具体数值

parameters: []
```

```yaml
# apps/backend/skills/prose-polisher.yaml
name: prose-polisher
display_name: "文字润色"
description: "润色学术文本，提升可读性和流畅度"
type: writing
trigger: manual

prompt: |
  你是一个学术文字润色专家。润色文本时：
  1. 保持原意不变，只改善表达
  2. 消除冗余词汇和重复表述
  3. 改善句式多样性（长短句交替）
  4. 确保主语一致性和时态一致性
  5. 加强段落间的逻辑连接词
  6. 将口语化表达替换为学术用语
  7. 输出修改后的全文，并用【】标注主要修改处

parameters:
  - name: style
    type: select
    default: "formal"
    options: [formal, concise, narrative]
```

```yaml
# apps/backend/skills/nature-writing.yaml
name: nature-writing
display_name: "Nature 级写作"
description: "以 Nature/Science 期刊标准润色和改写文本"
type: writing
trigger: manual

prompt: |
  你是一个顶级期刊（Nature/Science）写作专家。以顶刊标准改写文本：
  1. 开头直击核心发现，不铺垫
  2. 每段一个核心信息，段落简短（3-5句）
  3. 主动语态为主，句式简洁有力
  4. 避免行话堆砌，让跨领域读者也能理解
  5. 数据呈现突出对比和趋势
  6. 结论部分强调广泛影响和未来方向

parameters: []
```

```yaml
# apps/backend/skills/abstract-generator.yaml
name: abstract-generator
display_name: "摘要生成"
description: "根据论文内容生成结构化摘要"
type: writing
trigger: manual

prompt: |
  你是一个学术摘要写作专家。生成摘要时遵循以下结构：
  1. 背景（1-2句）：研究领域和问题
  2. 目的（1句）：本文要解决什么
  3. 方法（1-2句）：核心方法或途径
  4. 结果（2-3句）：主要发现和数据
  5. 结论（1句）：意义和影响
  总字数控制在 150-300 词。避免引用、缩写首次出现未展开、和过于细节的描述。

parameters:
  - name: max_words
    type: number
    default: 250
```

- [ ] **Step 2: Create review skills**

```yaml
# apps/backend/skills/consistency-checker.yaml
name: consistency-checker
display_name: "一致性检查"
description: "检查全文术语、符号、格式的一致性"
type: review
trigger: manual

prompt: |
  你是一个学术论文一致性审查专家。检查以下方面的一致性：
  1. 术语：同一概念是否全文使用相同术语
  2. 符号：数学符号是否前后一致
  3. 缩写：是否首次出现时展开，后续统一使用缩写
  4. 时态：描述方法用过去时，描述事实用现在时
  5. 图表编号：是否连续且引用正确
  6. 参考文献：格式是否统一
  输出格式：列出所有不一致之处，标注位置和建议修改。

parameters: []
```

```yaml
# apps/backend/skills/logic-reviewer.yaml
name: logic-reviewer
display_name: "逻辑审查"
description: "审查论证逻辑是否严密，是否存在逻辑漏洞"
type: review
trigger: manual

prompt: |
  你是一个学术论文逻辑审查专家。审查时关注：
  1. 论点是否有充分的证据支撑
  2. 推理链是否完整（是否有跳跃）
  3. 是否存在循环论证
  4. 因果关系是否成立（相关≠因果）
  5. 反例和局限性是否被讨论
  6. 结论是否超出了数据支撑的范围
  输出格式：按严重程度（Critical/Important/Minor）列出问题。

parameters: []
```

```yaml
# apps/backend/skills/technical-reviewer.yaml
name: technical-reviewer
display_name: "技术审查"
description: "审查技术方法的正确性和完整性"
type: review
trigger: manual

prompt: |
  你是一个技术审稿人。审查时关注：
  1. 方法描述是否足够详细以供复现
  2. 实验设计是否合理（对照组、消融实验）
  3. 评估指标是否适当
  4. 统计检验是否正确使用
  5. 基线对比是否公平
  6. 计算复杂度分析是否正确
  输出格式：按审稿意见格式，分 Strengths 和 Weaknesses。

parameters: []
```

```yaml
# apps/backend/skills/writing-reviewer.yaml
name: writing-reviewer
display_name: "写作质量审查"
description: "审查写作质量，包括清晰度、简洁性、可读性"
type: review
trigger: manual

prompt: |
  你是一个学术写作质量审查专家。审查时关注：
  1. 段落结构是否清晰（主题句+支撑+过渡）
  2. 句子是否过长或过于复杂
  3. 是否存在不必要的重复
  4. 被动语态是否过度使用
  5. 图表是否自解释（标题+标注完整）
  6. 章节之间过渡是否自然
  输出格式：逐段给出具体修改建议。

parameters: []
```

- [ ] **Step 3: Create research and utility skills**

```yaml
# apps/backend/skills/literature-review.yaml
name: literature-review
display_name: "文献综述助手"
description: "帮助撰写文献综述，确保引用充分、逻辑连贯"
type: writing
trigger: both

prompt: |
  你是一个学术文献综述专家。帮助用户撰写文献综述时：
  1. 按主题/方法分类组织文献，而非按时间罗列
  2. 每个论点都需要引用支撑
  3. 批判性分析各方法的优缺点
  4. 明确指出研究空白（research gap）
  5. 最后总结现有工作的不足，引出本文动机
  6. 使用 "Author (Year) showed that..." 或 "[N] proposed..." 格式引用

parameters:
  - name: citation_style
    type: select
    default: "apa"
    options: [apa, ieee, acm, gb-t-7714]
```

```yaml
# apps/backend/skills/research-analyst.yaml
name: research-analyst
display_name: "研究分析"
description: "分析研究方向、对比方法、识别趋势"
type: analysis
trigger: manual

prompt: |
  你是一个研究分析专家。帮助用户分析研究方向时：
  1. 梳理该领域的发展脉络和关键里程碑
  2. 对比主流方法的优缺点（表格形式）
  3. 识别当前趋势和未来方向
  4. 分析本文方法在该领域中的定位
  5. 建议可能的创新点和差异化方向

parameters: []
```

```yaml
# apps/backend/skills/brainstormer.yaml
name: brainstormer
display_name: "头脑风暴"
description: "帮助发散思维，探索研究思路和方向"
type: analysis
trigger: manual

prompt: |
  你是一个研究头脑风暴伙伴。帮助用户探索思路时：
  1. 不急于否定任何想法
  2. 从多个角度提出可能的方向
  3. 对每个方向给出简短的可行性分析
  4. 帮助用户发现隐含的假设
  5. 提出"如果...会怎样"的反事实问题
  6. 最后帮助收敛到 2-3 个最有潜力的方向

parameters: []
```

```yaml
# apps/backend/skills/citation-management.yaml
name: citation-management
display_name: "引用管理"
description: "帮助管理参考文献，检查引用格式和完整性"
type: utility
trigger: manual

prompt: |
  你是一个参考文献管理专家。帮助用户管理引用时：
  1. 检查所有引用是否在 references.bib 中有对应条目
  2. 检查 bib 条目格式是否完整（作者、标题、年份、期刊/会议）
  3. 检查正文中的引用格式是否一致
  4. 标记可能过时的引用（>10年）并建议更新
  5. 建议补充遗漏的重要引用

parameters:
  - name: style
    type: select
    default: "apa"
    options: [apa, ieee, acm, gb-t-7714]
```

```yaml
# apps/backend/skills/formula-check.yaml
name: formula-check
display_name: "公式检查"
description: "检查数学公式的正确性和排版规范"
type: utility
trigger: manual

prompt: |
  你是一个数学公式审查专家。检查公式时：
  1. 验证公式推导的正确性
  2. 检查符号是否已定义
  3. 检查下标/上标是否一致
  4. 确保公式编号连续
  5. 检查单位和量纲是否正确
  6. 建议改善公式的可读性（如拆分过长公式）

parameters: []
```

```yaml
# apps/backend/skills/figure-caption.yaml
name: figure-caption
display_name: "图表标题"
description: "帮助撰写规范的图表标题和说明"
type: utility
trigger: manual

prompt: |
  你是一个学术图表标题写作专家。撰写图表标题时：
  1. 标题应自解释（不看正文也能理解图表内容）
  2. 包含：什么数据、什么方法、关键发现
  3. 图例说明清晰（颜色、线型、标记含义）
  4. 坐标轴标签完整（变量名+单位）
  5. 表格标题在上方，图片标题在下方

parameters: []
```

```yaml
# apps/backend/skills/data-analysis.yaml
name: data-analysis
display_name: "数据分析"
description: "帮助分析实验数据，生成统计描述和可视化建议"
type: code
trigger: manual

prompt: |
  你是一个数据分析专家。帮助用户分析实验数据时：
  1. 先了解数据结构和实验设计
  2. 提供描述性统计（均值、标准差、分布）
  3. 建议适当的统计检验方法
  4. 生成 Python 代码进行分析和可视化
  5. 解读结果的统计意义和实际意义
  6. 建议最佳的图表类型来展示结果

parameters:
  - name: language
    type: select
    default: "python"
    options: [python, r]
```

```yaml
# apps/backend/skills/code-generator.yaml
name: code-generator
display_name: "实验代码生成"
description: "根据论文方法描述生成实验代码"
type: code
trigger: manual

prompt: |
  你是一个实验代码生成专家。根据论文方法描述生成代码时：
  1. 先确认实验框架（PyTorch/TensorFlow/scikit-learn等）
  2. 代码结构清晰：数据加载、模型定义、训练循环、评估
  3. 包含必要的注释说明对应论文哪个公式/步骤
  4. 超参数使用配置文件或命令行参数
  5. 包含日志记录和结果保存
  6. 生成对应的 requirements.txt

parameters:
  - name: framework
    type: select
    default: "pytorch"
    options: [pytorch, tensorflow, sklearn, jax]
```

- [ ] **Step 4: Verify all skills load correctly**

```bash
cd /data01/home/xuzk/workspace/ai_agent/paper_wrighting/app
node -e "
import { loadSkills, listSkills } from './apps/backend/src/services/skillEngine.js';
await loadSkills(null);
const skills = listSkills();
console.log('Loaded skills:', skills.length);
skills.forEach(s => console.log(' -', s.name, '(' + s.type + ')'));
"
```

Expected: 20 skills loaded (including academic-tone from Task 3).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add 19 built-in academic writing skills (ported from Claude Scholar)"
```

### Task 18: Global Config & Startup

**Files:**
- Create: `apps/backend/src/config/appConfig.js`
- Modify: `apps/backend/src/index.js` (final wiring with config init)
- Create: `apps/backend/src/routes/health.js` (if not exists, simple health check)

- [ ] **Step 1: Create appConfig.js**

```javascript
// apps/backend/src/config/appConfig.js
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import YAML from 'yaml';

const CONFIG_DIR = join(process.env.HOME, '.paper-writer');
const CONFIG_PATH = join(CONFIG_DIR, 'config.yaml');

const DEFAULT_CONFIG = {
  claude_api_key: '',
  claude_model: 'claude-sonnet-4-20250514',
  default_template: 'plain',
  editor_mode: 'markdown',
  projects_dir: join(process.env.HOME, 'papers'),
};

export async function loadAppConfig() {
  try {
    const content = await readFile(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CONFIG, ...YAML.parse(content) };
  } catch (e) {
    if (e.code === 'ENOENT') {
      await mkdir(CONFIG_DIR, { recursive: true });
      await writeFile(CONFIG_PATH, YAML.stringify(DEFAULT_CONFIG), 'utf-8');
      return DEFAULT_CONFIG;
    }
    throw e;
  }
}

export async function saveAppConfig(config) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, YAML.stringify(config), 'utf-8');
}
```

- [ ] **Step 2: Update index.js with full startup sequence**

```javascript
// apps/backend/src/index.js (final version)
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { loadAppConfig } from './config/appConfig.js';
import { initClaude } from './services/claudeService.js';
import { loadSkills } from './services/skillEngine.js';
import projectRoutes from './routes/projects.js';
import chapterRoutes from './routes/chapters.js';
import skillRoutes from './routes/skills.js';
import conversationRoutes from './routes/conversations.js';
import aiRoutes from './routes/ai.js';
import codeRoutes from './routes/code.js';
import terminalRoutes from './routes/terminal.js';
import exportRoutes from './routes/export.js';
import wsRoutes from './routes/ws.js';

const fastify = Fastify({ logger: true });

async function start() {
  const config = await loadAppConfig();

  // Initialize Claude SDK
  if (config.claude_api_key) {
    initClaude(config.claude_api_key);
  }

  // Load built-in skills
  await loadSkills(null);

  // Register plugins
  await fastify.register(cors, { origin: true });
  await fastify.register(websocket);

  // Register routes
  await fastify.register(projectRoutes);
  await fastify.register(chapterRoutes);
  await fastify.register(skillRoutes);
  await fastify.register(conversationRoutes);
  await fastify.register(aiRoutes);
  await fastify.register(codeRoutes);
  await fastify.register(terminalRoutes);
  await fastify.register(exportRoutes);
  await fastify.register(wsRoutes);

  // Health check
  fastify.get('/api/health', async () => ({ status: 'ok', skills: (await import('./services/skillEngine.js')).listSkills().length }));

  // Config endpoint
  fastify.get('/api/config', async () => config);
  fastify.put('/api/config', async (request) => {
    const { saveAppConfig } = await import('./config/appConfig.js');
    Object.assign(config, request.body);
    await saveAppConfig(config);
    if (request.body.claude_api_key) initClaude(request.body.claude_api_key);
    return { ok: true };
  });

  const port = process.env.PORT || 3001;
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`Paper Writer backend running on http://localhost:${port}`);
}

start().catch(console.error);
```

- [ ] **Step 3: Verify full backend starts**

```bash
cd /data01/home/xuzk/workspace/ai_agent/paper_wrighting/app/apps/backend
node src/index.js
```

Expected: Server starts, logs "Paper Writer backend running on http://localhost:3001". Hit `/api/health` returns `{ status: 'ok', skills: 20 }`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add global config, finalize backend startup with all routes"
```

### Task 19: End-to-End Smoke Test

**Files:**
- No new files. This task verifies the full stack works together.

- [ ] **Step 1: Start backend**

```bash
cd /data01/home/xuzk/workspace/ai_agent/paper_wrighting/app/apps/backend
node src/index.js &
```

- [ ] **Step 2: Start frontend dev server**

```bash
cd /data01/home/xuzk/workspace/ai_agent/paper_wrighting/app/apps/frontend
npm run dev
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:5173`. Verify:
1. Three-panel layout renders
2. Can create a new project (creates directory structure + paper.yaml)
3. Project tree shows chapters
4. Clicking a chapter opens it in the Markdown editor
5. Preview renders Markdown with KaTeX math
6. Can create a new conversation
7. Terminal opens and accepts commands
8. Skills panel shows all 20 built-in skills

- [ ] **Step 4: Test AI conversation (requires API key)**

Set Claude API key in `~/.paper-writer/config.yaml`. Create a conversation in "chat" mode. Send a message. Verify response comes back.

- [ ] **Step 5: Test code execution**

Create a Python file in `code/src/test.py` via the editor. Use AI in "tools" mode to run it. Verify stdout returns.

- [ ] **Step 6: Test export**

Click export. Verify Pandoc converts chapters to LaTeX and (if LaTeX is installed) compiles to PDF.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: verify end-to-end smoke test passes"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-2 | Bootstrap: fork, strip, replace LangChain |
| 2 | 3-8 | Backend services: skills, files, code, conversations, terminal, export |
| 3 | 9-11 | Frontend layout, project tree, Markdown editor |
| 4 | 12-13 | Multi-conversation panel, embedded terminal |
| 5 | 14-16 | Skill panel, app state wiring, file watcher |
| 6 | 17-19 | Built-in skills, config, smoke test |

Total: 19 tasks across 6 phases.

