import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default draw directory (will be overridden per-request if projectPath provided)
const DEFAULT_DRAW_DIR = path.join(__dirname, '../../../papers/draw');

// Image prompt system prompt
const IMAGE_PROMPT_SYSTEM = `You are an expert at creating detailed image prompts for academic paper figures.

For a given paper section/chapter content, generate a detailed, professional image prompt that:
1. Describes a clean, academic-style figure suitable for top AI conferences (NeurIPS, ICML, ICLR, CVPR, etc.)
2. Uses clear visual elements like boxes, arrows, charts, diagrams as appropriate
3. Specifies professional color schemes (blues, grays, whites)
4. Describes text labels and annotations
5. Is detailed enough for AI image generation but concise

Output ONLY the image prompt, nothing else. Start directly with the description.`;

// Helper: Promise-based HTTP request
function httpRequest(url, options = {}) {
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
      timeout: 120000,
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
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Register routes function
export async function registerDrawRoutes(fastify, opts) {
  const appConfig = opts?.appConfig || {};
  
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
  
  // Generate image prompt from paper content
  fastify.post('/api/draw/generate-prompt', async (request, reply) => {
    try {
      const { paperContent, figureDescription } = request.body;
      
      if (!openai) {
        return reply.status(500).send({ 
          error: 'Chat client not initialized',
          hint: '请检查 .env 配置中的 OPENPRISM_LLM_* 设置'
        });
      }
      
      const model = appConfig.llm_model || process.env.OPENPRISM_LLM_MODEL || 'houmo-big-model';
      
      // Build context for prompt generation
      let context = '';
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
          { role: 'system', content: IMAGE_PROMPT_SYSTEM },
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
      const { imagePrompt, paperContent, apiSettings, projectPath } = request.body;
      const { provider, baseUrl, apiKey, model } = apiSettings;
      
      // Determine save directory: use projectPath/draw/ if projectPath provided, otherwise fallback
      let drawDir;
      if (projectPath) {
        drawDir = path.join(projectPath, 'draw');
      } else {
        // Fallback to papers/draw
        const papersDir = path.join(__dirname, '../../../papers');
        drawDir = path.join(papersDir, 'draw');
      }
      
      // Ensure draw directory exists
      if (!fs.existsSync(drawDir)) {
        fs.mkdirSync(drawDir, { recursive: true });
      }
      
      if (!imagePrompt || !imagePrompt.trim()) {
        return reply.status(400).send({ 
          error: '请先生成图片描述'
        });
      }
      
      if (!apiKey) {
        return reply.status(400).send({ 
          error: '请配置图片生成API设置',
          hint: '在右侧API设置中配置图片API'
        });
      }

      // Combine paper context with image prompt
      let fullPrompt = imagePrompt;
      if (paperContent && paperContent.trim()) {
        fullPrompt = `${imagePrompt}\n\nContext: ${paperContent}`;
      }

      const timestamp = Date.now();
      const outputPath = path.join(drawDir, `figure_${timestamp}.png`);

      try {
        fastify.log.info('Generating image with prompt length:', fullPrompt.length);
        
        // Debug: log API settings
        fastify.log.info(`API Settings: provider=${provider}, baseUrl=${baseUrl}, model=${model}`);
        
        const imageModel = model || 'gpt-image-2-vip';
        
        // Use httpRequest helper for better reliability
        let imageUrl = null;
        try {
          fastify.log.info('Calling image API via httpRequest...');
          
          const apiUrl = `${baseUrl}/images/generations`;
          const requestBody = JSON.stringify({
            model: imageModel,
            prompt: fullPrompt,
            n: 1,
            size: '1024x1024',
          });
          
          const apiResponse = await httpRequest(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(requestBody),
            },
            body: requestBody,
          });
          
          fastify.log.info('API Response status:', apiResponse.status);
          
          if (apiResponse.status !== 200 || !apiResponse.data?.data?.[0]?.url) {
            throw new Error(apiResponse.data?.error || `API Error: ${apiResponse.status}`);
          }
          
          imageUrl = apiResponse.data.data[0].url;
          fastify.log.info('Image URL obtained: ' + (imageUrl ? 'YES - ' + imageUrl.substring(0, 80) : 'NO'));
          
        } catch (apiError) {
          fastify.log.error('Image API call failed:', apiError.message);
          throw apiError;
        }
        
        if (!imageUrl) {
          throw new Error('未获取到图片URL');
        }
        
        // Download image
        fastify.log.info('Downloading image from: ' + imageUrl.substring(0, 80));
        const imgResponse = await httpRequest(imageUrl, { method: 'GET' });
        
        if (imgResponse.status !== 200) {
          throw new Error(`Failed to download image: ${imgResponse.status}`);
        }
        
        fs.writeFileSync(outputPath, imgResponse.data);
        
        return { 
          success: true,
          imageUrl: `/api/draw/images/figure_${timestamp}.png`,
          prompt: fullPrompt,
          sourceUrl: imageUrl
        };
      } catch (apiError) {
        fastify.log.error('Image API error:', apiError.message);
        
        return reply.status(500).send({ 
          error: `图片生成失败: ${apiError.message}`,
          hint: '请检查网络连接和API配置'
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

  // Serve generated images - accepts projectPath as query param
  fastify.get('/api/draw/images/:filename', async (request, reply) => {
    const filename = request.params.filename;
    const projectPath = request.query.projectPath;
    
    // Search directories: projectPath/draw > DEFAULT_DRAW_DIR > temp/draw
    const searchDirs = [
      projectPath ? path.join(projectPath, 'draw') : null,
      DEFAULT_DRAW_DIR,
      path.join(__dirname, '../../temp/draw'),
    ].filter(Boolean);
    
    for (const dir of searchDirs) {
      const filePath = path.join(dir, filename);
      if (fs.existsSync(filePath)) {
        return reply.type('image/png').send(fs.readFileSync(filePath));
      }
    }
    return reply.status(404).send('Not found');
  });

  // Download image - accepts projectPath as query param
  fastify.get('/api/draw/download/:filename', async (request, reply) => {
    const filename = request.params.filename;
    const projectPath = request.query.projectPath;
    
    const searchDirs = [
      projectPath ? path.join(projectPath, 'draw') : null,
      DEFAULT_DRAW_DIR,
      path.join(__dirname, '../../temp/draw'),
    ].filter(Boolean);
    
    for (const dir of searchDirs) {
      const filePath = path.join(dir, filename);
      if (fs.existsSync(filePath)) {
        return reply
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .type('image/png')
          .send(fs.readFileSync(filePath));
      }
    }
    return reply.status(404).send('Not found');
  });
}

export default registerDrawRoutes;