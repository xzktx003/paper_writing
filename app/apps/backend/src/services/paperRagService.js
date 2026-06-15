import { mkdir, readFile, readdir, stat, writeFile, unlink, mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import { sanitizeUploadPath, safeJoin } from '../utils/pathSecurity.js';
 
const INDEX_DIR = '.openprism';
const INDEX_FILE = 'paper-rag-index.json';
const OCR_RECOVERY_JOBS_FILE = 'paper-rag-ocr-recovery-jobs.json';
const CORPUS_DIR = 'research_corpus';
const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.tex', '.bib', '.json', '.csv', '.xml', '.html', '.yaml', '.yml']);
const BINARY_DOCUMENT_EXTENSIONS = new Set(['.pdf', '.docx', '.doc', '.pptx', '.xlsx']);
const SUPPORTED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ...BINARY_DOCUMENT_EXTENSIONS]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_BINARY_FILE_BYTES = 200 * 1024 * 1024;
const CHUNK_WORDS = 120;
const CHUNK_OVERLAP = 30;
const EXTRACTION_MARKER = '<!-- paper-rag-extracted-text -->';
const execFileAsync = promisify(execFile);
let cachedOcrCapability = null;
 
export async function addCorpusDocument(projectRoot, { filename, content }) {
  if (!filename || typeof content !== 'string') {
    throw Object.assign(new Error('filename and content are required'), { statusCode: 400 });
  }
  const safeName = sanitizeUploadPath(filename).split('/').pop();
  if (!safeName) throw Object.assign(new Error('Invalid filename'), { statusCode: 400 });
  const ext = path.extname(safeName).toLowerCase() || '.md';
  const finalName = SUPPORTED_EXTENSIONS.has(ext) ? safeName : `${safeName}.md`;
  const corpusRoot = safeJoin(projectRoot, CORPUS_DIR);
  await mkdir(corpusRoot, { recursive: true });
  const target = safeJoin(corpusRoot, finalName);
  await writeFile(target, content, 'utf-8');
  const index = await indexProjectCorpus(projectRoot);
  return index.documents.find(doc => doc.path === `${CORPUS_DIR}/${finalName}`) || { path: `${CORPUS_DIR}/${finalName}` };
}

export async function importTextEvidenceDocument(projectRoot, {
  filename,
  content,
  sourceDocument = '',
  importKind = 'manual-note',
} = {}) {
  if (typeof content !== 'string' || !content.trim()) {
    throw Object.assign(new Error('content is required'), { statusCode: 400 });
  }
  if (Buffer.byteLength(content, 'utf-8') > MAX_FILE_BYTES) {
    throw Object.assign(new Error('Text evidence import is too large'), { statusCode: 400 });
  }
  const baseName = filename && String(filename).trim()
    ? filename
    : buildImportedEvidenceFilename(sourceDocument, importKind);
  const document = await addCorpusDocument(projectRoot, {
    filename: ensureTextEvidenceFilename(baseName),
    content,
  });
  await markOcrRecoveryJobsImported(projectRoot, {
    sourceDocument,
    importedDocumentPath: document.path,
  });
  return {
    document,
    uploadReview: buildCorpusUploadReview(document),
  };
}

export async function listOcrRecoveryJobs(projectRoot) {
  const jobs = await readOcrRecoveryJobs(projectRoot);
  return {
    jobs: jobs.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt))),
    summary: summarizeOcrRecoveryJobs(jobs),
  };
}

export async function createOcrRecoveryJob(projectRoot, {
  sourceDocument,
  reason = '',
  recovery = null,
  noteTemplate = '',
} = {}) {
  const normalizedSource = normalizeCorpusDocumentPath(sourceDocument);
  if (!normalizedSource) {
    throw Object.assign(new Error('sourceDocument is required'), { statusCode: 400 });
  }

  const index = await ensureIndex(projectRoot);
  const document = index.documents.find(doc => doc.path === normalizedSource) || {
    id: stableId(normalizedSource),
    path: normalizedSource,
    title: path.basename(normalizedSource),
    kind: 'binary',
    parseStatus: 'metadata-only',
    parser: 'none',
    chunks: 0,
  };
  const review = buildCorpusUploadReview(document);
  const recoveryInfo = recovery && typeof recovery === 'object'
    ? normalizeRecoverySnapshot(recovery)
    : inferRecoveryFromJobReason(reason, review.recovery, document);
  const ocrCapability = recoveryInfo?.ocrCapability || buildOcrCapability();
  const now = new Date().toISOString();
  const jobs = await readOcrRecoveryJobs(projectRoot);
  const existingIndex = jobs.findIndex(job =>
    job.sourceDocument === normalizedSource &&
    !['imported', 'cancelled'].includes(job.status)
  );
  const job = {
    id: existingIndex >= 0 ? jobs[existingIndex].id : stableId(`${normalizedSource}:ocr-recovery`),
    sourceDocument: normalizedSource,
    sourceTitle: document.title || path.basename(normalizedSource),
    reason: String(reason || recoveryInfo?.label_zh || review.message_zh || '').slice(0, 500),
    recoveryCode: recoveryInfo?.code || review.recovery?.code || 'manual-notes-needed',
    recoveryLabel_zh: recoveryInfo?.label_zh || review.recovery?.label_zh || '需要补充可检索正文',
    status: determineOcrRecoveryJobStatus({ document, recovery: recoveryInfo, ocrCapability }),
    statusLabel_zh: '',
    nextAction: buildOcrRecoveryJobNextAction({ recovery: recoveryInfo, ocrCapability }),
    blocksCitationWriting: true,
    ocrCapability,
    noteTemplate: noteTemplate || recoveryInfo?.noteTemplate || review.recovery?.noteTemplate || buildManualEvidenceNoteTemplate(document),
    documentSnapshot: {
      path: document.path,
      parseStatus: document.parseStatus || 'unknown',
      parser: document.parser || '',
      chunks: Number(document.chunks || 0),
      extractedTextChars: Number(document.extractedTextChars || document.indexedTextChars || 0),
      extractionError: document.extractionError || '',
    },
    createdAt: existingIndex >= 0 ? jobs[existingIndex].createdAt : now,
    updatedAt: now,
    importedDocumentPath: existingIndex >= 0 ? jobs[existingIndex].importedDocumentPath || '' : '',
  };
  job.statusLabel_zh = OCR_RECOVERY_JOB_STATUS_LABELS[job.status] || '待处理';

  if (existingIndex >= 0) {
    jobs[existingIndex] = { ...jobs[existingIndex], ...job };
  } else {
    jobs.push(job);
  }
  await writeOcrRecoveryJobs(projectRoot, jobs);
  return {
    ok: true,
    job,
    summary: summarizeOcrRecoveryJobs(jobs),
  };
}

