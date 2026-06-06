import { mkdir, readFile, readdir, stat, writeFile, unlink } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { sanitizeUploadPath, safeJoin } from '../utils/pathSecurity.js';

const INDEX_DIR = '.openprism';
const INDEX_FILE = 'paper-rag-index.json';
const CORPUS_DIR = 'research_corpus';
const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.tex', '.bib', '.json', '.csv', '.xml', '.html', '.yaml', '.yml', '.pdf', '.docx', '.doc']);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const CHUNK_WORDS = 120;
const CHUNK_OVERLAP = 30;

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
    if (info.size > MAX_FILE_BYTES) continue;
    const content = await readFile(absolutePath, 'utf-8');
    const document = {
      id: stableId(filePath),
      path: filePath,
      title: inferTitle(content, filePath),
      bytes: info.size,
      mtimeMs: info.mtimeMs,
    };
    documents.push(document);
    chunks.push(...chunkDocument(document, content));
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
  const results = await searchCorpus(projectRoot, query, options);
  if (results.length === 0) return '';
  return results.map((item, index) => {
    const source = item.source.lineStart
      ? `${item.source.path}:L${item.source.lineStart}-L${item.source.lineEnd}`
      : item.source.path;
    return `[${index + 1}] ${source}\n${item.text}`;
  }).join('\n\n');
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
      } else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(relativePath);
      }
    }
    return files;
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
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
  const mdPath = fullPath + '.md';
  try { await unlink(mdPath); } catch { /* not required */ }

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