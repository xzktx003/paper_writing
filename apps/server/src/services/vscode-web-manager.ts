import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, networkInterfaces, userInfo } from "node:os";
import { join } from "node:path";
import net from "node:net";

import type {
  AgentSessionRecord,
  OpenVsCodeWebResponse,
  VsCodeWebProvider,
} from "@agent-orchestrator/shared";

import {
  quoteForPosixShell,
  resolvePreferredShell,
  resolveShellStartupEnv,
} from "./runtime-compat.js";

const DEFAULT_VSCODE_WEB_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_VSCODE_WEB_PROXY_PATH = "/vscode/";

export class UnsupportedVsCodeWebSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedVsCodeWebSessionError";
  }
}

export class VsCodeWebUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VsCodeWebUnavailableError";
  }
}

interface RunningGlobalServer {
  ownedByManager: boolean;
  processHandle: {
    killed: boolean;
    kill: (signal?: NodeJS.Signals) => boolean;
    pid?: number;
  };
  exited: boolean;
  idleTimer: NodeJS.Timeout | null;
  lastUsedAt: number;
  port: number;
  provider: VsCodeWebProvider;
  readyPromise: Promise<void>;
}

interface DetectedRunningServer {
  kill?: (signal?: NodeJS.Signals) => boolean;
  pid?: number;
  port: number;
  provider: VsCodeWebProvider;
}

interface FindRunningServerOptions {
  dataRootPaths: DataRootPaths;
  preferredPort: number | null;
  providerCommand: {
    command: string;
    provider: VsCodeWebProvider;
  };
}

interface UserProcessEntry {
  pid: number;
  args: string;
}

interface VsCodeWebManagerDeps {
  allocatePort?: (preferredPort?: number) => Promise<number>;
  createDataRoot?: () => Promise<string>;
  findCommand?: (candidate: string) => Promise<string | null>;
  findRunningServer?: (
    options: FindRunningServerOptions,
  ) => Promise<DetectedRunningServer | null>;
  idleTimeoutMs?: number;
  installCodeServer?: () => Promise<void>;
  listUserProcesses?: () => Promise<UserProcessEntry[]>;
  now?: () => number;
  removePath?: (path: string) => Promise<void>;
  resolveLaunchEnv?: () => Promise<NodeJS.ProcessEnv>;
  resolveExtensionsDir?: (root: string) => string;
  resolvePreferredPort?: (dataRoot: string) => Promise<number | null>;
  spawnProcess?: (
    command: string,
    args: string[],
    options: {
      cwd: string;
      env: NodeJS.ProcessEnv;
      stdio: "ignore";
    },
  ) => ChildProcess;
  waitForUrlReady?: (url: string) => Promise<void>;
  writeFile?: (path: string, content: string) => Promise<void>;
}

interface EnsureVsCodeWebSessionOptions {
  requestHost?: string;
  requestProtocol?: "http" | "https";
}

interface DataRootPaths {
  configFile: string;
  extensionsDir: string;
  portFile: string;
  root: string;
  userDataDir: string;
  userSettingsFile: string;
  workspacesDir: string;
}

function resolveHomePath(input?: string): string | null {
  const trimmed = input?.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed === "~" || trimmed === "~/") {
    return homedir();
  }

  if (trimmed.startsWith("~/")) {
    return join(homedir(), trimmed.slice(2));
  }

  return trimmed;
}

function resolveLocalWorkingDirectory(input?: string): string {
  return resolveHomePath(input) ?? homedir();
}

let defaultLaunchEnvPromise: Promise<NodeJS.ProcessEnv> | null = null;

function stripNpmConfigEnv(
  env: NodeJS.ProcessEnv,
): Record<string, string | undefined> {
  const nextEnv = { ...(env as Record<string, string | undefined>) };

  for (const key of Object.keys(nextEnv)) {
    if (/^npm_config_/i.test(key)) {
      delete nextEnv[key];
    }
  }

  return nextEnv;
}

