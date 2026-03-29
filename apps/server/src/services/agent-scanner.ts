import { execSync, type ExecSyncOptions } from "child_process";
import * as fs from "fs";
import * as path from "path";

import type {
  ScanDirectoryInput,
  ScanDirectoryResponse,
  ScanResult,
  SshTarget,
} from "@agent-orchestrator/shared";

const AGENT_INDICATORS: Record<string, { dirs: string[]; files: string[] }> = {
  claude: {
    dirs: [".claude"],
    files: [".claude_history"],
  },
  copilot: {
    dirs: [".copilot"],
    files: [],
  },
  codex: {
    dirs: [".codex"],
    files: [],
  },
  aider: {
    dirs: [".aider.chat.history.md"],
    files: [".aider.chat.history.md"],
  },
  cursor: {
    dirs: [".cursor"],
    files: [],
  },
};

const AGENT_PROCESS_NAMES = ["claude", "copilot", "codex", "aider", "cursor"];

function execLocal(command: string, options?: ExecSyncOptions): string {
  try {
    const output = execSync(command, {
      encoding: "utf8",
      timeout: 10000,
      ...options,
    });
    return typeof output === "string" ? output.trim() : "";
  } catch {
    return "";
  }
}

function execRemote(sshTarget: SshTarget, command: string): string {
  const portArg = sshTarget.port ? `-p ${sshTarget.port}` : "";
  const userHost = sshTarget.username
    ? `${sshTarget.username}@${sshTarget.host}`
    : sshTarget.host;
  const identityArg = sshTarget.identityFile
    ? `-i ${sshTarget.identityFile}`
    : "";

  const sshCommand = `ssh -o BatchMode=yes -o ConnectTimeout=5 ${portArg} ${identityArg} ${userHost} '${command.replace(/'/g, "'\\''")}'`;

  return execLocal(sshCommand);
}

function scanLocalHistory(dirPath: string): ScanResult[] {
  const results: ScanResult[] = [];

  for (const [agentKind, indicators] of Object.entries(AGENT_INDICATORS)) {
    for (const dir of indicators.dirs) {
      const fullPath = path.join(dirPath, dir);
      if (fs.existsSync(fullPath)) {
        let lastActivity: string | undefined;
        try {
          const stat = fs.statSync(fullPath);
          lastActivity = stat.mtime.toISOString();
        } catch {
          /* ignore */
        }

        results.push({
          agentKind,
          status: "stopped",
          displayName: `${agentKind} (${path.basename(dirPath)})`,
          workingDirectory: dirPath,
          lastActivity,
          historyPath: fullPath,
        });
      }
    }

    for (const file of indicators.files) {
      const fullPath = path.join(dirPath, file);
      if (
        fs.existsSync(fullPath) &&
        !results.some(
          (r) => r.agentKind === agentKind && r.workingDirectory === dirPath,
        )
      ) {
        let lastActivity: string | undefined;
        try {
          const stat = fs.statSync(fullPath);
          lastActivity = stat.mtime.toISOString();
        } catch {
          /* ignore */
        }

        results.push({
          agentKind,
          status: "stopped",
          displayName: `${agentKind} (${path.basename(dirPath)})`,
          workingDirectory: dirPath,
          lastActivity,
          historyPath: fullPath,
        });
      }
    }
  }

  return results;
}

function scanLocalProcesses(dirPath: string): ScanResult[] {
  const results: ScanResult[] = [];

  for (const procName of AGENT_PROCESS_NAMES) {
    const output = execLocal(`pgrep -af "${procName}" 2>/dev/null || true`);
    if (!output) continue;

    for (const line of output.split("\n")) {
      if (!line.trim()) continue;

      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[0], 10);
      if (isNaN(pid)) continue;

      const cmdline = parts.slice(1).join(" ");
      if (
        cmdline.includes(dirPath) ||
        cmdline.includes(path.basename(dirPath))
      ) {
        results.push({
          agentKind: procName,
          status: "running",
          displayName: `${procName} (PID ${pid})`,
          workingDirectory: dirPath,
          pid,
        });
      }
    }
  }

  return results;
}

