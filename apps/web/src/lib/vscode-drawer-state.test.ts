import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { OpenVsCodeWebResponse } from "@agent-orchestrator/shared";

import {
  applyVsCodeWebOpenResponse,
  createCachedVsCodeWebEntry,
  shouldEnsureVsCodeWebOnOpen,
} from "./vscode-drawer-state.js";

function buildResponse(): OpenVsCodeWebResponse {
  return {
    provider: "code-server",
    reused: true,
    url: "https://localhost:3000/vscode/?workspace=%2Ftmp%2Fproject.code-workspace",
    workingDirectory: "/tmp/project",
  };
}

describe("vscode-drawer-state", () => {
  it("revalidates restored cache and forces one reload when the confirmed response matches", () => {
    const response = buildResponse();
    const cachedEntry = createCachedVsCodeWebEntry(response);

    assert.equal(shouldEnsureVsCodeWebOnOpen(cachedEntry), true);

    const confirmedEntry = applyVsCodeWebOpenResponse(cachedEntry, response);

    assert.equal(confirmedEntry.needsServerCheck, false);
    assert.equal(confirmedEntry.reloadKey, 1);
    assert.deepEqual(confirmedEntry.response, response);
  });

  it("does not reload the iframe when only the reused flag changes", () => {
    const initialResponse = {
      ...buildResponse(),
      reused: false,
    } satisfies OpenVsCodeWebResponse;
    const reopenedResponse = {
      ...initialResponse,
      reused: true,
    } satisfies OpenVsCodeWebResponse;

    const openEntry = applyVsCodeWebOpenResponse(null, initialResponse);
    const refreshedEntry = applyVsCodeWebOpenResponse(
      openEntry,
      reopenedResponse,
    );

    assert.equal(refreshedEntry.reloadKey, 0);
    assert.equal(refreshedEntry, openEntry);
  });
});
