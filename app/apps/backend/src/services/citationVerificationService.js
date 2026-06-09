/**
 * Citation Verification Service
 * 对 .bib 文件和 .tex 文档中的引用进行真实性验证
 * 对接 CrossRef / Semantic Scholar / OpenAlex / arXiv 四大 API
 *
 * 修复记录:
 * - Fix #1: arXiv DOI (10.48550) 不被 CrossRef 支持 → 增加 arXiv API 数据源
 * - Fix #2: 标题搜索误报严重 → 增加编辑距离相似度阈值 (≥0.75) + 年份校验
 * - Fix #3: Semantic Scholar 429 限流 → 请求队列串行化 (间隔 1.2s) + 指数退避重试
 */
 
const CROSSREF_API = 'https://api.crossref.org/works';
const SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1/paper';
const OPENALEX_API = 'https://api.openalex.org/works';
const ARXIV_API = 'http://export.arxiv.org/api/query';
 
const TITLE_SIMILARITY_THRESHOLD = 0.75; // 标题相似度阈值
const S2_MIN_INTERVAL_MS = 1200;         // S2 最小请求间隔
const S2_MAX_RETRIES = 3;                // S2 最大重试次数
 
// ── 编辑距离 / 标题相似度 ────────────────────────────────────────
 
/**
 * 计算两个字符串的 Levenshtein 编辑距离
 */
function levenshtein(a, b) {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  const matrix = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) matrix[i][0] = i;
  for (let j = 0; j <= lb; j++) matrix[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[la][lb];
}
 
/**
 * 标准化标题用于比较：转小写、去除标点/多余空格、去 "the"/"a"/"an"
 */
function normalizeTitle(t) {
  return (t || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(the|a|an)\b/g, '')
    .trim();
}
 
/**
 * 计算两个标题的相似度 (0~1)
 * 使用归一化编辑距离: 1 - Levenshtein / max(len1, len2)
 */
export function titleSimilarity(title1, title2) {
  const a = normalizeTitle(title1);
  const b = normalizeTitle(title2);
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}
 
// ── S2 请求队列（限流 + 重试）────────────────────────────────────
 
let s2LastRequestTime = 0;
const s2ApiKey = process.env.SEMANTIC_SCHOLAR_API_KEY || '';
 
/**
 * Semantic Scholar 带限流的 fetch
 * 串行队列，最小间隔 1.2s，429 时指数退避重试
 */
async function s2Fetch(url, retryCount = 0) {
  // 等待最小间隔
  const now = Date.now();
  const elapsed = now - s2LastRequestTime;
  if (elapsed < S2_MIN_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, S2_MIN_INTERVAL_MS - elapsed));
  }
  s2LastRequestTime = Date.now();
 
  const headers = { 'Accept': 'application/json' };
  if (s2ApiKey) headers['x-api-key'] = s2ApiKey;
 
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (res.status === 429 && retryCount < S2_MAX_RETRIES) {
      const backoffMs = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
      await new Promise(r => setTimeout(r, backoffMs));
      return s2Fetch(url, retryCount + 1);
    }
    return res;
  } catch (e) {
    if (retryCount < S2_MAX_RETRIES) {
      await new Promise(r => setTimeout(r, Math.pow(2, retryCount) * 1000));
      return s2Fetch(url, retryCount + 1);
    }
    throw e;
  }
}
 
// ── BibTeX 解析 ──────────────────────────────────────────────────
 
/**
 * 解析 .bib 文件为结构化条目数组
 * @param {string} bibContent — BibTeX 文件内容
 * @returns {Array<{ key, type, fields }>}
 */
export function parseBibTeX(bibContent) {
  const entries = [];
  // 匹配 @type{key, ... } 或 @type{key\n...\n}
  const entryRegex = /@(\w+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)(?=\n\s*@|\s*$)/g;
  let match;
 
  while ((match = entryRegex.exec(bibContent)) !== null) {
    const [, type, key, body] = match;
    const fields = {};
 
    // 匹配 field = {value} 或 field = "value"
    const fieldRegex = /(\w+)\s*=\s*\{([\s\S]*?)\}|(\w+)\s*=\s*"([\s\S]*?)"/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
      const fieldName = (fieldMatch[1] || fieldMatch[3]).toLowerCase();
      const fieldValue = (fieldMatch[2] || fieldMatch[4] || '').trim();
      fields[fieldName] = fieldValue;
    }
 
    entries.push({ key, type: type.toLowerCase(), fields });
  }
 
  return entries;
}
 