function scanLocalTmux(dirPath: string): ScanResult[] {
  const results: ScanResult[] = [];

  const tmuxBin =
    process.platform === "darwin" ? "/opt/homebrew/bin/tmux" : "tmux";

  const panes = execLocal(
    `${tmuxBin} list-panes -a -F '#{session_name}:#{pane_id}:#{pane_current_path}:#{pane_current_command}' 2>/dev/null || true`,
  );
  if (!panes) return results;

  for (const line of panes.split("\n")) {
    if (!line.trim()) continue;

    const parts = line.split(":");
    if (parts.length < 4) continue;

    const [session, paneId, panePath, command] = parts;
    if (panePath?.includes(dirPath) || dirPath.includes(panePath ?? "")) {
      const isAgent = AGENT_PROCESS_NAMES.some(
        (name) =>
          command?.toLowerCase().includes(name) ||
          session?.toLowerCase().includes(name),
      );

      results.push({
        agentKind: isAgent ? (command ?? "shell") : "shell",
        status: "running",
        displayName: `tmux:${session} (${command})`,
        workingDirectory: panePath ?? dirPath,
        tmuxSession: session,
        tmuxPane: paneId,
      });
    }
  }

  return results;
}

function resolveRemotePath(sshTarget: SshTarget, remotePath: string): string {
  if (!remotePath.startsWith("~")) return remotePath;
  const resolved = execRemote(sshTarget, `echo ${remotePath}`);
  return resolved || remotePath;
}

function parseSimpleYaml(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    if (match) {
      result[match[1]] = match[2].trim();
    }
  }
  return result;
}

/**
 * Scan copilot session-state directories to find sessions
 * with proper names and session IDs for --resume.
 */
function scanCopilotSessionsRemote(
  sshTarget: SshTarget,
  remotePath: string,
): ScanResult[] {
  const results: ScanResult[] = [];

  // Detect copilot binary path (nvm loads in interactive shells)
  const copilotBin = execRemote(
    sshTarget,
    `zsh -i -c 'which copilot' 2>/dev/null || bash -i -c 'which copilot' 2>/dev/null`,
  );

  // Batch read all workspace.yaml files and lock info in one SSH call
  const output = execRemote(
    sshTarget,
    `for d in ~/.copilot/session-state/*/; do ` +
      `echo "SESSION_START"; ` +
      `cat "$d/workspace.yaml" 2>/dev/null || echo "NO_YAML"; ` +
      `echo "LOCK_INFO:$(ls "$d"/inuse.*.lock 2>/dev/null | head -1)"; ` +
      `echo "SESSION_END"; ` +
      `done`,
  );

  if (!output || output === "NO_YAML") return results;

  const blocks = output.split("SESSION_START").filter((b) => b.trim());

  for (const block of blocks) {
    if (block.includes("NO_YAML") && !block.includes("id:")) continue;

    // Extract lock info
    const lockMatch = block.match(/LOCK_INFO:(.*)$/m);
    const lockFile = lockMatch?.[1]?.trim() ?? "";

    // Parse workspace.yaml content (everything before LOCK_INFO)
    const yamlText = block.split("LOCK_INFO:")[0] ?? "";
    const meta = parseSimpleYaml(yamlText);

    if (!meta.id || !meta.cwd) continue;

    // Only include sessions whose cwd matches the scanned path
    if (
      meta.cwd !== remotePath &&
      !remotePath.includes(meta.cwd) &&
      !meta.cwd.includes(remotePath)
    )
      continue;

    // Determine running state from lock file
    let isRunning = false;
    if (lockFile) {
      const pidMatch = lockFile.match(/inuse\.(\d+)\.lock/);
      if (pidMatch) {
        const lockPid = pidMatch[1];
        // Check if the process is still alive
        const alive = execRemote(
          sshTarget,
          `kill -0 ${lockPid} 2>/dev/null && echo alive || echo dead`,
        );
        isRunning = alive === "alive";
      }
    }

    const sessionName = meta.name || meta.summary || undefined;
    const displayLabel = sessionName
      ? `${sessionName}`
      : `copilot (${path.basename(meta.cwd)})`;

    results.push({
      agentKind: "copilot",
      status: isRunning ? "running" : "stopped",
      displayName: displayLabel,
      workingDirectory: meta.cwd,
      sessionId: meta.id,
      sessionName,
      lastActivity: meta.updated_at,
      binaryPath: copilotBin || undefined,
      sshTarget,
    });
  }

  return results;
}

