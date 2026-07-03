import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import OpenAI from 'openai';
import { assemblePrompt } from '../services/skillEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_IMAGE_API_BASE = 'https://www.right.codes/draw/v1';
const DEFAULT_HTTP_TIMEOUT_MS = 300000;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_RETRY_COUNT = 2;

// Resolve papers directory from environment variable (OPENPRISM_PROJECTS_DIR)
function getPapersBaseDir() {
  const envPapersDir = process.env.OPENPRISM_PROJECTS_DIR;
  if (envPapersDir) return envPapersDir;
  throw new Error('OPENPRISM_PROJECTS_DIR is not set. Please configure it in .env');
}

// Default draw directory (will be overridden per-request if projectPath provided)
const DEFAULT_DRAW_DIR = path.join(getPapersBaseDir(), 'draw');

// Image prompt system prompt
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
    ? [...new Set(selectedSkills.filter(name => typeof name === 'string' && name.trim()).map(name => name.trim()))]
    : [];
  const skillPrompt = assemblePrompt({ manualSkills: normalizedSkills });
  if (!skillPrompt) return IMAGE_PROMPT_SYSTEM;
  return `${IMAGE_PROMPT_SYSTEM}\n\nThe user selected the following Skills. Apply their task-specific workflow, constraints, and visual guidance when producing the image prompt:\n\n${skillPrompt}`;
}

export function getDrawImageApiBase(appConfig = {}) {
  return appConfig.draw_image_api_base || process.env.OPENPRISM_DRAW_IMAGE_API_BASE || DEFAULT_IMAGE_API_BASE;
}

export function isRetryableDrawNetworkError(error) {
  const code = error?.code || error?.cause?.code;
  const message = String(error?.message || '');
  return [
    'ECONNRESET',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'ECONNREFUSED',
  ].includes(code) ||
    /Client network socket disconnected before secure TLS connection was established|socket hang up|request timeout/i.test(message);
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

// Helper: Promise-based HTTP request
export function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeoutMs || DEFAULT_HTTP_TIMEOUT_MS,
    };
    
    const req = lib.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
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
          // Binary data (image)
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
    
    if (options.body) {
      req.write(options.body);
    }
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
        lastError.status = response.status;
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