export async function runOcrRecoveryJob(projectRoot, {
  jobId = '',
  sourceDocument = '',
} = {}, options = {}) {
  const jobs = await readOcrRecoveryJobs(projectRoot);
  const normalizedSource = sourceDocument ? normalizeCorpusDocumentPath(sourceDocument) : '';
  const jobIndex = jobs.findIndex(job =>
    (jobId && job.id === jobId) ||
    (normalizedSource && job.sourceDocument === normalizedSource && !['imported', 'cancelled'].includes(job.status))
  );
  if (jobIndex < 0) {
    throw Object.assign(new Error('OCR recovery job was not found'), { statusCode: 404 });
  }

  const job = jobs[jobIndex];
  const sourcePath = normalizeCorpusDocumentPath(job.sourceDocument);
  if (!sourcePath || path.extname(sourcePath).toLowerCase() !== '.pdf') {
    const updatedJob = updateOcrJobAfterRun(job, {
      status: 'needs-user-text',
      error: 'Server OCR only supports PDF recovery jobs.',
      nextAction: buildOcrRecoveryJobNextAction({ recovery: { code: job.recoveryCode }, ocrCapability: job.ocrCapability }),
    });
    jobs[jobIndex] = updatedJob;
    await writeOcrRecoveryJobs(projectRoot, jobs);
    return { ok: false, job: updatedJob, summary: summarizeOcrRecoveryJobs(jobs) };
  }

  const ocrCapability = buildOcrCapability();
  const runner = options.ocrRunner || runOcrmypdfToBuffer;
  if (!options.ocrRunner && !ocrCapability.serverCanRunOcr) {
    const updatedJob = updateOcrJobAfterRun(job, {
      status: 'blocked-no-ocr-tool',
      error: 'OCRmyPDF is not available on this server.',
      ocrCapability,
      nextAction: buildOcrRecoveryJobNextAction({ recovery: { code: job.recoveryCode }, ocrCapability }),
    });
    jobs[jobIndex] = updatedJob;
    await writeOcrRecoveryJobs(projectRoot, jobs);
    return { ok: false, job: updatedJob, summary: summarizeOcrRecoveryJobs(jobs) };
  }

  const startedAt = new Date().toISOString();
  const sourceAbsolutePath = safeJoin(projectRoot, sourcePath);
  const outputName = buildOcrOutputFilename(sourcePath);
  try {
    const ocrResult = await runner({
      projectRoot,
      sourceDocument: sourcePath,
      sourcePath: sourceAbsolutePath,
      outputName,
      job,
    });
    const buffer = Buffer.isBuffer(ocrResult?.buffer) ? ocrResult.buffer : ocrResult;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error('OCR runner did not return a PDF buffer.');
    }
    const document = await saveBinaryCorpusDocument(projectRoot, {
      filename: outputName,
      buffer,
      mimetype: 'application/pdf',
    });
    const uploadReview = buildCorpusUploadReview(document);
    const ok = !uploadReview.blocksCitationWriting && Number(document.chunks || 0) > 0;
    const updatedJob = updateOcrJobAfterRun(job, {
      status: ok ? 'imported' : 'needs-user-text',
      importedDocumentPath: ok ? document.path : '',
      error: ok ? '' : 'OCR output was saved, but no citable text chunks were indexed.',
      ocrCapability,
      startedAt,
      completedAt: new Date().toISOString(),
      outputDocument: document,
      nextAction: ok
        ? {
          type: 'search-imported-evidence',
          label_zh: '检索 OCR 后证据',
          instruction_zh: 'OCR 后 PDF 已进入证据库；重新运行 RAG 检索，确认命中具体正文片段后再写入论文。',
        }
        : {
          type: 'paste-verified-notes',
          label_zh: '改用人工摘录导入',
          instruction_zh: 'OCR 输出仍没有形成可引用 chunk，请粘贴人工核对过的 Fact、Evidence text 和 Page/section。',
        },
    });
    jobs[jobIndex] = updatedJob;
    await writeOcrRecoveryJobs(projectRoot, jobs);
    return {
      ok,
      job: updatedJob,
      document,
      uploadReview,
      summary: summarizeOcrRecoveryJobs(jobs),
    };
  } catch (error) {
    const updatedJob = updateOcrJobAfterRun(job, {
      status: 'needs-user-text',
      error: error instanceof Error ? error.message : String(error),
      ocrCapability,
      startedAt,
      completedAt: new Date().toISOString(),
      nextAction: {
        type: 'paste-verified-notes',
        label_zh: '粘贴人工核对摘录',
        instruction_zh: '服务器 OCR 执行失败；请改用外部 OCR 或人工摘录，导入前先运行后端预检。',
      },
    });
    jobs[jobIndex] = updatedJob;
    await writeOcrRecoveryJobs(projectRoot, jobs);
    return {
      ok: false,
      job: updatedJob,
      error: updatedJob.lastRun?.error || 'OCR failed',
      summary: summarizeOcrRecoveryJobs(jobs),
    };
  }
}

export function previewTextEvidenceImport({
  filename,
  content,
  sourceDocument = '',
  importKind = 'manual-note',
} = {}) {
  if (typeof content !== 'string' || !content.trim()) {
    throw Object.assign(new Error('content is required'), { statusCode: 400 });
  }
  if (Buffer.byteLength(content, 'utf-8') > MAX_FILE_BYTES) {
    throw Object.assign(new Error('Text evidence import is too large'), { statusCode: 400 });
  }
  const baseName = filename && String(filename).trim()
    ? filename
    : buildImportedEvidenceFilename(sourceDocument, importKind);
  const finalName = ensureTextEvidenceFilename(baseName);
  const relativePath = `${CORPUS_DIR}/${finalName}`;
  const contentQuality = assessTextDocumentQuality(content, relativePath);
  const estimatedChunks = contentQuality.blocksCitationWriting
    ? 0
    : chunkDocument({
      id: stableId(relativePath),
      path: relativePath,
      title: inferTitle(content, relativePath),
      kind: 'text',
    }, content).length;
  const document = {
    id: stableId(relativePath),
    path: relativePath,
    title: inferTitle(content, relativePath),
    kind: 'text',
    parseStatus: 'indexed',
    indexedTextChars: content.length,
    contentQuality,
    warnings: contentQuality.warnings || [],
    chunks: estimatedChunks,
  };
  return {
    ok: !contentQuality.blocksCitationWriting && estimatedChunks > 0,
    document,
    uploadReview: buildCorpusUploadReview(document),
    willWrite: false,
    successCriteria_zh: contentQuality.blocksCitationWriting
      ? '补齐可引用事实、原文证据摘录和页码/章节后，后端预检应显示可导入。'
      : '预检通过。点击导入后会写入 research_corpus 并重建索引。',
  };
}
 
export async function listCorpusDocuments(projectRoot) {
  const index = await ensureIndex(projectRoot);
  return index.documents;
}
 
export async function indexProjectCorpus(projectRoot) {
  const files = await collectCorpusFiles(projectRoot);
  const documents = [];
  const chunks = [];
 
  for (const filePath of files) {
    const absolutePath = safeJoin(projectRoot, filePath);
    const info = await stat(absolutePath);
    const ext = path.extname(filePath).toLowerCase();
    if (isExtractionSidecar(filePath)) continue;

    let content = '';
    let document;
    if (BINARY_DOCUMENT_EXTENSIONS.has(ext)) {
      const binary = await buildBinaryDocument(projectRoot, filePath, info);
      document = binary.document;
      content = binary.indexableText;
    } else {
      if (info.size > MAX_FILE_BYTES) continue;
      content = await readFile(absolutePath, 'utf-8');
      const contentQuality = assessTextDocumentQuality(content, filePath);
      document = {
        id: stableId(filePath),
        path: filePath,
        title: inferTitle(content, filePath),
        bytes: info.size,
        mtimeMs: info.mtimeMs,
        kind: 'text',
        parseStatus: 'indexed',
        indexedTextChars: content.length,
        contentQuality,
        warnings: contentQuality.warnings || [],
      };
      if (contentQuality.blocksCitationWriting) {
        content = '';
      }
    }

    const documentChunks = content ? chunkDocument(document, content) : [];
    document.chunks = documentChunks.length;
    if (document.kind === 'binary') {
      document.recovery = buildExtractionRecovery(document, determineUploadReviewStatus(document, documentChunks.length));
    }
    documents.push(document);
    chunks.push(...documentChunks);
  }
 
  const index = {
    version: 1,
    indexedAt: new Date().toISOString(),
    documents: documents.sort((a, b) => a.path.localeCompare(b.path)),
    chunks,
  };
  await writeIndex(projectRoot, index);
  return index;
}
 
export async function searchCorpus(projectRoot, query, options = {}) {
  if (!query || typeof query !== 'string') return [];
  const index = await ensureIndex(projectRoot);
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];
  const limit = Math.min(Number(options.limit || 5), 20);
  return index.chunks
    .map(chunk => ({ ...chunk, score: scoreChunk(chunk, queryTerms) }))
    .filter(chunk => chunk.score > 0)
    .sort((a, b) => b.score - a.score || a.source.path.localeCompare(b.source.path))
    .slice(0, limit)
    .map(({ terms, ...chunk }) => chunk);
}
 
export async function buildRagContext(projectRoot, query, options = {}) {
  const evidence = await buildRagEvidence(projectRoot, query, options);
  return evidence.context;
}

export async function buildRagEvidence(projectRoot, query, options = {}) {
  const results = await searchCorpus(projectRoot, query, options);
  if (results.length === 0) {
    return {
      query,
      context: '',
      results: [],
    };
  }
  const context = results.map((item, index) => {
    const source = item.source.lineStart
      ? `${item.source.path}:L${item.source.lineStart}-L${item.source.lineEnd}`
      : item.source.path;
    return `[${index + 1}] ${source}\n${item.text}`;
  }).join('\n\n');
  return {
    query,
    context,
    results: results.map((item, index) => ({
      rank: index + 1,
      id: item.id,
      score: item.score,
      text: item.text,
      source: item.source,
    })),
  };
}

