import path from 'path';
import crypto from 'crypto';

const MAX_DOCUMENTS = 200;
const MAX_DOCUMENT_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_TRANSCRIPT_BYTES = 1024 * 1024;
const DEFAULT_CHUNK_SIZE = 120;
const DEFAULT_OVERLAP = 30;
const VECTOR_DIMENSIONS = 128;
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in',
  'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'were',
  'will', 'with',
]);
const SUPPORT_MARKERS = [
  'approved', 'confirmed', 'verified', 'evidence', 'reduced', 'reduces',
  'improve', 'improves', 'launch', 'decision', 'required',
  '已批准', '已确认', '已核验', '证据', '降低', '减少', '提升', '决定', '要求', '必须',
];
const CONFLICT_MARKERS = [
  'did not', 'does not', 'cannot', 'failed', 'without', 'no evidence',
  'not reduce', 'blocked', 'rejected', 'contradict',
  '未批准', '未确认', '无法', '失败', '没有证据', '缺少证据', '未降低', '未减少', '已驳回', '相矛盾',
];
const NEGATABLE_ACTION_TERMS = new Set([
  'approve', 'approved', 'approval', 'launch', 'reduce', 'reduced', 'reduces',
  'drafting', 'time', 'integrate', 'integrates', 'payroll',
  '批准', '上线', '降低', '减少', '集成', '工时', '耗时',
]);

export function buildHybridRetrievalIndex(documents = [], options = {}) {
  if (!Array.isArray(documents)) {
    throw Object.assign(new Error('documents must be an array'), { statusCode: 400 });
  }
  if (documents.length > MAX_DOCUMENTS) {
    throw Object.assign(new Error('too many documents'), { statusCode: 400 });
  }

  const chunkSize = clampInteger(options.chunkSize, 20, 400, DEFAULT_CHUNK_SIZE);
  const overlap = clampInteger(options.overlap, 0, Math.max(0, chunkSize - 1), Math.min(DEFAULT_OVERLAP, chunkSize - 1));
  const normalizedDocuments = documents.map(normalizeDocument);
  const totalBytes = normalizedDocuments.reduce((sum, doc) => sum + Buffer.byteLength(doc.text, 'utf-8'), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw Object.assign(new Error('document corpus is too large'), { statusCode: 400 });
  }

  const chunks = normalizedDocuments.flatMap(doc => chunkDocument(doc, { chunkSize, overlap }));
  const documentFrequency = new Map();
  for (const chunk of chunks) {
    for (const term of new Set(chunk.terms)) {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }
  const averageLength = chunks.length
    ? chunks.reduce((sum, chunk) => sum + chunk.terms.length, 0) / chunks.length
    : 0;

  return {
    version: 1,
    retrievalProfile: {
      kind: 'local-hybrid-bm25-hashed-vector',
      label: 'Local BM25 plus explainable hashed-vector retrieval',
      semantic: true,
      vector: {
        kind: 'hashed-token-and-character-ngram',
        dimensions: VECTOR_DIMENSIONS,
      },
      reranker: {
        kind: 'deterministic-term-coverage-proximity',
      },
    },
    documents: normalizedDocuments.map(({ text, ...doc }) => ({
      ...doc,
      textBytes: Buffer.byteLength(text, 'utf-8'),
    })),
    chunks,
    statistics: {
      documentCount: normalizedDocuments.length,
      chunkCount: chunks.length,
      averageChunkTerms: roundScore(averageLength),
    },
    bm25: {
      documentFrequency: Object.fromEntries([...documentFrequency.entries()].sort(([a], [b]) => a.localeCompare(b))),
      averageLength,
      chunkCount: chunks.length,
    },
  };
}

export function searchHybridEvidence(indexOrDocuments, query, options = {}) {
  const index = Array.isArray(indexOrDocuments)
    ? buildHybridRetrievalIndex(indexOrDocuments, options)
    : indexOrDocuments;
  if (!index || !Array.isArray(index.chunks)) {
    throw Object.assign(new Error('valid hybrid index is required'), { statusCode: 400 });
  }
  if (typeof query !== 'string' || !query.trim()) {
    return { query: String(query || ''), results: [], retrievalProfile: index.retrievalProfile };
  }

  const topK = clampInteger(options.topK, 1, 50, 5);
  const queryTerms = tokenize(query);
  const queryVector = buildHashedVector(query);
  const scored = index.chunks.map(chunk => {
    const bm25 = scoreBm25(chunk, queryTerms, index.bm25);
    const vector = cosineSimilarity(queryVector, chunk.vector);
    const matchedTerms = [...new Set(queryTerms.filter(term => chunk.termFrequency[term]))].sort();
    const rerank = scoreRerank(chunk, queryTerms, matchedTerms);
    const final = roundScore((0.58 * bm25) + (0.32 * vector) + (0.10 * rerank));
    return {
      id: chunk.id,
      text: chunk.text,
      source: chunk.source,
      chunk: {
        id: chunk.id,
        ordinal: chunk.ordinal,
        range: chunk.range,
        editModel: chunk.editModel,
      },
      score: final,
      scoreBreakdown: {
        bm25: roundScore(bm25),
        vector: roundScore(vector),
        rerank: roundScore(rerank),
        final,
      },
      matchedTerms,
    };
  })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, topK)
    .map((result, index) => ({ ...result, rank: index + 1 }));

  return {
    query,
    results: scored,
    retrievalProfile: index.retrievalProfile,
  };
}