function scanCopilotSessionsLocal(dirPath: string): ScanResult[] {
  const results: ScanResult[] = [];
  const home = process.env.HOME ?? "/root";
  const sessionDir = path.join(home, ".copilot", "session-state");

  if (!fs.existsSync(sessionDir)) return results;

  for (const entry of fs.readdirSync(sessionDir)) {
    const entryPath = path.join(sessionDir, entry);
    const yamlPath = path.join(entryPath, "workspace.yaml");
    if (!fs.existsSync(yamlPath)) continue;

    try {
      const yamlText = fs.readFileSync(yamlPath, "utf8");
      const meta = parseSimpleYaml(yamlText);

      if (!meta.id || !meta.cwd) continue;
      if (
        meta.cwd !== dirPath &&
        !dirPath.includes(meta.cwd) &&
        !meta.cwd.includes(dirPath)
      )
        continue;

      // Check lock files
      let isRunning = false;
      const lockFiles = fs
        .readdirSync(entryPath)
        .filter((f) => f.startsWith("inuse.") && f.endsWith(".lock"));
      for (const lf of lockFiles) {
        const pidMatch = lf.match(/inuse\.(\d+)\.lock/);
        if (pidMatch) {
          try {
            process.kill(parseInt(pidMatch[1], 10), 0);
            isRunning = true;
          } catch {
            // Process not alive
          }
        }
      }

      const sessionName = meta.name || meta.summary || undefined;
      const displayLabel = sessionName
        ? `${sessionName}`
        : `copilot (${path.basename(meta.cwd)})`;

      results.push({
        agentKind: "copilot",
        status: isRunning ? "running" : "stopped",
        displayName: displayLabel,
        workingDirectory: meta.cwd,
        sessionId: meta.id,
        sessionName,
        lastActivity: meta.updated_at,
      });
    } catch {
      /* skip unreadable sessions */
    }
  }

  return results;
}

function scanRemoteHistory(
  sshTarget: SshTarget,
  remotePath: string,
): ScanResult[] {
  const results: ScanResult[] = [];

  const checkDirs = Object.entries(AGENT_INDICATORS)
    .flatMap(([kind, ind]) => ind.dirs.map((d) => `${kind}:${d}`))
    .concat(
      Object.entries(AGENT_INDICATORS).flatMap(([kind, ind]) =>
        ind.files.map((f) => `${kind}:${f}`),
      ),
    );

  for (const entry of checkDirs) {
    const [agentKind, indicator] = entry.split(":");
    const fullPath = `${remotePath}/${indicator}`;
    const output = execRemote(
      sshTarget,
      `test -e ${fullPath} && stat -c %Y ${fullPath} 2>/dev/null || stat -f %m ${fullPath} 2>/dev/null || echo ''`,
    );

    if (output && output !== "") {
      const timestamp = parseInt(output.trim(), 10);
      const lastActivity = isNaN(timestamp)
        ? undefined
        : new Date(timestamp * 1000).toISOString();

      if (
        !results.some(
          (r) => r.agentKind === agentKind && r.workingDirectory === remotePath,
        )
      ) {
        results.push({
          agentKind: agentKind!,
          status: "stopped",
          displayName: `${agentKind} (远程: ${path.basename(remotePath)})`,
          workingDirectory: remotePath,
          lastActivity,
          historyPath: fullPath,
          sshTarget,
        });
      }
    }
  }

  return results;
}

function scanRemoteProcesses(
  sshTarget: SshTarget,
  remotePath: string,
): ScanResult[] {
  const results: ScanResult[] = [];

  for (const procName of AGENT_PROCESS_NAMES) {
    const output = execRemote(
      sshTarget,
      `pgrep -af "${procName}" 2>/dev/null || true`,
    );
    if (!output) continue;

    for (const line of output.split("\n")) {
      if (!line.trim()) continue;

      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[0], 10);
      if (isNaN(pid)) continue;

      const cmdline = parts.slice(1).join(" ");
      if (
        cmdline.includes(remotePath) ||
        cmdline.includes(path.basename(remotePath))
      ) {
        results.push({
          agentKind: procName,
          status: "running",
          displayName: `${procName} (远程 PID ${pid})`,
          workingDirectory: remotePath,
          pid,
          sshTarget,
        });
      }
    }
  }

  return results;
}

function scanRemoteTmux(
  sshTarget: SshTarget,
  remotePath: string,
): ScanResult[] {
  const results: ScanResult[] = [];

  const panes = execRemote(
    sshTarget,
    `tmux list-panes -a -F '#{session_name}:#{pane_id}:#{pane_current_path}:#{pane_current_command}' 2>/dev/null || true`,
  );
  if (!panes) return results;

  for (const line of panes.split("\n")) {
    if (!line.trim()) continue;

    const parts = line.split(":");
    if (parts.length < 4) continue;

    const [session, paneId, panePath, command] = parts;

    // Check if pane is in the scanned path
    const pathMatch =
      panePath?.includes(remotePath) || remotePath.includes(panePath ?? "");

    // Also check if this pane runs a known agent process
    const isAgent = AGENT_PROCESS_NAMES.some(
      (name) =>
        command?.toLowerCase() === name ||
        session?.toLowerCase().includes(name),
    );

    if (pathMatch || isAgent) {
      results.push({
        agentKind: isAgent ? (command ?? "shell") : "shell",
        status: "running",
        displayName: `tmux:${session}/${command} (远程: ${panePath ? path.basename(panePath) : remotePath})`,
        workingDirectory: panePath ?? remotePath,
        tmuxSession: session,
        tmuxPane: paneId,
        sshTarget,
      });
    }
  }

  return results;
}