export function buildRagUsageGuidance(evidence) {
  const results = evidence?.results || [];
  if (results.length === 0) {
    return [
      'RAG usage rules:',
      '- No evidence snippets were retrieved for this query.',
      '- Do not invent paper titles, authors, years, venues, DOIs, citation keys, or source numbers.',
      '- If the user asks for literature-backed writing, provide an outline, search terms, or a request for more evidence instead of cited prose.',
    ].join('\n');
  }
  return [
    'RAG usage rules:',
    '- Use only the numbered evidence snippets below for literature-backed claims.',
    '- Cite each factual literature claim with the matching source number, for example [1] or [2].',
    '- Do not cite sources that are not present in the retrieved evidence.',
    '- Do not infer authors, years, venues, DOIs, citation keys, experimental results, or paper metadata unless a snippet explicitly states them.',
    '- Separate evidence-supported statements from reasonable speculation.',
    '',
    'Evidence support limits:',
    ...results.map(result => {
      const rank = result.rank || results.indexOf(result) + 1;
      const source = result.source?.lineStart
        ? `${result.source.path}:L${result.source.lineStart}-L${result.source.lineEnd || result.source.lineStart}`
        : (result.source?.path || 'unknown');
      return [
        `[${rank}] ${source}`,
        `Can support: claims directly stated in this snippet.`,
        'Cannot support: bibliographic metadata, broad survey claims, or experimental conclusions not stated in the snippet.',
      ].join('\n');
    }),
  ].join('\n');
}

export function buildCorpusUploadReview(document = {}) {
  const chunks = Number(document.chunks || 0);
  const chars = Number(document.extractedTextChars || document.indexedTextChars || 0);
  const status = determineUploadReviewStatus(document, chunks);
  const recovery = buildExtractionRecovery(document, status);
  const labels = {
    ready: '已可用于 RAG 检索',
    'text-ready': '文本已加入证据库',
    'template-empty': '文献笔记模板尚未填写',
    'manual-note-incomplete': '文献笔记证据字段不完整',
    'metadata-only': '只保存了文件信息',
    failed: '解析失败',
    'needs-index': '已保存，等待索引',
  };
  const messages = {
    ready: `已抽取 ${chars} 个字符并生成 ${chunks} 个片段，可在命中后作为论文引用证据。`,
    'text-ready': `文本文件已索引 ${chunks} 个片段，可用于检索和写作证据。`,
    'template-empty': '文件像是未填写的 Markdown 文献笔记模板；当前没有人工核对过的可引用事实，不能支撑论文引用写作。',
    'manual-note-incomplete': '文件像是人工文献笔记，但缺少完整的可核对事实、原文证据或页码/章节；当前不能作为论文引用证据。',
    'metadata-only': '文件已保存，但当前没有可检索正文片段；不能直接支撑论文里的事实性引用。',
    failed: document.extractionError || '文件已保存，但正文解析失败，需要替换文件或补充人工摘录。',
    'needs-index': '文件已保存，但当前响应没有确认可检索片段；请重建索引并重新分析任务。',
  };
  const actions = {
    ready: [
      { type: 'search-evidence', label_zh: '检索这篇文档的证据片段' },
      { type: 'copy-document-path', label_zh: '复制文档路径' },
    ],
    'text-ready': [
      { type: 'search-evidence', label_zh: '检索文本证据' },
      { type: 'copy-document-path', label_zh: '复制文档路径' },
    ],
    'template-empty': [
      { type: 'upload-extracted-notes', label_zh: '填写后重新上传文献笔记' },
      { type: 'copy-document-path', label_zh: '复制文档路径' },
    ],
    'manual-note-incomplete': [
      { type: 'upload-extracted-notes', label_zh: '补全事实、证据原文和页码后重传' },
      { type: 'copy-document-path', label_zh: '复制文档路径' },
    ],
    'metadata-only': [
      { type: 'upload-extracted-notes', label_zh: '补充 Markdown 文献笔记' },
      { type: 'replace-document', label_zh: '替换为可复制文本 PDF' },
    ],
    failed: [
      { type: 'replace-document', label_zh: '替换 PDF 或重新导出' },
      { type: 'upload-extracted-notes', label_zh: '上传人工摘录笔记' },
    ],
    'needs-index': [
      { type: 'rebuild-index', label_zh: '重建 RAG 索引' },
    ],
  };
  return {
    status,
    label_zh: labels[status],
    message_zh: messages[status],
    filename: path.basename(document.path || document.title || ''),
    path: document.path || '',
    parseStatus: document.parseStatus || 'unknown',
    parser: document.parser || '',
    chunks,
    extractedTextChars: chars,
    contentQuality: document.contentQuality || null,
    blocksCitationWriting: ['metadata-only', 'failed', 'needs-index', 'template-empty', 'manual-note-incomplete'].includes(status),
    recovery,
    actions: actions[status] || [],
    successCriteria_zh: ['template-empty', 'manual-note-incomplete'].includes(status)
      ? '填写人工核对过的事实、原文证据摘录和页码/章节后，重新上传或重建索引；检索结果应命中实际内容而不是模板字段名。'
      : recovery.successCriteria_zh || (['ready', 'text-ready'].includes(status)
      ? '下一步用论文任务检索该文档，只有命中的具体片段才能写入带来源编号的正文。'
      : '修复后应能看到 chunks > 0，且 RAG 检索能命中具体正文片段。'),
    copyText: formatCorpusUploadReviewCopyText({
      status,
      label_zh: labels[status],
      message_zh: messages[status],
      document,
      chunks,
      chars,
      recovery,
    }),
  };
}

