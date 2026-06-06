/**
 * MCP (Model Context Protocol) Routes
 * 暴露 Paper Agent 核心能力为标准 MCP 工具
 *
 * 端点:
 *   POST /api/mcp         — JSON-RPC over HTTP (标准 MCP 传输)
 *   GET  /api/mcp/sse     — SSE 传输 (Claude Desktop / Copilot 等使用)
 *   POST /api/mcp/message — SSE 模式下的消息投递
 *   GET  /api/mcp/info    — 服务信息（非 MCP 协议，用于发现）
 */

import { handleMcpRequest } from '../services/mcpServer.js';

// SSE 连接管理
const sseClients = new Map();
let sseMessageId = 0;

function firstHeaderValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function getPublicBaseUrl(request) {
  const forwardedProto = firstHeaderValue(request.headers['x-forwarded-proto']);
  const forwardedHost = firstHeaderValue(request.headers['x-forwarded-host']);
  const protocol = forwardedProto || request.protocol || 'http';
  const host = forwardedHost || request.headers.host || '10.30.0.22:8787';
  return `${protocol}://${host}`;
}

/**
 * 注册 MCP 路由
 * @param {import('fastify').FastifyInstance} fastify
 */
export function registerMcpRoutes(fastify) {
  /**
   * GET /api/mcp/info
   * 非 MCP 协议端点 — 返回服务信息，便于外部工具发现
   */
  fastify.get('/api/mcp/info', async (request) => {
    const baseUrl = getPublicBaseUrl(request);
    return {
      name: 'Paper Agent MCP Server',
      version: '1.0.0',
      description: 'Academic paper writing assistant with citation verification, LaTeX compilation, and AI-powered writing tools.',
      protocol: 'Model Context Protocol (2024-11-05)',
      transport: ['http-post', 'sse'],
      endpoints: {
        'json-rpc': 'POST /api/mcp',
        'sse': 'GET /api/mcp/sse',
        'sse-message': 'POST /api/mcp/message',
      },
      tools: [
        'paper_search',
        'verify_citations',
        'cross_check_citations',
        'compile_latex',
        'read_project_file',
        'ai_polish',
        'ai_review',
      ],
      configuration: {
        'claude-desktop': {
          mcpServers: {
            'paper-agent': {
              url: `${baseUrl}/api/mcp/sse`,
            },
          },
        },
        'cursor': {
          mcpServers: {
            'paper-agent': {
              url: `${baseUrl}/api/mcp`,
            },
          },
        },
      },
    };
  });

  /**
   * POST /api/mcp
   * 标准 JSON-RPC over HTTP 传输
   * 支持: initialize, tools/list, tools/call
   */
  fastify.post('/api/mcp', async (request, reply) => {
    const response = await handleMcpRequest(request.body);
    if (response === null) {
      // notifications/initialized — 无需响应
      return reply.code(204).send();
    }
    return response;
  });

  /**
   * GET /api/mcp/sse
   * SSE 传输端点 — 保持长连接，客户端通过 POST /api/mcp/message 发送请求
   * 兼容 Claude Desktop、Copilot 等 MCP 客户端
   */
  fastify.get('/api/mcp/sse', async (request, reply) => {
    const clientId = `client-${++sseMessageId}`;
    sseClients.set(clientId, { reply, alive: true });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // 发送 endpoint 事件告知客户端消息投递地址
    reply.raw.write(`event: endpoint\ndata: /api/mcp/message?id=${clientId}\n\n`);

    // 心跳保活
    const heartbeat = setInterval(() => {
      if (sseClients.has(clientId)) {
        reply.raw.write(': heartbeat\n\n');
      }
    }, 30000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(clientId);
    });
  });

  /**
   * POST /api/mcp/message?id=<clientId>
   * SSE 模式下的消息投递端点
   * 客户端通过此端点发送 JSON-RPC 请求，服务端通过 SSE 推送响应
   */
  fastify.post('/api/mcp/message', async (request, reply) => {
    const clientId = request.query?.id;
    if (!clientId) {
      return reply.code(400).send({ error: 'Missing id query parameter' });
    }

    const client = sseClients.get(clientId);
    if (!client) {
      return reply.code(404).send({ error: 'SSE client not found. Connect via GET /api/mcp/sse first.' });
    }

    const response = await handleMcpRequest(request.body);
    if (response === null) {
      return reply.code(204).send();
    }

    // 通过 SSE 推送响应
    client.reply.raw.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    return { ok: true };
  });
}
