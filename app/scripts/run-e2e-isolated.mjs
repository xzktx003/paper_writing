import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendEntry = path.join(appRoot, 'apps/backend/src/index.js');
const playwrightCli = path.join(appRoot, 'node_modules/@playwright/test/cli.js');
const vitestCli = path.join(appRoot, 'node_modules/vitest/vitest.mjs');
const browserLibraries = path.resolve(appRoot, '../.playwright-deps/usr/lib/x86_64-linux-gnu');
const cliTaskMockPath = path.join(appRoot, 'tests/fixtures/mock-cli-task.mjs');

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error('Unable to reserve an isolated E2E port');
  return port;
}

async function waitForHealth(baseURL, backend, getLogs) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (backend.exitCode !== null) {
      throw new Error(`E2E backend exited before becoming ready (code ${backend.exitCode}).\n${getLogs()}`);
    }
    try {
      const [healthResponse, readyResponse] = await Promise.all([
        fetch(`${baseURL}/api/health`),
        fetch(`${baseURL}/api/ready`),
      ]);
      if (!healthResponse.ok || !readyResponse.ok) continue;
      const health = await healthResponse.json();
      const ready = await readyResponse.json();
      if (health.ok && health.build?.id && health.build?.apiSchemaVersion === 2 && ready.ready === true) return;
    } catch {
      // The listener may not be ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for E2E backend at ${baseURL}.\n${getLogs()}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-wrighting-e2e-'));
const dataDir = path.join(tempRoot, 'papers');
const port = await reservePort();
const baseURL = `http://127.0.0.1:${port}`;
const inheritedLibraryPath = process.env.LD_LIBRARY_PATH || '';
const libraryPath = [browserLibraries, inheritedLibraryPath].filter(Boolean).join(':');
const e2eApiToken = String(process.env.OPENPRISM_E2E_API_TOKEN || '').trim()
  || `e2e-${randomBytes(24).toString('hex')}`;
const childEnv = {
  ...process.env,
  NODE_ENV: 'test',
  OPENPRISM_DATA_DIR: dataDir,
  OPENPRISM_PROJECTS_DIR: dataDir,
  OPENPRISM_PORT: String(port),
  OPENPRISM_PUBLIC_HOST: '127.0.0.1',
  BASE_URL: baseURL,
  BACKEND_URL: baseURL,
  PLAYWRIGHT_OUTPUT_DIR: path.join(tempRoot, 'test-results'),
  PLAYWRIGHT_HTML_REPORT: path.join(tempRoot, 'playwright-report'),
  LD_LIBRARY_PATH: libraryPath,
  OPENPRISM_E2E_CLI_TASK_MOCK_PATH: cliTaskMockPath,
  OPENPRISM_E2E_ISOLATED: '1',
};
// A developer's ordinary server token must never leak into an isolated run.
// Every run uses either its explicit E2E token or a fresh random token.
delete childEnv.OPENPRISM_API_TOKEN;
childEnv.OPENPRISM_API_TOKEN = e2eApiToken;
childEnv.OPENPRISM_E2E_API_TOKEN = e2eApiToken;

let backend;
let backendLogs = '';
let exitCode = 1;
const requestedArgs = process.argv.slice(2);
const runVitest = requestedArgs[0] === '--vitest';
const testArgs = runVitest ? requestedArgs.slice(1) : requestedArgs;

try {
  backend = spawn(process.execPath, [backendEntry], {
    cwd: tempRoot,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const appendLog = (chunk) => {
    backendLogs = `${backendLogs}${chunk}`.slice(-20_000);
  };
  backend.stdout.on('data', appendLog);
  backend.stderr.on('data', appendLog);

  await waitForHealth(baseURL, backend, () => backendLogs);
  process.stdout.write(`Isolated test server: ${baseURL}\n`);
  process.stdout.write(`Isolated test data: ${dataDir}\n`);

  const testProcess = spawn(
    process.execPath,
    [runVitest ? vitestCli : playwrightCli, runVitest ? 'run' : 'test', ...testArgs],
    {
    cwd: appRoot,
    env: childEnv,
    stdio: 'inherit',
    },
  );
  exitCode = await new Promise((resolve, reject) => {
    testProcess.once('error', reject);
    testProcess.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
} catch (error) {
  process.stderr.write(`${error.stack || error}\n`);
  if (backendLogs) process.stderr.write(`Backend output:\n${backendLogs}\n`);
} finally {
  await stopProcess(backend);
  await rm(tempRoot, { recursive: true, force: true });
}

process.exitCode = exitCode;