/**
 * 从 .tex 内容中提取所有 \cite{...} 引用键
 * @param {string} texContent
 * @returns {string[]} 引用键数组（去重）
 */
export function extractCiteKeys(texContent) {
  const keys = new Set();
  // \cite{key1,key2}, \citep{key}, \citet{key}, \citealp{key}, etc.
  const regex = /\\cite[tp]?\*?(?:\[[^\]]*\])?\{([^}]+)\}/g;
  let m;
  while ((m = regex.exec(texContent)) !== null) {
    m[1].split(',').map(k => k.trim()).filter(Boolean).forEach(k => keys.add(k));
  }
  return [...keys];
}
 
// ── arXiv DOI 工具 ───────────────────────────────────────────────
 
/**
 * 检测是否为 arXiv DOI (10.48550/arXiv.*)
 */
function isArxivDoi(doi) {
  return /^10\.48550\/arXiv\./i.test(doi);
}
 
/**
 * 从 arXiv DOI 中提取 arXiv ID
 * "10.48550/arXiv.1706.03762" → "1706.03762"
 */
function extractArxivIdFromDoi(doi) {
  const match = doi.match(/^10\.48550\/arXiv\.(.+)$/i);
  return match ? match[1] : null;
}
 
// ── API 验证 ─────────────────────────────────────────────────────
 
/**
 * 通过 DOI 在 CrossRef 验证
 * @returns {{ verified: boolean, title?: string, year?: number, journal?: string, doi?: string, source: string, similarity?: number }}
 */
