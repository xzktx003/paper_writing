import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import path from 'path';
import { readFileSync } from 'node:fs';

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

// Mock pathSecurity
vi.mock('../apps/backend/src/utils/pathSecurity.js', () => ({
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
        if (filePath.endsWith('.tex')) {
          return '\\documentclass{article}\\begin{document}content\\end{document}';
        }
        return '';
      }),
      writeFile: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
      copyFile: vi.fn(async () => {}),
      rm: vi.fn(async () => {}),
    },
  };
});

const { spawn, execSync } = await import('child_process');
const { promises: fsPromises } = await import('fs');
const { getProjectRoot } = await import('../apps/backend/src/services/projectService.js');
const {
  runCompile,
  SUPPORTED_ENGINES,
  extractMissingTexFile,
  parseCompileDiagnostics,
  getEngineEnv,
  getPandocPdfEngines,
  getTectonicBinary,
} = await import('../apps/backend/src/services/compileService.js');

function createMockProcess(exitCode = 0, delay = 0, output = 'compile output\n') {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn(() => {
    proc.emit('close', null);
  });

  if (delay === 0) {
    // Emit close on next tick
    process.nextTick(() => {
      proc.stdout.emit('data', Buffer.from(output));
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
    fsPromises.readFile.mockImplementation(async (filePath) => {
      if (filePath.endsWith('.pdf')) return Buffer.from('%PDF-1.4 fake pdf content');
      if (filePath.endsWith('.synctex.gz')) throw new Error('ENOENT');
      if (filePath.endsWith('.aux')) return '';
      if (filePath.endsWith('.tex')) return '\\documentclass{article}\\begin{document}content\\end{document}';
      return '';
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SUPPORTED_ENGINES', () => {
    it('exports the list of supported engines', () => {
      expect(SUPPORTED_ENGINES).toEqual(['pdflatex', 'xelatex', 'lualatex', 'latexmk', 'tectonic']);
    });
  });

  describe('portable compile environment', () => {
    it('inherits PATH and LD_LIBRARY_PATH unchanged when no compile overrides are configured', () => {
      const baseEnv = {
        PATH: '/usr/bin:/bin',
        LD_LIBRARY_PATH: '/usr/lib',
        OPENPRISM_COMPILE_PATH: '',
        OPENPRISM_COMPILE_LD_LIBRARY_PATH: '',
      };

      expect(getEngineEnv(baseEnv)).toEqual(baseEnv);
      expect(getTectonicBinary(baseEnv)).toBe('tectonic');
    });

    it('prepends only explicit compile paths without empty or duplicate entries', () => {
      const baseEnv = {
        PATH: ['/usr/bin', '/bin'].join(path.delimiter),
        LD_LIBRARY_PATH: '/usr/lib',
        OPENPRISM_COMPILE_PATH: ['/opt/tex/bin', '/usr/bin', '/opt/pandoc/bin'].join(path.delimiter),
        OPENPRISM_COMPILE_LD_LIBRARY_PATH: ['/opt/tectonic/lib', '/usr/lib'].join(path.delimiter),
        OPENPRISM_TECTONIC_BINARY: '/opt/tectonic/bin/tectonic',
      };

      const result = getEngineEnv(baseEnv);
      expect(result.PATH).toBe(['/opt/tex/bin', '/usr/bin', '/opt/pandoc/bin', '/bin'].join(path.delimiter));
      expect(result.LD_LIBRARY_PATH).toBe(['/opt/tectonic/lib', '/usr/lib'].join(path.delimiter));
      expect(result.PATH.split(path.delimiter)).not.toContain('');
      expect(result.LD_LIBRARY_PATH.split(path.delimiter)).not.toContain('');
      expect(getTectonicBinary(baseEnv)).toBe('/opt/tectonic/bin/tectonic');
      expect(getPandocPdfEngines(baseEnv)[0]).toBe('--pdf-engine=/opt/tectonic/bin/tectonic');
    });

    it('does not embed developer home, Conda, or guessed HOME/bin paths in compile sources', () => {
      const serviceSource = readFileSync(path.resolve('apps/backend/src/services/compileService.js'), 'utf8');
      const routeSource = readFileSync(path.resolve('apps/backend/src/routes/compile.js'), 'utf8');
      const combined = `${serviceSource}\n${routeSource}`;

      expect(combined).not.toContain('/data01/home/');
      expect(combined).not.toContain('/anaconda3/lib');
      expect(combined).not.toContain("path.join(USER_HOME, 'bin'");
      expect(getPandocPdfEngines({})[0]).toBe('--pdf-engine=tectonic');
    });
  });

  describe('automatic TeX dependency detection', () => {
    it('extracts safe missing package files from LaTeX logs', () => {
      expect(extractMissingTexFile("! LaTeX Error: File `newtxtext.sty' not found.")).toBe('newtxtext.sty');
      expect(extractMissingTexFile("! LaTeX Error: File `subdir/custom.cls' not found.")).toBe('custom.cls');
    });

    it('ignores unsupported or unsafe missing file names', () => {
      expect(extractMissingTexFile("! LaTeX Error: File `figure.png' not found.")).toBeNull();
      expect(extractMissingTexFile('ordinary compilation error')).toBeNull();
    });
  });

  describe('structured compile diagnostics', () => {
    it('treats Tectonic six-pass exhaustion as a warning when a PDF exists', () => {
      const result = parseCompileDiagnostics(
        'warning: TeX rerun seems needed, but stopping at 6 passes\n',
        { pdfGenerated: true, exitCode: 0 },
      );

      expect(result.status).toBe('warning');
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'TECTONIC_MAX_PASSES' }),
      ]));
    });

    it('fails six-pass exhaustion when no PDF was generated', () => {
      const result = parseCompileDiagnostics(
        'warning: TeX rerun seems needed, but stopping at 6 passes\n',
        { pdfGenerated: false, exitCode: 1 },
      );

      expect(result.status).toBe('failed');
      expect(result.errors.length).toBeGreaterThan(0);
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
      expect(result.status).toBe('success');
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.pdf).toBeTruthy();
      expect(typeof result.pdf).toBe('string');
      expect(result.rootPdfPath).toBe('main.pdf');
      // Verify it's valid base64
      expect(() => Buffer.from(result.pdf, 'base64')).not.toThrow();
      expect(result.log).toContain('compile output');
      expect(fsPromises.rename).toHaveBeenCalledWith(
        expect.stringMatching(/\/\.compile\/output\/main\.pdf\.[^.]+\.tmp$/),
        '/tmp/test-project/.compile/output/main.pdf',
      );
      expect(fsPromises.rename).toHaveBeenCalledWith(
        expect.stringMatching(/\/main\.pdf\.[^.]+\.tmp$/),
        '/tmp/test-project/main.pdf',
      );
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

    it('adds a nested main-file directory to TeX, BibTeX, and BST search paths', async () => {
      spawn.mockImplementation(() => createMockProcess(0));

      await runCompile({
        projectId: 'test-project',
        mainFile: 'iclr2026/main.tex',
        engine: 'xelatex',
      });

      const compileOptions = spawn.mock.calls.find(([command]) => command === 'xelatex')?.[2];
      expect(compileOptions.cwd).toBe('/tmp/test-project');
      expect(compileOptions.env.TEXINPUTS).toContain('/tmp/test-project/iclr2026//:');
      expect(compileOptions.env.BIBINPUTS).toContain('/tmp/test-project/iclr2026//:');
      expect(compileOptions.env.BSTINPUTS).toContain('/tmp/test-project/iclr2026//:');
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

    it('returns a successful warning result when Tectonic emits the six-pass warning and a PDF exists', async () => {
      spawn.mockImplementation(() => createMockProcess(
        0,
        0,
        'warning: TeX rerun seems needed, but stopping at 6 passes\n',
      ));

      const result = await runCompile({
        projectId: 'test-project',
        mainFile: 'paper.tex',
        engine: 'tectonic',
      });

      expect(result).toMatchObject({ ok: true, status: 'warning', exitCode: 0 });
      expect(result.warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'TECTONIC_MAX_PASSES' }),
      ]));
    });

    it('reuses one controlled Tectonic cache directory across repeated project compiles', async () => {
      spawn.mockImplementation(() => createMockProcess(0));

      await runCompile({ projectId: 'test-project', mainFile: 'paper.tex', engine: 'tectonic' });
      await runCompile({ projectId: 'test-project', mainFile: 'paper.tex', engine: 'tectonic' });

      const tectonicCalls = spawn.mock.calls.filter(([command]) => command === 'tectonic');
      expect(tectonicCalls).toHaveLength(2);
      const firstEnv = tectonicCalls[0][2].env;
      const secondEnv = tectonicCalls[1][2].env;
      expect(firstEnv.XDG_CACHE_HOME).toBe('/tmp/test-project/.compile/tectonic-cache');
      expect(secondEnv.XDG_CACHE_HOME).toBe(firstEnv.XDG_CACHE_HOME);

      const normalizeArgs = (args) => args.map((arg, index) => args[index - 1] === '--outdir' ? '<run-output>' : arg);
      expect(normalizeArgs(tectonicCalls[1][1])).toEqual(normalizeArgs(tectonicCalls[0][1]));
    });

    it('does not report or persist a cached success when no PDF is generated', async () => {
      spawn.mockImplementation(() => createMockProcess(1, 0, 'fatal error: compilation stopped\n'));
      fsPromises.readFile.mockImplementation(async (filePath) => {
        if (filePath.endsWith('.pdf') || filePath.endsWith('.synctex.gz')) throw new Error('ENOENT');
        if (filePath.endsWith('.aux')) return '';
        if (filePath.endsWith('.tex')) return '\\documentclass{article}\\begin{document}broken';
        return '';
      });

      const result = await runCompile({ projectId: 'test-project', mainFile: 'paper.tex', engine: 'tectonic' });

      expect(result).toMatchObject({ ok: false, status: 'failed' });
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'NO_PDF' }),
      ]));
      expect(fsPromises.writeFile).not.toHaveBeenCalledWith(
        expect.stringContaining('/.compile/output/paper.pdf'),
        expect.anything(),
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

      // Advance time past the 240s timeout
      await vi.advanceTimersByTimeAsync(240_000);

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
