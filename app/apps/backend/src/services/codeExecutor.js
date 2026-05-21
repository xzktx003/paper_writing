import { spawn } from 'child_process';

const TIMEOUT_MS = 5 * 60 * 1000;

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