export function evaluateRetrieval(indexOrDocuments, queries = [], options = {}) {
  const index = Array.isArray(indexOrDocuments)
    ? buildHybridRetrievalIndex(indexOrDocuments, options)
    : indexOrDocuments;
  if (!Array.isArray(queries)) {
    throw Object.assign(new Error('queries must be an array'), { statusCode: 400 });
  }
  const topK = clampInteger(options.topK, 1, 50, 5);
  const perQuery = queries.map(item => {
    const relevant = new Set((item.relevantChunkIds || []).map(String));
    const search = searchHybridEvidence(index, item.query || '', { topK });
    const retrievedIds = search.results.map(result => result.id);
    const hits = retrievedIds.filter(id => relevant.has(id));
    const firstRelevantRank = search.results.findIndex(result => relevant.has(result.id)) + 1;
    return {
      id: item.id || stableId(item.query || ''),
      query: item.query || '',
      relevantChunkIds: [...relevant],
      retrievedChunkIds: retrievedIds,
      hit: hits.length > 0,
      precisionAtK: roundScore(hits.length / topK),
      recallAtK: relevant.size ? roundScore(hits.length / relevant.size) : 0,
      reciprocalRank: firstRelevantRank > 0 ? roundScore(1 / firstRelevantRank) : 0,
    };
  });

  const queryCount = perQuery.length;
  const average = key => roundScore(queryCount ? perQuery.reduce((sum, item) => sum + item[key], 0) / queryCount : 0);
  return {
    queryCount,
    topK,
    metrics: {
      precisionAtK: average('precisionAtK'),
      recallAtK: average('recallAtK'),
      mrr: average('reciprocalRank'),
    },
    perQuery,
  };
}