async function defaultResolveLaunchEnv(): Promise<NodeJS.ProcessEnv> {
  if (!defaultLaunchEnvPromise) {
    const baseEnv = stripNpmConfigEnv(process.env);

    defaultLaunchEnvPromise = resolveShellStartupEnv(baseEnv)
      .then((shellEnv) => stripNpmConfigEnv({ ...baseEnv, ...shellEnv }))
      .catch((error) => {
        defaultLaunchEnvPromise = null;
        throw error;
      });
  }

  return defaultLaunchEnvPromise;
}

function buildVsCodeWebEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const nextEnv: NodeJS.ProcessEnv = {
    ...stripNpmConfigEnv(baseEnv),
    BROWSER: "none",
  };
  delete nextEnv.HOST;
  delete nextEnv.PORT;
  delete nextEnv.PASSWORD;
  delete nextEnv.HASHED_PASSWORD;
  delete nextEnv.VSCODE_IPC_HOOK_CLI;
  return nextEnv;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildUserTerminalArgs(shellPath: string): string[] {
  const shellName = shellPath.split("/").pop()?.toLowerCase() ?? "";
  if (shellName === "fish") {
    return ["-i"];
  }

  if (shellName === "nu" || shellName === "nushell") {
    return [];
  }

  return ["-i"];
}

function buildUserSettingsContent(shellPath: string): string {
  const profileName = "coding-kanban-user-shell";

  return `${JSON.stringify(
    {
      "terminal.integrated.defaultProfile.linux": profileName,
      "terminal.integrated.inheritEnv": true,
      "terminal.integrated.profiles.linux": {
        [profileName]: {
          path: shellPath,
          args: buildUserTerminalArgs(shellPath),
        },
      },
    },
    null,
    2,
  )}\n`;
}

function mergeUserSettingsContent(
  existingContent: string | null,
  shellPath: string,
): string {
  const profileName = "coding-kanban-user-shell";
  let existingSettings: Record<string, unknown> = {};

  if (existingContent) {
    const parsed = JSON.parse(existingContent);
    if (isRecord(parsed)) {
      existingSettings = parsed;
    }
  }

  const existingProfiles = isRecord(
    existingSettings["terminal.integrated.profiles.linux"],
  )
    ? (existingSettings["terminal.integrated.profiles.linux"] as Record<
        string,
        unknown
      >)
    : {};

  return `${JSON.stringify(
    {
      ...existingSettings,
      "terminal.integrated.defaultProfile.linux": profileName,
      "terminal.integrated.inheritEnv": true,
      "terminal.integrated.profiles.linux": {
        ...existingProfiles,
        [profileName]: {
          path: shellPath,
          args: buildUserTerminalArgs(shellPath),
        },
      },
    },
    null,
    2,
  )}\n`;
}

function defaultResolveExtensionsDir(root: string): string {
  const configuredExtensionsDir = resolveHomePath(
    process.env.VSCODE_WEB_EXTENSIONS_DIR,
  );
  if (configuredExtensionsDir) {
    return configuredExtensionsDir;
  }

  const sharedExtensionsDir = join(homedir(), ".vscode-server", "extensions");
  if (existsSync(sharedExtensionsDir)) {
    return sharedExtensionsDir;
  }

  return join(root, "extensions");
}

function buildEditorUrl(
  baseUrl: string,
  workspacePath: string,
  workingDirectory: string,
): string {
  const url = new URL(baseUrl);
  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  url.searchParams.set("workspace", workspacePath);
  url.searchParams.set("folder", workingDirectory);
  return url.toString();
}

