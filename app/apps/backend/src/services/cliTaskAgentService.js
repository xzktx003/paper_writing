import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createTwoFilesPatch } from 'diff';

import { DATA_DIR } from '../config/constants.js';
import { getProjectRoot } from './projectLocator.js';
import {
  agentProviderRegistry,
  buildCodexProviderConfigArgs,
  filterProviderEnv,
  terminateProcessTree,
} from './agentProviderRegistry.js';

const TERMINAL_STATES = new Set(['accepted', 'rejected', 'failed', 'cancelled']);
const REVIEWABLE_STATE = 'waiting-review';
const ACTIVE_STATES = new Set(['queued', 'running']);
const MAX_PROMPT_CHARS = 50_000;
const MAX_DIFF_FILE_BYTES = 1024 * 1024;
const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const MAX_TIMEOUT_MS = 30 * 60_000;
const PROTECTED_PROJECT_PATHS = new Set(['project.json']);
const CLI_TASK_IGNORED_DIRECTORY_NAMES = new Set([
  '.git', '.hg', '.svn',
  '.venv', 'venv',
  'node_modules',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', '.nox',
  '.compile', '.openprism', '.paper-writer',
]);

function taskPrompt(userPrompt) {
  return [
    'You are editing an isolated snapshot of a Paper Writer project.',
    'Only read and write files inside the current working directory.',
    'Do not access parent directories, absolute paths, the network, credentials, or external services.',
    'Do not modify project.json or create tool session/configuration files.',
    'Make only the file changes required by the user task. Do not commit, push, or publish anything.',
    '',
    'User task:',
    String(userPrompt).trim(),
  ].join('\n');
}

export const CLI_TASK_PROVIDER_SPECS = Object.freeze({
  'codex-cli': Object.freeze({
    id: 'codex-cli',
    label: 'Codex CLI',
    executable: 'codex',
    versionArgs: ['--version'],
    buildArgs: ({ prompt, model, snapshotRoot, env }) => [
      'exec', '--json', '--ephemeral', '--sandbox', 'workspace-write',
      '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check',
      '-C', snapshotRoot,
      ...buildCodexProviderConfigArgs(env),
      ...(model ? ['-m', model] : []),
      prompt,
    ],
    isolation: 'codex-workspace-write',
  }),
  'claude-cli': Object.freeze({
    id: 'claude-cli',
    label: 'Claude Code CLI',
    executable: 'claude',
    versionArgs: ['--version'],
    buildArgs: ({ prompt, model }) => [
      '--print', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--no-session-persistence', '--permission-mode', 'dontAsk',
      '--tools', 'Read,Edit,Write', '--allowedTools', 'Read,Edit,Write',
      '--disable-slash-commands', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--system-prompt', 'Operate only on files under the current working directory. Never use absolute or parent paths. Do not use network or shell tools.',
      ...(model ? ['--model', model] : []),
      prompt,
    ],
    isolation: 'cwd-file-tools-only',
  }),
  'copilot-cli': Object.freeze({
    id: 'copilot-cli',
    label: 'GitHub Copilot CLI',
    executable: 'copilot',
    versionArgs: ['--version'],
    buildArgs: ({ prompt, model, snapshotRoot }) => [
      '-C', snapshotRoot,
      '--prompt', prompt, '--output-format', 'json', '--no-custom-instructions',
      '--available-tools=read,write', '--allow-tool=read', '--allow-tool=write',
      '--disable-builtin-mcps', '--disallow-temp-dir', '--no-bash-env',
      '--no-ask-user', '--no-auto-update', '--no-remote', '--no-remote-export',
      ...(model ? ['--model', model] : []),
    ],
    isolation: 'copilot-cwd-path-verification',
  }),
});

function withE2eProvider(providerSpecs, env) {
  const mockPath = String(env.OPENPRISM_E2E_CLI_TASK_MOCK_PATH || '').trim();
  if (env.NODE_ENV !== 'test' || !mockPath) return providerSpecs;
  return {
    ...providerSpecs,
    'mock-cli': Object.freeze({
      id: 'mock-cli',
      label: 'Mock CLI (test only)',
      executable: process.execPath,
      versionArgs: ['--version'],
      buildArgs: ({ prompt }) => [mockPath, prompt],
      isolation: 'test-fixture',
      testOnly: true,
    }),
  };
}