export function buildEvidenceGraph(indexOrDocuments, claims = [], options = {}) {
  const index = Array.isArray(indexOrDocuments)
    ? buildHybridRetrievalIndex(indexOrDocuments, options)
    : indexOrDocuments;
  if (!Array.isArray(claims)) {
    throw Object.assign(new Error('claims must be an array'), { statusCode: 400 });
  }
  const topK = clampInteger(options.topK, 1, 20, 5);
  const normalizedClaims = claims.map((claim, claimIndex) => ({
    id: String(claim.id || `claim-${claimIndex + 1}`),
    text: String(claim.text || '').trim(),
  })).filter(claim => claim.text);

  const edges = [];
  const conflicts = [];
  const gaps = [];
  for (const claim of normalizedClaims) {
    const search = searchHybridEvidence(index, claim.text, { topK });
    const related = search.results
      .map(result => ({ result, relation: classifyEvidenceRelation(claim.text, result) }))
      .filter(item => item.relation !== 'source');
    const conflictItems = related.filter(item => item.relation === 'conflict');
    const supportItems = related.filter(item => item.relation === 'support');

    if (conflictItems.length) {
      for (const item of conflictItems) {
        edges.push(buildGraphEdge(claim, item.result, 'conflict'));
      }
      conflicts.push({
        claimId: claim.id,
        claim: claim.text,
        sources: conflictItems.map(item => item.result.source),
      });
      continue;
    }
    if (supportItems.length) {
      for (const item of supportItems) {
        edges.push(buildGraphEdge(claim, item.result, 'support'));
      }
      continue;
    }

    edges.push({
      id: stableId(`${claim.id}:missing`),
      claimId: claim.id,
      type: 'missing',
      reason: 'No retrieved chunk passed the support or conflict threshold.',
    });
    gaps.push({
      claimId: claim.id,
      claim: claim.text,
      reason: 'missing-source',
    });
  }

  const claimIdsWithConflict = new Set(edges.filter(edge => edge.type === 'conflict').map(edge => edge.claimId));
  const claimIdsWithSupport = new Set(edges.filter(edge => edge.type === 'support').map(edge => edge.claimId));
  const claimIdsMissing = new Set(edges.filter(edge => edge.type === 'missing').map(edge => edge.claimId));
  return {
    claims: normalizedClaims,
    edges,
    conflicts,
    gaps,
    coverage: {
      totalClaims: normalizedClaims.length,
      supportedClaims: [...claimIdsWithSupport].filter(id => !claimIdsWithConflict.has(id)).length,
      conflictedClaims: claimIdsWithConflict.size,
      missingClaims: claimIdsMissing.size,
      coverageRatio: roundScore(normalizedClaims.length
        ? (normalizedClaims.length - claimIdsMissing.size) / normalizedClaims.length
        : 0),
    },
  };
}

export function ingestMeetingTranscript({ filename = 'meeting-transcript.txt', content = '' } = {}) {
  if (typeof content !== 'string' || !content.trim()) {
    throw Object.assign(new Error('content is required'), { statusCode: 400 });
  }
  if (Buffer.byteLength(content, 'utf-8') > MAX_TRANSCRIPT_BYTES) {
    throw Object.assign(new Error('meeting transcript is too large'), { statusCode: 400 });
  }
  const safeName = sanitizeFilename(filename);
  const lines = content.split(/\r?\n/)
    .map(parseTranscriptLine)
    .filter(item => item.text);
  if (!lines.length) {
    throw Object.assign(new Error('meeting transcript has no readable content'), { statusCode: 400 });
  }

  const decisions = lines
    .filter(item => /\bdecision\s*:|(?:决定|决策)\s*[:：]/i.test(item.text))
    .map(item => ({
      id: stableId(`${safeName}:decision:${item.timestamp}:${item.text}`),
      timestamp: item.timestamp,
      speaker: item.speaker,
      text: item.text.replace(/(?:\bdecision|决定|决策)\s*[:：]\s*/i, '').trim(),
      evidence: buildTimestampEvidence(item, safeName),
    }));
  const actionItems = lines
    .filter(item => /\b(action item|action)\s*:|(?:行动项|待办|任务)\s*[:：]/i.test(item.text))
    .map(item => parseActionItem(item, safeName));
  const timestampEvidence = lines.map(item => buildTimestampEvidence(item, safeName));
  const summary = summarizeMeeting(lines, decisions, actionItems);
  const workflowDocument = buildMeetingWorkflowDocument({
    safeName,
    summary,
    decisions,
    actionItems,
    timestampEvidence,
  });

  return {
    source: {
      filename: safeName,
      lineCount: lines.length,
      speakerDiarization: 'not-claimed',
    },
    summary,
    decisions,
    actionItems,
    timestampEvidence,
    workflowDocument,
  };
}