export function buildExtractionRecovery(document = {}, uploadStatus = '') {
  const parseStatus = document.parseStatus || 'unknown';
  const kind = document.kind || '';
  const parser = document.parser || '';
  const pathName = document.path || document.title || '';
  const ext = path.extname(pathName).toLowerCase();
  const error = String(document.extractionError || document.error || '').trim();
  const lowerError = error.toLowerCase();
  const chunks = Number(document.chunks || 0);
  const textChars = Number(document.extractedTextChars || document.indexedTextChars || 0);
  const noteTemplate = buildManualEvidenceNoteTemplate(document);
  const ocrCapability = buildOcrCapability();

  if ((uploadStatus === 'ready' || uploadStatus === 'text-ready') && chunks > 0) {
    return {
      code: 'ready',
      label_zh: '正文已可检索',
      why_zh: `当前文档已有 ${chunks} 个可检索片段。`,
      instruction_zh: '用具体论文任务检索该文档，只把命中的片段作为引用证据。',
      preferredAction: { type: 'search-evidence', label_zh: '检索证据片段' },
      successCriteria_zh: '检索结果能命中具体正文片段，并在写作时使用来源编号。',
      blocksCitationWriting: false,
    };
  }

  if (kind !== 'binary') {
    return {
      code: 'text-index-pending',
      label_zh: '等待文本索引确认',
      why_zh: '文本文件已保存，但当前结果还没有可检索片段。',
      instruction_zh: '重建 RAG 索引并重新分析任务；如果仍为 0 chunks，检查文件是否为空或内容格式是否异常。',
      preferredAction: { type: 'rebuild-index', label_zh: '重建 RAG 索引' },
      successCriteria_zh: '重建后 chunks 大于 0，检索能命中具体文本。',
      blocksCitationWriting: true,
    };
  }

  if (parseStatus === 'failed' && /(encrypted|password|decrypt|permission)/i.test(error)) {
    return {
      code: 'encrypted-pdf',
      label_zh: 'PDF 可能加密或受权限保护',
      why_zh: error || '解析器无法读取受保护 PDF 的正文。',
      instruction_zh: '重新导出未加密、可复制文本的 PDF；如果不能重新导出，请把关键段落整理成 Markdown 文献笔记后上传。',
      preferredAction: { type: 'replace-document', label_zh: '替换为未加密 PDF' },
      successCriteria_zh: '替换后 parseStatus 为 parsed/indexed，extractedTextChars 和 chunks 都大于 0。',
      blocksCitationWriting: true,
      noteTemplate,
    };
  }

  if (parseStatus === 'failed' && /(no extractable text|returned no extractable text|empty text|image|scan|ocr)/i.test(error)) {
    return {
      code: 'needs-ocr',
      label_zh: 'PDF 可能是扫描版，需要 OCR',
      why_zh: error || '解析器没有抽取到可复制正文，常见原因是扫描版或图片型 PDF。',
      instruction_zh: `${ocrCapability.recoveryInstruction_zh} 优先上传带文字层的 PDF；如果只有扫描版，先用 OCR 导出文本版 PDF，或把标题、贡献、方法、实验和相关段落整理成 Markdown 笔记上传。`,
      preferredAction: { type: 'upload-extracted-notes', label_zh: '上传 OCR/人工摘录笔记' },
      successCriteria_zh: '补充后 chunks 大于 0，检索结果能命中具体正文段落，而不是只看到文件名。',
      blocksCitationWriting: true,
      ocrCapability,
      noteTemplate,
    };
  }

  if (parseStatus === 'failed' && /(syntax|malformed|invalid|xref|eof|corrupt|broken)/i.test(error)) {
    return {
      code: 'corrupt-pdf',
      label_zh: 'PDF 文件可能损坏或格式异常',
      why_zh: error || '解析器报告 PDF 结构异常。',
      instruction_zh: '从论文官网或出版商页面重新下载 PDF，或用 PDF 工具重新导出一份标准 PDF 后上传。',
      preferredAction: { type: 'replace-document', label_zh: '重新下载或导出 PDF' },
      successCriteria_zh: '重新上传后 parseStatus 为 parsed/indexed，且 RAG 检索能命中正文。',
      blocksCitationWriting: true,
      noteTemplate,
    };
  }

  if (parseStatus === 'failed') {
    return {
      code: 'parse-failed',
      label_zh: '正文解析失败',
      why_zh: error || '当前解析链没有成功抽取正文。',
      instruction_zh: '换用可复制文本的 PDF，或上传 Markdown 文献笔记作为 RAG 证据；不要把该文件直接当成引用来源。',
      preferredAction: { type: 'replace-document', label_zh: '替换 PDF 或补充笔记' },
      successCriteria_zh: '修复后文档状态为 parsed/indexed，chunks 大于 0。',
      blocksCitationWriting: true,
      noteTemplate,
    };
  }

  if (parseStatus === 'metadata-only' && ext && ext !== '.pdf') {
    return {
      code: 'no-extractor',
      label_zh: '该格式暂未配置正文抽取器',
      why_zh: `${ext} 文件已保存，但当前 RAG 只为 PDF 自动抽取正文。`,
      instruction_zh: '把关键内容另存为 Markdown、TXT、BibTeX 或可复制文本 PDF 后上传。',
      preferredAction: { type: 'upload-extracted-notes', label_zh: '上传文本版证据' },
      successCriteria_zh: '上传文本版后 chunks 大于 0，并能按任务关键词检索命中。',
      blocksCitationWriting: true,
      noteTemplate,
    };
  }

  if (parseStatus === 'metadata-only' && ext === '.pdf') {
    return {
      code: parser && parser !== 'none' ? 'pdf-no-text' : 'pdf-not-extracted',
      label_zh: parser && parser !== 'none' ? 'PDF 没有可用正文片段' : 'PDF 尚未生成抽取结果',
      why_zh: parser && parser !== 'none'
        ? 'PDF 已经过解析流程，但没有形成可检索正文。'
        : '仓库中存在 PDF 文件，但没有对应的正文 sidecar 或解析诊断。',
      instruction_zh: parser && parser !== 'none'
        ? `按扫描版处理：${ocrCapability.recoveryInstruction_zh} 上传 OCR 文本版、替换可复制文本 PDF，或补充 Markdown 文献笔记。`
        : '通过 Evidence Library 上传入口重新上传该 PDF，或直接补充 Markdown 文献笔记。',
      preferredAction: { type: 'upload-extracted-notes', label_zh: '补充可检索文本' },
      successCriteria_zh: '修复后 extractedTextChars 和 chunks 大于 0，RAG 检索能命中正文片段。',
      blocksCitationWriting: true,
      ocrCapability: parser && parser !== 'none' ? ocrCapability : undefined,
      noteTemplate,
    };
  }

  return {
    code: textChars > 0 ? 'rebuild-index' : 'manual-notes-needed',
    label_zh: textChars > 0 ? '需要重建索引' : '需要补充可检索正文',
    why_zh: textChars > 0
      ? '已有抽取文本记录，但当前没有形成可检索 chunk。'
      : '当前文档没有可用于 RAG 的正文文本。',
    instruction_zh: textChars > 0
      ? '重建 RAG 索引后重新分析任务。'
      : '上传可复制文本 PDF、Markdown 文献笔记或 TXT 摘录。',
    preferredAction: {
      type: textChars > 0 ? 'rebuild-index' : 'upload-extracted-notes',
      label_zh: textChars > 0 ? '重建 RAG 索引' : '补充 Markdown 文献笔记',
    },
    successCriteria_zh: '修复后 chunks 大于 0，检索能命中具体正文片段。',
    blocksCitationWriting: true,
    noteTemplate: textChars > 0 ? '' : noteTemplate,
  };
}

export function buildOcrCapability() {
  const override = process.env.PAPER_RAG_OCR_TOOLS;
  if (!override && cachedOcrCapability) return cachedOcrCapability;

  const tools = override
    ? parseOcrToolOverride(override)
    : [
      probeCommandVersion('ocrmypdf', ['--version']),
      probeCommandVersion('tesseract', ['--version']),
      probeCommandVersion('pdftotext', ['-v']),
    ];
  const hasOcrmypdf = tools.some(tool => tool.name === 'ocrmypdf' && tool.available);
  const hasTesseract = tools.some(tool => tool.name === 'tesseract' && tool.available);
  const hasPdftotext = tools.some(tool => tool.name === 'pdftotext' && tool.available);
  const status = hasOcrmypdf
    ? 'tool-available'
    : hasTesseract ? 'partial-tooling' : 'not-configured';
  const commandPack = [
    '# Paper Agent OCR 生产恢复命令',
    '# 1. 先确认服务器 OCR/PDF 文本抽取工具是否可用',
    'command -v ocrmypdf || true',
    'command -v tesseract || true',
    'command -v pdftotext || true',
    'ocrmypdf --version || true',
    'tesseract --version || true',
    'pdftotext -v || true',
    '',
    '# 2. 如果缺少工具，在可安装系统依赖的 Linux 环境安装',
    'sudo apt-get update',
    'sudo apt-get install -y ocrmypdf tesseract-ocr poppler-utils',
    '',
    '# 3. 安装后重新分析 Paper Agent 工作台；扫描版 PDF 应进入受控 OCR 队列或改用人工摘录导入。',
  ].join('\n');
  const capability = {
    status,
    label_zh: {
      'tool-available': '服务器检测到 OCR 工具',
      'partial-tooling': '服务器只检测到部分 OCR 工具',
      'not-configured': '服务器未检测到 OCR 工具',
    }[status],
    serverCanRunOcr: hasOcrmypdf,
    automaticRecoveryAvailable: hasOcrmypdf,
    pdfTextExtractionAvailable: hasPdftotext,
    tools,
    commandPack,
    recoveryInstruction_zh: hasOcrmypdf
      ? '服务器检测到 OCRmyPDF，可通过受控 OCR 队列生成新的 OCR 后 PDF 并重新索引；原 PDF 不会被覆盖。'
      : hasTesseract
        ? '服务器检测到 Tesseract，但缺少完整 PDF OCR 流水线；请在本地或外部工具导出带文字层的 PDF 后重新上传。'
        : '当前服务器未检测到 OCRmyPDF 或 Tesseract，无法自动把扫描版 PDF 变成可检索文本。',
    installHint_zh: hasOcrmypdf && hasPdftotext
      ? '运行服务器 OCR 会生成新的 .ocr.pdf 证据文件；普通文本 PDF 可优先用 pdftotext 抽取；写入论文前仍需核对 RAG 命中的具体片段。'
      : hasOcrmypdf
        ? '服务器可运行 OCRmyPDF，但未检测到 pdftotext；建议安装 poppler-utils，确保普通文本 PDF 的抽取能力也可验收。'
        : '如需服务器自动 OCR，请安装 OCRmyPDF/Tesseract 和 poppler-utils，并接入受控任务队列；当前建议上传 OCR 后的 PDF 或人工 Markdown 笔记。',
  };

  if (!override) cachedOcrCapability = capability;
  return capability;
}

function parseOcrToolOverride(value) {
  const names = String(value || '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  return ['ocrmypdf', 'tesseract', 'pdftotext'].map(name => ({
    name,
    available: names.includes(name),
    version: names.includes(name) ? 'override' : '',
  }));
}

