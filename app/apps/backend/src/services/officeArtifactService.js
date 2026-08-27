import { constants as fsConstants, promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { XMLParser } from 'fast-xml-parser';
import unzipper from 'unzipper';

import { safeJoin } from '../utils/pathSecurity.js';

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const TEXT_MAX_BYTES = 2 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.tsv', '.json', '.jsonl', '.yaml', '.yml', '.xml', '.html', '.htm', '.rtf']);
const OOXML_EXTENSIONS = new Set(['.docx', '.pptx', '.xlsx']);
const PDF_EXTENSIONS = new Set(['.pdf']);
const OFFICECLI_OPERATIONS = new Set(['inspect', 'create', 'edit', 'template-merge', 'render', 'validate']);
const ADAPTER_ENV_ALLOWLIST = [
  'PATH', 'LANG', 'LANGUAGE', 'LC_ALL', 'TZ',
  'HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME',
  'TMPDIR', 'TMP', 'TEMP',
  'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT',
];

const ADAPTERS = {
  officecli: {
    env: 'OFFICECLI_PATH',
    label: 'OfficeCLI',
    operations: ['inspect', 'create', 'edit', 'template-merge', 'render', 'validate'],
  },
  docling: {
    env: 'DOCLING_PATH',
    label: 'Docling',
    operations: ['pdf', 'docx', 'pptx', 'xlsx', 'image'],
  },
  markitdown: {
    env: 'MARKITDOWN_PATH',
    label: 'MarkItDown',
    operations: ['pdf', 'docx', 'pptx', 'xlsx', 'text'],
  },
  paddleocr: {
    env: 'PADDLEOCR_PATH',
    label: 'PaddleOCR',
    operations: ['ocr', 'scan-pdf', 'image'],
  },
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  textNodeName: '#text',
  trimValues: true,
});

function artifactError(message, code = 'INVALID_OFFICE_ARTIFACT', statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeText(parts) {
  return asArray(parts)
    .flat()
    .filter(value => value != null && String(value).trim())
    .map(value => String(value).trim())
    .join('\n')
    .trim();
}

function safeRelativePath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    throw artifactError('Artifact path must be a safe relative path.');
  }
  if (relativePath.length > 300 || relativePath.includes('\0')) {
    throw artifactError('Artifact path contains an invalid character or is too long.');
  }
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (path.isAbsolute(relativePath) || !parts.length || parts.some(part => part === '..' || part === '.')) {
    throw artifactError('Artifact path must be a safe relative path.');
  }
  if (parts.some(part => part.length > 160)) {
    throw artifactError('Artifact filename is too long.');
  }
  return parts.join('/');
}

function validateAbsoluteToolPath(toolPath) {
  if (!toolPath || typeof toolPath !== 'string') {
    return { ok: false, reason: 'Adapter path is not configured.' };
  }
  if (toolPath.includes('\0') || !path.isAbsolute(toolPath)) {
    return { ok: false, reason: 'Adapter must be configured with an absolute executable path.' };
  }
  if (toolPath.length > 500 || /[\r\n]/.test(toolPath)) {
    return { ok: false, reason: 'Adapter executable path is invalid.' };
  }
  return { ok: true, path: toolPath };
}

function validateCliPath(value, field) {
  if (!value || typeof value !== 'string') throw artifactError(`${field} is required for OfficeCLI task planning.`);
  if (value.includes('\0') || /[\r\n]/.test(value) || value.length > 1000) {
    throw artifactError(`${field} is invalid.`);
  }
  return value;
}

function buildAdapterEnvironment(env = {}) {
  const minimal = {};
  for (const key of ADAPTER_ENV_ALLOWLIST) {
    if (typeof env[key] === 'string' && env[key]) minimal[key] = env[key];
  }
  minimal.OFFICECLI_SKIP_UPDATE = '1';
  return minimal;
}

function runSpawn(file, args, options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(file, args, {
      ...options,
      shell: false,
      windowsHide: true,
    });
    const timeout = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill('SIGTERM');
          resolve({ code: -1, stdout, stderr: `Command timed out after ${options.timeoutMs}ms.` });
        }, options.timeoutMs)
      : null;
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', error => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({ code: -1, stdout, stderr: error.message });
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

async function readZipXml(filePath, entryPath) {
  const directory = await unzipper.Open.file(filePath);
  const entry = directory.files.find(item => item.path === entryPath);
  if (!entry) return null;
  const buffer = await entry.buffer();
  return xmlParser.parse(buffer.toString('utf8'));
}

