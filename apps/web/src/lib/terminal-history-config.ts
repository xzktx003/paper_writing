export const DEFAULT_TERMINAL_SCROLLBACK_LINES = 20_000;

export function parseTerminalScrollbackLines(
  value: string | undefined,
  defaultValue = DEFAULT_TERMINAL_SCROLLBACK_LINES,
): number {
  const normalized = value?.trim();
  if (!normalized) {
    return defaultValue;
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return defaultValue;
  }

  return parsed;
}

const viteEnv = import.meta.env ?? {};

export const TERMINAL_SCROLLBACK_LINES = parseTerminalScrollbackLines(
  viteEnv.VITE_TERMINAL_SCROLLBACK_LINES,
);
