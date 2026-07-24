import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { assemblePrompt } from '../services/skillEngine.js';
import { chatCompletion } from '../services/llmService.js';
import { getProjectRoot } from '../services/projectLocator.js';
import { safeJoin } from '../utils/pathSecurity.js';

const DEFAULT_IMAGE_API_BASE = 'https://www.right.codes/draw/v1';
const DEFAULT_HTTP_TIMEOUT_MS = 300000;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_RETRY_COUNT = 2;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);
const IMAGE_MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

const IMAGE_PROMPT_SYSTEM = `You are an expert at creating detailed image prompts for academic paper figures.

For a given paper section/chapter content, generate a detailed, professional image prompt that:
1. Describes a clean, academic-style figure suitable for top AI conferences (NeurIPS, ICML, ICLR, CVPR, etc.)
2. Uses clear visual elements like boxes, arrows, charts, diagrams as appropriate
3. Specifies professional color schemes (blues, grays, whites)
4. Describes text labels and annotations
5. Is detailed enough for AI image generation but concise

Output ONLY the image prompt, nothing else. Start directly with the description.`;

export function buildDrawPromptSystem(selectedSkills = []) {
  const normalizedSkills = Array.isArray(selectedSkills)
    ? [...new Set(selectedSkills.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim()))]
    : [];
  const skillPrompt = assemblePrompt({ manualSkills: normalizedSkills });
  if (!skillPrompt) return IMAGE_PROMPT_SYSTEM;
  return `${IMAGE_PROMPT_SYSTEM}\n\nThe user selected the following Skills. Apply their task-specific workflow, constraints, and visual guidance when producing the image prompt:\n\n${skillPrompt}`;
}

export function getDrawImageApiBase(appConfig = {}) {
  return appConfig.draw_image_api_base || process.env.OPENPRISM_DRAW_IMAGE_API_BASE || DEFAULT_IMAGE_API_BASE;
}

export function resolveDrawImageConfig(appConfig = {}) {
  const usesLlmCredentials = Boolean(appConfig.draw_image_use_llm_credentials);
  return {
    apiBase: usesLlmCredentials
      ? (appConfig.llm_base_url || process.env.OPENPRISM_LLM_BASE_URL || '')
      : getDrawImageApiBase(appConfig),
    apiKey: usesLlmCredentials
      ? (appConfig.llm_api_key || process.env.OPENPRISM_LLM_API_KEY || '')
      : (appConfig.draw_image_api_key || process.env.OPENPRISM_DRAW_IMAGE_API_KEY || ''),
    model: appConfig.draw_image_model || process.env.OPENPRISM_DRAW_IMAGE_MODEL || 'gpt-image-2',
    usesLlmCredentials,
  };
}

export function isRetryableDrawNetworkError(error) {
  const code = error?.code || error?.cause?.code;
  const message = String(error?.message || '');
  return ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ECONNREFUSED'].includes(code)
    || /Client network socket disconnected before secure TLS connection was established|socket hang up|request timeout/i.test(message);
}