async function readZipXmlEntries(filePath, pattern) {
  const directory = await unzipper.Open.file(filePath);
  const entries = directory.files
    .filter(entry => pattern.test(entry.path))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  const result = [];
  for (const entry of entries) {
    const buffer = await entry.buffer();
    result.push({ path: entry.path, xml: xmlParser.parse(buffer.toString('utf8')) });
  }
  return result;
}

function collectText(node, output = []) {
  if (node == null) return output;
  if (typeof node === 'string' || typeof node === 'number') {
    output.push(String(node));
    return output;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectText(item, output);
    return output;
  }
  if (typeof node !== 'object') return output;
  if (node.t != null) {
    if (typeof node.t === 'string') output.push(node.t);
    else collectText(node.t, output);
  }
  if (typeof node['#text'] === 'string') output.push(node['#text']);
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@_') || key === 't' || key === '#text') continue;
    collectText(value, output);
  }
  return output;
}

function paragraphText(paragraph) {
  return normalizeText(collectText(paragraph).join(' '));
}

function parseDocxTables(body) {
  return asArray(body?.tbl).map((table, tableIndex) => ({
    index: tableIndex + 1,
    rows: asArray(table?.tr).map(row => asArray(row?.tc).map(cell => paragraphText(cell))),
  })).filter(table => table.rows.length);
}

async function inspectDocx(filePath, base) {
  const xml = await readZipXml(filePath, 'word/document.xml');
  if (!xml?.document?.body) {
    return withAvailability(base, 'unavailable', 'DOCX document.xml was not found or could not be parsed.', 'Check that the file is a valid DOCX archive.');
  }
  const body = xml.document.body;
  const paragraphs = asArray(body.p).map(paragraphText).filter(Boolean);
  const tables = parseDocxTables(body);
  const tableText = tables.flatMap(table => table.rows.map(row => row.join(' | ')));
  const text = normalizeText([...paragraphs, ...tableText]);
  return withAvailability({
    ...base,
    text,
    paragraphs,
    tables,
    provenance: { parser: 'native-ooxml', source: 'word/document.xml' },
    quality: qualityFor(text, { tables: tables.length }),
  });
}

async function inspectPptx(filePath, base) {
  const entries = await readZipXmlEntries(filePath, /^ppt\/slides\/slide\d+\.xml$/);
  if (!entries.length) {
    return withAvailability(base, 'unavailable', 'No PPTX slide XML entries were found.', 'Check that the file is a valid PPTX archive.');
  }
  const slides = entries.map((entry, index) => {
    const match = entry.path.match(/slide(\d+)\.xml$/);
    const text = normalizeText(collectText(entry.xml));
    return {
      index: match ? Number(match[1]) : index + 1,
      path: entry.path,
      text,
    };
  }).sort((a, b) => a.index - b.index);
  const text = normalizeText(slides.map(slide => slide.text));
  return withAvailability({
    ...base,
    text,
    slides,
    provenance: { parser: 'native-ooxml', source: 'ppt/slides/*.xml' },
    quality: qualityFor(text, { slides: slides.length }),
  });
}

function parseSharedStrings(xml) {
  return asArray(xml?.sst?.si).map(item => normalizeText(collectText(item)));
}

function cellColumn(ref = '') {
  const letters = String(ref).match(/^[A-Z]+/i)?.[0]?.toUpperCase() || '';
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, value - 1);
}

function cellValue(cell, sharedStrings) {
  const raw = cell?.v == null ? '' : String(cell.v);
  if (cell?.['@_t'] === 's') return sharedStrings[Number(raw)] || '';
  if (cell?.is) return normalizeText(collectText(cell.is));
  return raw;
}

async function inspectXlsx(filePath, base) {
  const sharedXml = await readZipXml(filePath, 'xl/sharedStrings.xml');
  const sharedStrings = parseSharedStrings(sharedXml);
  const entries = await readZipXmlEntries(filePath, /^xl\/worksheets\/sheet\d+\.xml$/);
  if (!entries.length) {
    return withAvailability(base, 'unavailable', 'No XLSX worksheet XML entries were found.', 'Check that the file is a valid XLSX archive.');
  }
  const sheets = entries.map((entry, index) => {
    const rows = asArray(entry.xml?.worksheet?.sheetData?.row).map(row => {
      const values = [];
      for (const cell of asArray(row?.c)) {
        const column = cellColumn(cell?.['@_r']);
        values[column || values.length] = cellValue(cell, sharedStrings);
      }
      return values.map(value => value || '');
    });
    return { index: index + 1, path: entry.path, rows };
  });
  const text = normalizeText(sheets.flatMap(sheet => sheet.rows.map(row => row.join(' | '))));
  return withAvailability({
    ...base,
    text,
    sheets,
    provenance: { parser: 'native-ooxml', source: 'xl/worksheets/*.xml' },
    quality: qualityFor(text, { sheets: sheets.length }),
  });
}