function normalizeDocument(document, index = 0) {
  const text = String(document.text || document.content || '');
  if (!text.trim()) {
    throw Object.assign(new Error('document text is required'), { statusCode: 400 });
  }
  if (Buffer.byteLength(text, 'utf-8') > MAX_DOCUMENT_BYTES) {
    throw Object.assign(new Error('document is too large'), { statusCode: 400 });
  }
  const sourcePath = normalizeSafePath(document.path || document.sourcePath || `${document.id || `document-${index + 1}`}.md`);
  const id = String(document.id || stableId(sourcePath));
  return {
    id,
    path: sourcePath,
    title: String(document.title || path.basename(sourcePath)),
    text,
    metadata: isPlainObject(document.metadata) ? { ...document.metadata } : {},
  };
}

function chunkDocument(document, { chunkSize, overlap }) {
  const words = document.text.match(/\S+/g) || [];
  if (!words.length) return [];
  const chunks = [];
  const step = Math.max(1, chunkSize - overlap);
  for (let start = 0; start < words.length; start += step) {
    const selectedWords = words.slice(start, start + chunkSize);
    const text = selectedWords.join(' ');
    const terms = tokenize(text);
    const id = stableId(`${document.path}:${chunks.length}:${text}`);
    chunks.push({
      id,
      documentId: document.id,
      ordinal: chunks.length,
      text,
      terms,
      termFrequency: countTerms(terms),
      vector: buildHashedVector(text),
      source: {
        id: document.id,
        path: document.path,
        title: document.title,
      },
      range: {
        wordStart: start,
        wordEnd: start + selectedWords.length,
      },
      editModel: {
        id,
        originalText: text,
        editedText: text,
        status: 'indexed',
        provenance: {
          sourcePath: document.path,
          sourceTitle: document.title,
          chunkOrdinal: chunks.length,
        },
      },
    });
    if (start + chunkSize >= words.length) break;
  }
  return chunks;
}

function scoreBm25(chunk, queryTerms, bm25) {
  if (!queryTerms.length || !bm25.chunkCount) return 0;
  const k1 = 1.2;
  const b = 0.75;
  let score = 0;
  for (const term of queryTerms) {
    const frequency = chunk.termFrequency[term] || 0;
    if (!frequency) continue;
    const df = bm25.documentFrequency[term] || 0;
    const idf = Math.log(1 + ((bm25.chunkCount - df + 0.5) / (df + 0.5)));
    const denominator = frequency + k1 * (1 - b + b * (chunk.terms.length / (bm25.averageLength || 1)));
    score += idf * ((frequency * (k1 + 1)) / denominator);
  }
  return score;
}

function scoreRerank(chunk, queryTerms, matchedTerms) {
  if (!queryTerms.length || !matchedTerms.length) return 0;
  const coverage = matchedTerms.length / new Set(queryTerms).size;
  const positions = matchedTerms
    .map(term => chunk.terms.indexOf(term))
    .filter(position => position >= 0)
    .sort((a, b) => a - b);
  const span = positions.length > 1 ? positions.at(-1) - positions[0] + 1 : 1;
  const proximity = Math.min(1, matchedTerms.length / span);
  return (0.7 * coverage) + (0.3 * proximity);
}

function buildHashedVector(text) {
  const features = [...tokenize(text), ...characterNgrams(text)];
  const vector = new Array(VECTOR_DIMENSIONS).fill(0);
  for (const feature of features) {
    const hash = hashNumber(feature);
    const index = hash % VECTOR_DIMENSIONS;
    const sign = hash % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));
  return norm ? vector.map(value => value / norm) : vector;
}

function cosineSimilarity(left, right) {
  let score = 0;
  for (let index = 0; index < VECTOR_DIMENSIONS; index += 1) {
    score += (left[index] || 0) * (right[index] || 0);
  }
  return Math.max(0, score);
}