function probeCommandVersion(command, args) {
  try {
    const output = execFileSync(command, args, {
      encoding: 'utf-8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      name: command,
      available: true,
      version: String(output || '').split(/\r?\n/).find(Boolean)?.slice(0, 120) || 'available',
    };
  } catch {
    return {
      name: command,
      available: false,
      version: '',
    };
  }
}

function buildManualEvidenceNoteTemplate(document = {}) {
  const sourcePath = document.path || document.title || 'source.pdf';
  const title = path.basename(sourcePath).replace(/\.[^.]+$/, '') || 'paper-title';
  return [
    `# ${title} - 人工摘录文献笔记`,
    '',
    `> Source file: ${sourcePath}`,
    '> 目的：当 PDF 扫描版、加密或解析失败时，用这份 Markdown 作为 RAG 可检索证据。',
    '> 规则：只写你从论文原文/OCR 中核对过的内容；不要写模型猜测；每条事实尽量带页码、章节或图表编号。',
    '',
    '## Bibliographic metadata (人工核对后填写)',
    '- Title: ',
    '- Authors: ',
    '- Year / venue: ',
    '- DOI / arXiv / URL: ',
    '',
    '## Problem / motivation',
    '- 原文摘录或忠实改写：',
    '- 页码/章节：',
    '',
    '## Method / contribution',
    '- 原文摘录或忠实改写：',
    '- 页码/章节：',
    '',
    '## Experiments / results',
    '- 原文摘录或忠实改写：',
    '- 表格/图/页码：',
    '',
    '## Limitations / research gap',
    '- 原文摘录或忠实改写：',
    '- 页码/章节：',
    '',
    '## Citable facts for writing',
    '- [ ] Fact: ',
    '  Evidence text: ',
    '  Page/section: ',
    '- [ ] Fact: ',
    '  Evidence text: ',
    '  Page/section: ',
    '',
    '## Do not cite from this note unless',
    '- 该事实已经从论文原文或 OCR 文本核对。',
    '- 该事实能在上面的 Evidence text 中找到直接支撑。',
    '- 作者、年份、venue、DOI 等元数据已经人工核对。',
  ].join('\n');
}

function determineUploadReviewStatus(document, chunks) {
  if (document.contentQuality?.status === 'template-empty') return 'template-empty';
  if (document.contentQuality?.status === 'manual-note-incomplete') return 'manual-note-incomplete';
  if (document.parseStatus === 'failed') return 'failed';
  if (document.parseStatus === 'metadata-only') return 'metadata-only';
  if (document.kind === 'text' && chunks > 0) return 'text-ready';
  if (chunks > 0 && ['parsed', 'indexed'].includes(document.parseStatus)) return 'ready';
  return 'needs-index';
}

function ensureTextEvidenceFilename(filename) {
  const safeName = sanitizeUploadPath(filename).split('/').pop();
  if (!safeName) throw Object.assign(new Error('Invalid filename'), { statusCode: 400 });
  const ext = path.extname(safeName).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return safeName;
  return `${safeName.replace(/\.+$/, '')}.md`;
}

function buildImportedEvidenceFilename(sourceDocument, importKind) {
  const sourceName = sanitizeUploadPath(String(sourceDocument || '')).split('/').pop();
  const stem = sourceName
    ? sourceName.replace(/\.[^.]+$/, '')
    : `manual-evidence-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const suffix = importKind === 'ocr-text' ? 'ocr-notes' : 'manual-notes';
  return `${stem}.${suffix}.md`;
}

const OCR_RECOVERY_JOB_STATUS_LABELS = {
  queued: '已加入 OCR/摘录恢复队列',
  'blocked-no-ocr-tool': '缺少服务器 OCR 工具',
  'needs-user-text': '等待粘贴 OCR/人工摘录文本',
  'ready-for-import': '已有可导入文本，等待导入',
  imported: '已导入文本证据',
  'ocr-running': '服务器 OCR 执行中',
  cancelled: '已取消',
};

function normalizeCorpusDocumentPath(value) {
  const safePath = sanitizeUploadPath(String(value || '').trim());
  if (!safePath) return '';
  if (safePath === CORPUS_DIR || safePath.startsWith(`${CORPUS_DIR}/`)) return safePath;
  return `${CORPUS_DIR}/${safePath.split('/').pop()}`;
}

function normalizeRecoverySnapshot(recovery = {}) {
  return {
    code: String(recovery.code || 'manual-notes-needed'),
    label_zh: String(recovery.label_zh || '需要补充可检索正文'),
    why_zh: String(recovery.why_zh || ''),
    instruction_zh: String(recovery.instruction_zh || ''),
    preferredAction: recovery.preferredAction && typeof recovery.preferredAction === 'object'
      ? {
        type: String(recovery.preferredAction.type || ''),
        label_zh: String(recovery.preferredAction.label_zh || ''),
      }
      : null,
    successCriteria_zh: String(recovery.successCriteria_zh || ''),
    blocksCitationWriting: recovery.blocksCitationWriting !== false,
    ocrCapability: recovery.ocrCapability && typeof recovery.ocrCapability === 'object'
      ? recovery.ocrCapability
      : undefined,
    noteTemplate: String(recovery.noteTemplate || ''),
  };
}

function inferRecoveryFromJobReason(reason, fallbackRecovery = {}, document = {}) {
  const reasonText = String(reason || '').toLowerCase();
  if (/(no extractable text|empty text|image|scan|ocr)/i.test(reasonText)) {
    const ocrCapability = buildOcrCapability();
    return {
      ...(fallbackRecovery || {}),
      code: 'needs-ocr',
      label_zh: 'PDF 可能是扫描版，需要 OCR',
      why_zh: String(reason || fallbackRecovery?.why_zh || '解析器没有抽取到可复制正文。'),
      instruction_zh: `${ocrCapability.recoveryInstruction_zh} 先导入已核对 OCR 文本或人工摘录 Markdown；当前队列不会自动改写原 PDF。`,
      preferredAction: { type: 'upload-extracted-notes', label_zh: '上传 OCR/人工摘录笔记' },
      successCriteria_zh: '导入后 chunks 大于 0，检索结果能命中具体正文段落。',
      blocksCitationWriting: true,
      ocrCapability,
      noteTemplate: fallbackRecovery?.noteTemplate || buildManualEvidenceNoteTemplate(document),
    };
  }
  return fallbackRecovery;
}

function determineOcrRecoveryJobStatus({ document = {}, recovery = {}, ocrCapability = {} } = {}) {
  const chunks = Number(document.chunks || 0);
  if (chunks > 0 && ['parsed', 'indexed'].includes(document.parseStatus)) return 'imported';
  if (recovery?.code === 'ready') return 'imported';
  if (recovery?.code === 'needs-ocr' && !ocrCapability.serverCanRunOcr) return 'blocked-no-ocr-tool';
  if (ocrCapability.serverCanRunOcr && recovery?.code === 'needs-ocr') return 'queued';
  return 'needs-user-text';
}

function buildOcrRecoveryJobNextAction({ recovery = {}, ocrCapability = {} } = {}) {
  if (ocrCapability.serverCanRunOcr && recovery?.code === 'needs-ocr') {
    return {
      type: 'run-server-ocr',
      label_zh: '运行服务器 OCR',
      instruction_zh: '服务器检测到 OCRmyPDF；可生成新的 OCR 后 PDF 并重新索引。原 PDF 不会被覆盖，写入正文前仍要核对命中片段。',
    };
  }
  if (recovery?.code === 'encrypted-pdf') {
    return {
      type: 'replace-or-paste-notes',
      label_zh: '替换未加密 PDF 或粘贴人工摘录',
      instruction_zh: '优先重新导出未加密、可复制文本的 PDF；无法替换时，粘贴人工核对过的 Markdown 文献笔记。',
    };
  }
  return {
    type: 'paste-verified-notes',
    label_zh: '粘贴 OCR/人工摘录文本',
    instruction_zh: '补齐 Fact、Evidence text 和 Page/section，先运行后端预检，通过后再导入证据库。',
  };
}

function summarizeOcrRecoveryJobs(jobs = []) {
  const activeJobs = jobs.filter(job => !['imported', 'cancelled'].includes(job.status));
  const byStatus = jobs.reduce((summary, job) => {
    summary[job.status] = (summary[job.status] || 0) + 1;
    return summary;
  }, {});
  return {
    total: jobs.length,
    active: activeJobs.length,
    blocksCitationWriting: activeJobs.length > 0,
    byStatus,
    label_zh: activeJobs.length
      ? `${activeJobs.length} 个 PDF/文档仍需要 OCR 或人工摘录恢复`
      : '没有待处理的 OCR/摘录恢复任务',
    nextAction_zh: activeJobs.length
      ? '先处理队列中阻塞引用写作的文档；导入通过后重新检索证据。'
      : '可以继续按任务检索 RAG 证据。',
  };
}

async function markOcrRecoveryJobsImported(projectRoot, { sourceDocument, importedDocumentPath }) {
  const normalizedSource = normalizeCorpusDocumentPath(sourceDocument);
  if (!normalizedSource) return;
  const jobs = await readOcrRecoveryJobs(projectRoot);
  let changed = false;
  const now = new Date().toISOString();
  const nextJobs = jobs.map(job => {
    if (job.sourceDocument !== normalizedSource || ['imported', 'cancelled'].includes(job.status)) return job;
    changed = true;
    return {
      ...job,
      status: 'imported',
      statusLabel_zh: OCR_RECOVERY_JOB_STATUS_LABELS.imported,
      blocksCitationWriting: false,
      importedDocumentPath: importedDocumentPath || job.importedDocumentPath || '',
      nextAction: {
        type: 'search-imported-evidence',
        label_zh: '检索已导入文本证据',
        instruction_zh: '重新运行 RAG 检索，确认命中具体正文片段后再写入论文。',
      },
      updatedAt: now,
    };
  });
  if (changed) await writeOcrRecoveryJobs(projectRoot, nextJobs);
}

function updateOcrJobAfterRun(job, {
  status,
  error = '',
  ocrCapability = job.ocrCapability,
  startedAt = '',
  completedAt = '',
  importedDocumentPath = job.importedDocumentPath || '',
  outputDocument = null,
  nextAction = job.nextAction,
}) {
  return {
    ...job,
    status,
    statusLabel_zh: OCR_RECOVERY_JOB_STATUS_LABELS[status] || '待处理',
    blocksCitationWriting: !['imported', 'cancelled'].includes(status),
    ocrCapability,
    importedDocumentPath,
    outputDocument: outputDocument ? {
      path: outputDocument.path,
      parseStatus: outputDocument.parseStatus || 'unknown',
      chunks: Number(outputDocument.chunks || 0),
      extractedTextChars: Number(outputDocument.extractedTextChars || 0),
    } : job.outputDocument || null,
    nextAction,
    lastRun: {
      status,
      error,
      startedAt,
      completedAt,
    },
    updatedAt: new Date().toISOString(),
  };
}

function buildOcrOutputFilename(sourcePath) {
  const sourceName = path.basename(normalizeCorpusDocumentPath(sourcePath));
  const stem = sourceName.replace(/\.pdf$/i, '') || 'ocr-output';
  return `${stem}.ocr.pdf`;
}

async function runOcrmypdfToBuffer({ sourcePath }) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-ocr-'));
  const outputPath = path.join(tmpDir, 'ocr-output.pdf');
  try {
    await execFileAsync('ocrmypdf', ['--skip-text', '--output-type', 'pdf', sourcePath, outputPath], {
      timeout: 180_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    return await readFile(outputPath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function readOcrRecoveryJobs(projectRoot) {
  try {
    const payload = JSON.parse(await readFile(getOcrRecoveryJobsPath(projectRoot), 'utf-8'));
    return Array.isArray(payload.jobs) ? payload.jobs : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    return [];
  }
}

async function writeOcrRecoveryJobs(projectRoot, jobs) {
  const dir = safeJoin(projectRoot, INDEX_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(getOcrRecoveryJobsPath(projectRoot), JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    jobs,
  }, null, 2), 'utf-8');
}

function assessTextDocumentQuality(content, filePath) {
  const text = String(content || '');
  const hasManualNoteMarker = /人工摘录文献笔记|Citable facts for writing|Bibliographic metadata \(人工核对后填写\)|Evidence text:\s*$/im.test(text);
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const hasFact = lines.some(line =>
    /^-\s*\[[ xX]\]\s*Fact:\s*\S.{8,}/i.test(line) ||
    /^-\s*Fact[:：]\s*\S.{8,}/i.test(line)
  );
  const hasEvidenceText = hasInlineOrFollowingManualNoteValue(lines, /^(?:>\s*)?(?:Evidence text|原文摘录|证据原文)[:：]\s*(.*)$/i, { minLength: 12 });
  const hasPageOrSection = hasInlineOrFollowingManualNoteValue(lines, /^(?:>\s*)?(?:Page\/section|页码\/章节|页码|章节|Figure|Table|图|表)[:：]\s*(.*)$/i, { minLength: 1 });
  const placeholderLines = lines.filter(line =>
    /^>\s*(Source file|目的|规则|Source document)[:：]?/i.test(line) ||
    /^#{1,6}\s+/.test(line) ||
    /^-\s*(Title|Authors|Year \/ venue|DOI \/ arXiv \/ URL|原文摘录或忠实改写|页码\/章节|表格\/图\/页码)[:：]?\s*$/i.test(line) ||
    /^-\s*\[\s*\]\s*Fact:\s*$/i.test(line) ||
    /^(Evidence text|Page\/section):\s*$/i.test(line)
  );
  const substantiveLines = lines.filter(line =>
    !placeholderLines.includes(line) &&
    !/^[-*]\s*$/.test(line) &&
    !/^[-*]\s*[^:：]+[:：]\s*$/.test(line)
  );
  if (hasManualNoteMarker && substantiveLines.length < 3 && !hasFact && !hasEvidenceText && !hasPageOrSection) {
    return {
      status: 'template-empty',
      label_zh: '文献笔记模板尚未填写',
      message_zh: '该 Markdown 看起来仍是空模板，没有足够的人工摘录事实；不会进入 RAG 引用证据。',
      blocksCitationWriting: true,
      warnings: ['文献笔记模板尚未填写，未生成可检索 chunk。'],
    };
  }
  if (hasManualNoteMarker) {
    if (!hasFact || !hasEvidenceText || !hasPageOrSection) {
      const missing = [
        hasFact ? '' : '可引用事实',
        hasEvidenceText ? '' : '原文证据摘录',
        hasPageOrSection ? '' : '页码或章节位置',
      ].filter(Boolean);
      return {
        status: 'manual-note-incomplete',
        label_zh: '文献笔记证据字段不完整',
        message_zh: `该 Markdown 像是人工文献笔记，但缺少${missing.join('、')}；不会进入 RAG 引用证据。`,
        blocksCitationWriting: true,
        warnings: [`文献笔记缺少${missing.join('、')}，未生成可检索 chunk。`],
      };
    }
  }
  return {
    status: 'usable',
    label_zh: '文本可检索',
    message_zh: '文本内容可进入 RAG 索引。',
    blocksCitationWriting: false,
    warnings: [],
  };
}

function hasInlineOrFollowingManualNoteValue(lines, labelPattern, { minLength }) {
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(labelPattern);
    if (!match) continue;
    const inlineValue = String(match[1] || '').trim();
    if (inlineValue.length >= minLength) return true;
    for (let nextIndex = index + 1; nextIndex < Math.min(lines.length, index + 4); nextIndex += 1) {
      const nextLine = String(lines[nextIndex] || '').trim();
      if (!nextLine) continue;
      if (isManualNoteFieldLabel(nextLine)) break;
      const value = nextLine.replace(/^>\s*/, '').trim();
      if (value.length >= minLength) return true;
    }
  }
  return false;
}

function isManualNoteFieldLabel(line) {
  return /^-\s*\[[ xX]?\]\s*Fact[:：]/i.test(line) ||
    /^-\s*Fact[:：]/i.test(line) ||
    /^(?:>\s*)?(?:Evidence text|原文摘录|证据原文|Page\/section|页码\/章节|页码|章节|Figure|Table|图|表)[:：]\s*$/i.test(line) ||
    /^#{1,6}\s+/.test(line);
}

function formatCorpusUploadReviewCopyText({ status, label_zh, message_zh, document, chunks, chars, recovery }) {
  return [
    '# RAG 上传诊断',
    `${label_zh}（${status}）`,
    `文件：${document.path || document.title || '(unknown)'}`,
    `解析状态：${document.parseStatus || 'unknown'}，parser：${document.parser || 'none'}`,
    `chunks：${chunks}，抽取字符：${chars}`,
    `说明：${message_zh}`,
    recovery ? `恢复诊断：${recovery.label_zh}（${recovery.code}）` : '',
    recovery?.why_zh ? `原因：${recovery.why_zh}` : '',
    recovery?.instruction_zh ? `建议：${recovery.instruction_zh}` : '',
    recovery?.ocrCapability ? `OCR 能力：${recovery.ocrCapability.label_zh}（${recovery.ocrCapability.status}，自动恢复：${recovery.ocrCapability.automaticRecoveryAvailable ? '可用' : '未启用'}）` : '',
    recovery?.ocrCapability?.installHint_zh ? `OCR 说明：${recovery.ocrCapability.installHint_zh}` : '',
    recovery?.successCriteria_zh ? `成功标准：${recovery.successCriteria_zh}` : '',
    recovery?.noteTemplate ? `\n# 可复制 Markdown 文献笔记模板\n${recovery.noteTemplate}` : '',
  ].filter(Boolean).join('\n');
}
 