function buildStableWorkspaceFileName(
  sessionId: string,
  workingDirectory: string,
): string {
  const normalized = workingDirectory.trim() || homedir();
  const digest = createHash("sha256")
    .update(`${sessionId}\0${normalized}`)
    .digest("hex")
    .slice(0, 16);
  const basename =
    normalized
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "workspace";

  return `${basename}-${digest}.code-workspace`;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function resolveNonLoopbackIpv4(): string | null {
  const networks = networkInterfaces();
  for (const addresses of Object.values(networks)) {
    for (const entry of addresses ?? []) {
      if (entry.family !== "IPv4" || entry.internal) {
        continue;
      }

      return entry.address;
    }
  }

  return null;
}

function resolvePublicHost(requestHost?: string): string {
  const explicitHost = process.env.VSCODE_WEB_PUBLIC_HOST?.trim();
  if (explicitHost) {
    return explicitHost;
  }

  const normalizedRequestHost = requestHost?.trim();
  if (normalizedRequestHost && !isLoopbackHost(normalizedRequestHost)) {
    return normalizedRequestHost;
  }

  return resolveNonLoopbackIpv4() ?? "127.0.0.1";
}

function tryListenOnPort(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => {
      resolve(null);
    });
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => resolve(null));
        return;
      }

      const allocated = address.port;
      server.close((error) => {
        if (error) {
          resolve(null);
          return;
        }

        resolve(allocated);
      });
    });
  });
}

async function defaultAllocatePort(preferredPort?: number): Promise<number> {
  if (typeof preferredPort === "number" && preferredPort > 0) {
    const reused = await tryListenOnPort(preferredPort);
    if (reused !== null) {
      return reused;
    }
  }

  const allocated = await tryListenOnPort(0);
  if (allocated === null) {
    throw new Error("Failed to allocate editor port");
  }
  return allocated;
}

async function defaultResolvePreferredPort(
  dataRoot: string,
): Promise<number | null> {
  const portFile = join(dataRoot, "port.json");
  if (!existsSync(portFile)) {
    return null;
  }
  try {
    const content = await readFile(portFile, "utf8");
    const parsed = JSON.parse(content);
    const port = (parsed as { port?: unknown }).port;
    if (typeof port === "number" && Number.isInteger(port) && port > 0) {
      return port;
    }
  } catch {
    // ignore corrupted port files; we will reallocate.
  }
  return null;
}

async function defaultCreateDataRoot(): Promise<string> {
  return join(homedir(), ".local", "share", "coding-kanban", "vscode-web");
}

async function defaultFindCommand(candidate: string): Promise<string | null> {
  const localCandidates = [
    join(homedir(), ".local", "bin", candidate),
    join(homedir(), ".local", "lib", candidate, "bin", candidate),
  ];

  if (candidate === "code-server") {
    const localLibDir = join(homedir(), ".local", "lib");
    if (existsSync(localLibDir)) {
      for (const entry of readdirSync(localLibDir)) {
        if (!entry.startsWith("code-server-")) {
          continue;
        }

        localCandidates.push(join(localLibDir, entry, "bin", "code-server"));
      }
    }
  }

  for (const pathValue of localCandidates) {
    if (existsSync(pathValue)) {
      return pathValue;
    }
  }

  const launchEnv = await defaultResolveLaunchEnv();
  const shellPath = resolvePreferredShell(launchEnv);

  return new Promise((resolve) => {
    execFile(
      shellPath,
      ["-lc", `command -v ${quoteForPosixShell(candidate)}`],
      { env: launchEnv },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }

        const trimmed = stdout.trim();
        resolve(trimmed || null);
      },
    );
  });
}

async function defaultInstallCodeServer(): Promise<void> {
  const localBinary = join(homedir(), ".local", "bin", "code-server");
  if (existsSync(localBinary)) {
    return;
  }

  const launchEnv = await defaultResolveLaunchEnv();
  const shellPath = resolvePreferredShell(launchEnv);

  await new Promise<void>((resolve, reject) => {
    execFile(
      shellPath,
      [
        "-lc",
        "curl -fsSL https://code-server.dev/install.sh | sh -s -- --method=standalone",
      ],
      { env: launchEnv, maxBuffer: 10 * 1024 * 1024 },
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });
}

async function defaultRemovePath(pathValue: string): Promise<void> {
  await rm(pathValue, { recursive: true, force: true });
}

function defaultSpawnProcess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    stdio: "ignore";
  },
): ChildProcess {
  return spawn(command, args, options);
}