function cliTaskError(message, code, statusCode = 400, details) {
  return Object.assign(new Error(message), { code, statusCode, ...(details ? { details } : {}) });
}

function normalizeTaskId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) {
    throw cliTaskError('Invalid CLI task id', 'INVALID_CLI_TASK_ID', 400);
  }
  return id;
}

function normalizeProjectId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) {
    throw cliTaskError('Invalid project id', 'INVALID_PROJECT_ID', 400);
  }
  return id;
}

function normalizePrompt(value) {
  const prompt = String(value || '').trim();
  if (!prompt) throw cliTaskError('Task prompt is required', 'CLI_TASK_PROMPT_REQUIRED', 400);
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw cliTaskError(`Task prompt exceeds ${MAX_PROMPT_CHARS} characters`, 'CLI_TASK_PROMPT_TOO_LONG', 400);
  }
  return prompt;
}

function normalizeTimeout(value) {
  const timeout = Number(value) || DEFAULT_TIMEOUT_MS;
  return Math.max(1_000, Math.min(timeout, MAX_TIMEOUT_MS));
}

function appendBounded(current, chunk) {
  if (current.length >= MAX_CAPTURE_BYTES) return current;
  return `${current}${String(chunk)}`.slice(0, MAX_CAPTURE_BYTES);
}

