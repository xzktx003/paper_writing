import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  loadLayoutState,
  saveLayoutState,
  deriveLayoutMode,
} from "./layout-store.js";

// Minimal localStorage shim for Node
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
};

describe("layout-store", () => {
  it("returns default state when nothing saved", () => {
    store.clear();
    const state = loadLayoutState();
    assert.equal(state.sidebarCollapsed, false);
    assert.equal(state.topbarCollapsed, false);
  });

  it("persists and loads state", () => {
    store.clear();
    saveLayoutState({ sidebarCollapsed: true, topbarCollapsed: false });
    const state = loadLayoutState();
    assert.equal(state.sidebarCollapsed, true);
    assert.equal(state.topbarCollapsed, false);
  });

  it("derives expanded when both open", () => {
    const mode = deriveLayoutMode({
      sidebarCollapsed: false,
      topbarCollapsed: false,
    });
    assert.equal(mode, "expanded");
  });

  it("derives compact when sidebar collapsed", () => {
    const mode = deriveLayoutMode({
      sidebarCollapsed: true,
      topbarCollapsed: false,
    });
    assert.equal(mode, "compact");
  });

  it("derives immersive when both collapsed", () => {
    const mode = deriveLayoutMode({
      sidebarCollapsed: true,
      topbarCollapsed: true,
    });
    assert.equal(mode, "immersive");
  });

  it("falls back gracefully on corrupt data", () => {
    store.set("agent-console-layout", "not-json{{{");
    const state = loadLayoutState();
    assert.equal(state.sidebarCollapsed, false);
    assert.equal(state.topbarCollapsed, false);
  });
});
