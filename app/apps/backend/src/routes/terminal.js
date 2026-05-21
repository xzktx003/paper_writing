import { spawn } from 'child_process';

const terminals = new Map();
let nextId = 1;

export function registerTerminalRoutes(fastify) {
  fastify.get('/api/terminal/ws', { websocket: true }, (socket, request) => {
    const cwd = request.query.cwd || process.env.HOME;
    const shell = process.env.SHELL || '/bin/bash';

    const id = String(nextId++);
    const proc = spawn(shell, ['-i'], {
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    terminals.set(id, proc);
    socket.send(JSON.stringify({ type: 'id', id }));

    proc.stdout.on('data', (data) => {
      try { socket.send(JSON.stringify({ type: 'data', data: data.toString() })); } catch (e) {}
    });

    proc.stderr.on('data', (data) => {
      try { socket.send(JSON.stringify({ type: 'data', data: data.toString() })); } catch (e) {}
    });

    proc.on('exit', (code) => {
      try { socket.send(JSON.stringify({ type: 'exit', code })); } catch (e) {}
      terminals.delete(id);
      socket.close();
    });

    socket.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg.toString());
        if (parsed.type === 'data') {
          proc.stdin.write(parsed.data);
        }
      } catch (e) {
        proc.stdin.write(msg.toString());
      }
    });

    socket.on('close', () => {
      proc.kill();
      terminals.delete(id);
    });
  });
}
