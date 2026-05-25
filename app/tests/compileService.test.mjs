import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import path from 'path';

// Mock child_process
vi.mock('child_process', () => {
  return {
    spawn: vi.fn(),
    execSync: vi.fn(),
  };
});

// Mock projectService
vi.mock('../apps/backend/src/services/projectService.js', () => ({
  getProjectRoot: vi.fn(),
}));

// Mock fsUtils
vi.mock('../apps/backend/src/utils/fsUtils.js', () => ({
  ensureDir: vi.fn(async () => {}),
}));

// Mock pathUtils
vi.mock('../apps/backend/src/utils/pathUtils.js', () => ({
  safeJoin: vi.fn((base, rel) => path.join(base, rel)),
}));

// Mock fs.promises
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    promises: {
      access: vi.fn(async () => {}),
      readFile: vi.fn(async (filePath) => {
        if (filePath.endsWith('.pdf')) {
          return Buffer.from('%PDF-1.4 fake pdf content');
        }
        if (filePath.endsWith('.synctex.gz')) {
          throw new Error('ENOENT');
        }
        if (filePath.endsWith('.aux')) {
          return '';
        }
        return '';
      }),
      rm: vi.fn(async () => {}),
    },
  };
});

const { spawn, execSync } = await import('child_process');
const { getProjectRoot } = await import('../apps/backend/src/services/projectService.js');
const { runCompile, SUPPORTED_ENGINES } = await import('../apps/backend/src/services/compileService.js');

function createMockProcess(exitCode = 0, delay = 0) {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn(() => {
    proc.emit('close', null);
  });

  if (delay === 0) {
    // Emit close on next tick
    process.nextTick(() => {
      proc.stdout.emit('data', Buffer.from('compile output\n'));
      proc.emit('close', exitCode);
    });
  }
  // If delay > 0, the caller controls when close fires (for timeout tests)

  return proc;
}