async function ensureIndex(projectRoot) {
  const indexPath = getIndexPath(projectRoot);
  try {
    return JSON.parse(await readFile(indexPath, 'utf-8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    return indexProjectCorpus(projectRoot);
  }
}
 
async function writeIndex(projectRoot, index) {
  const dir = safeJoin(projectRoot, INDEX_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(getIndexPath(projectRoot), JSON.stringify(index, null, 2), 'utf-8');
}
 
function getIndexPath(projectRoot) {
  return safeJoin(projectRoot, INDEX_DIR, INDEX_FILE);
}

function getOcrRecoveryJobsPath(projectRoot) {
  return safeJoin(projectRoot, INDEX_DIR, OCR_RECOVERY_JOBS_FILE);
}
 
async function collectCorpusFiles(projectRoot) {
  const roots = [CORPUS_DIR, 'docs', 'sec'];
  const files = [];
  for (const root of roots) {
    files.push(...await walkSupportedFiles(projectRoot, root));
  }
  for (const file of ['main.tex', 'references.bib']) {
    try {
      await stat(safeJoin(projectRoot, file));
      files.push(file);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  return Array.from(new Set(files)).sort();
}
 
async function walkSupportedFiles(projectRoot, relativeDir) {
  const dir = safeJoin(projectRoot, relativeDir);
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const relativePath = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === INDEX_DIR || entry.name === 'node_modules') continue;
        files.push(...await walkSupportedFiles(projectRoot, relativePath));
      } else if (
        SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ||
        isExtractionSidecar(relativePath)
      ) {
        files.push(relativePath);
      }
    }
    return files;
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

export async function saveBinaryCorpusDocument(projectRoot, { filename, buffer, mimetype }) {
  if (!filename || !Buffer.isBuffer(buffer)) {
    throw Object.assign(new Error('filename and buffer are required'), { statusCode: 400 });
  }
  const safeName = sanitizeUploadPath(filename).split('/').pop();
  if (!safeName) throw Object.assign(new Error('Invalid filename'), { statusCode: 400 });
  const ext = path.extname(safeName).toLowerCase();
  if (!BINARY_DOCUMENT_EXTENSIONS.has(ext)) {
    throw Object.assign(new Error(`Unsupported binary document type: ${ext}`), { statusCode: 400 });
  }
  if (buffer.length > MAX_BINARY_FILE_BYTES) {
    throw Object.assign(new Error('Document is too large to upload'), { statusCode: 400 });
  }

  const corpusRoot = safeJoin(projectRoot, CORPUS_DIR);
  await mkdir(corpusRoot, { recursive: true });
  const relativePath = `${CORPUS_DIR}/${safeName}`;
  const target = safeJoin(projectRoot, relativePath);
  await writeFile(target, buffer);

  const startedAt = new Date().toISOString();
  let extraction = {
    parseStatus: 'metadata-only',
    parser: 'none',
    extractedTextChars: 0,
    extractedPath: '',
    error: '',
    warnings: [],
    startedAt,
    completedAt: '',
    mimetype: mimetype || 'application/octet-stream',
  };

  if (ext === '.pdf') {
    try {
      const parsed = await extractPdfText(target);
      const text = normalizeExtractedText(parsed.text);
      if (text.length > 0) {
        const extractedRelativePath = getExtractionSidecarPath(relativePath);
        const sidecar = [
          `# ${safeName}`,
          '',
          `> Source document: ${safeName}`,
          `> Parser: ${parsed.parser}`,
          `> Extracted characters: ${text.length}`,
          parsed.pages ? `> Pages: ${parsed.pages}` : '',
          '',
          EXTRACTION_MARKER,
          '',
          text,
        ].filter(Boolean).join('\n');
        await writeFile(safeJoin(projectRoot, extractedRelativePath), sidecar, 'utf-8');
        extraction = {
          ...extraction,
          parseStatus: 'parsed',
          parser: parsed.parser,
          extractedTextChars: text.length,
          extractedPath: extractedRelativePath,
          warnings: parsed.warnings || [],
          pages: parsed.pages || undefined,
        };
      } else {
        extraction = {
          ...extraction,
          parseStatus: 'failed',
          parser: parsed.parser,
          error: 'PDF parser returned no extractable text',
          warnings: parsed.warnings || [],
        };
      }
    } catch (error) {
      extraction = {
        ...extraction,
        parseStatus: 'failed',
        parser: 'pdf-text-extraction',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } else {
    extraction = {
      ...extraction,
      parseStatus: 'metadata-only',
      error: 'No text extractor is configured for this document type',
    };
  }

  extraction.completedAt = new Date().toISOString();
  await writeFile(
    safeJoin(projectRoot, getExtractionMetadataPath(relativePath)),
    JSON.stringify(extraction, null, 2),
    'utf-8',
  );

  const index = await indexProjectCorpus(projectRoot);
  return index.documents.find(doc => doc.path === relativePath) || {
    id: stableId(relativePath),
    path: relativePath,
    title: safeName,
    kind: 'binary',
    parseStatus: extraction.parseStatus,
    extraction,
  };
}

async function buildBinaryDocument(projectRoot, filePath, info) {
  const metadata = await readExtractionMetadata(projectRoot, filePath);
  const extractedPath = metadata?.extractedPath || getExtractionSidecarPath(filePath);
  const extractedContent = await readExtractionSidecar(projectRoot, extractedPath);
  const indexableText = extractedContent || '';
  const parseStatus = indexableText
    ? 'parsed'
    : (metadata?.parseStatus || 'metadata-only');
  const title = indexableText ? inferTitle(indexableText, filePath) : path.basename(filePath);

  const document = {
      id: stableId(filePath),
      path: filePath,
      title,
      bytes: info.size,
      mtimeMs: info.mtimeMs,
      kind: 'binary',
      parseStatus,
      parser: metadata?.parser || 'none',
      extractedTextChars: metadata?.extractedTextChars || indexableText.length,
      extractedPath: indexableText ? extractedPath : '',
      extractionError: metadata?.error || '',
      warnings: metadata?.warnings || [],
  };
  return {
    document,
    indexableText,
  };
}

async function readExtractionMetadata(projectRoot, filePath) {
  try {
    return JSON.parse(await readFile(safeJoin(projectRoot, getExtractionMetadataPath(filePath)), 'utf-8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    return null;
  }
}

async function readExtractionSidecar(projectRoot, relativePath) {
  try {
    const content = await readFile(safeJoin(projectRoot, relativePath), 'utf-8');
    const markerIndex = content.indexOf(EXTRACTION_MARKER);
    if (markerIndex === -1) return '';
    return content.slice(markerIndex + EXTRACTION_MARKER.length).trim();
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

function getExtractionSidecarPath(filePath) {
  return `${filePath}.extracted.md`;
}

function getExtractionMetadataPath(filePath) {
  return `${filePath}.rag.json`;
}

function isExtractionSidecar(filePath) {
  return /\.extracted\.md$/i.test(filePath) || /\.rag\.json$/i.test(filePath);
}

async function extractPdfText(pdfPath) {
  const attempts = [
    () => extractPdfTextWithPdftotext(pdfPath),
    () => extractPdfTextWithPython(pdfPath),
    () => extractPdfTextNaively(pdfPath),
  ];
  const errors = [];
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result?.text?.trim()) return { ...result, warnings: errors };
      if (result?.parser) errors.push(`${result.parser}: no text extracted`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`Unable to extract PDF text. ${errors.join(' | ')}`);
}

async function extractPdfTextWithPdftotext(pdfPath) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-pdf-'));
  const outputPath = path.join(tmpDir, 'out.txt');
  try {
    await execFileAsync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, outputPath], {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      parser: 'pdftotext',
      text: await readFile(outputPath, 'utf-8'),
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function extractPdfTextWithPython(pdfPath) {
  const script = `
import json, sys
path = sys.argv[1]
try:
    import pypdf
    reader = pypdf.PdfReader(path)
    texts = []
    for page in reader.pages:
        texts.append(page.extract_text() or "")
    print(json.dumps({"parser": "python-pypdf", "pages": len(reader.pages), "text": "\\n\\n".join(texts)}))
except Exception as first:
    try:
        import fitz
        doc = fitz.open(path)
        texts = [page.get_text("text") for page in doc]
        print(json.dumps({"parser": "python-fitz", "pages": len(doc), "text": "\\n\\n".join(texts)}))
    except Exception as second:
        raise RuntimeError(f"python PDF extraction failed: {first}; {second}")
`;
  const { stdout } = await execFileAsync('python3', ['-c', script, pdfPath], {
    timeout: 60_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function extractPdfTextNaively(pdfPath) {
  const buffer = await readFile(pdfPath);
  const raw = buffer.toString('latin1');
  const strings = [];
  const literalPattern = /\((?:\\.|[^\\)]){2,}\)/g;
  let match;
  while ((match = literalPattern.exec(raw)) !== null) {
    strings.push(decodePdfLiteral(match[0].slice(1, -1)));
  }
  return {
    parser: 'naive-pdf-literals',
    text: strings.join(' '),
    warnings: ['Fallback parser only extracts simple PDF literal strings'],
  };
}

function decodePdfLiteral(value) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function normalizeExtractedText(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}
 
function chunkDocument(document, content) {
  const lines = content.split(/\r?\n/);
  const words = [];
  lines.forEach((line, lineIndex) => {
    for (const word of line.split(/\s+/).filter(Boolean)) {
      words.push({ word, line: lineIndex + 1 });
    }
  });
  if (words.length === 0) return [];
 
  const chunks = [];
  for (let start = 0; start < words.length; start += CHUNK_WORDS - CHUNK_OVERLAP) {
    const slice = words.slice(start, start + CHUNK_WORDS);
    const text = slice.map(item => item.word).join(' ');
    chunks.push({
      id: `${document.id}:${chunks.length}`,
      documentId: document.id,
      text,
      terms: tokenize(text),
      source: {
        path: document.path,
        title: document.title,
        lineStart: slice[0]?.line || 1,
        lineEnd: slice[slice.length - 1]?.line || 1,
      },
    });
    if (start + CHUNK_WORDS >= words.length) break;
  }
  return chunks;
}
 
function scoreChunk(chunk, queryTerms) {
  const termSet = new Set(chunk.terms);
  let overlap = 0;
  for (const term of queryTerms) {
    if (termSet.has(term)) overlap += 1;
  }
  if (overlap === 0) return 0;
  const density = overlap / Math.sqrt(Math.max(chunk.terms.length, 1));
  return Number((overlap + density).toFixed(4));
}
 
function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1);
}
 
function inferTitle(content, fallbackPath) {
  const title = content.split(/\r?\n/).find(line => /^#\s+/.test(line))?.replace(/^#\s+/, '').trim();
  return title || path.basename(fallbackPath);
}
 
function stableId(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);
}
 
/* ── Delete Corpus Document ──────────────────────────────────── */
 
export async function deleteCorpusDocument(projectRoot, docPath) {
  const safeDocPath = sanitizeUploadPath(docPath);
  const fullPath = safeJoin(projectRoot, safeDocPath);
 
  // Ensure it's within the corpus directory
  const corpusRoot = safeJoin(projectRoot, CORPUS_DIR);
  if (!fullPath.startsWith(corpusRoot + path.sep) && fullPath !== corpusRoot) {
    throw Object.assign(new Error('Can only delete files from research_corpus directory'), { statusCode: 400 });
  }
 
  try {
    await unlink(fullPath);
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: false, error: 'Document not found' };
    throw e;
  }
 
  // Also delete companion .md if it exists (for binary uploads)
  for (const companion of [
    fullPath + '.md',
    fullPath + '.extracted.md',
    fullPath + '.rag.json',
  ]) {
    try { await unlink(companion); } catch { /* not required */ }
  }
 
  // Re-index
  await indexProjectCorpus(projectRoot);
 
  return { ok: true };
}
 
/* ── External Source Search ──────────────────────────────────── */
 
const SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1/paper/search';
const ARXIV_API = 'https://export.arxiv.org/api/query';
const CROSSREF_API = 'https://api.crossref.org/works';
const OPENALEX_API = 'https://api.openalex.org/works';
 
/**
 * Search external academic databases for papers matching a query.
 * Supported sources: 'semantic-scholar', 'arxiv', 'crossref', 'openalex'
 */
export async function searchExternalSources(query, options = {}) {
  const { sources = ['semantic-scholar', 'arxiv'], limit = 5 } = options;
  const results = [];
 
  const searchPromises = sources.map(async (source) => {
    try {
      switch (source) {
        case 'semantic-scholar':
          return await searchSemanticScholar(query, limit);
        case 'arxiv':
          return await searchArxiv(query, limit);
        case 'crossref':
          return await searchCrossRef(query, limit);
        case 'openalex':
          return await searchOpenAlex(query, limit);
        default:
          return [];
      }
    } catch (err) {
      console.error(`External search error [${source}]:`, err.message);
      return [];
    }
  });
 
  const sourceResults = await Promise.all(searchPromises);
  for (const items of sourceResults) {
    results.push(...items);
  }
 
  // Sort by relevance score descending, then limit
  results.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
  return results.slice(0, limit);
}
 
async function searchSemanticScholar(query, limit) {
  const url = `${SEMANTIC_SCHOLAR_API}?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,authors,year,venue,externalIds,abstract,citationCount,url`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PaperWrighting/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || []).map(paper => ({
    title: paper.title || '',
    authors: (paper.authors || []).map(a => a.name),
    year: paper.year,
    venue: paper.venue || '',
    url: paper.url || '',
    abstract: paper.abstract || '',
    citation_count: paper.citationCount || 0,
    doi: paper.externalIds?.DOI || '',
    source: 'semantic-scholar',
    relevance_score: paper.citationCount ? Math.min(1, paper.citationCount / 100) : 0.5,
  }));
}
 
async function searchArxiv(query, limit) {
  const url = `${ARXIV_API}?search_query=all:${encodeURIComponent(query)}&max_results=${limit}&sortBy=relevance&sortOrder=descending`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PaperWrighting/1.0', 'Accept': 'application/xml' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
 
  // Simple XML parsing without external dependencies
  const entries = xml.split('<entry>').slice(1);
  return entries.slice(0, limit).map(entry => {
    const extract = (tag) => {
      const match = entry.match(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 's'));
      return match ? match[1].trim() : '';
    };
    const extractAuthor = () => {
      const authors = [];
      const authorRegex = /<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g;
      let m;
      while ((m = authorRegex.exec(entry)) !== null) authors.push(m[1].trim());
      return authors;
    };
    const id = extract('id');
    const published = extract('published');
    return {
      title: extract('title').replace(/\s+/g, ' '),
      authors: extractAuthor(),
      year: published ? new Date(published).getFullYear() : undefined,
      venue: 'arXiv',
      url: id,
      abstract: extract('summary').replace(/\s+/g, ' ').trim(),
      citation_count: 0,
      doi: '',
      source: 'arxiv',
      relevance_score: 0.5,
    };
  });
}
 
async function searchCrossRef(query, limit) {
  const url = `${CROSSREF_API}?query=${encodeURIComponent(query)}&rows=${limit}&sort=relevance&order=desc`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PaperWrighting/1.0 (mailto:research@example.com)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.message?.items || []).map(item => ({
    title: item.title?.[0] || '',
    authors: (item.author || []).map(a => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean),
    year: item.published?.dateParts?.[0]?.[0],
    venue: item['container-title']?.[0] || item['short-container-title']?.[0] || '',
    url: item.URL || '',
    abstract: item.abstract || '',
    citation_count: item['is-referenced-by-count'] || 0,
    doi: item.DOI || '',
    source: 'crossref',
    relevance_score: item.score ? Math.min(1, item.score / 100) : 0.5,
  }));
}
 
async function searchOpenAlex(query, limit) {
  const url = `${OPENALEX_API}?search=${encodeURIComponent(query)}&per_page=${limit}&sort=relevance_score:desc`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PaperWrighting/1.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).map(paper => ({
    title: paper.title || '',
    authors: (paper.authorships || []).map(a => a.author?.display_name || ''),
    year: paper.publication_year,
    venue: paper.primary_location?.source?.display_name || '',
    url: paper.primary_location?.landing_page_url || '',
    abstract: paper.abstract_inverted_index ? reconstructAbstract(paper.abstract_inverted_index) : '',
    citation_count: paper.cited_by_count || 0,
    doi: paper.doi || '',
    source: 'openalex',
    relevance_score: paper.relevance_score || 0.5,
  }));
}
 
function reconstructAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.filter(Boolean).join(' ');
}
