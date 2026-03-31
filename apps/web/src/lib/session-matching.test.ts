import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type {
  AgentSessionRecord,
  ScanResult,
} from "@agent-orchestrator/shared";

import {
  sortScanResults,
  shellQuote,
  formatWorkingDirectory,
  buildDirectLaunchCommand,
  buildTmuxLaunchCommand,
  buildTmuxAttachCommand,
  buildDefaultSessionName,
  findExistingSession,
} from "./session-matching.js";

function makeScanResult(partial: Partial<ScanResult>): ScanResult {
  return {
    agentKind: "claude",
    status: "running",
    displayName: "test",
    workingDirectory: "~/code",
    ...partial,
  };
}

function makeSession(partial: Partial<AgentSessionRecord>): AgentSessionRecord {
  return {
    id: "s1",
    workspaceId: "default",
    sourceType: "local",
    agentKind: "claude",
    displayName: "test",
    connectionState: "online",
    interactionState: "running",
    ...partial,
  };
}

describe("sortScanResults", () => {
  it("sorts running before stopped", () => {
    const results = sortScanResults([
      makeScanResult({ status: "stopped", displayName: "a" }),
      makeScanResult({ status: "running", displayName: "b" }),
    ]);
    assert.equal(results[0].displayName, "b");
    assert.equal(results[1].displayName, "a");
  });

  it("sorts by kind priority then name", () => {
    const results = sortScanResults([
      makeScanResult({ agentKind: "shell", displayName: "z" }),
      makeScanResult({ agentKind: "copilot", displayName: "a" }),
      makeScanResult({ agentKind: "claude", displayName: "b" }),
    ]);
    assert.equal(results[0].agentKind, "copilot");
    assert.equal(results[1].agentKind, "claude");
    assert.equal(results[2].agentKind, "shell");
  });
});

describe("shellQuote", () => {
  it("quotes simple string", () => {
    assert.equal(shellQuote("hello"), "'hello'");
  });

  it("escapes single quotes", () => {
    assert.equal(shellQuote("it's"), "'it'\\''s'");
  });
});

describe("formatWorkingDirectory", () => {
  it("returns ~ for home", () => {
    assert.equal(formatWorkingDirectory("~"), "~");
    assert.equal(formatWorkingDirectory("~/"), "~");
  });

  it("quotes absolute paths", () => {
    assert.equal(formatWorkingDirectory("/tmp"), "'/tmp'");
  });

  it("handles ~/ paths", () => {
    const result = formatWorkingDirectory("~/my project");
    assert.equal(result, "~/'my project'");
  });
});

describe("buildDirectLaunchCommand", () => {
  it("builds cd + invocation", () => {
    const cmd = buildDirectLaunchCommand("claude", "~/code", "test");
    assert.ok(cmd.startsWith("cd ~/'code'"));
    assert.ok(cmd.includes("claude -n"));
  });

  it("returns empty for shell kind", () => {
    const cmd = buildDirectLaunchCommand("shell", "~/code", "test");
    assert.equal(cmd, "");
  });

  it("uses --resume for sessionId", () => {
    const cmd = buildDirectLaunchCommand(
      "claude",
      "~/code",
      "test",
      "sess-123",
    );
    assert.ok(cmd.includes("--resume=sess-123"));
  });
});

describe("buildTmuxLaunchCommand", () => {
  it("builds tmux new-session for shell", () => {
    const cmd = buildTmuxLaunchCommand("shell", "~/code", "test", "my-session");
    assert.ok(cmd.startsWith("tmux new-session -s"));
    assert.ok(cmd.includes("'my-session'"));
  });
});

describe("buildTmuxAttachCommand", () => {
  it("attaches to session", () => {
    const cmd = buildTmuxAttachCommand("dev");
    assert.equal(cmd, "tmux attach -t 'dev'");
  });

  it("selects pane then attaches", () => {
    const cmd = buildTmuxAttachCommand("dev", "%5");
    assert.ok(cmd.includes("tmux select-pane -t '%5'"));
    assert.ok(cmd.includes("tmux attach -t 'dev'"));
  });
});

describe("buildDefaultSessionName", () => {
  it("uses simple name for direct mode", () => {
    const name = buildDefaultSessionName("claude", "direct");
    assert.equal(name, "claude 新会话");
  });

  it("includes timestamp for tmux mode", () => {
    const name = buildDefaultSessionName("claude", "tmux");
    assert.ok(name.startsWith("claude 新会话 "));
    assert.ok(name.length > "claude 新会话 ".length);
  });
});

describe("findExistingSession", () => {
  it("matches by sessionId", () => {
    const result = makeScanResult({ sessionId: "agent-1" });
    const sessions = [makeSession({ id: "s1", agentSessionId: "agent-1" })];
    const match = findExistingSession(result, sessions);
    assert.equal(match?.id, "s1");
  });

  it("matches by tmuxSession", () => {
    const result = makeScanResult({ tmuxSession: "dev-tmux" });
    const sessions = [
      makeSession({
        id: "s2",
        transportRef: { tmuxSession: "dev-tmux" },
      }),
    ];
    const match = findExistingSession(result, sessions);
    assert.equal(match?.id, "s2");
  });

  it("matches tmux session on the same host only", () => {
    const result = makeScanResult({
      tmuxSession: "shared-name",
      sshTarget: { host: "remote-b", port: 22 },
    });
    const sessions = [
      makeSession({
        id: "s-remote-a",
        hostId: "remote-a",
        transportRef: { tmuxSession: "shared-name" },
      }),
      makeSession({
        id: "s-remote-b",
        hostId: "remote-b",
        transportRef: { tmuxSession: "shared-name" },
      }),
    ];

    const match = findExistingSession(result, sessions);
    assert.equal(match?.id, "s-remote-b");
  });

  it("matches by host+cwd+kind", () => {
    const result = makeScanResult({
      agentKind: "claude",
      workingDirectory: "~/code",
    });
    const sessions = [
      makeSession({
        id: "s3",
        agentKind: "claude",
        workingDirectory: "~/code",
      }),
    ];
    const match = findExistingSession(result, sessions);
    assert.equal(match?.id, "s3");
  });

  it("does not fall back to cwd+kind when sessionId differs", () => {
    const result = makeScanResult({
      agentKind: "copilot",
      workingDirectory: "~/code",
      sessionId: "agent-2",
    });
    const sessions = [
      makeSession({
        id: "s-running",
        agentKind: "copilot",
        workingDirectory: "~/code",
        agentSessionId: "agent-1",
      }),
    ];

    const match = findExistingSession(result, sessions);
    assert.equal(match, undefined);
  });

  it("returns undefined when no match", () => {
    const result = makeScanResult({
      agentKind: "copilot",
      workingDirectory: "~/other",
    });
    const sessions = [
      makeSession({
        id: "s1",
        agentKind: "claude",
        workingDirectory: "~/code",
      }),
    ];
    const match = findExistingSession(result, sessions);
    assert.equal(match, undefined);
  });
});