async function defaultListUserProcesses(): Promise<UserProcessEntry[]> {
  const username = userInfo().username;

  const stdout = await new Promise<string>((resolve) => {
    execFile(
      "ps",
      ["-u", username, "-o", "pid=,args="],
      (error, nextStdout) => {
        if (error) {
          resolve("");
          return;
        }

        resolve(nextStdout);
      },
    );
  });

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (!match) {
        return null;
      }

      return {
        pid: Number.parseInt(match[1] ?? "", 10),
        args: match[2] ?? "",
      } satisfies UserProcessEntry;
    })
    .filter((entry): entry is UserProcessEntry => entry !== null);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesCommandPath(args: string, command: string): boolean {
  const basename = command.split("/").filter(Boolean).at(-1) ?? command;
  return (
    args.includes(command) ||
    new RegExp(`(^|\\s|/)${escapeRegExp(basename)}(?=\\s|$)`).test(args)
  );
}

function hasFlagValue(args: string, flag: string, value: string): boolean {
  return new RegExp(
    `(?:^|\\s)${escapeRegExp(flag)}(?:\\s+|=)${escapeRegExp(value)}(?=\\s|$)`,
  ).test(args);
}

function extractRunningServerPort(
  provider: VsCodeWebProvider,
  args: string,
): number | null {
  const match =
    provider === "code-server"
      ? args.match(
          /(?:^|\s)--bind-addr(?:\s+|=)(?:\[[^\]]+\]|[^:\s]+):(\d+)(?=\s|$)/,
        )
      : args.match(/(?:^|\s)--port(?:\s+|=)(\d+)(?=\s|$)/);

  if (!match) {
    return null;
  }

  const port = Number.parseInt(match[1] ?? "", 10);
  return Number.isInteger(port) && port > 0 ? port : null;
}

