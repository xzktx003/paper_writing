import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  detectOfficeArtifactCapabilities,
  diffOfficeArtifacts,
  executeOfficeCliTask,
  inspectOfficeArtifact,
  planOfficeCliTask,
} from '../officeArtifactService.js';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(content);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function docxBuffer() {
  return makeZip([
    ['word/document.xml', `
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t xml:space="preserve">项目申报书</w:t></w:r></w:p>
          <w:tbl><w:tr><w:tc><w:p><w:r><w:t>指标</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>提效 35%</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        </w:body>
      </w:document>
    `],
  ]);
}

function pptxBuffer() {
  return makeZip([
    ['ppt/slides/slide2.xml', `
      <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>落地证据</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
      </p:sld>
    `],
    ['ppt/slides/slide1.xml', `
      <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>办公赛道演示</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
      </p:sld>
    `],
  ]);
}

function xlsxBuffer() {
  return makeZip([
    ['xl/sharedStrings.xml', `
      <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <si><t>任务</t></si><si><t>节省分钟</t></si><si><t>申报书初稿</t></si>
      </sst>
    `],
    ['xl/worksheets/sheet1.xml', `
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>
          <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
          <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42</v></c></row>
        </sheetData>
      </worksheet>
    `],
  ]);
}

test('inspects docx, pptx, xlsx and text materials into one provenance-rich structure', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'office-artifacts-'));
  try {
    await mkdir(path.join(projectRoot, 'materials'));
    await writeFile(path.join(projectRoot, 'materials', 'brief.docx'), docxBuffer());
    await writeFile(path.join(projectRoot, 'materials', 'demo.pptx'), pptxBuffer());
    await writeFile(path.join(projectRoot, 'materials', 'effect.xlsx'), xlsxBuffer());
    await writeFile(path.join(projectRoot, 'materials', 'notes.txt'), '人工审批后再导出。');

    const docx = await inspectOfficeArtifact({ projectRoot, relativePath: 'materials/brief.docx' });
    assert.equal(docx.kind, 'docx');
    assert.equal(docx.availability.status, 'available');
    assert.equal(docx.provenance.parser, 'native-ooxml');
    assert.match(docx.text, /项目申报书/);
    assert.deepEqual(docx.tables[0].rows[0], ['指标', '提效 35%']);
    assert.equal(docx.quality.hasStructuredContent, true);

    const pptx = await inspectOfficeArtifact({ projectRoot, relativePath: 'materials/demo.pptx' });
    assert.equal(pptx.slides.length, 2);
    assert.equal(pptx.slides[0].index, 1);
    assert.match(pptx.slides[1].text, /落地证据/);

    const xlsx = await inspectOfficeArtifact({ projectRoot, relativePath: 'materials/effect.xlsx' });
    assert.equal(xlsx.sheets.length, 1);
    assert.deepEqual(xlsx.sheets[0].rows[1], ['申报书初稿', '42']);
    assert.match(xlsx.text, /节省分钟/);

    const text = await inspectOfficeArtifact({ projectRoot, relativePath: 'materials/notes.txt' });
    assert.equal(text.kind, 'text');
    assert.equal(text.provenance.parser, 'plain-text');
    assert.match(text.text, /人工审批/);

    await writeFile(path.join(projectRoot, 'materials', 'notes-v2.txt'), '人工审批后再导出。\n新增交付检查。');
    const difference = await diffOfficeArtifacts({
      projectRoot,
      sourcePath: 'materials/notes.txt',
      targetPath: 'materials/notes-v2.txt',
    });
    assert.equal(difference.status, 'ok');
    assert.equal(difference.summary.changed, true);
    assert.deepEqual(difference.changes.map(change => change.type), ['added']);
    assert.match(difference.changes[0].text, /新增交付检查/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('returns explicit fallback availability for pdf and rejects unsafe paths and oversized files', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'office-artifact-safe-'));
  try {
    await mkdir(path.join(projectRoot, 'materials'));
    await writeFile(path.join(projectRoot, 'materials', 'scan.pdf'), '%PDF-1.4\n');
    await writeFile(path.join(projectRoot, 'materials', 'big.txt'), 'x'.repeat(20));

    const pdf = await inspectOfficeArtifact({ projectRoot, relativePath: 'materials/scan.pdf' });
    assert.equal(pdf.kind, 'pdf');
    assert.equal(pdf.availability.status, 'unavailable');
    assert.match(pdf.availability.action, /Docling|MarkItDown|PaddleOCR|PDF text/);
    assert.equal(pdf.provenance.parser, 'safe-fallback');

    await assert.rejects(
      inspectOfficeArtifact({ projectRoot, relativePath: '../secret.docx' }),
      /safe relative path/,
    );
    await assert.rejects(
      inspectOfficeArtifact({ projectRoot, relativePath: 'materials/big.txt', maxBytes: 8 }),
      /exceeds.*limit/,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('detects external adapter capabilities with injectable safe argv runners', async () => {
  const calls = [];
  const capabilities = await detectOfficeArtifactCapabilities({
    env: {
      PATH: '/usr/bin',
      OPENPRISM_API_TOKEN: 'must-not-reach-adapter',
      OFFICECLI_PATH: '/opt/tools/officecli',
      DOCLING_PATH: '/opt/tools/docling',
      MARKITDOWN_PATH: '/opt/tools/markitdown',
      PADDLEOCR_PATH: '../bad',
    },
    access: async (toolPath) => {
      if (toolPath.includes('markitdown')) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
    runner: async (file, args, options) => {
      calls.push({ file, args, options });
      return { code: 0, stdout: `${file} ok`, stderr: '' };
    },
  });

  assert.equal(capabilities.officecli.status, 'available');
  assert.equal(capabilities.docling.status, 'available');
  assert.equal(capabilities.markitdown.status, 'unavailable');
  assert.equal(capabilities.paddleocr.status, 'unavailable');
  assert.match(capabilities.paddleocr.reason, /absolute executable path/);
  assert.deepEqual(calls.map(call => call.args), [['--version'], ['--version']]);
  assert.ok(calls.every(call => call.options.shell === false));
  assert.ok(calls.every(call => call.options.env.PATH === '/usr/bin'));
  assert.ok(calls.every(call => call.options.env.OPENPRISM_API_TOKEN === undefined));
});

test('plans and executes OfficeCLI operations without shell interpolation or false success', async () => {
  const inspectTask = planOfficeCliTask({
    operation: 'inspect',
    inputPath: '/tmp/input.docx',
    outputPath: '/tmp/output.json',
  });
  assert.deepEqual(inspectTask.argv, ['dump', '/tmp/input.docx', '/', '--out', '/tmp/output.json', '--json']);
  assert.deepEqual(inspectTask.expectedOutputs, ['/tmp/output.json']);

  const mergeTask = planOfficeCliTask({
    operation: 'template-merge',
    templatePath: '/tmp/template.docx',
    dataPath: '/tmp/data.json',
    outputPath: '/tmp/final.docx',
  });
  assert.deepEqual(mergeTask.argv, ['merge', '/tmp/template.docx', '/tmp/final.docx', '--data', '/tmp/data.json', '--json']);
  assert.deepEqual(mergeTask.expectedOutputs, ['/tmp/final.docx']);
  assert.deepEqual(
    planOfficeCliTask({ operation: 'create', specPath: '/tmp/spec.json', outputPath: '/tmp/new.pptx' }).steps.map(step => step.argv),
    [
      ['create', '/tmp/new.pptx', '--json'],
      ['batch', '/tmp/new.pptx', '--input', '/tmp/spec.json', '--json'],
    ],
  );
  const editTask = planOfficeCliTask({ operation: 'edit', inputPath: '/tmp/in.docx', patchPath: '/tmp/patch.json', outputPath: '/tmp/out.docx' });
  assert.deepEqual(editTask.argv, ['batch', '/tmp/out.docx', '--input', '/tmp/patch.json', '--json']);
  assert.deepEqual(editTask.filePreparation, { type: 'copy', source: '/tmp/in.docx', target: '/tmp/out.docx', overwrite: false });
  assert.deepEqual(
    planOfficeCliTask({ operation: 'render', inputPath: '/tmp/in.pptx', outputPath: '/tmp/out.pdf', format: 'pdf' }).argv,
    ['view', '/tmp/in.pptx', 'pdf', '--out', '/tmp/out.pdf', '--json'],
  );
  assert.deepEqual(
    planOfficeCliTask({ operation: 'validate', inputPath: '/tmp/in.xlsx' }).argv,
    ['validate', '/tmp/in.xlsx', '--json'],
  );

  assert.throws(() => planOfficeCliTask({ operation: 'publish', inputPath: '/tmp/a.docx' }), /Unsupported OfficeCLI operation/);

  const unavailable = await executeOfficeCliTask(inspectTask, {
    capabilities: { officecli: { status: 'unavailable', action: 'Install OfficeCLI and set OFFICECLI_PATH.' } },
  });
  assert.equal(unavailable.status, 'unavailable');
  assert.match(unavailable.action, /OFFICECLI_PATH/);

  const executed = await executeOfficeCliTask(inspectTask, {
    capabilities: { officecli: { status: 'available', path: '/opt/tools/officecli' } },
    env: { PATH: '/usr/bin', OPENPRISM_API_TOKEN: 'must-not-reach-adapter' },
    runner: async (file, args, options) => {
      assert.equal(file, '/opt/tools/officecli');
      assert.deepEqual(args, inspectTask.argv);
      assert.equal(options.shell, false);
      assert.equal(options.env.OFFICECLI_SKIP_UPDATE, '1');
      assert.equal(options.env.PATH, '/usr/bin');
      assert.equal(options.env.OPENPRISM_API_TOKEN, undefined);
      return { code: 0, stdout: '{"ok":true}', stderr: '' };
    },
    stat: async () => ({ isFile: () => true, size: 32 }),
  });
  assert.equal(executed.status, 'ok');
  assert.deepEqual(executed.result, { ok: true });

  const failed = await executeOfficeCliTask(inspectTask, {
    capabilities: { officecli: { status: 'available', path: '/opt/tools/officecli' } },
    runner: async () => ({ code: 2, stdout: '', stderr: 'bad document' }),
  });
  assert.equal(failed.status, 'failed');
  assert.match(failed.reason, /bad document/);

  const missingOutput = await executeOfficeCliTask(inspectTask, {
    capabilities: { officecli: { status: 'available', path: '/opt/tools/officecli' } },
    runner: async () => ({ code: 0, stdout: '{"ok":true}', stderr: '' }),
    stat: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
  });
  assert.equal(missingOutput.status, 'failed');
  assert.match(missingOutput.reason, /did not create the expected output/i);
});