function classifyEvidenceRelation(claimText, result) {
  if (result.score < 0.08) return 'source';
  const claimTerms = new Set(tokenize(claimText));
  const evidenceText = result.text.toLowerCase();
  const overlap = result.matchedTerms.filter(term => claimTerms.has(term)).length / Math.max(1, claimTerms.size);
  const hasConflictMarker = CONFLICT_MARKERS.some(marker => evidenceText.includes(marker));
  const sharedActionTerms = result.matchedTerms.filter(term => NEGATABLE_ACTION_TERMS.has(term));
  const negatedSharedAction = sharedActionTerms.some(term => isTermNegated(evidenceText, term));
  const explicitEvidenceGap = /no evidence|without evidence|没有证据|缺少证据/.test(evidenceText);
  const claimConcernsEvidence = /evidence|proof|证据|依据/.test(claimText.toLowerCase());
  if (hasConflictMarker && overlap >= 0.25 && (negatedSharedAction || (explicitEvidenceGap && claimConcernsEvidence))) return 'conflict';
  const hasSupportMarker = SUPPORT_MARKERS.some(marker => evidenceText.includes(marker));
  if ((hasSupportMarker && overlap >= 0.25) || overlap >= 0.45) return 'support';
  return 'source';
}

function isTermNegated(text, term) {
  const positions = [];
  let offset = text.indexOf(term);
  while (offset >= 0) {
    positions.push(offset);
    offset = text.indexOf(term, offset + term.length);
  }
  return positions.some(position => {
    const before = text.slice(Math.max(0, position - 24), position);
    return /(?:did not|does not|cannot|not|never)(?:\s+\w+){0,2}\s*$/i.test(before)
      || /(?:未|没有|无法|并未|不能)[\p{Script=Han}]{0,3}$/u.test(before);
  });
}

function buildGraphEdge(claim, result, type) {
  return {
    id: stableId(`${claim.id}:${type}:${result.id}`),
    claimId: claim.id,
    chunkId: result.id,
    type,
    score: result.score,
    scoreBreakdown: result.scoreBreakdown,
    matchedTerms: result.matchedTerms,
    source: result.source,
    excerpt: result.text,
  };
}

function parseTranscriptLine(rawLine, index) {
  const line = rawLine.trim();
  if (!line) return { text: '' };
  const timestampMatch = line.match(/^\[?((?:\d{1,2}:)?\d{2}:\d{2})\]?\s*(.*)$/);
  const timestamp = timestampMatch ? normalizeTimestamp(timestampMatch[1]) : null;
  const rest = timestampMatch ? timestampMatch[2].trim() : line;
  const speakerMatch = rest.match(/^([^:：]{1,40})[:：]\s*(.+)$/);
  return {
    line: index + 1,
    timestamp,
    speaker: speakerMatch ? speakerMatch[1].trim() : '',
    text: speakerMatch ? speakerMatch[2].trim() : rest,
  };
}