function normalizePathForMatch(value?: string): string {
  if (!value) return "";
  return value.replace(/\/+$|\s+/g, "").toLowerCase();
}

function isSameSshTarget(left?: SshTarget, right?: SshTarget): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;

  return (
    left.host === right.host &&
    (left.port ?? 22) === (right.port ?? 22) &&
    (left.username ?? "") === (right.username ?? "")
  );
}

function matchesTmuxResult(result: ScanResult, tmuxResult: ScanResult): boolean {
  if (!tmuxResult.tmuxSession || result.status !== "running") {
    return false;
  }

  if (!isSameSshTarget(result.sshTarget, tmuxResult.sshTarget)) {
    return false;
  }

  const resultPath = normalizePathForMatch(result.workingDirectory);
  const tmuxPath = normalizePathForMatch(tmuxResult.workingDirectory);
  const pathMatches =
    Boolean(resultPath) &&
    Boolean(tmuxPath) &&
    (resultPath.includes(tmuxPath) || tmuxPath.includes(resultPath));

  const agentMatches =
    result.agentKind === tmuxResult.agentKind ||
    tmuxResult.agentKind === 'shell' ||
    tmuxResult.displayName.toLowerCase().includes(result.agentKind.toLowerCase());

  const sessionNameMatches =
    Boolean(result.sessionName) &&
    tmuxResult.displayName
      .toLowerCase()
      .includes(result.sessionName!.toLowerCase());

  return (pathMatches && agentMatches) || sessionNameMatches;
}

function mergeTmuxResults(results: ScanResult[], tmuxResults: ScanResult[]): ScanResult[] {
  const remainingTmux = [...tmuxResults];
  const merged = results.map((result) => {
    const matchedIndex = remainingTmux.findIndex((tmuxResult) =>
      matchesTmuxResult(result, tmuxResult),
    );

    if (matchedIndex === -1) {
      return result;
    }

    const matched = remainingTmux.splice(matchedIndex, 1)[0];
    return {
      ...result,
      tmuxSession: matched.tmuxSession,
      tmuxPane: matched.tmuxPane,
      displayName: result.displayName,
    };
  });

  return [...merged, ...remainingTmux];
}

export function scanAgentDirectory(
  input: ScanDirectoryInput,
): ScanDirectoryResponse {
  const { path: dirPath, hostId, sshTarget } = input;

  let results: ScanResult[];

  if (sshTarget) {
    const resolvedPath = resolveRemotePath(sshTarget, dirPath);
    const historyResults = scanRemoteHistory(sshTarget, resolvedPath);
    const processResults = scanRemoteProcesses(sshTarget, resolvedPath);
    const tmuxResults = scanRemoteTmux(sshTarget, resolvedPath);
    const copilotSessions = scanCopilotSessionsRemote(sshTarget, resolvedPath);
    // Copilot sessions with sessionId take priority over generic results
    const copilotIds = new Set(
      copilotSessions.map((s) => s.agentKind + ":" + s.workingDirectory),
    );
    const filtered = [...processResults, ...historyResults].filter(
      (r) => !copilotIds.has(r.agentKind + ":" + r.workingDirectory),
    );
    results = mergeTmuxResults([...copilotSessions, ...filtered], tmuxResults);
  } else {
    const resolvedPath = dirPath.startsWith("~")
      ? dirPath.replace("~", process.env.HOME ?? "/root")
      : dirPath;

    const historyResults = scanLocalHistory(resolvedPath);
    const processResults = scanLocalProcesses(resolvedPath);
    const tmuxResults = scanLocalTmux(resolvedPath);
    const copilotSessions = scanCopilotSessionsLocal(resolvedPath);
    const copilotIds = new Set(
      copilotSessions.map((s) => s.agentKind + ":" + s.workingDirectory),
    );
    const filtered = [...processResults, ...historyResults].filter(
      (r) => !copilotIds.has(r.agentKind + ":" + r.workingDirectory),
    );
    results = mergeTmuxResults([...copilotSessions, ...filtered], tmuxResults);
  }

  // Deduplicate: sessions with sessionId are unique; others dedup by kind+cwd+status
  const seen = new Set<string>();
  const deduped = results.filter((r) => {
    const key = r.sessionId
      ? `session:${r.sessionId}`
      : `${r.agentKind}:${r.workingDirectory}:${r.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    results: deduped,
    scannedPath: dirPath,
    hostId: hostId ?? "local",
  };
}
