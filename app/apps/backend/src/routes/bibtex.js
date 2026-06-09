/**
 * BibTeX Search Routes
 * 学术文献搜索服务，支持 CrossRef API
 */
 
const CROSSREF_API = 'https://api.crossref.org/works';
 
/**
 * 搜索学术论文
 * GET /api/bibtex/search?q=keyword&rows=10
 */
async function searchCrossRef(query, rows = 10) {
  const url = `${CROSSREF_API}?query=${encodeURIComponent(query)}&rows=${rows}&select=DOI,title,author,container-title,published-print,published-online,volume,issue,page,type,abstract,URL`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'PaperWriter/1.0 (mailto:paperwriter@example.com)'
    }
  });
  
  if (!response.ok) {
    throw new Error(`CrossRef API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.message?.items || [];
}
 
/**
 * 格式化作者列表
 */
function formatAuthors(authors) {
  if (!authors || authors.length === 0) return 'Unknown';
  if (authors.length === 1) return authors[0].family || authors[0].given || 'Unknown';
  if (authors.length === 2) return `${authors[0].family || 'Unknown'} & ${authors[1].family || 'Unknown'}`;
  return `${authors[0].family || 'Unknown'} et al.`;
}
 
/**
 * 格式化年份
 */
function formatYear(published) {
  if (!published) return 'n.d.';
  const dateParts = published['date-parts']?.[0] || published['published-print']?.['date-parts']?.[0] || published['published-online']?.['date-parts']?.[0];
  return dateParts ? dateParts[0] : 'n.d.';
}
 
/**
 * 生成 BibTeX 条目
 */
function generateBibtex(item) {
  const doi = item.DOI?.replace(/\//g, '_') || '';
  const firstAuthor = item.author?.[0]?.family?.toLowerCase() || 'unknown';
  const year = formatYear(item.published);
  const type = item.type || 'article';
  
  // 生成 cite key
  const citeKey = `${firstAuthor}${year}`;
  
  // 格式化作者
  const authors = item.author?.map(a => {
    const family = a.family || '';
    const given = a.given ? `, ${a.given}` : '';
    return `${family}${given}`;
  }).join(' and ') || 'Unknown';
  
  // 格式化标题
  const title = Array.isArray(item.title) ? item.title[0] : item.title || '';
  
  // 期刊名
  const journal = Array.isArray(item['container-title']) ? item['container-title'][0] : item['container-title'] || '';
  
  // 卷期页
  const volume = item.volume || '';
  const issue = item.issue || '';
  const page = item.page || '';
  
  let bibtex = `@${type}{${citeKey},\n`;
  bibtex += `  author = {${authors}},\n`;
  bibtex += `  title = {${title}},\n`;
  if (journal) bibtex += `  journal = {${journal}},\n`;
  if (year !== 'n.d.') bibtex += `  year = {${year}},\n`;
  if (volume) bibtex += `  volume = {${volume}},\n`;
  if (issue) bibtex += `  number = {${issue}},\n`;
  if (page) bibtex += `  pages = {${page}},\n`;
  if (item.DOI) bibtex += `  doi = {${item.DOI}},\n`;
  if (item.URL) bibtex += `  url = {${item.URL}},\n`;
  bibtex = bibtex.replace(/,\n$/, '\n');
  bibtex += `}`;
  
  return bibtex;
}
 
/**
 * 转换为补全选项格式
 */
function toCompletionOption(item) {
  const doi = item.DOI || '';
  const firstAuthor = item.author?.[0]?.family || 'Unknown';
  const year = formatYear(item.published);
  const title = Array.isArray(item.title) ? item.title[0] : item.title || 'Untitled';
  const journal = Array.isArray(item['container-title']) ? item['container-title'][0] : item['container-title'] || '';
  
  const label = `@${firstAuthor.toLowerCase()}${year}`;
  const detail = `${title.substring(0, 60)}${title.length > 60 ? '...' : ''}`;
  const info = [
    `Authors: ${formatAuthors(item.author)}`,
    `Year: ${year}`,
    journal ? `Journal: ${journal}` : '',
    doi ? `DOI: ${doi}` : '',
  ].filter(Boolean).join('\n');
  
  return {
    label,
    detail,
    info,
    bibtex: generateBibtex(item),
    doi,
    title,
    authors: formatAuthors(item.author),
    year,
    journal,
  };
}
 
export function registerBibtexRoutes(fastify) {
  // 搜索学术论文
  fastify.get('/api/bibtex/search', async (request) => {
    const { q, rows = 10 } = request.query;
    
    if (!q || q.trim().length < 2) {
      return { items: [], error: 'Query must be at least 2 characters' };
    }
    
    try {
      const results = await searchCrossRef(q.trim(), Math.min(parseInt(rows) || 10, 20));
      const items = results.map(toCompletionOption);
      return { items };
    } catch (error) {
      fastify.log.error(error, 'BibTeX search failed');
      return { items: [], error: error.message };
    }
  });
  
  // 获取 BibTeX 条目详情
  fastify.get('/api/bibtex/bibtex', async (request) => {
    const { doi } = request.query;
    
    if (!doi) {
      return { bibtex: null, error: 'DOI is required' };
    }
    
    try {
      const url = `${CROSSREF_API}/${encodeURIComponent(doi)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'PaperWriter/1.0 (mailto:paperwriter@example.com)'
        }
      });
      
      if (!response.ok) {
        throw new Error(`CrossRef API error: ${response.status}`);
      }
      
      const data = await response.json();
      const item = data.message;
      
      return { bibtex: generateBibtex(item) };
    } catch (error) {
      fastify.log.error(error, 'BibTeX fetch failed');
      return { bibtex: null, error: error.message };
    }
  });
  
  // 格式化本地 BibTeX 文件中的引用
  fastify.post('/api/bibtex/format', async (request) => {
    const { bibtex } = request.body;
    
    if (!bibtex) {
      return { formatted: '', error: 'BibTeX content is required' };
    }
    
    // 简单的格式化处理
    const formatted = bibtex
      .split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('@') || trimmed === '}') return line;
        // 缩进字段
        return '  ' + line.trim();
      })
      .join('\n');
    
    return { formatted };
  });
}