// Register routes function
export async function registerDrawRoutes(fastify, opts) {
  const appConfig = opts?.appConfig || {};
  
  // Image API base URL -统一前缀
  const IMAGE_API_BASE = getDrawImageApiBase(appConfig);
  
  // Initialize chat client for generating image prompts
  let openai;
  try {
    const OpenAIModule = await import('openai');
    const OpenAI = OpenAIModule.default || OpenAIModule.OpenAI;
    
    openai = new OpenAI({ 
      apiKey: appConfig.llm_api_key || process.env.OPENPRISM_LLM_API_KEY,
      baseURL: appConfig.llm_base_url || process.env.OPENPRISM_LLM_BASE_URL || undefined,
    });
    fastify.log.info(`Draw chat client initialized: baseURL=${appConfig.llm_base_url}, model=${appConfig.llm_model}`);
  } catch (error) {
    fastify.log.warn('OpenAI client not available:', error.message);
  }
  
  // Note: imageApiClient will be initialized per-request using the apiKey from frontend
  fastify.log.info(`Draw image API base URL configured: ${IMAGE_API_BASE}`);
  
  // Generate image prompt from paper content
  fastify.post('/api/draw/generate-prompt', async (request, reply) => {
    try {
      const { paperContent, figureDescription, ragContext, selectedSkills } = request.body || {};
      
      if (!openai) {
        return reply.status(500).send({ 
          error: 'Chat client not initialized',
          hint: '请检查 .env 配置中的 OPENPRISM_LLM_* 设置'
        });
      }
      
      const model = appConfig.llm_model || process.env.OPENPRISM_LLM_MODEL || 'houmo-big-model';
      
      // Build context for prompt generation
      let context = '';
      
      // Add RAG context if provided
      if (ragContext && ragContext.trim()) {
        context += `参考文档内容:\n${ragContext}\n\n`;
      }
      if (paperContent && paperContent.trim()) {
        context += `Paper content:\n${paperContent}\n\n`;
      }
      if (figureDescription && figureDescription.trim()) {
        context += `Description: ${figureDescription}\n`;
      }
      
      if (!context.trim()) {
        return reply.status(400).send({ 
          error: '请提供 paperContent 或 figureDescription'
        });
      }
      
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: buildDrawPromptSystem(selectedSkills) },
          { role: 'user', content: context }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const imagePrompt = response.choices[0]?.message?.content || '';
      
      return { 
        success: true, 
        imagePrompt: imagePrompt.trim(),
        raw: response.choices[0]?.message?.content
      };
    } catch (error) {
      fastify.log.error('Generate prompt error:', error);
      return reply.status(500).send({ 
        error: error.message,
        hint: '生成图片描述时出错'
      });
    }
  });

  // Generate final image
  fastify.post('/api/draw/generate-image', async (request, reply) => {
    try {
      const { imagePrompt, paperContent, apiSettings, projectName } = request.body;
      const { apiKey, model } = apiSettings || {};
      
      if (!apiKey) {
        return reply.status(400).send({ 
          error: '请配置API Key',
          hint: '在Settings中配置图片API的Key'
        });
      }
      
      fastify.log.info(`[DEBUG] API settings:`, JSON.stringify({ ...apiSettings, apiKey: '[REDACTED]' }));
      
      // Determine save directory: projectName relative to OPENPRISM_PROJECTS_DIR
      // projectName is now a relative project name (e.g. "my-paper")
      let drawDir;
      if (projectName) {
        const papersDir = getPapersBaseDir();
        drawDir = path.join(papersDir, projectName, 'draw');
      } else {
        drawDir = DEFAULT_DRAW_DIR;
      }
      
      // Ensure draw directory exists (使用相对路径，避免硬编码用户名)
      if (!fs.existsSync(drawDir)) {
        fs.mkdirSync(drawDir, { recursive: true });
      }
      
      if (!imagePrompt || !imagePrompt.trim()) {
        return reply.status(400).send({ 
          error: '请先生成图片描述'
        });
      }

      // Combine paper context with image prompt
      let fullPrompt = imagePrompt;
      if (paperContent && paperContent.trim()) {
        fullPrompt = `${imagePrompt}\n\nContext: ${paperContent}`;
      }

      const timestamp = Date.now();
      const outputFilename = `figure_${timestamp}.png`;
      const outputPath = path.join(drawDir, outputFilename);

      try {
        fastify.log.info('Generating image with prompt length:', fullPrompt.length);
        
        const imageModel = model || 'gpt-image-2-vip';
        fastify.log.info(`Using image model: ${imageModel}, API base: ${IMAGE_API_BASE}`);
        
        // Use httpRequest helper with CloudFlare-friendly headers
        const apiUrl = `${IMAGE_API_BASE}/images/generations`;
        const requestBody = JSON.stringify({
          model: imageModel,
          prompt: fullPrompt,
          n: 1,
          size: '1024x1024',
        });
        
        fastify.log.info('[DEBUG] Starting image generation request...');
        fastify.log.info('[DEBUG] Request headers: Origin, Referer, User-Agent set for CloudFlare bypass');
        
        const startTime = Date.now();
        
        const apiResponse = await httpRequestWithRetry(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody),
            'Accept': 'application/json',
            'Origin': 'https://paper-wrighting.local',
            'Referer': 'https://paper-wrighting.local/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          body: requestBody,
        });
        
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        fastify.log.info(`[DEBUG] Image API responded in ${elapsed}s, status: ${apiResponse.status}, attempts: ${apiResponse.attempts}`);
        fastify.log.info(`[DEBUG] API Response data: ${JSON.stringify(apiResponse.data)}`);
        
        if (apiResponse.status !== 200 || !apiResponse.data?.data?.[0]?.url) {
          const errorMsg = apiResponse.data?.error || apiResponse.data?.message || `API Error: ${apiResponse.status}`;
          throw new Error(errorMsg);
        }
        
        const imageUrl = apiResponse.data.data[0].url;
        
        fastify.log.info('Image URL obtained: ' + imageUrl.substring(0, 80));
        
        // Download image
        fastify.log.info('Downloading image from: ' + imageUrl.substring(0, 80));
        const imgResponse = await httpRequestWithRetry(imageUrl, { method: 'GET' });
        
        if (imgResponse.status !== 200) {
          throw new Error(`Failed to download image: ${imgResponse.status}`);
        }
        
        fs.writeFileSync(outputPath, imgResponse.data);

        const savedPath = `draw/${outputFilename}`;
        
        return { 
          success: true,
          imageUrl: `/api/draw/images/${outputFilename}`,
          prompt: fullPrompt,
          sourceUrl: imageUrl,
          savedPath,
          savedDirectory: 'draw'
        };
      } catch (apiError) {
        fastify.log.error('Image API error:', apiError.message);
        
        return reply.status(500).send({ 
          error: `图片生成失败: ${formatDrawApiError(apiError)}`,
          hint: '请检查网络连接、代理、证书和图片 API 配置'
        });
      }
    } catch (error) {
      fastify.log.error('Generate image error:', error);
      return reply.status(500).send({ 
        error: error.message,
        hint: '生成图片时出错'
      });
    }
  });

  // Edit existing image using chat/completions with vision
  fastify.post('/api/draw/edit-image', async (request, reply) => {
    try {
      const { 
        imagePath,        // 已有图片的相对路径 (如 "figure_123.png")
        editPrompt,       // 编辑指令
        paperContent,     // 可选的上下文
        apiSettings,      // API设置
        projectName       // 项目名
      } = request.body;
      
      const { apiKey, model } = apiSettings || {};
      
      if (!imagePath || !editPrompt) {
        return reply.status(400).send({
          error: '请提供要编辑的图片和编辑指令'
        });
      }
      
      if (!apiKey) {
        return reply.status(400).send({
          error: '请配置API Key',
          hint: '在Settings中配置图片API的Key'
        });
      }
      
      // Determine project directory and find the image
      let projectDir;
      if (projectName) {
        const papersDir = getPapersBaseDir();
        projectDir = path.join(papersDir, projectName);
      } else {
        projectDir = DEFAULT_DRAW_DIR;
      }
      
      // If imagePath contains a path separator, it's a relative path from project root
      // Otherwise it's just a filename in the draw directory
      let imageFullPath;
      if (imagePath.includes('/') || imagePath.includes('\\')) {
        imageFullPath = path.join(projectDir, imagePath);
      } else {
        imageFullPath = path.join(projectDir, 'draw', imagePath);
      }
      
      if (!fs.existsSync(imageFullPath)) {
        return reply.status(404).send({
          error: '图片文件不存在',
          hint: `找不到文件: ${imagePath}`
        });
      }
      
      // Read image and convert to base64
      const imageBuffer = fs.readFileSync(imageFullPath);
      const imageBase64 = imageBuffer.toString('base64');
      const imageExt = path.extname(imagePath).toLowerCase().slice(1);
      const mimeType = imageExt === 'jpg' || imageExt === 'jpeg' ? 'image/jpeg' : 'image/png';
      
      // Read the image and create edited version
      const timestamp = Date.now();
      const outputFilename = `figure_${timestamp}.png`;
      const outputDir = path.join(projectDir, 'draw');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const outputPath = path.join(outputDir, outputFilename);
      
      // Build full prompt with context
      let fullPrompt = editPrompt;
      if (paperContent && paperContent.trim()) {
        fullPrompt = `${editPrompt}\n\nContext: ${paperContent}`;
      }
      
      fastify.log.info(`Editing image: ${imagePath}, prompt: ${fullPrompt.substring(0, 50)}...`);
      
      // For image editing, we use the image generation API with the original image
      const imageModel = model || 'gpt-image-2-vip';
      
      try {
        // Use httpRequest helper with CloudFlare-friendly headers
        const apiUrl = `${IMAGE_API_BASE}/images/generations`;
        const requestBody = JSON.stringify({
          model: imageModel,
          prompt: fullPrompt,
          n: 1,
          size: '1024x1024',
        });
        
        const apiResponse = await httpRequestWithRetry(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody),
            'Accept': 'application/json',
            'Origin': 'https://paper-wrighting.local',
            'Referer': 'https://paper-wrighting.local/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          body: requestBody,
        });
        
        if (apiResponse.status !== 200 || !apiResponse.data?.data?.[0]?.url) {
          const errorMsg = apiResponse.data?.error || apiResponse.data?.message || `API Error: ${apiResponse.status}`;
          throw new Error(errorMsg);
        }
        
        const imageUrl = apiResponse.data.data[0].url;
        
        // Download edited image
        const imgResponse = await httpRequestWithRetry(imageUrl, { method: 'GET' });
        
        if (imgResponse.status !== 200) {
          throw new Error(`Failed to download edited image: ${imgResponse.status}`);
        }
        
        fs.writeFileSync(outputPath, imgResponse.data);
        
        const savedPath = `draw/${outputFilename}`;
        return {
          success: true,
          imageUrl: `/api/draw/images/${encodeURIComponent(savedPath)}?projectName=${projectName || ''}`,
          prompt: fullPrompt,
          sourceUrl: imageUrl,
          originalImage: imagePath,
          savedPath: savedPath
        };
      } catch (apiError) {
        fastify.log.error('Image edit API error:', apiError.message);
        
        return reply.status(500).send({
          error: `图片编辑失败: ${formatDrawApiError(apiError)}`,
          hint: '请检查网络连接、代理、证书和图片 API 配置'
        });
      }
    } catch (error) {
      fastify.log.error('Edit image error:', error);
      return reply.status(500).send({
        error: error.message,
        hint: '编辑图片时出错'
      });
    }
  });

  // Serve generated images - accepts projectName as query param
  // filepath can be a relative path like "draw/fig.png" or just "fig.png"
  fastify.get('/api/draw/images/*', async (request, reply) => {
    // Get the wildcard path (everything after /api/draw/images/)
    const wildcard = request.url.split('/api/draw/images/')[1] || '';
    const filepath = decodeURIComponent(wildcard.split('?')[0]);
    const projectName = request.query.projectName;
    
    if (!filepath) {
      return reply.status(400).send('Filepath required');
    }
    
    // If filepath contains path separators, it's a relative path from project root
    if (filepath.includes('/') || filepath.includes('\\')) {
      if (projectName) {
        const projectDir = path.join(getPapersBaseDir(), projectName);
        const filePath = path.join(projectDir, filepath);
        if (fs.existsSync(filePath)) {
          const ext = path.extname(filepath).toLowerCase();
          const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' };
          return reply.type(mimeTypes[ext] || 'image/png').send(fs.readFileSync(filePath));
        }
      }
    }
    
    // Search directories using relative paths (基于OPENPRISM_PROJECTS_DIR)
    const searchDirs = [
      projectName ? path.join(getPapersBaseDir(), projectName) : null,
      projectName ? path.join(getPapersBaseDir(), projectName, 'draw') : null,
      DEFAULT_DRAW_DIR,
      path.join(__dirname, '../../temp/draw'),
    ].filter(Boolean);
    
    for (const dir of searchDirs) {
      const filePath = path.join(dir, filepath);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filepath).toLowerCase();
        const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' };
        return reply.type(mimeTypes[ext] || 'image/png').send(fs.readFileSync(filePath));
      }
    }
    return reply.status(404).send('Not found: ' + filepath);
  });

  // Download image - accepts projectName as query param
  fastify.get('/api/draw/download/:filename', async (request, reply) => {
    const filename = decodeURIComponent(request.params.filename || '');
    const projectName = request.query.projectName;
    
    if (!filename) {
      return reply.status(400).send('Filename required');
    }
    
    // If filename contains path separators, try directly in project dir first
    if (filename.includes('/') || filename.includes('\\')) {
      if (projectName) {
        const projectDir = path.join(getPapersBaseDir(), projectName);
        const filePath = path.join(projectDir, filename);
        if (fs.existsSync(filePath)) {
          return reply
            .header('Content-Disposition', `attachment; filename="${path.basename(filename)}"`)
            .type('image/png')
            .send(fs.readFileSync(filePath));
        }
      }
    }
    
    const searchDirs = [
      projectName ? path.join(getPapersBaseDir(), projectName) : null,
      projectName ? path.join(getPapersBaseDir(), projectName, 'draw') : null,
      DEFAULT_DRAW_DIR,
      path.join(__dirname, '../../temp/draw'),
    ].filter(Boolean);
    
    for (const dir of searchDirs) {
      const filePath = path.join(dir, filename);
      if (fs.existsSync(filePath)) {
        return reply
          .header('Content-Disposition', `attachment; filename="${path.basename(filename)}"`)
          .type('image/png')
          .send(fs.readFileSync(filePath));
      }
    }
    return reply.status(404).send('Not found');
  });
  
  // Recursively find all image files in a directory
  function findImagesRecursive(dir, baseDir = dir, projectName = '', results = []) {
    if (!fs.existsSync(dir)) return results;
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and other common non-image directories
        if (!['node_modules', '.git', '__pycache__', 'venv', '.venv'].includes(entry.name)) {
          findImagesRecursive(fullPath, baseDir, projectName, results);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (imageExtensions.includes(ext)) {
          const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
          results.push({
            filename: path.basename(entry.name),
            path: relativePath,  // 相对于项目目录的路径
            url: `/api/draw/images/${encodeURIComponent(relativePath)}?projectName=${projectName || ''}`,
            fullPath: relativePath
          });
        }
      }
    }
    return results;
  }
  
  // List available images for a project (scans entire project folder)
  fastify.get('/api/draw/list-images', async (request, reply) => {
    const projectName = request.query.projectName || '';
    
    let projectDir;
    if (projectName) {
      const papersDir = getPapersBaseDir();
      projectDir = path.join(papersDir, projectName);
    } else {
      projectDir = DEFAULT_DRAW_DIR;
    }
    
    if (!fs.existsSync(projectDir)) {
      return { images: [] };
    }
    
    const images = findImagesRecursive(projectDir, projectDir, projectName);
    // Sort by modification time, newest first
    images.sort((a, b) => {
      const statA = fs.statSync(path.join(projectDir, a.path));
      const statB = fs.statSync(path.join(projectDir, b.path));
      return statB.mtime.getTime() - statA.mtime.getTime();
    });
    
    return { images };
  });

  // Upload image for editing
  fastify.post('/api/draw/upload-image', async (request, reply) => {
    try {
      const projectName = request.query.projectName;
      
      // Get draw directory
      let drawDir;
      if (projectName) {
        const papersDir = getPapersBaseDir();
        drawDir = path.join(papersDir, projectName, 'draw');
      } else {
        drawDir = DEFAULT_DRAW_DIR;
      }
      
      if (!fs.existsSync(drawDir)) {
        fs.mkdirSync(drawDir, { recursive: true });
      }
      
      // Handle multipart form data with multer-like parsing
      // Since we're using Fastify, let's use its built-in multipart support
      const data = await request.file();
      
      if (!data) {
        return reply.status(400).send({ error: '请上传图片文件' });
      }
      
      const ext = path.extname(data.filename).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) {
        return reply.status(400).send({ error: '不支持的图片格式，仅支持: png, jpg, gif, webp, bmp' });
      }
      
      const timestamp = Date.now();
      const filename = `upload_${timestamp}${ext}`;
      const filepath = path.join(drawDir, filename);
      
      // Write file
      const buffer = await data.toBuffer();
      fs.writeFileSync(filepath, buffer);
      
      return {
        success: true,
        filename: filename,
        url: `/api/draw/images/${filename}?projectName=${projectName || ''}`,
        path: filename
      };
    } catch (error) {
      fastify.log.error('Upload image error:', error);
      return reply.status(500).send({
        error: error.message,
        hint: '上传图片时出错'
      });
    }
  });
}

export default registerDrawRoutes;