function isRetryableHttpStatus(status) {
  return [408, 502, 503, 504].includes(Number(status));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatDrawNetworkError(error, attempts) {
  const message = String(error?.message || error || 'unknown network error');
  const retryNote = attempts > 1 ? `已重试 ${attempts - 1} 次。` : '';
  if (/Client network socket disconnected before secure TLS connection was established/i.test(message)) {
    return `图片服务 TLS 连接建立前被断开。${retryNote}请稍后重试，或检查服务器到图片 API 的网络、代理和证书配置。原始错误: ${message}`;
  }
  return `图片服务网络请求失败。${retryNote}请稍后重试，或检查服务器到图片 API 的网络、代理和证书配置。原始错误: ${message}`;
}

export function formatDrawApiError(error) {
  if (isRetryableDrawNetworkError(error)) {
    return formatDrawNetworkError(error, error.attempts || DEFAULT_RETRY_COUNT + 1);
  }
  return String(error?.message || error || 'unknown error');
}

export function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeoutMs || DEFAULT_HTTP_TIMEOUT_MS,
    };
    const req = lib.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(buffer.toString()) });
          } catch {
            resolve({ status: res.statusCode, data: buffer });
          }
        } else {
          resolve({ status: res.statusCode, data: buffer });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      const timeoutError = new Error(`Request timeout after ${reqOptions.timeout}ms`);
      timeoutError.code = 'ETIMEDOUT';
      req.destroy(timeoutError);
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

export async function httpRequestWithRetry(url, options = {}) {
  const retries = options.retries ?? DEFAULT_RETRY_COUNT;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await httpRequest(url, options);
      if (attempt < retries && isRetryableHttpStatus(response.status)) {
        lastError = new Error(`HTTP ${response.status}`);
        await delay(retryDelayMs * (attempt + 1));
        continue;
      }
      return { ...response, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isRetryableDrawNetworkError(error)) {
        error.attempts = attempt + 1;
        throw error;
      }
      await delay(retryDelayMs * (attempt + 1));
    }
  }
  throw lastError;
}

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

async function resolveManagedProject(projectId, resolveProjectRoot = getProjectRoot) {
  if (!projectId || typeof projectId !== 'string') throw badRequest('projectId is required');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(projectId)) throw badRequest('Invalid projectId');
  const projectRoot = await resolveProjectRoot(projectId);
  try {
    const metadataPath = safeJoin(projectRoot, 'project.json');
    const metadata = JSON.parse(await fs.promises.readFile(metadataPath, 'utf8'));
    if (metadata?.id !== projectId) throw new Error('identity mismatch');
    const rootStat = await fs.promises.stat(projectRoot);
    if (!rootStat.isDirectory()) throw new Error('not a directory');
  } catch {
    throw Object.assign(new Error('Managed project not found'), { statusCode: 404 });
  }
  return projectRoot;
}

function resolveImagePath(projectRoot, relativePath, { defaultToDraw = false } = {}) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (!normalized) throw badRequest('Image path is required');
  const candidate = defaultToDraw && !normalized.includes('/') ? `draw/${normalized}` : normalized;
  const target = safeJoin(projectRoot, candidate);
  const ext = path.extname(target).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) throw badRequest('Unsupported image format');
  return target;
}

function imageUrl(projectId, relativePath) {
  return `/api/draw/images/${encodeURIComponent(relativePath)}?projectId=${encodeURIComponent(projectId)}`;
}

function findImagesRecursive(dir, projectRoot, projectId, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = safeJoin(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', '__pycache__', 'venv', '.venv'].includes(entry.name)) {
        findImagesRecursive(fullPath, projectRoot, projectId, results);
      }
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!entry.isFile() || !IMAGE_EXTENSIONS.has(ext)) continue;
    const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');
    results.push({
      filename: path.basename(entry.name),
      path: relativePath,
      url: imageUrl(projectId, relativePath),
      fullPath: relativePath,
    });
  }
  return results;
}

