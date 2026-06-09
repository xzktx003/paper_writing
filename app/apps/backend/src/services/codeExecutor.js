import { spawn } from 'child_process';
import path from 'path';
 
const TIMEOUT_MS = 5 * 60 * 1000;
 
// Whitelisted script interpreters
const SCRIPT_INTERPRETERS = {
  py: 'python3',
  r: 'Rscript',
  R: 'Rscript',
  jl: 'julia',
  sh: 'bash',
  js: 'node',
  ts: 'npx',
};
 
// Whitelisted executables for executeCommand
const ALLOWED_COMMAND_EXECUTABLES = new Set([
  'python3', 'python', 'pip3', 'pip',
  'node', 'npx', 'npm',
  'Rscript', 'R',
  'julia',
  'bash', 'sh',
  'pdflatex', 'xelatex', 'lualatex', 'latexmk', 'tectonic',
  'bibtex', 'biber',
  'pandoc',
  'make', 'cmake',
  'git',
  'ls', 'cat', 'head', 'tail', 'grep', 'find', 'sort', 'wc', 'diff', 'echo', 'env', 'which', 'pwd',
  'test', 'true', 'false', 'exit', 'expr', 'read', 'set', 'unset', 'export',
  'tar', 'gzip', 'gunzip', 'zip', 'unzip',
  'curl', 'wget',
]);
 
const FORBIDDEN_PATTERNS = [
  /\brm\s+-rf\s+[\/~]/,
  /\bmkfs\b/,
  /\bdd\b.*of=/,
  /\bchmod\b.*777/,
  /\bchown\b/,
  /\bsudo\b/,
  /\bsu\b/,
  /\bnc\b.*-l/,
  /\bcurl\b.*\|\s*(ba)?sh/,
  /\bwget\b.*\|\s*(ba)?sh/,
  /\beval\b/,
  /;\s*\w/,            // semicolons chaining commands (e.g. "a; rm -rf /")
  /&&/,
  /\|\|/,
];
 
/**
 * Extract the base executable name from a command string.
 */
function extractBaseCommand(command) {
  const firstSegment = command.trim().split(/[|;&><]/)[0].trim();
  const tokens = firstSegment.split(/\s+/);
  for (const token of tokens) {
    if (token.includes('=')) continue;
    return token.split('/').pop();
  }
  return '';
}
 
/**
 * Validate a shell command against the whitelist.
 */
function validateCommand(command) {
  if (!command || typeof command !== 'string') {
    throw new Error('Command is required');
  }
  if (command.length > 4000) {
    throw new Error('Command too long (max 4000 chars)');
  }
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Blocked shell pattern: ${pattern}`);
    }
  }
  const baseCmd = extractBaseCommand(command);
  if (baseCmd && !ALLOWED_COMMAND_EXECUTABLES.has(baseCmd)) {
    throw new Error(`Executable "${baseCmd}" is not allowed. Allowed: ${[...ALLOWED_COMMAND_EXECUTABLES].join(', ')}`);
  }
}
 
export function executeScript(scriptPath, { cwd, args = [], timeout = TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const ext = scriptPath.split('.').pop();
    const command = SCRIPT_INTERPRETERS[ext];
    if (!command) {
      reject(new Error(`Unsupported script type: .${ext}. Allowed: ${Object.keys(SCRIPT_INTERPRETERS).join(', ')}`));
      return;
    }
 
    // Ensure script path is within cwd (basic path validation)
    const resolvedScript = path.resolve(cwd, scriptPath);
    const resolvedCwd = path.resolve(cwd);
    if (!resolvedScript.startsWith(resolvedCwd + path.sep) && resolvedScript !== resolvedCwd) {
      reject(new Error('Script path must be within the project directory'));
      return;
    }
 
    const proc = spawn(command, [resolvedScript, ...args], {
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
    // Validate command against whitelist
    try {
      validateCommand(command);
    } catch (err) {
      resolve({ code: -1, stdout: '', stderr: `Command rejected: ${err.message}` });
      return;
    }
 
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
 
