import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { resolveVsCodeWebRequestTarget } from "./vscode-web-request-target.js";

const VSCODE_WEB_PROXY_PREFIX = "/vscode";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

interface VsCodeWebProxyManagerLike {
  getProxyTargetUrl(): string | null;
}

function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function appendForwardedFor(
  existing: string | string[] | undefined,
  remoteAddress?: string,
): string | undefined {
  const nextAddress = remoteAddress?.trim();
  const current = Array.isArray(existing) ? existing.join(", ") : existing;
  if (!current) {
    return nextAddress;
  }

  if (!nextAddress) {
    return current;
  }

  return `${current}, ${nextAddress}`;
}

function rewriteProxyPath(input: string): string {
  const url = new URL(input, "http://vscode-web-proxy.local");
  if (url.pathname === VSCODE_WEB_PROXY_PREFIX) {
    url.pathname = "/";
  } else if (url.pathname.startsWith(`${VSCODE_WEB_PROXY_PREFIX}/`)) {
    url.pathname = url.pathname.slice(VSCODE_WEB_PROXY_PREFIX.length);
  }

  return `${url.pathname}${url.search}`;
}

function resolveProxyTarget(
  vsCodeWebManager: VsCodeWebProxyManagerLike,
): URL | null {
  const targetUrl = vsCodeWebManager.getProxyTargetUrl();
  if (!targetUrl) {
    return null;
  }

  return new URL(targetUrl);
}

function serializeProxyBody(body: unknown): Buffer | null {
  if (body === undefined || body === null) {
    return null;
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (typeof body === "string") {
    return Buffer.from(body);
  }

  return Buffer.from(JSON.stringify(body));
}

function buildProxyRequestHeaders(
  request: FastifyRequest,
  overrideContentLength?: number,
): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {};
  const { requestHost, requestProtocol } =
    resolveVsCodeWebRequestTarget(request);

  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      continue;
    }

    headers[name] = value;
  }

  if (requestHost) {
    headers.host = requestHost;
    headers["x-forwarded-host"] = requestHost;
  } else if (request.headers.host) {
    headers.host = request.headers.host;
    headers["x-forwarded-host"] = request.headers.host;
  }

  headers["x-forwarded-proto"] = requestProtocol;

  const forwardedFor = appendForwardedFor(
    request.headers["x-forwarded-for"],
    request.ip,
  );
  if (forwardedFor) {
    headers["x-forwarded-for"] = forwardedFor;
  }

  if (overrideContentLength !== undefined) {
    headers["content-length"] = String(overrideContentLength);
  }

  return headers;
}

function writeProxyError(
  response: NodeJS.WritableStream & {
    end: (chunk?: string | Buffer) => void;
    headersSent?: boolean;
    setHeader?: (name: string, value: string) => void;
    statusCode?: number;
  },
  statusCode: number,
  message: string,
): void {
  if (response.headersSent) {
    response.end();
    return;
  }

  response.statusCode = statusCode;
  response.setHeader?.("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify({ error: message }));
}

async function forwardUpstreamMessage(
  clientSocket: {
    send: (data: string | Buffer, options?: { binary?: boolean }) => void;
  },
  data: unknown,
): Promise<void> {
  if (typeof data === "string") {
    clientSocket.send(data);
    return;
  }

  if (data instanceof ArrayBuffer) {
    clientSocket.send(Buffer.from(data), { binary: true });
    return;
  }

  if (ArrayBuffer.isView(data)) {
    clientSocket.send(
      Buffer.from(data.buffer, data.byteOffset, data.byteLength),
      {
        binary: true,
      },
    );
    return;
  }

  if (data instanceof Blob) {
    clientSocket.send(Buffer.from(await data.arrayBuffer()), { binary: true });
  }
}

async function proxyHttpRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  vsCodeWebManager: VsCodeWebProxyManagerLike,
): Promise<void> {
  const targetBaseUrl = resolveProxyTarget(vsCodeWebManager);
  if (!targetBaseUrl) {
    reply.code(503);
    await reply.send({ error: "VS Code Web 当前未启动，无法代理请求。" });
    return;
  }

  const targetUrl = new URL(
    rewriteProxyPath(request.raw.url ?? request.url),
    `${targetBaseUrl.origin}/`,
  );
  const serializedBody = serializeProxyBody(request.body);
  reply.hijack();
  const proxyRequest = (
    targetUrl.protocol === "https:" ? httpsRequest : httpRequest
  )(
    targetUrl,
    {
      headers: buildProxyRequestHeaders(request, serializedBody?.byteLength),
      method: request.method,
    },
    (proxyResponse) => {
      reply.raw.statusCode = proxyResponse.statusCode ?? 502;

      for (const [name, value] of Object.entries(proxyResponse.headers)) {
        if (value === undefined || HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
          continue;
        }

        reply.raw.setHeader(name, value);
      }

      proxyResponse.pipe(reply.raw);
    },
  );

  proxyRequest.on("error", (error) => {
    writeProxyError(reply.raw, 502, `VS Code Web 代理失败: ${error.message}`);
  });

  if (serializedBody) {
    proxyRequest.end(serializedBody);
    return;
  }

  request.raw.pipe(proxyRequest);
}

