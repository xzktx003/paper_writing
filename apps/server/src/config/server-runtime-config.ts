export type ServerRuntimeConfig = {
  host: string;
  port: number;
  terminalScrollbackBytes: number;
  terminalTmuxCaptureLines: number;
  terminalRegistryOutputEntries: number;
};

export type TerminalHistoryRuntimeConfig = Pick<
  ServerRuntimeConfig,
  | "terminalScrollbackBytes"
  | "terminalTmuxCaptureLines"
  | "terminalRegistryOutputEntries"
>;

export const DEFAULT_TERMINAL_SCROLLBACK_BYTES = 4 * 1024 * 1024;
export const DEFAULT_TERMINAL_TMUX_CAPTURE_LINES = 5000;
export const DEFAULT_TERMINAL_REGISTRY_OUTPUT_ENTRIES = 1000;

function parsePort(value: string | undefined): number {
  const normalized = value?.trim();
  if (!normalized) {
    return 3200;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(
      "SERVER_PORT must be a positive integer between 1 and 65535",
    );
  }

  return parsed;
}

function parsePositiveInteger(
  envName: string,
  value: string | undefined,
  defaultValue: number,
): number {
  const normalized = value?.trim();
  if (!normalized) {
    return defaultValue;
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${envName} must be a positive integer`);
  }

  return parsed;
}

function resolvePortValue(env: NodeJS.ProcessEnv): string | undefined {
  const explicitServerPort = env.SERVER_PORT?.trim();
  if (explicitServerPort) {
    return explicitServerPort;
  }

  return env.PORT?.trim();
}

export function resolveTerminalHistoryRuntimeConfig(
  env: NodeJS.ProcessEnv,
): TerminalHistoryRuntimeConfig {
  return {
    terminalRegistryOutputEntries: parsePositiveInteger(
      "TERMINAL_REGISTRY_OUTPUT_ENTRIES",
      env.TERMINAL_REGISTRY_OUTPUT_ENTRIES,
      DEFAULT_TERMINAL_REGISTRY_OUTPUT_ENTRIES,
    ),
    terminalScrollbackBytes: parsePositiveInteger(
      "TERMINAL_SCROLLBACK_BYTES",
      env.TERMINAL_SCROLLBACK_BYTES,
      DEFAULT_TERMINAL_SCROLLBACK_BYTES,
    ),
    terminalTmuxCaptureLines: parsePositiveInteger(
      "TERMINAL_TMUX_CAPTURE_LINES",
      env.TERMINAL_TMUX_CAPTURE_LINES,
      DEFAULT_TERMINAL_TMUX_CAPTURE_LINES,
    ),
  };
}

export function resolveServerRuntimeConfig(
  env: NodeJS.ProcessEnv,
): ServerRuntimeConfig {
  return {
    host: env.HOST?.trim() || "0.0.0.0",
    port: parsePort(resolvePortValue(env)),
    ...resolveTerminalHistoryRuntimeConfig(env),
  };
}