async function defaultFindRunningServer(
  options: FindRunningServerOptions,
  listUserProcesses: () => Promise<UserProcessEntry[]>,
): Promise<DetectedRunningServer | null> {
  const { dataRootPaths, preferredPort, providerCommand } = options;
  const candidates: DetectedRunningServer[] = [];

  for (const processEntry of await listUserProcesses()) {
    const args = processEntry.args;
    if (!includesCommandPath(args, providerCommand.command)) {
      continue;
    }

    if (!hasFlagValue(args, "--user-data-dir", dataRootPaths.userDataDir)) {
      continue;
    }

    const port = extractRunningServerPort(providerCommand.provider, args);
    if (port === null) {
      continue;
    }

    candidates.push({
      pid: processEntry.pid,
      port,
      provider: providerCommand.provider,
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  return (
    candidates.find((entry) => entry.port === preferredPort) ?? candidates[0]
  );
}

function buildLocalOrigin(port: number): string {
  return `http://127.0.0.1:${port}`;
}

function createDetectedProcessHandle(server: DetectedRunningServer): {
  killed: boolean;
  kill: (signal?: NodeJS.Signals) => boolean;
  pid?: number;
} {
  const killProcess =
    server.kill ??
    ((signal: NodeJS.Signals = "SIGTERM") => {
      if (typeof server.pid !== "number") {
        return false;
      }

      try {
        process.kill(server.pid, signal);
        return true;
      } catch {
        return false;
      }
    });

  const handle = {
    killed: false,
    pid: server.pid,
    kill(signal?: NodeJS.Signals) {
      handle.killed = true;
      return killProcess(signal);
    },
  };

  return handle;
}

async function defaultWaitForUrlReady(url: string): Promise<void> {
  const startedAt = Date.now();
  const timeoutMs = 15_000;
  const waitStepMs = 250;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
      });
      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch {
      // Retry until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, waitStepMs));
  }

  throw new Error(`Timed out waiting for VS Code Web at ${url}`);
}

async function defaultWriteFile(pathValue: string, content: string) {
  await writeFile(pathValue, content, "utf8");
}

async function resolveProviderCommand(
  findCommand: (candidate: string) => Promise<string | null>,
): Promise<{ command: string; provider: VsCodeWebProvider } | null> {
  const candidates: Array<{
    candidate: string;
    provider: VsCodeWebProvider;
  }> = [
    { candidate: "code-server", provider: "code-server" },
    { candidate: "openvscode-server", provider: "openvscode-server" },
  ];

  for (const entry of candidates) {
    const command = await findCommand(entry.candidate);
    if (command) {
      return {
        command,
        provider: entry.provider,
      };
    }
  }

  return null;
}

function buildLaunchArgs(
  provider: VsCodeWebProvider,
  bindHost: string,
  port: number,
  configFile: string,
  userDataDir: string,
  extensionsDir: string,
): string[] {
  if (provider === "code-server") {
    return [
      "--auth",
      "none",
      "--bind-addr",
      `${bindHost}:${port}`,
      "--disable-update-check",
      "--config",
      configFile,
      "--user-data-dir",
      userDataDir,
      "--extensions-dir",
      extensionsDir,
    ];
  }

  return [
    "--host",
    bindHost,
    "--port",
    String(port),
    "--without-connection-token",
    "--user-data-dir",
    userDataDir,
    "--extensions-dir",
    extensionsDir,
  ];
}

function buildWorkspaceContent(
  session: AgentSessionRecord,
  workingDirectory: string,
): string {
  return JSON.stringify(
    {
      folders: [{ path: workingDirectory }],
      settings: {
        "window.title": session.displayName,
      },
    },
    null,
    2,
  );
}

export class VsCodeWebManager {
  private readonly allocatePort: (preferredPort?: number) => Promise<number>;
  private readonly createDataRoot: () => Promise<string>;
  private readonly findCommand: (candidate: string) => Promise<string | null>;
  private readonly findRunningServer: (
    options: FindRunningServerOptions,
  ) => Promise<DetectedRunningServer | null>;
  private readonly idleTimeoutMs: number;
  private readonly installCodeServer: () => Promise<void>;
  private readonly listUserProcesses: () => Promise<UserProcessEntry[]>;
  private readonly now: () => number;
  private readonly removePath: (path: string) => Promise<void>;
  private readonly resolveLaunchEnv: () => Promise<NodeJS.ProcessEnv>;
  private readonly resolveExtensionsDir: (root: string) => string;
  private readonly resolvePreferredPort: (
    dataRoot: string,
  ) => Promise<number | null>;
  private readonly spawnProcess: (
    command: string,
    args: string[],
    options: {
      cwd: string;
      env: NodeJS.ProcessEnv;
      stdio: "ignore";
    },
  ) => ChildProcess;
  private readonly waitForUrlReady: (url: string) => Promise<void>;
  private readonly writeFile: (path: string, content: string) => Promise<void>;
  private dataRootPathsPromise: Promise<DataRootPaths> | null = null;
  private globalServer: RunningGlobalServer | null = null;
  private installPromise: Promise<void> | null = null;
  private launchEnvPromise: Promise<NodeJS.ProcessEnv> | null = null;
  private readonly workspaceContents = new Map<string, string>();
  private readonly sessionWorkspacePaths = new Map<string, string>();

  constructor(deps: VsCodeWebManagerDeps = {}) {
    this.allocatePort = deps.allocatePort ?? defaultAllocatePort;
    this.createDataRoot = deps.createDataRoot ?? defaultCreateDataRoot;
    this.findCommand = deps.findCommand ?? defaultFindCommand;
    this.listUserProcesses = deps.listUserProcesses ?? defaultListUserProcesses;
    this.findRunningServer =
      deps.findRunningServer ??
      ((options) => defaultFindRunningServer(options, this.listUserProcesses));
    this.idleTimeoutMs =
      deps.idleTimeoutMs ?? DEFAULT_VSCODE_WEB_IDLE_TIMEOUT_MS;
    this.installCodeServer = deps.installCodeServer ?? defaultInstallCodeServer;
    this.now = deps.now ?? (() => Date.now());
    this.removePath = deps.removePath ?? defaultRemovePath;
    this.resolveLaunchEnv = deps.resolveLaunchEnv ?? defaultResolveLaunchEnv;
    this.resolveExtensionsDir =
      deps.resolveExtensionsDir ?? defaultResolveExtensionsDir;
    this.resolvePreferredPort =
      deps.resolvePreferredPort ?? defaultResolvePreferredPort;
    this.spawnProcess = deps.spawnProcess ?? defaultSpawnProcess;
    this.waitForUrlReady = deps.waitForUrlReady ?? defaultWaitForUrlReady;
    this.writeFile = deps.writeFile ?? defaultWriteFile;
  }

  private async ensureDataRootPaths(): Promise<DataRootPaths> {
    if (!this.dataRootPathsPromise) {
      this.dataRootPathsPromise = this.createDataRoot().then(async (root) => {
        const extensionsDir = this.resolveExtensionsDir(root);
        const paths = {
          root,
          configFile: join(root, "config.yaml"),
          portFile: join(root, "port.json"),
          userDataDir: join(root, "user-data"),
          userSettingsFile: join(root, "user-data", "User", "settings.json"),
          extensionsDir,
          workspacesDir: join(root, "workspaces"),
        };

        await mkdir(root, { recursive: true });
        await mkdir(paths.userDataDir, { recursive: true });
        await mkdir(join(paths.userDataDir, "User"), { recursive: true });
        await mkdir(paths.extensionsDir, { recursive: true });
        await mkdir(paths.workspacesDir, { recursive: true });
        if (!existsSync(paths.configFile)) {
          await this.writeFile(
            paths.configFile,
            [
              "auth: none",
              `bind-addr: 0.0.0.0:0`,
              "disable-update-check: true",
              "",
            ].join("\n"),
          );
        }

        const launchEnv = await this.ensureLaunchEnv();
        const shellPath = resolvePreferredShell(launchEnv);
        const settingsContent = buildUserSettingsContent(shellPath);
        const existingSettingsContent = existsSync(paths.userSettingsFile)
          ? await readFile(paths.userSettingsFile, "utf8")
          : null;
        const nextSettingsContent =
          existingSettingsContent === null
            ? settingsContent
            : mergeUserSettingsContent(existingSettingsContent, shellPath);
        if (existingSettingsContent !== nextSettingsContent) {
          await this.writeFile(paths.userSettingsFile, nextSettingsContent);
        }

        return paths;
      });
    }

    return this.dataRootPathsPromise;
  }

  private async ensureLaunchEnv(): Promise<NodeJS.ProcessEnv> {
    if (!this.launchEnvPromise) {
      this.launchEnvPromise = this.resolveLaunchEnv().catch((error) => {
        this.launchEnvPromise = null;
        throw error;
      });
    }

    return this.launchEnvPromise;
  }

  private async ensureProviderCommand(): Promise<{
    command: string;
    provider: VsCodeWebProvider;
  } | null> {
    const existing = await resolveProviderCommand(this.findCommand);
    if (existing) {
      return existing;
    }

    if (!this.installPromise) {
      this.installPromise = this.installCodeServer().finally(() => {
        this.installPromise = null;
      });
    }

    try {
      await this.installPromise;
    } catch {
      return null;
    }

    return resolveProviderCommand(this.findCommand);
  }

  private touchGlobalServer(): void {
    if (!this.globalServer) {
      return;
    }

    this.globalServer.lastUsedAt = this.now();
    if (this.globalServer.idleTimer) {
      clearTimeout(this.globalServer.idleTimer);
    }

    this.globalServer.idleTimer = setTimeout(() => {
      if (!this.globalServer) {
        return;
      }

      if (this.now() - this.globalServer.lastUsedAt < this.idleTimeoutMs) {
        this.touchGlobalServer();
        return;
      }

      void this.stopGlobalServer();
    }, this.idleTimeoutMs);
    // unref(): the idle cleanup timer must never keep the Node event loop
    // alive on its own. The Fastify HTTP server is the only thing that should
    // prevent exit during dev/prod. In tests (node --test), leaving this
    // referenced blocks process exit after all cases pass and hangs
    // `pnpm -r test`. See memories/repo/e2e.md.
    this.globalServer.idleTimer.unref();
  }

  private async ensureGlobalServer(providerCommand: {
    command: string;
    provider: VsCodeWebProvider;
  }): Promise<{ reused: boolean; server: RunningGlobalServer }> {
    const existing = this.globalServer;
    if (existing && !existing.processHandle.killed && !existing.exited) {
      try {
        await existing.readyPromise;
        await this.waitForUrlReady(buildLocalOrigin(existing.port));
        this.touchGlobalServer();
        return {
          reused: true,
          server: existing,
        };
      } catch {
        existing.exited = true;
        if (this.globalServer === existing) {
          this.globalServer = null;
        }
      }
    }

    const dataRootPaths = await this.ensureDataRootPaths();
    const launchEnv = await this.ensureLaunchEnv();
    const preferredPort = await this.resolvePreferredPort(
      dataRootPaths.root,
    ).catch(() => null);
    const runningServer = await this.findRunningServer({
      dataRootPaths,
      preferredPort,
      providerCommand,
    });
    if (runningServer) {
      const localOrigin = buildLocalOrigin(runningServer.port);

      try {
        await this.waitForUrlReady(localOrigin);
        const server: RunningGlobalServer = {
          ownedByManager: false,
          processHandle: createDetectedProcessHandle(runningServer),
          exited: false,
          idleTimer: null,
          lastUsedAt: this.now(),
          port: runningServer.port,
          provider: runningServer.provider,
          readyPromise: Promise.resolve(),
        };

        this.globalServer = server;
        this.touchGlobalServer();
        return {
          reused: true,
          server,
        };
      } catch {
        // Fall back to spawning a fresh compatible instance.
      }
    }

    const port = await this.allocatePort(preferredPort ?? undefined);
    if (preferredPort !== port) {
      await this.writeFile(
        dataRootPaths.portFile,
        `${JSON.stringify({ port }, null, 2)}\n`,
      ).catch(() => {});
    }
    const bindHost = process.env.VSCODE_WEB_BIND_HOST?.trim() || "0.0.0.0";
    const child = this.spawnProcess(
      providerCommand.command,
      buildLaunchArgs(
        providerCommand.provider,
        bindHost,
        port,
        dataRootPaths.configFile,
        dataRootPaths.userDataDir,
        dataRootPaths.extensionsDir,
      ),
      {
        cwd: homedir(),
        env: buildVsCodeWebEnv(launchEnv),
        stdio: "ignore",
      },
    );

    const localOrigin = buildLocalOrigin(port);
    const server: RunningGlobalServer = {
      ownedByManager: true,
      processHandle: child,
      exited: false,
      idleTimer: null,
      lastUsedAt: this.now(),
      port,
      provider: providerCommand.provider,
      readyPromise: Promise.resolve(),
    };

    child.on("exit", () => {
      server.exited = true;
      if (server.idleTimer) {
        clearTimeout(server.idleTimer);
      }
      if (this.globalServer === server) {
        this.globalServer = null;
      }
    });

    const readyPromise = new Promise<void>((resolve, reject) => {
      let settled = false;

      const rejectOnce = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      };

      child.once("error", (error) => {
        rejectOnce(
          new VsCodeWebUnavailableError(
            `VS Code Web 启动失败: ${error.message}`,
          ),
        );
      });

      child.once("exit", (code, signal) => {
        rejectOnce(
          new VsCodeWebUnavailableError(
            `VS Code Web 进程过早退出 (code=${code ?? "null"}, signal=${signal ?? "null"})`,
          ),
        );
      });

      this.waitForUrlReady(localOrigin)
        .then(() => {
          if (settled) {
            return;
          }
          settled = true;
          resolve();
        })
        .catch((error) => {
          rejectOnce(
            error instanceof Error ? error : new Error("VS Code Web 未能就绪"),
          );
        });
    });

    server.readyPromise = readyPromise;
    this.globalServer = server;

    try {
      await readyPromise;
      this.touchGlobalServer();
      return {
        reused: false,
        server,
      };
    } catch (error) {
      await this.stopGlobalServer();
      throw error;
    }
  }

  private async ensureWorkspaceFile(
    session: AgentSessionRecord,
  ): Promise<{ path: string; workingDirectory: string }> {
    const dataRootPaths = await this.ensureDataRootPaths();
    const workingDirectory = resolveLocalWorkingDirectory(
      session.workingDirectory,
    );
    const workspacePath = join(
      dataRootPaths.workspacesDir,
      buildStableWorkspaceFileName(session.id, workingDirectory),
    );
    const workspaceContent = buildWorkspaceContent(session, workingDirectory);

    if (this.workspaceContents.get(workspacePath) !== workspaceContent) {
      await this.writeFile(workspacePath, workspaceContent);
      this.workspaceContents.set(workspacePath, workspaceContent);
    }
    this.sessionWorkspacePaths.set(session.id, workspacePath);

    return {
      path: workspacePath,
      workingDirectory,
    };
  }

  async ensureSession(
    session: AgentSessionRecord,
    options: EnsureVsCodeWebSessionOptions = {},
  ): Promise<OpenVsCodeWebResponse> {
    if (session.sshTarget) {
      throw new UnsupportedVsCodeWebSessionError(
        "VS Code Web 第一版仅支持本地终端会话",
      );
    }

    const publicProtocol = options.requestProtocol ?? "http";
    const publicHost = resolvePublicHost(options.requestHost);
    const workspace = await this.ensureWorkspaceFile(session);
    const providerCommand = await this.ensureProviderCommand();

    if (!providerCommand) {
      throw new VsCodeWebUnavailableError(
        "未检测到可用的 VS Code Web 运行时，且自动安装 code-server 失败。",
      );
    }

    const { reused, server } = await this.ensureGlobalServer(providerCommand);
    return {
      provider: server.provider,
      url: buildEditorUrl(
        `${publicProtocol}://${publicHost}${DEFAULT_VSCODE_WEB_PROXY_PATH}`,
        workspace.path,
        workspace.workingDirectory,
      ),
      reused,
      workingDirectory: workspace.workingDirectory,
    };
  }

  async stopSession(sessionId: string): Promise<void> {
    const workspacePath = this.sessionWorkspacePaths.get(sessionId);
    this.sessionWorkspacePaths.delete(sessionId);
    if (workspacePath) {
      this.workspaceContents.delete(workspacePath);
      await this.removePath(workspacePath).catch(() => {});
    }

    if (this.sessionWorkspacePaths.size === 0 && this.globalServer) {
      await this.stopGlobalServer();
    }
  }

  private async stopGlobalServer(): Promise<void> {
    const server = this.globalServer;
    if (!server) {
      return;
    }

    this.globalServer = null;
    if (server.idleTimer) {
      clearTimeout(server.idleTimer);
    }
    if (server.ownedByManager && !server.processHandle.killed) {
      server.processHandle.kill("SIGTERM");
    }
  }

  async dispose(): Promise<void> {
    await this.stopGlobalServer();
  }

  getProxyTargetUrl(): string | null {
    if (
      !this.globalServer ||
      this.globalServer.exited ||
      this.globalServer.processHandle.killed
    ) {
      return null;
    }

    return buildLocalOrigin(this.globalServer.port);
  }
}