function proxyWebSocketConnection(
  clientSocket: {
    close: (code?: number, data?: Buffer) => void;
    on: (event: string, listener: (...args: any[]) => void) => void;
    send: (data: string | Buffer, options?: { binary?: boolean }) => void;
  },
  request: FastifyRequest,
  vsCodeWebManager: VsCodeWebProxyManagerLike,
): void {
  const targetBaseUrl = resolveProxyTarget(vsCodeWebManager);
  if (!targetBaseUrl) {
    clientSocket.close(1011, Buffer.from("VS Code Web unavailable"));
    return;
  }

  const targetProtocol = targetBaseUrl.protocol === "https:" ? "wss:" : "ws:";
  const upstream = new WebSocket(
    `${targetProtocol}//${targetBaseUrl.host}${rewriteProxyPath(
      request.raw.url ?? request.url,
    )}`,
  );
  upstream.binaryType = "arraybuffer";

  clientSocket.on("message", (data: Buffer, isBinary: boolean) => {
    if (upstream.readyState !== WebSocket.OPEN) {
      return;
    }

    upstream.send(isBinary ? data : data.toString("utf8"));
  });

  clientSocket.on("close", () => {
    if (
      upstream.readyState === WebSocket.OPEN ||
      upstream.readyState === WebSocket.CONNECTING
    ) {
      upstream.close();
    }
  });

  clientSocket.on("error", () => {
    if (
      upstream.readyState === WebSocket.OPEN ||
      upstream.readyState === WebSocket.CONNECTING
    ) {
      upstream.close();
    }
  });

  upstream.addEventListener("message", (event) => {
    void forwardUpstreamMessage(clientSocket, event.data);
  });
  upstream.addEventListener("close", () => {
    clientSocket.close();
  });
  upstream.addEventListener("error", () => {
    clientSocket.close(1011, Buffer.from("VS Code Web upstream failed"));
  });
}

export async function registerVsCodeWebProxyRoutes(
  fastify: FastifyInstance,
  options: { vsCodeWebManager: VsCodeWebProxyManagerLike },
): Promise<void> {
  const { vsCodeWebManager } = options;
  const proxyHandler = async (request: FastifyRequest, reply: FastifyReply) =>
    proxyHttpRequest(request, reply, vsCodeWebManager);

  fastify.route({
    handler: proxyHandler,
    method: ["DELETE", "GET", "OPTIONS", "PATCH", "POST", "PUT"],
    url: `${VSCODE_WEB_PROXY_PREFIX}`,
  });
  fastify.route({
    handler: proxyHandler,
    method: ["DELETE", "GET", "OPTIONS", "PATCH", "POST", "PUT"],
    url: `${VSCODE_WEB_PROXY_PREFIX}/`,
  });
  fastify.route({
    handler: proxyHandler,
    method: "GET",
    url: `${VSCODE_WEB_PROXY_PREFIX}/*`,
    wsHandler: (socket, request) => {
      proxyWebSocketConnection(socket as never, request, vsCodeWebManager);
    },
  });
  fastify.route({
    handler: proxyHandler,
    method: ["DELETE", "OPTIONS", "PATCH", "POST", "PUT"],
    url: `${VSCODE_WEB_PROXY_PREFIX}/*`,
  });
}