function redactOutput(value, env) {
  let output = String(value || '');
  for (const [key, secret] of Object.entries(env || {})) {
    if (!/(?:TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL)/i.test(key)) continue;
    if (typeof secret !== 'string' || secret.length < 6) continue;
    output = output.split(secret).join('[REDACTED]');
  }
  return output
    .replace(/\bsk-[A-Za-z0-9_*.-]{6,}\b/g, '[REDACTED]')
    .replace(/\b(?:github_pat_|ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_*.-]{6,}\b/g, '[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, 'Bearer [REDACTED]');
}

function publicTask(task) {
  const { internal: _internal, apply: _apply, ...safe } = task;
  return structuredClone(safe);
}

async function atomicWriteJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const handle = await open(tempPath, 'wx', 0o600);
  try {
    await handle.writeFile(payload, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tempPath, filePath);
}

async function hashFile(filePath) {
  const content = await readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function treeFingerprint(tree) {
  const hash = crypto.createHash('sha256');
  for (const [relativePath, entry] of [...tree.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(relativePath);
    hash.update('\0');
    hash.update(entry.hash);
    hash.update('\0');
    hash.update(String(entry.mode));
    hash.update('\n');
  }
  return hash.digest('hex');
}

function serializeTree(tree) {
  return Object.fromEntries([...tree.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function deserializeTree(value = {}) {
  return new Map(Object.entries(value));
}

async function scanTree(root, relative = '', result = new Map()) {
  const directory = relative ? path.join(root, relative) : root;
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isDirectory() && CLI_TASK_IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
    const rel = relative ? path.join(relative, entry.name) : entry.name;
    const fullPath = path.join(root, rel);
    const info = await lstat(fullPath);
    if (info.isSymbolicLink()) {
      throw cliTaskError(`Symbolic links are not allowed in CLI task snapshots: ${rel}`, 'CLI_TASK_SYMLINK_NOT_ALLOWED', 400, { path: rel });
    }
    if (info.isDirectory()) {
      await scanTree(root, rel, result);
      continue;
    }
    if (!info.isFile()) {
      throw cliTaskError(`Unsupported project entry type: ${rel}`, 'CLI_TASK_UNSUPPORTED_ENTRY', 400, { path: rel });
    }
    result.set(rel, {
      hash: await hashFile(fullPath),
      bytes: info.size,
      mode: info.mode & 0o777,
    });
  }
  return result;
}

async function copyTree(sourceRoot, targetRoot, relative = '') {
  const sourceDir = relative ? path.join(sourceRoot, relative) : sourceRoot;
  const targetDir = relative ? path.join(targetRoot, relative) : targetRoot;
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isDirectory() && CLI_TASK_IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
    const rel = relative ? path.join(relative, entry.name) : entry.name;
    const source = path.join(sourceRoot, rel);
    const target = path.join(targetRoot, rel);
    const info = await lstat(source);
    if (info.isSymbolicLink()) {
      throw cliTaskError(`Symbolic links are not allowed in CLI task snapshots: ${rel}`, 'CLI_TASK_SYMLINK_NOT_ALLOWED', 400, { path: rel });
    }
    if (info.isDirectory()) {
      await copyTree(sourceRoot, targetRoot, rel);
    } else if (info.isFile()) {
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
      await chmod(target, info.mode & 0o777);
    } else {
      throw cliTaskError(`Unsupported project entry type: ${rel}`, 'CLI_TASK_UNSUPPORTED_ENTRY', 400, { path: rel });
    }
  }
}

async function isTextFile(filePath, bytes) {
  if (bytes > MAX_DIFF_FILE_BYTES) return false;
  const content = await readFile(filePath);
  return !content.subarray(0, Math.min(content.length, 8192)).includes(0);
}

async function collectChanges(baseRoot, workRoot) {
  const [beforeTree, afterTree] = await Promise.all([scanTree(baseRoot), scanTree(workRoot)]);
  const paths = [...new Set([...beforeTree.keys(), ...afterTree.keys()])].sort((a, b) => a.localeCompare(b));
  const changes = [];
  for (const relativePath of paths) {
    const before = beforeTree.get(relativePath);
    const after = afterTree.get(relativePath);
    if (before?.hash === after?.hash && before?.mode === after?.mode) continue;
    if (PROTECTED_PROJECT_PATHS.has(relativePath)) {
      throw cliTaskError(`CLI task attempted to change protected file: ${relativePath}`, 'CLI_TASK_PROTECTED_FILE', 400, { path: relativePath });
    }
    const status = !before ? 'added' : !after ? 'deleted' : 'modified';
    const beforePath = path.join(baseRoot, relativePath);
    const afterPath = path.join(workRoot, relativePath);
    const textBefore = before ? await isTextFile(beforePath, before.bytes) : true;
    const textAfter = after ? await isTextFile(afterPath, after.bytes) : true;
    const binary = !(textBefore && textAfter);
    let diff = '';
    if (!binary) {
      const beforeText = before ? await readFile(beforePath, 'utf8') : '';
      const afterText = after ? await readFile(afterPath, 'utf8') : '';
      diff = createTwoFilesPatch(`a/${relativePath}`, `b/${relativePath}`, beforeText, afterText, '', '', { context: 3 });
    }
    changes.push({
      path: relativePath.split(path.sep).join('/'),
      status,
      binary,
      bytesBefore: before?.bytes || 0,
      bytesAfter: after?.bytes || 0,
      diff,
    });
  }
  return { changes, beforeTree, afterTree };
}

async function assertNoSymlinkComponents(root, target) {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(target);
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw cliTaskError('CLI task path escaped the managed project', 'CLI_TASK_PATH_ESCAPE', 400);
  }
  const relative = path.relative(normalizedRoot, normalizedTarget);
  let current = normalizedRoot;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw cliTaskError(`Symbolic link encountered while applying CLI task: ${relative}`, 'CLI_TASK_SYMLINK_NOT_ALLOWED', 409);
      }
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
  return normalizedTarget;
}

async function removeEmptyParents(start, stop) {
  let current = path.dirname(start);
  const boundary = path.resolve(stop);
  while (current !== boundary && current.startsWith(`${boundary}${path.sep}`)) {
    try {
      await rm(current, { recursive: false });
    } catch {
      break;
    }
    current = path.dirname(current);
  }
}

export function createCliTaskAgentService(options = {}) {
  const env = options.env || process.env;
  const dataDir = path.resolve(options.dataDir || DATA_DIR);
  const taskRoot = path.resolve(options.taskRoot || path.join(dataDir, '.openprism-cli-tasks'));
  const providerSpecs = withE2eProvider(options.providerSpecs || CLI_TASK_PROVIDER_SPECS, env);
  const projectRootResolver = options.projectRootResolver || getProjectRoot;
  const spawnImpl = options.spawnImpl || spawn;
  const killTree = options.killTree || terminateProcessTree;
  const providerRegistry = options.providerRegistry || agentProviderRegistry;
  const idFactory = options.idFactory || (() => crypto.randomUUID());
  const tasks = new Map();
  const active = new Map();
  let initialized = false;
  let initializePromise;

  function taskDirectory(taskId) {
    return path.join(taskRoot, normalizeTaskId(taskId));
  }

  function taskFile(taskId) {
    return path.join(taskDirectory(taskId), 'task.json');
  }

  async function persist(task) {
    task.updatedAt = new Date().toISOString();
    tasks.set(task.id, task);
    await atomicWriteJson(taskFile(task.id), task);
  }

  async function rollbackApply(task) {
    const operations = task.apply?.operations || [];
    for (const operation of [...operations].reverse()) {
      const target = operation.target;
      try {
        if (operation.installed) await rm(target, { recursive: true, force: true });
        if (operation.backedUp) {
          await mkdir(path.dirname(target), { recursive: true });
          await rename(operation.backup, target);
        } else if (operation.installed) {
          await removeEmptyParents(target, task.internal.projectRoot);
        }
      } catch {
        // Preserve the journal for a later operator-assisted recovery.
      }
    }
  }

  async function initialize() {
    if (initialized) return;
    if (initializePromise) return initializePromise;
    initializePromise = (async () => {
      await mkdir(taskRoot, { recursive: true, mode: 0o700 });
      if ((await lstat(taskRoot)).isSymbolicLink()) {
        throw cliTaskError('CLI task storage cannot be a symbolic link', 'CLI_TASK_STORAGE_SYMLINK', 500);
      }
      const entries = await readdir(taskRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const task = JSON.parse(await readFile(path.join(taskRoot, entry.name, 'task.json'), 'utf8'));
          if (!task?.id || !task?.projectId) continue;
          if (task.status === 'applying') {
            await rollbackApply(task);
            task.status = 'failed';
            task.error = { code: 'CLI_TASK_APPLY_INTERRUPTED', message: 'The backend restarted while applying this task; rollback was attempted.' };
            task.apply = null;
            await persist(task);
          } else if (ACTIVE_STATES.has(task.status)) {
            task.status = 'failed';
            task.error = { code: 'CLI_TASK_BACKEND_RESTARTED', message: 'The backend restarted before this task completed.' };
            await persist(task);
          } else {
            tasks.set(task.id, task);
          }
        } catch {
          // A malformed task directory is ignored rather than breaking the server.
        }
      }
      initialized = true;
    })();
    return initializePromise;
  }

  async function requireTask(projectId, taskId) {
    await initialize();
    const id = normalizeTaskId(taskId);
    const task = tasks.get(id);
    if (!task || task.projectId !== normalizeProjectId(projectId)) {
      throw cliTaskError('CLI task not found', 'CLI_TASK_NOT_FOUND', 404);
    }
    return task;
  }

  function summarizeArgs(args, prompt, snapshotRoot) {
    return args.map((arg) => {
      const value = String(arg);
      if (value === prompt) return '[TASK_PROMPT]';
      if (value === snapshotRoot || value.startsWith(`${snapshotRoot}${path.sep}`)) return '[SNAPSHOT]';
      return value;
    }).join(' ');
  }

  async function runChild(task, executable, args, cwd, timeoutMs) {
    return new Promise((resolve, reject) => {
      let child;
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let cancelled = false;
      let settled = false;
      try {
        child = spawnImpl(executable, args, {
          cwd,
          env: filterProviderEnv(env, task.providerId),
          shell: false,
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        reject(error);
        return;
      }
      const cancel = async () => {
        cancelled = true;
        await killTree(child);
      };
      active.set(task.id, { child, cancel });
      child.stdout?.on('data', (chunk) => { stdout = appendBounded(stdout, chunk); });
      child.stderr?.on('data', (chunk) => { stderr = appendBounded(stderr, chunk); });
      const timer = setTimeout(async () => {
        timedOut = true;
        await killTree(child);
      }, timeoutMs);
      timer.unref?.();
      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        active.delete(task.id);
        reject(error);
      });
      child.once('close', (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        active.delete(task.id);
        resolve({
          stdout: redactOutput(stdout, env),
          stderr: redactOutput(stderr, env),
          code,
          signal,
          exitStatus: timedOut ? 'timeout' : cancelled || signal ? 'cancelled' : code === 0 ? 'success' : 'failed',
        });
      });
    });
  }

  async function runTask(taskId) {
    const task = tasks.get(taskId);
    if (!task || task.status !== 'queued') return;
    const spec = providerSpecs[task.providerId];
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    await persist(task);
    try {
      let version = '';
      try {
        const versionResult = await runChild(task, spec.executable, spec.versionArgs, task.internal.snapshotRoot, 10_000);
        version = (versionResult.stdout || versionResult.stderr).trim().split(/\r?\n/)[0] || '';
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw cliTaskError(`${spec.label} executable was not found`, 'CLI_TASK_EXECUTABLE_NOT_FOUND', 503);
        }
        throw error;
      }
      if (task.cancelRequested) {
        task.status = 'cancelled';
        task.finishedAt = new Date().toISOString();
        task.provenance = { ...task.provenance, version, exitStatus: 'cancelled', exitCode: null };
        await persist(task);
        return;
      }
      const prompt = taskPrompt(task.prompt);
      const args = spec.buildArgs({
        prompt,
        model: task.model,
        snapshotRoot: task.internal.snapshotRoot,
        env,
      });
      task.provenance = {
        provider: task.providerId,
        model: task.model,
        executable: spec.executable,
        version,
        isolation: spec.isolation,
        argsSummary: summarizeArgs(args, prompt, task.internal.snapshotRoot),
        startedAt: task.startedAt,
        exitCode: null,
        signal: null,
        exitStatus: 'running',
      };
      await persist(task);
      const result = await runChild(task, spec.executable, args, task.internal.snapshotRoot, task.timeoutMs);
      task.stdout = result.stdout
        .split(task.internal.snapshotRoot).join('[SNAPSHOT]')
        .split(task.internal.projectRoot).join('[PROJECT]');
      task.stderr = result.stderr
        .split(task.internal.snapshotRoot).join('[SNAPSHOT]')
        .split(task.internal.projectRoot).join('[PROJECT]');
      task.finishedAt = new Date().toISOString();
      task.provenance = {
        ...task.provenance,
        exitCode: result.code,
        signal: result.signal,
        exitStatus: result.exitStatus,
        finishedAt: task.finishedAt,
      };
      if (result.exitStatus === 'cancelled') {
        task.status = 'cancelled';
        await persist(task);
        return;
      }
      if (result.exitStatus !== 'success') {
        task.status = 'failed';
        task.error = {
          code: result.exitStatus === 'timeout' ? 'CLI_TASK_TIMEOUT' : 'CLI_TASK_PROVIDER_FAILED',
          message: result.stderr.trim() || `${spec.label} exited with code ${result.code}`,
        };
        await persist(task);
        return;
      }
      const { changes } = await collectChanges(task.internal.baseRoot, task.internal.snapshotRoot);
      task.changedFiles = changes;
      task.status = REVIEWABLE_STATE;
      await persist(task);
    } catch (error) {
      task.status = task.cancelRequested ? 'cancelled' : 'failed';
      task.finishedAt = new Date().toISOString();
      task.error = task.status === 'cancelled' ? null : {
        code: error.code || 'CLI_TASK_FAILED',
        message: error.message || 'CLI task failed',
      };
      task.provenance = {
        ...task.provenance,
        exitStatus: task.status === 'cancelled' ? 'cancelled' : 'failed',
        finishedAt: task.finishedAt,
      };
      await persist(task);
    }
  }

  async function createTask(input = {}) {
    await initialize();
    const projectId = normalizeProjectId(input.projectId);
    const providerId = String(input.providerId || '').trim();
    const spec = providerSpecs[providerId];
    if (!spec) throw cliTaskError(`Unsupported CLI task provider: ${providerId}`, 'CLI_TASK_PROVIDER_UNSUPPORTED', 400);
    const prompt = normalizePrompt(input.prompt);
    const projectRoot = await realpath(path.resolve(await projectRootResolver(projectId, { allowMissing: false })));
    const realTaskRoot = await realpath(taskRoot);
    if (realTaskRoot === projectRoot || realTaskRoot.startsWith(`${projectRoot}${path.sep}`)) {
      throw cliTaskError('CLI task storage must be outside the managed project', 'CLI_TASK_STORAGE_INSIDE_PROJECT', 500);
    }
    const id = normalizeTaskId(idFactory());
    const root = taskDirectory(id);
    const baseRoot = path.join(root, 'base');
    const snapshotRoot = path.join(root, 'work');
    let createdRoot = false;
    try {
      await mkdir(root, { recursive: false });
      createdRoot = true;
      await copyTree(projectRoot, baseRoot);
      await copyTree(baseRoot, snapshotRoot);
      const baselineTree = await scanTree(baseRoot);
      const now = new Date().toISOString();
      const task = {
        id,
        projectId,
        providerId,
        model: String(input.model || '').trim(),
        prompt,
        status: 'queued',
        timeoutMs: normalizeTimeout(input.timeoutMs),
        createdAt: now,
        updatedAt: now,
        startedAt: '',
        finishedAt: '',
        changedFiles: [],
        stdout: '',
        stderr: '',
        error: null,
        review: null,
        provenance: {
          provider: providerId,
          model: String(input.model || '').trim(),
          executable: spec.executable,
          version: '',
          isolation: spec.isolation,
          argsSummary: '',
          startedAt: '',
          finishedAt: '',
          exitCode: null,
          signal: null,
          exitStatus: 'queued',
        },
        internal: {
          projectRoot,
          taskRoot: root,
          baseRoot,
          snapshotRoot,
          baselineTree: serializeTree(baselineTree),
          baselineFingerprint: treeFingerprint(baselineTree),
        },
        apply: null,
      };
      await persist(task);
      queueMicrotask(() => { runTask(id); });
      return publicTask(task);
    } catch (error) {
      if (createdRoot) await rm(root, { recursive: true, force: true });
      if (error.code === 'EEXIST') {
        throw cliTaskError('CLI task id already exists', 'CLI_TASK_ID_CONFLICT', 409);
      }
      throw error;
    }
  }

  async function listTasks(projectId) {
    await initialize();
    const id = normalizeProjectId(projectId);
    return [...tasks.values()]
      .filter((task) => task.projectId === id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(publicTask);
  }

  async function getTask(projectId, taskId) {
    return publicTask(await requireTask(projectId, taskId));
  }

  async function rejectTask(projectId, taskId, input = {}) {
    const task = await requireTask(projectId, taskId);
    if (task.status !== REVIEWABLE_STATE) {
      throw cliTaskError(`CLI task cannot be rejected from status ${task.status}`, 'CLI_TASK_NOT_REVIEWABLE', 409);
    }
    task.status = 'rejected';
    task.review = {
      decision: 'rejected',
      reason: String(input.reason || '').trim().slice(0, 2_000),
      decidedAt: new Date().toISOString(),
    };
    await persist(task);
    return publicTask(task);
  }

  async function acceptTask(projectId, taskId) {
    const task = await requireTask(projectId, taskId);
    if (task.status !== REVIEWABLE_STATE) {
      throw cliTaskError(`CLI task cannot be accepted from status ${task.status}`, 'CLI_TASK_NOT_REVIEWABLE', 409);
    }
    const currentTree = await scanTree(task.internal.projectRoot);
    const currentFingerprint = treeFingerprint(currentTree);
    if (currentFingerprint !== task.internal.baselineFingerprint) {
      const baselineTree = deserializeTree(task.internal.baselineTree);
      const changed = [...new Set([...baselineTree.keys(), ...currentTree.keys()])]
        .filter((relativePath) => {
          const before = baselineTree.get(relativePath);
          const current = currentTree.get(relativePath);
          return before?.hash !== current?.hash || before?.mode !== current?.mode;
        })
        .sort();
      throw cliTaskError('The source project changed after this task started. Review a new snapshot before applying.', 'CLI_TASK_SOURCE_DRIFT', 409, { changedFiles: changed });
    }

    const rollbackRoot = path.join(task.internal.taskRoot, `rollback-${crypto.randomUUID()}`);
    const operations = task.changedFiles.map((change) => ({
      ...change,
      target: path.join(task.internal.projectRoot, change.path),
      source: path.join(task.internal.snapshotRoot, change.path),
      backup: path.join(rollbackRoot, change.path),
      backedUp: false,
      installed: false,
    }));
    task.status = 'applying';
    task.apply = { rollbackRoot, operations, startedAt: new Date().toISOString() };
    await persist(task);
    try {
      for (const operation of operations) {
        operation.target = await assertNoSymlinkComponents(task.internal.projectRoot, operation.target);
        let targetExists = false;
        try {
          const targetStat = await lstat(operation.target);
          if (targetStat.isSymbolicLink()) throw cliTaskError('Symbolic links are not allowed while applying a CLI task', 'CLI_TASK_SYMLINK_NOT_ALLOWED', 409);
          targetExists = true;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        if (targetExists) {
          await mkdir(path.dirname(operation.backup), { recursive: true });
          await rename(operation.target, operation.backup);
          operation.backedUp = true;
          await persist(task);
        }
        if (operation.status !== 'deleted') {
          await mkdir(path.dirname(operation.target), { recursive: true });
          const tempTarget = `${operation.target}.${task.id}.${crypto.randomUUID()}.tmp`;
          await copyFile(operation.source, tempTarget);
          const sourceStat = await stat(operation.source);
          await chmod(tempTarget, sourceStat.mode & 0o777);
          await rename(tempTarget, operation.target);
          operation.installed = true;
          await persist(task);
        }
      }
      task.status = 'accepted';
      task.review = { decision: 'accepted', reason: '', decidedAt: new Date().toISOString() };
      task.apply = null;
      await persist(task);
      await rm(rollbackRoot, { recursive: true, force: true });
      return publicTask(task);
    } catch (error) {
      await rollbackApply(task);
      task.status = REVIEWABLE_STATE;
      task.apply = null;
      await persist(task);
      throw cliTaskError(`Unable to apply CLI task safely: ${error.message}`, error.code || 'CLI_TASK_APPLY_FAILED', error.statusCode || 500);
    }
  }

  async function cancelTask(projectId, taskId) {
    const task = await requireTask(projectId, taskId);
    if (!ACTIVE_STATES.has(task.status)) return { cancelled: false, taskId: task.id, status: task.status };
    task.cancelRequested = true;
    const running = active.get(task.id);
    if (running) await running.cancel();
    if (task.status === 'queued') {
      task.status = 'cancelled';
      task.finishedAt = new Date().toISOString();
      task.provenance = { ...task.provenance, exitStatus: 'cancelled', finishedAt: task.finishedAt };
      await persist(task);
    }
    return { cancelled: true, taskId: task.id, status: task.status };
  }

  async function waitForTask(taskId, { statuses = [...TERMINAL_STATES, REVIEWABLE_STATE], timeoutMs = 10_000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    const expected = new Set(statuses);
    while (Date.now() < deadline) {
      await initialize();
      const task = tasks.get(normalizeTaskId(taskId));
      if (task && expected.has(task.status)) return publicTask(task);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw cliTaskError(`Timed out waiting for CLI task ${taskId}`, 'CLI_TASK_WAIT_TIMEOUT', 504);
  }

  return {
    initialize,
    createTask,
    listTasks,
    getTask,
    acceptTask,
    rejectTask,
    cancelTask,
    waitForTask,
    async listProviders() {
      return Promise.all(Object.values(providerSpecs).map(async (spec) => {
        if (spec.testOnly) {
          return {
            id: spec.id,
            label: spec.label,
            isolation: spec.isolation,
            testOnly: true,
            installed: true,
            authenticated: true,
            authStatus: 'test-only',
            available: true,
            unavailableReason: '',
          };
        }
        let probe;
        try {
          probe = await providerRegistry.probe(spec.id, { allowDisabled: true });
        } catch (error) {
          return {
            id: spec.id,
            label: spec.label,
            isolation: spec.isolation,
            installed: false,
            authenticated: false,
            authStatus: 'unavailable',
            available: false,
            unavailableReason: error?.message || 'Provider status probe failed.',
          };
        }
        const installed = probe?.installed === true;
        const authenticated = probe?.auth?.available === true;
        const authStatus = authenticated ? 'authenticated' : probe?.auth?.available === false ? 'not-authenticated' : 'unknown';
        const available = installed && authenticated;
        return {
          id: spec.id,
          label: spec.label,
          isolation: spec.isolation,
          installed,
          authenticated,
          authStatus,
          available,
          unavailableReason: available
            ? ''
            : !installed
              ? (probe?.error || 'CLI executable is not installed.')
              : probe?.auth?.detail || 'Provider authentication could not be verified.',
        };
      }));
    },
  };
}

export const cliTaskAgentService = createCliTaskAgentService();