function qualityFor(text, structured = {}) {
  const structuredCount = Object.values(structured).reduce((sum, value) => sum + Number(value || 0), 0);
  const warnings = [];
  if (!text) warnings.push('No indexable text was extracted.');
  return {
    textChars: text.length,
    hasText: Boolean(text),
    hasStructuredContent: structuredCount > 0,
    ...structured,
    warnings,
  };
}

function withAvailability(artifact, status = 'available', reason = '', action = '') {
  const warnings = [...(artifact.warnings || []), ...(artifact.quality?.warnings || [])].filter(Boolean);
  return {
    ...artifact,
    warnings,
    availability: {
      status,
      reason,
      action,
    },
  };
}

function emptyArtifact({ relativePath, absolutePath, stat, kind, parser = 'safe-fallback' }) {
  return {
    version: 1,
    path: relativePath,
    absolutePath,
    name: path.basename(relativePath),
    extension: path.extname(relativePath).toLowerCase(),
    kind,
    bytes: stat.size,
    mtimeMs: stat.mtimeMs,
    text: '',
    paragraphs: [],
    tables: [],
    slides: [],
    sheets: [],
    provenance: { parser, source: null },
    warnings: [],
    quality: qualityFor(''),
  };
}

export async function inspectOfficeArtifact({ projectRoot, relativePath, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (!projectRoot || typeof projectRoot !== 'string') throw artifactError('projectRoot is required.');
  const cleanPath = safeRelativePath(relativePath);
  const absolutePath = safeJoin(projectRoot, cleanPath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) throw artifactError('Office artifact path must point to a file.');
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw artifactError('maxBytes must be a positive finite number.');
  if (stat.size > maxBytes) throw artifactError(`Office artifact exceeds ${maxBytes} byte limit.`);

  const extension = path.extname(cleanPath).toLowerCase();
  const kind = extension.replace(/^\./, '') || 'text';
  if (OOXML_EXTENSIONS.has(extension)) {
    const base = emptyArtifact({ relativePath: cleanPath, absolutePath, stat, kind });
    if (extension === '.docx') return inspectDocx(absolutePath, base);
    if (extension === '.pptx') return inspectPptx(absolutePath, base);
    return inspectXlsx(absolutePath, base);
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    const textLimit = Math.min(maxBytes, TEXT_MAX_BYTES);
    if (stat.size > textLimit) throw artifactError(`Text artifact exceeds ${textLimit} byte limit.`);
    const text = await fs.readFile(absolutePath, 'utf8');
    return withAvailability({
      ...emptyArtifact({ relativePath: cleanPath, absolutePath, stat, kind: 'text', parser: 'plain-text' }),
      text,
      paragraphs: text.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
      provenance: { parser: 'plain-text', source: cleanPath },
      quality: qualityFor(text),
    });
  }

  if (PDF_EXTENSIONS.has(extension)) {
    return withAvailability(
      emptyArtifact({ relativePath: cleanPath, absolutePath, stat, kind: 'pdf' }),
      'unavailable',
      'Native PDF extraction is not enabled in this artifact service.',
      'Use Docling, MarkItDown, PaddleOCR, or a dedicated PDF text adapter for scanned and layout-heavy PDFs.',
    );
  }

  return withAvailability(
    emptyArtifact({ relativePath: cleanPath, absolutePath, stat, kind: kind || 'binary' }),
    'unavailable',
    `Unsupported artifact extension: ${extension || '(none)'}.`,
    'Convert the material to DOCX, PPTX, XLSX, TXT, or configure an external adapter.',
  );
}

export async function detectOfficeArtifactCapabilities({
  env = process.env,
  access = fs.access,
  runner = runSpawn,
} = {}) {
  const capabilities = {};
  for (const [id, adapter] of Object.entries(ADAPTERS)) {
    const configuredPath = env[adapter.env];
    const validation = validateAbsoluteToolPath(configuredPath);
    if (!validation.ok) {
      capabilities[id] = {
        status: 'unavailable',
        env: adapter.env,
        label: adapter.label,
        operations: adapter.operations,
        reason: validation.reason,
        action: `Set ${adapter.env} to an absolute executable path for ${adapter.label}.`,
      };
      continue;
    }
    try {
      await access(validation.path, fsConstants.X_OK);
      const probe = await runner(validation.path, ['--version'], {
        shell: false,
        timeoutMs: 5000,
        env: buildAdapterEnvironment(env),
      });
      if (probe.code !== 0) {
        capabilities[id] = {
          status: 'unavailable',
          path: validation.path,
          env: adapter.env,
          label: adapter.label,
          operations: adapter.operations,
          reason: normalizeText([probe.stderr, probe.stdout]) || `${adapter.label} version probe failed.`,
          action: `Verify ${adapter.env} points to a working ${adapter.label} executable.`,
        };
        continue;
      }
      capabilities[id] = {
        status: 'available',
        path: validation.path,
        env: adapter.env,
        label: adapter.label,
        operations: adapter.operations,
        version: normalizeText([probe.stdout, probe.stderr]).slice(0, 500),
      };
    } catch (error) {
      capabilities[id] = {
        status: 'unavailable',
        path: validation.path,
        env: adapter.env,
        label: adapter.label,
        operations: adapter.operations,
        reason: error.message,
        action: `Install ${adapter.label} or update ${adapter.env} to an executable path.`,
      };
    }
  }
  return capabilities;
}

export function planOfficeCliTask(options = {}) {
  const operation = options.operation;
  if (!OFFICECLI_OPERATIONS.has(operation)) {
    throw artifactError(`Unsupported OfficeCLI operation: ${operation || '(missing)'}.`);
  }

  const steps = [];
  const expectedOutputs = [];
  const step = argv => steps.push({ argv: [...argv, '--json'], expectedJson: true });
  const required = (value, field) => validateCliPath(value, field);
  let filePreparation = null;

  if (operation === 'inspect') {
    const outputPath = required(options.outputPath, 'outputPath');
    step(['dump', required(options.inputPath, 'inputPath'), '/', '--out', outputPath]);
    expectedOutputs.push(outputPath);
  } else if (operation === 'create') {
    const outputPath = required(options.outputPath, 'outputPath');
    step(['create', outputPath, ...(options.locale ? ['--locale', required(options.locale, 'locale')] : [])]);
    if (options.specPath) step(['batch', outputPath, '--input', required(options.specPath, 'specPath')]);
    expectedOutputs.push(outputPath);
  } else if (operation === 'edit') {
    const inputPath = required(options.inputPath, 'inputPath');
    const outputPath = required(options.outputPath || options.inputPath, 'outputPath');
    if (inputPath !== outputPath) {
      filePreparation = { type: 'copy', source: inputPath, target: outputPath, overwrite: false };
    }
    step(['batch', outputPath, '--input', required(options.patchPath, 'patchPath')]);
    expectedOutputs.push(outputPath);
  } else if (operation === 'template-merge') {
    const outputPath = required(options.outputPath, 'outputPath');
    step([
      'merge',
      required(options.templatePath, 'templatePath'),
      outputPath,
      '--data',
      required(options.dataPath, 'dataPath'),
    ]);
    expectedOutputs.push(outputPath);
  } else if (operation === 'render') {
    const mode = options.format || 'html';
    if (!['html', 'screenshot', 'pdf'].includes(mode)) throw artifactError(`Unsupported OfficeCLI render format: ${mode}.`);
    const outputPath = required(options.outputPath, 'outputPath');
    step(['view', required(options.inputPath, 'inputPath'), mode, '--out', outputPath]);
    expectedOutputs.push(outputPath);
  } else if (operation === 'validate') {
    step(['validate', required(options.inputPath, 'inputPath')]);
  }

  return {
    adapter: 'officecli',
    operation,
    steps,
    expectedOutputs,
    ...(steps.length === 1 ? { argv: steps[0].argv, expectedJson: true } : {}),
    ...(filePreparation ? { filePreparation } : {}),
  };
}

export async function executeOfficeCliTask(task, {
  capabilities,
  env = process.env,
  runner = runSpawn,
  stat = fs.stat,
} = {}) {
  const steps = Array.isArray(task?.steps)
    ? task.steps
    : Array.isArray(task?.argv)
      ? [{ argv: task.argv, expectedJson: task.expectedJson !== false }]
      : [];
  if (!task || task.adapter !== 'officecli' || !steps.length || steps.some(step => !Array.isArray(step.argv))) {
    throw artifactError('A planned OfficeCLI task is required.');
  }
  const resolvedCapabilities = capabilities || await detectOfficeArtifactCapabilities({ env, runner });
  const officecli = resolvedCapabilities.officecli;
  if (!officecli || officecli.status !== 'available') {
    return {
      status: 'unavailable',
      adapter: 'officecli',
      operation: task.operation,
      reason: officecli?.reason || 'OfficeCLI capability is unavailable.',
      action: officecli?.action || 'Install OfficeCLI and set OFFICECLI_PATH.',
    };
  }

  if (task.filePreparation?.type === 'copy') {
    const source = validateCliPath(task.filePreparation.source, 'filePreparation.source');
    const target = validateCliPath(task.filePreparation.target, 'filePreparation.target');
    await fs.copyFile(source, target, task.filePreparation.overwrite ? 0 : fsConstants.COPYFILE_EXCL);
  }

  const results = [];
  for (const plannedStep of steps) {
    const run = await runner(officecli.path, plannedStep.argv, {
      shell: false,
      timeoutMs: 60_000,
      env: buildAdapterEnvironment(env),
    });
    if (run.code !== 0) {
      return {
        status: 'failed',
        adapter: 'officecli',
        operation: task.operation,
        code: run.code,
        failedStep: plannedStep.argv[0],
        reason: normalizeText([run.stderr, run.stdout]) || 'OfficeCLI command failed.',
        stdout: run.stdout,
        stderr: run.stderr,
      };
    }
    let result = run.stdout;
    if (plannedStep.expectedJson !== false) {
      try {
        result = run.stdout ? JSON.parse(run.stdout) : {};
      } catch (error) {
        return {
          status: 'failed',
          adapter: 'officecli',
          operation: task.operation,
          failedStep: plannedStep.argv[0],
          reason: `OfficeCLI returned invalid JSON: ${error.message}`,
          stdout: run.stdout,
          stderr: run.stderr,
        };
      }
    }
    results.push({ command: plannedStep.argv[0], result, stderr: run.stderr });
  }
  for (const expectedOutput of task.expectedOutputs || []) {
    try {
      const outputStat = await stat(validateCliPath(expectedOutput, 'expectedOutput'));
      if (!outputStat.isFile() || outputStat.size <= 0) throw new Error('output is not a non-empty file');
    } catch {
      return {
        status: 'failed',
        adapter: 'officecli',
        operation: task.operation,
        reason: `OfficeCLI reported success but did not create the expected output: ${expectedOutput}`,
        expectedOutput,
      };
    }
  }
  return {
    status: 'ok',
    adapter: 'officecli',
    operation: task.operation,
    result: results.length === 1 ? results[0].result : results,
    steps: results,
  };
}

export async function diffOfficeArtifacts({ projectRoot, sourcePath, targetPath } = {}) {
  const [source, target] = await Promise.all([
    inspectOfficeArtifact({ projectRoot, relativePath: sourcePath }),
    inspectOfficeArtifact({ projectRoot, relativePath: targetPath }),
  ]);
  if (source.availability.status !== 'available' || target.availability.status !== 'available') {
    return {
      status: 'unavailable',
      source: { path: source.path, availability: source.availability },
      target: { path: target.path, availability: target.availability },
      reason: 'Both artifacts must have extractable text before a local diff can be produced.',
    };
  }
  const before = source.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const after = target.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const removed = before.filter(line => !afterSet.has(line));
  const added = after.filter(line => !beforeSet.has(line));
  return {
    status: 'ok',
    source: { path: source.path, parser: source.provenance.parser },
    target: { path: target.path, parser: target.provenance.parser },
    summary: {
      beforeBlocks: before.length,
      afterBlocks: after.length,
      addedBlocks: added.length,
      removedBlocks: removed.length,
      changed: added.length > 0 || removed.length > 0,
    },
    changes: [
      ...removed.map((text, index) => ({ id: `removed-${index + 1}`, type: 'removed', text })),
      ...added.map((text, index) => ({ id: `added-${index + 1}`, type: 'added', text })),
    ],
    provenance: { kind: 'local-extracted-text-diff', officeCliRequired: false },
  };
}
