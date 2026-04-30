import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";

import { buildServer } from "./app.js";

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to determine server port"));
        return;
      }

      resolve(address.port);
    });
  });
}

function wsAccept(key: string): string {
  return createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
}

test("GET /vscode/* proxies HTTP requests to the active VS Code Web target", async () => {
  let receivedUrl = "";
  let receivedHost = "";
  const upstream = createServer((request, response) => {
    receivedUrl = request.url ?? "";
    receivedHost = request.headers.host ?? "";
    response.statusCode = 200;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end("proxied-ok");
  });
  const upstreamPort = await listen(upstream);

  const { app } = buildServer({
    vsCodeWebManager: {
      dispose: async () => {},
      getProxyTargetUrl: () => `http://127.0.0.1:${upstreamPort}`,
    } as never,
  });

  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/vscode/test/path?via=proxy`,
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "proxied-ok");
    assert.equal(receivedUrl, "/test/path?via=proxy");
    assert.equal(receivedHost, `127.0.0.1:${address.port}`);
  } finally {
    await app.close();
    await new Promise<void>((resolve, reject) => {
      upstream.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("GET /vscode/* prefers browser origin when forwarding host and protocol to the upstream VS Code Web server", async () => {
  let receivedForwardedHost = "";
  let receivedForwardedProto = "";
  const upstream = createServer((request, response) => {
    receivedForwardedHost =
      (request.headers["x-forwarded-host"] as string | undefined) ?? "";
    receivedForwardedProto =
      (request.headers["x-forwarded-proto"] as string | undefined) ?? "";
    response.statusCode = 204;
    response.end();
  });
  const upstreamPort = await listen(upstream);

  const { app } = buildServer({
    vsCodeWebManager: {
      dispose: async () => {},
      getProxyTargetUrl: () => `http://127.0.0.1:${upstreamPort}`,
    } as never,
  });

  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/vscode/`, {
      headers: {
        origin: "https://127.0.0.1:3000",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(receivedForwardedHost, "127.0.0.1:3000");
    assert.equal(receivedForwardedProto, "https");
  } finally {
    await app.close();
    await new Promise<void>((resolve, reject) => {
      upstream.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("GET /vscode returns 503 when no active VS Code Web target exists", async () => {
  const { app } = buildServer({
    vsCodeWebManager: {
      dispose: async () => {},
      getProxyTargetUrl: () => null,
    } as never,
  });

  await app.ready();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/vscode/",
    });

    assert.equal(response.statusCode, 503);
    assert.match(response.body, /VS Code Web/);
  } finally {
    await app.close();
  }
});

test("/vscode proxies WebSocket upgrades to the active VS Code Web target", async () => {
  let receivedUpgradeUrl = "";
  const upstream = createServer();
  upstream.on("upgrade", (request, socket) => {
    receivedUpgradeUrl = request.url ?? "";
    const keyHeader = request.headers["sec-websocket-key"];
    const key = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;
    assert.ok(key);

    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${wsAccept(key)}`,
        "",
        "",
      ].join("\r\n"),
    );
    socket.write(Buffer.from([0x81, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]));
    socket.end();
  });
  const upstreamPort = await listen(upstream);

  const { app } = buildServer({
    vsCodeWebManager: {
      dispose: async () => {},
      getProxyTargetUrl: () => `http://127.0.0.1:${upstreamPort}`,
    } as never,
  });

  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const receivedMessage = await new Promise<string>((resolve, reject) => {
      const socket = new WebSocket(
        `ws://127.0.0.1:${address.port}/vscode/socket?channel=1`,
      );

      socket.addEventListener("message", (event) => {
        resolve(String(event.data));
        socket.close();
      });
      socket.addEventListener("error", () => {
        reject(new Error("WebSocket proxy handshake failed"));
      });
    });

    assert.equal(receivedMessage, "hello");
    assert.equal(receivedUpgradeUrl, "/socket?channel=1");
  } finally {
    await app.close();
    await new Promise<void>((resolve, reject) => {
      upstream.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
