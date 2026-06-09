import { promises as fs } from 'fs';
import path from 'path';
import zlib from 'zlib';
import { getProjectRoot } from '../services/projectService.js';

async function findSynctexFile(projectRoot) {
  const buildRoot = path.join(projectRoot, '.compile');
  
  // First check .compile/output/ (persistent location)
  const outputPath = path.join(buildRoot, 'output');
  try {
    const files = await fs.readdir(outputPath);
    const stx = files.find(f => f.endsWith('.synctex.gz'));
    if (stx) return path.join(outputPath, stx);
  } catch {}
  
  // Fallback: check .compile/<uuid>/ (temporary build dirs)
  try {
    const dirs = await fs.readdir(buildRoot);
    const sorted = dirs.sort().reverse();
    for (const dir of sorted) {
      if (dir === 'output') continue;
      const candidate = path.join(buildRoot, dir);
      const stat = await fs.stat(candidate).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;
      const files = await fs.readdir(candidate);
      const stx = files.find(f => f.endsWith('.synctex.gz'));
      if (stx) return path.join(candidate, stx);
    }
  } catch {}
  
  return null;
}

/**
 * Parse a .synctex.gz file into a structured mapping.
 * SyncTeX format:
 *   Input:file_num:file_path
 *   Content:
 *   {page_num
 *   [file_num,line,col,x,y,w,h  (box entry - maps to source)
 *   (file_num,line,col,x,y,w,h  (node entry - sets context)
 *   )
 *   }
 * 
 * Coordinates are in scaled points (1 inch = 72.27 tex points * 65536)
 */
function parseSynctexRaw(text) {
  const result = {
    sourceToPdf: [],
    pdfToSource: [],
    inputFiles: {},
  };
 
  const lines = text.split('\n');
  let currentPage = null;
 
  for (const line of lines) {
    const trimmed = line.trim();
 
    // Input section: "Input:file_num:file_path"
    const inputMatch = trimmed.match(/^Input:(\d+):(.+)$/);
    if (inputMatch) {
      const fileNum = parseInt(inputMatch[1], 10);
      const filePath = inputMatch[2];
      if (filePath) {
        result.inputFiles[fileNum] = filePath;
      }
      continue;
    }
 
    // Page start: "{page_num"
    const pageMatch = trimmed.match(/^\{(\d+)$/);
    if (pageMatch) {
      currentPage = parseInt(pageMatch[1], 10);
      continue;
    }
 
    // Page end: "}"
    if (trimmed === '}') {
      currentPage = null;
      continue;
    }
 
    if (currentPage === null) continue;
 
    // Box entry: "[file_num,line,col,x,y,w,h"
    // Split by : and , to get 7 parts
    if (trimmed.startsWith('[')) {
      const parts = trimmed.slice(1).replace(/:/g, ',').split(',');
      if (parts.length >= 7) {
        const fileNum = parseInt(parts[0], 10);
        const file = result.inputFiles[fileNum] || null;
        if (file) {
          const lineNum = parseInt(parts[1], 10);
          // Convert from scaled points to PDF points
          const x = parseInt(parts[3], 10) / 65536;
          const y = parseInt(parts[4], 10) / 65536;
          const w = parseInt(parts[5], 10) / 65536;
          const h = parseInt(parts[6], 10) / 65536;
 
          const entry = {
            file: file,
            line: lineNum,
            page: currentPage,
            x: x,
            y: y,
            w: w,
            h: Math.max(h, 10), // Minimum height for click detection
          };
          result.sourceToPdf.push(entry);
          result.pdfToSource.push(entry);
        }
      }
      continue;
    }
 
    // Node entries ( and other entries - skip
  }
 
  // Build lookup indexes
  result.sourceToPdfMap = {};
  for (const entry of result.sourceToPdf) {
    const key = `${entry.file}:${entry.line}`;
    if (!result.sourceToPdfMap[key]) {
      result.sourceToPdfMap[key] = entry;
    }
  }
 
  result.pdfToSourceEntries = result.pdfToSource;
 
  return result;
}

export function registerSyncTeXRoutes(fastify) {
  fastify.post('/api/projects/:projectId/synctex/source-to-pdf', async (req) => {
    const { projectId } = req.params;
    const { file, line } = req.body || {};
 
    if (!projectId || !file || line === undefined) {
      return { ok: false, error: 'Missing projectId, file, or line.' };
    }
 
    try {
      const projectRoot = await getProjectRoot(projectId);
      const synctexFile = await findSynctexFile(projectRoot);
      if (!synctexFile) {
        return { ok: false, error: 'No .synctex.gz found. Compile first.' };
      }
 
      const gzBuffer = await fs.readFile(synctexFile);
      const text = zlib.gunzipSync(gzBuffer).toString('utf8');
      const parsed = parseSynctexRaw(text);
 
      // Look up source line
      const normalizedFile = path.resolve(projectRoot, file);
      let key = `${normalizedFile}:${line}`;
      let match = parsed.sourceToPdfMap[key];
 
      if (!match) {
        for (const [k, v] of Object.entries(parsed.sourceToPdfMap)) {
          if (k.endsWith(`/${file}:${line}`) || k === `${file}:${line}`) {
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
      const synctexFile = await findSynctexFile(projectRoot);
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
        // Check if point is inside or near box
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
