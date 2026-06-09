import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { OpenVsCodeWebResponse } from "@agent-orchestrator/shared";

import {
  clearCachedVsCodeWebState,
  loadCachedVsCodeWebState,
  saveCachedVsCodeWebState,
} from "./vscode-web-state.js";

const store = new Map<string, string>();
(
  globalThis as typeof globalThis & {
    localStorage: Storage;
  }
).localStorage = {
  clear: () => store.clear(),
  getItem: (key: string) => store.get(key) ?? null,
  get length() {
    return store.size;
  },
  key: (index: number) => [...store.keys()][index] ?? null,
  removeItem: (key: string) => {
    store.delete(key);
  },
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
};

function buildResponse(url: string): OpenVsCodeWebResponse {
  return {
    provider: "code-server",
    reused: true,
    url,
    workingDirectory: "/tmp/project-a",
  };
}

describe("vscode-web-state", () => {
  afterEach(() => {
    store.clear();
  });

  it("returns null when nothing has been cached for a session", () => {
    assert.equal(loadCachedVsCodeWebState("session-a"), null);
  });

  it("persists and reloads the last successful vscode web response for a session", () => {
    const response = buildResponse(
      "http://localhost:3000/vscode/?folder=%2Ftmp",
    );

    saveCachedVsCodeWebState("session-a", response);

    assert.deepEqual(loadCachedVsCodeWebState("session-a"), response);
  });

  it("keeps each session cache isolated", () => {
    saveCachedVsCodeWebState(
      "session-a",
      buildResponse("http://localhost:3000/vscode/?folder=%2Fa"),
    );
    saveCachedVsCodeWebState(
      "session-b",
      buildResponse("http://localhost:3000/vscode/?folder=%2Fb"),
    );

    assert.match(
      loadCachedVsCodeWebState("session-a")?.url ?? "",
      /folder=%2Fa/,
    );
    assert.match(
      loadCachedVsCodeWebState("session-b")?.url ?? "",
      /folder=%2Fb/,
    );
  });

  it("clears a cached session entry", () => {
    saveCachedVsCodeWebState(
      "session-a",
      buildResponse("http://localhost:3000/vscode/?folder=%2Ftmp"),
    );

    clearCachedVsCodeWebState("session-a");

    assert.equal(loadCachedVsCodeWebState("session-a"), null);
  });

  it("falls back gracefully on corrupt cached data", () => {
    store.set("vscode-web-state:session-a", "{not-json");

    assert.equal(loadCachedVsCodeWebState("session-a"), null);
  });
});