function parseActionItem(item, safeName) {
  const text = item.text.replace(/(?:\baction item|\baction|行动项|待办|任务)\s*[:：]\s*/i, '').trim();
  const ownerMatch = text.match(/^([A-Z][A-Za-z0-9_-]{1,30})\s+will\s+/);
  const chineseOwnerMatch = text.match(/^([\p{L}\p{N}_-]{1,30})(?:负责|将在|需)/u);
  const dueMatch = text.match(/\bby\s+(\d{4}-\d{2}-\d{2}|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
  const chineseDueMatch = text.match(/(?:于|截止|在)?\s*(\d{4}-\d{2}-\d{2}|周[一二三四五六日天]|星期[一二三四五六日天])(?:前|完成|截止)?/u);
  return {
    id: stableId(`${safeName}:action:${item.timestamp}:${item.text}`),
    timestamp: item.timestamp,
    speaker: item.speaker,
    owner: ownerMatch?.[1] || chineseOwnerMatch?.[1] || '',
    due: dueMatch?.[1] || chineseDueMatch?.[1] || '',
    text,
    evidence: buildTimestampEvidence(item, safeName),
  };
}

function summarizeMeeting(lines, decisions, actionItems) {
  const firstTopic = lines[0].text.replace(/\s+/g, ' ').trim();
  if (/\p{Script=Han}/u.test(firstTopic)) {
    return `讨论：${firstTopic}；记录 ${decisions.length} 项决定、${actionItems.length} 项待办。`;
  }
  const parts = [`Discussed ${firstTopic}`];
  if (decisions.length) parts.push(`${decisions.length} decision${decisions.length === 1 ? '' : 's'} recorded`);
  if (actionItems.length) parts.push(`${actionItems.length} action item${actionItems.length === 1 ? '' : 's'} recorded`);
  return `${parts.join('; ')}.`;
}

function buildMeetingWorkflowDocument({ safeName, summary, decisions, actionItems, timestampEvidence }) {
  const content = [
    `# Meeting Intake: ${safeName}`,
    '',
    '## Summary',
    summary,
    '',
    '## Decisions',
    ...formatMeetingItems(decisions),
    '',
    '## Action Items',
    ...formatMeetingItems(actionItems),
    '',
    '## Timestamp Evidence',
    ...timestampEvidence.map(item => `- ${item.timestamp || 'no timestamp'} ${item.speaker ? `${item.speaker}: ` : ''}${item.text}`),
  ].join('\n');
  return {
    kind: 'meeting-transcript',
    path: `meetings/${safeName.replace(/\.[^.]+$/, '')}.meeting.md`,
    title: `Meeting Intake: ${safeName}`,
    content,
    evidenceCount: timestampEvidence.length,
  };
}

function formatMeetingItems(items) {
  if (!items.length) return ['- None recorded.'];
  return items.map(item => `- ${item.timestamp || 'no timestamp'} ${item.text}`);
}

function buildTimestampEvidence(item, safeName) {
  return {
    id: stableId(`${safeName}:${item.line}:${item.timestamp}:${item.text}`),
    timestamp: item.timestamp,
    speaker: item.speaker,
    text: item.text,
    source: {
      filename: safeName,
      line: item.line,
    },
  };
}

function normalizeTimestamp(timestamp) {
  const parts = timestamp.split(':');
  return parts.length === 2 ? `00:${parts[0]}:${parts[1]}` : parts.map(part => part.padStart(2, '0')).join(':');
}

function normalizeSafePath(value) {
  const normalized = String(value || '').replaceAll('\\', '/').trim();
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0') || normalized.split('/').includes('..')) {
    throw Object.assign(new Error('unsafe document path'), { statusCode: 400 });
  }
  return path.posix.normalize(normalized);
}

function sanitizeFilename(value) {
  const filename = path.basename(String(value || 'meeting-transcript.txt').replaceAll('\\', '/')).replace(/[^\w .-]/g, '_').trim();
  return filename || 'meeting-transcript.txt';
}

function tokenize(text) {
  const rawTokens = String(text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const tokens = [];
  for (const token of rawTokens) {
    if (/\p{Script=Han}/u.test(token)) {
      const characters = [...token];
      if (characters.length === 1) tokens.push(token);
      for (let index = 0; index < characters.length - 1; index += 1) tokens.push(characters.slice(index, index + 2).join(''));
      if (characters.length > 2) tokens.push(token);
      continue;
    }
    if (token.length > 1 && !STOP_WORDS.has(token)) tokens.push(token);
  }
  return tokens;
}

function characterNgrams(text) {
  const compact = String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const ngrams = [];
  for (const token of compact.split(/\s+/).filter(Boolean)) {
    if (token.length <= 3) {
      ngrams.push(`char:${token}`);
      continue;
    }
    for (let index = 0; index <= token.length - 3; index += 1) {
      ngrams.push(`char:${token.slice(index, index + 3)}`);
    }
  }
  return ngrams;
}

function countTerms(terms) {
  return terms.reduce((counts, term) => {
    counts[term] = (counts[term] || 0) + 1;
    return counts;
  }, {});
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function roundScore(value) {
  return Math.round((Number(value) || 0) * 1_000_000) / 1_000_000;
}

function stableId(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

function hashNumber(value) {
  return crypto.createHash('sha256').update(String(value)).digest().readUInt32BE(0);
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
