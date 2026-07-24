import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';

import {
  CLI_TASK_PROVIDER_SPECS,
  createCliTaskAgentService,
} from '../apps/backend/src/services/cliTaskAgentService.js';

const tempRoots = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cli-task-agent-test-'));
  tempRoots.push(root);
  const dataDir = path.join(root, 'papers');
  const projectRoot = path.join(dataDir, 'demo--12345678');
  const taskRoot = path.join(dataDir, '.openprism-cli-tasks');
  await mkdir(path.join(projectRoot, 'sec'), { recursive: true });
  await writeFile(path.join(projectRoot, 'project.json'), JSON.stringify({ id: 'demo', name: 'Demo' }, null, 2));
  await writeFile(path.join(projectRoot, 'paper.md'), '# Before\n\nOriginal text.\n');
  await writeFile(path.join(projectRoot, 'remove.txt'), 'remove me\n');
  await writeFile(path.join(projectRoot, 'sec', 'keep.md'), 'keep\n');

  const mockScript = path.join(root, 'mock-cli.mjs');
  await writeFile(mockScript, `
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
const mode = process.argv[2];
if (mode === 'wait') {
  await new Promise(resolve => setTimeout(resolve, 30_000));
} else {
  const before = await readFile('paper.md', 'utf8');
  await writeFile('paper.md', before.replace('Original text.', 'Revised by isolated task.'));
  await mkdir('new', { recursive: true });
  await writeFile(path.join('new', 'notes.md'), 'new evidence\\n');
  await unlink('remove.txt').catch(error => { if (error.code !== 'ENOENT') throw error; });
}
process.stdout.write(JSON.stringify({ type: 'result', result: 'mock complete' }) + '\\n');
`, 'utf8');

  const providerSpecs = {
    'mock-cli': {
      id: 'mock-cli',
      label: 'Mock CLI',
      executable: process.execPath,
      versionArgs: ['--version'],
      buildArgs: ({ prompt }) => [mockScript, prompt.includes('WAIT_FOR_CANCEL') ? 'wait' : 'change'],
    },
  };
  const service = createCliTaskAgentService({
    dataDir,
    taskRoot,
    providerSpecs,
    projectRootResolver: async (projectId) => {
      if (projectId !== 'demo') throw new Error('unexpected project');
      return projectRoot;
    },
  });
  await service.initialize();
  return { root, dataDir, projectRoot, taskRoot, providerSpecs, service };
}

async function sha(filePath) {
  return crypto.createHash('sha256').update(await readFile(filePath)).digest('hex');
}

