import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { existsSync } from 'fs';
import crypto from 'crypto';
import { resolveManagedProjectRequest } from '../services/managedProjectContext.js';
 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootRequire = createRequire(path.join(__dirname, '..', '..', '..', '..', 'node_modules', 'noop.txt'));
let ptyModule = null;
 
const MAX_BUFFER_BYTES = 50 * 1024;
const CLEANUP_TIMEOUT_MS = 5 * 60 * 1000;
 
const sessionPool = new Map();
 
function loadPty() {
  if (!ptyModule) {
    ptyModule = rootRequire('node-pty');
  }
  return ptyModule;
}
 
export async function resolveTerminalCwd(request, options = {}) {
  if (request.query?.projectId) {
    return (await resolveManagedProjectRequest(request, null, {
      source: 'query',
      route: 'terminal.websocket',
      ...(options.resolveProjectRoot ? { resolveProjectRoot: options.resolveProjectRoot } : {}),
    })).projectRoot;
  }
  if (request.query?.cwd) {
    const legacyRequest = {
      ...request,
      query: { projectPath: request.query.cwd },
    };
    return (await resolveManagedProjectRequest(legacyRequest, null, {
      source: 'query',
      route: 'terminal.websocket',
      ...(options.resolveProjectRoot ? { resolveProjectRoot: options.resolveProjectRoot } : {}),
    })).projectRoot;
  }
  return process.env.HOME;
}
 
export function getTerminalSessionName(cwd = '') {
  const raw = String(cwd || 'home');
  const explicitProjectId = raw.startsWith('__paper_agent__:') ? raw.replace('__paper_agent__:', '') : '';
  const stableInput = explicitProjectId || raw;
  const readable = (explicitProjectId || path.basename(raw) || 'home')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'home';
  const digest = crypto.createHash('sha1').update(stableInput).digest('hex').slice(0, 10);
  return `paper-agent-${readable}-${digest}`;
}
 
export function buildTmuxSpawnOptions({ cwd, cols, rows, sessionName }) {
  return {
    command: 'tmux',
    args: ['new-session', '-A', '-s', sessionName, '-c', cwd],
    options: {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: process.env.COLORTERM || 'truecolor',
      },
    },
  };
}
 
function appendToBuffer(entry, data) {
  entry.buffer.push(data);
  entry.bufferBytes += data.length;
  while (entry.bufferBytes > MAX_BUFFER_BYTES && entry.buffer.length > 1) {
    entry.bufferBytes -= entry.buffer.shift().length;
  }
}
 
export function registerTerminalRoutes(fastify) {
  fastify.get('/api/terminal/ws', { websocket: true }, async (connection, request) => {
    const ws = connection;
    let cwd;
    try {
      cwd = await resolveTerminalCwd(request);
    } catch (error) {
      try { ws.send(JSON.stringify({ type: 'error', error: error.message })); } catch {}
      try { ws.close(4003, error.message.slice(0, 120)); } catch {}
      return;
    }
    const cols = parseInt(request.query.cols) || 80;
    const rows = parseInt(request.query.rows) || 24;
    const sessionName = getTerminalSessionName(request.query.projectId ? `project:${request.query.projectId}` : request.query.cwd || cwd);
 
    let entry = sessionPool.get(sessionName);
 
    if (entry) {
      if (entry.cleanupTimer) {
        clearTimeout(entry.cleanupTimer);
        entry.cleanupTimer = null;
      }
      if (entry.ws && entry.ws.readyState <= 1) {
        try { entry.ws.close(); } catch (e) {}
      }
      entry.ws = ws;
      entry.ptyProcess.resize(cols, rows);
 
      ws.send(JSON.stringify({ type: 'id', session: sessionName, backend: 'tmux', resumed: true }));
      if (entry.buffer.length > 0) {
        ws.send(JSON.stringify({ type: 'replay', data: entry.buffer.join('') }));
      }
    } else {
      const spawnConfig = buildTmuxSpawnOptions({ cwd, cols, rows, sessionName });
      let pty;
      try {
        pty = loadPty();
      } catch (error) {
        const message = 'Terminal backend unavailable: node-pty native module failed to load.';
        fastify.log.error({ err: error }, message);
        try { if (ws && ws.readyState <= 1) ws.send(JSON.stringify({ type: 'error', error: message })); } catch (e) {}
        try { ws.close(1011, message); } catch (e) {}
        return;
      }
      let ptyProcess;
      try {
        ptyProcess = pty.spawn(spawnConfig.command, spawnConfig.args, spawnConfig.options);
      } catch (error) {
        const message = `Terminal failed to start: ${error.message || String(error)}`;
        fastify.log.error({ err: error, cwd, sessionName }, message);
        try { if (ws && ws.readyState <= 1) ws.send(JSON.stringify({ type: 'error', error: message })); } catch {}
        try { ws.close(1011, message.slice(0, 120)); } catch {}
        return;
      }
 
      entry = {
        ptyProcess,
        ws,
        cleanupTimer: null,
        buffer: [],
        bufferBytes: 0,
        sessionName,
      };
      sessionPool.set(sessionName, entry);
 
      if (ws && ws.readyState <= 1) { ws.send(JSON.stringify({ type: 'id', session: sessionName, backend: 'tmux', resumed: false })); }
 
      ptyProcess.onData((data) => {
        appendToBuffer(entry, data);
        if (entry.ws && entry.ws.readyState === 1) {
          try { entry.ws.send(JSON.stringify({ type: 'data', data })); } catch (e) {}
        }
      });
 
      ptyProcess.onExit(({ exitCode }) => {
        if (entry.ws && entry.ws.readyState === 1) {
          try { if (entry.ws && entry.ws.readyState <= 1) entry.ws.send(JSON.stringify({ type: 'exit', code: exitCode })); } catch (e) {}
        }
        if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
        sessionPool.delete(sessionName);
      });
    }
 
    ws.on('message', (msg) => {
      if (!sessionPool.has(sessionName)) return;
      try {
        const parsed = JSON.parse(msg.toString());
        if (parsed.type === 'data') {
          entry.ptyProcess.write(parsed.data);
        } else if (parsed.type === 'resize') {
          entry.ptyProcess.resize(parsed.cols, parsed.rows);
        }
      } catch (e) {
        entry.ptyProcess.write(msg.toString());
      }
    });
 
    ws.on('close', () => {
      if (!sessionPool.has(sessionName)) return;
      entry.ws = null;
      entry.cleanupTimer = setTimeout(() => {
        entry.ptyProcess.kill();
        sessionPool.delete(sessionName);
      }, CLEANUP_TIMEOUT_MS);
    });
  });
}
 
