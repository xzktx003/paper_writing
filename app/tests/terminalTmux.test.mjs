import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { buildTmuxSpawnOptions, getTerminalSessionName } from '../apps/backend/src/routes/terminal.js';

describe('tmux-backed terminal sessions', () => {
  it('derives a stable sanitized tmux session name per project/cwd', () => {
    const first = getTerminalSessionName('__openprism__:project/demo id');
    const second = getTerminalSessionName('__openprism__:project/demo id');
    const other = getTerminalSessionName('__openprism__:project/other');

    expect(first).toBe(second);
    expect(first).toMatch(/^openprism-[A-Za-z0-9_-]+-[0-9a-f]{10}$/);
    expect(first).not.toBe(other);
    expect(first).not.toContain('/');
    expect(first).not.toContain(':');
  });

  it('spawns tmux with new-session -A so existing sessions are reattached and missing sessions are recreated', () => {
    const config = buildTmuxSpawnOptions({ cwd: '/tmp/project', cols: 100, rows: 30, sessionName: 'openprism-demo-1234567890' });

    expect(config.command).toBe('tmux');
    expect(config.args).toEqual(['new-session', '-A', '-s', 'openprism-demo-1234567890', '-c', '/tmp/project']);
    expect(config.options.cwd).toBe('/tmp/project');
    expect(config.options.cols).toBe(100);
    expect(config.options.rows).toBe(30);
    expect(config.options.env.TERM).toBe('xterm-256color');
  });

  it('documents that websocket close detaches the client without treating the project terminal as disposable', async () => {
    const source = await readFile(join(process.cwd(), 'apps/backend/src/routes/terminal.js'), 'utf8');
    expect(source).toContain("ws.send(JSON.stringify({ type: 'id', id, session: sessionName, backend: 'tmux' }))");
    expect(source).toContain('new-session -A');
    expect(source).toContain('tmux session remains alive');
  });
});
