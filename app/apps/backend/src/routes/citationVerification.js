/**
 * Citation Verification Routes
 * 引用验证 API — 验证 .bib 和 .tex 中的引用真实性
 */
 
import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  parseBibTeX,
  extractCiteKeys,
  verifyBibFile,
  verifyTexCitations,
  crossCheckCitations,
} from '../services/citationVerificationService.js';
 
/**
 * 注册引用验证路由
 * @param {import('fastify').FastifyInstance} fastify
 */
export function registerCitationVerificationRoutes(fastify) {
  /**
   * POST /api/citations/verify
   * 验证 .bib 文件中的所有条目
   * Body: { projectPath: string, bibFile?: string }
   */
  fastify.post('/api/citations/verify', async (request, reply) => {
    const { projectPath, bibFile = 'references.bib' } = request.body || {};
    if (!projectPath) {
      return reply.code(400).send({ error: 'projectPath is required' });
    }
 
    let bibContent;
    try {
      bibContent = await readFile(join(projectPath, bibFile), 'utf-8');
    } catch {
      return { totalEntries: 0, verified: 0, results: [], summary: `BibTeX file not found: ${bibFile}` };
    }
 
    try {
      const report = await verifyBibFile(bibContent, { concurrency: 5 });
      return report;
    } catch (e) {
      fastify.log.error(e, 'Citation verification failed');
      return reply.code(500).send({ error: e.message });
    }
  });
 
  /**
   * POST /api/citations/verify-tex
   * 验证 .tex 文档中的引用并交叉检查 .bib
   * Body: { projectPath: string, texFile?: string, bibFile?: string }
   */
  fastify.post('/api/citations/verify-tex', async (request, reply) => {
    const { projectPath, texFile, bibFile = 'references.bib' } = request.body || {};
    if (!projectPath) {
      return reply.code(400).send({ error: 'projectPath is required' });
    }
 
    // 读取 bib 文件
    let bibContent = '';
    try {
      bibContent = await readFile(join(projectPath, bibFile), 'utf-8');
    } catch {
      bibContent = '';
    }
 
    // 读取 tex 文件（指定文件或查找 main.tex）
    let texContent = '';
    if (texFile) {
      try {
        texContent = await readFile(join(projectPath, texFile), 'utf-8');
      } catch {
        return reply.code(404).send({ error: `TeX file not found: ${texFile}` });
      }
    } else {
      // 尝试常见的主文件名
      const candidates = ['main.tex', 'paper.tex', 'manuscript.tex'];
      for (const name of candidates) {
        try {
          texContent = await readFile(join(projectPath, name), 'utf-8');
          break;
        } catch { /* continue */ }
      }
      if (!texContent) {
        // 尝试读取 sec/ 目录下的所有 .tex 文件
        const { readdir } = await import('fs/promises');
        try {
          const secDir = join(projectPath, 'sec');
          const files = await readdir(secDir);
          const texFiles = files.filter(f => f.endsWith('.tex')).sort();
          const contents = [];
          for (const f of texFiles) {
            try {
              contents.push(await readFile(join(secDir, f), 'utf-8'));
            } catch { /* skip */ }
          }
          texContent = contents.join('\n\n');
        } catch { /* sec/ not found */ }
      }
    }
 
    if (!texContent && !bibContent) {
      return reply.code(404).send({ error: 'No .tex or .bib content found in project' });
    }
 
    try {
      // 如果有 tex 内容，做完整的交叉检查+验证
      if (texContent) {
        const report = await verifyTexCitations(texContent, bibContent, { concurrency: 5 });
        return report;
      }
      // 只有 bib 文件，直接验证 bib
      const report = await verifyBibFile(bibContent, { concurrency: 5 });
      return report;
    } catch (e) {
      fastify.log.error(e, 'TeX citation verification failed');
      return reply.code(500).send({ error: e.message });
    }
  });
 
  /**
   * POST /api/citations/cross-check
   * 快速交叉检查（不调用外部 API，仅对比 .tex 和 .bib）
   * Body: { projectPath: string, texFile?: string, bibFile?: string }
   */
  fastify.post('/api/citations/cross-check', async (request, reply) => {
    const { projectPath, texFile, bibFile = 'references.bib' } = request.body || {};
    if (!projectPath) {
      return reply.code(400).send({ error: 'projectPath is required' });
    }
 
    let bibContent = '';
    try {
      bibContent = await readFile(join(projectPath, bibFile), 'utf-8');
    } catch { /* empty */ }
 
    let texContent = '';
    if (texFile) {
      try {
        texContent = await readFile(join(projectPath, texFile), 'utf-8');
      } catch { /* empty */ }
    } else {
      const candidates = ['main.tex', 'paper.tex', 'manuscript.tex'];
      for (const name of candidates) {
        try {
          texContent = await readFile(join(projectPath, name), 'utf-8');
          break;
        } catch { /* continue */ }
      }
      if (!texContent) {
        const { readdir } = await import('fs/promises');
        try {
          const secDir = join(projectPath, 'sec');
          const files = await readdir(secDir);
          const texFiles = files.filter(f => f.endsWith('.tex')).sort();
          const contents = [];
          for (const f of texFiles) {
            try { contents.push(await readFile(join(secDir, f), 'utf-8')); } catch { /* skip */ }
          }
          texContent = contents.join('\n\n');
        } catch { /* sec/ not found */ }
      }
    }
 
    if (!texContent && !bibContent) {
      return reply.code(404).send({ error: 'No .tex or .bib content found' });
    }
 
    try {
      const result = crossCheckCitations(texContent, bibContent);
      return result;
    } catch (e) {
      fastify.log.error(e, 'Cross-check failed');
      return reply.code(500).send({ error: e.message });
    }
  });
}
 
