/**
 * MCP (Model Context Protocol) Server
 * 将 Paper Agent 核心能力暴露为标准 MCP 工具，
 * 供外部 AI Agent（Claude Code / Cursor / Copilot）调用。
 *
 * 支持两种传输:
 *   - JSON-RPC over HTTP POST  (/api/mcp)
 *   - SSE streaming            (/api/mcp/sse)
 */
 
import { chatCompletion } from './llmService.js';
import { verifyBibFile, parseBibTeX, extractCiteKeys, crossCheckCitations } from './citationVerificationService.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
 
// ── MCP 工具定义 ─────────────────────────────────────────────────
 
const MCP_TOOLS = [
  {
    name: 'paper_search',
    description: 'Search academic papers via CrossRef API. Returns title, authors, year, DOI, journal.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (keywords, title, author, etc.)' },
        maxResults: { type: 'number', description: 'Max results to return (default 5, max 20)', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'verify_citations',
    description: 'Verify BibTeX entries against CrossRef, Semantic Scholar, and OpenAlex. Returns verification status for each entry.',
    inputSchema: {
      type: 'object',
      properties: {
        bibtex: { type: 'string', description: 'BibTeX content to verify (the raw .bib file content)' },
      },
      required: ['bibtex'],
    },
  },
  {
    name: 'cross_check_citations',
    description: 'Cross-check \\cite{} commands in .tex content against .bib entries. Finds missing and uncited entries.',
    inputSchema: {
      type: 'object',
      properties: {
        texContent: { type: 'string', description: 'LaTeX content to check for \\cite{} commands' },
        bibContent: { type: 'string', description: 'BibTeX content to cross-check against' },
      },
      required: ['texContent', 'bibContent'],
    },
  },
  {
    name: 'compile_latex',
    description: 'Compile a LaTeX project to PDF. Returns compilation log and PDF path.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Absolute path to the project directory' },
        mainFile: { type: 'string', description: 'Main .tex file (default: main.tex)', default: 'main.tex' },
        engine: { type: 'string', description: 'Compilation engine: pdflatex, xelatex, lualatex, latexmk, tectonic (default: auto)', default: 'auto' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'read_project_file',
    description: 'Read a file from a Paper Agent project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Absolute path to the project directory' },
        filePath: { type: 'string', description: 'Relative path to the file within the project' },
      },
      required: ['projectPath', 'filePath'],
    },
  },
  {
    name: 'ai_polish',
    description: 'Polish academic writing using LLM. Improves clarity, grammar, and publication quality.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Text content to polish' },
        language: { type: 'string', description: 'Target language: en, zh (default: en)', default: 'en' },
      },
      required: ['content'],
    },
  },
  {
    name: 'ai_review',
    description: 'Perform automated peer review on manuscript content. Returns structured review with scores.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Manuscript content to review' },
      },
      required: ['content'],
    },
  },
];
 
// ── 工具执行器 ───────────────────────────────────────────────────
 
async function searchPapers(query, maxResults = 5) {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${Math.min(maxResults, 20)}&select=DOI,title,author,container-title,published-print,published-online,volume,issue,page,type,abstract,URL`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PaperAgent-MCP/1.0 (mailto:mcp@paperagent.dev)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`CrossRef API error: ${res.status}`);
  const data = await res.json();
  const items = data.message?.items || [];
 
  return items.map(item => {
    const title = Array.isArray(item.title) ? item.title[0] : item.title;
    const year = item.published?.['date-parts']?.[0]?.[0] || item['published-online']?.['date-parts']?.[0]?.[0] || null;
    const journal = Array.isArray(item['container-title']) ? item['container-title'][0] : item['container-title'];
    const authors = (item.author || []).map(a => `${a.family || ''}, ${a.given || ''}`).join('; ');
    return { title, authors, year, journal, doi: item.DOI, url: item.URL, volume: item.volume, pages: item.page };
  });
}
 
async function executeTool(name, args) {
  switch (name) {
    case 'paper_search':
      return await searchPapers(args.query, args.maxResults || 5);
 
    case 'verify_citations': {
      const report = await verifyBibFile(args.bibtex, { concurrency: 5 });
      return report;
    }
 
    case 'cross_check_citations':
      return crossCheckCitations(args.texContent, args.bibContent);
 
    case 'compile_latex': {
      const { runCompile } = await import('./compileService.js');
      const result = await runCompile({
        projectId: args.projectPath,
        mainFile: args.mainFile || 'main.tex',
        engine: args.engine || 'auto',
      });
      return result;
    }
 
    case 'read_project_file': {
      const filePath = join(args.projectPath, args.filePath);
      const content = await readFile(filePath, 'utf-8');
      return { content, filePath: args.filePath };
    }
 
    case 'ai_polish': {
      const lang = args.language === 'zh' ? 'Chinese' : 'English';
      const response = await chatCompletion({
        systemPrompt: `You are a professional academic writing editor. Polish the following ${lang} text for publication quality. Improve clarity, grammar, conciseness, and academic tone. Return ONLY the polished text, no explanations.`,
        messages: [{ role: 'user', content: args.content }],
      });
      const textBlock = response.content.find(b => b.type === 'text');
      return { polished: textBlock?.text || '' };
    }
 
    case 'ai_review': {
      const response = await chatCompletion({
        systemPrompt: `You are a peer reviewer for a top academic conference. Review the following manuscript content. Provide:
1. Overall score (0-100)
2. Decision: accept / minor_revision / major_revision / reject
3. Key strengths (3-5 bullet points)
4. Key weaknesses (3-5 bullet points)
5. Specific suggestions for improvement
Return as structured JSON.`,
        messages: [{ role: 'user', content: args.content }],
      });
      const textBlock = response.content.find(b => b.type === 'text');
      const text = textBlock?.text || '{}';
      try {
        // Try to extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };
      } catch {
        return { raw: text };
      }
    }
 
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
 
// ── JSON-RPC 处理 ────────────────────────────────────────────────
 
/**
 * 处理 MCP JSON-RPC 请求
 */
export async function handleMcpRequest(body) {
  const { jsonrpc = '2.0', method, params, id } = body;
 
  // MCP 协议要求响应 jsonrpc: "2.0"
  const rpcVersion = '2.0';
 
  try {
    let result;
 
    switch (method) {
      case 'initialize':
        // MCP 初始化握手
        result = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: 'paper-agent',
            version: '1.0.0',
          },
        };
        break;
 
      case 'notifications/initialized':
        // 客户端确认初始化完成，无需响应
        return null;
 
      case 'tools/list':
        result = { tools: MCP_TOOLS };
        break;
 
      case 'tools/call': {
        const { name, arguments: args } = params || {};
        if (!name) throw new Error('Missing tool name');
        const toolResult = await executeTool(name, args || {});
        result = {
          content: [{ type: 'text', text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2) }],
        };
        break;
      }
 
      default:
        throw new Error(`Method not found: ${method}`);
    }
 
    return { jsonrpc: rpcVersion, id, result };
  } catch (error) {
    return {
      jsonrpc: rpcVersion,
      id,
      error: { code: -32603, message: error.message },
    };
  }
}
 