export async function requestGeneratedImage({ apiBase, apiKey, model, prompt }) {
  const normalizedBase = String(apiBase || '').replace(/\/+$/, '');
  const requestBody = JSON.stringify({ model, prompt, n: 1, size: '1024x1024' });
  const apiResponse = await httpRequestWithRetry(`${normalizedBase}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody),
      Accept: 'application/json',
      Origin: 'https://paper-wrighting.local',
      Referer: 'https://paper-wrighting.local/',
      'User-Agent': 'Paper-Agent/1.0',
    },
    body: requestBody,
  });
  const image = apiResponse.data?.data?.[0];
  if (apiResponse.status !== 200 || (!image?.url && !image?.b64_json)) {
    throw new Error(apiResponse.data?.error || apiResponse.data?.message || `API Error: ${apiResponse.status}`);
  }
  if (image.b64_json) {
    const buffer = Buffer.from(String(image.b64_json), 'base64');
    if (buffer.length === 0) throw new Error('Image API returned empty base64 data');
    return { sourceUrl: null, buffer };
  }
  const download = await httpRequestWithRetry(image.url, { method: 'GET' });
  if (download.status !== 200) throw new Error(`Failed to download image: ${download.status}`);
  return { sourceUrl: image.url, buffer: download.data };
}

export async function registerDrawRoutes(fastify, opts = {}) {
  const appConfig = opts.appConfig || {};
  const resolveProjectRoot = opts.getProjectRoot || getProjectRoot;
  const imageGenerator = opts.imageGenerator || requestGeneratedImage;

  fastify.post('/api/draw/generate-prompt', async (request, reply) => {
    try {
      const { paperContent, figureDescription, ragContext, selectedSkills } = request.body || {};
      let context = '';
      if (ragContext?.trim()) context += `参考文档内容:\n${ragContext}\n\n`;
      if (paperContent?.trim()) context += `Paper content:\n${paperContent}\n\n`;
      if (figureDescription?.trim()) context += `Description: ${figureDescription}\n`;
      if (!context.trim()) return reply.status(400).send({ error: '请提供 paperContent 或 figureDescription' });
      const response = await chatCompletion({
        systemPrompt: buildDrawPromptSystem(selectedSkills),
        model: appConfig.llm_model || process.env.OPENPRISM_LLM_MODEL || 'gpt-5.5',
        messages: [{ role: 'user', content: context }],
      });
      const generated = response.content?.filter(block => block.type === 'text').map(block => block.text).join('\n') || '';
      return { success: true, imagePrompt: generated.trim(), raw: generated };
    } catch (error) {
      return reply.status(500).send({ error: error.message, hint: '生成图片描述时出错' });
    }
  });

  fastify.post('/api/draw/generate-image', async (request, reply) => {
    try {
      const { imagePrompt, projectId } = request.body || {};
      const imageConfig = resolveDrawImageConfig(appConfig);
      if (!imageConfig.apiKey || !imageConfig.apiBase) return reply.status(503).send({ error: '图片 API 未在服务器配置' });
      if (!imagePrompt?.trim()) return reply.status(400).send({ error: '请先生成图片描述' });
      const projectRoot = await resolveManagedProject(projectId, resolveProjectRoot);
      const drawDir = safeJoin(projectRoot, 'draw');
      await fs.promises.mkdir(drawDir, { recursive: true });
      const filename = `figure_${Date.now()}.png`;
      const outputPath = safeJoin(drawDir, filename);
      const prompt = imagePrompt.trim();
      const { apiBase, apiKey, model } = imageConfig;
      const generated = await imageGenerator({ apiBase, apiKey, model, prompt });
      await fs.promises.writeFile(outputPath, generated.buffer);
      return {
        success: true,
        imageUrl: imageUrl(projectId, `draw/${filename}`),
        prompt,
        sourceUrl: generated.sourceUrl,
        savedPath: `draw/${filename}`,
        savedDirectory: 'draw',
      };
    } catch (error) {
      const status = error.statusCode || 500;
      return reply.status(status).send({ error: status === 500 ? `图片生成失败: ${formatDrawApiError(error)}` : error.message });
    }
  });

  fastify.post('/api/draw/edit-image', async (request, reply) => {
    try {
      const { imagePath, editPrompt, paperContent, projectId } = request.body || {};
      const imageConfig = resolveDrawImageConfig(appConfig);
      if (!imageConfig.apiKey || !imageConfig.apiBase) return reply.status(503).send({ error: '图片 API 未在服务器配置' });
      if (!imagePath || !editPrompt?.trim()) return reply.status(400).send({ error: '请提供要编辑的图片和编辑指令' });
      const projectRoot = await resolveManagedProject(projectId, resolveProjectRoot);
      const inputPath = resolveImagePath(projectRoot, imagePath, { defaultToDraw: true });
      if (!fs.existsSync(inputPath)) return reply.status(404).send({ error: '图片文件不存在' });
      const drawDir = safeJoin(projectRoot, 'draw');
      await fs.promises.mkdir(drawDir, { recursive: true });
      const filename = `figure_${Date.now()}.png`;
      const prompt = paperContent?.trim() ? `${editPrompt}\n\nContext: ${paperContent}` : editPrompt;
      const { apiBase, apiKey, model } = imageConfig;
      const generated = await imageGenerator({ apiBase, apiKey, model, prompt });
      await fs.promises.writeFile(safeJoin(drawDir, filename), generated.buffer);
      return {
        success: true,
        imageUrl: imageUrl(projectId, `draw/${filename}`),
        prompt,
        sourceUrl: generated.sourceUrl,
        originalImage: imagePath,
        savedPath: `draw/${filename}`,
      };
    } catch (error) {
      const status = error.statusCode || 500;
      return reply.status(status).send({ error: status === 500 ? `图片编辑失败: ${formatDrawApiError(error)}` : error.message });
    }
  });

  fastify.get('/api/draw/images/*', async (request, reply) => {
    try {
      const projectRoot = await resolveManagedProject(request.query.projectId, resolveProjectRoot);
      const wildcard = request.url.split('/api/draw/images/')[1] || '';
      const relativePath = decodeURIComponent(wildcard.split('?')[0]);
      const filePath = resolveImagePath(projectRoot, relativePath, { defaultToDraw: true });
      if (!fs.existsSync(filePath)) return reply.status(404).send('Not found');
      return reply.type(IMAGE_MIME_TYPES[path.extname(filePath).toLowerCase()]).send(fs.createReadStream(filePath));
    } catch (error) {
      return reply.status(error.statusCode || 500).send({ error: error.message });
    }
  });

  fastify.get('/api/draw/download/:filename', async (request, reply) => {
    try {
      const projectRoot = await resolveManagedProject(request.query.projectId, resolveProjectRoot);
      const relativePath = decodeURIComponent(request.params.filename || '');
      const filePath = resolveImagePath(projectRoot, relativePath, { defaultToDraw: true });
      if (!fs.existsSync(filePath)) return reply.status(404).send('Not found');
      return reply
        .header('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`)
        .type(IMAGE_MIME_TYPES[path.extname(filePath).toLowerCase()])
        .send(fs.createReadStream(filePath));
    } catch (error) {
      return reply.status(error.statusCode || 500).send({ error: error.message });
    }
  });

  fastify.get('/api/draw/list-images', async (request, reply) => {
    try {
      const projectId = request.query.projectId;
      const projectRoot = await resolveManagedProject(projectId, resolveProjectRoot);
      const images = findImagesRecursive(projectRoot, projectRoot, projectId);
      images.sort((a, b) => fs.statSync(safeJoin(projectRoot, b.path)).mtimeMs - fs.statSync(safeJoin(projectRoot, a.path)).mtimeMs);
      return { images };
    } catch (error) {
      return reply.status(error.statusCode || 500).send({ error: error.message });
    }
  });

  fastify.post('/api/draw/upload-image', async (request, reply) => {
    try {
      const projectId = request.query.projectId;
      const projectRoot = await resolveManagedProject(projectId, resolveProjectRoot);
      const drawDir = safeJoin(projectRoot, 'draw');
      await fs.promises.mkdir(drawDir, { recursive: true });
      const data = await request.file();
      if (!data) return reply.status(400).send({ error: '请上传图片文件' });
      const ext = path.extname(data.filename).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) return reply.status(400).send({ error: '不支持的图片格式' });
      const filename = `upload_${Date.now()}${ext}`;
      await fs.promises.writeFile(safeJoin(drawDir, filename), await data.toBuffer());
      return { success: true, filename, url: imageUrl(projectId, `draw/${filename}`), path: `draw/${filename}` };
    } catch (error) {
      return reply.status(error.statusCode || 500).send({ error: error.message });
    }
  });
}

export default registerDrawRoutes;
