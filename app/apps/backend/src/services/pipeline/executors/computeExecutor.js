import { spawn } from 'child_process';
import { STAGE_STATUS } from '../stageTypes.js';
 
const DEFAULT_TIMEOUT = 300_000; // 5 minutes
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // 2 MB output cap
 
// Whitelist of allowed executables for sandbox execution
const ALLOWED_EXECUTABLES = new Set([
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
  'ls', 'cat', 'head', 'tail', 'grep', 'find', 'sort', 'wc', 'diff', 'echo', 'env', 'which',
  'tar', 'gzip', 'gunzip', 'zip', 'unzip',
  'curl', 'wget',
]);
 
// Patterns that are never allowed even if the base executable is whitelisted
const FORBIDDEN_PATTERNS = [
  /\brm\s+-rf\s+[\/~]/,     // rm -rf on root or home
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
];
 
/**
 * Extract the base executable name from a command string.
 * Handles simple commands like "python3 script.py" and piped commands.
 */
function extractBaseCommand(command) {
  const trimmed = command.trim();
  // Take the first token before any pipe/redirect/semicolon
  const firstSegment = trimmed.split(/[|;&><]/)[0].trim();
  // Extract the executable name (skip env vars like FOO=bar)
  const tokens = firstSegment.split(/\s+/);
  for (const token of tokens) {
    if (token.includes('=')) continue; // skip env assignments
    // Return the basename to handle paths like /usr/bin/python3
    return token.split('/').pop();
  }
  return '';
}
 
/**
 * Validate a compute command for sandbox execution.
 * Throws if the command is not allowed.
 */
function validateComputeCommand(command) {
  if (!command || typeof command !== 'string') {
    throw new Error('Command is required');
  }
  if (command.length > 4000) {
    throw new Error('Command too long (max 4000 chars)');
  }
 
  // Check forbidden patterns first
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Forbidden pattern detected in command: ${pattern}`);
    }
  }
 
  const baseCmd = extractBaseCommand(command);
  if (!baseCmd) {
    throw new Error('Could not determine executable from command');
  }
  if (!ALLOWED_EXECUTABLES.has(baseCmd)) {
    throw new Error(`Executable "${baseCmd}" is not in the allowed list. Allowed: ${[...ALLOWED_EXECUTABLES].join(', ')}`);
  }
}
 
export async function executeComputeStage(stage, context, signal) {
  const { config } = stage;
  const { projectPath } = context;
  const timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT;
  const cwd = config.cwd ? config.cwd : projectPath;
 
  // Validate command before execution
  try {
    validateComputeCommand(config.command);
  } catch (err) {
    return {
      status: STAGE_STATUS.FAILED,
      output: null,
      error: `Sandbox validation failed: ${err.message}`,
      metadata: { exitCode: null, sandboxRejected: true },
    };
  }
 
  return new Promise((resolve, reject) => {
    const args = config.args || [];
    const child = spawn(config.command, args, {
      cwd,
      env: { ...process.env, ...(config.env || {}) },
      // Use shell only for compound commands; single executables run directly
      shell: true,
    });
 
    let stdout = '';
    let stderr = '';
    let killed = false;
    let truncated = false;
 
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeoutMs);
 
    if (signal) {
      signal.addEventListener('abort', () => {
        killed = true;
        child.kill('SIGKILL');
        clearTimeout(timer);
      }, { once: true });
    }
 
    child.stdout.on('data', d => {
      if (stdout.length < MAX_OUTPUT_BYTES) {
        stdout += d.toString();
      } else {
        truncated = true;
      }
    });
    child.stderr.on('data', d => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr += d.toString();
      }
    });
 
    child.on('error', err => {
      clearTimeout(timer);
      resolve({
        status: STAGE_STATUS.FAILED,
        output: stderr || stdout,
        error: err.message,
        metadata: { exitCode: null },
      });
    });
 
    child.on('close', code => {
      clearTimeout(timer);
      const meta = { exitCode: code };
      if (truncated) meta.truncated = true;
      if (killed) {
        resolve({
          status: STAGE_STATUS.FAILED,
          output: stdout,
          error: `Process timed out after ${timeoutMs / 1000}s and was killed`,
          metadata: { ...meta, timedOut: true },
        });
      } else if (code !== 0) {
        resolve({
          status: STAGE_STATUS.FAILED,
          output: stdout,
          error: stderr || `Process exited with code ${code}`,
          metadata: meta,
        });
      } else {
        resolve({
          status: STAGE_STATUS.COMPLETED,
          output: stdout,
          metadata: meta,
        });
      }
    });
  });
}
 