describe('compileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectRoot.mockResolvedValue('/tmp/test-project');
    execSync.mockImplementation(() => Buffer.from('/usr/bin/pdflatex\n'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SUPPORTED_ENGINES', () => {
    it('exports the list of supported engines', () => {
      expect(SUPPORTED_ENGINES).toEqual(['pdflatex', 'xelatex', 'lualatex', 'latexmk', 'tectonic']);
    });
  });

  describe('runCompile - successful compilation', () => {
    it('returns ok with pdf base64 on successful compile (exit code 0)', async () => {
      spawn.mockImplementation(() => createMockProcess(0));

      const result = await runCompile({
        projectId: 'test-project',
        mainFile: 'main.tex',
        engine: 'pdflatex',
      });

      expect(result.ok).toBe(true);
      expect(result.pdf).toBeTruthy();
      expect(typeof result.pdf).toBe('string');
      // Verify it's valid base64
      expect(() => Buffer.from(result.pdf, 'base64')).not.toThrow();
      expect(result.log).toContain('compile output');
    });

    it('calls spawn with correct arguments for pdflatex', async () => {
      spawn.mockImplementation(() => createMockProcess(0));

      await runCompile({
        projectId: 'test-project',
        mainFile: 'main.tex',
        engine: 'pdflatex',
      });

      // First spawn call should be pdflatex with expected args
      expect(spawn).toHaveBeenCalledWith(
        'pdflatex',
        expect.arrayContaining(['-interaction=nonstopmode', '-synctex=1', 'main.tex']),
        expect.objectContaining({ cwd: '/tmp/test-project' }),
      );
    });

    it('calls spawn with correct arguments for tectonic', async () => {
      spawn.mockImplementation(() => createMockProcess(0));

      await runCompile({
        projectId: 'test-project',
        mainFile: 'paper.tex',
        engine: 'tectonic',
      });

      expect(spawn).toHaveBeenCalledWith(
        'tectonic',
        expect.arrayContaining(['--outdir', expect.any(String), 'paper.tex']),
        expect.objectContaining({ cwd: '/tmp/test-project' }),
      );
    });
  });

  describe('runCompile - unsupported engine', () => {
    it('rejects an unsupported engine with error', async () => {
      const result = await runCompile({
        projectId: 'test-project',
        mainFile: 'main.tex',
        engine: 'invalid-engine',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Unsupported engine');
      expect(result.error).toContain('invalid-engine');
      // spawn should never be called
      expect(spawn).not.toHaveBeenCalled();
    });

    it('rejects empty engine string', async () => {
      const result = await runCompile({
        projectId: 'test-project',
        mainFile: 'main.tex',
        engine: '',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Unsupported engine');
    });
  });

  describe('runCompile - unavailable engine', () => {
    it('returns error when engine is not found by which', async () => {
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('which')) {
          throw new Error('not found');
        }
      });

      const result = await runCompile({
        projectId: 'test-project',
        mainFile: 'main.tex',
        engine: 'pdflatex',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('not installed');
      expect(result.availableEngines).toEqual([]);
      expect(spawn).not.toHaveBeenCalled();
    });

    it('includes install hint for tectonic', async () => {
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('which')) {
          throw new Error('not found');
        }
      });

      const result = await runCompile({
        projectId: 'test-project',
        mainFile: 'main.tex',
        engine: 'tectonic',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('tectonic');
      expect(result.error).toContain('install');
    });

    it('lists available engines when requested engine is missing', async () => {
      execSync.mockImplementation((cmd) => {
        // Only xelatex is available
        if (cmd === 'which xelatex') return Buffer.from('/usr/bin/xelatex\n');
        throw new Error('not found');
      });

      const result = await runCompile({
        projectId: 'test-project',
        mainFile: 'main.tex',
        engine: 'pdflatex',
      });

      expect(result.ok).toBe(false);
      expect(result.availableEngines).toEqual(['xelatex']);
      expect(result.error).toContain('xelatex');
    });
  });

  describe('runCompile - timeout mechanism', () => {
    it('kills process and returns error after timeout', async () => {
      vi.useFakeTimers();

      const hangingProc = new EventEmitter();
      hangingProc.stdout = new EventEmitter();
      hangingProc.stderr = new EventEmitter();
      hangingProc.kill = vi.fn((signal) => {
        // Simulate the process being killed - emit close after kill
        process.nextTick(() => hangingProc.emit('close', null));
      });

      spawn.mockImplementation(() => hangingProc);

      const compilePromise = runCompile({
        projectId: 'test-project',
        mainFile: 'main.tex',
        engine: 'pdflatex',
      });

      // Advance time past the 120s timeout
      await vi.advanceTimersByTimeAsync(120_000);

      const result = await compilePromise;

      expect(hangingProc.kill).toHaveBeenCalledWith('SIGKILL');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('timed out');

      vi.useRealTimers();
    });

    it('does not kill process that completes before timeout', async () => {
      vi.useFakeTimers();

      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = vi.fn();

      spawn.mockImplementation(() => {
        // Complete after 1 second
        setTimeout(() => {
          proc.emit('close', 0);
        }, 1000);
        return proc;
      });

      const compilePromise = runCompile({
        projectId: 'test-project',
        mainFile: 'main.tex',
        engine: 'tectonic', // tectonic doesn't do multi-pass
      });

      await vi.advanceTimersByTimeAsync(1000);

      const result = await compilePromise;

      expect(proc.kill).not.toHaveBeenCalled();
      expect(result.ok).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('runCompile - spawn error', () => {
    it('handles spawn error event gracefully', async () => {
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = vi.fn();

      spawn.mockImplementation(() => {
        process.nextTick(() => {
          proc.emit('error', new Error('ENOENT: spawn failed'));
        });
        return proc;
      });

      const result = await runCompile({
        projectId: 'test-project',
        mainFile: 'main.tex',
        engine: 'pdflatex',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('not available');
    });
  });
});