describe('CLI Task Agent isolation and review lifecycle', () => {
  it('reports installed/authenticated/available state for each CLI Task provider', async () => {
    const service = createCliTaskAgentService({
      providerSpecs: {
        'mock-cli': {
          id: 'mock-cli', label: 'Mock CLI', executable: 'mock', versionArgs: ['--version'],
          buildArgs: () => [], isolation: 'test',
        },
      },
      providerRegistry: {
        probe: async () => ({
          installed: true,
          version: 'mock 1.0',
          auth: { supported: true, available: false, detail: 'Sign in required.' },
        }),
      },
    });
    const providers = await service.listProviders();
    expect(providers).toEqual([expect.objectContaining({
      id: 'mock-cli',
      installed: true,
      authenticated: false,
      authStatus: 'not-authenticated',
      available: false,
      unavailableReason: 'Sign in required.',
    })]);
  });

  it('runs the fixed CLI in an external snapshot and reports additions, modifications, and deletions', async () => {
    const { projectRoot, taskRoot, service } = await fixture();
    const originalHash = await sha(path.join(projectRoot, 'paper.md'));

    const created = await service.createTask({
      projectId: 'demo',
      providerId: 'mock-cli',
      prompt: 'Revise the paper from evidence.',
      model: 'mock-model',
    });
    const task = await service.waitForTask(created.id, { statuses: ['waiting-review'] });

    expect(task.status).toBe('waiting-review');
    expect(task.changedFiles.map((item) => [item.path, item.status])).toEqual([
      ['new/notes.md', 'added'],
      ['paper.md', 'modified'],
      ['remove.txt', 'deleted'],
    ]);
    expect(task.changedFiles.find((item) => item.path === 'paper.md')?.diff).toContain('-Original text.');
    expect(task.changedFiles.find((item) => item.path === 'paper.md')?.diff).toContain('+Revised by isolated task.');
    expect(task.provenance).toMatchObject({
      provider: 'mock-cli',
      model: 'mock-model',
      executable: process.execPath,
      exitCode: 0,
    });
    expect(task.provenance.argsSummary).not.toContain('Revise the paper from evidence.');
    expect(task).not.toHaveProperty('internal');
    expect(task).not.toHaveProperty('apply');
    expect(await sha(path.join(projectRoot, 'paper.md'))).toBe(originalHash);
    expect(path.resolve(taskRoot).startsWith(`${path.resolve(projectRoot)}${path.sep}`)).toBe(false);
  });

  it('rejects a reviewed task without changing project bytes and reloads history after restart', async () => {
    const { dataDir, projectRoot, taskRoot, providerSpecs, service } = await fixture();
    const before = {
      paper: await sha(path.join(projectRoot, 'paper.md')),
      remove: await sha(path.join(projectRoot, 'remove.txt')),
    };
    const created = await service.createTask({ projectId: 'demo', providerId: 'mock-cli', prompt: 'Make changes' });
    await service.waitForTask(created.id, { statuses: ['waiting-review'] });
    const rejected = await service.rejectTask('demo', created.id, { reason: 'Not suitable' });

    expect(rejected.status).toBe('rejected');
    expect(rejected.review.reason).toBe('Not suitable');
    expect(await sha(path.join(projectRoot, 'paper.md'))).toBe(before.paper);
    expect(await sha(path.join(projectRoot, 'remove.txt'))).toBe(before.remove);

    const reloaded = createCliTaskAgentService({
      dataDir,
      taskRoot,
      providerSpecs,
      projectRootResolver: async () => projectRoot,
    });
    await reloaded.initialize();
    const history = await reloaded.listTasks('demo');
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: created.id, status: 'rejected' });
  });

  it('accepts reviewed changes and refuses to apply when the source project drifted', async () => {
    const { projectRoot, service } = await fixture();
    const acceptedTask = await service.createTask({ projectId: 'demo', providerId: 'mock-cli', prompt: 'Make changes' });
    await service.waitForTask(acceptedTask.id, { statuses: ['waiting-review'] });
    const accepted = await service.acceptTask('demo', acceptedTask.id);

    expect(accepted.status).toBe('accepted');
    expect(await readFile(path.join(projectRoot, 'paper.md'), 'utf8')).toContain('Revised by isolated task.');
    expect(await readFile(path.join(projectRoot, 'new', 'notes.md'), 'utf8')).toBe('new evidence\n');
    await expect(readFile(path.join(projectRoot, 'remove.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

    const driftTask = await service.createTask({ projectId: 'demo', providerId: 'mock-cli', prompt: 'Make another change' });
    await service.waitForTask(driftTask.id, { statuses: ['waiting-review'] });
    await writeFile(path.join(projectRoot, 'paper.md'), '# User edit\n');

    await expect(service.acceptTask('demo', driftTask.id)).rejects.toMatchObject({
      code: 'CLI_TASK_SOURCE_DRIFT',
      statusCode: 409,
    });
    expect(await readFile(path.join(projectRoot, 'paper.md'), 'utf8')).toBe('# User edit\n');
    expect((await service.getTask('demo', driftTask.id)).status).toBe('waiting-review');
  });

  it('rejects project snapshots containing symbolic links', async () => {
    const { projectRoot, service } = await fixture();
    await symlink('/etc/hosts', path.join(projectRoot, 'unsafe-link'));

    await expect(service.createTask({
      projectId: 'demo',
      providerId: 'mock-cli',
      prompt: 'Try to edit the project',
    })).rejects.toMatchObject({
      code: 'CLI_TASK_SYMLINK_NOT_ALLOWED',
      statusCode: 400,
    });
  });

  it('cancels the full CLI process and persists a cancelled terminal state', async () => {
    const { service } = await fixture();
    const created = await service.createTask({
      projectId: 'demo',
      providerId: 'mock-cli',
      prompt: 'WAIT_FOR_CANCEL',
    });
    await service.waitForTask(created.id, { statuses: ['running'] });
    const result = await service.cancelTask('demo', created.id);
    expect(result.cancelled).toBe(true);
    const cancelled = await service.waitForTask(created.id, { statuses: ['cancelled'] });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.provenance.exitStatus).toBe('cancelled');
  });

  it('rolls back already-applied files when a later apply operation fails', async () => {
    const { projectRoot, taskRoot, service } = await fixture();
    const beforePaper = await sha(path.join(projectRoot, 'paper.md'));
    const beforeRemove = await sha(path.join(projectRoot, 'remove.txt'));
    const created = await service.createTask({ projectId: 'demo', providerId: 'mock-cli', prompt: 'Make changes' });
    await service.waitForTask(created.id, { statuses: ['waiting-review'] });
    await rm(path.join(taskRoot, created.id, 'work', 'paper.md'));

    await expect(service.acceptTask('demo', created.id)).rejects.toMatchObject({ statusCode: 500 });
    expect(await sha(path.join(projectRoot, 'paper.md'))).toBe(beforePaper);
    expect(await sha(path.join(projectRoot, 'remove.txt'))).toBe(beforeRemove);
    await expect(readFile(path.join(projectRoot, 'new', 'notes.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await service.getTask('demo', created.id)).status).toBe('waiting-review');
  });

  it('uses provider-specific fixed write permissions without enabling arbitrary shell access', () => {
    const prompt = 'fixed prompt';
    const snapshotRoot = '/isolated/snapshot';
    const codex = CLI_TASK_PROVIDER_SPECS['codex-cli'].buildArgs({ prompt, model: '', snapshotRoot });
    expect(codex).toEqual(expect.arrayContaining(['--sandbox', 'workspace-write', '--ignore-user-config', '--ignore-rules', '-C', snapshotRoot]));
    expect(codex).not.toContain('danger-full-access');

    const claude = CLI_TASK_PROVIDER_SPECS['claude-cli'].buildArgs({ prompt, model: '', snapshotRoot });
    expect(claude).toEqual(expect.arrayContaining(['--permission-mode', 'dontAsk', '--tools', 'Read,Edit,Write', '--allowedTools', 'Read,Edit,Write']));
    expect(claude.join(' ')).not.toMatch(/Bash|bypassPermissions|dangerously/);

    const copilot = CLI_TASK_PROVIDER_SPECS['copilot-cli'].buildArgs({ prompt, model: '', snapshotRoot });
    expect(copilot).toEqual(expect.arrayContaining(['--available-tools=read,write', '--allow-tool=read', '--allow-tool=write', '--disable-builtin-mcps', '--disallow-temp-dir']));
    expect(copilot.join(' ')).not.toMatch(/allow-all|allow-all-paths|yolo|shell/);
  });
});
