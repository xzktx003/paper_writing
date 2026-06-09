import { promises as fs } from 'fs';
import path from 'path';
import zlib from 'zlib';
import { getProjectRoot } from '../services/projectService.js';
 
/**
 * Parse a .synctex.gz file into a structured mapping.
 * The synctex format is a text-based format with sections like:
 *   Input:<line>:<col>:<file>
 *   Page:<page>
 *   x:<x>,y:<y>,w:<w>,h:<h>
 *   ...
 *   !
 */
function parseSynctexRaw(text) {
  const result = {
    sourceToPdf: [],   // [{file, line, page, x, y, w, h}]
    pdfToSource: [],   // [{page, x, y, w, h, file, line}]
  };
 
  const lines = text.split('\n');
  let currentInput = null;
  let currentPage = null;
  let i = 0;
 
  while (i < lines.length) {
    const line = lines[i].trim();
 
    // Input section: "Input:line:col:file"
    const inputMatch = line.match(/^Input:(\d+):(\d+):(.+)$/);
    if (inputMatch) {
      currentInput = {
        line: parseInt(inputMatch[1], 10),
        col: parseInt(inputMatch[2], 10),
        file: inputMatch[3],
      };
      i++;
      continue;
    }
 
    // Page section: "Page:<page>"
    const pageMatch = line.match(/^Page:(\d+)$/);
    if (pageMatch) {
      currentPage = parseInt(pageMatch[1], 10);
      i++;
      continue;
    }
 
    // Box entry: "x:<x>,y:<y>,w:<w>,h:<h>"
    const boxMatch = line.match(/^([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)$/);
    if (boxMatch && currentInput && currentPage !== null) {
      const entry = {
        file: currentInput.file,
        line: currentInput.line,
        page: currentPage,
        x: parseFloat(boxMatch[1]),
        y: parseFloat(boxMatch[2]),
        w: parseFloat(boxMatch[3]),
        h: parseFloat(boxMatch[4]),
      };
      result.sourceToPdf.push(entry);
      result.pdfToSource.push(entry);
    }
 
    i++;
  }
 
  // Build lookup indexes
  // For sourceToPdf: group by file+line, keep first match per line
  result.sourceToPdfMap = {};
  for (const entry of result.sourceToPdf) {
    const key = `${entry.file}:${entry.line}`;
    if (!result.sourceToPdfMap[key]) {
      result.sourceToPdfMap[key] = entry;
    }
  }
 
  // For pdfToSource: build a simple grid for point-in-box lookup
  // We'll use a brute-force approach for now (fast enough for typical papers)
  result.pdfToSourceEntries = result.pdfToSource;
 
  return result;
}
 
export function registerSyncTeXRoutes(fastify) {
  // Store parsed synctex data per project (in-memory cache)
  const synctexCache = new Map();
 
  fastify.post('/api/projects/:projectId/synctex/source-to-pdf', async (req) => {
    const { projectId } = req.params;
    const { file, line } = req.body || {};
 
    if (!projectId || !file || line === undefined) {
      return { ok: false, error: 'Missing projectId, file, or line.' };
    }
 
    try {
      const projectRoot = await getProjectRoot(projectId);
      const buildRoot = path.join(projectRoot, '.compile');
 
      // Find latest synctex.gz
      let synctexFile = null;
      try {
        const dirs = await fs.readdir(buildRoot);
        // Sort by time, newest first
        const sorted = dirs.sort().reverse();
        for (const dir of sorted) {
          const candidate = path.join(buildRoot, dir);
          const stat = await fs.stat(candidate).catch(() => null);
          if (!stat || !stat.isDirectory()) continue;
          const files = await fs.readdir(candidate);
          const stx = files.find(f => f.endsWith('.synctex.gz'));
          if (stx) {
            synctexFile = path.join(candidate, stx);
            break;
          }
        }
      } catch {
        return { ok: false, error: 'No compiled output found. Compile first.' };
      }
 
      if (!synctexFile) {
        return { ok: false, error: 'No .synctex.gz found. Compile with pdflatex/xelatex/lualatex.' };
      }
 
      // Parse synctex
      const gzBuffer = await fs.readFile(synctexFile);
      const text = zlib.gunzipSync(gzBuffer).toString('utf8');
      const parsed = parseSynctexRaw(text);
 
      // Look up source line
      const normalizedFile = path.resolve(projectRoot, file);
      // Try exact match and relative match
      let key = `${normalizedFile}:${line}`;
      let match = parsed.sourceToPdfMap[key];
 
      if (!match) {
        // Try without absolute path prefix
        for (const [k, v] of Object.entries(parsed.sourceToPdfMap)) {
          if (k.endsWith(`/${file}:${line}`) || k.endsWith(`:${file}:${line}`)) {
            match = v;
            break;
          }
        }
      }
 
      if (!match) {
        return { ok: false, error: `No mapping found for ${file}:${line}` };
      }
 
      return {
        ok: true,
        page: match.page,
        x: match.x,
        y: match.y,
        width: match.w,
        height: match.h,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
 
  fastify.post('/api/projects/:projectId/synctex/pdf-to-source', async (req) => {
    const { projectId } = req.params;
    const { page, x, y } = req.body || {};
 
    if (!projectId || page === undefined || x === undefined || y === undefined) {
      return { ok: false, error: 'Missing projectId, page, x, or y.' };
    }
 
    try {
      const projectRoot = await getProjectRoot(projectId);
      const buildRoot = path.join(projectRoot, '.compile');
 
      let synctexFile = null;
      try {
        const dirs = await fs.readdir(buildRoot);
        const sorted = dirs.sort().reverse();
        for (const dir of sorted) {
          const candidate = path.join(buildRoot, dir);
          const stat = await fs.stat(candidate).catch(() => null);
          if (!stat || !stat.isDirectory()) continue;
          const files = await fs.readdir(candidate);
          const stx = files.find(f => f.endsWith('.synctex.gz'));
          if (stx) {
            synctexFile = path.join(candidate, stx);
            break;
          }
        }
      } catch {
        return { ok: false, error: 'No compiled output found.' };
      }
 
      if (!synctexFile) {
        return { ok: false, error: 'No .synctex.gz found.' };
      }
 
      const gzBuffer = await fs.readFile(synctexFile);
      const text = zlib.gunzipSync(gzBuffer).toString('utf8');
      const parsed = parseSynctexRaw(text);
 
      // Find closest box on the same page
      let bestMatch = null;
      let bestDist = Infinity;
      for (const entry of parsed.pdfToSourceEntries) {
        if (entry.page !== page) continue;
        // Check if point is inside box
        const cx = entry.x + entry.w / 2;
        const cy = entry.y + entry.h / 2;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = entry;
        }
      }
 
      if (!bestMatch) {
        return { ok: false, error: 'No mapping found for this position.' };
      }
 
      return {
        ok: true,
        file: bestMatch.file,
        line: bestMatch.line,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}
 