async function verifyViaCrossRef(doi) {
  try {
    const res = await fetch(`${CROSSREF_API}/${encodeURIComponent(doi)}`, {
      headers: { 'User-Agent': 'PaperAgent/1.0 (mailto:verify@paperagent.dev)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { verified: false, source: 'crossref', error: `HTTP ${res.status}` };
    const data = await res.json();
    const item = data.message;
    const title = Array.isArray(item.title) ? item.title[0] : item.title;
    const year = item.published?.['date-parts']?.[0]?.[0]
      || item['published-print']?.['date-parts']?.[0]?.[0]
      || item['published-online']?.['date-parts']?.[0]?.[0]
      || null;
    const journal = Array.isArray(item['container-title']) ? item['container-title'][0] : item['container-title'];
    return { verified: true, title, year, journal, doi: item.DOI, source: 'crossref' };
  } catch (e) {
    return { verified: false, source: 'crossref', error: e.message };
  }
}
 
/**
 * 通过 DOI 在 Semantic Scholar 验证（带限流队列）
 */
async function verifyViaSemanticScholar(doi) {
  try {
    const res = await s2Fetch(
      `${SEMANTIC_SCHOLAR_API}/DOI:${encodeURIComponent(doi)}?fields=title,year,venue,externalIds`
    );
    if (!res.ok) return { verified: false, source: 'semantic-scholar', error: `HTTP ${res.status}` };
    const data = await res.json();
    return {
      verified: !!data.paperId,
      title: data.title,
      year: data.year,
      journal: data.venue,
      doi: data.externalIds?.DOI,
      source: 'semantic-scholar',
    };
  } catch (e) {
    return { verified: false, source: 'semantic-scholar', error: e.message };
  }
}
 
/**
 * [Fix #1] 通过 arXiv API 验证
 * 从 arXiv DOI 提取 ID → 调用 arXiv Atom API → 解析 XML
 * @returns {{ verified: boolean, title?: string, year?: number, authors?: string[], source: string }}
 */
async function verifyViaArxiv(doi) {
  try {
    const arxivId = extractArxivIdFromDoi(doi);
    if (!arxivId) return { verified: false, source: 'arxiv', error: 'Cannot extract arXiv ID from DOI' };
 
    const res = await fetch(`${ARXIV_API}?id_list=${encodeURIComponent(arxivId)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { verified: false, source: 'arxiv', error: `HTTP ${res.status}` };
 
    const xml = await res.text();
    // 简单 XML 解析：提取 <entry> 中的 title, published, author
    const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entryMatch) return { verified: false, source: 'arxiv', error: 'No entry found in response' };
 
    const entry = entryMatch[1];
    const title = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/\s+/g, ' ').trim();
    const published = (entry.match(/<published>(.*?)<\/published>/) || [])[1];
    const year = published ? parseInt(published.substring(0, 4)) : null;
    const authors = [...entry.matchAll(/<author>\s*<name>(.*?)<\/name>/g)].map(m => m[1].trim());
 
    return {
      verified: true,
      title,
      year,
      authors,
      source: 'arxiv',
    };
  } catch (e) {
    return { verified: false, source: 'arxiv', error: e.message };
  }
}
 
/**
 * [Fix #2] 通过标题在 OpenAlex 搜索 + 相似度校验
 * @param {string} title — BibTeX 中的标题
 * @param {number|null} bibYear — BibTeX 中的年份（可选，用于交叉验证）
 */
async function verifyViaOpenAlex(title, bibYear) {
  try {
    const res = await fetch(
      `${OPENALEX_API}?search=${encodeURIComponent(title)}&per_page=5&select=id,title,publication_year,primary_location,doi`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return { verified: false, source: 'openalex', error: `HTTP ${res.status}` };
    const data = await res.json();
    const results = data.results || [];
    if (results.length === 0) return { verified: false, source: 'openalex', matched: 0 };
 
    // [Fix #2] 找到最高相似度的结果
    let bestMatch = null;
    let bestSimilarity = 0;
    for (const r of results) {
      const sim = titleSimilarity(title, r.title);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestMatch = r;
      }
    }
 
    // [Fix #2] 相似度低于阈值 → 不算 verified
    if (bestSimilarity < TITLE_SIMILARITY_THRESHOLD) {
      return { verified: false, source: 'openalex', bestSimilarity, bestTitle: bestMatch?.title, error: `Similarity ${bestSimilarity.toFixed(2)} < threshold ${TITLE_SIMILARITY_THRESHOLD}` };
    }
 
    // [Fix #2] 年份交叉校验（如果有 bibYear）
    if (bibYear && bestMatch?.publication_year && Math.abs(bibYear - bestMatch.publication_year) > 1) {
      return { verified: false, source: 'openalex', bestSimilarity, error: `Year mismatch: bib=${bibYear}, api=${bestMatch.publication_year}` };
    }
 
    return {
      verified: true,
      title: bestMatch.title,
      year: bestMatch.publication_year,
      journal: bestMatch.primary_location?.source?.display_name,
      doi: bestMatch.doi?.replace('https://doi.org/', ''),
      source: 'openalex',
      bestSimilarity,
      matched: results.length,
    };
  } catch (e) {
    return { verified: false, source: 'openalex', error: e.message };
  }
}
 
/**
 * [Fix #2] 通过标题在 CrossRef 搜索 + 相似度校验
 * @param {string} title — BibTeX 中的标题
 * @param {number|null} bibYear — BibTeX 中的年份
 */
async function searchCrossRefByTitle(title, bibYear) {
  try {
    const res = await fetch(
      `${CROSSREF_API}?query.title=${encodeURIComponent(title)}&rows=5&select=DOI,title,author,container-title,published-print,published-online`,
      {
        headers: { 'User-Agent': 'PaperAgent/1.0 (mailto:verify@paperagent.dev)' },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return { verified: false, source: 'crossref-search', error: `HTTP ${res.status}` };
    const data = await res.json();
    const items = data.message?.items || [];
    if (items.length === 0) return { verified: false, source: 'crossref-search', matched: 0 };
 
    // [Fix #2] 遍历结果找最高相似度
    let bestMatch = null;
    let bestSimilarity = 0;
    for (const item of items) {
      const bestTitle = Array.isArray(item.title) ? item.title[0] : item.title;
      const sim = titleSimilarity(title, bestTitle);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestMatch = item;
      }
    }
 
    // [Fix #2] 相似度低于阈值 → 不算 verified
    if (bestSimilarity < TITLE_SIMILARITY_THRESHOLD) {
      return { verified: false, source: 'crossref-search', bestSimilarity, error: `Similarity ${bestSimilarity.toFixed(2)} < threshold ${TITLE_SIMILARITY_THRESHOLD}` };
    }
 
    const bestTitle = Array.isArray(bestMatch.title) ? bestMatch.title[0] : bestMatch.title;
    const year = bestMatch.published?.['date-parts']?.[0]?.[0] || bestMatch['published-online']?.['date-parts']?.[0]?.[0] || null;
    const journal = Array.isArray(bestMatch['container-title']) ? bestMatch['container-title'][0] : bestMatch['container-title'];
 
    // [Fix #2] 年份交叉校验
    if (bibYear && year && Math.abs(bibYear - year) > 1) {
      return { verified: false, source: 'crossref-search', bestSimilarity, error: `Year mismatch: bib=${bibYear}, api=${year}` };
    }
 
    return {
      verified: true,
      title: bestTitle,
      year,
      journal,
      doi: bestMatch.DOI,
      source: 'crossref-search',
      bestSimilarity,
      matched: items.length,
    };
  } catch (e) {
    return { verified: false, source: 'crossref-search', error: e.message };
  }
}
 
// ── 综合验证逻辑 ─────────────────────────────────────────────────
 
/**
 * 验证单个 BibTeX 条目
 * 策略:
 *   有 DOI → 检测是否 arXiv DOI → arXiv API / CrossRef + S2 (串行队列)
 *   无 DOI → CrossRef 标题搜索 + OpenAlex 标题搜索（均带相似度校验 + 年份校验）
 * @returns {CitationResult}
 */
export async function verifyCitation(entry) {
  const { key, type, fields } = entry;
  const doi = fields.doi || null;
  const title = fields.title || null;
  const bibYear = fields.year ? parseInt(fields.year) : null;
 
  // 1. 如果有 DOI，先用 DOI 验证
  if (doi) {
    // [Fix #1] 检测 arXiv DOI → 走 arXiv API
    if (isArxivDoi(doi)) {
      const arxivResult = await verifyViaArxiv(doi);
      if (arxivResult.verified) {
        // 额外用标题校验 arXiv 返回的标题
        const sim = title ? titleSimilarity(title, arxivResult.title) : 1;
        const confidence = sim >= TITLE_SIMILARITY_THRESHOLD ? 'high' : sim >= 0.5 ? 'medium' : 'low';
        return {
          key, type, doi, title,
          status: 'verified',
          confidence,
          sources: [arxivResult],
          matchedTitle: arxivResult.title,
          matchedYear: arxivResult.year,
          matchedJournal: 'arXiv',
          bestSimilarity: sim,
        };
      }
      // arXiv 也找不到 → 标记为 doi_not_found
      return {
        key, type, doi, title,
        status: 'doi_not_found',
        confidence: 'none',
        sources: [arxivResult],
      };
    }
 
    // [Fix #3] 非 arXiv DOI → CrossRef + S2（S2 走限流队列，串行执行）
    const crossref = await verifyViaCrossRef(doi);
    const s2 = await verifyViaSemanticScholar(doi);
 
    // 两个 API 都确认存在
    if (crossref.verified && s2.verified) {
      return {
        key, type, doi, title,
        status: 'verified',
        confidence: 'high',
        sources: [crossref, s2],
        matchedTitle: crossref.title,
        matchedYear: crossref.year,
        matchedJournal: crossref.journal,
      };
    }
    // 至少一个确认
    if (crossref.verified || s2.verified) {
      const v = crossref.verified ? crossref : s2;
      return {
        key, type, doi, title,
        status: 'verified',
        confidence: 'medium',
        sources: [crossref, s2],
        matchedTitle: v.title,
        matchedYear: v.year,
        matchedJournal: v.journal,
      };
    }
    // DOI 存在但两个 API 都找不到 → 可能是假 DOI
    return {
      key, type, doi, title,
      status: 'doi_not_found',
      confidence: 'none',
      sources: [crossref, s2],
    };
  }
 
  // 2. 没有 DOI，用标题搜索（带相似度校验 + 年份校验）
  if (title) {
    const [crSearch, oalex] = await Promise.all([
      searchCrossRefByTitle(title, bibYear),
      verifyViaOpenAlex(title, bibYear),
    ]);
 
    // 两个都确认且相似度高
    if (crSearch.verified && oalex.verified) {
      return {
        key, type, doi: crSearch.doi || oalex.doi, title,
        status: 'title_match',
        confidence: 'medium',
        sources: [crSearch, oalex],
        matchedTitle: crSearch.title,
        matchedYear: crSearch.year,
        matchedJournal: crSearch.journal,
        bestSimilarity: Math.max(crSearch.bestSimilarity || 0, oalex.bestSimilarity || 0),
      };
    }
    if (crSearch.verified) {
      return {
        key, type, doi: crSearch.doi, title,
        status: 'title_match',
        confidence: 'low',
        sources: [crSearch],
        matchedTitle: crSearch.title,
        matchedYear: crSearch.year,
        matchedJournal: crSearch.journal,
        bestSimilarity: crSearch.bestSimilarity,
      };
    }
    if (oalex.verified) {
      return {
        key, type, doi: oalex.doi, title,
        status: 'title_match',
        confidence: 'low',
        sources: [oalex],
        matchedTitle: oalex.title,
        matchedYear: oalex.year,
        matchedJournal: oalex.journal,
        bestSimilarity: oalex.bestSimilarity,
      };
    }
  }
 
  // 3. 无法验证
  return {
    key, type, doi, title,
    status: 'unverifiable',
    confidence: 'none',
    sources: [],
  };
}
 
/**
 * 批量验证 BibTeX 条目
 * [Fix #3] 串行验证以避免 S2 429 限流，DOI 条目间自动节流
 * @param {string} bibContent — BibTeX 文件内容
 * @param {object} options — { concurrency, onProgress }
 * @returns {VerificationReport}
 */
export async function verifyBibFile(bibContent, options = {}) {
  const { onProgress } = options;
  const entries = parseBibTeX(bibContent);
 
  if (entries.length === 0) {
    return {
      totalEntries: 0,
      verified: 0,
      titleMatch: 0,
      doiNotFound: 0,
      unverifiable: 0,
      results: [],
      summary: 'No BibTeX entries found.',
    };
  }
 
  const results = [];
  // [Fix #3] 串行验证，避免 S2 429；S2 内部已有 1.2s 间隔队列
  for (const entry of entries) {
    const result = await verifyCitation(entry);
    results.push(result);
    onProgress?.({ done: results.length, total: entries.length });
  }
 
  const verified = results.filter(r => r.status === 'verified').length;
  const titleMatch = results.filter(r => r.status === 'title_match').length;
  const doiNotFound = results.filter(r => r.status === 'doi_not_found').length;
  const unverifiable = results.filter(r => r.status === 'unverifiable').length;
 
  return {
    totalEntries: entries.length,
    verified,
    titleMatch,
    doiNotFound,
    unverifiable,
    results,
    summary: `Verified ${verified}/${entries.length} entries by DOI, ${titleMatch} by title match, ${doiNotFound} DOI not found, ${unverifiable} unverifiable.`,
  };
}
 
/**
 * 验证 .tex 文档中的引用是否都有对应的 .bib 条目
 * @param {string} texContent — .tex 文件内容
 * @param {string} bibContent — .bib 文件内容
 * @returns {{ citedKeys: string[], bibKeys: string[], missingInBib: string[], uncitedInBib: string[] }}
 */
export function crossCheckCitations(texContent, bibContent) {
  const citedKeys = extractCiteKeys(texContent);
  const bibEntries = parseBibTeX(bibContent);
  const bibKeys = bibEntries.map(e => e.key);
 
  const bibKeySet = new Set(bibKeys);
  const citeKeySet = new Set(citedKeys);
 
  const missingInBib = citedKeys.filter(k => !bibKeySet.has(k));
  const uncitedInBib = bibKeys.filter(k => !citeKeySet.has(k));
 
  return { citedKeys, bibKeys, missingInBib, uncitedInBib };
}
 
/**
 * 从 .tex 内容中提取引用并验证
 * @param {string} texContent
 * @param {string} bibContent
 * @param {object} options
 * @returns {VerificationReport & crossCheck}
 */
export async function verifyTexCitations(texContent, bibContent, options = {}) {
  const crossCheck = crossCheckCitations(texContent, bibContent);
 
  // 只验证 .tex 中实际引用的条目
  const bibEntries = parseBibTeX(bibContent);
  const citedEntries = bibEntries.filter(e => crossCheck.citedKeys.includes(e.key));
  const uncitedEntries = bibEntries.filter(e => crossCheck.uncitedInBib.includes(e.key));
 
  const results = [];
  const { concurrency = 5, onProgress } = options;
 
  // 验证被引用的条目
  for (let i = 0; i < citedEntries.length; i += concurrency) {
    const batch = citedEntries.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(e => verifyCitation(e)));
    results.push(...batchResults);
    onProgress?.({ done: results.length, total: citedEntries.length });
  }
 
  return {
    ...crossCheck,
    totalEntries: citedEntries.length,
    verified: results.filter(r => r.status === 'verified').length,
    titleMatch: results.filter(r => r.status === 'title_match').length,
    doiNotFound: results.filter(r => r.status === 'doi_not_found').length,
    unverifiable: results.filter(r => r.status === 'unverifiable').length,
    results,
    summary: `Cited: ${citedEntries.length}, Verified: ${results.filter(r => r.status === 'verified').length}, Missing in .bib: ${crossCheck.missingInBib.length}, Uncited in .bib: ${crossCheck.uncitedInBib.length}`,
  };
}
 
